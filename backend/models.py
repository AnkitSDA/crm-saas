from sqlalchemy import Column, String, Boolean, Text, DateTime, Float, Integer, Index
from sqlalchemy.sql import func
from database import Base
import uuid
import secrets

def gen_uuid():
    return str(uuid.uuid4())

def gen_api_key():
    return "crm_" + secrets.token_urlsafe(32)

def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) > 10 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) >= 10:
        return digits[-10:]
    return digits if digits else None


class Tenant(Base):
    __tablename__ = "tenants"
    id         = Column(String(36), primary_key=True, default=gen_uuid)
    name       = Column(String(255), nullable=False)
    slug       = Column(String(100), unique=True, nullable=False)
    api_key    = Column(String(80), unique=True, nullable=False, default=gen_api_key, index=True)
    plan       = Column(String(50), default="trial")
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    access_mode = Column(String(20), default="active")
    brand_name      = Column(String(120))                              # 👈 ADD
    logo_url        = Column(String(500))                              # 👈 ADD
    accent_color    = Column(String(20), default="#4f46e5")        

class User(Base):
    __tablename__ = "users"
    id            = Column(String(36), primary_key=True, default=gen_uuid)
    tenant_id     = Column(String(36), nullable=True, index=True)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name     = Column(String(255))
    role          = Column(String(50), default="member")
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, server_default=func.now())

class Lead(Base):
    __tablename__ = "leads"
    id          = Column(String(36), primary_key=True, default=gen_uuid)
    tenant_id   = Column(String(36), nullable=False, index=True)
    name        = Column(String(255))
    phone       = Column(String(50), index=True)
    email       = Column(String(255), index=True)
    source      = Column(String(100), default="manual")
    status      = Column(String(50), default="new", index=True)
    notes       = Column(Text)
    assigned_to = Column(String(36), nullable=True, index=True)
    follow_up_at = Column(DateTime, nullable=True, index=True)
    deal_value  = Column(Float, nullable=True)

    utm_source   = Column(String(255), nullable=True, index=True)
    utm_medium   = Column(String(255), nullable=True)
    utm_campaign = Column(String(255), nullable=True, index=True)
    utm_term     = Column(String(255), nullable=True)
    utm_content  = Column(String(255), nullable=True)
    gclid        = Column(String(255), nullable=True, index=True)
    fbclid       = Column(String(255), nullable=True)
    landing_page = Column(String(500), nullable=True)
    referrer     = Column(String(500), nullable=True)

    unsubscribed = Column(Boolean, default=False)   # 👈 ADD (email marketing opt-out)

    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

Index("ix_leads_tenant_created", Lead.tenant_id, Lead.created_at)


class LeadActivity(Base):
    __tablename__ = "lead_activities"
    id            = Column(String(36), primary_key=True, default=gen_uuid)
    lead_id       = Column(String(36), nullable=False, index=True)
    tenant_id     = Column(String(36), nullable=False, index=True)
    note          = Column(Text)
    activity_type = Column(String(50), default="note")
    created_by    = Column(String(255), nullable=True)
    created_at    = Column(DateTime, server_default=func.now())

Index("ix_activities_lead_created", LeadActivity.lead_id, LeadActivity.created_at)


class AdSpend(Base):
    __tablename__ = "ad_spends"
    id         = Column(String(36), primary_key=True, default=gen_uuid)
    tenant_id  = Column(String(36), nullable=False, index=True)
    month      = Column(String(7), nullable=False)   # YYYY-MM
    source     = Column(String(50), nullable=False)  # google_ads | meta_ads | website | all
    amount     = Column(Float, default=0)
    created_at = Column(DateTime, server_default=func.now())

Index("ix_spends_tenant_month", AdSpend.tenant_id, AdSpend.month)


class Campaign(Base):                                # 👈 ADD (email marketing log)
    __tablename__ = "campaigns"
    id           = Column(String(36), primary_key=True, default=gen_uuid)
    tenant_id    = Column(String(36), nullable=False, index=True)
    subject      = Column(String(300), nullable=False)
    body         = Column(Text)
    recipients   = Column(Integer, default=0)
    sent_count   = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    status       = Column(String(20), default="sent")   # sending | sent
    created_by   = Column(String(255), nullable=True)
    created_at   = Column(DateTime, server_default=func.now())

Index("ix_campaigns_tenant", Campaign.tenant_id)