# db/models/task_gps_track.py
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Numeric, 
    func, Index
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.task import Task
    from db.models.user import User


class TaskGPSTrack(Base):
    """GPS breadcrumb trail for tractor/equipment tasks"""
    __tablename__ = "task_gps_tracks"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # GPS data
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    altitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)  # Meters
    accuracy: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)  # Meters
    
    # Movement data
    speed: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)  # km/h
    heading: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)  # Degrees (0-360)
    
    # Session tracking
    segment_id: Mapped[int] = mapped_column(Integer, default=1, nullable=False)  # Increments on pause/resume
    
    # Device info
    device_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    __table_args__ = (
        Index("ix_task_gps_task_timestamp", "task_id", "timestamp"),
        Index("ix_task_gps_task_segment", "task_id", "segment_id"),
    )
    
    # Relationships
    task = relationship("Task", back_populates="gps_tracks")
    user = relationship("User")
    
    def __repr__(self):
        return f"<TaskGPSTrack(task_id={self.task_id}, lat={self.latitude}, lng={self.longitude}, timestamp={self.timestamp})>"
    
    @property
    def coordinates(self) -> tuple:
        """Get coordinates as tuple (lat, lng)"""
        return (float(self.latitude), float(self.longitude))