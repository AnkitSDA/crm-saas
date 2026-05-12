from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import Lead
from deps import get_current_tenant
import uuid

router = APIRouter(prefix="/leads", tags=["leads"])

class LeadCreate(BaseModel):
    name:   Optional[str] = None
    phone:  Optional[str] = None
    email:  Optional[str] = None
    source: Optional[str] = "manual"
    notes:  Optional[str] = None

class LeadUpdate(BaseModel):
    status:      Optional[str] = None
    notes:       Optional[str] = None
    assigned_to: Optional[str] = None

@router.get("/")
def get_leads(
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db)
):
    leads = db.query(Lead).filter(Lead.tenant_id == tenant_id).order_by(Lead.created_at.desc()).all()
    return leads

@router.post("/")
def create_lead(
    data:      LeadCreate,
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db)
):
    lead = Lead(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=data.name,
        phone=data.phone,
        email=data.email,
        source=data.source,
        notes=data.notes,
        status="new"
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead

@router.get("/{lead_id}")
def get_lead(
    lead_id:   str,
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db)
):
    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@router.patch("/{lead_id}")
def update_lead(
    lead_id:   str,
    data:      LeadUpdate,
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db)
):
    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if data.status:      lead.status      = data.status
    if data.notes:       lead.notes       = data.notes
    if data.assigned_to: lead.assigned_to = data.assigned_to

    db.commit()
    db.refresh(lead)
    return lead

@router.delete("/{lead_id}")
def delete_lead(
    lead_id:   str,
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db)
):
    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    db.delete(lead)
    db.commit()
    return {"message": "Lead deleted"}