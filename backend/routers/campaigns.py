from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os, json, html as _html
import urllib.request

from database import get_db
from models import Tenant, User, Lead, Campaign
from deps import require_super_admin

router = APIRouter(tags=["campaigns"])

BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def _public_base() -> str:
    return os.getenv("PUBLIC_API_URL", "https://crm-saas-backend-lkg4.onrender.com").rstrip("/")


def _recipients_query(db: Session, tenant_id: str, status: Optional[str], source: Optional[str]):
    q = db.query(Lead).filter(
        Lead.tenant_id == tenant_id,
        Lead.email.isnot(None),
        Lead.email != "",
        Lead.unsubscribed.isnot(True),   # covers False + NULL (old rows)
    )
    if status:
        q = q.filter(Lead.status == status)
    if source:
        q = q.filter(Lead.source == source)
    return q


# ---------------- schemas ----------------
class SendCampaign(BaseModel):
    tenant_id: str
    subject:   str
    body:      str
    status:    Optional[str] = None
    source:    Optional[str] = None


# ---------------- preview recipient count ----------------
@router.get("/admin/campaigns/recipients")
def preview_recipients(tenant_id: str,
                       status: Optional[str] = Query(None),
                       source: Optional[str] = Query(None),
                       admin: User = Depends(require_super_admin),
                       db: Session = Depends(get_db)):
    cnt = _recipients_query(db, tenant_id, status or None, source or None).count()
    return {"count": cnt}


# ---------------- list past campaigns ----------------
@router.get("/admin/campaigns")
def list_campaigns(tenant_id: str,
                   admin: User = Depends(require_super_admin),
                   db: Session = Depends(get_db)):
    rows = (db.query(Campaign)
            .filter(Campaign.tenant_id == tenant_id)
            .order_by(Campaign.created_at.desc())
            .limit(50).all())
    return [{
        "id": c.id, "subject": c.subject, "recipients": c.recipients,
        "sent_count": c.sent_count, "failed_count": c.failed_count,
        "status": c.status, "created_at": c.created_at,
    } for c in rows]


# ---------------- send campaign ----------------
@router.post("/admin/campaigns/send")
def send_campaign(data: SendCampaign, bg: BackgroundTasks,
                  admin: User = Depends(require_super_admin),
                  db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.id == data.tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")
    if not data.subject.strip() or not data.body.strip():
        raise HTTPException(status_code=400, detail="Subject and message are required")

    api_key      = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    sender_name  = os.getenv("BREVO_SENDER_NAME", "Brandbanalo")
    if not api_key or not sender_email:
        raise HTTPException(status_code=400,
            detail="Email not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in Render environment.")

    recips = _recipients_query(db, data.tenant_id, data.status or None, data.source or None).all()
    if not recips:
        raise HTTPException(status_code=400,
            detail="No recipients found (leads with an email address that haven't unsubscribed).")

    # reply-to = client's login email (so replies reach the client)
    login = (db.query(User)
             .filter(User.tenant_id == data.tenant_id, User.role == "tenant_admin")
             .order_by(User.created_at).first())
    reply_to = login.email if login else None

    camp = Campaign(tenant_id=data.tenant_id, subject=data.subject.strip(),
                    body=data.body, recipients=len(recips),
                    sent_count=0, failed_count=0, status="sending",
                    created_by=getattr(admin, "email", None))
    db.add(camp); db.commit(); db.refresh(camp)

    payload = [{"id": l.id, "email": l.email, "name": l.name or ""} for l in recips]
    bg.add_task(_run_send, camp.id, api_key, sender_email, sender_name,
                reply_to, data.subject.strip(), data.body, payload)

    return {"campaign_id": camp.id, "recipients": len(recips), "status": "sending"}


# ---------------- public unsubscribe ----------------
@router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(l: str = Query(...), db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == l).first()
    if lead:
        try:
            lead.unsubscribed = True
            db.commit()
        except Exception:
            db.rollback()
    return HTMLResponse(
        "<html><body style='font-family:Arial,sans-serif;text-align:center;padding:60px;color:#333'>"
        "<h2>Unsubscribed ✅</h2>"
        "<p>Aapko ab marketing emails nahi bheje jayenge.</p>"
        "</body></html>"
    )


# ---------------- sending internals ----------------
def _build_html(body: str, lead_id: str) -> str:
    safe = _html.escape(body).replace("\n", "<br>")
    base = _public_base()
    footer = (
        '<hr style="margin-top:24px;border:none;border-top:1px solid #eee">'
        '<p style="font-size:12px;color:#999">'
        'Agar aap yeh emails nahi chahte to '
        f'<a href="{base}/unsubscribe?l={lead_id}" style="color:#999">unsubscribe</a> karein.</p>'
    )
    return (f'<div style="font-family:Arial,sans-serif;font-size:15px;'
            f'color:#222;line-height:1.55">{safe}{footer}</div>')


def _send_one(api_key, sender_email, sender_name, reply_to, subject, body, lead) -> bool:
    name = (lead.get("name") or "").strip() or "there"
    personalized = body.replace("{{name}}", name)
    msg = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": lead["email"], "name": lead.get("name") or ""}],
        "subject": subject,
        "htmlContent": _build_html(personalized, lead["id"]),
    }
    if reply_to:
        msg["replyTo"] = {"email": reply_to}
    raw = json.dumps(msg).encode("utf-8")
    req = urllib.request.Request(BREVO_URL, data=raw, method="POST")
    req.add_header("api-key", api_key)
    req.add_header("content-type", "application/json")
    req.add_header("accept", "application/json")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return 200 <= resp.status < 300


def _run_send(campaign_id, api_key, sender_email, sender_name, reply_to, subject, body, recipients):
    db_gen = get_db()
    db = next(db_gen)
    sent = 0
    failed = 0
    try:
        for lead in recipients:
            try:
                if _send_one(api_key, sender_email, sender_name, reply_to, subject, body, lead):
                    sent += 1
                else:
                    failed += 1
            except Exception:
                failed += 1
        camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if camp:
            camp.sent_count = sent
            camp.failed_count = failed
            camp.status = "sent"
            db.commit()
    finally:
        db_gen.close()