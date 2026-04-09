# db/models/task_gps_summary.py
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Integer, String, DateTime, ForeignKey, Numeric, func, Index
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from geoalchemy2 import Geometry

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.task import Task
    from db.models.user import User
    from db.models.block import VineyardBlock


class TaskGPSSummary(Base):
    """Processed GPS track summary — geometry + stats computed from breadcrumbs"""
    __tablename__ = "task_gps_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, unique=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # Track geometry — one LineString per segment, combined as MultiLineString
    track_geometry = mapped_column(Geometry("MULTILINESTRING", srid=4326), nullable=True)

    # Coverage geometry — convex hull of points, clipped to block polygon if available
    coverage_geometry = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)

    # Distance
    total_distance_meters: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    total_distance_km: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 3), nullable=True)

    # Duration
    active_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Point counts
    total_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_segments: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Speed
    avg_speed_kmh: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    max_speed_kmh: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    time_stationary_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    time_moving_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Coverage
    coverage_area_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    block_area_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    coverage_percentage: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)

    # Quality
    avg_accuracy_meters: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    poor_accuracy_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relations
    block_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vineyard_blocks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_gps_summary_company", "company_id"),
        Index("ix_gps_summary_track_geom", "track_geometry", postgresql_using="gist"),
        Index("ix_gps_summary_coverage_geom", "coverage_geometry", postgresql_using="gist"),
    )

    # Relationships
    task = relationship("Task", backref="gps_summary")
    user = relationship("User")
    block = relationship("VineyardBlock")

    def __repr__(self):
        return f"<TaskGPSSummary(task_id={self.task_id}, distance={self.total_distance_km}km, points={self.total_points})>"
