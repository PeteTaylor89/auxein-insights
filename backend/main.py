# app/main.py - FINAL CORRECTED VERSION
from fastapi import FastAPI
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from api.v1 import auth, blocks, tasks, observations, companies, admin, invitations, subscriptions, parcels, vineyard_rows, spatial_areas, risk_management, visitors, training, climate, files
from core.config import settings
import logging
import traceback
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os

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
        "name": "site-risks",
        "description": "Site risk register with GIS mapping and risk matrix assessment.",
    },
    {
        "name": "risk-actions",
        "description": "Risk management actions and control measures with task integration.",
    },
    {
        "name": "incidents",
        "description": "Health & Safety incident register with NZ WorkSafe compliance.",
    },
    {
        "name": "root",
        "description": "Root endpoints for health checks and API information.",
    },
]

app = FastAPI(
    title="Vineyard Management API",
    description="""
    ## Vineyard Management System API
    
    This API provides endpoints for managing vineyard operations including:
    
    * **User authentication and management**
    * **Vineyard block data with spatial (GIS) capabilities**
    * **Task management for vineyard operations**
    * **Observation recording and tracking**
    * **Image management for observations**
    * **Risk management and safety compliance**
    * **Incident register with NZ WorkSafe integration**

    ### Features:
    
    - JWT-based authentication
    - Spatial queries using PostGIS
    - GeoJSON support for mapping
    - Comprehensive risk management system
    - H&S incident tracking with complianc
    - Filtering and searching capabilities
    - Statistical reporting
    - Image upload and serving
    
    ### Authentication:
    
    Most endpoints require authentication. Use the `/api/auth/login` endpoint to obtain tokens.
    Include the access token in the Authorization header: `Bearer your-token-here`
    
    ### Risk Management:
    
    The system includes a comprehensive risk management module with:
    - Site risk register with GIS mapping
    - Risk actions with automatic task creation
    - Incident register with NZ WorkSafe compliance
    - Integrated dashboard and reporting

    ### Data Structure:
    
    The system stores vineyard blocks with their spatial data (polygon boundaries) and attributes
    including variety, planted date, area, organic status, and more.
    """,
    version="0.1.0",
    openapi_tags=tags_metadata,
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.middleware("http")
async def log_errors(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(traceback.format_exc())
        return JSONResponse(status_code=500, content={"detail": str(e)})

# Set up CORS
origins = [
    "http://localhost",
    "http://localhost:3000",
    "https://www.auxein.co.nz",
    "https://vineyardappdemo-production.up.railway.app",  # Add your actual Railway URL
    "https://app.auxein.co.nz",  # Add your future custom domain
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
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
    tasks.router, 
    prefix="/api/tasks", 
    tags=["tasks"]
)

app.include_router(
    observations.router, 
    prefix="/api/observations", 
    tags=["observations"]
)

app.include_router(
    companies.router, 
    prefix="/api/companies", 
    tags=["companies"]
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
    files.router, 
    prefix="/api/files",
    tags=["files"]
)


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
        if hasattr(route, 'path'):
            route_info = {
                "path": route.path,
                "methods": list(getattr(route, 'methods', [])),
                "name": getattr(route, 'name', 'unknown')
            }
            routes.append(route_info)
    return {"total_routes": len(routes), "routes": routes}


# Mount static files (React app) - this should be AFTER API routes
static_dir = "static"
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    
    # Catch-all route for React app (client-side routing)
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Skip API routes
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc"):
            return {"error": "Route not found"}
        
        # Check if file exists in static directory
        file_path = os.path.join(static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        
        # Serve index.html for client-side routing
        index_path = os.path.join(static_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        else:
            return {"message": "React app not built yet"}
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
    
    # Add JWT Bearer authentication to the schema
    if "components" not in openapi_schema:
        openapi_schema["components"] = {}
        
    openapi_schema["components"]["securitySchemes"] = {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    
    # Apply security to all endpoints except auth and root endpoints
    if "paths" in openapi_schema:
        for path in openapi_schema["paths"]:
            for method in openapi_schema["paths"][path]:
                if method.lower() not in ["options", "head"] and not any(x in path for x in ["/api/auth/login", "/api/auth/register", "/health", "/"]):
                    # Don't require auth for file view endpoints (new generic structure)
                    if not (path.endswith("/view") and "/files/" in path):
                        if "security" not in openapi_schema["paths"][path][method]:
                            openapi_schema["paths"][path][method]["security"] = [{"bearerAuth": []}]
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Add this at the end - CRITICAL for running the server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")