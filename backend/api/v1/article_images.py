# api/v1/article_images.py - Admin image upload for articles (S3 + local fallback)
import os
import uuid
from datetime import datetime
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import Image

from core.admin_security import require_admin
from core.config import settings
from db.models.public_user import PublicUser

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _get_s3_client():
    """Lazily create S3 client (only when S3 is configured)."""
    import boto3
    return boto3.client("s3", region_name=settings.AWS_REGION)


def _process_image(img: Image.Image, max_width: int) -> Image.Image:
    """Resize to max_width maintaining aspect ratio, convert to RGB for WebP."""
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGBA")
        background = Image.new("RGBA", img.size, (255, 255, 255, 255))
        background.paste(img, mask=img.split()[3])
        img = background.convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    if img.width > max_width:
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), Image.LANCZOS)
    return img


def _center_crop(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Center-crop to exact dimensions."""
    img_ratio = img.width / img.height
    target_ratio = target_w / target_h

    if img_ratio > target_ratio:
        new_w = int(img.height * target_ratio)
        left = (img.width - new_w) // 2
        img = img.crop((left, 0, left + new_w, img.height))
    else:
        new_h = int(img.width / target_ratio)
        top = (img.height - new_h) // 2
        img = img.crop((0, top, img.width, top + new_h))

    return img.resize((target_w, target_h), Image.LANCZOS)


def _save_to_webp(img: Image.Image, quality: int = 85) -> BytesIO:
    """Save image to a BytesIO buffer as WebP."""
    buf = BytesIO()
    img.save(buf, "WEBP", quality=quality)
    buf.seek(0)
    return buf


def _upload_to_s3(buf: BytesIO, s3_key: str) -> str:
    """Upload buffer to S3 and return the CDN URL."""
    cdn_url = (settings.ARTICLE_IMAGES_CDN_URL or "").rstrip("/")
    if not cdn_url:
        raise HTTPException(500, "ARTICLE_IMAGES_CDN_URL is not configured")
    s3 = _get_s3_client()
    s3.put_object(
        Bucket=settings.ARTICLE_IMAGES_S3_BUCKET,
        Key=s3_key,
        Body=buf.read(),
        ContentType="image/webp",
        CacheControl="public, max-age=31536000",
    )
    return f"{cdn_url}/{s3_key}"


def _save_local(buf: BytesIO, rel_path: str) -> str:
    """Save buffer to local disk and return the URL path."""
    full_path = os.path.join("uploads", rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(buf.read())
    return f"/uploads/{rel_path}"


def _save_image(img: Image.Image, s3_key: str, quality: int = 85) -> str:
    """Save processed image to S3 (production) or local disk (dev)."""
    buf = _save_to_webp(img, quality)
    if settings.ARTICLE_IMAGES_S3_BUCKET:
        return _upload_to_s3(buf, s3_key)
    return _save_local(buf, s3_key)


@router.post("/admin/articles/images")
async def upload_article_image(
    file: UploadFile = File(...),
    purpose: str = Query(..., regex="^(inline|featured|og)$"),
    _admin: PublicUser = Depends(require_admin),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "File type not allowed. Accepted: JPEG, PNG, WebP, GIF")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large. Maximum size: 10 MB")

    try:
        img = Image.open(BytesIO(data))
        img.load()
    except Exception:
        raise HTTPException(400, "Invalid image file")

    now = datetime.utcnow()
    subdir = f"articles/{now.year}/{now.month:02d}"
    file_id = uuid.uuid4().hex[:12]
    result = {}

    if purpose == "inline":
        processed = _process_image(img, max_width=1200)
        result["url"] = _save_image(processed, f"{subdir}/{file_id}.webp")

    elif purpose == "featured":
        # Main image
        processed = _process_image(img, max_width=1600)
        result["url"] = _save_image(processed, f"{subdir}/{file_id}.webp")

        # Thumbnail (400x260 center-crop)
        thumb = _process_image(img, max_width=800)
        thumb = _center_crop(thumb, 400, 260)
        result["thumbnail_url"] = _save_image(thumb, f"{subdir}/{file_id}_thumb.webp", quality=80)

    elif purpose == "og":
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")
        processed = _center_crop(img, 1200, 630)
        result["url"] = _save_image(processed, f"{subdir}/{file_id}.webp")

    return result
