# app/main.py 
from fastapi import FastAPI
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from api.v1 import auth, blocks, observations, companies, admin, invitations, subscriptions, parcels, vineyard_rows, spatial_areas, risk_management, visitors, training, climate, timesheets, files, assets, maintenance, calibrations, observation_runs_complete, stock_movements, tasks, public_auth, blocks_query, regions, gis, public_climate, admin_users, admin_weather, admin_data, realtime_climate, notifications, public_banners, admin_banners, articles, research, email_campaigns, enrichment, seo, article_images, properties, contractor_management, calendar, reports, aliases, company_admin, task_rows
from core.config import settings
import logging
import traceback
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
import os
import re
from html import escape as html_escape

try:
    from api.v1 import blockchain
except ImportError:
    pass  # Skip blockchain import if services not ready

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
    "https://insights.auxein.co.nz",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
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
    prefix="/api/vineyard_rows", 
    tags=["vineyard_rows"]
)

app.include_router(
    blockchain.router, 
    prefix="/api/blockchain", 
    tags=["blockchain"]
)

app.include_router(
    spatial_areas.router, 
    prefix="/api/spatial_areas", 
    tags=["spatial_areas"]
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
    training.router, 
    prefix="/api/training",
    tags=["training"]
)

app.include_router(
    climate.router, 
    prefix="/api/climate",
    tags=["climate"]
)

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
    prefix="/api/assets",
    tags=["assets"]
)

app.include_router(
    maintenance.router, 
    prefix="/api/maintenance",
    tags=["maintenance"]
)

app.include_router(
    calibrations.router, 
    prefix="/api/calibrations",
    tags=["calibrations"]
)

app.include_router(
    stock_movements.router, 
    prefix="/api/stock-movements",
    tags=["stock-movements "]
)

app.include_router(
    observations.router, 
    prefix="/api/observations",
    tags=["observations"]
)

app.include_router(
    observation_runs_complete.router, 
    prefix="/api/observation_runs_complete ",
    tags=["observation_runs_complete "]
)

app.include_router(
    tasks.router, 
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
    public_climate.router,
    prefix="/api/v1/public/public_climate",
    tags=["public_climate"]
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
    prefix="/api/v1/contractor-management",
    tags=["contractor-management"]
)

app.include_router(
    calendar.router,
    prefix="/api/v1/calendar",
    tags=["calendar"]
)

app.include_router(
    reports.router,
    prefix="/api/v1/reports",
    tags=["reports"]
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
    prefix="/api",
    tags=["task-rows"]
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


# Mount static files (React app) - this should be AFTER API routes
static_dir = "static"

def _get_seo_meta(content_type: str, slug: str) -> dict | None:
    """Look up title/description/image/structured data for an article or research report."""
    from db.session import SessionLocal
    db = SessionLocal()
    try:
        if content_type == "articles":
            from db.models.article import Article
            row = db.query(
                Article.title, Article.meta_description, Article.og_image_url,
                Article.seo_title, Article.structured_data, Article.tags,
                Article.published_at, Article.slug,
            ).filter(Article.slug == slug, Article.status == "published").first()
        elif content_type == "research":
            from db.models.research import ResearchReport
            row = db.query(
                ResearchReport.title, ResearchReport.meta_description,
                ResearchReport.og_image_url, ResearchReport.seo_title,
                ResearchReport.structured_data, ResearchReport.tags,
                ResearchReport.published_at, ResearchReport.slug,
            ).filter(ResearchReport.slug == slug, ResearchReport.status == "published").first()
        else:
            return None

        if not row:
            return None

        title, meta_desc, og_image, seo_title, structured_data, tags, published_at, slug_val = row
        return {
            "title": seo_title or title,
            "description": meta_desc or "",
            "image": og_image or "",
            "structured_data": structured_data,
            "tags": tags or [],
            "published_at": published_at.isoformat() if published_at else "",
            "slug": slug_val,
            "content_type": content_type,
        }
    except Exception:
        logger.exception("SEO meta lookup failed for %s/%s", content_type, slug)
        return None
    finally:
        db.close()


_SITE_URL = "https://insights.auxein.co.nz"


def _build_json_ld(meta: dict) -> str:
    """Build JSON-LD structured data for a content page."""
    import json as jsonlib

    # Use stored structured_data if the author has provided custom JSON-LD
    if meta.get("structured_data"):
        return jsonlib.dumps(meta["structured_data"])

    content_type = meta.get("content_type", "articles")
    schema_type = "ScholarlyArticle" if content_type == "research" else "Article"

    ld = {
        "@context": "https://schema.org",
        "@type": schema_type,
        "headline": meta["title"],
        "description": meta.get("description", ""),
        "datePublished": meta.get("published_at", ""),
        "author": {"@type": "Organization", "name": "Auxein Limited", "url": "https://auxein.co.nz"},
        "publisher": {"@type": "Organization", "name": "Auxein Limited", "url": "https://auxein.co.nz"},
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": f"{_SITE_URL}/{content_type}/{meta.get('slug', '')}",
        },
    }
    if meta.get("image"):
        ld["image"] = meta["image"]
    if meta.get("tags"):
        ld["keywords"] = ", ".join(meta["tags"])
    return jsonlib.dumps(ld)


