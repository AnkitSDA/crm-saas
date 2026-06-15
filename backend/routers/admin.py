from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from database import get_db
from models import Tenant, User, Lead, AdSpend, Payment, gen_api_key
from deps import require_super_admin
import uuid, secrets

router = APIRouter(prefix="/admin", tags=["admin"])
pwd = CryptContext(schemes=["bcrypt"])

ALL_SOURCES = "google_ads,meta_ads,website"


def _current_period() -> str:
    # IST month (UTC + 5:30) so month boundary matches India
    ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    return ist.strftime("%Y-%m")


# ---------------- schemas ----------------
class CreateClient(BaseModel):
    business_name: str
    email:         str
    password:      str
    monthly_rate:  Optional[float] = 3500


class UpdateClient(BaseModel):
    monthly_rate:    Optional[float] = None
    plan:            Optional[str]   = None
    is_active:       Optional[bool]  = None
    enabled_sources: Optional[str]   = None   # csv: "google_ads,meta_ads,website"
    access_mode:     Optional[str]   = None   # active|block_all|block_leads|block_login
    brand_name:      Optional[str]   = None
    logo_url:        Optional[str]   = None
    accent_color:    Optional[str]   = None


class AdminLeadUpdate(BaseModel):
    status:     Optional[str]   = None
    notes:      Optional[str]   = None
    deal_value: Optional[float] = None


class PwReset(BaseModel):
    new_password: Optional[str] = None


class MarkPaid(BaseModel):
    period: Optional[str]   = None   # YYYY-MM, default = current month
    amount: Optional[float] = None   # default = tenant monthly_rate
    method: Optional[str]   = None   # UPI | Bank | Cash
    note:   Optional[str]   = None


class MarkUnpaid(BaseModel):
    mode: Optional[str] = "block_leads"   # block_leads | block_all


# ---------------- helpers ----------------
def _lead_stats(db: Session):
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
    rows = db.query(AdSpend.tenant_id, func.sum(AdSpend.amount)).group_by(AdSpend.tenant_id).all()
    return {r[0]: float(r[1] or 0) for r in rows}


def _paid_set(db: Session, period: str):
    rows = db.query(Payment.tenant_id).filter(Payment.period == period).distinct().all()
    return {r[0] for r in rows}


def _collected(db: Session, period: str) -> float:
    row = db.query(func.sum(Payment.amount)).filter(Payment.period == period).first()
    return float(row[0] or 0) if row and row[0] is not None else 0.0


def _rate(t: Tenant) -> float:
    return float(getattr(t, "monthly_rate", 0) or 0)


def _sources(t: Tenant) -> str:
    return getattr(t, "enabled_sources", None) or ALL_SOURCES


def _mode(t: Tenant) -> str:
    return getattr(t, "access_mode", None) or ("active" if t.is_active else "block_all")


def _branding(t: Tenant) -> dict:
    return {
        "brand_name":   getattr(t, "brand_name", None) or t.name,
        "logo_url":     getattr(t, "logo_url", None) or "",
        "accent_color": getattr(t, "accent_color", None) or "#4f46e5",
    }


