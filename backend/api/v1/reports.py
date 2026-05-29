# backend/api/v1/reports.py — reporting endpoints (summary + CSV export)
# Revision 2: added property_id filter to all endpoints
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime
from typing import Optional, List
import csv
import io

from db.session import get_db
from api.deps import get_current_user
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
from schemas.report import (
    TaskReportSummary, ObservationReportSummary,
    TimesheetReportSummary, AssetReportSummary,
    ContractorReportSummary, TopContractor, PropertyVisitCount,
    StatusCount, CategoryCount,
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


def _property_filter_tasks(query, db: Session, property_id: Optional[int]):
    """Filter tasks by property_id via block → property chain."""
    if property_id is None:
        return query
    block_ids = [
        row[0] for row in
        db.query(VineyardBlock.id).filter(VineyardBlock.property_id == property_id).all()
    ]
    if not block_ids:
        return query.filter(Task.id == -1)  # no matches
    return query.filter(Task.block_id.in_(block_ids))


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
    current_user: User = Depends(get_current_user),
):
    q = db.query(Task).filter(Task.company_id == current_user.company_id)
    q = _date_filter(q, Task, "created_at", start_date, end_date)
    q = _property_filter_tasks(q, db, property_id)
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
    current_user: User = Depends(get_current_user),
):
    q = db.query(Task).filter(Task.company_id == current_user.company_id)
    q = _date_filter(q, Task, "created_at", start_date, end_date)
    q = _property_filter_tasks(q, db, property_id)
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
