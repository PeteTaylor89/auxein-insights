# backend_taste/services/file_storage.py — standalone S3 presign helpers.
# Cannot import backend/services (clean isolation), so this mirrors the relevant
# bits of the main API's file_storage for the Taste photo flow only: presigned PUT
# (upload) + presigned GET (display) + a HEAD existence check. Reuses the shared
# UPLOADS_S3_BUCKET; objects live under the `taste/<user_id>/...` prefix.
from __future__ import annotations

import logging
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)


def is_enabled() -> bool:
    """True when S3 is configured (prod). False in local dev → callers skip."""
    return bool(settings.UPLOADS_S3_BUCKET)


def _client():
    import boto3

    return boto3.client("s3", region_name=settings.UPLOADS_S3_REGION)


def presign_put(s3_key: str, content_type: str, expires_in: int) -> Optional[str]:
    """Presigned PUT URL the client uploads the photo blob to directly."""
    if not is_enabled():
        return None
    try:
        return _client().generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.UPLOADS_S3_BUCKET, "Key": s3_key, "ContentType": content_type},
            ExpiresIn=expires_in,
        )
    except Exception:
        logger.exception("presign_put failed key=%s", s3_key)
        return None


def presign_get(s3_key: str, expires_in: int) -> Optional[str]:
    """Time-limited GET URL for display (private bucket → never a raw URL)."""
    if not is_enabled():
        return None
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.UPLOADS_S3_BUCKET, "Key": s3_key},
            ExpiresIn=expires_in,
        )
    except Exception:
        logger.exception("presign_get failed key=%s", s3_key)
        return None


def object_exists(s3_key: str) -> bool:
    """HEAD check so confirm can reject a key whose upload never landed."""
    if not is_enabled():
        return False
    s3 = _client()
    try:
        s3.head_object(Bucket=settings.UPLOADS_S3_BUCKET, Key=s3_key)
        return True
    except Exception:
        return False