# ---------------- client list + create ----------------
@router.get("/clients")
def list_clients(admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    ls, ss = _lead_stats(db), _spend_stats(db)
    period = _current_period()
    paid_set = _paid_set(db, period)
    clients = []
    tot = {"clients": 0, "leads": 0, "won": 0, "revenue": 0.0, "spend": 0.0,
           "mrr": 0.0, "collected": _collected(db, period), "paid_count": 0}
    for t in tenants:
        leads, won, revenue = ls.get(t.id, (0, 0, 0.0))
        spend = ss.get(t.id, 0.0)
        rate = _rate(t)
        is_paid = t.id in paid_set
        clients.append({
            "id": t.id, "name": t.name, "slug": t.slug, "plan": t.plan,
            "is_active": t.is_active, "monthly_rate": rate,
            "enabled_sources": _sources(t),
            "access_mode": _mode(t),
            "paid_this_month": is_paid,
            "leads": leads, "won": won, "revenue": revenue, "spend": spend,
            "roas": (revenue / spend) if spend > 0 else None,
            "created_at": t.created_at,
        })
        tot["clients"] += 1; tot["leads"] += leads; tot["won"] += won
        tot["revenue"] += revenue; tot["spend"] += spend
        if t.is_active: tot["mrr"] += rate
        if is_paid: tot["paid_count"] += 1
    tot["roas"] = (tot["revenue"] / tot["spend"]) if tot["spend"] > 0 else None
    return {"totals": tot, "clients": clients, "period": period}


@router.post("/clients")
def create_client(data: CreateClient, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    slug = data.business_name.lower().replace(" ", "-") + "-" + str(uuid.uuid4())[:4]
    tenant = Tenant(id=str(uuid.uuid4()), name=data.business_name, slug=slug,
                    api_key=gen_api_key(), plan="active")
    try:
        tenant.monthly_rate = data.monthly_rate or 0
        tenant.enabled_sources = ALL_SOURCES
    except Exception:
        pass
    db.add(tenant); db.flush()

    user = User(id=str(uuid.uuid4()), tenant_id=tenant.id, email=data.email,
                password_hash=pwd.hash(data.password), full_name=data.business_name,
                role="tenant_admin")
    db.add(user); db.commit(); db.refresh(tenant)
    return {"id": tenant.id, "name": tenant.name, "slug": tenant.slug,
            "api_key": tenant.api_key, "login_email": data.email,
            "monthly_rate": data.monthly_rate}


# ---------------- client detail + manage ----------------
@router.get("/clients/{tenant_id}")
def client_detail(tenant_id: str, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")

    src_rows = (
        db.query(Lead.source, func.count(Lead.id),
                 func.sum(case((Lead.status == "won", 1), else_=0)),
                 func.sum(case((Lead.status == "won", Lead.deal_value), else_=0)))
        .filter(Lead.tenant_id == tenant_id).group_by(Lead.source).all()
    )
    sources = [{"source": s or "unknown", "leads": int(c or 0), "won": int(w or 0), "revenue": float(rev or 0)}
               for s, c, w, rev in src_rows]

    login = (db.query(User).filter(User.tenant_id == tenant_id, User.role == "tenant_admin")
             .order_by(User.created_at).first())

    period = _current_period()
    paid_this_month = (db.query(Payment.id)
                       .filter(Payment.tenant_id == tenant_id, Payment.period == period)
                       .first() is not None)

    return {
        "id": t.id, "name": t.name, "slug": t.slug, "api_key": t.api_key,
        "plan": t.plan, "is_active": t.is_active, "monthly_rate": _rate(t),
        "enabled_sources": _sources(t),
        "access_mode": _mode(t),
        "branding": _branding(t),
        "login_email": login.email if login else None,
        "sources": sources,
        "current_period": period,
        "paid_this_month": paid_this_month,
    }


@router.patch("/clients/{tenant_id}")
def update_client(tenant_id: str, data: UpdateClient, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")
    if data.monthly_rate is not None:
        try: t.monthly_rate = data.monthly_rate
        except Exception: pass
    if data.enabled_sources is not None:
        try: t.enabled_sources = data.enabled_sources
        except Exception: pass
    if data.plan is not None:
        t.plan = data.plan
    if data.access_mode is not None:
        try:
            t.access_mode = data.access_mode
        except Exception:
            pass
        # keep is_active in sync for table badge / legacy checks
        t.is_active = (data.access_mode == "active")
    elif data.is_active is not None:
        t.is_active = data.is_active
        try:
            t.access_mode = "active" if data.is_active else "block_all"
        except Exception:
            pass
    for fld in ("brand_name", "logo_url", "accent_color"):
        val = getattr(data, fld)
        if val is not None:
            try:
                setattr(t, fld, val)
            except Exception:
                pass
    db.commit()
    return {"ok": True}


@router.post("/clients/{tenant_id}/reset-password")
def reset_password(tenant_id: str, data: PwReset, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    user = (db.query(User).filter(User.tenant_id == tenant_id, User.role == "tenant_admin")
            .order_by(User.created_at).first())
    if not user:
        raise HTTPException(status_code=404, detail="Client login not found")
    new_pw = data.new_password or ("crm" + secrets.token_hex(3))
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user.password_hash = pwd.hash(new_pw)
    db.commit()
    return {"email": user.email, "new_password": new_pw}


# ---------------- billing / payments ----------------
@router.get("/clients/{tenant_id}/payments")
def list_payments(tenant_id: str, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    rows = (db.query(Payment).filter(Payment.tenant_id == tenant_id)
            .order_by(Payment.paid_at.desc()).limit(100).all())
    return [{
        "id": p.id, "period": p.period, "amount": p.amount,
        "method": p.method, "note": p.note,
        "created_by": p.created_by, "paid_at": p.paid_at,
    } for p in rows]


@router.post("/clients/{tenant_id}/mark-paid")
def mark_paid(tenant_id: str, data: MarkPaid, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")
    period = (data.period or _current_period()).strip()
    amount = data.amount if data.amount is not None else _rate(t)
    pay = Payment(id=str(uuid.uuid4()), tenant_id=tenant_id, period=period,
                  amount=float(amount or 0), method=data.method, note=data.note,
                  created_by=getattr(admin, "email", None))
    db.add(pay)
    # auto-activate access
    try:
        t.access_mode = "active"
    except Exception:
        pass
    t.is_active = True
    db.commit()
    return {"ok": True, "period": period, "amount": float(amount or 0)}


@router.post("/clients/{tenant_id}/mark-unpaid")
def mark_unpaid(tenant_id: str, data: MarkUnpaid, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")
    mode = (data.mode or "block_leads")
    if mode not in ("block_leads", "block_all"):
        mode = "block_leads"
    try:
        t.access_mode = mode
    except Exception:
        pass
    if mode == "block_all":
        t.is_active = False
    db.commit()
    return {"ok": True, "access_mode": mode}


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: str, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    db.delete(p); db.commit()
    return {"ok": True}


# ---------------- client leads (admin view + manage) ----------------
@router.get("/clients/{tenant_id}/leads")
def client_leads(tenant_id: str,
                 status: Optional[str] = Query(None),
                 search: Optional[str] = Query(None),
                 limit: int = Query(100, ge=1, le=500),
                 admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    q = db.query(Lead).filter(Lead.tenant_id == tenant_id)
    if status:
        q = q.filter(Lead.status == status)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(Lead.name.ilike(like), Lead.phone.ilike(like), Lead.email.ilike(like)))
    leads = q.order_by(Lead.created_at.desc()).limit(limit).all()
    return [{
        "id": l.id, "name": l.name, "phone": l.phone, "email": l.email,
        "source": l.source, "status": l.status, "notes": l.notes,
        "deal_value": getattr(l, "deal_value", None),
        "created_at": l.created_at,
    } for l in leads]


@router.patch("/leads/{lead_id}")
def admin_update_lead(lead_id: str, data: AdminLeadUpdate, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    """Super-admin can update ANY lead across tenants."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(lead, field, value)
    db.commit()
    return {"ok": True}


# ---------------- delete client (DANGER) ----------------
@router.delete("/clients/{tenant_id}")
def delete_client(tenant_id: str, admin: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    """Permanently delete a client: tenant + its users + all leads + ad spends."""
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Client not found")
    # Safety: don't allow deleting the agency's own super_admin tenant
    has_super = (db.query(User)
                 .filter(User.tenant_id == tenant_id, User.role == "super_admin").first())
    if has_super:
        raise HTTPException(status_code=400, detail="Cannot delete the agency (super_admin) tenant")

    deleted_leads = db.query(Lead).filter(Lead.tenant_id == tenant_id).delete(synchronize_session=False)
    try:
        db.query(AdSpend).filter(AdSpend.tenant_id == tenant_id).delete(synchronize_session=False)
    except Exception:
        pass
    try:
        db.query(Payment).filter(Payment.tenant_id == tenant_id).delete(synchronize_session=False)
    except Exception:
        pass
    db.query(User).filter(User.tenant_id == tenant_id).delete(synchronize_session=False)
    db.delete(t)
    db.commit()
    return {"ok": True, "deleted_leads": int(deleted_leads or 0)}