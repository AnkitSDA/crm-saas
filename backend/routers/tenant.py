from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Tenant, User, gen_api_key
from deps import get_current_user, require_admin

router = APIRouter(prefix="/tenant", tags=["tenant"])


@router.get("/me")
def get_my_tenant(
    user: User    = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    """Anyone in a tenant can see basic info, but api_key only goes to admins."""
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    payload = {
        "id":              tenant.id,
        "name":            tenant.name,
        "slug":            tenant.slug,
        "plan":            tenant.plan,
        "enabled_sources": getattr(tenant, "enabled_sources", None) or "google_ads,meta_ads,website",
        "brand_name":      getattr(tenant, "brand_name", None) or tenant.name,
        "logo_url":        getattr(tenant, "logo_url", None) or "",
        "accent_color":    getattr(tenant, "accent_color", None) or "#4f46e5",
        "created_at":      tenant.created_at,
    }
    if user.role in ("tenant_admin", "super_admin"):
        payload["api_key"] = tenant.api_key
    return payload


@router.post("/regenerate-key")
def regenerate_api_key(
    user: User    = Depends(require_admin),
    db:   Session = Depends(get_db),
):
    """
    Rotate the api_key. Existing WordPress integrations will break until updated.
    Use when a key has leaked.
    """
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.api_key = gen_api_key()
    db.commit()
    db.refresh(tenant)
    return {"api_key": tenant.api_key}