# db/models/spray_coverage.py — Per-(task, block) spray application-rate coverage
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Integer, DateTime, ForeignKey, Numeric, func, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column
from geoalchemy2 import Geometry

from db.base_class import Base

if TYPE_CHECKING:
    from db.models.task import Task
    from db.models.block import VineyardBlock
    from db.models.asset import Asset


class SprayCoverage(Base):
    """Per-(task, block) spray application-rate coverage raster + stats.

    Built from the task GPS track speed, the spray asset's swath width, and its
    calibrated flow rate (L/s):
        rate(L/ha) = flow_l_s * 36000 / (swath_m * speed_kmh)
    The swath footprint is accumulated onto a metric grid and clipped to the
    block — overlapping passes sum (over-application), skipped rows stay as gaps.
    Inputs are snapshotted so historical coverage is stable when calibration
    values change later.
    """
    __tablename__ = "spray_coverages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    block_id: Mapped[int] = mapped_column(Integer, ForeignKey("vineyard_blocks.id"), nullable=False)
    asset_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("assets.id"), nullable=True)
    # Set on clones generated for blocks beyond the origin task's assigned block (Phase 3).
    source_task_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tasks.id"), nullable=True)

    # Snapshotted inputs (stable vs later calibration changes)
    swath_m: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    flow_l_s: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    target_lha: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    tolerance_min_lha: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    tolerance_max_lha: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    cell_size_m: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1), nullable=True)
    speed_band_min_kmh: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    speed_band_max_kmh: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    max_gap_m: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 1), nullable=True)

    # Stats
    sprayed_area_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    block_area_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    gap_area_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    overlap_area_hectares: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    computed_volume_l: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    min_lha: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    avg_lha: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    max_lha: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    pct_within_tolerance: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)

    # Payload + geometry
    grid_geojson = mapped_column(JSONB, nullable=True)
    footprint_geometry = mapped_column(Geometry("GEOMETRY", srid=4326), nullable=True)

    computed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("task_id", "block_id", name="uq_spray_coverage_task_block"),
        Index("ix_spray_coverage_company", "company_id"),
        Index("ix_spray_coverage_block", "block_id"),
        Index("ix_spray_coverage_task", "task_id"),
        Index("ix_spray_coverage_footprint_geom", "footprint_geometry", postgresql_using="gist"),
    )

    # Relationships — two FKs to tasks, so foreign_keys must be explicit
    task = relationship("Task", foreign_keys=[task_id])
    source_task = relationship("Task", foreign_keys=[source_task_id])
    block = relationship("VineyardBlock")
    asset = relationship("Asset")

    def __repr__(self):
        return f"<SprayCoverage(task_id={self.task_id}, block_id={self.block_id}, avg_lha={self.avg_lha})>"