def _build_breadcrumb_ld(meta: dict) -> str:
    """Build BreadcrumbList JSON-LD."""
    import json as jsonlib
    content_type = meta.get("content_type", "articles")
    section_name = "Articles" if content_type == "articles" else "Research"
    return jsonlib.dumps({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": _SITE_URL},
            {"@type": "ListItem", "position": 2, "name": section_name, "item": f"{_SITE_URL}/{content_type}"},
            {"@type": "ListItem", "position": 3, "name": meta["title"]},
        ],
    })


def _inject_meta_tags(html: str, meta: dict) -> str:
    """Insert OG / description meta tags + JSON-LD just before <title> in the HTML."""
    safe_title = html_escape(meta["title"], quote=True)
    safe_desc = html_escape(meta["description"], quote=True)
    tags = (
        f'<meta property="og:title" content="{safe_title}" />\n'
        f'<meta property="og:description" content="{safe_desc}" />\n'
        f'<meta property="og:type" content="article" />\n'
    )
    if meta.get("image"):
        safe_image = html_escape(meta["image"], quote=True)
        tags += f'<meta property="og:image" content="{safe_image}" />\n'
    tags += f'<meta name="description" content="{safe_desc}" />\n'
    # JSON-LD structured data
    tags += f'<script type="application/ld+json">{_build_json_ld(meta)}</script>\n'
    tags += f'<script type="application/ld+json">{_build_breadcrumb_ld(meta)}</script>\n'
    return html.replace("<title>", tags + "<title>", 1)


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


_SEO_PATH_RE = re.compile(r"^(articles|research)/([a-z0-9][a-z0-9-]*)$")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    # Read index.html once at startup for SEO injection
    _index_html_path = os.path.join(static_dir, "index.html")
    _index_html = ""
    if os.path.exists(_index_html_path):
        with open(_index_html_path, "r", encoding="utf-8") as f:
            _index_html = f.read()

    # SPA middleware: serve React app for non-API routes that don't match any endpoint.
    # Unlike a catch-all @app.get("/{path:path}"), this cannot produce 405 errors
    # on API POST/PUT/DELETE requests because it only runs AFTER route matching.
    @app.middleware("http")
    async def spa_middleware(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path

        # Only intercept non-API 404/405 responses to serve SPA
        if response.status_code in (404, 405) and not path.startswith("/api"):
            # Drain the original response body to avoid resource leaks
            async for _ in response.body_iterator:
                pass

            # Check if it's a static file
            file_path = os.path.join(static_dir, path.lstrip("/"))
            if os.path.isfile(file_path):
                return FileResponse(file_path)

            if _index_html:
                # SEO injection for content pages
                slug_match = _SEO_PATH_RE.match(path.lstrip("/"))
                if slug_match:
                    meta = _get_seo_meta(slug_match.group(1), slug_match.group(2))
                    if meta:
                        return HTMLResponse(content=_inject_meta_tags(_index_html, meta))
                return HTMLResponse(content=_index_html)

        return response
else:
    # If no static files, serve a simple root
    @app.get("/")
    def root():
        return {
            "message": "Vineyard API - React app not built",
            "api_docs": "/docs"
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