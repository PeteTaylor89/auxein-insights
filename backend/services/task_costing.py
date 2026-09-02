# services/task_costing.py — what a task cost, computed once and frozen.
#
# Read this before changing anything here:
#
#   * `Task.actual_hours` is NOT the source of staff hours. It was dead for the
#     whole life of the app and is now written at completion as an audit record
#     only. Hours come from TimeEntry rows, which is also where the per-person,
#     per-day detail lives that rate resolution needs.
#
#   * Each entry is priced at the rate that applied ON ITS OWN WORK DATE, not
#     on the task's completion date. A task spanning a pay rise gets each day at
#     the right rate, and the work date is already the worker's local calendar
#     date rather than a UTC timestamp that is a day out all NZ morning.
#
#   * Uncoded hours are NOT here, by decision. Time not against a task is
#     company overhead and is never allocated. It falls out naturally: this only
#     ever reads TimeEntry rows whose task_id matches.
#
#   * A roll-up parent does not absorb its children's cost. Every task carries
#     its own snapshot from its own entries, so a parent and its children can be
#     summed without double counting — which is exactly what would happen if
#     this walked the parent_task_id tree.
import logging
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from db.models.task import Task
from db.models.timesheet import TimeEntry, TimesheetDay
from db.models.contractor_assignment import ContractorAssignment
from db.models.asset import StockMovement, TaskAsset
from db.models.costing import TaskCost
from services.pay_rates import get_cost_settings, resolve_pay_rate, on_cost_multiplier
from services.stock_costing import q_money

logger = logging.getLogger(__name__)


class TaskCostResult:
    """The computed figures, before they are written.

    Every money field is Optional and None means NOT COSTED, never zero. The
    distinction is the whole point: 0.00 asserts the work was free, which is a
    claim nobody made, while None says the number is not known yet — and a
    report can render the second honestly.
    """

    def __init__(self):
        self.labour_cost_staff: Optional[Decimal] = None
        self.labour_cost_contractor: Optional[Decimal] = None
        self.consumable_cost: Optional[Decimal] = None
        self.asset_cost: Optional[Decimal] = None      # Phase 4
        self.total_cost: Optional[Decimal] = None
        self.currency = "NZD"
        self.staff_hours = Decimal("0.00")
        self.contractor_hours = Decimal("0.00")
        self.asset_hours: Optional[Decimal] = None     # Phase 4
        self.on_cost_multiplier_applied: Optional[Decimal] = None
        self.unrated_staff_hours = Decimal("0.00")
        self.rate_sources: dict = {}
        self.warnings: list = []

    @property
    def is_complete(self) -> bool:
        """False when the total is knowably lower than the truth."""
        return self.unrated_staff_hours == 0 and not self.warnings


