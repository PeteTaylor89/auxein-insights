# db/models/task.py
from __future__ import annotations
import enum
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey, 
    Numeric, JSON, Enum, func, Index, CheckConstraint
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from geoalchemy2 import Geometry

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.task_template import TaskTemplate, TaskCategory
    from db.models.company import Company
    from db.models.user import User
    from db.models.block import VineyardBlock
    from db.models.spatial_area import SpatialArea
    from db.models.task_assignment import TaskAssignment
    from db.models.task_row import TaskRow
    from db.models.task_gps_track import TaskGPSTrack
    from db.models.asset import TaskAsset


class TaskStatus(str, enum.Enum):
    """Task lifecycle status"""
    draft = "draft"
    scheduled = "scheduled"
    ready = "ready"
    in_progress = "in_progress"
    paused = "paused"
    completed = "completed"
    cancelled = "cancelled"


class Task(Base):
    """Work instances - vineyard operations, maintenance, etc."""
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("task_templates.id", ondelete="SET NULL"), nullable=True)
    
    # Task identity
    task_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)  # "TASK-2025-001"
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    task_category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # Store as string for flexibility
    task_subcategory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Location (hybrid approach)
    # Primary locations with FK constraints
    block_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vineyard_blocks.id", ondelete="SET NULL"), nullable=True, index=True)
    spatial_area_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("spatial_areas.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Future expansion (no FK constraints)
    location_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 'winery_zone', 'tank', etc.
    location_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    location_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # "North end near pump shed"
    
    # Scheduling
    scheduled_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    scheduled_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    scheduled_start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False, index=True)  # low, medium, high, urgent
    
    # Status tracking
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), default=TaskStatus.draft, nullable=False, index=True)
    
    # Execution tracking
    actual_start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_pause_duration_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Progress tracking (multiple metrics for flexibility)
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0-100
    rows_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    area_completed_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    area_total_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    
    # Time tracking
    estimated_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    actual_hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)  # Calculated from TimeEntry
    
    # GPS tracking
    requires_gps_tracking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gps_tracking_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    total_distance_meters: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    area_covered_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    
    # Completion
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completion_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completion_photos: Mapped[Optional[dict]] = mapped_column(JSON, default=list, nullable=True)  # [file_id1, file_id2]
    
    # Related entities (for calendar integration and linking)
    related_observation_run_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("observation_runs.id", ondelete="SET NULL"), nullable=True)
    related_maintenance_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("asset_maintenance.id", ondelete="SET NULL"), nullable=True)
    related_calibration_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("asset_calibrations.id", ondelete="SET NULL"), nullable=True)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Cancellation
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Additional tracking
    weather_conditions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"temp": 22, "wind": "light"}
    tags: Mapped[Optional[dict]] = mapped_column(JSON, default=list, nullable=True)  # ["urgent", "weather_dependent"]
    
    __table_args__ = (
        CheckConstraint("progress_percentage >= 0 AND progress_percentage <= 100", name="ck_task_progress_range"),
        CheckConstraint("rows_completed >= 0", name="ck_task_rows_completed_nonneg"),
        CheckConstraint("actual_hours >= 0", name="ck_task_actual_hours_nonneg"),
        CheckConstraint("total_pause_duration_minutes >= 0", name="ck_task_pause_duration_nonneg"),
        Index("ix_task_company_status_date", "company_id", "status", "scheduled_start_date"),
        Index("ix_task_block_status", "block_id", "status"),
        Index("ix_task_spatial_area_status", "spatial_area_id", "status"),
    )
    
    # Relationships
    company = relationship("Company", back_populates="tasks")
    template = relationship("TaskTemplate", back_populates="tasks")
    block = relationship("VineyardBlock", back_populates="tasks")
    spatial_area = relationship("SpatialArea", back_populates="tasks")
    
    creator = relationship("User", foreign_keys=[created_by])
    completer = relationship("User", foreign_keys=[completed_by])
    canceller = relationship("User", foreign_keys=[cancelled_by])
    
    assignments: Mapped[List["TaskAssignment"]] = relationship("TaskAssignment", back_populates="task", cascade="all, delete-orphan")
    task_rows: Mapped[List["TaskRow"]] = relationship("TaskRow", back_populates="task", cascade="all, delete-orphan")
    task_assets: Mapped[List["TaskAsset"]] = relationship("TaskAsset", back_populates="task", cascade="all, delete-orphan")
    gps_tracks: Mapped[List["TaskGPSTrack"]] = relationship("TaskGPSTrack", back_populates="task", cascade="all, delete-orphan")
    
    time_entries = relationship("TimeEntry", back_populates="task")
    
    # Related entities
    related_observation_run = relationship("ObservationRun", foreign_keys=[related_observation_run_id])
    related_maintenance = relationship("AssetMaintenance", foreign_keys=[related_maintenance_id])
    related_calibration = relationship("AssetCalibration", foreign_keys=[related_calibration_id])
    
    def __repr__(self):
        return f"<Task(id={self.id}, number='{self.task_number}', title='{self.title}', status='{self.status}')>"
    
    @property
    def is_active(self) -> bool:
        """Check if task is currently active (in progress or paused)"""
        return self.status in [TaskStatus.in_progress, TaskStatus.paused]
    
    @property
    def is_complete(self) -> bool:
        """Check if task is completed"""
        return self.status == TaskStatus.completed
    
    @property
    def can_start(self) -> bool:
        """Check if task can be started"""
        return self.status in [TaskStatus.scheduled, TaskStatus.ready, TaskStatus.draft]
    
    @property
    def duration_minutes(self) -> Optional[int]:
        """Calculate actual working duration excluding pauses"""
        if not self.actual_start_time:
            return None
        
        end_time = self.actual_end_time or datetime.now(self.actual_start_time.tzinfo)
        total_minutes = int((end_time - self.actual_start_time).total_seconds() / 60)
        
        return max(0, total_minutes - self.total_pause_duration_minutes)
    
    @property
    def location_display(self) -> str:
        """Get human-readable location"""
        if self.block:
            return f"Block: {self.block.block_name}"
        elif self.spatial_area:
            return f"Area: {self.spatial_area.name}"
        elif self.location_notes:
            return self.location_notes
        return "No location specified"
    
    def calculate_row_progress(self) -> None:
        """Update progress based on completed rows"""
        if self.rows_total and self.rows_total > 0:
            self.progress_percentage = min(100, int((self.rows_completed / self.rows_total) * 100))