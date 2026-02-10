# schemas/notification.py
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


class NotificationType(str, Enum):
    """Notification category types"""
    task = "task"
    incident = "incident"
    action = "action"
    training = "training"
    visitor = "visitor"
    timesheet = "timesheet"
    system = "system"


# ============================================
# Response Schemas
# ============================================

class NotificationResponse(BaseModel):
    """Single notification response"""
    id: int
    type: NotificationType
    title: str
    body: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    read: bool
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """Paginated notification list response"""
    notifications: List[NotificationResponse]
    total: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    """Unread notification count response"""
    count: int


# ============================================
# Request Schemas
# ============================================

class NotificationMarkRead(BaseModel):
    """Mark notification as read"""
    pass  # No body needed, ID comes from path


class NotificationMarkAllRead(BaseModel):
    """Mark all notifications as read"""
    pass  # No body needed


# ============================================
# Internal/Service Schemas
# ============================================

class NotificationCreate(BaseModel):
    """Internal schema for creating notifications via service"""
    company_id: int
    user_id: Optional[int] = None
    contractor_id: Optional[int] = None
    type: NotificationType
    title: str = Field(..., max_length=255)
    body: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

    def model_post_init(self, __context) -> None:
        """Validate exactly one recipient is set"""
        if self.user_id is None and self.contractor_id is None:
            raise ValueError("Either user_id or contractor_id must be provided")
        if self.user_id is not None and self.contractor_id is not None:
            raise ValueError("Only one of user_id or contractor_id can be provided")