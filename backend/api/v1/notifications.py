# api/v1/notifications.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Union
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

def _get_recipient_info(current_user: Union[User, Contractor]) -> tuple:
    """Extract recipient type and IDs from current user/contractor"""
    if isinstance(current_user, Contractor):
        return "contractor", None, current_user.id
    else:
        return "user", current_user.id, None


@router.get("", response_model=NotificationListResponse)
def get_notifications(
    unread_only: bool = Query(False, description="Only return unread notifications"),
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """
    Get notifications for the current user or contractor.
    Returns the 100 most recent notifications, sorted by created_at descending.
    """
    recipient_type, user_id, contractor_id = _get_recipient_info(current_user)

    # Get company_id - contractors don't have company_id directly,
    # so we need to handle this differently
    if isinstance(current_user, Contractor):
        # For contractors, we need to get company context from somewhere
        # For now, return empty if no company context
        # This could be enhanced with a company_id query param or header
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contractor notifications require company context. Use /notifications?company_id=X"
        )

    company_id = current_user.company_id
    service = NotificationService(db)

    notifications = service.get_notifications(
        company_id=company_id,
        user_id=user_id,
        contractor_id=contractor_id,
        unread_only=unread_only,
        limit=100,
    )

    total = service.get_total_count(
        company_id=company_id,
        user_id=user_id,
        contractor_id=contractor_id,
    )

    unread_count = service.get_unread_count(
        company_id=company_id,
        user_id=user_id,
        contractor_id=contractor_id,
    )

    return NotificationListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """
    Get the count of unread notifications.
    Use this for badge displays - lightweight endpoint for polling.
    """
    recipient_type, user_id, contractor_id = _get_recipient_info(current_user)

    if isinstance(current_user, Contractor):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contractor notifications require company context"
        )

    company_id = current_user.company_id
    service = NotificationService(db)

    count = service.get_unread_count(
        company_id=company_id,
        user_id=user_id,
        contractor_id=contractor_id,
    )

    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """
    Mark a single notification as read.
    """
    recipient_type, user_id, contractor_id = _get_recipient_info(current_user)

    if isinstance(current_user, Contractor):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contractor notifications require company context"
        )

    company_id = current_user.company_id
    service = NotificationService(db)

    notification = service.mark_as_read(
        notification_id=notification_id,
        company_id=company_id,
        user_id=user_id,
        contractor_id=contractor_id,
    )

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    db.commit()
    return NotificationResponse.model_validate(notification)


@router.post("/read-all", response_model=dict)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """
    Mark all unread notifications as read.
    Returns the count of notifications that were marked as read.
    """
    recipient_type, user_id, contractor_id = _get_recipient_info(current_user)

    if isinstance(current_user, Contractor):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contractor notifications require company context"
        )

    company_id = current_user.company_id
    service = NotificationService(db)

    count = service.mark_all_as_read(
        company_id=company_id,
        user_id=user_id,
        contractor_id=contractor_id,
    )

    db.commit()
    return {"marked_read": count}

