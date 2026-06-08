from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth, leads, webhooks, tenant
import models
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CRM API", version="1.1.0")

# CORS - read from env. Set ALLOWED_ORIGINS on Render as a comma-separated list, e.g.:
#   ALLOWED_ORIGINS=https://app.yourcrm.com,https://crm-frontend.vercel.app,http://localhost:3000
# Never use "*" in production with credentials enabled - browsers will block it anyway.
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth.router)
app.include_router(leads.router)
app.include_router(webhooks.router)
app.include_router(tenant.router)
app.include_router(admin.router)

@app.get("/")
def root():
    return {"status": "CRM backend is live", "version": "1.1.0"}

@app.get("/health")
def health():
    return {"healthy": True}
