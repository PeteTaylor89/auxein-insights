# db/models/task_assignment.py
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Numeric, 
    func, UniqueConstraint, Index, Boolean
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.task import Task
    from db.models.user import User


class TaskAssignment(Base):
    """Assignment of users to tasks"""
    __tablename__ = "task_assignments"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Assignment details
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    assigned_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Role in task
    role: Mapped[str] = mapped_column(String(50), default="assignee", nullable=False)  # assignee, lead, helper
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # Primary person responsible
    
    # Acceptance tracking
    status: Mapped[str] = mapped_column(String(20), default="assigned", nullable=False, index=True)  # assigned, accepted, declined, completed
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    declined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decline_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Time allocation
    estimated_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    actual_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)  # Calculated from timesheet
    
    # Notifications
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_user_assignment"),
        Index("ix_task_assignment_user_status", "user_id", "status"),
    )
    
    # Relationships
    task = relationship("Task", back_populates="assignments")
    user = relationship("User", foreign_keys=[user_id], back_populates="task_assignments")
    assigner = relationship("User", foreign_keys=[assigned_by])
    
    def __repr__(self):
        return f"<TaskAssignment(task_id={self.task_id}, user_id={self.user_id}, role='{self.role}')>"
    
    @property
    def is_accepted(self) -> bool:
        """Check if assignment is accepted"""
        return self.status == "accepted"
    
    @property
    def is_pending(self) -> bool:
        """Check if assignment is pending acceptance"""
        return self.status == "assigned"