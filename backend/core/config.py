import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import secrets
from datetime import timedelta
from typing import Any, Dict, Optional
from pydantic_settings import BaseSettings
from pydantic import EmailStr, validator, Field

# Add backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables from .env file
load_dotenv()

def get_upload_dir():
    """Get upload directory path relative to project root"""
    upload_dir = os.getenv("UPLOAD_DIR", "uploads")
    
    if os.path.isabs(upload_dir):
        return upload_dir
    
    config_dir = os.path.dirname(os.path.abspath(__file__))
    
    backend_dir = os.path.dirname(config_dir)  
    project_root = os.path.dirname(backend_dir)  
    
    return os.path.join(project_root, upload_dir)

def get_database_url():
    """
    Get database URL based on environment setting
    Priority:
    1. ENV=local -> LOCAL_DATABASE_URL
    2. ENV=staging/production -> Secrets Manager (preferred) or fallback to env vars
    3. Fallback -> DATABASE_URL
    """
    env = os.getenv('ENV', 'local')
    
    if env == 'local':
        # Use local database for development
        database_url = os.getenv('LOCAL_DATABASE_URL') or os.getenv('DATABASE_URL')
        if database_url:
            print(" Using LOCAL database")
        return database_url
    
    elif env in ['staging', 'production']:
        # PRIORITY 1: Try AWS Secrets Manager
        secret_name = os.getenv('RDS_SECRET_NAME')
        
        if secret_name:
            try:
                print(f"[DEBUG] Attempting import from utils.aws_secrets...")
                import sys
                print(f"[DEBUG] Python path: {sys.path[:3]}")
                from utils.aws_secrets import get_rds_credentials
                print(f"[DEBUG] Import successful!")

                from utils.aws_secrets import get_rds_credentials
                
                print(f"  Retrieving RDS credentials from Secrets Manager (ENV={env})...")
                creds = get_rds_credentials()
                
                # Use credentials from Secrets Manager (overrides env vars)
                database_url = (
                    f"postgresql://{creds['username']}:{creds['password']}"
                    f"@{creds['host']}:{creds['port']}/{creds['dbname']}"
                )
                print(f" Using RDS database via Secrets Manager")
                return database_url
                
            except ImportError as e:
                print(f"  aws_secrets utility not found: {e}")
                print("   Falling back to env variables")
                import traceback
                traceback.print_exc()
            except Exception as e:
                print(f"  Failed to retrieve from Secrets Manager: {e}")
                print("   Falling back to environment variables")
        else:
            print("  RDS_SECRET_NAME not set, trying environment variables")
        
        # PRIORITY 2 (FALLBACK): Construct from individual RDS env variables
        rds_user = os.getenv('RDS_USER')
        rds_password = os.getenv('RDS_PASSWORD')
        rds_endpoint = os.getenv('RDS_ENDPOINT')
        rds_port = os.getenv('RDS_PORT', '5432')
        rds_database = os.getenv('RDS_DATABASE')
        
        if all([rds_user, rds_password, rds_endpoint, rds_database]):
            database_url = f"postgresql://{rds_user}:{rds_password}@{rds_endpoint}:{rds_port}/{rds_database}"
            print(f"  Using RDS database from environment variables (ENV={env})")
            return database_url
        else:
            print(f" RDS credentials incomplete for ENV={env}")
            print("   Need either RDS_SECRET_NAME or (RDS_USER + RDS_PASSWORD + RDS_ENDPOINT)")
            return os.getenv('DATABASE_URL')
    
    else:
        # Unknown environment, use default
        print(f"  Unknown ENV={env}, using DATABASE_URL")
        return os.getenv('DATABASE_URL')


