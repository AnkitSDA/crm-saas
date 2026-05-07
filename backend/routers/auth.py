from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
from database import get_db
from models import User, Tenant
import os, uuid

router = APIRouter(prefix="/auth", tags=["auth"])
pwd    = CryptContext(schemes=["bcrypt"])
SECRET = os.getenv("JWT_SECRET", "crm-saas-secret-key-change-this-later")
ALGO   = "HS256"

# Request schemas
class RegisterRequest(BaseModel):
    business_name: str
    email:         str
    password:      str

class LoginRequest(BaseModel):
    email:    str
    password: str

def make_token(user: User) -> str:
    payload = {
        "sub":       str(user.id),
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        "role":      user.role,
        "exp":       datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)

@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    # Email already exists?
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Tenant banao
    slug = data.business_name.lower().replace(" ", "-") + "-" + str(uuid.uuid4())[:4]
    tenant = Tenant(
        id=str(uuid.uuid4()),
        name=data.business_name,
        slug=slug
    )
    db.add(tenant)
    db.flush()

    # Tenant admin user banao
    user = User(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        email=data.email,
        password_hash=pwd.hash(data.password),
        full_name=data.business_name,
        role="tenant_admin"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "token": make_token(user),
        "role":  user.role,
        "tenant": tenant.slug
    }

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not pwd.verify(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {
        "token": make_token(user),
        "role":  user.role
    }

@router.get("/me")
def me(db: Session = Depends(get_db), user: User = Depends(__import__('deps').get_current_user)):
    return {
        "id":        user.id,
        "email":     user.email,
        "full_name": user.full_name,
        "role":      user.role,
        "tenant_id": user.tenant_id
    }