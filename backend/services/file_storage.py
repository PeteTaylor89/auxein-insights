"""S3-backed file storage for user uploads.

Wraps boto3 so `files.py` can stay agnostic to the storage backend.
Pattern mirrors `backend/api/v1/article_images.py::_get_s3_client`.

Local-dev fallback: when `settings.UPLOADS_S3_BUCKET` is unset, the storage
backend is considered disabled. Callers should handle this by writing to
local disk (`UPLOAD_DIR`) instead — that path is preserved in `files.py`
for legacy reads and dev parity.

Security note: the bucket is private. The EB instance role
(`aws-elasticbeanstalk-ec2-role`) carries the `AuxeinUploadsRW` policy that
grants PutObject/GetObject/DeleteObject/ListBucket on the bucket only.
Clients never receive credentials or direct S3 URLs — downloads are streamed
through the backend so per-request auth checks stay in one place.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import BinaryIO, Iterator, Optional

from core.config import settings

logger = logging.getLogger(__name__)


class FileStorageNotConfigured(RuntimeError):
    """Raised when an S3 operation is attempted but UPLOADS_S3_BUCKET is unset."""


def is_enabled() -> bool:
    """True when S3 uploads are configured (prod). False in local dev."""
    return bool(settings.UPLOADS_S3_BUCKET)


def _get_s3_client():
    """Lazy boto3 client. Imported inside the function so test environments
    without boto3 don't break at import time."""
    import boto3
    return boto3.client("s3", region_name=settings.UPLOADS_S3_REGION)


def make_s3_key(company_id: int, entity_type: str, stored_filename: str, on_date: Optional[date] = None) -> str:
    """Build the S3 key for a new upload.

    Layout matches the legacy local-disk layout for symmetry:
        {company_id}/{entity_type}/{YYYY}/{MM}/{stored_filename}
    `stored_filename` already carries entity-id + date + UUID for uniqueness.
    """
    today = on_date or date.today()
    return f"{company_id}/{entity_type}/{today.year}/{today.month:02d}/{stored_filename}"


def upload_fileobj(file_obj: BinaryIO, s3_key: str, content_type: Optional[str] = None) -> None:
    """Stream a file-like object into S3.

    Uses upload_fileobj (multipart-aware) so large files don't spike memory.
    Raises FileStorageNotConfigured if S3 isn't configured — caller decides
    whether to fall back to local disk.
    """
    if not is_enabled():
        raise FileStorageNotConfigured("UPLOADS_S3_BUCKET is not set")

    s3 = _get_s3_client()
    extra_args: dict = {}
    if content_type:
        extra_args["ContentType"] = content_type

    try:
        s3.upload_fileobj(
            Fileobj=file_obj,
            Bucket=settings.UPLOADS_S3_BUCKET,
            Key=s3_key,
            ExtraArgs=extra_args or None,
        )
    except Exception:
        logger.exception("S3 upload_fileobj failed for key=%s", s3_key)
        raise


def stream_object(s3_key: str, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
    """Yield bytes from an S3 object for streaming back to a client.

    Designed to be passed straight into FastAPI's StreamingResponse. The S3
    StreamingBody is iterable but yields one TCP chunk at a time, which is
    fine — we re-chunk only to bound peak memory when content is small.
    """
    if not is_enabled():
        raise FileStorageNotConfigured("UPLOADS_S3_BUCKET is not set")

    s3 = _get_s3_client()
    obj = s3.get_object(Bucket=settings.UPLOADS_S3_BUCKET, Key=s3_key)
    body = obj["Body"]
    try:
        while True:
            chunk = body.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        body.close()


def delete_object(s3_key: str) -> None:
    """Delete an object from S3. No-op if the bucket is unconfigured."""
    if not is_enabled():
        return
    try:
        _get_s3_client().delete_object(Bucket=settings.UPLOADS_S3_BUCKET, Key=s3_key)
    except Exception:
        logger.exception("S3 delete_object failed for key=%s", s3_key)
        raise


def generate_presigned_url(s3_key: str, expires_in: int = 3600) -> Optional[str]:
    """Return a time-limited public URL for the object, or None if S3 isn't
    configured (dev). Default expiry is 1 hour — fine for avatar display where
    the page refetches the profile (and thus the URL) on every load."""
    if not is_enabled():
        return None
    try:
        return _get_s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.UPLOADS_S3_BUCKET, "Key": s3_key},
            ExpiresIn=expires_in,
        )
    except Exception:
        logger.exception("S3 generate_presigned_url failed for key=%s", s3_key)
        return None


def head_object(s3_key: str) -> Optional[dict]:
    """Return S3 HEAD metadata for the object, or None if it doesn't exist.

    Useful for the download path to surface a clean 404 instead of a 500
    when an object's been deleted out-of-band.
    """
    if not is_enabled():
        return None
    s3 = _get_s3_client()
    try:
        return s3.head_object(Bucket=settings.UPLOADS_S3_BUCKET, Key=s3_key)
    except s3.exceptions.ClientError as e:
        # 404 from S3 = NoSuchKey. Anything else is a real error worth surfacing.
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            return None
        raise
