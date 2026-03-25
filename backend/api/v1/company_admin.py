# api/v1/company_admin.py — Company admin dashboard endpoints (Grow V1, Revision 2)
# Timesheet summary, training summary, user-property scope management, iCal feed
import logging
import uuid
from typing import List, Optional
from datetime import date, datetime, time, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from db.session import get_db
from db.models.user import User
from db.models.timesheet import TimesheetDay
from db.models.training_record import TrainingRecord
from db.models.training_module import TrainingModule
from db.models.task import Task
from db.models.task_assignment import TaskAssignment
from db.models.user_property_scope import UserPropertyScope
from db.models.property import Property
from db.models.management_relationship import ManagementRelationship
from api.deps import get_current_user
from services.property_service import get_visible_property_ids
from schemas.property import UserPropertyScopeOut

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# R3.1 — TIMESHEET SUMMARY FOR COMPANY
# ============================================================================

@router.get("/timesheets/summary")
def get_timesheet_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pending/approved/rejected timesheet counts for the company admin dashboard."""
    if not current_user.has_permission("timesheets", "approve"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    query = db.query(TimesheetDay).filter(TimesheetDay.company_id == current_user.company_id)
    if date_from:
        query = query.filter(TimesheetDay.work_date >= date_from)
    if date_to:
        query = query.filter(TimesheetDay.work_date <= date_to)

    rows = query.all()

    by_status = {"draft": 0, "submitted": 0, "approved": 0, "rejected": 0}
    total_hours = 0.0
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        total_hours += float(r.effective_total_hours or r.day_hours or 0)

    return {
        "total_days": len(rows),
        "by_status": by_status,
        "pending_approval": by_status.get("submitted", 0),
        "total_hours": round(total_hours, 2),
    }


# ============================================================================
# R3.2 — TRAINING STATUS SUMMARY
# ============================================================================

@router.get("/training/summary")
def get_training_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Training completion summary per user for the company admin dashboard."""
    if not current_user.has_permission("training", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    company_id = current_user.company_id

    # Get all training records for company users
    records = (
        db.query(TrainingRecord)
        .join(User, (TrainingRecord.entity_type == "user") & (TrainingRecord.entity_id == User.id))
        .filter(User.company_id == company_id, User.deleted_at.is_(None))
        .all()
    )

    # Aggregate by user
    user_stats = {}
    for rec in records:
        uid = rec.entity_id
        if uid not in user_stats:
            user_stats[uid] = {"assigned": 0, "completed": 0, "overdue": 0}
        user_stats[uid]["assigned"] += 1
        if rec.status == "completed":
            user_stats[uid]["completed"] += 1
        elif rec.expires_at and rec.expires_at < datetime.now(timezone.utc):
            user_stats[uid]["overdue"] += 1

    total_assigned = sum(s["assigned"] for s in user_stats.values())
    total_completed = sum(s["completed"] for s in user_stats.values())

    return {
        "total_users": len(user_stats),
        "total_assigned": total_assigned,
        "total_completed": total_completed,
        "completion_rate": round((total_completed / total_assigned * 100) if total_assigned > 0 else 0, 1),
        "total_overdue": sum(s["overdue"] for s in user_stats.values()),
    }


# ============================================================================
# R3.3 — BULK USER PROPERTY SCOPE MANAGEMENT
# ============================================================================

@router.get("/users/{user_id}/property-scopes", response_model=List[UserPropertyScopeOut])
def get_user_property_scopes(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all property scopes for a user."""
    if not current_user.has_permission("users", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Verify target user is in the same company
    target = db.query(User).filter(User.id == user_id, User.company_id == current_user.company_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return db.query(UserPropertyScope).filter(UserPropertyScope.user_id == user_id).all()


@router.put("/users/{user_id}/property-scopes")
def set_user_property_scopes(
    user_id: int,
    property_ids: List[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace all property scopes for a user. Empty list = user sees all company properties."""
    if not current_user.has_permission("users", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    target = db.query(User).filter(User.id == user_id, User.company_id == current_user.company_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Validate all property_ids are visible to this company
    visible = get_visible_property_ids(db, current_user)
    invalid = [pid for pid in property_ids if pid not in visible]
    if invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Property IDs not accessible: {invalid}")

    # Delete existing scopes
    db.query(UserPropertyScope).filter(UserPropertyScope.user_id == user_id).delete()

    # Create new scopes
    for pid in property_ids:
        db.add(UserPropertyScope(user_id=user_id, property_id=pid))

    db.commit()

    return {"user_id": user_id, "property_ids": property_ids, "count": len(property_ids)}


# ============================================================================
# R3.4 + R3.5 — iCAL FEED
# ============================================================================

@router.post("/calendar/feed/generate")
def generate_feed_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate (or regenerate) the current user's iCal feed token."""
    token = uuid.uuid4().hex[:32]  # 32 chars, URL-safe
    current_user.calendar_feed_token = token
    db.commit()
    return {"feed_token": token}


@router.get("/calendar/feed/{feed_token}.ics")
def get_ical_feed(
    feed_token: str,
    db: Session = Depends(get_db),
):
    """
    iCal feed endpoint — no JWT auth, authenticated by feed token.
    Returns .ics format for Google/Apple/Outlook Calendar subscription.

    Scope:
    - company_user: only their assigned tasks
    - company_manager: all tasks for their scoped properties (with assignee names)
    - company_admin: all tasks across all company properties (with assignee names)
    """
    user = db.query(User).filter(
        User.calendar_feed_token == feed_token,
        User.is_active == True,
        User.deleted_at.is_(None),
    ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid feed token")

    # Determine task scope
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=30)
    window_end = now + timedelta(days=90)

    if user.user_type == "company_user":
        # Only assigned tasks
        tasks = (
            db.query(Task)
            .join(TaskAssignment, TaskAssignment.task_id == Task.id)
            .filter(
                TaskAssignment.user_id == user.id,
                Task.scheduled_start_date != None,
                Task.scheduled_start_date >= window_start.date(),
                Task.scheduled_start_date <= window_end.date(),
            )
            .all()
        )
    else:
        # Manager/admin: all company tasks
        tasks = (
            db.query(Task)
            .filter(
                Task.company_id == user.company_id,
                Task.scheduled_start_date != None,
                Task.scheduled_start_date >= window_start.date(),
                Task.scheduled_start_date <= window_end.date(),
            )
            .all()
        )

    show_assignees = user.user_type in ("company_admin", "company_manager")

    # Build iCal
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Auxein//Grow V1//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:Auxein Tasks",
    ]

    for task in tasks:
        dtstart = task.scheduled_start_date
        dtend = task.scheduled_end_date or task.scheduled_start_date

        summary = task.title or "Untitled Task"
        if show_assignees and task.assignments:
            names = ", ".join(a.user.full_name for a in task.assignments if a.user)
            summary = f"{summary} [{names}]"

        desc_parts = []
        if task.block:
            desc_parts.append(f"Block: {task.block.block_name}")
        desc_parts.append(f"Priority: {task.priority or 'medium'}")
        desc_parts.append(f"Status: {task.status.value if task.status else 'draft'}")
        description = "\\n".join(desc_parts)

        lines.extend([
            "BEGIN:VEVENT",
            f"UID:auxein-task-{task.id}@auxein.co.nz",
            f"DTSTART;VALUE=DATE:{dtstart.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(dtend + timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{_ical_escape(summary)}",
            f"DESCRIPTION:{_ical_escape(description)}",
            f"STATUS:{_task_status_to_ical(task.status.value if task.status else 'draft')}",
            "END:VEVENT",
        ])

    lines.append("END:VCALENDAR")

    ical_content = "\r\n".join(lines)
    return Response(
        content=ical_content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=auxein-tasks.ics"},
    )


def _ical_escape(text: str) -> str:
    """Escape special characters for iCal format."""
    return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def _task_status_to_ical(status_val: str) -> str:
    """Map task status to iCal VEVENT STATUS."""
    if status_val in ("completed",):
        return "COMPLETED"
    if status_val in ("cancelled",):
        return "CANCELLED"
    return "CONFIRMED"
