# app/main.py 
from fastapi import FastAPI
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from api.v1 import site_attendance, costs, auth, blocks, observations, companies, admin, invitations, subscriptions, parcels, vineyard_rows, spatial_areas, risk_management, visitors, training, climate, timesheets, files, assets, maintenance, calibrations, calibration_schedules, observation_runs_complete, stock_movements, tasks, public_auth, blocks_query, regions, gis, public_climate, public_climate_zones, seasonal_stats, admin_users, admin_weather, admin_data, admin_qc, admin_jobs, realtime_climate, notifications, public_banners, admin_banners, admin_grow_banners, articles, research, email_campaigns, enrichment, seo, article_images, properties, contractor_management, calendar, reports, aliases, company_admin, task_rows, forecast, site, feedback, insights_feedback, insights_pro, surfaces, insights_sites, map_features, map_feature_types, public_taxonomy, public_map
from api.deps import deny_user_types
from fastapi import Depends

# The health-and-safety-only account. Denied at the ROUTER, not per
# endpoint: a sweep found 26 GET routes answering 200 to it because they
# scope by company and never check a permission module. Patching each one
# leaves the next one open.
deny_general_user = deny_user_types('general_user')

from core.config import settings
import logging
import traceback
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
import os
import re

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define tags metadata for better Swagger documentation
tags_metadata = [
    {
        "name": "auth",
        "description": "Authentication operations. Login, register, and token management.",
    },
    {
        "name": "blocks",
        "description": "Vineyard block operations. Manage and query vineyard blocks with spatial data.",
    },
    {
        "name": "root",
        "description": "Root endpoints for health checks and API information.",
    },
    {
        "name": "companies",
        "description": "Company operations. Manage companies and view company statistics.",
    },
    {
        "name": "observations",
        "description": "Observation operations including image management.",
    },
    {
        "name": "risk-management",
        "description": "Comprehensive risk management including site risks, actions, and incident register.",
    },
    {
        "name": "root",
        "description": "Root endpoints for health checks and API information.",
    },
]

if os.getenv("ENV") == "production":
    app = FastAPI(
        title="Auxein Insights API",
        description="""...""",  # your description
        version="0.1.0",
        openapi_tags=tags_metadata,
        docs_url=None,  # or "/docs-secret-xyz123"
        redoc_url=None,
        openapi_url=None,  # or "/openapi-secret-xyz123.json"
        swagger_ui_parameters={"persistAuthorization": True}
    )
else:
    app = FastAPI(
        title="Auxein Insights API",
        description="""...""",  # your description
        version="0.1.0",
        openapi_tags=tags_metadata,
        docs_url="/docs",
        redoc_url="/redoc",
        swagger_ui_parameters={"persistAuthorization": True}
    )

