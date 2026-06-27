# Photo upload lifecycle (dev-plan §6, P9). The PWA keeps the blob locally and,
# on sync, asks for a presigned PUT, uploads straight to S3, then confirms. Objects
# are scoped to the user via a `taste/<user_id>/...` key prefix — every call checks
# the key belongs to the caller before signing it.
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.auth import get_current_taste_user
from core.config import settings
from services import file_storage

router = APIRouter()

_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/gif": ".gif",
}


def _user_prefix(user_id: int) -> str:
    return f"taste/{user_id}/"


class PresignIn(BaseModel):
    note_id: str
    photo_id: Optional[str] = None  # client photo UUID → idempotent key
    content_type: str = "image/jpeg"


@router.post("/photos/presign")
def presign(body: PresignIn, user_id: int = Depends(get_current_taste_user)):
    if not file_storage.is_enabled():
        raise HTTPException(status_code=503, detail="Photo storage is not configured")
    ext = _EXT.get(body.content_type.lower().strip(), "")
    pid = body.photo_id or str(uuid4())
    s3_key = f"{_user_prefix(user_id)}{body.note_id}/{pid}{ext}"
    url = file_storage.presign_put(s3_key, body.content_type, settings.UPLOADS_PRESIGNED_URL_TTL_SECONDS)
    if not url:
        raise HTTPException(status_code=503, detail="Could not presign upload")
    return {"s3_key": s3_key, "upload_url": url}


class ConfirmIn(BaseModel):
    s3_key: str


@router.post("/photos/confirm")
def confirm(body: ConfirmIn, user_id: int = Depends(get_current_taste_user)):
    if not body.s3_key.startswith(_user_prefix(user_id)):
        raise HTTPException(status_code=403, detail="Not your object")
    if file_storage.is_enabled() and not file_storage.object_exists(body.s3_key):
        raise HTTPException(status_code=404, detail="Upload not found in storage")
    view = file_storage.presign_get(body.s3_key, settings.UPLOADS_PRESIGNED_URL_TTL_SECONDS)
    return {"view_url": view}


@router.get("/photos/view")
def view(key: str = Query(...), user_id: int = Depends(get_current_taste_user)):
    """Presigned GET for display — used cross-device when the local blob is absent."""
    if not key.startswith(_user_prefix(user_id)):
        raise HTTPException(status_code=403, detail="Not your object")
    return {"view_url": file_storage.presign_get(key, settings.UPLOADS_PRESIGNED_URL_TTL_SECONDS)}
