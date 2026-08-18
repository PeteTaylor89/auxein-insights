# backend/api/v1/reports.py — reporting endpoints (summary + CSV export)
# Revision 2: added property_id filter to all endpoints
from fastapi import APIRouter, Depends, Query
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
from db.models.observation_run import ObservationRun
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
from db.models.training_record import TrainingRecord
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
    """Scope a model carrying its own nullable `property_id` (Incident, SiteRisk, ContractorMovement)."""
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

    for t in tasks:
        s = t.status.value if t.status else "unknown"
        status_counts[s] = status_counts.get(s, 0) + 1

        p = t.priority or "medium"
        priority_counts[p] = priority_counts.get(p, 0) + 1

        c = t.task_category or "general"
        category_counts[c] = category_counts.get(c, 0) + 1

        if t.actual_hours:
            total_hours += float(t.actual_hours)
        if s == "completed":
            completed += 1
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

    headers = ["ID", "Title", "Status", "Priority", "Category", "Hours", "Scheduled Start", "Completed At", "Created"]
    rows = []
    for t in tasks:
        rows.append([
            t.id,
            t.title,
            t.status.value if t.status else "",
            t.priority or "",
            t.task_category or "",
            float(t.actual_hours) if t.actual_hours else "",
            str(t.scheduled_start_date) if t.scheduled_start_date else "",
            str(t.completed_at) if t.completed_at else "",
            str(t.created_at) if t.created_at else "",
        ])
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
    """Completed work rolled up by block: hours, rows, area and hours per hectare."""
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

    agg: dict = {}
    unallocated_hours = 0.0
    unallocated_tasks = 0

    for t in tasks:
        hours = task_hours.get(t.id, 0.0)
        # Roll-up children carry their own hours but must not inflate the job count.
        counts_as_job = t.parent_task_id is None

        if t.block_id is None:
            unallocated_hours += hours
            if counts_as_job:
                unallocated_tasks += 1
            continue

        row = agg.setdefault(t.block_id, {"tasks": 0, "hours": 0.0, "rows": 0, "area": 0.0})
        row["hours"] += hours
        row["rows"] += int(t.rows_completed or 0)
        row["area"] += float(t.area_completed_hectares or 0)
        if counts_as_job:
            row["tasks"] += 1

    out: List[BlockWorkRow] = []
    for block_id, row in agg.items():
        b = blocks.get(block_id)
        area = round(float(b.area), 2) if b and b.area else None
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
        ))
    out.sort(key=lambda r: r.hours, reverse=True)

    return WorkByBlockSummary(
        blocks=out,
        total_tasks=sum(r.tasks_completed for r in out) + unallocated_tasks,
        total_hours=round(sum(r.hours for r in out) + unallocated_hours, 1),
        total_area_worked=round(sum(r.area_worked_hectares for r in out), 2),
        unallocated_hours=round(unallocated_hours, 1),
        unallocated_tasks=unallocated_tasks,
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
    headers = ["Block", "Property", "Variety", "Block Area (ha)", "Tasks Completed",
               "Hours", "Rows Completed", "Area Worked (ha)", "Hours / ha"]
    rows = [[
        r.block_name, r.property_name or "", r.variety or "",
        r.area_hectares if r.area_hectares is not None else "",
        r.tasks_completed, r.hours, r.rows_completed, r.area_worked_hectares,
        r.hours_per_hectare if r.hours_per_hectare is not None else "",
    ] for r in summary.blocks]
    if summary.unallocated_tasks or summary.unallocated_hours:
        rows.append(["Unallocated (no block)", "", "", "", summary.unallocated_tasks,
                     summary.unallocated_hours, "", "", ""])
    return _csv_response(rows, headers, "work_by_block.csv")


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
