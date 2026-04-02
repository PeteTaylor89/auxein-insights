# db/models/notification.py
from __future__ import annotations
import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey,
    JSON, Enum, func, Index, CheckConstraint
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.company import Company
    from db.models.user import User
    from db.models.contractor import Contractor


class NotificationType(str, enum.Enum):
    """Notification category types"""
    task = "task"
    incident = "incident"
    action = "action"
    training = "training"
    visitor = "visitor"
    timesheet = "timesheet"
    system = "system"


class Notification(Base):
    """In-app notifications for users and contractors"""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Recipient - exactly one of these must be set
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    contractor_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("contractors.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )

    # Notification content
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType),
        nullable=False,
        index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Deep-link context (e.g., {"task_id": 123, "site_id": 456})
    data: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)

    # Read status
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True)
