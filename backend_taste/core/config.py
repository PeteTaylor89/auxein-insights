# backend_taste/core/config.py — lean settings for the isolated Taste service.
# Shares the RDS instance and S3 bucket with the main API, but never imports its
# config (clean isolation). DATABASE_URL is read directly from the env (the EB
# env wires it to the shared RDS); no Secrets Manager coupling.
#
# F1 (2026-09-21): Taste signs its OWN tokens with TASTE_SECRET_KEY. SECRET_KEY
# remains only to validate the legacy Insights token during the cutover window,
# and goes away with it.
import os
from typing import List, Optional

from pathlib import Path
from urllib.parse import quote_plus

from dotenv import dotenv_values, load_dotenv
from pydantic_settings import BaseSettings

# Pinned to backend_taste/.env: a bare load_dotenv() searches from the caller or
# the cwd, and run from the repo root it finds the MAIN API's .env instead.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _database_url() -> str:
    """Pick the database the same way the main API does (backend/core/config.py).

    ENV=local   -> LOCAL_DATABASE_URL (a local Postgres)
    otherwise   -> DATABASE_URL if set (the EB env), else the shared RDS built
                   from RDS_* - which is how a dev box runs against real data
                   with ENV=staging, exactly like Grow and Insights.

    RDS_* is read from the process env first, then from the repo-root .env
    WITHOUT loading it: that file also carries the main API's SECRET_KEY and
    ENV, and pulling those into this process is what the isolation forbids.
    """
    if os.getenv("ENV", "local") == "local":
        return os.getenv("LOCAL_DATABASE_URL") or os.getenv("DATABASE_URL", "")
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    root = dotenv_values(Path(__file__).resolve().parents[2] / ".env")
    rds = {k: os.getenv(k) or root.get(k) for k in
           ("RDS_USER", "RDS_PASSWORD", "RDS_ENDPOINT", "RDS_PORT", "RDS_DATABASE")}
    if not all(rds[k] for k in ("RDS_USER", "RDS_PASSWORD", "RDS_ENDPOINT", "RDS_DATABASE")):
        return ""
    return "postgresql://%s:%s@%s:%s/%s" % (
        quote_plus(rds["RDS_USER"]), quote_plus(rds["RDS_PASSWORD"]), rds["RDS_ENDPOINT"],
        rds["RDS_PORT"] or "5432", rds["RDS_DATABASE"])


class Settings(BaseSettings):
    ENV: str = os.getenv("ENV", "local")

    # Shared RDS (ap-southeast-2), schema `taste`. See _database_url().
    DATABASE_URL: str = _database_url()

    # Taste's OWN signing key. If this were the main API's SECRET_KEY, an
    # Insights token would still forge a Taste session and the separation would
    # be decorative — hence the assertion below, which refuses to boot rather
    # than let that be true quietly.
    TASTE_SECRET_KEY: str = os.getenv("TASTE_SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    # Short, because a suspension should bite within one token lifetime. The
    # long-lived half of the pair is a revocable row in taste.refresh_tokens.
    ACCESS_TOKEN_MINUTES: int = int(os.getenv("TASTE_ACCESS_TOKEN_MINUTES", "60"))
    # Long, because a PWA used at a tasting must not demand a password in a
    # cellar with no signal. Revocable, so length is not a liability.
    REFRESH_TOKEN_DAYS: int = int(os.getenv("TASTE_REFRESH_TOKEN_DAYS", "60"))

    # Still defaults FALSE even though the mailer now exists (services/email.py).
    # Turning this on is a one-way door for anyone who does not receive the mail,
    # so it flips only after a real send has been confirmed from the deployed
    # environment — not on the strength of the code existing.
    REQUIRE_VERIFIED_EMAIL: bool = os.getenv("TASTE_REQUIRE_VERIFIED_EMAIL", "false").lower() == "true"

    # --- Email ---------------------------------------------------------------
    # SMTP, matching the main API's UnifiedEmailService: the same variable names,
    # so the credentials and verified sender already deployed on Elastic
    # Beanstalk work here unchanged. NOT SES — the house pattern is SMTP, and a
    # second sending identity would be a second deliverability reputation to
    # keep clean for no benefit.
    #
    # Sharing the transport is not the coupling this service avoids: nothing is
    # imported from the main API and no request is made to it. Only credentials
    # are common, exactly as two apps sharing an RDS instance is not a shared
    # database schema.
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: Optional[str] = os.getenv("SMTP_USERNAME")
    SMTP_PASSWORD: Optional[str] = os.getenv("SMTP_PASSWORD")
    FROM_EMAIL: Optional[str] = os.getenv("FROM_EMAIL") or os.getenv("SMTP_USERNAME")
    FROM_NAME: str = os.getenv("FROM_NAME", "Auxein Taste")
    # The kill switch, default off, same name and default as the main service.
    # With it off nothing is sent and the message is logged instead, which is
    # what makes local development safe by default.
    SEND_EMAILS: bool = os.getenv("SEND_EMAILS", "false").lower() == "true"
    # A hung SMTP connection inside a request handler is a hung registration.
    SMTP_TIMEOUT_SECONDS: int = int(os.getenv("SMTP_TIMEOUT_SECONDS", "10"))

    # Where the links in those emails point: the Taste SPA, which owns /verify
    # and /reset.
    APP_URL: str = os.getenv("TASTE_APP_URL", "http://localhost:5175")

    # Cutover only. While true, core/auth.py also accepts an Insights
    # `public_access` token and resolves it via users.external_auth_id. Flip to
    # false once the SPA signs in against Taste, then delete the branch and
    # SECRET_KEY with it. Defaults to FALSE: the insecure-but-convenient mode
    # has to be asked for out loud.
    ACCEPT_LEGACY_INSIGHTS_TOKEN: bool = os.getenv("TASTE_ACCEPT_LEGACY_TOKEN", "false").lower() == "true"
    # Only read while ACCEPT_LEGACY_INSIGHTS_TOKEN is on.
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")

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

# Fail at import, not at first login. A Taste service running on the main API's
# key is not "separate auth with a small caveat" — it is Insights auth wearing a
# different hostname, and the failure is silent and total.
if settings.ENV != "local":
    if not settings.TASTE_SECRET_KEY:
        raise RuntimeError("TASTE_SECRET_KEY is not set — Taste cannot sign its own tokens")
    if settings.SECRET_KEY and settings.TASTE_SECRET_KEY == settings.SECRET_KEY:
        raise RuntimeError("TASTE_SECRET_KEY must not equal the main API SECRET_KEY")
