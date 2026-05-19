from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth, leads, webhooks
import models

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:3000",
    "https://crm-saas-lemon.vercel.app",
    "https://crm-saas-gwlfcab36-ankitsda-projects.vercel.app",
],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth.router)
app.include_router(leads.router)
app.include_router(webhooks.router)

@app.get("/")
def root():
    return {"status": "CRM backend is live"}

@app.get("/health")
def health():
    return {"healthy": True}