# app/api/v1/timesheets.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session, selectinload

from db.session import get_db
from db.models.timesheet import TimesheetDay, TimeEntry, TimesheetStatus
from db.models.task import Task
from db.models.user import User

# Schemas (match your existing import style like schemas.task in your codebase)
from schemas.timesheet import (
    TimesheetDayCreate, TimesheetDayUpdate, TimesheetDayOut,
    TimeEntryCreate, TimeEntryUpdate, TimeEntryOut
)

# Service helpers — try project-native path first, then fallback to app.services.* if needed
try:
    from services.timesheet_rules import (
        recalc_day, set_day_hours, create_entry, update_entry, delete_entry
    )
except Exception:
    from app.services.timesheet_rules import (  # type: ignore
        recalc_day, set_day_hours, create_entry, update_entry, delete_entry
    )

from api.deps import get_current_user

router = APIRouter(prefix="/timesheets", tags=["timesheets"])


# --------- Helpers ---------
def _ensure_company_scope(current_user: User, company_id: int) -> None:
    if current_user.role != "admin" and current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission for this company",
        )


def _ensure_owner_or_admin(current_user: User, user_id: int, company_id: int) -> None:
    if current_user.role == "admin":
        return
    if current_user.id == user_id and current_user.company_id == company_id:
        return
    raise HTTPException(status_code=403, detail="Only the owner or admin can perform this action")


def _ensure_editable(day: TimesheetDay, current_user: User) -> None:
    # Owners (or admins) can edit while in draft or submitted.
    if day.status == TimesheetStatus.approved:
        raise HTTPException(status_code=409, detail="Day is approved, not editable (ask a manager/admin to release)")
    if current_user.role != "admin" and day.user_id != current_user.id:
        # Only allow owner edits in MVP
        raise HTTPException(status_code=403, detail="Only the owner can edit their day")


def _get_day_or_404(db: Session, day_id: int) -> TimesheetDay:
    day = (
        db.query(TimesheetDay)
        .options(selectinload(TimesheetDay.entries))
        .filter(TimesheetDay.id == day_id)
        .first()
    )
    if not day:
        raise HTTPException(status_code=404, detail="TimesheetDay not found")
    return day


def _validate_task_company(task: Task, expected_company_id: int) -> None:
    # If Task has company_id field, enforce; otherwise skip (legacy models may differ)
    company_id = getattr(task, "company_id", None)
    if company_id is not None and company_id != expected_company_id:
        raise HTTPException(status_code=403, detail="Task belongs to a different company")


