# api/v1/feedback.py — In-app feedback / bug / idea submission
import logging
from typing import Optional, List
from fastapi import (
    APIRouter, Depends, HTTPException, Request, status,
    File, Form, UploadFile,
)
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.company import Company
from services.email_service import email_service

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_CATEGORIES = {"bug", "feedback", "idea", "other"}
MAX_FILES = 3
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_PREFIXES = ("image/",)


def _display_name(user: User) -> str:
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    if first and last:
        return f"{first} {last}"
    if first:
        return first
    return (user.email or "Unknown").split("@")[0].replace(".", " ").title()


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def submit_feedback(
    request: Request,
    category: str = Form("feedback"),
    subject: str = Form(...),
    message: str = Form(...),
    page_url: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Forward in-app feedback to the product inbox (grow@auxein.co.nz).

    Multipart form so screenshots can be attached. Up to 3 image files,
    5 MB each.
    """
    # Validate category
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")

    # Trim + length-validate text fields here too (Form() doesn't enforce
    # min/max length the way pydantic does).
    subject = (subject or "").strip()
    message = (message or "").strip()
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Subject and message are required")
    if len(subject) > 140:
        raise HTTPException(status_code=400, detail="Subject too long (max 140)")
    if len(message) > 5000:
        raise HTTPException(status_code=400, detail="Message too long (max 5000)")

    # Read and validate attachments
    files = attachments or []
    files = [f for f in files if f and f.filename]
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many attachments (max {MAX_FILES})",
        )

    email_attachments = []
    for f in files:
        ctype = (f.content_type or "").lower()
        if not any(ctype.startswith(p) for p in ALLOWED_PREFIXES):
            raise HTTPException(
                status_code=400,
                detail=f"Attachment '{f.filename}' is not an image",
            )
        content = await f.read()
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Attachment '{f.filename}' exceeds 5 MB limit",
            )
        if not content:
            continue
        email_attachments.append({
            "filename": f.filename,
            "content": content,
            "content_type": ctype or "application/octet-stream",
        })

    # Enrich with user/company context
    company_name: Optional[str] = None
    if current_user.company_id:
        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        company_name = company.name if company else None
    user_agent = request.headers.get("user-agent")

    ok = email_service.send_feedback_email(
        category=category,
        subject_text=subject,
        message=message,
        from_user_email=current_user.email,
        from_user_name=_display_name(current_user),
        company_name=company_name,
        page_url=page_url,
        user_agent=user_agent,
        attachments=email_attachments or None,
    )

    if not ok:
        logger.error("Feedback email failed for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send feedback right now. Try again shortly.",
        )

    return {"ok": True, "attachments": len(email_attachments)}
