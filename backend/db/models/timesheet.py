
# app/db/models/timesheet.py
from __future__ import annotations
import enum
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    Column, Integer, ForeignKey, Date, Enum, Numeric, Text, DateTime,
    UniqueConstraint, CheckConstraint, func, String
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

# Try to import your project's Base to avoid creating a second Base.
# Adjust this import if your Base lives elsewhere.
try:
    from db.base_class import Base  # type: ignore
except Exception:
    from sqlalchemy.orm import declarative_base
    Base = declarative_base()  # fallback for linting/tests outside your project


HOUR_STEP = Decimal("0.25")
MAX_DAY_HOURS = Decimal("24.00")


def _q(value: Decimal) -> Decimal:
    """Quantize to 2dp and enforce HALF_UP rounding (e.g. Decimal('1.235') -> 1.24)."""
    if value is None:
        return None
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _is_multiple_of_step(value: Decimal) -> bool:
    if value is None:
        return True
    return (value / HOUR_STEP) == (value / HOUR_STEP).to_integral_value()


class TimesheetStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class TimesheetDay(Base):  # type: ignore[misc]
    __tablename__ = "timesheet_days"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)

    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[TimesheetStatus] = mapped_column(Enum(TimesheetStatus), nullable=False, default=TimesheetStatus.draft)

    # Hours
    day_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)  # user-declared total for the day (optional)
    entry_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))  # sum(entries.hours)
    uncoded_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))  # max(day_hours - entry_hours, 0) if day_hours else 0
    effective_total_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))  # day_hours or entry_hours

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "user_id", "work_date", name="uq_timesheet_day_user_date"),
        CheckConstraint("effective_total_hours >= 0", name="ck_tsd_effective_nonneg"),
        CheckConstraint("uncoded_hours >= 0", name="ck_tsd_uncoded_nonneg"),
        CheckConstraint("entry_hours >= 0", name="ck_tsd_entry_nonneg"),
        CheckConstraint("entry_hours <= 24.00", name="ck_tsd_entry_le_24"),
        CheckConstraint("(day_hours IS NULL) OR (day_hours >= 0)", name="ck_tsd_day_nonneg"),
        CheckConstraint("(day_hours IS NULL) OR (day_hours <= 24.00)", name="ck_tsd_day_le_24"),
        CheckConstraint("effective_total_hours <= 24.00", name="ck_tsd_effective_le_24"),
    )

    # Relationships
    entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry",
        back_populates="timesheet_day",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    company = relationship("Company", back_populates="timesheets")
    user = relationship("User", foreign_keys=[user_id], back_populates="timesheets")
    approved_by_user = relationship("User", foreign_keys=[approved_by], back_populates="approved_timesheets")

    # --------- Business helpers ---------
    def recalc_hours(self) -> None:
        """Recompute entry_hours, uncoded_hours, effective_total_hours. Does NOT flush/commit."""
        total_entries = sum((Decimal(str(e.hours or 0)) for e in self.entries), Decimal("0.00"))
        total_entries = _q(total_entries)

        self.entry_hours = total_entries

        if self.day_hours is not None:
            # Enforce step/increment on day_hours as well
            if not _is_multiple_of_step(Decimal(str(self.day_hours))):
                raise ValueError(f"day_hours must be in {HOUR_STEP} increments")
            if Decimal(str(self.day_hours)) < total_entries:
                raise ValueError(f"Task allocations ({total_entries}h) cannot exceed day total ({self.day_hours}h).")
            self.uncoded_hours = _q(Decimal(str(self.day_hours)) - total_entries)
            self.effective_total_hours = _q(Decimal(str(self.day_hours)))
        else:
            self.uncoded_hours = Decimal("0.00")
            self.effective_total_hours = total_entries

        # caps
        if Decimal(str(self.effective_total_hours)) > MAX_DAY_HOURS:
            raise ValueError(f"effective_total_hours ({self.effective_total_hours}h) cannot exceed {MAX_DAY_HOURS}h")
        if Decimal(str(self.entry_hours)) > MAX_DAY_HOURS:
            raise ValueError(f"entry_hours ({self.entry_hours}h) cannot exceed {MAX_DAY_HOURS}h")

    def set_day_hours(self, hours: Optional[Decimal]) -> None:
        """Update day_hours with step validation and recompute totals."""
        if hours is None:
            self.day_hours = None
        else:
            if not _is_multiple_of_step(Decimal(str(hours))):
                raise ValueError(f"day_hours must be in {HOUR_STEP} increments")
            if Decimal(str(hours)) > MAX_DAY_HOURS:
                raise ValueError(f"day_hours cannot exceed {MAX_DAY_HOURS}h")
            if Decimal(str(hours)) < 0:
                raise ValueError("day_hours cannot be negative")
            self.day_hours = _q(Decimal(str(hours)))
        self.recalc_hours()


class TimeEntry(Base):  # type: ignore[misc]
    __tablename__ = "time_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timesheet_day_id: Mapped[int] = mapped_column(Integer, ForeignKey("timesheet_days.id", ondelete="CASCADE"), index=True, nullable=False)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), index=True, nullable=True)  # keep nullable=False if you want to require task for every entry

    hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    timesheet_day = relationship("TimesheetDay", back_populates="entries", lazy="joined")
    task = relationship(
        "Task", 
        back_populates="time_entries", 
        foreign_keys="[TimeEntry.task_id]"
    )
    __table_args__ = (
        CheckConstraint("hours >= 0", name="ck_te_hours_nonneg"),
        CheckConstraint("hours <= 24.00", name="ck_te_hours_le_24"),
    )

    def set_hours(self, hours: Decimal) -> None:
        """Validate step and cap for a single entry; does NOT flush/commit. Day-level constraints are enforced via TimesheetDay.recalc_hours()."""
        if not _is_multiple_of_step(Decimal(str(hours))):
            raise ValueError(f"entry hours must be in {HOUR_STEP} increments")
        if Decimal(str(hours)) > MAX_DAY_HOURS:
            raise ValueError(f"entry hours cannot exceed {MAX_DAY_HOURS}h")
        if Decimal(str(hours)) <= 0:
            raise ValueError("entry hours must be > 0")
        self.hours = _q(Decimal(str(hours)))

    entry_source: Mapped[str] = mapped_column(
        String(20), 
        default="manual_timesheet", 
        nullable=False
    )  