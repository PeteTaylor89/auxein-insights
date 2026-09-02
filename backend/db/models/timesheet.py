
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
    #
    # THE DAY TOTAL IS DERIVED, NOT DECLARED  (changed 2026-08-19)
    # -----------------------------------------------------------
    # It used to be the other way round: `day_hours` was a number the user typed
    # and `uncoded_hours` was `day_hours - entry_hours`. That inverted the causal
    # order of a real day. Hours arrive by completing tasks, all day, AFTER any
    # total was declared — so every task completion had to be checked against a
    # figure typed hours earlier, and `recalc_hours` raised "Task allocations
    # cannot exceed day total" when the day simply turned out longer than
    # planned.
    #
    # Worse, that raise landed mid-write. `create_entry` flushes the TimeEntry
    # and only then recalcs, and `complete_task` catches the exception and logs
    # it — so the entry committed while `uncoded_hours` and
    # `effective_total_hours` kept their old values. The result on screen is a
    # day showing six hours of task entries under a two-hour total, which is
    # exactly the report that prompted this change.
    #
    # Now: `uncoded_hours` is the ONLY figure a person enters — time that is not
    # against any task — and
    #
    #     effective_total_hours = entry_hours + uncoded_hours
    #
    # Completing a task can never conflict with the total, because it moves the
    # total. There is nothing to "roll up": the roll-up is continuous.
    #
    # `day_hours` is kept as a stored mirror of the effective total rather than
    # dropped, because approved and submitted history reads it, as do the
    # reports. It is no longer independently settable.
    def recalc_hours(self) -> None:
        """Recompute entry_hours and the derived totals. Does NOT flush/commit."""
        total_entries = _q(sum((Decimal(str(e.hours or 0)) for e in self.entries), Decimal("0.00")))
        self.entry_hours = total_entries

        uncoded = Decimal(str(self.uncoded_hours or 0))
        if uncoded < 0:
            uncoded = Decimal("0.00")
        self.uncoded_hours = _q(uncoded)

        total = _q(total_entries + self.uncoded_hours)
        self.effective_total_hours = total
        # Mirror, so nothing downstream has to learn a new field.
        self.day_hours = total

        # Caps still apply — a 24h ceiling is a data-quality guard, not a
        # sequencing rule, so raising here cannot be triggered by ordinary work.
        if total > MAX_DAY_HOURS:
            raise ValueError(
                f"Day total ({total}h) cannot exceed {MAX_DAY_HOURS}h"
            )
        if total_entries > MAX_DAY_HOURS:
            raise ValueError(f"entry_hours ({total_entries}h) cannot exceed {MAX_DAY_HOURS}h")

    def entry_hours_with(self, extra: Decimal) -> Decimal:
        """What entry_hours WOULD be with one more entry of `extra` hours.

        Lets a caller check a cap before creating the row, rather than after.
        """
        current = sum((Decimal(str(e.hours or 0)) for e in self.entries), Decimal("0.00"))
        return _q(current + Decimal(str(extra or 0)))

    def set_uncoded_hours(self, hours: Optional[Decimal]) -> None:
        """Set the time NOT against a task. The only hours figure a user types."""
        value = Decimal("0.00") if hours is None else Decimal(str(hours))
        if value < 0:
            raise ValueError("Uncoded hours cannot be negative")
        if not _is_multiple_of_step(value):
            raise ValueError(f"Uncoded hours must be in {HOUR_STEP} increments")
        if value > MAX_DAY_HOURS:
            raise ValueError(f"Uncoded hours cannot exceed {MAX_DAY_HOURS}h")
        self.uncoded_hours = _q(value)
        self.recalc_hours()

    def set_day_hours(self, hours: Optional[Decimal]) -> Optional[str]:
        """Set the day TOTAL, kept for the existing endpoint and older clients.

        Expressed in terms of the new model: the caller is really saying "the
        day came to N hours", so the uncoded remainder is N minus whatever is
        already coded to tasks.

        Returns a warning string when the request could not be honoured in full,
        or None. It does NOT raise for a below-coded total: refusing outright
        would resurrect the failure this method was written to remove.

        A total below the coded hours USED TO DESTROY DATA. The old line was

            self.set_uncoded_hours(max(_q(value - coded), Decimal("0.00")))

        so a total under the coded figure silently overwrote `uncoded_hours`
        with zero and returned success — a mistyped digit in the web day-total
        box wiped uncoded time the user never named, with no recovery path.
        Clamping the ARITHMETIC is fine; clamping by discarding a stored value
        is not. Now the uncoded figure is left exactly as it was and the caller
        is handed something to show the user.
        """
        if hours is None:
            self.set_uncoded_hours(Decimal("0.00"))
            return None
        value = Decimal(str(hours))
        if value < 0:
            raise ValueError("Day total cannot be negative")
        if not _is_multiple_of_step(value):
            raise ValueError(f"Day total must be in {HOUR_STEP} increments")
        if value > MAX_DAY_HOURS:
            raise ValueError(f"Day total cannot exceed {MAX_DAY_HOURS}h")

        coded = _q(sum((Decimal(str(e.hours or 0)) for e in self.entries), Decimal("0.00")))
        if value < coded:
            return (
                f"Day total of {value}h is below the {coded}h already coded to tasks, "
                f"so it was not applied. Uncoded time is unchanged at "
                f"{_q(self.uncoded_hours or Decimal('0.00'))}h."
            )
        self.set_uncoded_hours(_q(value - coded))
        return None


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