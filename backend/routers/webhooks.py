from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from database import get_db
from models import Lead, Tenant, normalize_phone
import os, uuid

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN", "crm-meta-verify-123")
DEDUPE_WINDOW_HOURS = 1  # New leads with same phone within this window auto-merge


class FormLeadIn(BaseModel):
    """Payload from WordPress / Contact Form 7 / Elementor / landing page form."""
    api_key: str
    name:    Optional[str] = None
    phone:   Optional[str] = None
    email:   Optional[str] = None
    message: Optional[str] = None
    notes:   Optional[str] = None

    # Attribution
    utm_source:   Optional[str] = None
    utm_medium:   Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_term:     Optional[str] = None
    utm_content:  Optional[str] = None
    gclid:        Optional[str] = None
    fbclid:       Optional[str] = None
    landing_page: Optional[str] = None
    referrer:     Optional[str] = None


def _resolve_tenant(db: Session, api_key: str) -> Tenant:
    if not api_key:
        raise HTTPException(status_code=401, detail="api_key required")
    tenant = db.query(Tenant).filter(Tenant.api_key == api_key).first()
    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid api_key")
    mode = getattr(tenant, "access_mode", None) or ("active" if tenant.is_active else "block_all")
    if mode in ("block_all", "block_leads"):
        raise HTTPException(status_code=403, detail="Lead intake suspended for this account")
    return tenant


def _infer_source(payload: FormLeadIn) -> str:
    if payload.gclid or (payload.utm_source and payload.utm_source.lower() == "google"):
        return "google_ads"
    if payload.fbclid or (payload.utm_source and payload.utm_source.lower() in ("facebook", "instagram", "meta")):
        return "meta_ads"
    if payload.utm_source:
        return f"utm_{payload.utm_source.lower()}"
    return "website"


def _auto_dedupe(db: Session, new_lead: Lead) -> int:
    """
    After inserting a new lead, delete any older leads for the same tenant
    with the same normalized phone within DEDUPE_WINDOW_HOURS.
    Keeps the new (just-inserted) lead. Returns count of deletions.
    """
    if not new_lead.phone:
        return 0

    normalized_new = normalize_phone(new_lead.phone)
    if not normalized_new:
        return 0

    cutoff = datetime.utcnow() - timedelta(hours=DEDUPE_WINDOW_HOURS)

    # Get candidates: other leads in the same tenant within window with non-null phone
    candidates = db.query(Lead).filter(
        Lead.tenant_id == new_lead.tenant_id,
        Lead.id != new_lead.id,
        Lead.created_at >= cutoff,
        Lead.phone.isnot(None),
    ).all()

    deleted = 0
    for old in candidates:
        if normalize_phone(old.phone) == normalized_new:
            db.delete(old)
            deleted += 1

    if deleted:
        db.commit()
    return deleted


@router.post("/form")
async def receive_form(payload: FormLeadIn, db: Session = Depends(get_db)):
    """
    Public endpoint for landing page forms. Authenticated by per-tenant api_key.
    """
    tenant = _resolve_tenant(db, payload.api_key)

    landing = (payload.landing_page or "")[:500] or None
    referrer = (payload.referrer or "")[:500] or None

    lead = Lead(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        source=_infer_source(payload),
        status="new",
        notes=payload.notes or payload.message,
        utm_source=payload.utm_source,
        utm_medium=payload.utm_medium,
        utm_campaign=payload.utm_campaign,
        utm_term=payload.utm_term,
        utm_content=payload.utm_content,
        gclid=payload.gclid,
        fbclid=payload.fbclid,
        landing_page=landing,
        referrer=referrer,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    # Auto-merge: delete older duplicates with same phone (last 1 hour)
    merged_count = _auto_dedupe(db, lead)

    return {
        "status": "received",
        "lead_id": lead.id,
        "merged_duplicates": merged_count,
    }


# ---------- Google Ads Lead Form Extensions ----------

@router.post("/google")
async def receive_google_lead(request: Request, db: Session = Depends(get_db)):
    """
    Google Ads lead form webhook.
    In Google Ads: Webhook URL = https://<backend>/webhooks/google
                   Key         = the tenant's api_key (Settings page in CRM)
    Google sends google_key in the JSON body; we resolve the tenant from it.
    Must return HTTP 200 quickly, otherwise Google shows "didn't respond correctly".
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    tenant = _resolve_tenant(db, data.get("google_key"))

    # "Send test data" button in Google Ads: acknowledge, don't save
    if data.get("is_test"):
        return {"status": "ok", "test": True}

    fields = {
        c.get("column_id"): (c.get("string_value") or "").strip()
        for c in (data.get("user_column_data") or [])
    }

    g_lead_id = str(data.get("lead_id") or "")
    tag = f"google_lead_id: {g_lead_id}"

    # Google retries on failure -> skip if this lead_id was already saved
    if g_lead_id:
        exists = db.query(Lead).filter(
            Lead.tenant_id == tenant.id,
            Lead.notes.contains(tag),
        ).first()
        if exists:
            return {"status": "duplicate", "lead_id": exists.id}

    name = fields.get("FULL_NAME") or " ".join(
        x for x in (fields.get("FIRST_NAME"), fields.get("LAST_NAME")) if x
    ) or None

    known = {"FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL", "PHONE_NUMBER"}
    extra = [f"{k}: {v}" for k, v in fields.items() if k not in known and v]
    notes = "\n".join(extra + [tag]) if g_lead_id else ("\n".join(extra) or None)

    gclid = (data.get("gcl_id") or "")[:255] or None
    campaign_id = data.get("campaign_id")

    lead = Lead(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        name=name,
        phone=fields.get("PHONE_NUMBER") or None,
        email=fields.get("EMAIL") or None,
        source="google_ads",
        status="new",
        notes=notes,
        utm_source="google",
        utm_medium="lead_form",
        utm_campaign=str(campaign_id) if campaign_id else None,
        gclid=gclid,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    merged_count = _auto_dedupe(db, lead)
    return {"status": "received", "lead_id": lead.id, "merged_duplicates": merged_count}


# ---------- Meta (Facebook) Lead Ads ----------

@router.get("/meta")
async def verify_meta_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    if mode == "subscribe" and token == META_VERIFY_TOKEN:
        return int(challenge)
    raise HTTPException(status_code=403, detail="Invalid token")


@router.post("/meta")
async def receive_meta_lead(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    return {"status": "received_unhandled", "raw_keys": list(data.keys())}
