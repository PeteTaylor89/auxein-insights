# db/models/costing.py — pay rates, company cost settings and the task cost snapshot.
#
# Deliberately NOT back-referenced from User or Company. A relationship on those
# models would be loaded by code that has nothing to do with costing, and pay
# rates are the most sensitive data in the app — they should be reachable only
# from code that went looking for them.
from sqlalchemy import (
    Column, Integer, String, Numeric, Date, DateTime, Boolean, Text, JSON,
    ForeignKey, CheckConstraint, Index, func,
)
from sqlalchemy.orm import relationship

from db.base_class import Base


class UserPayRate(Base):
    """One staff member's hourly rate over a period.

    Effective-dated rather than a column on User, so history does not reprice.
    A pay rise in September must not change what June's pruning cost, and a
    report exported last month must still match the system next month.

    Resolution is by the TASK'S date, never today's — see resolve_pay_rate.
    """
    __tablename__ = "user_pay_rate"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    hourly_rate = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, server_default="NZD")

    effective_from = Column(Date, nullable=False)
    # NULL = still in force. At most one open-ended row per user; the service
    # closes the previous one when a new rate is added.
    effective_to = Column(Date, nullable=True)

    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint("hourly_rate >= 0", name="ck_user_pay_rate_non_negative"),
        CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_user_pay_rate_range",
        ),
        Index("ix_user_pay_rate_user_from", "user_id", "effective_from"),
    )

    def covers(self, on_date) -> bool:
        """Whether this rate was in force on a given date."""
        if on_date < self.effective_from:
            return False
        return self.effective_to is None or on_date <= self.effective_to


class CompanyCostSettings(Base):
    """One row per company. Absent means nothing is configured.

    Every field is nullable on purpose. A company that has not set an on-cost
    multiplier gets 1.0 AND a flag saying so, rather than a number that looks
    complete and understates every wage by 15-20%.
    """
    __tablename__ = "company_cost_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, unique=True)

    # Fallback for staff with no pay rate on file. NULL means no fallback: such
    # a task reports as incomplete rather than being costed at zero.
    default_hourly_rate = Column(Numeric(10, 2), nullable=True)

    # Holiday pay + ACC + KiwiSaver, e.g. 1.1800.
    on_cost_multiplier = Column(Numeric(5, 4), nullable=True)

    # The company's standard working day, for contractor DAILY rates. Until it
    # is set, a daily-rate assignment stays honestly uncosted rather than being
    # divided by the hardcoded 8 this replaces.
    standard_day_hours = Column(Numeric(4, 2), nullable=True)

    currency = Column(String(3), nullable=False, server_default="NZD")

    # Decided 2026-08-28: weighted average from purchase movements. Stored
    # rather than hardcoded because switching is cheap now and expensive once
    # there is purchase history to re-value.
    stock_costing_method = Column(String(20), nullable=False, server_default="weighted_average")

    # Decided 2026-08-28: uncoded hours are overhead and are never allocated to
    # a task. The sum of task costs will not reconcile to payroll, by design.
    uncoded_hours_policy = Column(String(20), nullable=False, server_default="overhead")

    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "on_cost_multiplier IS NULL OR on_cost_multiplier >= 1",
            name="ck_cost_settings_on_cost",
        ),
        CheckConstraint(
            "standard_day_hours IS NULL OR (standard_day_hours > 0 AND standard_day_hours <= 24)",
            name="ck_cost_settings_day_hours",
        ),
    )


STOCK_COSTING_METHODS = ("last_price", "weighted_average", "fifo")
UNCODED_HOURS_POLICIES = ("overhead", "prorate", "general_task")


class TaskCost(Base):
    """What a task cost, frozen at the moment it was computed.

    A snapshot, not a view. Recomputing from current rates would mean a pay rise
    retroactively reprices every task that person ever touched, and a report
    exported last month would stop matching the system.

    `rate_sources` is what makes a figure explainable a year later. Without it a
    disputed number cannot be defended, only re-asserted.
    """
    __tablename__ = "task_cost"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)

    labour_cost_staff = Column(Numeric(12, 2), nullable=True)
    labour_cost_contractor = Column(Numeric(12, 2), nullable=True)
    consumable_cost = Column(Numeric(12, 2), nullable=True)
    # Equipment is Phase 4. NULL, not 0.00 — a zero would read as "the machinery
    # was free" rather than "not costed yet".
    asset_cost = Column(Numeric(12, 2), nullable=True)
    total_cost = Column(Numeric(12, 2), nullable=True)
    currency = Column(String(3), nullable=False, server_default="NZD")

    staff_hours = Column(Numeric(8, 2), nullable=True)
    contractor_hours = Column(Numeric(8, 2), nullable=True)
    asset_hours = Column(Numeric(8, 2), nullable=True)

    on_cost_multiplier_applied = Column(Numeric(5, 4), nullable=True)

    # Hours worked by someone with no resolvable rate. Non-zero means the total
    # is an UNDERSTATEMENT, and every consumer must say so rather than render a
    # confident number.
    unrated_staff_hours = Column(Numeric(8, 2), nullable=False, server_default="0")

    rate_sources = Column(JSON, nullable=True)

    computed_at = Column(DateTime(timezone=True), server_default=func.now())
    computed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_superseded = Column(Boolean, nullable=False, server_default="false")

    task = relationship("Task", foreign_keys=[task_id])

    @property
    def is_complete(self) -> bool:
        """False when the total is knowably lower than the truth.

        Two ways it can be short: staff time with no resolvable pay rate, and
        machinery that ran but has no operating rate.

        Note what this deliberately does NOT treat as incomplete — a task with
        no equipment at all. Hand pruning uses no machinery, so `asset_cost`
        being NULL there is the correct answer rather than a gap. Requiring a
        non-null asset_cost would mark most of a vineyard's work incomplete and
        train people to ignore the flag.

        The limitation worth knowing: this cannot see equipment that ran and was
        never recorded. Nothing can, from the snapshot alone — the warnings on
        the compute result carry that, because only they know what was attached.
        """
        if (self.unrated_staff_hours or 0) != 0:
            return False
        # Hours recorded but nothing to price them with.
        if self.asset_hours and self.asset_cost is None:
            return False
        return True
