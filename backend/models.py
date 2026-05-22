from sqlalchemy import Column, String, Boolean, Text, DateTime, Index
from sqlalchemy.sql import func
from database import Base
import uuid
import secrets

def gen_uuid():
    return str(uuid.uuid4())

def gen_api_key():
    # 32-byte url-safe token -> ~43 chars. Prefixed for easy identification.
    return "crm_" + secrets.token_urlsafe(32)

class Tenant(Base):
    __tablename__ = "tenants"

    id         = Column(String(36), primary_key=True, default=gen_uuid)
    name       = Column(String(255), nullable=False)
    slug       = Column(String(100), unique=True, nullable=False)
    api_key    = Column(String(80), unique=True, nullable=False, default=gen_api_key, index=True)
    plan       = Column(String(50), default="trial")
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

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
    source      = Column(String(100), default="manual")    # high-level: website, google_ads, meta_ads, manual, referral
    status      = Column(String(50), default="new", index=True)
    notes       = Column(Text)
    assigned_to = Column(String(36), nullable=True, index=True)

    # Google Ads / marketing attribution
    utm_source   = Column(String(255), nullable=True, index=True)
    utm_medium   = Column(String(255), nullable=True)
    utm_campaign = Column(String(255), nullable=True, index=True)
    utm_term     = Column(String(255), nullable=True)
    utm_content  = Column(String(255), nullable=True)
    gclid        = Column(String(255), nullable=True, index=True)  # Google click id - critical for offline conversions
    fbclid       = Column(String(255), nullable=True)              # Meta click id
    landing_page = Column(String(500), nullable=True)
    referrer     = Column(String(500), nullable=True)

    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

# Composite index for common dashboard query (tenant + date)
Index("ix_leads_tenant_created", Lead.tenant_id, Lead.created_at)
