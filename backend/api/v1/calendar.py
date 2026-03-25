# backend/api/v1/calendar.py — unified calendar endpoint
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date, datetime, time
from typing import List, Optional

from db.session import get_db
from api.deps import get_current_user
from db.models.user import User
from db.models.task import Task
from db.models.observation_plan import ObservationPlan
from db.models.observation_run import ObservationRun
from db.models.risk_action import RiskAction
from db.models.training_record import TrainingRecord
from db.models.training_module import TrainingModule
from db.models.asset import AssetMaintenance
from db.models.block import VineyardBlock
from schemas.calendar import CalendarEvent, CalendarEventType, EVENT_TYPE_COLORS

router = APIRouter()


@router.get("/events", response_model=List[CalendarEvent])
def get_calendar_events(
    start_date: date = Query(..., description="Range start (inclusive)"),
    end_date: date = Query(..., description="Range end (inclusive)"),
    event_types: Optional[List[CalendarEventType]] = Query(
        None, description="Filter by event type(s)"
    ),
    property_id: Optional[int] = Query(None, description="Filter by property"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unified calendar events across tasks, observations, training, risk actions."""
    company_id = current_user.company_id
    range_start = datetime.combine(start_date, time.min)
    range_end = datetime.combine(end_date, time.max)
    show_all = event_types is None or len(event_types) == 0

    # Pre-compute block IDs for property filter
    property_block_ids = None
    if property_id is not None:
        property_block_ids = [
            row[0] for row in
            db.query(VineyardBlock.id).filter(VineyardBlock.property_id == property_id).all()
        ]

    events: List[CalendarEvent] = []

    # ── Tasks ──────────────────────────────────────────────────────────
    if show_all or CalendarEventType.task in event_types:
        task_q = (
            db.query(Task)
            .filter(
                Task.company_id == company_id,
                Task.scheduled_start_date != None,  # noqa: E711
                Task.scheduled_start_date >= start_date,
                Task.scheduled_start_date <= end_date,
            )
        )
        if property_block_ids is not None:
            task_q = task_q.filter(Task.block_id.in_(property_block_ids)) if property_block_ids else task_q.filter(Task.id == -1)
        tasks = task_q.all()
        for t in tasks:
            if t.scheduled_start_time:
                start = t.scheduled_start_time
                all_day = False
            else:
                start = datetime.combine(t.scheduled_start_date, time.min)
                all_day = True

            end = (
                datetime.combine(t.scheduled_end_date, time.max)
                if t.scheduled_end_date
                else None
            )

            assignees = []
            if hasattr(t, "assignments") and t.assignments:
                assignees = [
                    a.user.full_name for a in t.assignments if a.user and hasattr(a.user, "full_name")
                ]

            location_parts = []
            if hasattr(t, "block") and t.block:
                location_parts.append(t.block.block_name)
            if hasattr(t, "property_obj") and t.property_obj:
                location_parts.append(t.property_obj.name)

            events.append(
                CalendarEvent(
                    id=t.id,
                    event_type=CalendarEventType.task,
                    title=t.title,
                    start=start,
                    end=end,
                    all_day=all_day,
                    color=EVENT_TYPE_COLORS[CalendarEventType.task],
                    status=t.status.value if t.status else None,
                    location=" — ".join(location_parts) if location_parts else None,
                    assignees=assignees,
                    url=f"/tasks/{t.id}",
                )
            )

    # ── Observation Plans / Runs ───────────────────────────────────────
    if show_all or CalendarEventType.observation in event_types:
        plans = (
            db.query(ObservationPlan)
            .filter(
                ObservationPlan.company_id == company_id,
                ObservationPlan.due_start_at != None,  # noqa: E711
                ObservationPlan.due_start_at <= range_end,
            )
            .filter(
                (ObservationPlan.due_end_at >= range_start)
                | (ObservationPlan.due_end_at == None)  # noqa: E711
            )
            .all()
        )
        for p in plans:
            events.append(
                CalendarEvent(
                    id=p.id,
                    event_type=CalendarEventType.observation,
                    title=p.name or f"Observation Plan #{p.id}",
                    start=p.due_start_at,
                    end=p.due_end_at,
                    all_day=True,
                    color=EVENT_TYPE_COLORS[CalendarEventType.observation],
                    status=p.status if hasattr(p, "status") else None,
                    url=f"/plandetail/{p.id}",
                )
            )

    # ── Risk Actions ───────────────────────────────────────────────────
    if show_all or CalendarEventType.risk_action in event_types:
        actions = (
            db.query(RiskAction)
            .filter(
                RiskAction.company_id == company_id,
                RiskAction.target_start_date != None,  # noqa: E711
                RiskAction.target_start_date <= range_end,
            )
            .filter(
                (RiskAction.target_completion_date >= range_start)
                | (RiskAction.target_completion_date == None)  # noqa: E711
            )
            .all()
        )
        for a in actions:
            events.append(
                CalendarEvent(
                    id=a.id,
                    event_type=CalendarEventType.risk_action,
                    title=a.action_title if hasattr(a, "action_title") else f"Action #{a.id}",
                    start=a.target_start_date,
                    end=a.target_completion_date,
                    all_day=True,
                    color=EVENT_TYPE_COLORS[CalendarEventType.risk_action],
                    status=a.status.value if hasattr(a, "status") and a.status else None,
                    url=f"/RiskDashboard",
                )
            )

    # ── Training Records ───────────────────────────────────────────────
    if show_all or CalendarEventType.training in event_types:
        records = (
            db.query(TrainingRecord)
            .join(TrainingModule, TrainingRecord.training_module_id == TrainingModule.id)
            .filter(
                TrainingModule.company_id == company_id,
                TrainingRecord.assigned_at != None,  # noqa: E711
                TrainingRecord.assigned_at >= range_start,
                TrainingRecord.assigned_at <= range_end,
            )
            .all()
        )
        for r in records:
            module_name = ""
            if hasattr(r, "module") and r.module:
                module_name = r.module.title or r.module.name or ""

            user_name = ""
            if hasattr(r, "user") and r.user:
                user_name = getattr(r.user, "full_name", "")

            events.append(
                CalendarEvent(
                    id=r.id,
                    event_type=CalendarEventType.training,
                    title=module_name or f"Training #{r.id}",
                    start=r.assigned_at,
                    end=r.expires_at,
                    all_day=True,
                    color=EVENT_TYPE_COLORS[CalendarEventType.training],
                    status=r.status.value if hasattr(r, "status") and r.status else None,
                    assignees=[user_name] if user_name else [],
                    url=f"/training",
                )
            )

    # ── Maintenance ─────────────────────────────────────────────────────
    if show_all or CalendarEventType.maintenance in event_types:
        maint_records = (
            db.query(AssetMaintenance)
            .filter(
                AssetMaintenance.company_id == company_id,
                AssetMaintenance.scheduled_date != None,  # noqa: E711
                AssetMaintenance.scheduled_date >= start_date,
                AssetMaintenance.scheduled_date <= end_date,
            )
            .all()
        )
        for m in maint_records:
            asset_name = ""
            if hasattr(m, "asset") and m.asset:
                asset_name = getattr(m.asset, "name", "")

            title_parts = []
            if m.maintenance_type:
                title_parts.append(m.maintenance_type.capitalize())
            if asset_name:
                title_parts.append(asset_name)
            title = " — ".join(title_parts) if title_parts else f"Maintenance #{m.id}"

            start_dt = datetime.combine(m.scheduled_date, time.min)
            end_dt = (
                datetime.combine(m.completed_date, time.max)
                if m.completed_date
                else None
            )

            events.append(
                CalendarEvent(
                    id=m.id,
                    event_type=CalendarEventType.maintenance,
                    title=title,
                    start=start_dt,
                    end=end_dt,
                    all_day=True,
                    color=EVENT_TYPE_COLORS[CalendarEventType.maintenance],
                    status=m.status if m.status else None,
                    url=f"/assets",
                )
            )

    events.sort(key=lambda e: e.start)
    return events
