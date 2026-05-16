from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Lead
import uuid

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

SITE_MAP = {
    "brandbanalo": "d6dc5b44-4761-4df8-98fe-c1c23ed1effc",
    # "madantraders": "tenant-id-here",
}

VERIFY_TOKEN = "crm-meta-verify-123"

@router.post("/form")
async def receive_form(
    request: Request,
    db: Session = Depends(get_db)
):
    data = await request.json()
    site_id = data.get("site_id", "")
    tenant_id = SITE_MAP.get(site_id)
    if not tenant_id:
        return {"status": "unknown site", "site_id": site_id}
    lead = Lead(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=data.get("name"),
        phone=data.get("phone"),
        email=data.get("email"),
        source="website",
        status="new",
        notes=data.get("notes") or data.get("message")
    )
    db.add(lead)
    db.commit()
    return {"status": "received"}

@router.get("/meta")
async def verify_meta_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    if mode == "subscribe" and token == VERIFY_TOKEN:
        return int(challenge)
    raise HTTPException(status_code=403, detail="Invalid token")

@router.post("/meta")
async def receive_meta_lead(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    return {"status": "received"}