# --------- Timesheet Days ---------
@router.post("/days", response_model=TimesheetDayOut, status_code=201)
def create_timesheet_day(
    payload: TimesheetDayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Upsert-by-(user, date, company)
    existing = (
        db.query(TimesheetDay)
        .filter(
            TimesheetDay.user_id == current_user.id,
            TimesheetDay.company_id == current_user.company_id,
            TimesheetDay.work_date == payload.work_date,
        )
        .first()
    )
    if existing:
        _ensure_editable(existing, current_user)
        # Update day_hours/notes if provided
        if payload.day_hours is not None:
            try:
                set_day_hours(db, existing.id, Decimal(str(payload.day_hours)))
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        if payload.notes is not None:
            existing.notes = payload.notes
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    # Create new draft day
    day = TimesheetDay(
        company_id=current_user.company_id,
        user_id=current_user.id,
        work_date=payload.work_date,
        status=TimesheetStatus.draft,
        notes=payload.notes,
    )
    db.add(day)
    db.flush()

    # Optionally set day_hours
    if payload.day_hours is not None:
        try:
            set_day_hours(db, day.id, Decimal(str(payload.day_hours)))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    db.commit()
    db.refresh(day)
    return day

@router.post("/days/{day_id}/release", response_model=TimesheetDayOut)
def release_timesheet_day(
    day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)

    if current_user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins or managers can release")

    if day.status != TimesheetStatus.approved:
        raise HTTPException(status_code=409, detail="Only approved days can be released")

    # Send it back for editing
    day.status = TimesheetStatus.draft
    day.approved_by = None
    day.approved_at = None
    day.submitted_at = None

    db.add(day)
    db.commit()
    db.refresh(day)
    return day

@router.get("/days", response_model=List[TimesheetDayOut])
def list_timesheet_days(
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Add user join to the query
    q = db.query(TimesheetDay).options(
        selectinload(TimesheetDay.entries),
        selectinload(TimesheetDay.user)  # Add this line to load user data
    )

    # Rest of your existing code remains the same...
    if current_user.role != "admin":
        q = q.filter(TimesheetDay.company_id == current_user.company_id)

    if user_id is not None:
        if current_user.role != "admin" and user_id != current_user.id:
            if current_user.role not in ("manager",):
                raise HTTPException(status_code=403, detail="Not allowed to view other users' timesheets")
        q = q.filter(TimesheetDay.user_id == user_id)

    if date_from:
        q = q.filter(TimesheetDay.work_date >= date_from)
    if date_to:
        q = q.filter(TimesheetDay.work_date <= date_to)

    if status_filter:
        try:
            st = TimesheetStatus(status_filter)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status value")
        q = q.filter(TimesheetDay.status == st)

    days = q.order_by(TimesheetDay.work_date.desc()).offset(skip).limit(min(limit, 500)).all()
    return days

@router.get("/days/{day_id}", response_model=TimesheetDayOut)
def get_timesheet_day(
    day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)
    # Non-admins: allow viewing own or, if manager, same-company
    if current_user.role not in ("admin", "manager") and day.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own timesheet day")
    return day


@router.patch("/days/{day_id}", response_model=TimesheetDayOut)
def update_timesheet_day(
    day_id: int,
    payload: TimesheetDayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)
    _ensure_editable(day, current_user)

    if payload.day_hours is not None:
        try:
            set_day_hours(db, day.id, Decimal(str(payload.day_hours)))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if payload.notes is not None:
        day.notes = payload.notes

    db.add(day)
    db.commit()
    db.refresh(day)
    return day


@router.post("/days/{day_id}/submit", response_model=TimesheetDayOut)
def submit_timesheet_day(
    day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)

    if day.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the owner can submit this day")

    if day.status != TimesheetStatus.draft:
        raise HTTPException(status_code=409, detail=f"Cannot submit a {day.status} day")

    # simple sanity check (optional): prevent zero-hour submission
    if Decimal(str(day.effective_total_hours or 0)) <= 0:
        raise HTTPException(status_code=400, detail="Cannot submit a zero-hour day")

    day.status = TimesheetStatus.submitted
    day.submitted_at = datetime.now(timezone.utc)
    db.add(day)
    db.commit()
    db.refresh(day)
    return day


@router.post("/days/{day_id}/approve", response_model=TimesheetDayOut)
def approve_timesheet_day(
    day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)

    if current_user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins or managers can approve")

    if day.status != TimesheetStatus.submitted:
        raise HTTPException(status_code=409, detail=f"Only submitted days can be approved")

    day.status = TimesheetStatus.approved
    day.approved_by = current_user.id
    day.approved_at = datetime.now(timezone.utc)
    db.add(day)
    db.commit()
    db.refresh(day)
    return day


@router.post("/days/{day_id}/reject", response_model=TimesheetDayOut)
def reject_timesheet_day(
    day_id: int,
    reason: Optional[str] = Query(None, description="Optional rejection reason (appended to notes)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)

    if current_user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins or managers can reject")

    if day.status != TimesheetStatus.submitted:
        raise HTTPException(status_code=409, detail=f"Only submitted days can be rejected")

    # append reason to notes for traceability (MVP)
    if reason:
        if day.notes:
            day.notes = (day.notes or "") + f"\n[Rejected: {reason}]"
        else:
            day.notes = f"[Rejected: {reason}]"

    day.status = TimesheetStatus.rejected
    day.approved_by = None
    day.approved_at = None

    db.add(day)
    db.commit()
    db.refresh(day)
    return day


# --------- Time Entries ---------
@router.post("/entries", response_model=TimeEntryOut, status_code=201)
def create_time_entry(
    payload: TimeEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load day and scope checks
    day = _get_day_or_404(db, payload.timesheet_day_id)
    _ensure_company_scope(current_user, day.company_id)
    _ensure_editable(day, current_user)

    # Validate task (if provided)
    if payload.task_id is not None:
        task = db.query(Task).filter(Task.id == payload.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        _validate_task_company(task, day.company_id)

    try:
        entry = create_entry(db, timesheet_day_id=day.id, task_id=payload.task_id, hours=Decimal(str(payload.hours)))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.commit()
    db.refresh(entry)
    return entry


@router.put("/entries/{entry_id}", response_model=TimeEntryOut)
def update_time_entry(
    entry_id: int,
    payload: TimeEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load entry + day
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="TimeEntry not found")
    day = _get_day_or_404(db, entry.timesheet_day_id)

    _ensure_company_scope(current_user, day.company_id)
    _ensure_editable(day, current_user)

    # Validate task if changing
    if payload.task_id is not None:
        task = db.query(Task).filter(Task.id == payload.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        _validate_task_company(task, day.company_id)

    try:
        updated = update_entry(
            db,
            entry_id=entry_id,
            task_id=payload.task_id,
            hours=Decimal(str(payload.hours)) if payload.hours is not None else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.commit()
    db.refresh(updated)
    return updated


@router.delete("/entries/{entry_id}", status_code=204)
def delete_time_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load entry + day
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        return  # idempotent delete
    day = _get_day_or_404(db, entry.timesheet_day_id)

    _ensure_company_scope(current_user, day.company_id)
    _ensure_editable(day, current_user)

    try:
        delete_entry(db, entry_id=entry_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.commit()
    return
