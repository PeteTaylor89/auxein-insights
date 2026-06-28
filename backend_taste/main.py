# backend_taste/main.py — the isolated Auxein Taste API (own EB app).
# Prefix /taste; own CORS allow-list. Never imports Grow/Insights code.
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import bootstrap, health, photos, rest, sync
from core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

_prod = settings.ENV == "production"
# Swagger left on (even in prod) for Phase-1 API testing — every data route is
# auth-gated, so this only exposes the schema. Revisit before public launch.
app = FastAPI(
    title="Auxein Taste API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/taste", tags=["health"])
app.include_router(photos.router, prefix="/taste", tags=["photos"])
# v1 REST surface (server-authoritative CRUD) — the app talks to this.
app.include_router(rest.api_router, prefix="/taste/v1")
# Legacy offline-first sync relay — kept until the frontend is rewired (Phase 3),
# then removed.
app.include_router(bootstrap.router, prefix="/taste", tags=["legacy-sync"])
app.include_router(sync.router, prefix="/taste", tags=["legacy-sync"])


@app.get("/")
def root():
    return {"service": "auxein-taste-api", "docs": "/docs" if not _prod else None}
