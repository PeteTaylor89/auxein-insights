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
from db.models.observation_plan import ObservationPlan
from db.models.observation_run import ObservationRun
from db.models.timesheet import TimesheetDay, TimeEntry
from db.models.asset import Asset
from db.models.block import VineyardBlock
from schemas.report import (
    TaskReportSummary, ObservationReportSummary,
    TimesheetReportSummary, AssetReportSummary,
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
    plan_q = db.query(ObservationPlan).filter(ObservationPlan.company_id == current_user.company_id)
    total_plans = plan_q.count()

    run_q = (
        db.query(ObservationRun)
        .join(ObservationPlan, ObservationRun.plan_id == ObservationPlan.id)
        .filter(ObservationPlan.company_id == current_user.company_id)
    )
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
        total_plans=total_plans,
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
    run_q = (
        db.query(ObservationRun)
        .join(ObservationPlan, ObservationRun.plan_id == ObservationPlan.id)
        .filter(ObservationPlan.company_id == current_user.company_id)
    )
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

    headers = ["ID", "Name", "Plan ID", "Started", "Ended", "Spots", "Created"]
    rows = []
    for r in runs:
        spot_count = len(r.spots) if hasattr(r, "spots") and r.spots else 0
        rows.append([
            r.id,
            r.name or "",
            r.plan_id,
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
