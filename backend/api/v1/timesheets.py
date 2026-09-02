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
    TimesheetUncodedUpdate,
    TimeEntryCreate, TimeEntryUpdate, TimeEntryOut
)

# Service helpers — try project-native path first, then fallback to app.services.* if needed
try:
    from services.timesheet_rules import (
        recalc_day, set_day_hours, set_uncoded_hours, create_entry, update_entry, delete_entry,
        day_is_editable, day_lock_reason, DAY_EDITABLE_STATUSES
    )
except Exception:
    from app.services.timesheet_rules import (  # type: ignore
        recalc_day, set_day_hours, set_uncoded_hours, create_entry, update_entry, delete_entry,
        day_is_editable, day_lock_reason, DAY_EDITABLE_STATUSES
    )

from services.notification_service import NotificationService
from db.models.notification import NotificationType

from api.deps import get_current_user

router = APIRouter(prefix="/timesheets", tags=["timesheets"])


# --------- Helpers ---------
def _ensure_company_scope(current_user: User, company_id: int) -> None:
    if current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission for this company",
        )


def _ensure_owner_or_admin(current_user: User, user_id: int, company_id: int) -> None:
    if current_user.has_permission("timesheets", "read"):
        return
    if current_user.id == user_id and current_user.company_id == company_id:
        return
    raise HTTPException(status_code=403, detail="Only the owner or admin can perform this action")


def _ensure_editable(day: TimesheetDay, current_user: User) -> None:
    """The write gate for a timesheet day. `day_is_editable` owns the rule.

    Two changes from the original, both from
    docs/Bugs/Current/TIMESHEET_WORKFLOW_2026-08-28.md:

    **F4 — `submitted` is now refused for the owner.** It used to be allowed,
    so a worker could submit 5.25h, add another 0.75h, and have the manager
    approve 6.25h from a queue that showed 5.25h. `submitted_at` never moved,
    so nothing recorded that the number had changed underneath them. Mobile had
    always blocked this in its own UI; the API permitted it from any client,
    including a replayed offline queue.

    **The manager allowance is now explicit.** A holder of `timesheets:update`
    may still edit SOMEONE ELSE'S submitted day — a manager fixing an obvious
    slip rather than bouncing the whole day back is a real workflow. That used
    to fall out of the condition ordering by accident. Two limits on it:

    - It does not extend to an approved day. Approved is locked for everyone,
      including admins: `release` exists for that and leaves a trace.
    - It does not extend to their OWN day. On their own timesheet a manager is
      a worker, and editing their own submission before approving it is F11
      (self-approval) with an extra step. The recourse is the same as anyone
      else's: reject it back to draft, which they are allowed to do.

    Ownership is checked FIRST, so someone else's day answers 403 whatever its
    status, rather than leaking that status through the choice of error.
    """
    is_manager = current_user.has_permission("timesheets", "update")
    is_own_day = day.user_id == current_user.id

    if not is_manager and not is_own_day:
        raise HTTPException(status_code=403, detail="Only the owner can edit their day")

    if day.status == TimesheetStatus.approved:
        raise HTTPException(status_code=409, detail=day_lock_reason(day))

    if not day_is_editable(day) and (is_own_day or not is_manager):
        raise HTTPException(status_code=409, detail=day_lock_reason(day))


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
        # Only gate the WRITE. Both clients use this endpoint as get-or-create
        # before setting uncoded hours or adding an entry, and a bare
        # `{work_date}` with nothing to change is a read of the caller's own
        # day. Refusing that (F6) meant a locked day could not even be fetched
        # by the path that needs its id, which turned one refusal into two.
        if payload.day_hours is not None or payload.notes is not None:
            _ensure_editable(existing, current_user)
        # Update day_hours/notes if provided
        warning = None
        if payload.day_hours is not None:
            try:
                _, warning = set_day_hours(db, existing.id, Decimal(str(payload.day_hours)))
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        if payload.notes is not None:
            existing.notes = payload.notes
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return _with_warning(existing, warning)

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
    warning = None
    if payload.day_hours is not None:
        try:
            _, warning = set_day_hours(db, day.id, Decimal(str(payload.day_hours)))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    db.commit()
    db.refresh(day)
    return _with_warning(day, warning)

def _with_warning(day, warning):
    """Attach a non-fatal message to the day being returned.

    Set on the ORM instance rather than in a wrapper model so every existing
    client keeps the shape it already parses. Always called AFTER db.refresh(),
    which would otherwise expire it.

    Assigned unconditionally, including None. Setting it only on the truthy
    path leaves a previous call's warning sitting on the instance in the
    identity map, so a later request that succeeded cleanly would report the
    earlier failure — a warning about a write that did happen.
    """
    day.warning = warning
    return day


