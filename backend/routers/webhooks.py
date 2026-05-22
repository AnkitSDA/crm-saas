from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import Lead, Tenant
import os, uuid

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN", "crm-meta-verify-123")


class FormLeadIn(BaseModel):
    """Payload from WordPress / Contact Form 7 / landing page form."""
    api_key: str
    name:    Optional[str] = None
    phone:   Optional[str] = None
    email:   Optional[str] = None
    message: Optional[str] = None   # CF7 'your-message' field
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
    tenant = db.query(Tenant).filter(
        Tenant.api_key == api_key,
        Tenant.is_active == True,  # noqa: E712
    ).first()
    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid api_key")
    return tenant


def _infer_source(payload: FormLeadIn) -> str:
    """Decide the high-level source bucket from UTM/click-id signals."""
    if payload.gclid or (payload.utm_source and payload.utm_source.lower() == "google"):
        return "google_ads"
    if payload.fbclid or (payload.utm_source and payload.utm_source.lower() in ("facebook", "instagram", "meta")):
        return "meta_ads"
    if payload.utm_source:
        return f"utm_{payload.utm_source.lower()}"
    return "website"


@router.post("/form")
async def receive_form(payload: FormLeadIn, db: Session = Depends(get_db)):
    """
    Public endpoint for landing page forms. Authenticated by per-tenant api_key.
    The api_key is shown to the tenant admin on the Settings page.
    """
    tenant = _resolve_tenant(db, payload.api_key)

    # Truncate long URLs defensively
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
    return {"status": "received", "lead_id": lead.id}


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
    """
    Placeholder. To wire this up properly:
      1. Verify X-Hub-Signature-256 header against app secret
      2. Call Graph API GET /{leadgen_id} with page access token to fetch field_data
      3. Match page_id -> tenant_id (add a TenantFbPage table)
      4. Insert Lead with source='meta_ads'
    """
    data = await request.json()
    return {"status": "received_unhandled", "raw_keys": list(data.keys())}
