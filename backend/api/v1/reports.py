# backend/api/v1/reports.py — reporting endpoints (summary + CSV export)
# Revision 2: added property_id filter to all endpoints
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List
import csv
import io

from db.session import get_db
from api.deps import get_current_user, require_company_user_permission
from services.property_service import get_visible_property_ids
from db.models.user import User
from db.models.task import Task
from db.models.observation_run import ObservationRun, ObservationSpot
from db.models.observation_template import ObservationTemplate
from db.models.timesheet import TimesheetDay, TimeEntry
from db.models.asset import Asset
from db.models.block import VineyardBlock
from db.models.contractor import Contractor
from db.models.contractor_relationship import ContractorRelationship
from db.models.contractor_assignment import ContractorAssignment
from db.models.contractor_movement import ContractorMovement
from db.models.property import Property
from db.models.task import TaskStatus
from db.models.task_assignment import TaskAssignment
from db.models.incident import Incident
from db.models.site_risk import SiteRisk
from db.models.risk_action import RiskAction
from db.models.visitor import Visitor, VisitorVisit
from db.models.site_attendance import SiteAttendance
from db.models.training_record import TrainingRecord
from db.models.costing import TaskCost, UserPayRate, CompanyCostSettings
from services.count_metrics import (
    CountMetric, COUNT_METRICS, MIN_SPOTS_FOR_SD, metric_for_template,
    first_field as _first_field,
)
from schemas.report import (
    TaskReportSummary, ObservationReportSummary,
    TimesheetReportSummary, AssetReportSummary,
    ContractorReportSummary, TopContractor, PropertyVisitCount,
    StatusCount, CategoryCount,
    WorkByBlockSummary, BlockWorkRow,
    OutstandingSummary, OutstandingBlockRow, AssigneeRow,
    HealthSafetySummary, IncidentRow, RiskRow,
    SiteAccessSummary, VisitRow,
    VineyardCensusSummary, CensusBlockRow, AreaByKey,
    CostBreakdown, CostReportSummary, OperationCostRow, CostMixRow,
    CountStat, CountReportSummary,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────
def _date_filter(query, model, date_field, start: Optional[date], end: Optional[date]):
    col = getattr(model, date_field)
    if start:
        query = query.filter(col >= start)
    if end:
        query = query.filter(col <= end)
    return query


def _scoped_property_ids(db: Session, current_user: User, property_id: Optional[int]) -> List[int]:
    """
    Property ids this user may see, narrowed by an optional explicit filter.

    `property_id` used to be a plain filter: pass nothing and the query ran
    unscoped, so a user restricted to one property saw the whole company the
    moment they cleared the dropdown. It is now applied on TOP of
    get_visible_property_ids, and a filter naming a property outside that set
    returns nothing rather than silently widening.
    """
    visible = get_visible_property_ids(db, current_user)
    if property_id is not None:
        return [property_id] if property_id in visible else []
    return visible


# ── The NULL-property rule, in one place ──────────────────────────────
#
# A row with `property_id IS NULL` is COMPANY-WIDE. It is not "property-less
# and therefore invisible" — it belongs to the company and has simply never
# been attached to a property. Three live companies hold every block that way
# (Mt Beautiful: 22 blocks, all NULL), and several hold their risks that way,
# so getting this wrong empties whole reports rather than trimming an edge case.
#
# `get_visible_property_ids` returns [] for a company that owns and manages no
# properties. An empty list must therefore mean "company-wide rows only", NOT
# "no rows" — that short-circuit is what blanked the census and the risk
# register for those companies.
#
# Only an explicit `property_id` narrows to that property alone: at that point
# the user has asked for one property and does not want company-wide rows mixed
# in. An explicit filter naming a property outside the visible set returns
# nothing, rather than widening.

def _visible_block_ids(db: Session, current_user: User, property_id: Optional[int]) -> List[int]:
    """Block ids this user may see, under the NULL-property rule above."""
    ids = _scoped_property_ids(db, current_user, property_id)
    q = db.query(VineyardBlock.id).filter(VineyardBlock.company_id == current_user.company_id)

    if property_id is not None:
        if not ids:
            return []
        return [r[0] for r in q.filter(VineyardBlock.property_id == property_id).all()]

    if ids:
        q = q.filter(or_(VineyardBlock.property_id.in_(ids), VineyardBlock.property_id.is_(None)))
    else:
        q = q.filter(VineyardBlock.property_id.is_(None))
    return [r[0] for r in q.all()]


def _property_filter_tasks(
    query, db: Session, current_user: User, property_id: Optional[int], explicit_only: bool = False
):
    """
    Scope tasks to what this user may see, via the block → property chain.

    A task with no block at all is also company-wide, so it is kept unless the
    user asked for one property specifically — excluding it would quietly drop
    every unassigned job from the totals.
    """
    block_ids = _visible_block_ids(db, current_user, property_id)

    if property_id is not None or explicit_only:
        if not block_ids:
            return query.filter(Task.id == -1)
        return query.filter(Task.block_id.in_(block_ids))

    if not block_ids:
        return query.filter(Task.block_id.is_(None))
    return query.filter(or_(Task.block_id.in_(block_ids), Task.block_id.is_(None)))


def _property_filter_nullable(query, model, db: Session, current_user: User, property_id: Optional[int]):
    """Scope a model carrying its own nullable `property_id`.

    Incident, SiteRisk, ContractorMovement, SiteAttendance.
    """
    ids = _scoped_property_ids(db, current_user, property_id)

    if property_id is not None:
        if not ids:
            return query.filter(model.id == -1)
        return query.filter(model.property_id == property_id)

    if not ids:
        return query.filter(model.property_id.is_(None))
    return query.filter(or_(model.property_id.in_(ids), model.property_id.is_(None)))


def _csv_response(rows, headers, filename):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Task Reports ──────────────────────────────────────────────────────
@router.get("/tasks/summary", response_model=TaskReportSummary)
def task_report_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None, description="Filter by property"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    q = db.query(Task).filter(Task.company_id == current_user.company_id)
    q = _date_filter(q, Task, "created_at", start_date, end_date)
    q = _property_filter_tasks(q, db, current_user, property_id)
    tasks = q.all()

    total = len(tasks)
    status_counts = {}
    priority_counts = {}
    category_counts = {}
    total_hours = 0.0
    completed = 0
    overdue = 0
    now = datetime.utcnow()

    # Hours come from `_task_hours`, not `Task.actual_hours`. This report read
    # the field for its whole life and therefore reported 0 for everyone, since
    # nothing wrote it. It IS written now — at completion, as an audit record —
    # which made the old code worse rather than better: newly completed tasks
    # would have started showing hours while everything historical stayed at 0,
    # and the figure would have disagreed with work-by-block on the same data.
    task_hours = _task_hours(db, [t.id for t in tasks])

    show_costs = _may_see_costs(current_user)
    completed_ids = [t.id for t in tasks if t.status == TaskStatus.completed]
    task_costs = _task_costs(db, completed_ids) if show_costs else {}
    cost_acc = _CostAccumulator() if show_costs else None

    for t in tasks:
        s = t.status.value if t.status else "unknown"
        status_counts[s] = status_counts.get(s, 0) + 1

        p = t.priority or "medium"
        priority_counts[p] = priority_counts.get(p, 0) + 1

        c = t.task_category or "general"
        category_counts[c] = category_counts.get(c, 0) + 1

        total_hours += task_hours.get(t.id, 0.0)
        if s == "completed":
            completed += 1
            # Only completed work has a cost. An open task has no snapshot, and
            # counting it as uncosted would report every in-flight job as a gap.
            if cost_acc is not None:
                cost_acc.add(task_costs.get(t.id))
        if t.scheduled_end_date and t.scheduled_end_date < now.date() and s not in ("completed", "cancelled"):
            overdue += 1

    return TaskReportSummary(
        total=total,
        by_status=[StatusCount(status=k, count=v) for k, v in status_counts.items()],
        by_priority=[StatusCount(status=k, count=v) for k, v in priority_counts.items()],
        by_category=[CategoryCount(category=k, count=v) for k, v in category_counts.items()],
        total_hours=round(total_hours, 1),
        completion_rate=round((completed / total * 100) if total > 0 else 0, 1),
        overdue_count=overdue,
        costs=cost_acc.breakdown() if cost_acc is not None else None,
    )


@router.get("/tasks/export")
def task_report_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    q = db.query(Task).filter(Task.company_id == current_user.company_id)
    q = _date_filter(q, Task, "created_at", start_date, end_date)
    q = _property_filter_tasks(q, db, current_user, property_id)
    tasks = q.order_by(Task.created_at.desc()).all()

    # Same correction as the summary: hours from TimeEntry + ContractorAssignment,
    # never `Task.actual_hours`.
    task_hours = _task_hours(db, [t.id for t in tasks])
    show_costs = _may_see_costs(current_user)
    task_costs = _task_costs(db, [t.id for t in tasks]) if show_costs else {}

    headers = ["ID", "Title", "Status", "Priority", "Category", "Estimated Hours", "Hours",
               "Scheduled Start", "Completed At", "Created"]
    if show_costs:
        headers += ["Labour", "Consumables", "Equipment", "Total Cost", "Currency", "Cost Complete"]

    rows = []
    for t in tasks:
        hours = task_hours.get(t.id, 0.0)
        row = [
            t.id,
            t.title,
            t.status.value if t.status else "",
            t.priority or "",
            t.task_category or "",
            float(t.estimated_hours) if t.estimated_hours is not None else "",
            round(hours, 2) if hours else "",
            str(t.scheduled_start_date) if t.scheduled_start_date else "",
            str(t.completed_at) if t.completed_at else "",
            str(t.created_at) if t.created_at else "",
        ]
        if show_costs:
            c = task_costs.get(t.id)
            if c is None:
                # Blank, not zero. This task was never costed.
                row += ["", "", "", "", "", ""]
            else:
                row += [
                    _csv_money(_sum_optional(
                        float(c.labour_cost_staff) if c.labour_cost_staff is not None else None,
                        float(c.labour_cost_contractor) if c.labour_cost_contractor is not None else None,
                    )),
                    _csv_money(float(c.consumable_cost) if c.consumable_cost is not None else None),
                    _csv_money(float(c.asset_cost) if c.asset_cost is not None else None),
                    _csv_money(float(c.total_cost) if c.total_cost is not None else None),
                    c.currency or "",
                    "yes" if c.is_complete else "no",
                ]
        rows.append(row)
    return _csv_response(rows, headers, "tasks_report.csv")


# ── Observation Reports ───────────────────────────────────────────────
@router.get("/observations/summary", response_model=ObservationReportSummary)
def observation_report_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    run_q = db.query(ObservationRun).filter(ObservationRun.company_id == current_user.company_id)
    # Property filter for observation runs: via run.block_id -> block.property_id
    if property_id is not None:
        block_ids = [
            row[0] for row in
            db.query(VineyardBlock.id).filter(VineyardBlock.property_id == property_id).all()
        ]
        if block_ids:
            run_q = run_q.filter(ObservationRun.block_id.in_(block_ids))
        else:
            run_q = run_q.filter(ObservationRun.id == -1)

    run_q = _date_filter(run_q, ObservationRun, "created_at", start_date, end_date)
    runs = run_q.all()

    total_runs = len(runs)
    completed_runs = sum(1 for r in runs if r.observed_at_end is not None)

    total_spots = 0
    runs_by_month = {}
    for r in runs:
        if hasattr(r, "spots") and r.spots:
            total_spots += len(r.spots)
        month_key = r.created_at.strftime("%Y-%m") if r.created_at else "unknown"
        runs_by_month[month_key] = runs_by_month.get(month_key, 0) + 1

    return ObservationReportSummary(
        total_runs=total_runs,
        completed_runs=completed_runs,
        avg_spots_per_run=round(total_spots / total_runs, 1) if total_runs > 0 else 0,
        runs_by_month=runs_by_month,
    )


@router.get("/observations/export")
def observation_report_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    run_q = db.query(ObservationRun).filter(ObservationRun.company_id == current_user.company_id)
    if property_id is not None:
        block_ids = [
            row[0] for row in
            db.query(VineyardBlock.id).filter(VineyardBlock.property_id == property_id).all()
        ]
        if block_ids:
            run_q = run_q.filter(ObservationRun.block_id.in_(block_ids))
        else:
            run_q = run_q.filter(ObservationRun.id == -1)

    run_q = _date_filter(run_q, ObservationRun, "created_at", start_date, end_date)
    runs = run_q.order_by(ObservationRun.created_at.desc()).all()

    headers = ["ID", "Name", "Block ID", "Scheduled", "Started", "Ended", "Spots", "Created"]
    rows = []
    for r in runs:
        spot_count = len(r.spots) if hasattr(r, "spots") and r.spots else 0
        rows.append([
            r.id,
            r.name or "",
            r.block_id or "",
            str(r.scheduled_date) if r.scheduled_date else "",
            str(r.observed_at_start) if r.observed_at_start else "",
            str(r.observed_at_end) if r.observed_at_end else "",
            spot_count,
            str(r.created_at) if r.created_at else "",
        ])
    return _csv_response(rows, headers, "observations_report.csv")


# ── Timesheet Reports ─────────────────────────────────────────────────
@router.get("/timesheets/summary", response_model=TimesheetReportSummary)
def timesheet_report_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    q = db.query(TimesheetDay).filter(TimesheetDay.company_id == current_user.company_id)
    q = _date_filter(q, TimesheetDay, "work_date", start_date, end_date)

    # Property filter for timesheets: via time_entry → task → block → property
    if property_id is not None:
        block_ids = [
            row[0] for row in
            db.query(VineyardBlock.id).filter(VineyardBlock.property_id == property_id).all()
        ]
        if block_ids:
            day_ids_with_property = (
                db.query(TimeEntry.timesheet_day_id)
                .join(Task, TimeEntry.task_id == Task.id)
                .filter(Task.block_id.in_(block_ids))
                .distinct()
                .all()
            )
            day_id_set = [row[0] for row in day_ids_with_property]
            if day_id_set:
                q = q.filter(TimesheetDay.id.in_(day_id_set))
            else:
                q = q.filter(TimesheetDay.id == -1)
        else:
            q = q.filter(TimesheetDay.id == -1)

    days = q.all()

    total_days = len(days)
    status_counts = {}
    total_hours = 0.0
    uncoded = 0.0

    for d in days:
        s = d.status.value if d.status else "draft"
        status_counts[s] = status_counts.get(s, 0) + 1
        if d.effective_total_hours:
            total_hours += float(d.effective_total_hours)
        if d.uncoded_hours:
            uncoded += float(d.uncoded_hours)

    return TimesheetReportSummary(
        total_days=total_days,
        by_status=[StatusCount(status=k, count=v) for k, v in status_counts.items()],
        total_hours=round(total_hours, 1),
        avg_hours_per_day=round(total_hours / total_days, 1) if total_days > 0 else 0,
        uncoded_hours=round(uncoded, 1),
    )


@router.get("/timesheets/export")
def timesheet_report_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    q = db.query(TimesheetDay).filter(TimesheetDay.company_id == current_user.company_id)
    q = _date_filter(q, TimesheetDay, "work_date", start_date, end_date)

    if property_id is not None:
        block_ids = [
            row[0] for row in
            db.query(VineyardBlock.id).filter(VineyardBlock.property_id == property_id).all()
        ]
        if block_ids:
            day_ids = [
                row[0] for row in
                db.query(TimeEntry.timesheet_day_id)
                .join(Task, TimeEntry.task_id == Task.id)
                .filter(Task.block_id.in_(block_ids))
                .distinct()
                .all()
            ]
            if day_ids:
                q = q.filter(TimesheetDay.id.in_(day_ids))
            else:
                q = q.filter(TimesheetDay.id == -1)
        else:
            q = q.filter(TimesheetDay.id == -1)

    days = q.order_by(TimesheetDay.work_date.desc()).all()

    headers = ["ID", "User ID", "Date", "Status", "Day Hours", "Entry Hours", "Uncoded Hours"]
    rows = []
    for d in days:
        rows.append([
            d.id,
            d.user_id,
            str(d.work_date),
            d.status.value if d.status else "",
            float(d.day_hours) if d.day_hours else "",
            float(d.entry_hours) if d.entry_hours else "",
            float(d.uncoded_hours) if d.uncoded_hours else "",
        ])
    return _csv_response(rows, headers, "timesheets_report.csv")


# ── Asset Reports ─────────────────────────────────────────────────────
@router.get("/assets/summary", response_model=AssetReportSummary)
def asset_report_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    q = db.query(Asset).filter(Asset.company_id == current_user.company_id)
    assets = q.all()

    total = len(assets)
    status_counts = {}
    category_counts = {}
    total_value = 0.0
    maintenance_due = 0

    for a in assets:
        s = a.status or "active"
        status_counts[s] = status_counts.get(s, 0) + 1

        c = a.category or "other"
        category_counts[c] = category_counts.get(c, 0) + 1

        if a.current_value:
            total_value += float(a.current_value)
        if s == "maintenance":
            maintenance_due += 1

    return AssetReportSummary(
        total_assets=total,
        by_status=[StatusCount(status=k, count=v) for k, v in status_counts.items()],
        by_category=[CategoryCount(category=k, count=v) for k, v in category_counts.items()],
        total_value=round(total_value, 2),
        maintenance_due=maintenance_due,
    )


@router.get("/assets/export")
def asset_report_export(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    q = db.query(Asset).filter(Asset.company_id == current_user.company_id)
    assets = q.order_by(Asset.created_at.desc()).all()

    headers = ["ID", "Name", "Category", "Status", "Type", "Purchase Date", "Purchase Price", "Current Value"]
    rows = []
    for a in assets:
        rows.append([
            a.id,
            a.name or "",
            a.category or "",
            a.status or "",
            a.asset_type or "",
            str(a.purchase_date) if a.purchase_date else "",
            float(a.purchase_price) if a.purchase_price else "",
            float(a.current_value) if a.current_value else "",
        ])
    return _csv_response(rows, headers, "assets_report.csv")


# ── Contractor Reports ────────────────────────────────────────────────
@router.get("/contractors/summary", response_model=ContractorReportSummary)
def contractor_report_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    """Aggregate contractor activity for the company in the date range:
    completed jobs + hours, site visits, top contributors, per-property
    visit breakdown. Powers the Reports tab "Contractor Activity" card."""
    company_id = current_user.company_id

    # Total active relationships (not date-scoped — "how many contractors
    # are we currently engaged with" is a now-state question).
    total_active = db.query(func.count(ContractorRelationship.id)).filter(
        ContractorRelationship.company_id == company_id,
        ContractorRelationship.status == "active",
    ).scalar() or 0

    # Completed work in range — joined to actual_end so we count when the
    # work was wrapped up, not when assigned.
    asn_q = db.query(ContractorAssignment).filter(
        ContractorAssignment.company_id == company_id,
        ContractorAssignment.status == "completed",
    )
    asn_q = _date_filter(asn_q, ContractorAssignment, "actual_end", start_date, end_date)
    completed_assignments = asn_q.all()

    jobs_completed = len(completed_assignments)
    total_hours = sum(float(a.actual_hours_worked or 0) for a in completed_assignments)

    # Top contractors by hours in range
    top_q = db.query(
        ContractorAssignment.contractor_id.label("cid"),
        func.coalesce(func.sum(ContractorAssignment.actual_hours_worked), 0).label("hours"),
        func.count(ContractorAssignment.id).label("jobs"),
    ).filter(
        ContractorAssignment.company_id == company_id,
        ContractorAssignment.status == "completed",
    )
    top_q = _date_filter(top_q, ContractorAssignment, "actual_end", start_date, end_date)
    top_rows = top_q.group_by(ContractorAssignment.contractor_id).order_by(func.coalesce(func.sum(ContractorAssignment.actual_hours_worked), 0).desc()).limit(5).all()

    top_contractor_ids = [r.cid for r in top_rows]
    contractor_name_map = {}
    if top_contractor_ids:
        for c in db.query(Contractor).filter(Contractor.id.in_(top_contractor_ids)).all():
            full = f"{(c.first_name or '').strip()} {(c.last_name or '').strip()}".strip() or (c.email or f"Contractor {c.id}")
            contractor_name_map[c.id] = full

    top_contractors = [
        TopContractor(
            contractor_id=r.cid,
            contractor_name=contractor_name_map.get(r.cid, f"Contractor {r.cid}"),
            jobs_completed=int(r.jobs or 0),
            hours_worked=float(r.hours or 0),
        )
        for r in top_rows
    ]

    # Visits — count ContractorMovement rows in range; optional property
    # filter applied to both the count and the per-property breakdown.
    mov_q = db.query(ContractorMovement).filter(ContractorMovement.company_id == company_id)
    mov_q = _date_filter(mov_q, ContractorMovement, "arrival_datetime", start_date, end_date)
    if property_id is not None:
        mov_q = mov_q.filter(ContractorMovement.property_id == property_id)
    movements = mov_q.all()

    total_visits = len(movements)
    unique_contractors = len({m.contractor_id for m in movements if m.contractor_id})

    # Per-property breakdown — group at the DB level for efficiency
    prop_q = db.query(
        ContractorMovement.property_id.label("pid"),
        func.count(ContractorMovement.id).label("cnt"),
    ).filter(ContractorMovement.company_id == company_id)
    prop_q = _date_filter(prop_q, ContractorMovement, "arrival_datetime", start_date, end_date)
    if property_id is not None:
        prop_q = prop_q.filter(ContractorMovement.property_id == property_id)
    prop_rows = prop_q.group_by(ContractorMovement.property_id).order_by(func.count(ContractorMovement.id).desc()).all()

    prop_ids = [r.pid for r in prop_rows if r.pid is not None]
    property_name_map = {}
    if prop_ids:
        for p in db.query(Property).filter(Property.id.in_(prop_ids)).all():
            property_name_map[p.id] = p.name

    visits_by_property = [
        PropertyVisitCount(
            property_id=r.pid,
            property_name=property_name_map.get(r.pid) if r.pid else "Unassigned",
            visit_count=int(r.cnt or 0),
        )
        for r in prop_rows
    ]

    return ContractorReportSummary(
        total_active_relationships=int(total_active),
        jobs_completed=jobs_completed,
        total_hours_worked=round(total_hours, 2),
        total_visits=total_visits,
        unique_contractors_visited=unique_contractors,
        top_contractors_by_hours=top_contractors,
        visits_by_property=visits_by_property,
    )


@router.get("/contractors/export")
def contractor_report_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    """CSV of completed contractor assignments in range — one row per
    assignment with contractor name, task title, hours, dates."""
    company_id = current_user.company_id

    rows_q = (
        db.query(ContractorAssignment, Contractor, Task)
        .join(Contractor, Contractor.id == ContractorAssignment.contractor_id)
        .outerjoin(Task, Task.id == ContractorAssignment.task_id)
        .filter(
            ContractorAssignment.company_id == company_id,
            ContractorAssignment.status == "completed",
        )
    )
    rows_q = _date_filter(rows_q, ContractorAssignment, "actual_end", start_date, end_date)
    rows_data = rows_q.order_by(ContractorAssignment.actual_end.desc().nulls_last()).all()

    headers = ["Assignment ID", "Contractor", "Task ID", "Task Title", "Scheduled Start", "Scheduled End", "Actual Start", "Actual End", "Hours Worked"]
    out_rows = []
    for a, c, t in rows_data:
        contractor_name = f"{(c.first_name or '').strip()} {(c.last_name or '').strip()}".strip() or c.email or f"Contractor {c.id}"
        out_rows.append([
            a.id,
            contractor_name,
            a.task_id or "",
            t.title if t else (a.work_description or ""),
            str(a.scheduled_start) if a.scheduled_start else "",
            str(a.scheduled_end) if a.scheduled_end else "",
            str(a.actual_start) if a.actual_start else "",
            str(a.actual_end) if a.actual_end else "",
            float(a.actual_hours_worked) if a.actual_hours_worked else "",
        ])
    return _csv_response(out_rows, headers, "contractors_report.csv")


# ══════════════════════════════════════════════════════════════════════
# OPERATIONS
# ══════════════════════════════════════════════════════════════════════

# Two Task columns exist purely to link a task to another task, and BOTH will
# double-count a naive total. The model comments say so; this is the one place
# that has to act on it.
#
#   source_task_id  — spray-coverage clones. A clone is a coverage record for a
#                     second block; labour and stock stay on the origin task, so
#                     a clone must never contribute hours OR a task count.
#   parent_task_id  — repair roll-ups. Both parent and children are real tasks
#                     with real time entries, so hours sum across both, but the
#                     JOB count is top-level only, or a forty-repair roll-up
#                     reads as forty-one jobs.
def _exclude_clones(query):
    return query.filter(Task.source_task_id.is_(None))


def _today():
    return datetime.now(timezone.utc).date()


def _block_label(block: Optional[VineyardBlock]) -> str:
    if block is None:
        return "Unallocated"
    return block.block_name or f"Block {block.id}"


def _task_hours(db: Session, task_ids: List[int]) -> dict:
    """
    Real labour hours per task id.

    `Task.actual_hours` is documented as "Calculated from TimeEntry" but NOTHING
    in the backend ever writes it — it defaults to 0.00 and stays there, so any
    report reading it shows a vineyard where no one has ever worked. Hours are
    therefore summed from the two places they are actually recorded:

      TimeEntry.hours                        — staff, via timesheets
      ContractorAssignment.actual_hours_worked — contractors, set on completion

    Both key on task_id, and a task can carry both.
    """
    hours: dict = {}
    if not task_ids:
        return hours

    for task_id, total in db.query(
        TimeEntry.task_id, func.coalesce(func.sum(TimeEntry.hours), 0)
    ).filter(TimeEntry.task_id.in_(task_ids)).group_by(TimeEntry.task_id).all():
        if task_id is not None:
            hours[task_id] = hours.get(task_id, 0.0) + float(total or 0)

    for task_id, total in db.query(
        ContractorAssignment.task_id,
        func.coalesce(func.sum(ContractorAssignment.actual_hours_worked), 0),
    ).filter(ContractorAssignment.task_id.in_(task_ids)).group_by(ContractorAssignment.task_id).all():
        if task_id is not None:
            hours[task_id] = hours.get(task_id, 0.0) + float(total or 0)

    return hours


def _may_see_costs(current_user: User) -> bool:
    """`costs:read` — admin only, and deliberately NOT `reports:read`.

    A company_manager holds `reports:read`. A task cost divided by its hours is
    an hourly rate, so every cost figure in this module is gated as tightly as
    the pay rates themselves. When this is False the cost objects are never
    built, so nothing to strip client-side and nothing to leak in a CSV.
    """
    return current_user.has_permission("costs", "read")


def _task_costs(db: Session, task_ids: List[int]) -> dict:
    """Live cost snapshots per task id.

    The cost sibling of `_task_hours`, and it works the same way: give it the
    task ids the report already has and it returns what is known, with tasks
    that have no snapshot simply absent from the dict rather than zeroed.

    **Live rows only.** A recompute supersedes rather than overwrites, so a task
    can hold several `task_cost` rows and only one is current. The partial
    unique index `uq_task_cost_live` is what guarantees there is at most one.
    """
    costs: dict = {}
    if not task_ids:
        return costs
    rows = (
        db.query(TaskCost)
        .filter(TaskCost.task_id.in_(task_ids), TaskCost.is_superseded.is_(False))
        .all()
    )
    for row in rows:
        costs[row.task_id] = row
    return costs


class _CostAccumulator:
    """Sums cost snapshots without ever inventing a zero.

    Three rules, all of them the same rule:

    * A component nobody priced stays **None**. Summing None as 0.00 turns "we
      do not know what the spray cost" into "the spray was free".
    * A task with no snapshot is counted in `uncosted`, never as 0.00. Every
      task completed before costing shipped is in this bucket, so a total over
      a historical period is an understatement by construction and has to say
      so.
    * `is_complete` travels WITH the figures. A client cannot end up holding a
      number without also holding the reason it might be short.
    """

    # (breakdown field, TaskCost column)
    COMPONENTS = (
        ("labour_staff", "labour_cost_staff"),
        ("labour_contractor", "labour_cost_contractor"),
        ("consumables", "consumable_cost"),
        ("equipment", "asset_cost"),
        ("total", "total_cost"),
    )

    def __init__(self):
        self.currency = "NZD"
        self._sums = {name: None for name, _ in self.COMPONENTS}
        self.costed = 0
        self.uncosted = 0
        self.incomplete = 0
        self.unrated_hours = 0.0

    def add(self, cost) -> None:
        """Fold in one task's snapshot, or None for a task that has no cost."""
        if cost is None:
            self.uncosted += 1
            return
        self.costed += 1
        if cost.currency:
            self.currency = cost.currency
        if not cost.is_complete:
            self.incomplete += 1
        self.unrated_hours += float(cost.unrated_staff_hours or 0)
        for name, attr in self.COMPONENTS:
            value = getattr(cost, attr, None)
            if value is None:
                continue
            self._sums[name] = (self._sums[name] or 0.0) + float(value)

    @property
    def total(self) -> Optional[float]:
        return self._sums["total"]

    def breakdown(self) -> CostBreakdown:
        notes = []
        if self.uncosted:
            notes.append(
                f"{self.uncosted} task{'s' if self.uncosted != 1 else ''} in this period "
                f"{'have' if self.uncosted != 1 else 'has'} no cost snapshot, so the totals are "
                f"lower than the real spend. Costs are captured at completion; anything completed "
                f"before costing was switched on has none."
            )
        if self.incomplete:
            notes.append(
                f"{self.incomplete} costed task{'s are' if self.incomplete != 1 else ' is'} short — "
                f"{round(self.unrated_hours, 1)} h of labour with no resolvable pay rate, or "
                f"machinery hours with no operating rate."
            )
        return CostBreakdown(
            currency=self.currency,
            labour_staff=_round_money(self._sums["labour_staff"]),
            labour_contractor=_round_money(self._sums["labour_contractor"]),
            consumables=_round_money(self._sums["consumables"]),
            equipment=_round_money(self._sums["equipment"]),
            total=_round_money(self._sums["total"]),
            costed_tasks=self.costed,
            uncosted_tasks=self.uncosted,
            incomplete_tasks=self.incomplete,
            is_complete=not self.uncosted and not self.incomplete,
            warning=" ".join(notes) or None,
        )


def _round_money(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(value, 2)


def _sum_optional(*values) -> Optional[float]:
    """Sum the values that are known. None when none of them are.

    Used for the labour column, which is staff plus contractor: a company with
    no contractors must not have its staff wages turned into None, and a
    contractor-only task must not report 0.00 for the staff half.
    """
    known = [v for v in values if v is not None]
    return round(sum(known), 2) if known else None


def _csv_money(value: Optional[float]):
    """An empty cell for an unknown figure. A spreadsheet sums blanks as zero
    and prints 0.00 as a fact, so the blank is the honest one."""
    return "" if value is None else value


def _per_unit(total: Optional[float], units: Optional[float]) -> Optional[float]:
    """A rate, or None when either side of the division is unknown.

    Zero units is not a rate of zero — it is no rate at all, and rendering it as
    0.00 invents a denominator nobody supplied.
    """
    if total is None or not units:
        return None
    return round(total / float(units), 2)


def _company_blocks(db: Session, current_user: User) -> dict:
    return {
        b.id: b for b in db.query(VineyardBlock).filter(
            VineyardBlock.company_id == current_user.company_id
        ).all()
    }


def _property_names(db: Session) -> dict:
    return {p.id: (p.name or f"Property {p.id}") for p in db.query(Property).all()}


@router.get("/work-by-block/summary", response_model=WorkByBlockSummary)
def work_by_block_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None, description="Filter by property"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    """Completed work rolled up by block: hours, rows, area, and — for a holder
    of `costs:read` — what it cost and what that is per hectare.

    **Cost follows the same allocation as hours: whole, onto `Task.block_id`.**
    A task that spanned three blocks lands entirely on the one it names. That is
    not obviously right, but it is what the hours column has always done, and a
    cost allocated differently from the hours beside it would make cost-per-hour
    disagree with itself row by row. Change both together or neither.
    """
    q = db.query(Task).filter(
        Task.company_id == current_user.company_id,
        Task.status == TaskStatus.completed,
    )
    q = _exclude_clones(q)
    q = _date_filter(q, Task, "completed_at", start_date, end_date)
    q = _property_filter_tasks(q, db, current_user, property_id)
    tasks = q.all()

    blocks = _company_blocks(db, current_user)
    props = _property_names(db)
    task_hours = _task_hours(db, [t.id for t in tasks])

    show_costs = _may_see_costs(current_user)
    task_costs = _task_costs(db, [t.id for t in tasks]) if show_costs else {}
    company_costs = _CostAccumulator() if show_costs else None

    agg: dict = {}
    unallocated_hours = 0.0
    unallocated_tasks = 0

    for t in tasks:
        hours = task_hours.get(t.id, 0.0)
        # Roll-up children carry their own hours but must not inflate the job count.
        counts_as_job = t.parent_task_id is None

        # Every task feeds the company total, block or no block — the same
        # treatment the hours get, where unallocated time is reported separately
        # but still counted.
        if company_costs is not None:
            company_costs.add(task_costs.get(t.id))

        if t.block_id is None:
            unallocated_hours += hours
            if counts_as_job:
                unallocated_tasks += 1
            continue

        row = agg.setdefault(t.block_id, {"tasks": 0, "hours": 0.0, "rows": 0, "area": 0.0,
                                          "costs": _CostAccumulator() if show_costs else None})
        row["hours"] += hours
        row["rows"] += int(t.rows_completed or 0)
        row["area"] += float(t.area_completed_hectares or 0)
        if counts_as_job:
            row["tasks"] += 1
        if row["costs"] is not None:
            row["costs"].add(task_costs.get(t.id))

    out: List[BlockWorkRow] = []
    for block_id, row in agg.items():
        b = blocks.get(block_id)
        area = round(float(b.area), 2) if b and b.area else None
        acc = row["costs"]
        out.append(BlockWorkRow(
            block_id=block_id,
            block_name=_block_label(b),
            property_name=props.get(b.property_id) if b else None,
            variety=b.variety if b else None,
            area_hectares=area,
            tasks_completed=row["tasks"],
            hours=round(row["hours"], 1),
            rows_completed=row["rows"],
            area_worked_hectares=round(row["area"], 2),
            # Only meaningful against a known block area. None beats a per-hectare
            # figure invented from a missing denominator.
            hours_per_hectare=round(row["hours"] / area, 1) if area else None,
            costs=acc.breakdown() if acc is not None else None,
            # Same denominator as hours/ha, so the two columns are comparable.
            cost_per_hectare=_per_unit(acc.total, area) if acc is not None else None,
        ))
    out.sort(key=lambda r: r.hours, reverse=True)

    return WorkByBlockSummary(
        blocks=out,
        total_tasks=sum(r.tasks_completed for r in out) + unallocated_tasks,
        total_hours=round(sum(r.hours for r in out) + unallocated_hours, 1),
        total_area_worked=round(sum(r.area_worked_hectares for r in out), 2),
        unallocated_hours=round(unallocated_hours, 1),
        unallocated_tasks=unallocated_tasks,
        costs=company_costs.breakdown() if company_costs is not None else None,
    )


@router.get("/work-by-block/export")
def work_by_block_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    summary = work_by_block_summary(start_date, end_date, property_id, db, current_user)
    # The cost columns exist in the file only for someone allowed to see them.
    # Emitting empty columns instead would tell a manager exactly how many cost
    # fields they are missing, and invites a client to "fill them in later".
    show_costs = summary.costs is not None
    headers = ["Block", "Property", "Variety", "Block Area (ha)", "Tasks Completed",
               "Hours", "Rows Completed", "Area Worked (ha)", "Hours / ha"]
    if show_costs:
        headers += [f"Labour ({summary.costs.currency})", "Consumables", "Equipment",
                    "Total Cost", "Cost / ha", "Costed Tasks", "Uncosted Tasks"]

    rows = []
    for r in summary.blocks:
        row = [
            r.block_name, r.property_name or "", r.variety or "",
            r.area_hectares if r.area_hectares is not None else "",
            r.tasks_completed, r.hours, r.rows_completed, r.area_worked_hectares,
            r.hours_per_hectare if r.hours_per_hectare is not None else "",
        ]
        if show_costs:
            c = r.costs
            row += [
                _csv_money(_sum_optional(c.labour_staff, c.labour_contractor)),
                _csv_money(c.consumables), _csv_money(c.equipment), _csv_money(c.total),
                _csv_money(r.cost_per_hectare), c.costed_tasks, c.uncosted_tasks,
            ]
        rows.append(row)

    if summary.unallocated_tasks or summary.unallocated_hours:
        tail = ["Unallocated (no block)", "", "", "", summary.unallocated_tasks,
                summary.unallocated_hours, "", "", ""]
        if show_costs:
            tail += ["", "", "", "", "", "", ""]
        rows.append(tail)
    return _csv_response(rows, headers, "work_by_block.csv")


# ── Counts (bud / bunch / flower) ─────────────────────────────────────
#
# What a season's counting actually produced, aggregated to a mean and a spread
# per block. Bud counts are the first measurement of the year and, at the time
# this was written, 36 of the 48 observation spots in the entire database were
# bud counts — so this is where the observation data actually is.

class _CountAccumulator:
    """Mean, spread and target attainment for one group of spots."""

    def __init__(self, key: str, label: str):
        self.key = key
        self.label = label
        self.values: List[float] = []     # one per spot
        self.weights: List[float] = []    # vines behind each spot
        self.targets: List[tuple] = []    # (target, weight)
        self.assumed_weight = 0           # spots whose template has no weight field

    def add(self, value: float, weight: Optional[float], target: Optional[float]) -> None:
        w = weight if weight and weight > 0 else 1.0
        if not weight or weight <= 0:
            self.assumed_weight += 1
        self.values.append(value)
        self.weights.append(w)
        if target is not None:
            self.targets.append((target, w))

    @property
    def spots(self) -> int:
        return len(self.values)

    def stat(self, **extra) -> CountStat:
        n = len(self.values)
        if n == 0:
            return CountStat(key=self.key, label=self.label, **extra)

        total_weight = sum(self.weights)
        # Weighted: a spot covering five vines is five vines' worth of evidence.
        mean = sum(v * w for v, w in zip(self.values, self.weights)) / total_weight

        sd = None
        sd_note = None
        sd_basis = None
        if n < MIN_SPOTS_FOR_SD:
            sd_note = (
                f"{n} spot{'s' if n != 1 else ''} — a spread needs at least "
                f"{MIN_SPOTS_FOR_SD}."
            )
        else:
            # Unweighted sample SD of the SPOT values. Deliberately not a
            # weighted SD: each spot value is already an average of the vines
            # behind it, so this measures variation between sampling points.
            plain_mean = sum(self.values) / n
            variance = sum((v - plain_mean) ** 2 for v in self.values) / (n - 1)
            sd = variance ** 0.5
            if all(w == 1 for w in self.weights):
                sd_basis = "between vines"
            else:
                sd_basis = "between spots"
                sd_note = (
                    "Spots cover more than one vine each, so this is the spread "
                    "between sampling points, not between vines — the true "
                    "vine-to-vine spread is wider."
                )

        target = None
        percent = None
        if self.targets:
            tw = sum(w for _, w in self.targets)
            target = sum(t * w for t, w in self.targets) / tw
            if target:
                percent = mean / target * 100

        return CountStat(
            key=self.key,
            label=self.label,
            spots=n,
            vines_sampled=round(total_weight, 1),
            mean=round(mean, 2),
            sd=round(sd, 2) if sd is not None else None,
            sd_basis=sd_basis,
            sd_note=sd_note,
            # Only where a spread exists AND there is a mean to divide by.
            cv_percent=round(sd / mean * 100, 1) if sd is not None and mean else None,
            min=round(min(self.values), 2),
            max=round(max(self.values), 2),
            target=round(target, 2) if target is not None else None,
            percent_of_target=round(percent, 1) if percent is not None else None,
            **extra,
        )


def _metric_template_ids(db: Session, current_user: User, metric: CountMetric) -> tuple:
    """(template ids for this metric, ids whose template declares no weight field).

    Scans `fields_json` in Python rather than querying inside the JSON: there
    are tens of templates, and a field list is a plain array whose shape has
    changed over time.
    """
    templates = db.query(ObservationTemplate).filter(
        or_(
            ObservationTemplate.company_id == current_user.company_id,
            ObservationTemplate.company_id.is_(None),
        )
    ).all()

    ids, weightless = [], set()
    for t in templates:
        names = {
            f.get("name") for f in (t.fields_json or [])
            if isinstance(f, dict)
        }
        matches_type = t.type in metric.template_types
        matches_field = any(name in names for name in metric.value_fields)
        if matches_type or matches_field:
            ids.append(t.id)
            if metric.weight_field and metric.weight_field not in names:
                weightless.add(t.id)
    return ids, weightless


@router.get("/counts/summary", response_model=CountReportSummary)
def count_report_summary(
    metric: Optional[str] = Query(None, description="bud_count | shoot_count | flower_set | bunch_count"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None, description="Filter by property"),
    run_id: Optional[int] = Query(None, description="Narrow to a single observation run"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    """What the counting found, per block: mean, spread and attainment vs target.

    Reports the mean **weighted by vines sampled** — a spot covering five vines
    is five vines' worth of evidence and must not count the same as one covering
    a single vine.

    The spread is reported only where the data supports one. See
    `MIN_SPOTS_FOR_SD`: below three spots there is no spread to report, and the
    row says so instead of leaving a blank that reads as zero.

    `run_id` narrows everything to one run, which is how the observation
    management page shows a run its own figures. **The same function, so the
    two surfaces cannot drift** — a run summary that disagreed with the report
    it links to would be worse than not having one. With `run_id` and no
    `metric`, the metric is inferred from the run's own template, so a caller
    holding a run does not have to know what it measures.
    """
    run = None
    if run_id is not None:
        run = db.get(ObservationRun, run_id)
        if run is None or run.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Observation run not found")
        if metric is None:
            metric = metric_for_template(db.get(ObservationTemplate, run.template_id))
            if metric is None:
                # A real answer, not an error: plenty of runs count nothing.
                return CountReportSummary(
                    metric="none", metric_label="Not a count",
                    overall=CountStat(key="all", label="All blocks"),
                    warnings=["This run does not record a countable measurement."],
                )

    spec = COUNT_METRICS.get(metric or "bud_count")
    if spec is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown metric '{metric}'. Try one of: {', '.join(COUNT_METRICS)}",
        )

    template_ids, weightless = _metric_template_ids(db, current_user, spec)
    warnings: List[str] = []
    if not template_ids:
        return CountReportSummary(
            metric=spec.key, metric_label=spec.label, unit=spec.unit,
            overall=CountStat(key="all", label="All blocks"),
            warnings=[f"No observation template records {spec.label.lower()} yet."],
        )

    block_ids = _visible_block_ids(db, current_user, property_id)

    q = (
        db.query(ObservationSpot, ObservationRun)
        .join(ObservationRun, ObservationRun.id == ObservationSpot.run_id)
        .filter(
            ObservationSpot.company_id == current_user.company_id,
            ObservationRun.template_id.in_(template_ids),
        )
    )

    # Property scoping via the block chain, under the NULL-property rule: a spot
    # with no block is company-wide and is kept unless a property was named.
    if property_id is not None:
        if not block_ids:
            q = q.filter(ObservationSpot.id == -1)
        else:
            q = q.filter(ObservationSpot.block_id.in_(block_ids))
    elif not block_ids:
        q = q.filter(ObservationSpot.block_id.is_(None))
    else:
        q = q.filter(
            or_(ObservationSpot.block_id.in_(block_ids), ObservationSpot.block_id.is_(None))
        )

    if run_id is not None:
        # Block scoping above still applies: narrowing to a run must not widen
        # what the caller can see.
        q = q.filter(ObservationSpot.run_id == run_id)

    q = _date_filter(q, ObservationSpot, "observed_at", start_date, end_date)
    pairs = q.all()

    blocks = _company_blocks(db, current_user)
    props = _property_names(db)

    overall = _CountAccumulator("all", "All blocks")
    by_block: dict = {}
    by_run: dict = {}
    run_meta: dict = {}
    templates_by_id = {
        t.id: t.name for t in db.query(ObservationTemplate).filter(
            ObservationTemplate.id.in_(template_ids)
        ).all()
    }
    unreadable = 0
    weight_assumed_templates = set()

    for spot, run in pairs:
        data = spot.data_json or {}
        value = _first_field(data, spec.value_fields)
        if value is None:
            # The spot exists but carries nothing for this metric — a run that
            # was opened and never filled in, or a field renamed since.
            unreadable += 1
            continue

        weight = _first_field(data, [spec.weight_field]) if spec.weight_field else None
        target = _first_field(data, [spec.target_field]) if spec.target_field else None
        if run.template_id in weightless:
            weight_assumed_templates.add(run.template_id)

        overall.add(value, weight, target)

        block_key = spot.block_id if spot.block_id is not None else run.block_id
        label = _block_label(blocks.get(block_key)) if block_key else "Unallocated"
        by_block.setdefault(block_key, _CountAccumulator(str(block_key), label)).add(value, weight, target)

        # A run is identified by WHERE and WHEN, not by its own name — those
        # are auto-generated and read "Run - template 4", which distinguishes
        # nothing when a block is counted three times in a season.
        if run.id not in by_run:
            by_run[run.id] = _CountAccumulator(str(run.id), label)
            run_meta[run.id] = {
                "block_id": block_key,
                "template_name": templates_by_id.get(run.template_id),
                "observed": spot.observed_at or run.observed_at_start or run.scheduled_date,
            }
        else:
            # Earliest spot wins: a run spanning midnight should read as the day
            # the counting started.
            seen = run_meta[run.id]
            when = spot.observed_at or run.observed_at_start
            if when and (seen["observed"] is None or when < seen["observed"]):
                seen["observed"] = when
        by_run[run.id].add(value, weight, target)

    block_rows = []
    for block_key, acc in by_block.items():
        b = blocks.get(block_key) if block_key else None
        block_rows.append(acc.stat(
            block_id=block_key,
            property_name=props.get(b.property_id) if b else None,
            variety=b.variety if b else None,
        ))
    block_rows.sort(key=lambda r: r.spots, reverse=True)

    run_rows = []
    for rid, acc in by_run.items():
        meta = run_meta.get(rid, {})
        b = blocks.get(meta.get("block_id")) if meta.get("block_id") else None
        when = meta.get("observed")
        run_rows.append(acc.stat(
            block_id=meta.get("block_id"),
            property_name=props.get(b.property_id) if b else None,
            variety=b.variety if b else None,
            template_name=meta.get("template_name"),
            observed_on=(when.date().isoformat() if hasattr(when, "date") else
                         (when.isoformat() if when else None)),
        ))
    # Newest first: what was counted this week matters more than last spring.
    run_rows.sort(key=lambda r: (r.observed_on or "", r.spots), reverse=True)

    if unreadable:
        warnings.append(
            f"{unreadable} spot{'s' if unreadable != 1 else ''} in range recorded no "
            f"{spec.label.lower()} value and {'are' if unreadable != 1 else 'is'} not counted."
        )
    if weight_assumed_templates:
        warnings.append(
            f"{len(weight_assumed_templates)} template"
            f"{'s do' if len(weight_assumed_templates) != 1 else ' does'} not record how many "
            f"vines each spot covers, so those spots are weighted as one vine each."
        )
    thin = [r for r in block_rows if r.sd is None and r.spots]
    if thin:
        warnings.append(
            f"{len(thin)} block{'s have' if len(thin) != 1 else ' has'} too few spots for a "
            f"spread — a mean from one or two readings is not a block average."
        )

    return CountReportSummary(
        metric=spec.key,
        metric_label=spec.label,
        unit=spec.unit,
        overall=overall.stat(),
        blocks=block_rows,
        runs=run_rows,
        warnings=warnings,
    )


@router.get("/counts/export")
def count_report_export(
    metric: Optional[str] = Query(None),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    run_id: Optional[int] = Query(None),
    section: str = Query("blocks", pattern="^(blocks|runs)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    summary = count_report_summary(
        metric, start_date, end_date, property_id, run_id, db, current_user
    )
    rows_in = summary.runs if section == "runs" else summary.blocks
    # Both sections are keyed on the block; a run row adds when and what.
    label = "Block"

    headers = [label, "Property", "Variety"]
    if section == "runs":
        headers += ["Date", "Template"]
    headers += ["Spots", "Vines Sampled",
                f"Mean ({summary.unit or ''})".strip(), "SD", "SD Basis", "CV %",
                "Min", "Max", "Target", "% of Target"]
    rows = []
    for r in rows_in:
        rows.append([
            r.label, r.property_name or "", r.variety or "",
            *([r.observed_on or "", r.template_name or ""] if section == "runs" else []),
            r.spots, r.vines_sampled,
            r.mean if r.mean is not None else "",
            # Blank, never 0 — the spread does not exist for this row.
            r.sd if r.sd is not None else "",
            r.sd_basis or "",
            r.cv_percent if r.cv_percent is not None else "",
            r.min if r.min is not None else "",
            r.max if r.max is not None else "",
            r.target if r.target is not None else "",
            r.percent_of_target if r.percent_of_target is not None else "",
        ])
    return _csv_response(rows, headers, f"{summary.metric}_by_{section}.csv")


# ── Cost report ───────────────────────────────────────────────────────
class _CostGroup:
    """One row of the cost report while it is being built.

    Estimated-vs-actual is the fiddly part. The variance is computed ONLY over
    tasks that actually carry an estimate — comparing every task's real hours
    against the handful that were estimated would report a group where one job
    in twenty was estimated as massively over, which is a statement about the
    estimating habit, not the work.
    """

    def __init__(self, key: str):
        self.key = key
        self.tasks = 0
        self.hours = 0.0
        self.area = 0.0
        self.estimated_hours = 0.0
        self.hours_of_estimated = 0.0
        self.has_estimate = False
        self.costs = _CostAccumulator()

    def add(self, task, hours: float, cost) -> None:
        # Roll-up children carry hours and cost but must not inflate the count,
        # exactly as in work-by-block.
        if task.parent_task_id is None:
            self.tasks += 1
        self.hours += hours
        self.area += float(task.area_completed_hectares or 0)
        if task.estimated_hours is not None:
            self.has_estimate = True
            self.estimated_hours += float(task.estimated_hours)
            self.hours_of_estimated += hours
        self.costs.add(cost)

    def row(self) -> OperationCostRow:
        breakdown = self.costs.breakdown()
        return OperationCostRow(
            key=self.key,
            tasks=self.tasks,
            hours=round(self.hours, 1),
            estimated_hours=round(self.estimated_hours, 1) if self.has_estimate else None,
            hours_variance=(
                round(self.hours_of_estimated - self.estimated_hours, 1)
                if self.has_estimate else None
            ),
            area_worked_hectares=round(self.area, 2),
            costs=breakdown,
            cost_per_hour=_per_unit(breakdown.total, self.hours),
            # Area WORKED, not block area: an operation crosses blocks, and the
            # hectares it actually covered are the only denominator that means
            # anything at this grain.
            cost_per_hectare=_per_unit(breakdown.total, self.area),
        )


def _cost_setup_warnings(db: Session, company_id: int) -> List[str]:
    """What is missing before a cost figure can be believed.

    Reported up front rather than left to be inferred from a page of blanks —
    every one of these makes the totals below understate the real spend.
    """
    warnings: List[str] = []
    settings = db.query(CompanyCostSettings).filter(
        CompanyCostSettings.company_id == company_id
    ).first()
    rate_count = db.query(func.count(UserPayRate.id)).filter(
        UserPayRate.company_id == company_id
    ).scalar() or 0

    if rate_count == 0 and not (settings and settings.default_hourly_rate):
        warnings.append(
            "No pay rates are set, so staff labour cannot be priced at all. "
            "Manage → Costs is where they go."
        )
    if not settings or settings.on_cost_multiplier is None:
        warnings.append(
            "No on-cost multiplier is set, so wages count at the bare hourly rate. "
            "True employment cost is roughly 15-20% higher."
        )
    # `asset_type` is 'physical' or 'consumable' — there is no 'equipment'
    # value, and filtering on one silently counts nothing. Retired and disposed
    # kit is excluded: an operating rate it will never use again is not a gap.
    unrated_machines = db.query(func.count(Asset.id)).filter(
        Asset.company_id == company_id,
        Asset.asset_type == "physical",
        Asset.is_active.is_(True),
        Asset.status.in_(("active", "maintenance")),
        Asset.hourly_operating_rate.is_(None),
    ).scalar() or 0
    if unrated_machines:
        warnings.append(
            f"{unrated_machines} piece{'s' if unrated_machines != 1 else ''} of equipment "
            f"{'have' if unrated_machines != 1 else 'has'} no operating rate, so any task using "
            f"{'them' if unrated_machines != 1 else 'it'} reports no machinery cost."
        )
    return warnings


@router.get("/costs/summary", response_model=CostReportSummary)
def cost_report_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None, description="Filter by property"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("costs", "read")),
):
    """What the work cost, by operation and by variety.

    Gated on `costs`, not `reports` — a company_manager holds `reports:read`,
    and a cost divided by its hours is an hourly rate. This is the one report in
    the module a manager cannot open at all, which is why it is its own report
    rather than a section inside another.
    """
    q = db.query(Task).filter(
        Task.company_id == current_user.company_id,
        Task.status == TaskStatus.completed,
    )
    q = _exclude_clones(q)
    q = _date_filter(q, Task, "completed_at", start_date, end_date)
    q = _property_filter_tasks(q, db, current_user, property_id)
    tasks = q.all()

    task_ids = [t.id for t in tasks]
    task_hours = _task_hours(db, task_ids)
    task_costs = _task_costs(db, task_ids)
    blocks = _company_blocks(db, current_user)

    overall = _CostAccumulator()
    by_operation: dict = {}
    by_variety: dict = {}

    for t in tasks:
        hours = task_hours.get(t.id, 0.0)
        cost = task_costs.get(t.id)
        overall.add(cost)

        op_key = t.task_category or "general"
        by_operation.setdefault(op_key, _CostGroup(op_key)).add(t, hours, cost)

        block = blocks.get(t.block_id) if t.block_id else None
        var_key = (block.variety if block and block.variety else "Unspecified")
        by_variety.setdefault(var_key, _CostGroup(var_key)).add(t, hours, cost)

    breakdown = overall.breakdown()

    # The mix only makes sense against a known total. With no total there is
    # nothing to take a percentage OF, and a share of an unknown is not 0%.
    mix_source = [
        ("Labour", _sum_optional(breakdown.labour_staff, breakdown.labour_contractor)),
        ("Consumables", breakdown.consumables),
        ("Equipment", breakdown.equipment),
    ]
    mix = [
        CostMixRow(
            key=label,
            amount=amount,
            share_percent=(
                round(amount / breakdown.total * 100, 1)
                if amount is not None and breakdown.total else None
            ),
        )
        for label, amount in mix_source
    ]

    operations = sorted(
        (g.row() for g in by_operation.values()),
        key=lambda r: (r.costs.total if r.costs.total is not None else -1, r.hours),
        reverse=True,
    )
    varieties = sorted(
        (g.row() for g in by_variety.values()),
        key=lambda r: (r.costs.total if r.costs.total is not None else -1, r.hours),
        reverse=True,
    )
    setup_warnings = _cost_setup_warnings(db, current_user.company_id)

    return CostReportSummary(
        currency=breakdown.currency,
        costs=breakdown,
        by_operation=operations,
        by_variety=varieties,
        mix=mix,
        uncosted_tasks=breakdown.uncosted_tasks,
        rates_configured=not setup_warnings,
        setup_warnings=setup_warnings,
    )


@router.get("/costs/export")
def cost_report_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    section: str = Query("operations", pattern="^(operations|varieties)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("costs", "export")),
):
    """Two tables in one report, so the export names the one it wants —
    the same shape as the health & safety export."""
    summary = cost_report_summary(start_date, end_date, property_id, db, current_user)
    rows_in = summary.by_variety if section == "varieties" else summary.by_operation
    label = "Variety" if section == "varieties" else "Operation"

    headers = [label, "Tasks", "Hours", "Estimated Hours", "Hours Variance", "Area Worked (ha)",
               f"Labour ({summary.currency})", "Consumables", "Equipment", "Total Cost",
               "Cost / Hour", "Cost / ha", "Costed Tasks", "Uncosted Tasks", "Complete"]
    rows = []
    for r in rows_in:
        c = r.costs
        rows.append([
            r.key, r.tasks, r.hours,
            r.estimated_hours if r.estimated_hours is not None else "",
            r.hours_variance if r.hours_variance is not None else "",
            r.area_worked_hectares,
            _csv_money(_sum_optional(c.labour_staff, c.labour_contractor)),
            _csv_money(c.consumables), _csv_money(c.equipment), _csv_money(c.total),
            _csv_money(r.cost_per_hour), _csv_money(r.cost_per_hectare),
            c.costed_tasks, c.uncosted_tasks, "yes" if c.is_complete else "no",
        ])
    return _csv_response(rows, headers, f"costs_by_{section}.csv")


@router.get("/outstanding/summary", response_model=OutstandingSummary)
def outstanding_summary(
    property_id: Optional[int] = Query(None, description="Filter by property"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    """
    Open work and what is late.

    Deliberately NOT date-filtered: an overdue task from three months ago is
    exactly what this report exists to surface, and a date range would hide it.
    """
    q = db.query(Task).filter(
        Task.company_id == current_user.company_id,
        Task.status.notin_([TaskStatus.completed, TaskStatus.cancelled]),
    )
    q = _exclude_clones(q)
    q = _property_filter_tasks(q, db, current_user, property_id)
    tasks = q.all()

    blocks = _company_blocks(db, current_user)
    today = _today()

    priority_counts: dict = {}
    status_counts: dict = {}
    by_block: dict = {}
    by_assignee: dict = {}
    overdue_total = 0
    unscheduled = 0
    unassigned_open = 0
    oldest_days: Optional[int] = None

    task_ids = [t.id for t in tasks]
    assigned_by_task: dict = {}
    if task_ids:
        for a, u in db.query(TaskAssignment, User).join(
            User, TaskAssignment.user_id == User.id
        ).filter(TaskAssignment.task_id.in_(task_ids)).all():
            assigned_by_task.setdefault(a.task_id, []).append(u)

    for t in tasks:
        p = t.priority or "medium"
        priority_counts[p] = priority_counts.get(p, 0) + 1
        s = t.status.value if t.status else "unknown"
        status_counts[s] = status_counts.get(s, 0) + 1

        # A task with no end date is judged on its start date; one with neither
        # is not late, it is unscheduled, which is its own problem.
        due = t.scheduled_end_date or t.scheduled_start_date
        if due is None:
            unscheduled += 1
        overdue = due is not None and due < today
        days = (today - due).days if overdue else None
        if overdue:
            overdue_total += 1
            if oldest_days is None or days > oldest_days:
                oldest_days = days

        row = by_block.setdefault(t.block_id, {"open": 0, "overdue": 0, "oldest": None})
        row["open"] += 1
        if overdue:
            row["overdue"] += 1
            if row["oldest"] is None or days > row["oldest"]:
                row["oldest"] = days

        users = assigned_by_task.get(t.id, [])
        if not users:
            unassigned_open += 1
        for u in users:
            a = by_assignee.setdefault(u.id, {"name": u.full_name or u.email, "open": 0, "overdue": 0})
            a["open"] += 1
            if overdue:
                a["overdue"] += 1

    block_rows = [
        OutstandingBlockRow(
            block_id=bid,
            block_name=_block_label(blocks.get(bid) if bid else None),
            open_count=v["open"],
            overdue_count=v["overdue"],
            oldest_overdue_days=v["oldest"],
        )
        for bid, v in by_block.items()
    ]
    block_rows.sort(key=lambda r: (r.overdue_count, r.open_count), reverse=True)

    assignee_rows = [
        AssigneeRow(user_id=uid, name=v["name"], open_count=v["open"], overdue_count=v["overdue"])
        for uid, v in by_assignee.items()
    ]
    assignee_rows.sort(key=lambda r: (r.overdue_count, r.open_count), reverse=True)

    return OutstandingSummary(
        total_open=len(tasks),
        total_overdue=overdue_total,
        unscheduled=unscheduled,
        oldest_overdue_days=oldest_days,
        by_priority=[StatusCount(status=k, count=v) for k, v in priority_counts.items()],
        by_status=[StatusCount(status=k, count=v) for k, v in status_counts.items()],
        by_block=block_rows,
        by_assignee=assignee_rows,
        unassigned_open=unassigned_open,
    )


@router.get("/outstanding/export")
def outstanding_export(
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    q = db.query(Task).filter(
        Task.company_id == current_user.company_id,
        Task.status.notin_([TaskStatus.completed, TaskStatus.cancelled]),
    )
    q = _exclude_clones(q)
    q = _property_filter_tasks(q, db, current_user, property_id)
    tasks = q.all()

    blocks = _company_blocks(db, current_user)
    today = _today()

    headers = ["Task", "Title", "Block", "Status", "Priority", "Due", "Days Overdue", "Category"]
    rows = []
    for t in tasks:
        due = t.scheduled_end_date or t.scheduled_start_date
        overdue_days = (today - due).days if due and due < today else ""
        rows.append([
            t.task_number, t.title, _block_label(blocks.get(t.block_id)),
            t.status.value if t.status else "", t.priority or "",
            str(due) if due else "", overdue_days, t.task_category or "",
        ])
    # Most overdue first — the reason anyone opens this file.
    rows.sort(key=lambda r: r[6] if isinstance(r[6], int) else -1, reverse=True)
    return _csv_response(rows, headers, "outstanding_work.csv")


# ══════════════════════════════════════════════════════════════════════
# COMPLIANCE
# ══════════════════════════════════════════════════════════════════════

def _iso(value) -> Optional[str]:
    return value.isoformat() if value else None


@router.get("/health-safety/summary", response_model=HealthSafetySummary)
def health_safety_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None, description="Filter by property"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    """
    The H&S pack: incidents in the period, plus the CURRENT risk register.

    Incidents are date-bounded because they are events. Risks are not: an open
    risk that has gone unreviewed for a year is the finding, and filtering it out
    because it was raised before the report window would defeat the purpose.
    """
    today = _today()
    props = _property_names(db)

    iq = db.query(Incident).filter(Incident.company_id == current_user.company_id)
    iq = _date_filter(iq, Incident, "incident_date", start_date, end_date)
    iq = _property_filter_nullable(iq, Incident, db, current_user, property_id)
    incidents = iq.order_by(Incident.incident_date.desc()).all()

    severity_counts: dict = {}
    type_counts: dict = {}
    notifiable = notified = not_notified = 0
    medical = lost_time = lost_time_days = 0
    incident_rows: List[IncidentRow] = []

    for i in incidents:
        severity_counts[i.severity or "unknown"] = severity_counts.get(i.severity or "unknown", 0) + 1
        type_counts[i.incident_type or "unknown"] = type_counts.get(i.incident_type or "unknown", 0) + 1
        if i.medical_treatment_required:
            medical += 1
        # Lost-time injury: the ACC/WorkSafe metric a manager is asked for.
        if i.time_off_work:
            lost_time += 1
            lost_time_days += int(i.estimated_time_off_days or 0)

        days_to_notify = None
        if i.is_notifiable:
            notifiable += 1
            if i.worksafe_notified:
                notified += 1
                if i.worksafe_notification_date and i.incident_date:
                    days_to_notify = (i.worksafe_notification_date - i.incident_date).days
            else:
                # The single most important number in this report.
                not_notified += 1

        incident_rows.append(IncidentRow(
            id=i.id,
            incident_number=i.incident_number,
            title=i.incident_title,
            incident_date=_iso(i.incident_date),
            incident_type=i.incident_type,
            severity=i.severity,
            category=i.category,
            property_name=props.get(i.property_id),
            is_notifiable=bool(i.is_notifiable),
            worksafe_notified=bool(i.worksafe_notified),
            worksafe_reference=i.worksafe_reference,
            days_to_notify=days_to_notify,
            status=i.status,
        ))

    rq = db.query(SiteRisk).filter(
        SiteRisk.company_id == current_user.company_id,
        SiteRisk.status.in_(["active", "under_review"]),
    )
    rq = _property_filter_nullable(rq, SiteRisk, db, current_user, property_id)
    risks = rq.all()

    action_counts: dict = {}
    overdue_actions = 0
    open_actions = 0
    risk_ids = [r.id for r in risks]
    if risk_ids:
        for a in db.query(RiskAction).filter(
            RiskAction.risk_id.in_(risk_ids),
            RiskAction.status.notin_(["completed", "cancelled"]),
        ).all():
            open_actions += 1
            action_counts[a.risk_id] = action_counts.get(a.risk_id, 0) + 1
            if a.target_completion_date and a.target_completion_date.date() < today:
                overdue_actions += 1

    residual_counts: dict = {}
    overdue_review = 0
    risk_rows: List[RiskRow] = []
    for r in risks:
        # An unassessed residual is not "low" — it is unassessed, and saying so
        # is the difference between a register and a comfort blanket.
        level = r.residual_risk_level or "not assessed"
        residual_counts[level] = residual_counts.get(level, 0) + 1

        review_overdue_days = None
        if r.next_review_due and r.next_review_due.date() < today:
            overdue_review += 1
            review_overdue_days = (today - r.next_review_due.date()).days

        risk_rows.append(RiskRow(
            id=r.id,
            risk_title=r.risk_title,
            risk_category=r.risk_category,
            risk_type=r.risk_type,
            inherent_risk_level=r.inherent_risk_level,
            residual_risk_level=r.residual_risk_level,
            residual_risk_score=r.residual_risk_score,
            status=r.status,
            next_review_due=_iso(r.next_review_due),
            review_overdue_days=review_overdue_days,
            open_actions=action_counts.get(r.id, 0),
        ))
    # Worst residual score first, then whatever is most overdue for review.
    risk_rows.sort(key=lambda r: (r.residual_risk_score or 0, r.review_overdue_days or 0), reverse=True)

    return HealthSafetySummary(
        total_incidents=len(incidents),
        by_severity=[StatusCount(status=k, count=v) for k, v in severity_counts.items()],
        by_type=[CategoryCount(category=k, count=v) for k, v in type_counts.items()],
        notifiable_count=notifiable,
        notified_count=notified,
        notifiable_not_notified=not_notified,
        medical_treatment_count=medical,
        lost_time_count=lost_time,
        lost_time_days=lost_time_days,
        incidents=incident_rows,
        active_risks=len(risks),
        risks_by_residual_level=[StatusCount(status=k, count=v) for k, v in residual_counts.items()],
        risks_overdue_review=overdue_review,
        open_actions=open_actions,
        overdue_actions=overdue_actions,
        risks=risk_rows,
    )


@router.get("/health-safety/export")
def health_safety_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    section: str = Query("incidents", pattern="^(incidents|risks)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    """Two tables in one report, so the export names which one it wants."""
    summary = health_safety_summary(start_date, end_date, property_id, db, current_user)

    if section == "risks":
        headers = ["ID", "Risk", "Category", "Type", "Inherent", "Residual", "Score",
                   "Status", "Next Review", "Review Overdue (days)", "Open Actions"]
        rows = [[
            r.id, r.risk_title, r.risk_category or "", r.risk_type or "",
            r.inherent_risk_level or "", r.residual_risk_level or "not assessed",
            r.residual_risk_score if r.residual_risk_score is not None else "",
            r.status or "", r.next_review_due or "",
            r.review_overdue_days if r.review_overdue_days is not None else "",
            r.open_actions,
        ] for r in summary.risks]
        return _csv_response(rows, headers, "risk_register.csv")

    headers = ["Incident", "Title", "Date", "Type", "Severity", "Category", "Property",
               "Notifiable", "WorkSafe Notified", "WorkSafe Ref", "Days to Notify", "Status"]
    rows = [[
        i.incident_number, i.title, i.incident_date or "", i.incident_type or "",
        i.severity or "", i.category or "", i.property_name or "",
        "Yes" if i.is_notifiable else "No",
        "Yes" if i.worksafe_notified else "No",
        i.worksafe_reference or "",
        i.days_to_notify if i.days_to_notify is not None else "",
        i.status or "",
    ] for i in summary.incidents]
    return _csv_response(rows, headers, "incident_register.csv")


@router.get("/site-access/summary", response_model=SiteAccessSummary)
def site_access_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None, description="Filter by property"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    """
    Who was on site, when, hosted by whom, and were they inducted.

    VisitorVisit carries no property_id — the visitor register is company-wide —
    so an explicit property filter narrows the CONTRACTOR side only. Visitor rows
    are still returned rather than dropped, because silently hiding half the
    access log would be worse than showing an unfilterable half.
    """
    props = _property_names(db)
    visits: List[VisitRow] = []
    purpose_counts: dict = {}
    property_counts: dict = {}
    not_inducted = never_signed_out = equipment_not_cleaned = 0
    people = set()

    vq = db.query(VisitorVisit, Visitor).join(
        Visitor, VisitorVisit.visitor_id == Visitor.id
    ).filter(VisitorVisit.company_id == current_user.company_id)
    vq = _date_filter(vq, VisitorVisit, "visit_date", start_date, end_date)
    visitor_rows = vq.order_by(VisitorVisit.visit_date.desc()).all()

    hosts = {u.id: (u.full_name or u.email) for u in db.query(User).filter(
        User.company_id == current_user.company_id).all()}

    for v, person in visitor_rows:
        people.add(("visitor", person.id))
        purpose_counts[v.purpose or "unstated"] = purpose_counts.get(v.purpose or "unstated", 0) + 1
        if not v.induction_completed:
            not_inducted += 1
        # Signed in and never signed out: someone unaccounted for in an evacuation.
        if v.signed_in_at and not v.signed_out_at:
            never_signed_out += 1
        visits.append(VisitRow(
            id=v.id,
            kind="visitor",
            name=f"{person.first_name} {person.last_name}".strip(),
            organisation=person.company_representing,
            visit_date=_iso(v.visit_date),
            purpose=v.purpose,
            property_name=None,
            host=hosts.get(v.host_user_id),
            signed_in=_iso(v.signed_in_at),
            signed_out=_iso(v.signed_out_at),
            inducted=bool(v.induction_completed),
            equipment_cleaned=None,
            status=v.status,
        ))

    cq = db.query(ContractorMovement, Contractor).join(
        Contractor, ContractorMovement.contractor_id == Contractor.id
    ).filter(ContractorMovement.company_id == current_user.company_id)
    cq = _date_filter(cq, ContractorMovement, "arrival_datetime", start_date, end_date)
    cq = _property_filter_nullable(cq, ContractorMovement, db, current_user, property_id)
    movement_rows = cq.order_by(ContractorMovement.arrival_datetime.desc()).all()

    for m, c in movement_rows:
        people.add(("contractor", c.id))
        purpose_counts[m.purpose or "unstated"] = purpose_counts.get(m.purpose or "unstated", 0) + 1
        if m.property_id:
            property_counts[m.property_id] = property_counts.get(m.property_id, 0) + 1
        if m.arrival_datetime and not m.departure_datetime:
            never_signed_out += 1
        # Biosecurity: uncleaned equipment arriving from another vineyard is the
        # exposure this register exists to evidence.
        if not m.equipment_cleaned:
            equipment_not_cleaned += 1
        visits.append(VisitRow(
            id=m.id,
            kind="contractor",
            name=c.contact_person or c.business_name,
            organisation=c.business_name,
            visit_date=_iso(m.arrival_datetime.date() if m.arrival_datetime else None),
            purpose=m.purpose,
            property_name=props.get(m.property_id),
            host=None,
            signed_in=_iso(m.arrival_datetime),
            signed_out=_iso(m.departure_datetime),
            inducted=None,
            equipment_cleaned=bool(m.equipment_cleaned),
            status=None,
        ))

    # --- Staff attendance -------------------------------------------------
    #
    # The third register. Visitors and contractors describe people who do not
    # work here; SiteAttendance is the staff equivalent, and leaving it out made
    # this report answer "who was on site" with the wrong half.
    #
    # A staff row carries no induction, purpose or equipment state, so it is
    # counted in neither `not_inducted` nor `equipment_not_cleaned` — those are
    # denominators over guests. It DOES count toward `never_signed_out`, which
    # is the evacuation number and applies to everybody.
    aq = db.query(SiteAttendance, User).join(
        User, SiteAttendance.user_id == User.id
    ).filter(SiteAttendance.company_id == current_user.company_id)
    aq = _date_filter(aq, SiteAttendance, "signed_in_at", start_date, end_date)
    aq = _property_filter_nullable(aq, SiteAttendance, db, current_user, property_id)
    attendance_rows = aq.order_by(SiteAttendance.signed_in_at.desc()).all()

    for a, person in attendance_rows:
        people.add(("staff", person.id))
        if a.property_id:
            property_counts[a.property_id] = property_counts.get(a.property_id, 0) + 1
        if a.signed_in_at and not a.signed_out_at:
            never_signed_out += 1
        visits.append(VisitRow(
            id=a.id,
            kind="staff",
            name=(f"{person.first_name or ''} {person.last_name or ''}".strip()
                  or person.username or person.email),
            organisation=None,
            visit_date=_iso(a.signed_in_at.date() if a.signed_in_at else None),
            purpose=None,
            property_name=props.get(a.property_id),
            host=None,
            signed_in=_iso(a.signed_in_at),
            signed_out=_iso(a.signed_out_at),
            inducted=None,
            equipment_cleaned=None,
            status=None,
        ))

    visits.sort(key=lambda r: r.signed_in or r.visit_date or "", reverse=True)

    # Training currency for everyone who is not a staff user — the induction
    # evidence an auditor asks for alongside the register itself.
    now = datetime.now(timezone.utc)
    training_current = training_expired = 0
    for tr in db.query(TrainingRecord).filter(
        TrainingRecord.entity_type.in_(["visitor", "contractor"]),
        TrainingRecord.status == "completed",
    ).all():
        if tr.expires_at and tr.expires_at < now:
            training_expired += 1
        else:
            training_current += 1

    return SiteAccessSummary(
        total_visits=len(visits),
        visitor_visits=len(visitor_rows),
        contractor_visits=len(movement_rows),
        staff_attendances=len(attendance_rows),
        unique_people=len(people),
        not_inducted=not_inducted,
        never_signed_out=never_signed_out,
        equipment_not_cleaned=equipment_not_cleaned,
        by_purpose=[CategoryCount(category=k, count=v) for k, v in purpose_counts.items()],
        by_property=[
            PropertyVisitCount(property_id=pid, property_name=props.get(pid), visit_count=n)
            for pid, n in property_counts.items()
        ],
        training_current=training_current,
        training_expired=training_expired,
        visits=visits,
    )


@router.get("/site-access/export")
def site_access_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    summary = site_access_summary(start_date, end_date, property_id, db, current_user)
    headers = ["Type", "Name", "Organisation", "Date", "Purpose", "Property", "Host",
               "Signed In", "Signed Out", "Inducted", "Equipment Cleaned", "Status"]
    rows = [[
        v.kind, v.name, v.organisation or "", v.visit_date or "", v.purpose or "",
        v.property_name or "", v.host or "", v.signed_in or "", v.signed_out or "",
        "" if v.inducted is None else ("Yes" if v.inducted else "No"),
        "" if v.equipment_cleaned is None else ("Yes" if v.equipment_cleaned else "No"),
        v.status or "",
    ] for v in summary.visits]
    return _csv_response(rows, headers, "site_access_log.csv")


# Age bands chosen to match how a vineyard is actually talked about: not yet
# cropping, coming into balance, mature, and old enough that replanting is a
# live question.
_AGE_BANDS = [
    (0, 3, "0-3 years (establishing)"),
    (4, 7, "4-7 years (developing)"),
    (8, 20, "8-20 years (mature)"),
    (21, 200, "21+ years (old vines)"),
]


def _age_band(years: Optional[int]) -> str:
    if years is None:
        return "Unknown"
    for lo, hi, label in _AGE_BANDS:
        if lo <= years <= hi:
            return label
    return "Unknown"


@router.get("/vineyard-census/summary", response_model=VineyardCensusSummary)
def vineyard_census_summary(
    property_id: Optional[int] = Query(None, description="Filter by property"),
    include_removed: bool = Query(False, description="Include removed//historic blocks"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "read")),
):
    """
    The planting record: area by variety, age and certification.

    Not date-filtered — a census is a statement of what is in the ground now.
    Removed blocks are excluded by default; a census that counts pulled-out
    blocks overstates the planted area, which is the one number this report
    exists to get right.
    """
    props = _property_names(db)

    # Same NULL-property rule as everything else — see _visible_block_ids. Three
    # companies hold every block with property_id NULL, and the old
    # "no visible properties, no rows" branch reported them as having no
    # vineyard at all.
    block_ids = _visible_block_ids(db, current_user, property_id)
    q = db.query(VineyardBlock).filter(VineyardBlock.company_id == current_user.company_id)
    if block_ids:
        q = q.filter(VineyardBlock.id.in_(block_ids))
    else:
        q = q.filter(VineyardBlock.id == -1)
    if not include_removed:
        q = q.filter(VineyardBlock.removed_date.is_(None))

    blocks = q.all()
    today = _today()

    by_variety: dict = {}
    by_status: dict = {}
    by_age: dict = {}
    by_cert: dict = {}
    total_area = 0.0
    producing_area = 0.0
    missing_area = 0
    missing_planted = 0
    rows: List[CensusBlockRow] = []

    def _add(bucket: dict, key: str, area: Optional[float]):
        entry = bucket.setdefault(key, {"blocks": 0, "area": 0.0})
        entry["blocks"] += 1
        entry["area"] += area or 0.0

    for b in blocks:
        area = round(float(b.area), 2) if b.area else None
        if area is None:
            missing_area += 1
        else:
            total_area += area

        age = None
        if b.planted_date:
            age = (today - b.planted_date).days // 365
        else:
            missing_planted += 1

        status = b.status or "unknown"
        if status == "producing" and area:
            producing_area += area

        certs = [name for flag, name in (
            (b.swnz, "SWNZ"), (b.organic, "Organic"),
            (b.biodynamic, "Biodynamic"), (b.regenerative, "Regenerative"),
        ) if flag]

        _add(by_variety, b.variety or "Unspecified", area)
        _add(by_status, status, area)
        _add(by_age, _age_band(age), area)
        for c in certs or ["Uncertified"]:
            _add(by_cert, c, area)

        vines = None
        if area and b.row_spacing and b.vine_spacing:
            # 1 ha = 10,000 m2; spacings are metres.
            vines = int(round((area * 10000) / (b.row_spacing * b.vine_spacing)))

        rows.append(CensusBlockRow(
            id=b.id,
            block_name=b.block_name or f"Block {b.id}",
            property_name=props.get(b.property_id),
            status=status,
            variety=b.variety,
            clone=b.clone,
            rootstock=b.rootstock,
            area_hectares=area,
            planted_date=_iso(b.planted_date),
            age_years=age,
            row_count=b.row_count,
            row_spacing=b.row_spacing,
            vine_spacing=b.vine_spacing,
            vines_estimated=vines,
            training_system=b.training_system,
            region=b.region,
            gi=b.gi,
            certifications=certs,
        ))

    rows.sort(key=lambda r: (r.property_name or "", r.block_name))

    def _to_rows(bucket: dict) -> List[AreaByKey]:
        out = [
            AreaByKey(key=k, blocks=v["blocks"], area_hectares=round(v["area"], 2))
            for k, v in bucket.items()
        ]
        out.sort(key=lambda r: r.area_hectares, reverse=True)
        return out

    return VineyardCensusSummary(
        total_blocks=len(blocks),
        total_area_hectares=round(total_area, 2),
        producing_area_hectares=round(producing_area, 2),
        by_variety=_to_rows(by_variety),
        by_status=_to_rows(by_status),
        by_age_band=_to_rows(by_age),
        by_certification=_to_rows(by_cert),
        blocks_missing_area=missing_area,
        blocks_missing_planted_date=missing_planted,
        blocks=rows,
    )


@router.get("/vineyard-census/export")
def vineyard_census_export(
    property_id: Optional[int] = Query(None),
    include_removed: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_company_user_permission("reports", "export")),
):
    summary = vineyard_census_summary(property_id, include_removed, db, current_user)
    headers = ["Block", "Property", "Status", "Variety", "Clone", "Rootstock", "Area (ha)",
               "Planted", "Age (years)", "Rows", "Row Spacing (m)", "Vine Spacing (m)",
               "Vines (est.)", "Training System", "Region", "GI", "Certifications"]
    rows = [[
        b.block_name, b.property_name or "", b.status or "", b.variety or "", b.clone or "",
        b.rootstock or "", b.area_hectares if b.area_hectares is not None else "",
        b.planted_date or "", b.age_years if b.age_years is not None else "",
        b.row_count or "", b.row_spacing or "", b.vine_spacing or "",
        b.vines_estimated if b.vines_estimated is not None else "",
        b.training_system or "", b.region or "", b.gi or "",
        ", ".join(b.certifications),
    ] for b in summary.blocks]
    return _csv_response(rows, headers, "vineyard_census.csv")