class Settings(BaseSettings):
    API_V1_STR: str = os.getenv("API_V1_STR", "/api/v1")
    PROJECT_NAME: str = "Vineyard Management App"
    
    # Environment
    ENV: str = os.getenv("ENV", "local")  # local, staging, production
    
    # Database - dynamically determined based on ENV
    DATABASE_URL: str = Field(default_factory=get_database_url)
    LOCAL_DATABASE_URL: Optional[str] = os.getenv("LOCAL_DATABASE_URL")
    
    # AWS RDS Settings
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-southeast-2")
    RDS_SECRET_NAME: Optional[str] = os.getenv("RDS_SECRET_NAME")
    RDS_ENDPOINT: Optional[str] = os.getenv("RDS_ENDPOINT")
    RDS_PORT: int = int(os.getenv("RDS_PORT", "5432"))
    RDS_USER: str = os.getenv("RDS_USER", "postgres")
    RDS_DATABASE: str = os.getenv("RDS_DATABASE", "auxein_db")
    RDS_PASSWORD: Optional[str] = os.getenv("RDS_PASSWORD")  # Fallback if not using Secrets Manager
    
    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "180"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")

    @validator("SECRET_KEY", always=True)
    def secret_key_must_be_set(cls, v):
        if not v:
            raise ValueError("SECRET_KEY environment variable is required but not set")
        return v
    
    # Email Settings
    SMTP_SERVER: Optional[str] = os.getenv("SMTP_SERVER")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: Optional[str] = os.getenv("SMTP_USERNAME")
    SMTP_PASSWORD: Optional[str] = os.getenv("SMTP_PASSWORD")
    FROM_EMAIL: Optional[str] = os.getenv("FROM_EMAIL")
    FROM_NAME: str = os.getenv("FROM_NAME", "Auxein Insights")
    
    # Email feature flags
    SEND_EMAILS: bool = os.getenv("SEND_EMAILS", "false").lower() == "true"
    
    UPLOAD_DIR: str = get_upload_dir()

    # S3 Image Storage
    ARTICLE_IMAGES_S3_BUCKET: Optional[str] = os.getenv("ARTICLE_IMAGES_S3_BUCKET")
    ARTICLE_IMAGES_CDN_URL: Optional[str] = os.getenv("ARTICLE_IMAGES_CDN_URL")

    # S3 user uploads (private bucket, IAM-only access via EB instance role).
    # When UPLOADS_S3_BUCKET is unset (e.g. local dev), files.py falls back to
    # local UPLOAD_DIR storage. In prod the EB env has these wired.
    UPLOADS_S3_BUCKET: Optional[str] = os.getenv("UPLOADS_S3_BUCKET")
    UPLOADS_S3_REGION: str = os.getenv("UPLOADS_S3_REGION", os.getenv("AWS_REGION", "ap-southeast-2"))
    UPLOADS_PRESIGNED_URL_TTL_SECONDS: int = int(os.getenv("UPLOADS_PRESIGNED_URL_TTL_SECONDS", "900"))

    # VITE API
    VITE_API_URL: Optional[str] = Field(None, description="Frontend API URL")

    # Public-facing API base URL (for email links, unsubscribe, etc.)
    # Falls back to VITE_API_URL if not set separately
    API_BASE_URL: Optional[str] = None

    # Legacy single FRONTEND_URL — kept for backward compatibility with anything
    # not yet routed through the brand abstraction (core/branding.py). New code
    # should use Brand.frontend_url instead.
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Per-brand frontend URLs and support emails. These drive the brand-aware
    # email templates in core/email_utils.py + core/email_templates.py and the
    # SEO prerender in utils/seo_prerender.py. Default values target local dev
    # ports so tests work; EB has the prod values wired:
    #   GROW_FRONTEND_URL=https://grow.auxein.co.nz
    #   GROW_SUPPORT_EMAIL=grow@auxein.co.nz
    #   INSIGHTS_FRONTEND_URL=https://insights.auxein.co.nz
    #   INSIGHTS_SUPPORT_EMAIL=insights@auxein.co.nz
    GROW_FRONTEND_URL: str = os.getenv("GROW_FRONTEND_URL", "http://localhost:5173")
    GROW_SUPPORT_EMAIL: str = os.getenv("GROW_SUPPORT_EMAIL", "grow@auxein.co.nz")
    INSIGHTS_FRONTEND_URL: str = os.getenv("INSIGHTS_FRONTEND_URL", "http://localhost:5174")
    INSIGHTS_SUPPORT_EMAIL: str = os.getenv("INSIGHTS_SUPPORT_EMAIL", "insights@auxein.co.nz")

    @property
    def api_base_url(self) -> str:
        """Public-facing API base URL, always includes /api/v1 prefix."""
        base = (self.API_BASE_URL or self.VITE_API_URL or "http://localhost:8000").rstrip("/")
        if not base.endswith("/api/v1"):
            base = f"{base}/api/v1"
        return base

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"