@router.post("/days/{day_id}/release", response_model=TimesheetDayOut)
def release_timesheet_day(
    day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)

    if not current_user.has_permission("timesheets", "approve"):
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

    # Always scope to user's company
    q = q.filter(TimesheetDay.company_id == current_user.company_id)

    # Default restrictive. The check used to be NESTED inside `if user_id is not
    # None`, so omitting the parameter skipped it entirely and any caller —
    # including a company_user, who holds only `read_own` — got every timesheet
    # day in the company. The web Team Dashboard is gated client-side, which is
    # not a control. Structure it so the permission decides the scope, not the
    # presence of an optional query parameter.
    if not current_user.has_permission("timesheets", "read"):
        if user_id is not None and user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed to view other users' timesheets")
        q = q.filter(TimesheetDay.user_id == current_user.id)
    elif user_id is not None:
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
    if not current_user.has_permission("timesheets", "read") and day.user_id != current_user.id:
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

    warning = None
    if payload.day_hours is not None:
        try:
            _, warning = set_day_hours(db, day.id, Decimal(str(payload.day_hours)))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if payload.notes is not None:
        day.notes = payload.notes

    db.add(day)
    db.commit()
    db.refresh(day)
    return _with_warning(day, warning)


@router.patch("/days/{day_id}/uncoded", response_model=TimesheetDayOut)
def set_uncoded_hours_endpoint(
    day_id: int,
    payload: TimesheetUncodedUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set the day's uncoded time — hours worked that are not against a task.

    This is the ONLY hours figure a user enters. The day total is
    `entry_hours + uncoded_hours` and follows task completions on its own, so
    nothing has to be rolled up and the total can never disagree with the
    entries beneath it.
    """
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)
    _ensure_editable(day, current_user)

    try:
        set_uncoded_hours(db, day.id, Decimal(str(payload.hours)))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.commit()
    db.refresh(day)
    return day


@router.post("/days/{day_id}/rollup", response_model=TimesheetDayOut)
def rollup_timesheet_day(
    day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """DEPRECATED — the roll-up is now continuous.

    It used to set `day_hours = entry_hours`, freezing a total that the next
    task completion would then contradict. The total is derived from the
    entries now, so there is nothing to lock in: this recalculates and returns
    the day, which is a no-op on a healthy row.

    Kept rather than deleted because a phone running an older build may still
    call it, and a 404 there would read as "completing tasks is broken".
    """
    day = _get_day_or_404(db, day_id)
    _ensure_company_scope(current_user, day.company_id)
    _ensure_editable(day, current_user)

    try:
        recalc_day(db, day.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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

    if day.user_id != current_user.id and not current_user.has_permission("timesheets", "approve"):
        raise HTTPException(status_code=403, detail="Only the owner can submit this day")

    # Draft OR rejected. A rejected day is explicitly editable — `_ensure_editable`
    # allows it and the mobile UI offers the edit controls on it — so refusing to
    # re-submit it made rejection a dead end: the person could fix what the
    # manager objected to and then had no way to send it back. Approved and
    # already-submitted days are still refused.
    if day.status not in DAY_EDITABLE_STATUSES:
        raise HTTPException(status_code=409, detail=f"Cannot submit a {day.status.value} day")

    # simple sanity check (optional): prevent zero-hour submission
    if Decimal(str(day.effective_total_hours or 0)) <= 0:
        raise HTTPException(status_code=400, detail="Cannot submit a zero-hour day")

    day.status = TimesheetStatus.submitted
    notification_service = NotificationService(db)
    notification_service.notify_managers(
        company_id=current_user.company_id,
        notification_type=NotificationType.timesheet,
        title=f"Timesheet submitted",
        body=f"{current_user.first_name} {current_user.last_name} submitted timesheet for {day.work_date}",
        data={"timesheet_day_id": day.id, "user_id": current_user.id}
    )
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

    if not current_user.has_permission("timesheets", "approve"):
        raise HTTPException(status_code=403, detail="Only admins or managers can approve")

    if day.status != TimesheetStatus.submitted:
        raise HTTPException(status_code=409, detail=f"Only submitted days can be approved")

    day.status = TimesheetStatus.approved
    notification_service = NotificationService(db)
    submitter = db.query(User).filter(User.id == day.user_id).first()
    if submitter:
        notification_service.notify_user(
            user=submitter,
            notification_type=NotificationType.timesheet,
            title="Timesheet approved",
            body=f"Your timesheet for {day.work_date} was approved",
            data={"timesheet_day_id": day.id}
        )
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

    if not current_user.has_permission("timesheets", "approve"):
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
    notification_service = NotificationService(db)
    submitter = db.query(User).filter(User.id == day.user_id).first()
    if submitter:
        notification_service.notify_user(
            user=submitter,
            notification_type=NotificationType.timesheet,
            title="Timesheet rejected",
            body=f"Your timesheet for {day.work_date} was rejected",
            data={"timesheet_day_id": day.id}
        )
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
