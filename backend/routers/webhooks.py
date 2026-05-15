from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Lead
import uuid

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Har client ka site_id → tenant_id mapping
SITE_MAP = {
    "brandbanalo": "d6dc5b44-4761-4df8-98fe-c1c23ed1effc",
    # Naye client add karte jao yahan:
    # "madantraders": "tenant-id-here",
    # "client3":      "tenant-id-here",
}

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