settings = Settings()

# Debug function to check what's loaded
def debug_settings():
    """Debug function to check loaded settings"""
    print("=" * 60)
    print(" Loaded Settings")
    print("=" * 60)
    
    # Environment
    print(f"ENV: {settings.ENV}")
    print()
    
    # Database
    db_url = settings.DATABASE_URL
    if db_url:
        # Mask password for security
        if '@' in db_url:
            prefix, suffix = db_url.split('@')
            if ':' in prefix:
                user_part = prefix.split(':')[0]
                masked = f"{user_part}:****@{suffix}"
            else:
                masked = db_url
        else:
            masked = db_url
        print(f"DATABASE_URL: {masked}")
    else:
        print("DATABASE_URL: NOT SET ")
    
    if settings.LOCAL_DATABASE_URL:
        print(f"LOCAL_DATABASE_URL: configured ")
    
    if settings.ENV in ['staging', 'production']:
        print(f"RDS_ENDPOINT: {settings.RDS_ENDPOINT or 'NOT SET'}")
        print(f"RDS_DATABASE: {settings.RDS_DATABASE}")
        print(f"RDS_USER: {settings.RDS_USER}")
        print(f"RDS_SECRET_NAME: {settings.RDS_SECRET_NAME or 'NOT SET'}")
        print(f"RDS_PASSWORD: {'***SET***' if settings.RDS_PASSWORD else 'NOT SET (will use Secrets Manager)'}")
    
    print()
    
    # API & Frontend
    print(f"API_V1_STR: {settings.API_V1_STR}")
    print(f"FRONTEND_URL: {settings.FRONTEND_URL}")
    print()
    
    # JWT
    print(f"SECRET_KEY: {'***SET***' if settings.SECRET_KEY else 'NOT SET ❌'}")
    print(f"ALGORITHM: {settings.ALGORITHM}")
    print(f"ACCESS_TOKEN_EXPIRE: {settings.ACCESS_TOKEN_EXPIRE_MINUTES} minutes")
    print()
    
    # Email
    print(f"SMTP_SERVER: {settings.SMTP_SERVER or 'NOT SET'}")
    print(f"SMTP_USERNAME: {settings.SMTP_USERNAME or 'NOT SET'}")
    print(f"SMTP_PASSWORD: {'***SET***' if settings.SMTP_PASSWORD else 'NOT SET'}")
    print(f"FROM_EMAIL: {settings.FROM_EMAIL or 'NOT SET'}")
    print(f"SEND_EMAILS: {settings.SEND_EMAILS}")
    print()
    
    # Uploads
    print(f"UPLOAD_DIR: {settings.UPLOAD_DIR}")
    print()
    
    # Validation
    issues = []
    
    if not settings.DATABASE_URL:
        issues.append(" DATABASE_URL not configured")
    elif settings.ENV == 'local' and 'localhost' not in settings.DATABASE_URL:
        issues.append("  ENV=local but DATABASE_URL doesn't point to localhost")
    elif settings.ENV in ['staging', 'production'] and 'localhost' in settings.DATABASE_URL:
        issues.append(f" ENV={settings.ENV} but DATABASE_URL points to localhost!")
    
    if not settings.SECRET_KEY:
        issues.append(" SECRET_KEY not set - JWT won't work")
    
    if settings.SEND_EMAILS and not all([settings.SMTP_SERVER, settings.SMTP_USERNAME, settings.SMTP_PASSWORD]):
        issues.append("  SEND_EMAILS=true but SMTP credentials incomplete")
    
    if issues:
        print("Issues Found:")
        for issue in issues:
            print(f"  {issue}")
        print()
        return False
    else:
        print(" All settings validated successfully!")
        print()
        return True

if __name__ == "__main__":
    debug_settings()