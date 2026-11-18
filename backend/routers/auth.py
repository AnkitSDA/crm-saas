from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
from database import get_db
from models import User, Tenant, gen_api_key
from deps import get_current_user
import os, uuid
from urllib.parse import urlparse

router = APIRouter(prefix="/auth", tags=["auth"])
pwd    = CryptContext(schemes=["bcrypt"])

SECRET = os.getenv("JWT_SECRET")
if not SECRET:
    if os.getenv("ENV", "production") == "development":
        SECRET = "dev-only-secret-do-not-use-in-prod"
    else:
        raise RuntimeError("JWT_SECRET environment variable is required.")

ALGO = "HS256"

# Request schemas
class RegisterRequest(BaseModel):
    business_name: str
    email:         str
    password:      str

class LoginRequest(BaseModel):
    email:    str
    password: str


# ---------- Domain based login separation ----------
# Render env (all optional; if not set, login works exactly as before):
#   AGENCY_HOSTS    = agency.brandbanalo.com
#   TENANT_DOMAINS  = raviart.brandbanalo.com=<tenant slug or id>,other.brandbanalo.com=<slug or id>
def _csv_env(name: str) -> list[str]:
    return [x.strip().lower() for x in os.getenv(name, "").split(",") if x.strip()]

AGENCY_HOSTS = set(_csv_env("AGENCY_HOSTS"))
TENANT_DOMAINS: dict[str, str] = {}
for _pair in _csv_env("TENANT_DOMAINS"):
    if "=" in _pair:
        _host, _val = _pair.split("=", 1)
        TENANT_DOMAINS[_host.strip()] = _val.strip()


def _request_host(request: Request) -> str:
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    try:
        return (urlparse(origin).hostname or "").lower()
    except Exception:
        return ""


def _enforce_domain(request: Request, user: User, db: Session) -> None:
    host = _request_host(request)
    if not host:
        return

    # agency domain: only super_admin may log in
    if host in AGENCY_HOSTS:
        if user.role != "super_admin":
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return

    # client domain: only users of that tenant may log in (agency login denied too)
    if host in TENANT_DOMAINS:
        if user.role == "super_admin" or not user.tenant_id:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        wanted = TENANT_DOMAINS[host]
        if not tenant or wanted not in (str(tenant.id).lower(), str(tenant.slug).lower()):
            raise HTTPException(status_code=401, detail="Invalid credentials")

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
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Create tenant with auto-generated api_key
    slug = data.business_name.lower().replace(" ", "-") + "-" + str(uuid.uuid4())[:4]
    tenant = Tenant(
        id=str(uuid.uuid4()),
        name=data.business_name,
        slug=slug,
        api_key=gen_api_key()
    )
    db.add(tenant)
    db.flush()

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
    db.refresh(tenant)

    return {
        "token":   make_token(user),
        "role":    user.role,
        "tenant":  tenant.slug,
        "api_key": tenant.api_key,  # Show once on registration; user can also find it in Settings
    }

@router.post("/login")
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not pwd.verify(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _enforce_domain(request, user, db)

    # Suspended account check (agency super_admin always allowed)
    if user.role != "super_admin" and user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant:
            mode = getattr(tenant, "access_mode", None) or ("active" if tenant.is_active else "block_all")
            if mode in ("block_all", "block_login"):
                raise HTTPException(status_code=403, detail="Account suspended. Please contact your agency.")

    return {    "token": make_token(user),
        "role":  user.role
    }

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id":        user.id,
        "email":     user.email,
        "full_name": user.full_name,
        "role":      user.role,
        "tenant_id": user.tenant_id,
    }
