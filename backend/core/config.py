import os
from dotenv import load_dotenv
import secrets
from datetime import timedelta
from typing import Any, Dict, Optional
from pydantic_settings import BaseSettings
from pydantic import EmailStr, validator, Field

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

class Settings(BaseSettings):
    API_V1_STR: str = os.getenv("API_V1_STR", "/api/v1")
    PROJECT_NAME: str = "Vineyard Management App"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    
    # JWT
    # Use the SECRET_KEY from environment variable instead of generating a new one
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 180))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 7))
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    
    # Email Settings
    SMTP_SERVER: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: Optional[str] = None
    FROM_NAME: str = "Auxein Insights"
    
    # Email feature flags
    SEND_EMAILS: bool = False  # Set to True when email is configured
    
    UPLOAD_DIR: str = get_upload_dir()
    
    #VITE API
    VITE_API_URL: str = Field(None, description="Frontend API URL, not used by backend")

    # Frontend URL for email links
    FRONTEND_URL: str = "http://localhost:5173"  

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"

settings = Settings()

# Debug function to check what's loaded
def debug_settings():
    """Debug function to check loaded settings"""
    print("🔧 Loaded Settings:")
    print(f"DATABASE_URL: {settings.DATABASE_URL[:50]}...{settings.DATABASE_URL[-20:] if len(settings.DATABASE_URL) > 70 else settings.DATABASE_URL}")
    print(f"SECRET_KEY: {'***SET***' if settings.SECRET_KEY else 'NOT SET'}")
    print(f"API_V1_STR: {settings.API_V1_STR}")
    print(f"FRONTEND_URL: {settings.FRONTEND_URL}")
    print(f"SMTP_SERVER: {settings.SMTP_SERVER or 'NOT SET'}")
    print(f"SMTP_USERNAME: {settings.SMTP_USERNAME or 'NOT SET'}")
    print(f"SEND_EMAILS: {settings.SEND_EMAILS}")
    
    # Check if still pointing to localhost
    if 'localhost' in settings.DATABASE_URL:
        print("❌ WARNING: Still using localhost database!")
        print("Make sure your .env file is in the correct location")
        return False
    return True

if __name__ == "__main__":
    debug_settings()