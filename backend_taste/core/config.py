# backend_taste/core/config.py — lean settings for the isolated Taste service.
# Shares the RDS instance, S3 bucket and JWT SECRET_KEY with the main API, but
# never imports its config (clean isolation). DATABASE_URL is read directly from
# the env (the EB env wires it to the shared RDS); no Secrets Manager coupling.
import os
from typing import List, Optional

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    ENV: str = os.getenv("ENV", "local")

    # Shared RDS (ap-southeast-2), schema `taste`. Local dev uses LOCAL_DATABASE_URL.
    DATABASE_URL: str = os.getenv("LOCAL_DATABASE_URL") or os.getenv("DATABASE_URL", "")

    # MUST match the main API so the existing public JWT validates.
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")

    # S3 (presigned photo upload, P9). Reuses the main API's uploads bucket.
    UPLOADS_S3_BUCKET: Optional[str] = os.getenv("UPLOADS_S3_BUCKET")
    UPLOADS_S3_REGION: str = os.getenv("UPLOADS_S3_REGION", os.getenv("AWS_REGION", "ap-southeast-2"))
    UPLOADS_PRESIGNED_URL_TTL_SECONDS: int = int(os.getenv("UPLOADS_PRESIGNED_URL_TTL_SECONDS", "900"))

    # Taste's OWN CORS allow-list (never reuse the Grow/Insights one).
    CORS_ORIGINS: List[str] = [
        "https://taste.auxein.co.nz",
        "http://localhost:5175",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"


settings = Settings()
