from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, case
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from database import get_db
from models import Lead, normalize_phone
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
    tenant_id: str               = Depends(get_current_tenant),
    db:        Session           = Depends(get_db),
    status:    Optional[str]     = Query(None),
    source:    Optional[str]     = Query(None),
    search:    Optional[str]     = Query(None),
    campaign:  Optional[str]     = Query(None),
    days:      Optional[int]     = Query(None, ge=1, le=365),
    limit:     int               = Query(100, ge=1, le=500),
    offset:    int               = Query(0,  ge=0),
):
    q = db.query(Lead).filter(Lead.tenant_id == tenant_id)

    if status:   q = q.filter(Lead.status == status)
    if source:   q = q.filter(Lead.source == source)
    if campaign: q = q.filter(Lead.utm_campaign == campaign)
    if days:     q = q.filter(Lead.created_at >= datetime.utcnow() - timedelta(days=days))
    if search:
        like = f"%{search}%"
        q = q.filter(or_(Lead.name.ilike(like), Lead.phone.ilike(like), Lead.email.ilike(like)))

    total = q.count()
    leads = q.order_by(Lead.created_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": leads}


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
        source=data.source or "manual",
        notes=data.notes,
        status="new"
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/stats/sources")
def source_breakdown(
    tenant_id: str           = Depends(get_current_tenant),
    db:        Session       = Depends(get_db),
    days:      int           = Query(30, ge=1, le=365),
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(Lead.source, func.count(Lead.id))
          .filter(Lead.tenant_id == tenant_id, Lead.created_at >= cutoff)
          .group_by(Lead.source)
          .order_by(func.count(Lead.id).desc())
          .all()
    )
    return [{"source": s or "unknown", "count": c} for s, c in rows]


@router.get("/stats/campaigns")
def campaign_breakdown(
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db),
    days:      int     = Query(30, ge=1, le=365),
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            Lead.utm_campaign,
            func.count(Lead.id).label("total"),
            func.sum(case((Lead.status == "won", 1), else_=0)).label("won"),
        )
        .filter(
            Lead.tenant_id == tenant_id,
            Lead.created_at >= cutoff,
            Lead.utm_campaign.isnot(None),
        )
        .group_by(Lead.utm_campaign)
        .order_by(func.count(Lead.id).desc())
        .all()
    )
    return [
        {"campaign": c, "total": int(t or 0), "won": int(w or 0)}
        for c, t, w in rows
    ]


@router.get("/stats/daily")
def daily_counts(
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db),
    days:      int     = Query(14, ge=1, le=90),
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(func.date(Lead.created_at).label("d"), func.count(Lead.id))
          .filter(Lead.tenant_id == tenant_id, Lead.created_at >= cutoff)
          .group_by("d")
          .order_by("d")
          .all()
    )
    return [{"date": str(d), "count": c} for d, c in rows]


@router.post("/cleanup/duplicates")
def cleanup_duplicates(
    tenant_id: str     = Depends(get_current_tenant),
    db:        Session = Depends(get_db),
):
    """
    Scan all leads for this tenant. For each phone (normalized), keep the
    newest lead, delete the older duplicates. Returns count of deletions.
    """
    leads = (
        db.query(Lead)
        .filter(Lead.tenant_id == tenant_id, Lead.phone.isnot(None))
        .order_by(Lead.created_at.desc())
        .all()
    )

    seen_phones: set[str] = set()
    deleted = 0

    for lead in leads:
        normalized = normalize_phone(lead.phone)
        if not normalized:
            continue
        if normalized in seen_phones:
            # Older lead with phone already seen with newer entry - delete
            db.delete(lead)
            deleted += 1
        else:
            seen_phones.add(normalized)

    if deleted:
        db.commit()

    return {"deleted": deleted, "kept": len(seen_phones)}


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

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(lead, field, value)

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