@app.middleware("http")
async def log_errors(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        print(f"ERROR: {str(e)}")
        try:
            print(traceback.format_exc())
        except UnicodeEncodeError:
            # Handle Windows console encoding issues
            exc_text = traceback.format_exc()
            safe_text = exc_text.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
            print(safe_text)
        except Exception:
            # Fallback if even that fails
            print(f"Error occurred but couldn't display traceback due to encoding issues")
        return JSONResponse(status_code=500, content={"detail": str(e)})

# Set up CORS
allowed_origins = [
    "https://www.auxein.co.nz",
    "https://auxein.co.nz",
    "https://app.auxein.co.nz",
    "https://grow.auxein.co.nz",
    "https://insights.auxein.co.nz",
    "https://taste.auxein.co.nz",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    # 127.0.0.1 is a DIFFERENT origin from localhost as far as CORS is
    # concerned, and the two are not interchangeable in dev. `localhost`
    # resolves to ::1 first while uvicorn binds IPv4 only, so the documented
    # workaround is to use 127.0.0.1 — which then failed CORS because only the
    # localhost spellings were listed. Every dev port gets both.
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include API routers first
app.include_router(
    auth.router, 
    prefix="/api/auth", 
    tags=["auth"]
)

app.include_router(
    blocks.router, 
    prefix="/api/blocks", 
    tags=["blocks"]
)

app.include_router(
    companies.router,
    prefix="/api/companies",
    tags=["companies"]
)

app.include_router(
    properties.router,
    prefix="/api/v1/properties",
    tags=["properties"]
)

app.include_router(
    admin.router,
    prefix='/api/admin',
    tags=["admin"]
)

app.include_router(
    invitations.router, 
    prefix="/api/invitations", 
    tags=["invitations"]
)

app.include_router(
    subscriptions.router,
    prefix="/api/subscriptions",
    tags=["subscriptions"]
)

app.include_router(
    parcels.router, 
    prefix="/api/parcels", 
    tags=["parcels"]
)

app.include_router(
    vineyard_rows.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/vineyard_rows", 
    tags=["vineyard_rows"]
)

app.include_router(
    spatial_areas.router,
    prefix="/api/spatial_areas",
    tags=["spatial_areas"]
)

app.include_router(
    map_features.router,
    prefix="/api/map-features",
    tags=["map_features"]
)

app.include_router(
    map_feature_types.router,
    prefix="/api/map-feature-types",
    tags=["map_feature_types"]
)

app.include_router(
    risk_management.router,
    prefix="/api",  
    tags=["risk-management", "site-risks", "risk-actions", "incidents"]
)

app.include_router(
    visitors.router,
    prefix="/api/visitors",
    tags=["visitors"]
)

app.include_router(
    site.router,
    prefix="/api/site",
    tags=["site"],
)

app.include_router(
    feedback.router,
    prefix="/api/feedback",
    tags=["feedback"],
)

app.include_router(
    insights_feedback.router,
    prefix="/api/v1/feedback",
    tags=["insights-feedback"],
)

# Insights Pro: prices, the Grow comparison calculator, and enquiries. Public
# and unauthenticated by design — most people pricing this up have no account,
# and a funnel measured only past the login wall measures the wrong thing.
app.include_router(
    insights_pro.router,
    prefix="/api/v1/public/insights-pro",
    tags=["insights-pro"],
)

# Climate surfaces (SURFACE_CONTRACT_V2 §5). Currently a STUB — every route
# refuses with 503 unless SURFACE_STUB_ENABLED=1, so it cannot ship on by
# accident. The route stays at /api/v1/surfaces when the real implementation
# lands: the contract version lives in the S3 prefix and meta.contract_version,
# not in the URL (contract §7).
app.include_router(
    surfaces.router,
    prefix="/api/v1/surfaces",
    tags=["surfaces"],
)

# Pro sites — a subscriber's own point and its extracted climate record. Every
# route is behind `require_pro`, which 401s an anonymous caller and 402s a
# registered one, so there is no anonymous surface here to gate separately.
app.include_router(
    insights_sites.router,
    prefix="/api/v1/insights",
    tags=["insights-sites"],
)

app.include_router(
    training.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/training",
    tags=["training"]
)

app.include_router(
    climate.router, 
    prefix="/api/climate",
    tags=["climate"]
)

# NOT denied to general_user. The H&S account records its own hours like any
# other worker — the per-endpoint `timesheets` permission checks already limit
# it to read_own/submit, so a router-level deny here would only be a second,
# blunter copy of a rule that is already enforced correctly one level down.
app.include_router(
    timesheets.router,
    prefix="/api",
    tags=["timesheets"]
)

app.include_router(
    files.router, 
    prefix="/api/files",
    tags=["files"]
)

app.include_router(
    assets.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/assets",
    tags=["assets"]
)

app.include_router(
    maintenance.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/maintenance",
    tags=["maintenance"]
)

app.include_router(
    calibrations.router,
    dependencies=[Depends(deny_general_user)],
    prefix="/api/calibrations",
    tags=["calibrations"]
)

app.include_router(
    calibration_schedules.router,
    dependencies=[Depends(deny_general_user)],
    prefix="/api/calibration-schedules",
    tags=["calibration-schedules"]
)

app.include_router(
    stock_movements.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/stock-movements",
    tags=["stock-movements "]
)

app.include_router(
    observations.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/observations",
    tags=["observations"]
)

app.include_router(
    observation_runs_complete.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/observation_runs_complete ",
    tags=["observation_runs_complete "]
)

app.include_router(
    tasks.router, 
    dependencies=[Depends(deny_general_user)],
    prefix="/api/tasks",
    tags=["tasks"]
)


app.include_router(
    public_auth.router, 
    prefix="/api/v1",
    tags=["Public Authentication"]
)

app.include_router(
    blocks_query.router, 
    prefix="/api/v1/public/blocks",
    tags=["public-blocks"]
)

app.include_router(
    regions.router,
    prefix="/api/v1/public/regions",
    tags=["regions"]
)

app.include_router(
    gis.router,
    prefix="/api/v1/public/gis",
    tags=["geographical-indications"]
)

app.include_router(
    public_taxonomy.router,
    prefix="/api/v1/public/taxonomy",
    tags=["taxonomy"]
)

app.include_router(
    public_map.router,
    prefix="/api/v1/public/map",
    tags=["map"]
)

app.include_router(
    public_climate.router,
    prefix="/api/v1/public/public_climate",
    tags=["public_climate"]
)

app.include_router(
    public_climate_zones.router,
    prefix="/api/v1/public/climate-zones",
    tags=["climate-zones"]
)

app.include_router(
    seasonal_stats.router,
    prefix="/api/v1/public/seasonal-stats",
    tags=["seasonal-stats"]
)

app.include_router(
    admin_users.router,
    prefix="/api/v1/admin",
    tags=["Admin - Users"]
)

app.include_router(
    admin_weather.router,
    prefix="/api/v1/admin",
    tags=["Admin - Weather"]
)

app.include_router(
    admin_data.router,
    prefix="/api/v1/admin",
    tags=["Admin - Data Quality"]
)

app.include_router(
    admin_qc.router,
    prefix="/api/v1/admin",
    tags=["Admin - QC"]
)

app.include_router(
    admin_jobs.router,
    prefix="/api/v1/admin",
    tags=["Admin - Jobs"]
)

app.include_router(
    realtime_climate.router,
    prefix="/api/v1/public/realtime",
    tags=["realtime-climate"]
)

app.include_router(
    notifications.router,
    prefix="/api/v1/notifications",
    tags=["notifications"]
)

app.include_router(
    public_banners.router,
    prefix="/api/v1/public/banners",
    tags=["public_banners"]
)

app.include_router(
    admin_banners.router,
    prefix="/api/v1/admin",
    tags=["Admin - Banners"]
)

app.include_router(
    admin_grow_banners.router,
    prefix="/api/v1/grow-admin",
    tags=["Grow Admin - Banners"]
)

app.include_router(
    articles.router,
    prefix="/api/v1",
    tags=["Articles"]
)

app.include_router(
    research.router,
    prefix="/api/v1",
    tags=["Research"]
)

app.include_router(
    email_campaigns.router,
    prefix="/api/v1",
    tags=["Email Campaigns"]
)

app.include_router(
    enrichment.router,
    prefix="/api/v1",
    tags=["Enrichment"]
)

# SEO routes (sitemap, rss) must be registered BEFORE the catch-all static handler
app.include_router(
    seo.router,
    tags=["SEO"]
)

app.include_router(
    article_images.router,
    prefix="/api/v1",
    tags=["Article Images"]
)

app.include_router(
    contractor_management.router,
    dependencies=[Depends(deny_general_user)],
    prefix="/api/v1/contractor-management",
    tags=["contractor-management"]
)

app.include_router(
    calendar.router,
    dependencies=[Depends(deny_general_user)],
    prefix="/api/v1/calendar",
    tags=["calendar"]
)

app.include_router(
    reports.router,
    dependencies=[Depends(deny_general_user)],
    prefix="/api/v1/reports",
    tags=["reports"]
)
# Pay rates and cost settings. Gated on the `costs` permission module
# (auxein_admin + company_admin), NOT on timesheets.
app.include_router(
    costs.router,
    dependencies=[Depends(deny_general_user)],
    prefix="/api/v1/costs",
    tags=["costs"]
)

# Signing on and off a property. Gated on the `site_attendance` module, which
# the new general_user type holds — see core/permissions.py.
app.include_router(
    site_attendance.router,
    prefix="/api/v1/site-attendance",
    tags=["site attendance"]
)

app.include_router(
    aliases.router,
    prefix="/api/v1/aliases",
    tags=["aliases"]
)

app.include_router(
    company_admin.router,
    prefix="/api/v1/company-admin",
    tags=["company-admin"]
)

app.include_router(
    task_rows.router,
    dependencies=[Depends(deny_general_user)],
    prefix="/api",
    tags=["task-rows"]
)

app.include_router(
    forecast.router,
    prefix="/api/v1/forecast",
    tags=["forecast"]
)

# Mount uploads directory for serving uploaded images
uploads_dir = "uploads"
if not os.path.exists(uploads_dir):
    os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# API endpoints
@app.get("/api", tags=["root"])
def api_root():
    """
    API root endpoint
    """
    return {
        "message": "Welcome to Vineyard Management API",
        "version": "0.1.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }

@app.get("/api/health", tags=["root"])
def health_check():
    """
    Health check endpoint for monitoring
    """
    return {
        "status": "healthy",
        "service": "vineyard-api",
        "version": "0.1.0"
    }

@app.get("/api/debug/auth", tags=["debug"])
async def debug_auth(request: Request):
    """
    Debug endpoint to see what authorization header is being received
    """
    auth_header = request.headers.get("Authorization", "Not found")
    logger.info(f"Authorization header: {auth_header}")
    
    return {
        "auth_header": auth_header,
        "all_headers": dict(request.headers)
    }

@app.get("/debug/routes")
def list_all_routes():
    """Debug: List all registered routes"""
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            route_info = {
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, 'name', 'unknown')
            }
            routes.append(route_info)
    return {"total_routes": len(routes), "routes": routes}


# Static dir holds the holding page (index.html + favicon + logo) served by the
# holding_page_middleware below. SEO injection for /articles/* and /research/*
# was removed when api.auxein.co.nz stopped serving the public Insights frontend
# — those URLs now 301 to insights.auxein.co.nz via legacy_insights_redirect.
static_dir = "static"


# ─── Top-level unsubscribe route ───
# Registered directly on the app (not behind /api/v1 prefix) so it works
# regardless of how VITE_API_URL is configured. Handles both:
#   /unsubscribe/{token}
#   /public/email/unsubscribe/{token}
# The /api/v1/public/email/unsubscribe/{token} route in email_campaigns.py still works too.

@app.get("/unsubscribe/{token}")
@app.get("/public/email/unsubscribe/{token}")
async def unsubscribe_toplevel(token: str):
    from fastapi.responses import HTMLResponse
    from db.session import SessionLocal
    from db.models.public_user import PublicUser

    db = SessionLocal()
    try:
        user = db.query(PublicUser).filter(PublicUser.unsubscribe_token == token).first()
        if not user:
            return HTMLResponse(status_code=404, content="""<!DOCTYPE html><html><head><title>Unsubscribe</title>
            <style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;}
            .card{background:white;border-radius:12px;padding:3rem;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:400px;}
            h2{color:#374151;margin:0 0 0.5rem;} p{color:#6b7280;}</style></head>
            <body><div class="card"><h2>Invalid Link</h2><p>This unsubscribe link is invalid or has expired.</p></div></body></html>""")

        user.newsletter_opt_in = False
        user.marketing_opt_in = False
        db.commit()

        regional_url = os.getenv("REGIONAL_INTELLIGENCE_URL", "https://insights.auxein.co.nz")
        return HTMLResponse(content=f"""<!DOCTYPE html><html><head><title>Unsubscribed</title>
        <style>body{{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;}}
        .card{{background:white;border-radius:12px;padding:3rem;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:400px;}}
        h2{{color:#446145;margin:0 0 0.5rem;}} p{{color:#6b7280;}} .check{{font-size:3rem;margin-bottom:1rem;}}</style></head>
        <body><div class="card"><div class="check">&#10003;</div><h2>Unsubscribed</h2>
        <p>You've been successfully unsubscribed from Auxein Insights emails.</p>
        <p style="margin-top:1.5rem;font-size:0.85rem;">Changed your mind? Log in at <a href="{regional_url}" style="color:#446145;">Auxein Insights</a> to manage your preferences.</p>
        </div></body></html>""")
    finally:
        db.close()


# Legacy URLs from when api.auxein.co.nz served the public Insights frontend.
# Anything under /articles/* or /research/* now lives at insights.auxein.co.nz.
# We 301 to the canonical host so backlinks (Google, social shares, old emails) keep working.
_LEGACY_INSIGHTS_RE = re.compile(r"^/(articles|research)(/.*)?$")
_INSIGHTS_HOST = "https://insights.auxein.co.nz"


@app.middleware("http")
async def legacy_insights_redirect(request: Request, call_next):
    path = request.url.path
    match = _LEGACY_INSIGHTS_RE.match(path)
    if match:
        from fastapi.responses import RedirectResponse
        target = f"{_INSIGHTS_HOST}{path}"
        if request.url.query:
            target += f"?{request.url.query}"
        return RedirectResponse(target, status_code=301)
    return await call_next(request)


if os.path.exists(static_dir):
    # Holding-page middleware: api.auxein.co.nz/ and any unmatched non-API path
    # serves the branded Auxein API holding page (backend/static/index.html).
    # The page is self-contained — no SPA assets to load — so we don't need
    # a /static mount or per-asset routing. Only serves on 404/405 from non-API
    # paths, so real API errors still surface as JSON.
    _index_html_path = os.path.join(static_dir, "index.html")
    _index_html = ""
    if os.path.exists(_index_html_path):
        with open(_index_html_path, "r", encoding="utf-8") as f:
            _index_html = f.read()

    @app.middleware("http")
    async def holding_page_middleware(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path

        if response.status_code in (404, 405) and not path.startswith("/api"):
            # Drain the original response body to avoid resource leaks
            async for _ in response.body_iterator:
                pass

            # Serve the small set of files referenced by the holding page directly
            # (favicon.ico, logo-mark.png) — no need for a full /static mount for
            # just two assets.
            file_path = os.path.join(static_dir, path.lstrip("/"))
            if os.path.isfile(file_path) and not os.path.isdir(file_path):
                return FileResponse(file_path)

            if _index_html:
                return HTMLResponse(content=_index_html)

        return response
else:
    # If no static dir, serve a JSON pointer instead of nothing.
    @app.get("/")
    def root():
        return {
            "message": "Auxein API",
            "apps": {
                "grow": "https://grow.auxein.co.nz",
                "insights": "https://insights.auxein.co.nz",
                "marketing": "https://auxein.co.nz",
            },
        }


# Enhanced OpenAPI schema for better documentation
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    # Ensure both schemes exist (bearerAuth is the one Swagger will use)
    comps = openapi_schema.setdefault("components", {})
    sec_schemes = comps.setdefault("securitySchemes", {})
    sec_schemes.setdefault("bearerAuth", {
        "type": "http", "scheme": "bearer", "bearerFormat": "JWT",
    })
    # (Optional) Keep OAuth2PasswordBearer as an alias so existing code doesn't crash
    sec_schemes.setdefault("OAuth2PasswordBearer", {
        "type": "http", "scheme": "bearer", "bearerFormat": "JWT",
    })

    EXEMPT_PATHS = {
        "/api/auth/login",
        "/api/auth/register",
        "/api/health",
        "/api",
        "/docs",
        "/redoc",
        "/openapi.json",
    }
    VALID_METHODS = {"get","post","put","patch","delete","options","head"}

    # Rewrite op security → bearerAuth and add default where missing
    for path, item in openapi_schema.get("paths", {}).items():
        for method, op in list(item.items()):
            if method.lower() not in VALID_METHODS or not isinstance(op, dict):
                continue

            if "security" in op and isinstance(op["security"], list):
                new_sec = []
                for req in op["security"]:
                    if not isinstance(req, dict):
                        continue
                    if "OAuth2PasswordBearer" in req:
                        new_sec.append({"bearerAuth": []})
                    else:
                        # keep only entries that exist in components
                        valid = {k: v for k, v in req.items() if k in sec_schemes}
                        if valid:
                            new_sec.append(valid)
                # If nothing left and not exempt, default to bearerAuth
                if not new_sec and path not in EXEMPT_PATHS:
                    new_sec = [{"bearerAuth": []}]
                op["security"] = new_sec
            elif path not in EXEMPT_PATHS:
                op["security"] = [{"bearerAuth": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema



app.openapi = custom_openapi

# Add this at the end - CRITICAL for running the server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")