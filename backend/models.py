from sqlalchemy import Column, String, Boolean, Text, DateTime, Enum
from sqlalchemy.sql import func
from database import Base
import uuid

def gen_uuid():
    return str(uuid.uuid4())

class Tenant(Base):
    __tablename__ = "tenants"

    id         = Column(String(36), primary_key=True, default=gen_uuid)
    name       = Column(String(255), nullable=False)
    slug       = Column(String(100), unique=True, nullable=False)
    plan       = Column(String(50), default="trial")
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

class User(Base):
    __tablename__ = "users"

    id            = Column(String(36), primary_key=True, default=gen_uuid)
    tenant_id     = Column(String(36), nullable=True)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name     = Column(String(255))
    role          = Column(String(50), default="member")
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, server_default=func.now())

class Lead(Base):
    __tablename__ = "leads"

    id          = Column(String(36), primary_key=True, default=gen_uuid)
    tenant_id   = Column(String(36), nullable=False)
    name        = Column(String(255))
    phone       = Column(String(50))
    email       = Column(String(255))
    source      = Column(String(100), default="manual")
    status      = Column(String(50), default="new")
    notes       = Column(Text)
    assigned_to = Column(String(36), nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())