def compute_task_cost(db: Session, task: Task) -> TaskCostResult:
    """Cost one task. Pure computation — writes nothing.

    Split from the write so a recompute can be previewed, and so the endpoint
    that persists a snapshot is not also the thing deciding the numbers.
    """
    result = TaskCostResult()
    settings = get_cost_settings(db, task.company_id)
    multiplier, mult_configured = on_cost_multiplier(settings)
    result.currency = (settings.currency if settings else None) or "NZD"

    if not mult_configured:
        result.warnings.append(
            "No on-cost multiplier is configured, so wages are counted at the bare "
            "hourly rate. True employment cost is roughly 15-20% higher."
        )

    # ---- staff labour ------------------------------------------------------
    entries = (
        db.query(TimeEntry)
        .options(joinedload(TimeEntry.timesheet_day))
        .filter(TimeEntry.task_id == task.id)
        .all()
    )

    staff_total = Decimal("0.00")
    rated_any = False
    used_rate_ids = set()
    unrated_users = set()

    for entry in entries:
        day = entry.timesheet_day
        if day is None:
            # An entry with no day should not exist; costing it against an
            # unknown person on an unknown date would be a guess.
            result.unrated_staff_hours += Decimal(str(entry.hours or 0))
            continue

        hours = Decimal(str(entry.hours or 0))
        result.staff_hours += hours

        res = resolve_pay_rate(db, day.user_id, day.work_date, settings=settings)
        if not res.is_resolved:
            result.unrated_staff_hours += hours
            unrated_users.add(day.user_id)
            continue

        rated_any = True
        if res.pay_rate_id:
            used_rate_ids.add(res.pay_rate_id)
        staff_total += hours * res.hourly_rate * multiplier

    if rated_any:
        result.labour_cost_staff = q_money(staff_total)
        result.on_cost_multiplier_applied = multiplier

    if result.unrated_staff_hours > 0:
        result.warnings.append(
            f"{result.unrated_staff_hours}h of staff time has no pay rate for the date it "
            f"was worked, so labour is understated. Set a rate, or a company default."
        )

    # ---- contractor labour -------------------------------------------------
    assignments = (
        db.query(ContractorAssignment)
        .filter(ContractorAssignment.task_id == task.id)
        .all()
    )
    contractor_total = Decimal("0.00")
    costed_any = False
    uncosted_assignments = []

    for a in assignments:
        if a.actual_hours_worked:
            result.contractor_hours += Decimal(str(a.actual_hours_worked))
        if a.actual_cost is not None:
            contractor_total += Decimal(str(a.actual_cost))
            costed_any = True
        elif a.agreed_rate is not None:
            uncosted_assignments.append(a)

    if costed_any:
        result.labour_cost_contractor = q_money(contractor_total)

    if uncosted_assignments:
        daily = [a for a in uncosted_assignments if a.rate_type == "daily"]
        if daily and (settings is None or settings.standard_day_hours is None):
            result.warnings.append(
                "A contractor on a daily rate could not be costed because no standard day "
                "length is configured. Set one on the Costs screen."
            )
        else:
            result.warnings.append(
                f"{len(uncosted_assignments)} contractor assignment(s) have a rate but no cost, "
                "so contractor labour is understated."
            )

    # ---- consumables -------------------------------------------------------
    #
    # Read from StockMovement rather than TaskAsset: the movement is the ledger
    # entry, it carries the unit cost SNAPSHOT taken at the moment of use, and
    # it survives the asset's price changing afterwards.
    movements = (
        db.query(StockMovement)
        .filter(
            StockMovement.task_id == task.id,
            StockMovement.movement_type == "usage",
        )
        .all()
    )
    consumable_total = Decimal("0.00")
    priced_any = False
    unpriced = 0

    for m in movements:
        if m.total_cost is not None:
            consumable_total += abs(Decimal(str(m.total_cost)))
            priced_any = True
        else:
            unpriced += 1

    if priced_any:
        result.consumable_cost = q_money(consumable_total)
    if unpriced:
        result.warnings.append(
            f"{unpriced} consumable usage(s) have no price on the product, so materials are "
            "understated. Set a cost per unit on the consumable."
        )

    # ---- equipment ---------------------------------------------------------
    #
    # Hours come from TaskAsset.actual_hours, captured at completion. The rate
    # is the asset's own hourly_operating_rate, read live rather than snapshot:
    # unlike a consumable there is no per-use ledger row to hang a price on, so
    # a recompute is the only way to restate machinery cost after a rate is set.
    # That is a real asymmetry with consumables and is why `rate_sources`
    # records which assets contributed.
    task_assets = (
        db.query(TaskAsset)
        .options(joinedload(TaskAsset.asset))
        .filter(TaskAsset.task_id == task.id)
        .all()
    )

    equipment_total = Decimal("0.00")
    rated_equipment = False
    unrated_equipment = []
    costed_asset_ids = []
    equipment_attached = 0
    equipment_without_hours = []

    for ta in task_assets:
        asset = ta.asset
        if not asset or asset.asset_type == "consumable":
            continue
        equipment_attached += 1
        if ta.actual_hours is None:
            equipment_without_hours.append(asset.name)
            continue

        hours = Decimal(str(ta.actual_hours))
        if result.asset_hours is None:
            result.asset_hours = Decimal("0.00")
        result.asset_hours += hours

        if asset.hourly_operating_rate is None:
            unrated_equipment.append(asset.name)
            continue

        rated_equipment = True
        costed_asset_ids.append(asset.id)
        equipment_total += hours * Decimal(str(asset.hourly_operating_rate))

    if rated_equipment:
        result.asset_cost = q_money(equipment_total)

    if unrated_equipment:
        result.warnings.append(
            f"{len(unrated_equipment)} piece(s) of equipment ran on this task with no operating "
            f"rate set ({', '.join(sorted(unrated_equipment)[:3])}"
            f"{'…' if len(unrated_equipment) > 3 else ''}), so machinery cost is understated."
        )
    if equipment_without_hours:
        result.warnings.append(
            f"{len(equipment_without_hours)} piece(s) of equipment are on this task with no "
            f"hours recorded, so machinery cost is understated."
        )

    # No warning when NO equipment is attached. Hand pruning uses no machinery,
    # and flagging every such task as incompletely costed would train people to
    # ignore the flag on the tasks where it means something.

    # ---- total -------------------------------------------------------------
    components = [
        result.labour_cost_staff,
        result.labour_cost_contractor,
        result.consumable_cost,
        result.asset_cost,
    ]
    if any(c is not None for c in components):
        result.total_cost = q_money(sum((c for c in components if c is not None), Decimal("0.00")))

    result.rate_sources = {
        "user_pay_rate_ids": sorted(used_rate_ids),
        "unrated_user_ids": sorted(unrated_users),
        "stock_movement_ids": sorted(m.id for m in movements),
        "contractor_assignment_ids": sorted(a.id for a in assignments),
        "costed_asset_ids": sorted(costed_asset_ids),
        "time_entry_ids": sorted(e.id for e in entries),
        "on_cost_multiplier": str(multiplier),
        "on_cost_configured": mult_configured,
    }
    return result


