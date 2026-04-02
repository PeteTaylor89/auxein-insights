# api/v1/notifications.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Union, Optional
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.user import User
from db.models.contractor import Contractor
from api.deps import get_current_user_or_contractor
from services.notification_service import NotificationService
from schemas.notification import (
    NotificationResponse,
    NotificationListResponse,
    UnreadCountResponse,
)

router = APIRouter(tags=["notifications"])


def _resolve_context(current_user: Union[User, Contractor], company_id_param: Optional[int] = None):
    """Extract company_id, user_id, contractor_id from auth principal."""
    if isinstance(current_user, Contractor):
        # Contractors: use explicit param or first active company relationship
        cid = company_id_param
        if not cid:
            for rel in getattr(current_user, 'company_relationships', []):
                if getattr(rel, 'is_active', True):
                    cid = rel.company_id
                    break
        if not cid:
            cid = 0  # fallback — will return empty results
        return cid, None, current_user.id
    else:
        return current_user.company_id, current_user.id, None


@router.get("", response_model=NotificationListResponse)
def get_notifications(
    unread_only: bool = Query(False, description="Only return unread notifications"),
    company_id: Optional[int] = Query(None, description="Company context (contractors)"),
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """Get notifications for the current user or contractor."""
    cid, user_id, contractor_id = _resolve_context(current_user, company_id)
    service = NotificationService(db)

    notifications = service.get_notifications(
        company_id=cid, user_id=user_id, contractor_id=contractor_id,
        unread_only=unread_only, limit=100,
    )
    total = service.get_total_count(company_id=cid, user_id=user_id, contractor_id=contractor_id)
    unread_count = service.get_unread_count(company_id=cid, user_id=user_id, contractor_id=contractor_id)

    return NotificationListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """Get the count of unread notifications. Lightweight endpoint for polling."""
    cid, user_id, contractor_id = _resolve_context(current_user, company_id)
    service = NotificationService(db)
    count = service.get_unread_count(company_id=cid, user_id=user_id, contractor_id=contractor_id)
    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """Mark a single notification as read."""
    cid, user_id, contractor_id = _resolve_context(current_user)
    service = NotificationService(db)

    notification = service.mark_as_read(
        notification_id=notification_id,
        company_id=cid, user_id=user_id, contractor_id=contractor_id,
    )
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    db.commit()
    return NotificationResponse.model_validate(notification)


@router.post("/read-all", response_model=dict)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """Mark all unread notifications as read."""
    cid, user_id, contractor_id = _resolve_context(current_user)
    service = NotificationService(db)

    count = service.mark_all_as_read(
        company_id=cid, user_id=user_id, contractor_id=contractor_id,
    )
    db.commit()
    return {"marked_read": count}
