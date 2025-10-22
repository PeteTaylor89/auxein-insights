# db/models/task_row.py
from __future__ import annotations
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, 
    func, UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.task import Task
    from db.models.vineyard_row import VineyardRow
    from db.models.block import VineyardBlock
    from db.models.user import User


class TaskRow(Base):
    """Row-level work tracking for vineyard tasks"""
    __tablename__ = "task_rows"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Row identification
    vineyard_row_id: Mapped[Optional[int]] = mapped_column(
        Integer, 
        ForeignKey("vineyard_rows.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    row_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # Fallback if no vineyard_row_id
    block_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vineyard_blocks.id", ondelete="SET NULL"), nullable=True)
    
    # Completion tracking
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)  # pending, in_progress, completed, skipped
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Work details
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Progress
    percentage_complete: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # For partial row completion
    
    # Quality & notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issues_found: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quality_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1-5
    
    # Skipped rows
    skip_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # "Too wet", "Already done", etc.
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        UniqueConstraint("task_id", "vineyard_row_id", name="uq_task_vineyard_row"),
        CheckConstraint("percentage_complete >= 0 AND percentage_complete <= 100", name="ck_task_row_percentage_range"),
        CheckConstraint("quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)", name="ck_task_row_quality_range"),
        Index("ix_task_row_task_status", "task_id", "status"),
    )
    
    # Relationships
    task = relationship("Task", back_populates="task_rows")
    vineyard_row = relationship("VineyardRow", back_populates="task_rows")
    block = relationship("VineyardBlock")
    completed_by_user = relationship("User")
    
    def __repr__(self):
        row_identifier = f"row_id={self.vineyard_row_id}" if self.vineyard_row_id else f"row_number='{self.row_number}'"
        return f"<TaskRow(task_id={self.task_id}, {row_identifier}, status='{self.status}')>"
    
    @property
    def is_completed(self) -> bool:
        """Check if row is completed"""
        return self.status == "completed"
    
    @property
    def is_skipped(self) -> bool:
        """Check if row was skipped"""
        return self.status == "skipped"
    
    @property
    def row_display(self) -> str:
        """Get human-readable row identifier"""
        if self.vineyard_row and self.vineyard_row.row_number:
            return f"Row {self.vineyard_row.row_number}"
        elif self.row_number:
            return f"Row {self.row_number}"
        return f"Row #{self.id}"