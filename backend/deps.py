from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from database import get_db
from models import User
import os

bearer = HTTPBearer()
SECRET = os.getenv("JWT_SECRET", "crm-saas-secret-key-change-this-later")
ALGO   = "HS256"

def get_current_user(
    creds: HTTPAuthorizationCredentials = Security(bearer),
    db:    Session                       = Depends(get_db)
) -> User:
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_current_tenant(user: User = Depends(get_current_user)) -> str:
    if not user.tenant_id:
        raise HTTPException(status_code=403, detail="No tenant associated")
    return str(user.tenant_id)

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("tenant_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    return user