def write_snapshot(db: Session, task: Task, result: TaskCostResult,
                   computed_by: int = None) -> TaskCost:
    """Persist the figures, superseding any live snapshot for this task.

    Supersede rather than overwrite: a corrected cost keeps the one it replaced,
    so "why did this change" is answerable. The database enforces at most one
    live row per task, so the old one MUST be marked before the new one is
    inserted — the partial unique index will refuse otherwise.
    """
    live = (
        db.query(TaskCost)
        .filter(TaskCost.task_id == task.id, TaskCost.is_superseded == False)  # noqa: E712
        .all()
    )
    for row in live:
        row.is_superseded = True
    if live:
        db.flush()

    snapshot = TaskCost(
        task_id=task.id,
        company_id=task.company_id,
        labour_cost_staff=result.labour_cost_staff,
        labour_cost_contractor=result.labour_cost_contractor,
        consumable_cost=result.consumable_cost,
        asset_cost=result.asset_cost,
        total_cost=result.total_cost,
        currency=result.currency,
        staff_hours=result.staff_hours,
        contractor_hours=result.contractor_hours,
        asset_hours=result.asset_hours,
        on_cost_multiplier_applied=result.on_cost_multiplier_applied,
        unrated_staff_hours=result.unrated_staff_hours,
        rate_sources=result.rate_sources,
        computed_by=computed_by,
    )
    db.add(snapshot)
    db.flush()

    logger.info(
        f"Task {task.id} costed: total={result.total_cost} {result.currency} "
        f"(staff={result.labour_cost_staff}, contractor={result.labour_cost_contractor}, "
        f"consumables={result.consumable_cost}, unrated={result.unrated_staff_hours}h)"
    )
    return snapshot


def cost_task_safely(db: Session, task: Task, computed_by: int = None) -> Optional[TaskCost]:
    """Cost a task from inside task completion, without ever failing it.

    Completion is the user's work; costing is bookkeeping that follows it. A
    costing bug must not roll back a completed task or return an error to
    someone standing in a vineyard — but it must not be silent either, which is
    the mistake the timesheet write made. It logs at exception level and returns
    None, so the gap is findable and a recompute can fill it in.
    """
    try:
        result = compute_task_cost(db, task)
        return write_snapshot(db, task, result, computed_by=computed_by)
    except Exception:
        logger.exception(f"Costing failed for task {task.id}; completion stands, cost is absent")
        return None


def get_live_cost(db: Session, task_id: int) -> Optional[TaskCost]:
    return (
        db.query(TaskCost)
        .filter(TaskCost.task_id == task_id, TaskCost.is_superseded == False)  # noqa: E712
        .first()
    )
