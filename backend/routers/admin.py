from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import get_db
from models import Tenant, User, Lead, AdSpend, gen_api_key
from deps import require_super_admin
import uuid

router = APIRouter(prefix="/admin", tags=["admin"])
pwd = CryptContext(schemes=["bcrypt"])


# ---------------- schemas ----------------
class CreateClient(BaseModel):
    business_name: str
    email:         EmailStr
    password:      str
    monthly_rate:  Optional[float] = 3500


class UpdateClient(BaseModel):
    monthly_rate: Optional[float] = None
    plan:         Optional[str]   = None
    is_active:    Optional[bool]  = None


# ---------------- helpers ----------------
def _lead_stats(db: Session):
    """Aggregate per-tenant lead counts in ONE query (no N+1)."""
    rows = (
        db.query(
            Lead.tenant_id,
            func.count(Lead.id),
            func.sum(case((Lead.status == "won", 1), else_=0)),
            func.sum(case((Lead.status == "won", Lead.deal_value), else_=0)),
        )
        .group_by(Lead.tenant_id)
        .all()
    )
    return {r[0]: (int(r[1] or 0), int(r[2] or 0), float(r[3] or 0)) for r in rows}


def _spend_stats(db: Session):
    rows = (
        db.query(AdSpend.tenant_id, func.sum(AdSpend.amount))
        .group_by(AdSpend.tenant_id)
        .all()
    )
    return {r[0]: float(r[1] or 0) for r in rows}


def _rate(t: Tenant) -> float:
    return float(getattr(t, "monthly_rate", 0) or 0)


# ---------------- endpoints ----------------
@router.get("/clients")
def list_clients(admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    """All clients + aggregated stats, plus agency-level totals."""
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    ls, ss = _lead_stats(db), _spend_stats(db)

    clients = []
    tot = {"clients": 0, "leads": 0, "won": 0, "revenue": 0.0, "spend": 0.0, "mrr": 0.0}
    for t in tenants:
        leads, won, revenue = ls.get(t.id, (0, 0, 0.0))
        spend = ss.get(t.id, 0.0)
        rate = _rate(t)
        clients.append({
            "id": t.id, "name": t.name, "slug": t.slug, "plan": t.plan,
            "is_active": t.is_active, "monthly_rate": rate,
            "leads": leads, "won": won, "revenue": revenue, "spend": spend,
            "roas": (revenue / spend) if spend > 0 else None,
            "created_at": t.created_at,
        })
        tot["clients"] += 1
        tot["leads"]   += leads
        tot["won"]     += won
        tot["revenue"] += revenue
        tot["spend"]   += spend
        if t.is_active:
            tot["mrr"] += rate
    tot["roas"] = (tot["revenue"] / tot["spend"]) if tot["spend"] > 0 else None
    return {"totals": tot, "clients": clients}


@router.post("/clients")
def create_client(data: CreateClient, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    """One-click onboard: creates tenant (api_key) + client login. Returns handover details."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    slug = data.business_name.lower().replace(" ", "-") + "-" + str(uuid.uuid4())[:4]
    tenant = Tenant(
        id=str(uuid.uuid4()),
        name=data.business_name,
        slug=slug,
        api_key=gen_api_key(),
        plan="active",
    )
    # monthly_rate column added by migration 004; set if model has it
    try:
        tenant.monthly_rate = data.monthly_rate or 0
    except Exception:
        pass
    db.add(tenant)
    db.flush()

    user = User(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        email=data.email,
        password_hash=pwd.hash(data.password),
        full_name=data.business_name,
        role="tenant_admin",
    )
    db.add(user)
    db.commit()
    db.refresh(tenant)

    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "api_key": tenant.api_key,
        "login_email": data.email,
        "monthly_rate": data.monthly_rate,
    }


@router.get("/clients/{tenant_id}")
def client_detail(tenant_id: str, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")

    src_rows = (
        db.query(
            Lead.source,
            func.count(Lead.id),
            func.sum(case((Lead.status == "won", 1), else_=0)),
            func.sum(case((Lead.status == "won", Lead.deal_value), else_=0)),
        )
        .filter(Lead.tenant_id == tenant_id)
        .group_by(Lead.source)
        .all()
    )
    sources = [
        {"source": s or "unknown", "leads": int(c or 0), "won": int(w or 0), "revenue": float(rev or 0)}
        for s, c, w, rev in src_rows
    ]

    spend_rows = (
        db.query(AdSpend.source, func.sum(AdSpend.amount))
        .filter(AdSpend.tenant_id == tenant_id)
        .group_by(AdSpend.source)
        .all()
    )
    spend_by_source = {(s or "all"): float(a or 0) for s, a in spend_rows}

    recent = (
        db.query(Lead).filter(Lead.tenant_id == tenant_id)
        .order_by(Lead.created_at.desc()).limit(10).all()
    )
    recent_out = [
        {"name": l.name, "phone": l.phone, "source": l.source, "status": l.status, "created_at": l.created_at}
        for l in recent
    ]

    return {
        "id": t.id, "name": t.name, "slug": t.slug, "api_key": t.api_key,
        "plan": t.plan, "is_active": t.is_active, "monthly_rate": _rate(t),
        "sources": sources, "spend_by_source": spend_by_source, "recent": recent_out,
    }


@router.patch("/clients/{tenant_id}")
def update_client(tenant_id: str, data: UpdateClient, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")
    if data.monthly_rate is not None:
        try:
            t.monthly_rate = data.monthly_rate
        except Exception:
            pass
    if data.plan is not None:
        t.plan = data.plan
    if data.is_active is not None:
        t.is_active = data.is_active
    db.commit()
    return {"ok": True}
