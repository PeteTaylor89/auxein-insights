# app/api/v1/tasks.py - Complete Task Management API
import logging
from typing import List, Optional, Literal
from datetime import datetime, date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc, asc
from pydantic import BaseModel, Field, validator
from db.session import get_db

from db.models.task_template import TaskTemplate, TaskCategory
from db.models.task import Task, TaskStatus
from db.models.task_assignment import TaskAssignment
from db.models.contractor_assignment import ContractorAssignment
from db.models.contractor import Contractor
from db.models.contractor_relationship import ContractorRelationship
from db.models.task_row import TaskRow
from db.models.task_gps_track import TaskGPSTrack
from db.models.user import User
from db.models.company import Company
from db.models.block import VineyardBlock
from db.models.spatial_area import SpatialArea
from db.models.vineyard_row import VineyardRow
from db.models.asset import Asset, AssetMaintenance, TaskAsset, StockMovement, AssetCalibration, AssetCalibrationSchedule
from db.models.risk_action import RiskAction
from services.gps_processing import process_gps_track
from services.spray_coverage import compute_spray_coverage, detect_spray_blocks, assess_spray_readiness
from services.property_service import get_visible_property_ids, verify_block_access
from db.models.timesheet import TimesheetDay, TimeEntry, TimesheetStatus
from services.timesheet_rules import create_entry as ts_create_entry

from schemas.task_template import (
    TaskTemplateCreate, TaskTemplateUpdate, TaskTemplateResponse,
    TaskTemplateSummary, TaskTemplateFilter, TaskTemplateWithUsage
)
from schemas.task import (
    TaskCreate, TaskQuickCreate, TaskUpdate, TaskResponse, TaskWithRelations,
    TaskSummary, TaskFilter, TaskStartRequest, TaskPauseRequest, TaskResumeRequest,
    TaskCompleteRequest, TaskCancelRequest, TaskStatsResponse, TaskCalendarEvent,
    TaskBulkUpdateRequest, TaskBulkActionRequest
)
from schemas.task_assignment import (
    TaskAssignmentCreate, TaskAssignmentBulkCreate, TaskAssignmentUpdate,
    TaskAssignmentResponse, TaskAssignmentWithUser, TaskAssignmentAcceptRequest,
    TaskAssignmentDeclineRequest, TaskAssignmentFilter, TaskAssignmentStats,
    MyTasksFilter, TaskReassignRequest
)
from schemas.task_row import (
    TaskRowCreate, TaskRowBulkCreate, TaskRowUpdate, TaskRowResponse,
    TaskRowWithVineyardRow, TaskRowCompleteRequest, TaskRowSkipRequest,
    TaskRowFilter, TaskRowProgressSummary, TaskRowBulkCompleteRequest,
    TaskRowBulkSkipRequest, TaskRowQualityReport
)
from schemas.task_gps_track import (
    TaskGPSTrackCreate, TaskGPSTrackBulkCreate, TaskGPSTrackResponse,
    TaskGPSTrackFilter, TaskGPSTrackStartRequest, TaskGPSTrackPointRequest,
    TaskGPSTrackPauseRequest, TaskGPSTrackResumeRequest, TaskGPSTrackStopRequest,
    TaskGPSTrackSummaryStats, TaskGPSTrackGeometry
)
from services.notification_service import NotificationService
from db.models.notification import NotificationType

from api.deps import get_current_user, get_current_user_or_contractor

logger = logging.getLogger(__name__)


def _display_name(user) -> str:
    """Friendlier name fallback than User.full_name: avoid showing raw email.
    Prefer first+last, then first, then a title-cased local part of the email,
    finally username/id as a last resort.
    """
    if not user:
        return "Unknown"
    first = (getattr(user, "first_name", None) or "").strip()
    last = (getattr(user, "last_name", None) or "").strip()
    if first and last:
        return f"{first} {last}"
    if first:
        return first
    email = (getattr(user, "email", None) or "").strip()
    if email and "@" in email:
        local = email.split("@", 1)[0]
        cleaned = local.replace(".", " ").replace("_", " ").replace("-", " ")
        return cleaned.title() or local
    return (getattr(user, "username", None) or f"User #{getattr(user, 'id', '?')}").strip()
router = APIRouter()


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_task_number(db: Session, company_id: int) -> str:
    """Generate unique task number: TASK-{year}-C{company_id}-{seq}.
    company_id is embedded so numbers stay unique under the global
    unique constraint on task_number."""
    year = datetime.now().year
    prefix = f"TASK-{year}-C{company_id}-"

    # Count existing tasks for this company in this year, retry on collision
    count = db.query(func.count(Task.id)).filter(
        Task.company_id == company_id,
        func.extract('year', Task.created_at) == year
    ).scalar() or 0

    # Walk forward until we find a number that isn't taken (handles deleted-then-recreated gaps)
    seq = count + 1
    while db.query(Task.id).filter(Task.task_number == f"{prefix}{seq:03d}").first():
        seq += 1

    return f"{prefix}{seq:03d}"


def build_task_scope_filter(db: Session, user: User):
    """
    Returns a SQLAlchemy filter restricting Task queries to blocks within the
    user's property scope, plus block-less (company-wide) tasks.
    Returns None for auxein_admin (no narrowing).
    """
    if user.user_type == "auxein_admin":
        return None

    visible_property_ids = get_visible_property_ids(db, user)
    visible_block_ids = [
        row[0] for row in db.query(VineyardBlock.id).filter(
            or_(
                VineyardBlock.property_id.in_(visible_property_ids) if visible_property_ids else False,
                and_(
                    VineyardBlock.property_id.is_(None),
                    VineyardBlock.company_id == user.company_id
                )
            )
        ).all()
    ]

    if visible_block_ids:
        return or_(
            Task.block_id.in_(visible_block_ids),
            Task.block_id.is_(None)
        )
    return Task.block_id.is_(None)


def check_task_access(db: Session, task_id: int, user: User) -> Task:
    """Check if user has access to task and return it"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.company_id == user.company_id
    ).first()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    # Property scope: task tied to a block must have block in user's scope.
    # Block-less tasks are company-wide (visible to all company users).
    if user.user_type != "auxein_admin" and task.block_id is not None:
        verify_block_access(db, user, task.block_id)

    return task


_CONTRACTOR_ACTIVE_ASSIGNMENT_STATUSES = ("assigned", "accepted", "in_progress", "paused")


def check_task_access_for_actor(db: Session, task_id: int, actor) -> Task:
    """Resolve task access for either a User or a Contractor.

    User path: identical to check_task_access (company match + property scope).
    Contractor path: contractor must have a ContractorAssignment for this task
    in a non-terminal status. Plain relationship-to-company is NOT enough —
    contractors only see tasks they're actually on the hook for.
    """
    if isinstance(actor, User):
        return check_task_access(db, task_id, actor)

    if isinstance(actor, Contractor):
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

        assignment = db.query(ContractorAssignment).filter(
            ContractorAssignment.task_id == task_id,
            ContractorAssignment.contractor_id == actor.id,
            ContractorAssignment.status.in_(_CONTRACTOR_ACTIVE_ASSIGNMENT_STATUSES),
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No active assignment for this task",
            )
        return task

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth principal")


def attribution_user_id(db: Session, task: Task, actor) -> int:
    """Return a real users.id to satisfy NOT NULL FKs on rows the actor creates.

    For a User actor that's just actor.id. For a Contractor actor we fall back
    to the task's creator, then to any active company_admin/manager at the
    task's company — same shape as create_my_assignment.assigner.
    """
    if isinstance(actor, User):
        return actor.id
    if task.created_by:
        return task.created_by
    fallback = (
        db.query(User)
        .filter(
            User.company_id == task.company_id,
            User.is_active == True,
            User.user_type.in_(["company_admin", "company_manager"]),
        )
        .order_by(User.id.asc())
        .first()
    )
    if not fallback:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot attribute action — task company has no active admin/manager",
        )
    return fallback.id


def check_template_access(db: Session, template_id: int, user: User) -> TaskTemplate:
    """Check if user has access to template and return it"""
    template = db.query(TaskTemplate).filter(
        TaskTemplate.id == template_id,
        TaskTemplate.company_id == user.company_id
    ).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return template


def can_modify_task(task: Task, user: User) -> bool:
    """Check if user can modify task"""
    # Users with tasks.update permission can modify all tasks
    if user.has_permission("tasks", "update"):
        return True
    
    # User can modify if they created it or are assigned to it
    if task.created_by == user.id:
        return True
    
    # Check if user is assigned
    is_assigned = any(a.user_id == user.id for a in task.assignments)
    return is_assigned


# ============================================================================
# TASK TEMPLATES
# ============================================================================

@router.post("/task-templates", response_model=TaskTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_task_template(
    template_data: TaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new task template (admin/manager only)"""
    if not current_user.has_permission("tasks", "create"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and managers can create templates"
        )
    
    # Create template
    template = TaskTemplate(
        company_id=current_user.company_id,
        created_by=current_user.id,
        **template_data.model_dump()
    )
    
    db.add(template)
    db.commit()
    db.refresh(template)
    
    logger.info(f"Template {template.id} created by user {current_user.id}")
    return template


@router.get("/task-templates", response_model=List[TaskTemplateResponse])
def list_task_templates(
    task_category: Optional[TaskCategory] = None,
    is_active: Optional[bool] = None,
    quick_create_enabled: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List task templates with filtering"""
    query = db.query(TaskTemplate).filter(
        TaskTemplate.company_id == current_user.company_id
    )
    
    # Apply filters
    if task_category:
        query = query.filter(TaskTemplate.task_category == task_category)
    if is_active is not None:
        query = query.filter(TaskTemplate.is_active == is_active)
    if quick_create_enabled is not None:
        query = query.filter(TaskTemplate.quick_create_enabled == quick_create_enabled)
    
    templates = query.order_by(TaskTemplate.name).offset(skip).limit(limit).all()
    return templates


@router.get("/task-templates/quick-create", response_model=List[TaskTemplateSummary])
def list_quick_create_templates(
    task_category: Optional[TaskCategory] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get templates enabled for quick create (for field use)"""
    query = db.query(TaskTemplate).filter(
        TaskTemplate.company_id == current_user.company_id,
        TaskTemplate.is_active == True,
        TaskTemplate.quick_create_enabled == True
    )
    
    if task_category:
        query = query.filter(TaskTemplate.task_category == task_category)
    
    templates = query.order_by(TaskTemplate.name).all()
    return templates


@router.get("/task-templates/{template_id}", response_model=TaskTemplateResponse)
def get_task_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific task template"""
    template = check_template_access(db, template_id, current_user)
    return template


@router.patch("/task-templates/{template_id}", response_model=TaskTemplateResponse)
def update_task_template(
    template_id: int,
    template_update: TaskTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a task template (admin/manager only)"""
    if not current_user.has_permission("tasks", "update"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and managers can update templates"
        )
    
    template = check_template_access(db, template_id, current_user)
    
    # Update fields
    update_data = template_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    
    db.commit()
    db.refresh(template)
    
    logger.info(f"Template {template_id} updated by user {current_user.id}")
    return template


@router.delete("/task-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a task template (admin only)"""
    if not current_user.has_permission("tasks", "delete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete templates"
        )
    
    template = check_template_access(db, template_id, current_user)
    
    # Check if template is in use
    task_count = db.query(func.count(Task.id)).filter(
        Task.template_id == template_id
    ).scalar()
    
    if task_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete template: {task_count} tasks are using it. Consider deactivating instead."
        )
    
    db.delete(template)
    db.commit()
    
    logger.info(f"Template {template_id} deleted by user {current_user.id}")
    return None


# ============================================================================
# TASKS - CRUD
# ============================================================================

@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new task"""
    # If creating from template, load defaults
    template_defaults = {}
    if task_data.template_id:
        template = check_template_access(db, task_data.template_id, current_user)
        template_defaults = template.to_task_defaults()

    # Generate task number
    task_number = generate_task_number(db, current_user.company_id)

    # Merge template defaults with provided data (provided data takes precedence)
    task_dict = task_data.model_dump(exclude_unset=True)
    for key, value in template_defaults.items():
        if key not in task_dict or task_dict[key] is None:
            task_dict[key] = value

    # Property scope: verify the creator can access the chosen block
    target_block_id = task_dict.get('block_id')
    if target_block_id is not None:
        verify_block_access(db, current_user, target_block_id, require_write=True)

    # Auto-schedule if a start date is provided
    initial_status = TaskStatus.scheduled if task_dict.get('scheduled_start_date') else TaskStatus.draft

    # Create task
    task = Task(
        company_id=current_user.company_id,
        task_number=task_number,
        created_by=current_user.id,
        status=initial_status,
        **task_dict
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    logger.info(f"Task {task.task_number} created by user {current_user.id}")
    return task


@router.post("/tasks/quick-create", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def quick_create_task(
    task_data: TaskQuickCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Quick create task from template (for field use)"""
    # Load template
    template = check_template_access(db, task_data.template_id, current_user)
    
    if not template.quick_create_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This template is not enabled for quick create"
        )
    
    # Generate task number
    task_number = generate_task_number(db, current_user.company_id)
    
    # Get template defaults
    template_defaults = template.to_task_defaults()
    
    # Override with provided data
    task_dict = task_data.model_dump(exclude_unset=True, exclude={'assigned_user_ids', 'template_id'})
    for key, value in task_dict.items():
        if value is not None:
            template_defaults[key] = value

    # Remove keys set explicitly below to avoid duplicate keyword args
    for k in ('company_id', 'template_id', 'task_number', 'created_by', 'status'):
        template_defaults.pop(k, None)

    # Property scope: verify the creator can access the chosen block
    target_block_id = template_defaults.get('block_id')
    if target_block_id is not None:
        verify_block_access(db, current_user, target_block_id, require_write=True)

    # Create task
    task = Task(
        company_id=current_user.company_id,
        task_number=task_number,
        template_id=template.id,
        created_by=current_user.id,
        status=TaskStatus.ready,  # Quick create starts as ready
        **template_defaults
    )
    
    db.add(task)
    db.flush()  # Get task ID for assignments
    
    # Create assignments if provided
    if task_data.assigned_user_ids:
        for idx, user_id in enumerate(task_data.assigned_user_ids):
            assignment = TaskAssignment(
                task_id=task.id,
                user_id=user_id,
                assigned_by=current_user.id,
                role="assignee",
                is_primary=(idx == 0)  # First user is primary
            )
            db.add(assignment)
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"Quick task {task.task_number} created by user {current_user.id}")
    return task


# ---------------------------------------------------------------------------
# Unified Feed — merges tasks, maintenance, calibrations, risk actions
# Must be defined BEFORE /tasks/{task_id} to avoid route conflict
# ---------------------------------------------------------------------------

@router.get("/tasks/unified-feed")
def get_unified_feed(
    days_ahead: int = 30,
    include_completed: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a single sorted list combining:
    - Tasks assigned to the current user
    - Maintenance items due/overdue for the company
    - Calibrations due/overdue for the company
    - Risk actions assigned to the current user
    Each item has a `source` field for visual distinction on the client.
    """
    try:
        return _build_unified_feed(db, current_user, days_ahead, include_completed)
    except Exception as e:
        logger.exception(f"Unified feed error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _build_unified_feed(db, current_user, days_ahead, include_completed):
    today = date.today()
    future_date = today + timedelta(days=days_ahead)
    company_id = current_user.company_id
    feed = []

    # --- 1. Tasks assigned to user ---
    task_query = db.query(Task).join(TaskAssignment).filter(
        TaskAssignment.user_id == current_user.id,
        Task.company_id == company_id,
    )
    scope_filter = build_task_scope_filter(db, current_user)
    if scope_filter is not None:
        task_query = task_query.filter(scope_filter)
    if not include_completed:
        task_query = task_query.filter(Task.status.notin_([TaskStatus.completed, TaskStatus.cancelled]))

    for t in task_query.all():
        feed.append({
            "id": t.id,
            "source": "task",
            "title": t.title,
            "description": t.description,
            "status": t.status.value if hasattr(t.status, 'value') else str(t.status),
            "priority": t.priority.value if hasattr(t.priority, 'value') else str(t.priority or 'medium'),
            "scheduled_date": str(t.scheduled_start_date) if t.scheduled_start_date else None,
            "category": t.task_category.value if hasattr(t.task_category, 'value') else str(t.task_category or ''),
            "asset_name": None,
            "block_name": t.block.block_name if t.block else None,
            "progress_percentage": t.progress_percentage,
            "is_overdue": bool(t.scheduled_start_date and t.scheduled_start_date < today and t.status not in [TaskStatus.completed, TaskStatus.cancelled]),
            "task_number": t.task_number,
        })

    # --- 2. Maintenance due/overdue ---
    maint_query = db.query(AssetMaintenance).options(
        joinedload(AssetMaintenance.asset)
    ).filter(
        AssetMaintenance.company_id == company_id,
        AssetMaintenance.status.in_(["scheduled", "in_progress"]),
    )
    if not include_completed:
        maint_query = maint_query.filter(AssetMaintenance.scheduled_date <= future_date)

    for m in maint_query.all():
        is_overdue = bool(m.scheduled_date and m.scheduled_date < today)
        feed.append({
            "id": m.id,
            "source": "maintenance",
            "title": m.title,
            "description": m.description,
            "status": m.status or "scheduled",
            "priority": "high" if is_overdue else "medium",
            "scheduled_date": str(m.scheduled_date) if m.scheduled_date else None,
            "category": m.maintenance_category or m.maintenance_type or "",
            "asset_name": m.asset.name if m.asset else None,
            "block_name": None,
            "progress_percentage": 0,
            "is_overdue": is_overdue,
            "task_number": None,
        })

    # --- 3. Calibrations due/overdue ---
    # Feed pulls from forward-looking schedule tickets (status='pending'). Event rows
    # in asset_calibrations are history-only and not surfaced here.
    sched_query = (
        db.query(AssetCalibrationSchedule)
        .options(joinedload(AssetCalibrationSchedule.asset))
        .filter(
            AssetCalibrationSchedule.company_id == company_id,
            AssetCalibrationSchedule.status == "pending",
            AssetCalibrationSchedule.due_date <= future_date,
        )
    )
    for s in sched_query.all():
        is_overdue = s.due_date < today
        feed.append({
            "id": s.id,
            "source": "calibration",
            "title": f"Calibrate: {s.parameter_name}" if s.parameter_name else f"Calibrate: {s.asset.name if s.asset else 'asset'}",
            "description": s.notes,
            "status": "overdue" if is_overdue else "due",
            "priority": "high" if is_overdue else "medium",
            "scheduled_date": str(s.due_date),
            "category": s.calibration_type or "",
            "asset_name": s.asset.name if s.asset else None,
            "block_name": None,
            "progress_percentage": 0,
            "is_overdue": is_overdue,
            "task_number": None,
            # Spec snapshot for at-a-glance display on the mobile feed card.
            # Decimals → floats so the payload serialises without help.
            "parameter_name": s.parameter_name,
            "unit_of_measure": s.unit_of_measure,
            "target_value": float(s.target_value) if s.target_value is not None else None,
            "tolerance_min": float(s.tolerance_min) if s.tolerance_min is not None else None,
            "tolerance_max": float(s.tolerance_max) if s.tolerance_max is not None else None,
        })

    # --- 4. Risk actions assigned to user ---
    risk_query = db.query(RiskAction).filter(
        RiskAction.company_id == company_id,
        RiskAction.assigned_to == current_user.id,
    )
    if not include_completed:
        risk_query = risk_query.filter(RiskAction.status.in_(["planned", "in_progress", "overdue"]))

    for r in risk_query.all():
        # target_completion_date is DateTime — extract date for comparison
        due_dt = r.target_completion_date
        due_date = due_dt.date() if due_dt else None
        is_overdue = bool(due_date and due_date < today and r.status != "completed")
        feed.append({
            "id": r.id,
            "source": "risk_action",
            "title": r.action_title,
            "description": r.action_description or "",
            "status": r.status or "planned",
            "priority": r.priority or "medium",
            "scheduled_date": str(due_date) if due_date else None,
            "category": r.action_type or "",
            "asset_name": None,
            "block_name": None,
            "progress_percentage": r.progress_percentage or 0,
            "is_overdue": is_overdue,
            "task_number": None,
        })

    # --- Sort: overdue first, then by scheduled date ---
    feed.sort(key=lambda x: (
        not x["is_overdue"],
        x["scheduled_date"] or "9999-99-99",
    ))

    return feed


@router.get("/tasks", response_model=List[TaskWithRelations])
def list_tasks(
    status: Optional[TaskStatus] = None,
    task_category: Optional[TaskCategory] = None,
    priority: Optional[str] = None,
    block_id: Optional[int] = None,
    spatial_area_id: Optional[int] = None,
    assigned_to_user_id: Optional[int] = None,
    created_by: Optional[int] = None,
    scheduled_start_from: Optional[date] = None,
    scheduled_start_to: Optional[date] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List tasks with comprehensive filtering. Eagerly loads block + assignees so the
    web Task Management table can render block name and assignee names without a follow-up call.
    """
    query = db.query(Task).options(
        joinedload(Task.block),
        joinedload(Task.spatial_area),
        joinedload(Task.assignments).joinedload(TaskAssignment.user),
    ).filter(
        Task.company_id == current_user.company_id
    )
    scope_filter = build_task_scope_filter(db, current_user)
    if scope_filter is not None:
        query = query.filter(scope_filter)

    # Apply filters
    if status:
        query = query.filter(Task.status == status)
    if task_category:
        query = query.filter(Task.task_category == task_category)
    if priority:
        query = query.filter(Task.priority == priority)
    if block_id:
        query = query.filter(Task.block_id == block_id)
    if spatial_area_id:
        query = query.filter(Task.spatial_area_id == spatial_area_id)
    if created_by:
        query = query.filter(Task.created_by == created_by)
    
    # Date filters
    if scheduled_start_from:
        query = query.filter(Task.scheduled_start_date >= scheduled_start_from)
    if scheduled_start_to:
        query = query.filter(Task.scheduled_start_date <= scheduled_start_to)
    
    # Assignment filter
    if assigned_to_user_id:
        query = query.join(TaskAssignment).filter(
            TaskAssignment.user_id == assigned_to_user_id
        )
    
    # Search
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Task.title.ilike(search_term),
                Task.task_number.ilike(search_term),
                Task.description.ilike(search_term)
            )
        )
    
    # Order by scheduled date, then priority, then created date
    query = query.order_by(
        Task.scheduled_start_date.asc().nullsfirst(),
        desc(Task.priority),
        desc(Task.created_at)
    )
    
    tasks = query.offset(skip).limit(limit).all()

    # Bulk-fetch contractor assignments for these tasks to keep the response cheap.
    task_ids = [t.id for t in tasks]
    contractor_rows = []
    if task_ids:
        contractor_rows = (
            db.query(ContractorAssignment, Contractor)
            .join(Contractor, ContractorAssignment.contractor_id == Contractor.id)
            .filter(ContractorAssignment.task_id.in_(task_ids))
            .all()
        )
    by_task = {}
    for ca, c in contractor_rows:
        by_task.setdefault(ca.task_id, []).append(c)

    # Populate computed fields the response model expects.
    for t in tasks:
        t.assignment_count = len(t.assignments)
        t.assignee_names = [_display_name(a.user) for a in t.assignments if a.user]
        t.assigned_user_ids = [a.user_id for a in t.assignments if a.user_id]
        t_contractors = by_task.get(t.id, [])
        t.contractor_names = [c.business_name for c in t_contractors]
        t.assigned_contractor_ids = [c.id for c in t_contractors]

    return tasks


@router.get("/tasks/{task_id}", response_model=TaskWithRelations)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Get a specific task with all relations.

    Contractor branch: must have an active ContractorAssignment for this task.
    """
    # check_task_access_for_actor enforces company-match + property scope (User)
    # or active-assignment (Contractor); raises 403/404 if unauthorized.
    check_task_access_for_actor(db, task_id, actor)

    task = db.query(Task).options(
        joinedload(Task.block),
        joinedload(Task.spatial_area),
        joinedload(Task.creator),
        joinedload(Task.completer),
        joinedload(Task.assignments).joinedload(TaskAssignment.user)
    ).filter(Task.id == task_id).first()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    # Add computed fields
    task.assignment_count = len(task.assignments)
    task.assignee_names = [_display_name(a.user) for a in task.assignments if a.user]
    task.assigned_user_ids = [a.user_id for a in task.assignments if a.user_id]

    # Contractor assignments for this task
    contractor_rows = (
        db.query(ContractorAssignment, Contractor)
        .join(Contractor, ContractorAssignment.contractor_id == Contractor.id)
        .filter(ContractorAssignment.task_id == task.id)
        .all()
    )
    task.contractor_names = [c.business_name for _, c in contractor_rows]
    task.assigned_contractor_ids = [c.id for _, c in contractor_rows]
    
    # Get files (if file integration is ready)
    # task.files = get_task_files(db, task_id)
    
    return task


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_update: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a task"""
    task = check_task_access(db, task_id, current_user)
    
    # Check permissions
    if not can_modify_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this task"
        )
    
    update_data = task_update.model_dump(exclude_unset=True)

    # Don't allow updates to completed/cancelled tasks
    if task.status in [TaskStatus.completed, TaskStatus.cancelled]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update {task.status} tasks"
        )

    # Update fields
    for field, value in update_data.items():
        setattr(task, field, value)

    # Auto-schedule: if task is still draft and now has a start date, bump to scheduled
    if task.status == TaskStatus.draft and task.scheduled_start_date:
        task.status = TaskStatus.scheduled

    db.commit()
    db.refresh(task)

    logger.info(f"Task {task_id} updated by user {current_user.id}")
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a task (admin/manager or creator only)"""
    task = check_task_access(db, task_id, current_user)
    
    # Only users with delete permission, or task creator can delete
    if not current_user.has_permission("tasks", "delete") and task.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins, managers, or task creator can delete tasks"
        )
    
    # Don't allow deletion of completed tasks (soft delete via cancel instead)
    if task.status == TaskStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete completed tasks. Use cancel instead."
        )

    db.delete(task)
    db.commit()
    
    logger.info(f"Task {task_id} deleted by user {current_user.id}")
    return None


# ============================================================================
# TASKS - ACTIONS
# ============================================================================

@router.patch("/tasks/{task_id}/reschedule", response_model=TaskResponse)
def reschedule_task(
    task_id: int,
    dates: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reschedule a task (date-only update). Used by calendar drag-and-drop."""
    task = check_task_access(db, task_id, current_user)

    if not can_modify_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this task"
        )

    if task.status in [TaskStatus.completed, TaskStatus.cancelled]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reschedule {task.status.value} tasks"
        )

    from datetime import date as date_type
    if "scheduled_start_date" in dates:
        task.scheduled_start_date = date_type.fromisoformat(dates["scheduled_start_date"])
    if "scheduled_end_date" in dates:
        task.scheduled_end_date = date_type.fromisoformat(dates["scheduled_end_date"])

    db.commit()
    db.refresh(task)
    logger.info(f"Task {task_id} rescheduled by user {current_user.id}")
    return task


@router.get("/tasks/{task_id}/equipment-check")
def get_equipment_check(
    task_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """P1: Get pre-task equipment check status for a task's assets."""
    task = check_task_access_for_actor(db, task_id, actor)
    checks = []
    for ta in task.task_assets:
        asset = ta.asset
        if not asset:
            continue
        check = {
            "task_asset_id": ta.id,
            "asset_id": asset.id,
            "asset_name": asset.name,
            "role": ta.role,
            "is_required": ta.is_required,
            "is_consumable": asset.asset_type == "consumable",
            "pre_task_check_completed": ta.pre_task_check_completed or False,
            "requires_calibration": ta.requires_calibration or False,
            "calibration_overdue": False,
            "last_calibration_date": None,
            "planned_quantity": float(ta.planned_quantity) if ta.planned_quantity else None,
            "unit": asset.unit_of_measure,
            "current_stock": float(asset.current_stock) if asset.current_stock else None,
        }
        # Check calibration status
        if ta.requires_calibration or asset.requires_calibration:
            check["requires_calibration"] = True
            last_cal = (
                db.query(AssetCalibration)
                .filter(AssetCalibration.asset_id == asset.id)
                .order_by(AssetCalibration.calibration_date.desc())
                .first()
            )
            if last_cal:
                check["last_calibration_date"] = str(last_cal.calibration_date)
                if last_cal.due_date and last_cal.due_date < datetime.now().date():
                    check["calibration_overdue"] = True
            else:
                check["calibration_overdue"] = True
        checks.append(check)
    return {"task_id": task_id, "equipment_checks": checks}


@router.post("/tasks/{task_id}/start", response_model=TaskResponse)
def start_task(
    task_id: int,
    start_request: TaskStartRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Start a task. P1: checks equipment calibration status before starting."""
    task = check_task_access_for_actor(db, task_id, actor)

    # Check if task can be started
    if not task.can_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start task with status: {task.status}"
        )

    # P1: Pre-task equipment checks
    if not start_request.skip_equipment_check:
        overdue_assets = []
        for ta in task.task_assets:
            asset = ta.asset
            if not asset:
                continue
            needs_cal = ta.requires_calibration or asset.requires_calibration
            if not needs_cal:
                continue
            last_cal = (
                db.query(AssetCalibration)
                .filter(AssetCalibration.asset_id == asset.id)
                .order_by(AssetCalibration.calibration_date.desc())
                .first()
            )
            is_overdue = False
            if not last_cal:
                is_overdue = True
            elif last_cal.due_date and last_cal.due_date < datetime.now().date():
                is_overdue = True
            if is_overdue:
                overdue_assets.append(asset.name)

        if overdue_assets:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Equipment calibration overdue. Set skip_equipment_check=true to override.",
                    "overdue_assets": overdue_assets
                }
            )

    # Mark pre-task checks as completed
    now = datetime.now()
    for ta in task.task_assets:
        if ta.is_required and not ta.pre_task_check_completed:
            ta.pre_task_check_completed = True
            ta.pre_task_check_at = now

    # Update task
    task.status = TaskStatus.in_progress
    task.actual_start_time = now

    # Start GPS tracking if requested
    if start_request.start_gps_tracking and task.requires_gps_tracking:
        task.gps_tracking_active = True

    # Move the contractor's assignment to in_progress so the Tasks tab + admin
    # views reflect that the contractor is actually working it.
    if isinstance(actor, Contractor):
        ca = db.query(ContractorAssignment).filter(
            ContractorAssignment.task_id == task_id,
            ContractorAssignment.contractor_id == actor.id,
        ).first()
        if ca and ca.status in ("assigned", "accepted"):
            ca.status = "in_progress"
            ca.actual_start = now

    db.commit()
    db.refresh(task)

    logger.info(f"Task {task_id} started by actor {type(actor).__name__}:{actor.id}")
    return task


@router.get("/tasks/{task_id}/consumables")
def get_task_consumables(
    task_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """P0: Get consumable TaskAssets for the completion UI (pre-fill actual quantities)."""
    task = check_task_access_for_actor(db, task_id, actor)
    consumables = []
    for ta in task.task_assets:
        asset = ta.asset
        if not asset or asset.asset_type != "consumable":
            continue
        consumables.append({
            "task_asset_id": ta.id,
            "asset_id": asset.id,
            "asset_name": asset.name,
            "unit": asset.unit_of_measure,
            "planned_quantity": float(ta.planned_quantity) if ta.planned_quantity else 0,
            "actual_quantity": float(ta.actual_quantity) if ta.actual_quantity else None,
            "current_stock": float(asset.current_stock) if asset.current_stock else 0,
            "batch_number": ta.batch_number,
        })
    return {"task_id": task_id, "consumables": consumables}


@router.post("/tasks/{task_id}/pause", response_model=TaskResponse)
def pause_task(
    task_id: int,
    pause_request: TaskPauseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Pause a task"""
    task = check_task_access(db, task_id, current_user)
    
    if task.status != TaskStatus.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only pause tasks that are in progress"
        )
    
    # Update task
    task.status = TaskStatus.paused
    task.paused_at = datetime.now()
    
    # Pause GPS tracking if requested
    if pause_request.pause_gps_tracking:
        task.gps_tracking_active = False
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"Task {task_id} paused by user {current_user.id}")
    return task


@router.post("/tasks/{task_id}/resume", response_model=TaskResponse)
def resume_task(
    task_id: int,
    resume_request: TaskResumeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Resume a paused task"""
    task = check_task_access(db, task_id, current_user)
    
    if task.status != TaskStatus.paused:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only resume paused tasks"
        )
    
    # Calculate pause duration
    if task.paused_at:
        pause_duration = (datetime.now() - task.paused_at).total_seconds() / 60
        task.total_pause_duration_minutes += int(pause_duration)
    
    # Update task
    task.status = TaskStatus.in_progress
    task.paused_at = None
    
    # Resume GPS tracking if requested
    if resume_request.resume_gps_tracking and task.requires_gps_tracking:
        task.gps_tracking_active = True
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"Task {task_id} resumed by user {current_user.id}")
    return task


@router.post("/tasks/{task_id}/complete", response_model=TaskResponse)
def complete_task(
    task_id: int,
    complete_request: TaskCompleteRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Complete a task"""
    task = check_task_access_for_actor(db, task_id, actor)
    is_contractor = isinstance(actor, Contractor)
    # tasks.completed_by FK is to users.id (nullable); for contractor completions
    # leave it null. Stock movements / timesheets / notifications all need a real
    # User, so derive one only when we need to write those rows.
    completer_user_id = actor.id if not is_contractor else None

    if task.status in [TaskStatus.completed, TaskStatus.cancelled]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task is already {task.status}"
        )

    # Update task
    task.status = TaskStatus.completed
    task.actual_end_time = datetime.now()
    task.completed_at = datetime.now()
    task.completed_by = completer_user_id
    task.completion_notes = complete_request.completion_notes
    task.progress_percentage = 100
    
    # Add completion photos
    if complete_request.completion_photo_ids:
        task.completion_photos = complete_request.completion_photo_ids
    
    # Add weather conditions
    if complete_request.weather_conditions:
        task.weather_conditions = complete_request.weather_conditions
    
    # Stop GPS tracking
    task.gps_tracking_active = False

    # P0: Process consumable actuals → create StockMovements
    if complete_request.consumable_actuals:
        for ca in complete_request.consumable_actuals:
            ta = db.query(TaskAsset).filter(
                TaskAsset.id == ca.task_asset_id,
                TaskAsset.task_id == task.id,
            ).first()
            if not ta or not ta.asset:
                continue

            asset = ta.asset
            actual_qty = Decimal(str(ca.actual_quantity))

            # Update TaskAsset with actuals
            ta.actual_quantity = actual_qty
            if ca.batch_number:
                ta.batch_number = ca.batch_number
            if ta.planned_quantity and task.area_total_hectares:
                ta.actual_rate = actual_qty / task.area_total_hectares

            # Create StockMovement (negative = usage)
            stock_before = asset.current_stock or Decimal("0")
            stock_after = stock_before - actual_qty

            movement = StockMovement(
                asset_id=asset.id,
                company_id=task.company_id,
                movement_type="usage",
                movement_date=datetime.now(),
                quantity=-actual_qty,
                task_id=task.id,
                block_id=task.block_id,
                batch_number=ca.batch_number,
                usage_rate=float(ta.actual_rate) if ta.actual_rate else None,
                area_treated=float(task.area_total_hectares) if task.area_total_hectares else None,
                stock_before=stock_before,
                stock_after=stock_after,
                notes=f"Auto-deducted on task {task.task_number} completion",
                created_by=completer_user_id,
            )
            db.add(movement)

            # Update asset stock level
            asset.current_stock = stock_after
            if stock_after <= 0:
                asset.status = "out_of_stock"

    # Update all assignments to completed
    for assignment in task.assignments:
        if assignment.status in ["assigned", "accepted"]:
            assignment.status = "completed"

    # Move the contractor's own assignment(s) to completed too. Hours land on
    # ContractorAssignment.actual_hours_worked rather than a user Timesheet.
    # Also propagate to the relationship + contractor rollups so the mobile
    # Contracts list and the web Relationships table show real numbers (this
    # was missed in the original wiring — runs once per fresh completion only
    # to avoid double-counting if the endpoint is hit twice).
    if is_contractor:
        contractor_assignments = db.query(ContractorAssignment).filter(
            ContractorAssignment.task_id == task.id,
            ContractorAssignment.contractor_id == actor.id,
        ).all()
        now = datetime.now()
        primary_hours_credited = False
        for ca_row in contractor_assignments:
            if ca_row.status != "completed":
                was_already_completed = False
                ca_row.status = "completed"
                ca_row.actual_end = now
                ca_row.completion_percentage = 100
                if complete_request.hours_worked and complete_request.hours_worked > 0:
                    # If multiple assignments cover this task (rare) only the first
                    # gets hours so we don't double-count. Subsequent rows leave
                    # actual_hours_worked untouched.
                    if ca_row.actual_hours_worked is None:
                        ca_row.actual_hours_worked = complete_request.hours_worked
            else:
                was_already_completed = True

            if not was_already_completed and not primary_hours_credited:
                # First just-completed row drives the rollup credit for this task.
                primary_hours_credited = True
                hours_for_rollup = float(complete_request.hours_worked) if complete_request.hours_worked and complete_request.hours_worked > 0 else float(ca_row.actual_hours_worked or 0)
                relationship = db.query(ContractorRelationship).filter(
                    ContractorRelationship.contractor_id == actor.id,
                    ContractorRelationship.company_id == task.company_id,
                ).first()
                if relationship:
                    relationship.update_performance_stats(hours_worked=hours_for_rollup if hours_for_rollup > 0 else None)
                # Cross-company total on the Contractor row
                contractor_row = db.query(Contractor).filter(Contractor.id == actor.id).first()
                if contractor_row:
                    contractor_row.total_jobs_completed = (contractor_row.total_jobs_completed or 0) + 1

    # Log hours to today's timesheet (User actor only — contractors aren't on the timesheet)
    hours_entry_created = False
    if (
        not is_contractor
        and complete_request.hours_worked
        and complete_request.hours_worked > 0
    ):
        work_date = date.today()
        day = db.query(TimesheetDay).filter(
            TimesheetDay.company_id == task.company_id,
            TimesheetDay.user_id == actor.id,
            TimesheetDay.work_date == work_date,
        ).first()
        if not day:
            day = TimesheetDay(
                company_id=task.company_id,
                user_id=actor.id,
                work_date=work_date,
                status=TimesheetStatus.draft,
            )
            db.add(day)
            db.flush()
        # Only append entry if day is still editable
        if day.status in (TimesheetStatus.draft, TimesheetStatus.submitted, TimesheetStatus.rejected):
            try:
                ts_create_entry(db, day.id, task.id, complete_request.hours_worked)
                hours_entry_created = True
            except Exception as e:
                logger.warning(f"Timesheet entry failed for task {task_id}: {e}")

    db.commit()
    db.refresh(task)

    # Notify task creator (if different from completer — and we have a user completer)
    if task.created_by and task.created_by != completer_user_id:
        notification_service = NotificationService(db)
        creator = db.query(User).filter(User.id == task.created_by).first()
        if creator:
            notification_service.notify_user(
                user=creator,
                notification_type=NotificationType.task,
                title=f"Task completed: {task.task_number}",
                body=task.title,
                data={"task_id": task.id, "task_number": task.task_number}
            )
            db.commit()

    # Notify the user themselves if hours were logged (so the timesheet update is visible).
    # Contractor actors have no timesheet, so this branch only fires for User actors.
    if hours_entry_created and not is_contractor:
        notification_service = NotificationService(db)
        notification_service.notify_user(
            user=actor,
            notification_type=NotificationType.timesheet,
            title=f"{complete_request.hours_worked}h added to today's timesheet",
            body=f"From task {task.task_number}: {task.title}",
            data={"task_id": task.id, "task_number": task.task_number, "hours": str(complete_request.hours_worked)},
        )
        db.commit()

    # Process GPS breadcrumbs into summary (if any points exist)
    if task.requires_gps_tracking:
        try:
            process_gps_track(task_id, db)
        except Exception as e:
            logger.warning(f"GPS summary processing failed for task {task_id}: {e}")

        # Spray coverage — no-ops unless the task used an asset with a swath
        # width + resolvable flow rate. Computed for the task's own block here;
        # multi-block detection/propagation is Phase 3.
        try:
            compute_spray_coverage(task_id, db)
        except Exception as e:
            logger.warning(f"Spray coverage processing failed for task {task_id}: {e}")

    logger.info(f"Task {task_id} completed by actor {type(actor).__name__}:{actor.id}")

    return task


@router.post("/tasks/{task_id}/cancel", response_model=TaskResponse)
def cancel_task(
    task_id: int,
    cancel_request: TaskCancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cancel a task"""
    task = check_task_access(db, task_id, current_user)
    
    # Check permissions
    if not can_modify_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to cancel this task"
        )
    
    if task.status in [TaskStatus.completed, TaskStatus.cancelled]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel {task.status} task"
        )
    
    # Update task
    task.status = TaskStatus.cancelled
    task.cancelled_at = datetime.now()
    task.cancelled_by = current_user.id
    task.cancellation_reason = cancel_request.cancellation_reason
    
    # Stop GPS tracking
    task.gps_tracking_active = False
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"Task {task_id} cancelled by user {current_user.id}")
    return task


# ============================================================================
# TASK ASSIGNMENTS
# ============================================================================

@router.post("/tasks/{task_id}/assignments", response_model=TaskAssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_task_assignment(
    task_id: int,
    assignment_data: TaskAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Assign a user to a task"""
    task = check_task_access(db, task_id, current_user)
    
    # Check permissions
    if not can_modify_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to assign users to this task"
        )
    
    # Check if user exists and is in same company
    user = db.query(User).filter(
        User.id == assignment_data.user_id,
        User.company_id == current_user.company_id
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if already assigned
    existing = db.query(TaskAssignment).filter(
        TaskAssignment.task_id == task_id,
        TaskAssignment.user_id == assignment_data.user_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already assigned to this task"
        )
    
    # Create assignment
    assignment = TaskAssignment(
        task_id=task_id,
        assigned_by=current_user.id,
        **assignment_data.model_dump()
    )
    
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    # Notify assignee
    notification_service = NotificationService(db)
    assignee = db.query(User).filter(User.id == assignment_data.user_id).first()
    if assignee:
        notification_service.notify_user(
            user=assignee,
            notification_type=NotificationType.task,
            title=f"Task assigned: {task.task_number}",
            body=task.title,
            data={"task_id": task.id, "task_number": task.task_number}
        )
        db.commit()

    logger.info(f"User {assignment_data.user_id} assigned to task {task_id}")

    return assignment


@router.post("/tasks/{task_id}/assignments/bulk", response_model=List[TaskAssignmentResponse], status_code=status.HTTP_201_CREATED)
def create_bulk_assignments(
    task_id: int,
    bulk_data: TaskAssignmentBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Assign multiple users to a task at once"""
    task = check_task_access(db, task_id, current_user)
    
    # Check permissions
    if not can_modify_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to assign users to this task"
        )
    
    # Verify all users exist
    users = db.query(User).filter(
        User.id.in_(bulk_data.user_ids),
        User.company_id == current_user.company_id
    ).all()
    
    if len(users) != len(bulk_data.user_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more users not found"
        )
    
    assignments = []
    for idx, user_id in enumerate(bulk_data.user_ids):
        # Check if already assigned
        existing = db.query(TaskAssignment).filter(
            TaskAssignment.task_id == task_id,
            TaskAssignment.user_id == user_id
        ).first()
        
        if existing:
            continue  # Skip if already assigned
        
        assignment = TaskAssignment(
            task_id=task_id,
            user_id=user_id,
            assigned_by=current_user.id,
            role=bulk_data.role,
            is_primary=(idx == 0 and bulk_data.set_first_as_primary),
            estimated_hours=bulk_data.estimated_hours
        )
        db.add(assignment)
        assignments.append(assignment)
    
    db.commit()
    for assignment in assignments:
        db.refresh(assignment)
    
    logger.info(f"{len(assignments)} users assigned to task {task_id}")
    return assignments


@router.get("/tasks/{task_id}/assignments", response_model=List[TaskAssignmentWithUser])
def list_task_assignments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all assignments for a task"""
    task = check_task_access(db, task_id, current_user)
    
    assignments = db.query(TaskAssignment).options(
        joinedload(TaskAssignment.user),
        joinedload(TaskAssignment.assigner)
    ).filter(
        TaskAssignment.task_id == task_id
    ).all()
    
    return assignments


@router.delete("/tasks/{task_id}/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_task_assignment(
    task_id: int,
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a user assignment from a task"""
    task = check_task_access(db, task_id, current_user)
    
    # Check permissions
    if not can_modify_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify assignments"
        )
    
    assignment = db.query(TaskAssignment).filter(
        TaskAssignment.id == assignment_id,
        TaskAssignment.task_id == task_id
    ).first()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    db.delete(assignment)
    db.commit()
    
    logger.info(f"Assignment {assignment_id} removed from task {task_id}")
    return None


@router.post("/tasks/{task_id}/assignments/{assignment_id}/accept", response_model=TaskAssignmentResponse)
def accept_assignment(
    task_id: int,
    assignment_id: int,
    accept_data: TaskAssignmentAcceptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Accept a task assignment"""
    task = check_task_access(db, task_id, current_user)
    
    assignment = db.query(TaskAssignment).filter(
        TaskAssignment.id == assignment_id,
        TaskAssignment.task_id == task_id,
        TaskAssignment.user_id == current_user.id
    ).first()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found or not assigned to you"
        )
    
    if assignment.status != "assigned":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot accept assignment with status: {assignment.status}"
        )
    
    assignment.status = "accepted"
    assignment.accepted_at = datetime.now()
    
    db.commit()
    db.refresh(assignment)
    
    logger.info(f"Assignment {assignment_id} accepted by user {current_user.id}")
    return assignment


@router.post("/tasks/{task_id}/assignments/{assignment_id}/decline", response_model=TaskAssignmentResponse)
def decline_assignment(
    task_id: int,
    assignment_id: int,
    decline_data: TaskAssignmentDeclineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Decline a task assignment"""
    task = check_task_access(db, task_id, current_user)
    
    assignment = db.query(TaskAssignment).filter(
        TaskAssignment.id == assignment_id,
        TaskAssignment.task_id == task_id,
        TaskAssignment.user_id == current_user.id
    ).first()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found or not assigned to you"
        )
    
    if assignment.status != "assigned":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot decline assignment with status: {assignment.status}"
        )
    
    assignment.status = "declined"
    assignment.declined_at = datetime.now()
    assignment.decline_reason = decline_data.decline_reason
    
    db.commit()
    db.refresh(assignment)
    
    logger.info(f"Assignment {assignment_id} declined by user {current_user.id}")
    return assignment


# ============================================================================
# TASK ROWS
# ============================================================================

@router.post("/tasks/{task_id}/rows", response_model=TaskRowResponse, status_code=status.HTTP_201_CREATED)
def create_task_row(
    task_id: int,
    row_data: TaskRowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a row to track for a task"""
    task = check_task_access(db, task_id, current_user)
    
    # Verify vineyard row exists if provided
    if row_data.vineyard_row_id:
        vineyard_row = db.query(VineyardRow).filter(
            VineyardRow.id == row_data.vineyard_row_id
        ).first()
        
        if not vineyard_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vineyard row not found"
            )
        
        # Check if already added
        existing = db.query(TaskRow).filter(
            TaskRow.task_id == task_id,
            TaskRow.vineyard_row_id == row_data.vineyard_row_id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This row is already added to the task"
            )
    
    # Create task row
    task_row = TaskRow(
        task_id=task_id,
        **row_data.model_dump()
    )
    
    db.add(task_row)
    
    # Update task rows_total
    if task.rows_total:
        task.rows_total += 1
    else:
        task.rows_total = 1
    
    db.commit()
    db.refresh(task_row)
    
    logger.info(f"Row added to task {task_id}")
    return task_row


@router.post("/tasks/{task_id}/rows/bulk", response_model=List[TaskRowResponse], status_code=status.HTTP_201_CREATED)
def create_bulk_task_rows(
    task_id: int,
    bulk_data: TaskRowBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk add rows to a task from a block"""
    task = check_task_access(db, task_id, current_user)
    
    # Get block
    block = db.query(VineyardBlock).filter(
        VineyardBlock.id == bulk_data.block_id,
        VineyardBlock.company_id == current_user.company_id
    ).first()
    
    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found"
        )
    
    # Get rows to add
    if bulk_data.vineyard_row_ids:
        rows = db.query(VineyardRow).filter(
            VineyardRow.id.in_(bulk_data.vineyard_row_ids),
            VineyardRow.block_id == bulk_data.block_id
        ).all()
    else:
        # Add all rows from block
        rows = db.query(VineyardRow).filter(
            VineyardRow.block_id == bulk_data.block_id
        ).all()
    
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No rows found for this block"
        )
    
    # Create task rows
    task_rows = []
    for row in rows:
        # Check if already added
        existing = db.query(TaskRow).filter(
            TaskRow.task_id == task_id,
            TaskRow.vineyard_row_id == row.id
        ).first()
        
        if existing:
            continue  # Skip if already added
        
        task_row = TaskRow(
            task_id=task_id,
            vineyard_row_id=row.id,
            block_id=bulk_data.block_id,
            row_number=row.row_number
        )
        db.add(task_row)
        task_rows.append(task_row)
    
    # Update task rows_total
    task.rows_total = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id
    ).scalar()
    
    db.commit()
    for task_row in task_rows:
        db.refresh(task_row)
    
    logger.info(f"{len(task_rows)} rows added to task {task_id}")
    return task_rows


@router.get("/tasks/{task_id}/rows", response_model=List[TaskRowWithVineyardRow])
def list_task_rows(
    task_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """List all rows for a task"""
    task = check_task_access_for_actor(db, task_id, actor)
    
    query = db.query(TaskRow).options(
        joinedload(TaskRow.vineyard_row)
    ).filter(
        TaskRow.task_id == task_id
    )
    
    if status:
        query = query.filter(TaskRow.status == status)
    
    rows = query.order_by(TaskRow.id).all()
    return rows


@router.post("/tasks/{task_id}/rows/{row_id}/complete", response_model=TaskRowResponse)
def complete_task_row(
    task_id: int,
    row_id: int,
    complete_data: TaskRowCompleteRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Mark a row as completed"""
    task = check_task_access_for_actor(db, task_id, actor)

    task_row = db.query(TaskRow).filter(
        TaskRow.id == row_id,
        TaskRow.task_id == task_id
    ).first()

    if not task_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task row not found"
        )

    if task_row.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Row is already completed"
        )

    # Update row. completed_by FK is nullable — leave null on contractor completions.
    task_row.status = "completed"
    task_row.completed_at = datetime.now()
    task_row.completed_by = actor.id if isinstance(actor, User) else None
    task_row.percentage_complete = 100
    
    if complete_data.notes:
        task_row.notes = complete_data.notes
    if complete_data.issues_found:
        task_row.issues_found = complete_data.issues_found
    if complete_data.quality_rating:
        task_row.quality_rating = complete_data.quality_rating
    if complete_data.duration_minutes:
        task_row.duration_minutes = complete_data.duration_minutes
    
    # Update task progress
    task.rows_completed = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id,
        TaskRow.status == "completed"
    ).scalar()
    
    if task.rows_total and task.rows_total > 0:
        task.progress_percentage = min(100, int((task.rows_completed / task.rows_total) * 100))
    
    db.commit()
    db.refresh(task_row)
    
    logger.info(f"Task row {row_id} completed")
    return task_row


@router.post("/tasks/{task_id}/rows/{row_id}/skip", response_model=TaskRowResponse)
def skip_task_row(
    task_id: int,
    row_id: int,
    skip_data: TaskRowSkipRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Mark a row as skipped"""
    task = check_task_access_for_actor(db, task_id, actor)
    
    task_row = db.query(TaskRow).filter(
        TaskRow.id == row_id,
        TaskRow.task_id == task_id
    ).first()
    
    if not task_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task row not found"
        )
    
    if task_row.status in ["completed", "skipped"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Row is already {task_row.status}"
        )
    
    # Update row
    task_row.status = "skipped"
    task_row.skip_reason = skip_data.skip_reason
    
    db.commit()
    db.refresh(task_row)
    
    logger.info(f"Task row {row_id} skipped")
    return task_row


@router.get("/tasks/{task_id}/rows/progress", response_model=TaskRowProgressSummary)
def get_task_row_progress(
    task_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Get progress summary for task rows"""
    task = check_task_access_for_actor(db, task_id, actor)
    
    # Count rows by status
    total_rows = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id
    ).scalar() or 0
    
    completed_rows = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id,
        TaskRow.status == "completed"
    ).scalar() or 0
    
    skipped_rows = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id,
        TaskRow.status == "skipped"
    ).scalar() or 0
    
    in_progress_rows = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id,
        TaskRow.status == "in_progress"
    ).scalar() or 0
    
    pending_rows = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id,
        TaskRow.status == "pending"
    ).scalar() or 0
    
    # Quality metrics
    avg_quality = db.query(func.avg(TaskRow.quality_rating)).filter(
        TaskRow.task_id == task_id,
        TaskRow.quality_rating.isnot(None)
    ).scalar()
    
    rows_with_issues = db.query(func.count(TaskRow.id)).filter(
        TaskRow.task_id == task_id,
        TaskRow.issues_found.isnot(None)
    ).scalar() or 0
    
    # Time metrics
    total_duration = db.query(func.sum(TaskRow.duration_minutes)).filter(
        TaskRow.task_id == task_id,
        TaskRow.duration_minutes.isnot(None)
    ).scalar() or 0
    
    avg_duration = None
    if completed_rows > 0 and total_duration > 0:
        avg_duration = total_duration / completed_rows
    
    # Calculate completion percentage
    completion_percentage = 0
    if total_rows > 0:
        completion_percentage = int((completed_rows / total_rows) * 100)
    
    # Estimate remaining time
    estimated_remaining = None
    if avg_duration and pending_rows > 0:
        estimated_remaining = int(avg_duration * pending_rows)
    
    return TaskRowProgressSummary(
        task_id=task_id,
        total_rows=total_rows,
        completed_rows=completed_rows,
        skipped_rows=skipped_rows,
        in_progress_rows=in_progress_rows,
        pending_rows=pending_rows,
        completion_percentage=completion_percentage,
        avg_quality_rating=float(avg_quality) if avg_quality else None,
        rows_with_issues=rows_with_issues,
        total_duration_minutes=int(total_duration),
        avg_duration_per_row=avg_duration,
        estimated_time_remaining_minutes=estimated_remaining
    )


# ============================================================================
# TASK GPS TRACKING
# ============================================================================

@router.post("/tasks/{task_id}/gps/start", response_model=TaskResponse)
def start_gps_tracking(
    task_id: int,
    start_data: TaskGPSTrackStartRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Start GPS tracking for a task"""
    task = check_task_access_for_actor(db, task_id, actor)
    # task_gps_tracks.user_id is NOT NULL FK to users.id — for contractor actors
    # we attribute to task creator (or first active company manager/admin).
    actor_user_id = attribution_user_id(db, task, actor)

    if not task.requires_gps_tracking:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This task does not require GPS tracking"
        )

    if task.gps_tracking_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GPS tracking is already active"
        )

    # Activate GPS tracking
    task.gps_tracking_active = True

    # Add initial point if provided
    if start_data.initial_point:
        point_dict = start_data.initial_point.model_dump(exclude={'device_id'})
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=actor_user_id,
            device_id=start_data.device_id or start_data.initial_point.device_id,
            **point_dict,
        )
        db.add(gps_point)
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"GPS tracking started for task {task_id}")
    return task


@router.post("/tasks/{task_id}/gps/points", response_model=TaskGPSTrackResponse, status_code=status.HTTP_201_CREATED)
def add_gps_point(
    task_id: int,
    point_data: TaskGPSTrackPointRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a GPS tracking point"""
    task = check_task_access(db, task_id, current_user)
    
    if not task.gps_tracking_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GPS tracking is not active for this task"
        )
    
    # Get current segment ID
    last_point = db.query(TaskGPSTrack).filter(
        TaskGPSTrack.task_id == task_id
    ).order_by(desc(TaskGPSTrack.timestamp)).first()
    
    segment_id = last_point.segment_id if last_point else 1
    
    # Create GPS point
    gps_point = TaskGPSTrack(
        task_id=task_id,
        user_id=current_user.id,
        segment_id=segment_id,
        timestamp=point_data.timestamp or datetime.now(),
        **point_data.model_dump(exclude={'timestamp'})
    )
    
    db.add(gps_point)
    db.commit()
    db.refresh(gps_point)
    
    return gps_point


@router.post("/tasks/{task_id}/gps/points/bulk", response_model=List[TaskGPSTrackResponse], status_code=status.HTTP_201_CREATED)
def add_bulk_gps_points(
    task_id: int,
    bulk_data: TaskGPSTrackBulkCreate,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Bulk add GPS tracking points (for offline sync)"""
    task = check_task_access_for_actor(db, task_id, actor)
    actor_user_id = attribution_user_id(db, task, actor)

    # Get current segment ID
    last_point = db.query(TaskGPSTrack).filter(
        TaskGPSTrack.task_id == task_id
    ).order_by(desc(TaskGPSTrack.timestamp)).first()

    base_segment_id = last_point.segment_id if last_point else 1

    # Create GPS points
    gps_points = []
    for point_data in bulk_data.points:
        point_dict = point_data.model_dump(exclude={'segment_id', 'device_id'})
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=actor_user_id,
            segment_id=point_data.segment_id or base_segment_id,
            device_id=point_data.device_id,
            **point_dict,
        )
        db.add(gps_point)
        gps_points.append(gps_point)
    
    db.commit()
    for point in gps_points:
        db.refresh(point)
    
    logger.info(f"{len(gps_points)} GPS points added to task {task_id}")
    return gps_points


@router.post("/tasks/{task_id}/gps/pause", response_model=TaskResponse)
def pause_gps_tracking(
    task_id: int,
    pause_data: TaskGPSTrackPauseRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Pause GPS tracking"""
    task = check_task_access_for_actor(db, task_id, actor)

    if not task.gps_tracking_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GPS tracking is not active"
        )

    # Add final point if provided
    if pause_data.final_point:
        last_point = db.query(TaskGPSTrack).filter(
            TaskGPSTrack.task_id == task_id
        ).order_by(desc(TaskGPSTrack.timestamp)).first()

        segment_id = last_point.segment_id if last_point else 1

        point_dict = pause_data.final_point.model_dump(exclude_none=True)
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=attribution_user_id(db, task, actor),
            segment_id=segment_id,
            timestamp=point_dict.pop('timestamp', None) or datetime.now(),
            **point_dict,
        )
        db.add(gps_point)

    # Deactivate GPS tracking
    task.gps_tracking_active = False
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"GPS tracking paused for task {task_id}")
    return task


@router.post("/tasks/{task_id}/gps/resume", response_model=TaskResponse)
def resume_gps_tracking(
    task_id: int,
    resume_data: TaskGPSTrackResumeRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Resume GPS tracking (increments segment ID)"""
    task = check_task_access_for_actor(db, task_id, actor)

    if task.gps_tracking_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GPS tracking is already active"
        )

    # Get last segment ID and increment
    last_point = db.query(TaskGPSTrack).filter(
        TaskGPSTrack.task_id == task_id
    ).order_by(desc(TaskGPSTrack.timestamp)).first()

    new_segment_id = (last_point.segment_id + 1) if last_point else 1

    # Add initial point for new segment if provided
    if resume_data.initial_point:
        point_dict = resume_data.initial_point.model_dump(exclude_none=True)
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=attribution_user_id(db, task, actor),
            segment_id=new_segment_id,
            timestamp=point_dict.pop('timestamp', None) or datetime.now(),
            **point_dict,
        )
        db.add(gps_point)
    
    # Activate GPS tracking
    task.gps_tracking_active = True
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"GPS tracking resumed for task {task_id} (segment {new_segment_id})")
    return task


@router.post("/tasks/{task_id}/gps/stop", response_model=TaskResponse)
def stop_gps_tracking(
    task_id: int,
    stop_data: TaskGPSTrackStopRequest,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Stop GPS tracking"""
    task = check_task_access_for_actor(db, task_id, actor)

    # Add final point if provided
    if stop_data.final_point:
        last_point = db.query(TaskGPSTrack).filter(
            TaskGPSTrack.task_id == task_id
        ).order_by(desc(TaskGPSTrack.timestamp)).first()

        segment_id = last_point.segment_id if last_point else 1

        point_dict = stop_data.final_point.model_dump(exclude_none=True)
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=attribution_user_id(db, task, actor),
            segment_id=segment_id,
            timestamp=point_dict.pop('timestamp', None) or datetime.now(),
            **point_dict,
        )
        db.add(gps_point)

    # Deactivate GPS tracking
    task.gps_tracking_active = False

    db.commit()
    db.refresh(task)

    # Process GPS breadcrumbs into summary
    try:
        process_gps_track(task_id, db)
    except Exception as e:
        logger.warning(f"GPS summary processing failed for task {task_id}: {e}")

    logger.info(f"GPS tracking stopped for task {task_id}")
    return task


@router.get("/tasks/{task_id}/gps/track", response_model=List[TaskGPSTrackResponse])
def get_gps_track(
    task_id: int,
    segment_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Get GPS track points for a task"""
    task = check_task_access_for_actor(db, task_id, actor)
    
    query = db.query(TaskGPSTrack).filter(
        TaskGPSTrack.task_id == task_id
    )
    
    if segment_id:
        query = query.filter(TaskGPSTrack.segment_id == segment_id)
    
    points = query.order_by(TaskGPSTrack.timestamp).offset(skip).limit(limit).all()
    return points


@router.get("/tasks/{task_id}/gps/stats", response_model=TaskGPSTrackSummaryStats)
def get_gps_track_stats(
    task_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Get summary statistics for GPS track — uses pre-computed summary if available"""
    task = check_task_access_for_actor(db, task_id, actor)

    # Try pre-computed summary first
    from db.models.task_gps_summary import TaskGPSSummary
    summary = db.query(TaskGPSSummary).filter(TaskGPSSummary.task_id == task_id).first()

    if summary:
        # Get time range from breadcrumbs for start/end timestamps
        first_point = db.query(TaskGPSTrack).filter(
            TaskGPSTrack.task_id == task_id
        ).order_by(TaskGPSTrack.timestamp).first()
        last_point = db.query(TaskGPSTrack).filter(
            TaskGPSTrack.task_id == task_id
        ).order_by(desc(TaskGPSTrack.timestamp)).first()

        return TaskGPSTrackSummaryStats(
            task_id=task_id,
            total_points=summary.total_points or 0,
            total_segments=summary.total_segments or 0,
            total_distance_meters=summary.total_distance_meters or Decimal("0"),
            total_distance_km=summary.total_distance_km or Decimal("0"),
            area_covered_hectares=summary.coverage_area_hectares,
            tracking_start_time=first_point.timestamp if first_point else datetime.now(),
            tracking_end_time=last_point.timestamp if last_point else None,
            total_tracking_duration_minutes=summary.total_duration_minutes or 0,
            active_tracking_duration_minutes=summary.active_duration_minutes or 0,
            max_speed_kmh=summary.max_speed_kmh,
            avg_speed_kmh=summary.avg_speed_kmh,
            min_speed_kmh=None,
            avg_accuracy_meters=summary.avg_accuracy_meters,
            points_with_poor_accuracy=summary.poor_accuracy_points or 0,
        )

    # Fallback: compute from raw points (for in-progress tasks)
    points = db.query(TaskGPSTrack).filter(
        TaskGPSTrack.task_id == task_id
    ).order_by(TaskGPSTrack.timestamp).all()

    if not points:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No GPS data available for this task"
        )

    total_points = len(points)
    total_segments = len(set(p.segment_id for p in points))
    tracking_start = points[0].timestamp
    tracking_end = points[-1].timestamp
    total_duration = int((tracking_end - tracking_start).total_seconds() / 60)

    speeds = [float(p.speed) for p in points if p.speed is not None]
    max_speed = Decimal(str(round(max(speeds), 2))) if speeds else None
    avg_speed = Decimal(str(round(sum(speeds) / len(speeds), 2))) if speeds else None
    min_speed = Decimal(str(round(min(speeds), 2))) if speeds else None

    accuracies = [float(p.accuracy) for p in points if p.accuracy is not None]
    avg_accuracy = Decimal(str(round(sum(accuracies) / len(accuracies), 2))) if accuracies else None
    poor_accuracy_count = sum(1 for a in accuracies if a > 20)

    return TaskGPSTrackSummaryStats(
        task_id=task_id,
        total_points=total_points,
        total_segments=total_segments,
        total_distance_meters=Decimal("0"),
        total_distance_km=Decimal("0"),
        tracking_start_time=tracking_start,
        tracking_end_time=tracking_end,
        total_tracking_duration_minutes=total_duration,
        active_tracking_duration_minutes=total_duration,
        max_speed_kmh=max_speed,
        avg_speed_kmh=avg_speed,
        min_speed_kmh=min_speed,
        avg_accuracy_meters=avg_accuracy,
        points_with_poor_accuracy=poor_accuracy_count,
    )


@router.get("/tasks/{task_id}/gps/summary")
def get_gps_summary(
    task_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Get processed GPS summary for a completed task"""
    task = check_task_access_for_actor(db, task_id, actor)
    from db.models.task_gps_summary import TaskGPSSummary
    summary = db.query(TaskGPSSummary).filter(TaskGPSSummary.task_id == task_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="No GPS summary — task may still be in progress")
    return {
        "task_id": summary.task_id,
        "total_distance_meters": float(summary.total_distance_meters or 0),
        "total_distance_km": float(summary.total_distance_km or 0),
        "active_duration_minutes": summary.active_duration_minutes,
        "total_duration_minutes": summary.total_duration_minutes,
        "total_points": summary.total_points,
        "total_segments": summary.total_segments,
        "avg_speed_kmh": float(summary.avg_speed_kmh) if summary.avg_speed_kmh else None,
        "max_speed_kmh": float(summary.max_speed_kmh) if summary.max_speed_kmh else None,
        "time_stationary_minutes": summary.time_stationary_minutes,
        "time_moving_minutes": summary.time_moving_minutes,
        "coverage_area_hectares": float(summary.coverage_area_hectares) if summary.coverage_area_hectares else None,
        "block_area_hectares": float(summary.block_area_hectares) if summary.block_area_hectares else None,
        "coverage_percentage": float(summary.coverage_percentage) if summary.coverage_percentage else None,
        "avg_accuracy_meters": float(summary.avg_accuracy_meters) if summary.avg_accuracy_meters else None,
        "poor_accuracy_points": summary.poor_accuracy_points,
    }


@router.get("/tasks/gps-tracks/geojson")
def get_recent_gps_tracks_geojson(
    days: int = Query(30, ge=1, le=365, description="Look-back window in days"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All GPS tracks for the user's company over the last N days, as a
    GeoJSON FeatureCollection.

    Used by the Maps V2 GPS Tracks layer to draw every recent track at once
    without N round-trips. Property-scoped: respects UserPropertyScope when set.
    """
    from db.models.task_gps_summary import TaskGPSSummary
    from geoalchemy2.shape import to_shape
    from shapely.geometry import mapping as shapely_mapping

    cutoff = datetime.utcnow() - timedelta(days=days)

    query = (
        db.query(TaskGPSSummary, Task)
        .join(Task, Task.id == TaskGPSSummary.task_id)
        .filter(TaskGPSSummary.company_id == current_user.company_id)
        .filter(TaskGPSSummary.track_geometry.isnot(None))
        .filter(Task.created_at >= cutoff)
    )

    # Property scoping. auxein_admin and unscoped company users get all blocks;
    # scoped users see only their visible properties (plus tasks with no block).
    if current_user.user_type not in ("auxein_admin", "contractor"):
        visible_property_ids = get_visible_property_ids(db, current_user)
        if visible_property_ids is not None and current_user.user_type != "company_admin":
            # company_admin gets everything; manager/user with explicit scopes
            # are gated to those properties.
            query = query.outerjoin(VineyardBlock, VineyardBlock.id == Task.block_id)
            query = query.filter(
                or_(
                    Task.block_id.is_(None),
                    VineyardBlock.property_id.in_(visible_property_ids),
                )
            )

    features = []
    for summary, task in query.all():
        try:
            track_shape = to_shape(summary.track_geometry)
            status_val = task.status.value if hasattr(task.status, "value") else task.status
            features.append({
                "type": "Feature",
                "geometry": shapely_mapping(track_shape),
                "properties": {
                    "task_id": task.id,
                    "task_number": task.task_number,
                    "title": task.title,
                    "status": status_val,
                    "block_id": task.block_id,
                    "distance_km": float(summary.total_distance_km or 0),
                    "duration_minutes": summary.active_duration_minutes,
                    "total_points": summary.total_points,
                    "created_at": task.created_at.isoformat() if task.created_at else None,
                },
            })
        except Exception as e:
            logger.error(f"Error serializing GPS track for task {task.id}: {e}")
            continue

    return {"type": "FeatureCollection", "features": features}


@router.get("/tasks/{task_id}/gps/track/geojson")
def get_gps_track_geojson(
    task_id: int,
    db: Session = Depends(get_db),
    actor=Depends(get_current_user_or_contractor),
):
    """Get GPS track as GeoJSON Feature.

    Lazy-build path: if no summary exists but raw GPS points do, build it
    inline before returning. Covers the case where a stop call failed mid-flight
    (network error after points were uploaded) — the historical viewer still
    shows the track instead of 404'ing forever. Idempotent + cheap once built.
    """
    task = check_task_access_for_actor(db, task_id, actor)
    from db.models.task_gps_summary import TaskGPSSummary
    from geoalchemy2.shape import to_shape
    from shapely.geometry import mapping as shapely_mapping

    summary = db.query(TaskGPSSummary).filter(TaskGPSSummary.task_id == task_id).first()

    # Lazy build — summary missing but raw points may exist (stop failed). Try
    # to recover transparently before giving up with a 404.
    if not summary or not summary.track_geometry:
        has_points = db.query(TaskGPSTrack.id).filter(TaskGPSTrack.task_id == task_id).first()
        if has_points:
            try:
                summary = process_gps_track(task_id, db)
            except Exception as e:
                logger.warning(f"Lazy GPS summary build failed for task {task_id}: {e}")
                summary = None

    if not summary or not summary.track_geometry:
        raise HTTPException(status_code=404, detail="No GPS track geometry available")

    track_shape = to_shape(summary.track_geometry)
    return {
        "type": "Feature",
        "geometry": shapely_mapping(track_shape),
        "properties": {
            "task_id": task_id,
            "task_number": task.task_number,
            "distance_km": float(summary.total_distance_km or 0),
            "duration_minutes": summary.active_duration_minutes,
            "total_points": summary.total_points,
        }
    }


@router.get("/tasks/{task_id}/gps/coverage/geojson")
def get_gps_coverage_geojson(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get GPS coverage polygon as GeoJSON Feature"""
    task = check_task_access(db, task_id, current_user)
    from db.models.task_gps_summary import TaskGPSSummary
    from geoalchemy2.shape import to_shape
    from shapely.geometry import mapping as shapely_mapping

    summary = db.query(TaskGPSSummary).filter(TaskGPSSummary.task_id == task_id).first()
    if not summary or not summary.coverage_geometry:
        raise HTTPException(status_code=404, detail="No coverage geometry available")

    coverage_shape = to_shape(summary.coverage_geometry)
    return {
        "type": "Feature",
        "geometry": shapely_mapping(coverage_shape),
        "properties": {
            "task_id": task_id,
            "coverage_hectares": float(summary.coverage_area_hectares or 0),
            "block_hectares": float(summary.block_area_hectares or 0),
            "coverage_percentage": float(summary.coverage_percentage or 0),
        }
    }


@router.post("/tasks/{task_id}/gps/reprocess")
def reprocess_gps_track(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Re-process GPS breadcrumbs into summary (admin/debug)"""
    task = check_task_access(db, task_id, current_user)
    summary = process_gps_track(task_id, db)
    if not summary:
        raise HTTPException(status_code=404, detail="No GPS points to process")
    return {"message": f"Reprocessed {summary.total_points} points", "distance_km": float(summary.total_distance_km or 0)}


def _serialize_spray_coverage(cov):
    """Serialize a SprayCoverage row to stats + GeoJSON grid for the client."""
    def f(v):
        return float(v) if v is not None else None
    return {
        "task_id": cov.task_id,
        "block_id": cov.block_id,
        "asset_id": cov.asset_id,
        "source_task_id": cov.source_task_id,
        "computed_at": cov.computed_at.isoformat() if cov.computed_at else None,
        "inputs": {
            "swath_m": f(cov.swath_m),
            "flow_l_s": f(cov.flow_l_s),
            "target_lha": f(cov.target_lha),
            "tolerance_min_lha": f(cov.tolerance_min_lha),
            "tolerance_max_lha": f(cov.tolerance_max_lha),
            "cell_size_m": f(cov.cell_size_m),
            "speed_band_min_kmh": f(cov.speed_band_min_kmh),
            "speed_band_max_kmh": f(cov.speed_band_max_kmh),
            "max_gap_m": f(cov.max_gap_m),
        },
        "stats": {
            "sprayed_area_hectares": f(cov.sprayed_area_hectares),
            "block_area_hectares": f(cov.block_area_hectares),
            "gap_area_hectares": f(cov.gap_area_hectares),
            "overlap_area_hectares": f(cov.overlap_area_hectares),
            "computed_volume_l": f(cov.computed_volume_l),
            "min_lha": f(cov.min_lha),
            "avg_lha": f(cov.avg_lha),
            "max_lha": f(cov.max_lha),
            "pct_within_tolerance": f(cov.pct_within_tolerance),
        },
        "grid": cov.grid_geojson or {"type": "FeatureCollection", "features": []},
    }


@router.get("/tasks/{task_id}/spray-coverage")
def get_spray_coverage(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Spray application-rate coverage for a task (stats + GeoJSON grid).

    Lazy-build: if no row exists yet but the task is spray-capable with a GPS
    track, compute it inline before returning."""
    task = check_task_access(db, task_id, current_user)
    from db.models.spray_coverage import SprayCoverage

    cov = (
        db.query(SprayCoverage)
        .filter(SprayCoverage.task_id == task_id, SprayCoverage.block_id == task.block_id)
        .first()
    )
    if not cov:
        try:
            cov = compute_spray_coverage(task_id, db)
        except Exception as e:
            logger.warning(f"Spray coverage lazy build failed for task {task_id}: {e}")
            cov = None
    if not cov:
        raise HTTPException(status_code=404, detail="No spray coverage available for this task")
    return _serialize_spray_coverage(cov)


@router.post("/tasks/{task_id}/spray-coverage/recompute")
def recompute_spray_coverage(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Force-recompute spray coverage for a task's block (admin/debug, or after
    a calibration correction)."""
    task = check_task_access(db, task_id, current_user)
    cov = compute_spray_coverage(task_id, db)
    if not cov:
        raise HTTPException(
            status_code=404,
            detail="Task is not spray-capable (needs an asset with swath width + flow calibration) or has no usable GPS track within the block",
        )
    return _serialize_spray_coverage(cov)


@router.get("/tasks/{task_id}/spray-coverage/readiness")
def spray_coverage_readiness(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Will completing this task produce a spray-coverage raster, and if not,
    what's missing? Non-mutating — the web TaskDetail uses this to show a chip
    (and a completion-time warning) so a misconfigured spray task doesn't fail
    silently in a tester's hands. `asset` is null when no swath-width asset is
    attached; the UI shows nothing in that case."""
    task = check_task_access(db, task_id, current_user)
    return assess_spray_readiness(task, db)


class SprayConfirmRequest(BaseModel):
    block_ids: List[int]


@router.get("/tasks/{task_id}/spray-coverage/candidates")
def spray_coverage_candidates(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Blocks (other than the task's assigned block) that this spray track
    appears to have covered — for the detect-and-confirm step. Empty for
    clone / non-spray tasks."""
    check_task_access(db, task_id, current_user)
    cands = detect_spray_blocks(task_id, db)
    if current_user.user_type not in ("auxein_admin", "contractor"):
        visible = get_visible_property_ids(db, current_user)
        if visible is not None and current_user.user_type != "company_admin":
            cands = [c for c in cands if c["property_id"] in visible]
    return cands


@router.post("/tasks/{task_id}/spray-coverage/confirm")
def confirm_spray_coverage_blocks(
    task_id: int,
    body: SprayConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm the track sprayed the given blocks: clone the origin task as a
    completed task per block (coverage computed from the origin's GPS, clipped to
    that block), apportion consumables by sprayed area, link via source_task_id.
    Labour hours + stock movements stay on the origin (clones don't duplicate)."""
    from db.models.spray_coverage import SprayCoverage

    origin = check_task_access(db, task_id, current_user)
    requested = list(dict.fromkeys(body.block_ids))  # dedupe, preserve order
    if not requested:
        return {"created": [], "skipped": []}

    visible = None
    if current_user.user_type not in ("auxein_admin", "contractor", "company_admin"):
        visible = get_visible_property_ids(db, current_user)

    existing_clone_blocks = {
        bid for (bid,) in db.query(Task.block_id).filter(Task.source_task_id == origin.id).all()
    }

    created = []
    skipped = []
    for block_id in requested:
        if block_id == origin.block_id:
            skipped.append({"block_id": block_id, "reason": "origin block"})
            continue
        if block_id in existing_clone_blocks:
            skipped.append({"block_id": block_id, "reason": "already created"})
            continue
        block = (
            db.query(VineyardBlock)
            .filter(VineyardBlock.id == block_id, VineyardBlock.company_id == origin.company_id)
            .first()
        )
        if not block:
            skipped.append({"block_id": block_id, "reason": "not found"})
            continue
        if visible is not None and block.property_id not in visible:
            skipped.append({"block_id": block_id, "reason": "not visible"})
            continue

        clone = Task(
            company_id=origin.company_id,
            template_id=origin.template_id,
            task_number=generate_task_number(db, origin.company_id),
            title=f"{origin.title} — {block.block_name}" if block.block_name else origin.title,
            task_category=origin.task_category,
            task_subcategory=origin.task_subcategory,
            description=origin.description,
            block_id=block.id,
            priority=origin.priority,
            status=TaskStatus.completed,
            actual_start_time=origin.actual_start_time,
            actual_end_time=origin.actual_end_time,
            progress_percentage=100,
            requires_gps_tracking=False,
            completed_at=origin.completed_at,
            completed_by=origin.completed_by,
            completion_notes=f"Auto-created from {origin.task_number} (multi-block spray coverage).",
            weather_conditions=origin.weather_conditions,
            created_by=current_user.id,
            source_task_id=origin.id,
        )
        db.add(clone)
        db.flush()  # need clone.id

        # Copy equipment assets (with calibration) so coverage can resolve swath
        # + flow on the clone. Consumables are apportioned once areas are known.
        for ta in origin.task_assets:
            if ta.role == "consumable":
                continue
            db.add(TaskAsset(
                task_id=clone.id,
                asset_id=ta.asset_id,
                role=ta.role,
                is_required=ta.is_required,
                calibration_id=ta.calibration_id,
                planned_rate=ta.planned_rate,
            ))
        db.flush()

        cov = compute_spray_coverage(
            clone.id, db, block_id=block.id, persist=False,
            points_task_id=origin.id, source_task_id=origin.id,
        )
        if not cov:
            db.query(TaskAsset).filter(TaskAsset.task_id == clone.id).delete()
            db.delete(clone)
            db.flush()
            skipped.append({"block_id": block_id, "reason": "no coverage in block"})
            continue
        clone.area_covered_hectares = cov.sprayed_area_hectares
        clone.area_total_hectares = cov.block_area_hectares
        created.append((clone, block, cov))

    if not created:
        db.commit()
        return {"created": [], "skipped": skipped}

    # Apportion consumables by sprayed area across origin + clones (no stock
    # movements — product was deducted once on the origin).
    origin_cov = (
        db.query(SprayCoverage)
        .filter(SprayCoverage.task_id == origin.id, SprayCoverage.block_id == origin.block_id)
        .first()
    )
    areas = {}
    if origin_cov and origin_cov.sprayed_area_hectares:
        areas["origin"] = float(origin_cov.sprayed_area_hectares)
    for clone, block, cov in created:
        areas[clone.id] = float(cov.sprayed_area_hectares or 0)
    total_area = sum(areas.values()) or 1.0

    origin_consumables = [
        ta for ta in origin.task_assets if ta.role == "consumable" and ta.actual_quantity
    ]
    for clone, block, cov in created:
        share = areas.get(clone.id, 0) / total_area
        for ta in origin_consumables:
            db.add(TaskAsset(
                task_id=clone.id,
                asset_id=ta.asset_id,
                role="consumable",
                is_required=ta.is_required,
                actual_quantity=(ta.actual_quantity * Decimal(str(share))) if ta.actual_quantity is not None else None,
                batch_number=ta.batch_number,
                notes=f"Apportioned from {origin.task_number} by sprayed area ({round(share * 100, 1)}%). Stock deducted on origin.",
            ))

    db.commit()

    out = []
    for clone, block, cov in created:
        out.append({
            "task_id": clone.id,
            "task_number": clone.task_number,
            "block_id": block.id,
            "block_name": block.block_name,
            "avg_lha": float(cov.avg_lha) if cov.avg_lha is not None else None,
            "sprayed_area_hectares": float(cov.sprayed_area_hectares) if cov.sprayed_area_hectares is not None else None,
        })
    return {"created": out, "skipped": skipped}


@router.get("/spray-coverages")
def list_spray_coverages(
    property_id: Optional[int] = None,
    block_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List spray-coverage events for the company (Spray Program). Summary rows
    only — the grid GeoJSON is fetched per-event via GET /tasks/{id}/spray-coverage."""
    from db.models.spray_coverage import SprayCoverage

    q = (
        db.query(SprayCoverage, Task, VineyardBlock, Asset)
        .join(Task, Task.id == SprayCoverage.task_id)
        .join(VineyardBlock, VineyardBlock.id == SprayCoverage.block_id)
        .outerjoin(Asset, Asset.id == SprayCoverage.asset_id)
        .filter(SprayCoverage.company_id == current_user.company_id)
    )
    if block_id:
        q = q.filter(SprayCoverage.block_id == block_id)
    if property_id:
        q = q.filter(VineyardBlock.property_id == property_id)

    # Property scoping — same gate as the task list (company_admin sees all).
    if current_user.user_type not in ("auxein_admin", "contractor"):
        visible_property_ids = get_visible_property_ids(db, current_user)
        if visible_property_ids is not None and current_user.user_type != "company_admin":
            q = q.filter(VineyardBlock.property_id.in_(visible_property_ids))

    q = q.order_by(SprayCoverage.computed_at.desc().nullslast())

    def f(v):
        return float(v) if v is not None else None

    rows = []
    for cov, task, block, asset in q.all():
        date_val = task.completed_at or task.actual_end_time
        rows.append({
            "task_id": cov.task_id,
            "task_number": task.task_number,
            "title": task.title,
            "block_id": cov.block_id,
            "block_name": block.block_name,
            "property_id": block.property_id,
            "asset_id": cov.asset_id,
            "asset_name": asset.name if asset else None,
            "date": date_val.isoformat() if date_val else None,
            "avg_lha": f(cov.avg_lha),
            "min_lha": f(cov.min_lha),
            "max_lha": f(cov.max_lha),
            "target_lha": f(cov.target_lha),
            "sprayed_area_hectares": f(cov.sprayed_area_hectares),
            "block_area_hectares": f(cov.block_area_hectares),
            "gap_area_hectares": f(cov.gap_area_hectares),
            "overlap_area_hectares": f(cov.overlap_area_hectares),
            "computed_volume_l": f(cov.computed_volume_l),
            "pct_within_tolerance": f(cov.pct_within_tolerance),
            "computed_at": cov.computed_at.isoformat() if cov.computed_at else None,
        })
    return rows


# ============================================================================
# TASK VIEWS & REPORTS
# ============================================================================

@router.get("/tasks/my-tasks", response_model=List[TaskWithRelations])
def get_my_tasks(
    status: Optional[str] = None,
    include_completed: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get tasks assigned to current user"""
    query = db.query(Task).options(
        joinedload(Task.block),
        joinedload(Task.creator),
        joinedload(Task.completer),
        joinedload(Task.assignments).joinedload(TaskAssignment.user)
    ).join(TaskAssignment).filter(
        TaskAssignment.user_id == current_user.id,
        Task.company_id == current_user.company_id
    )
    scope_filter = build_task_scope_filter(db, current_user)
    if scope_filter is not None:
        query = query.filter(scope_filter)
    
    # Filter by status (supports comma-separated values)
    if status:
        statuses = [s.strip() for s in status.split(',') if s.strip()]
        if len(statuses) == 1:
            query = query.filter(Task.status == statuses[0])
        else:
            query = query.filter(Task.status.in_(statuses))

    if not include_completed:
        query = query.filter(Task.status != TaskStatus.completed)
    
    tasks = query.order_by(desc(Task.priority), Task.scheduled_start_date).all()
    
    # Add computed fields
    task_ids = [t.id for t in tasks]
    contractor_rows = []
    if task_ids:
        contractor_rows = (
            db.query(ContractorAssignment, Contractor)
            .join(Contractor, ContractorAssignment.contractor_id == Contractor.id)
            .filter(ContractorAssignment.task_id.in_(task_ids))
            .all()
        )
    by_task = {}
    for ca, c in contractor_rows:
        by_task.setdefault(ca.task_id, []).append(c)

    for task in tasks:
        task.assignment_count = len(task.assignments)
        task.assignee_names = [_display_name(a.user) for a in task.assignments if a.user]
        task.assigned_user_ids = [a.user_id for a in task.assignments if a.user_id]
        t_contractors = by_task.get(task.id, [])
        task.contractor_names = [c.business_name for c in t_contractors]
        task.assigned_contractor_ids = [c.id for c in t_contractors]

    return tasks


@router.get("/tasks/calendar", response_model=List[TaskCalendarEvent])
def get_tasks_calendar(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get tasks formatted for calendar view"""
    query = db.query(Task).filter(
        Task.company_id == current_user.company_id,
        Task.scheduled_start_date >= start_date,
        Task.scheduled_start_date <= end_date
    )
    scope_filter = build_task_scope_filter(db, current_user)
    if scope_filter is not None:
        query = query.filter(scope_filter)
    tasks = query.all()
    
    events = []
    for task in tasks:
        # Determine start datetime
        if task.scheduled_start_time:
            start = task.scheduled_start_time
            all_day = False
        elif task.scheduled_start_date:
            start = datetime.combine(task.scheduled_start_date, datetime.min.time())
            all_day = True
        else:
            continue
        
        # Determine end datetime
        end = None
        if task.scheduled_end_date:
            end = datetime.combine(task.scheduled_end_date, datetime.max.time())
        
        # Get assignees
        assignees = [a.user.full_name for a in task.assignments if a.user]
        
        events.append(TaskCalendarEvent(
            id=task.id,
            task_number=task.task_number,
            title=task.title,
            status=task.status,
            priority=task.priority,
            start=start,
            end=end,
            all_day=all_day,
            color=None,  # TODO: Get from template
            location=task.location_display,
            assignees=assignees,
            progress_percentage=task.progress_percentage
        ))
    
    return events


@router.get("/tasks/stats", response_model=TaskStatsResponse)
def get_task_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get task statistics for dashboard"""
    scope_filter = build_task_scope_filter(db, current_user)

    def _base_filters(*extra):
        filters = [Task.company_id == current_user.company_id, *extra]
        if scope_filter is not None:
            filters.append(scope_filter)
        return and_(*filters)

    # Total tasks
    total_tasks = db.query(func.count(Task.id)).filter(_base_filters()).scalar()

    # Tasks by status
    status_counts = db.query(
        Task.status,
        func.count(Task.id)
    ).filter(_base_filters()).group_by(Task.status).all()

    by_status = {status: count for status, count in status_counts}

    # Tasks by category
    category_counts = db.query(
        Task.task_category,
        func.count(Task.id)
    ).filter(_base_filters()).group_by(Task.task_category).all()

    by_category = {category: count for category, count in category_counts}

    # Tasks by priority
    priority_counts = db.query(
        Task.priority,
        func.count(Task.id)
    ).filter(_base_filters()).group_by(Task.priority).all()

    by_priority = {priority: count for priority, count in priority_counts}

    # Time statistics
    total_hours = db.query(func.sum(Task.actual_hours)).filter(
        _base_filters()
    ).scalar() or Decimal("0")

    # Completed tasks
    completed_tasks = db.query(Task).filter(
        _base_filters(Task.status == TaskStatus.completed)
    ).all()
    
    avg_completion_time = None
    if completed_tasks:
        completion_times = []
        for task in completed_tasks:
            if task.actual_start_time and task.actual_end_time:
                duration = (task.actual_end_time - task.actual_start_time).total_seconds() / 3600
                completion_times.append(duration)
        
        if completion_times:
            avg_completion_time = Decimal(str(sum(completion_times) / len(completion_times)))
    
    # On-time vs overdue
    today = date.today()
    tasks_overdue = db.query(func.count(Task.id)).filter(
        _base_filters(
            Task.status.in_([TaskStatus.scheduled, TaskStatus.in_progress]),
            Task.scheduled_start_date < today,
        )
    ).scalar() or 0

    tasks_on_time = db.query(func.count(Task.id)).filter(
        _base_filters(
            Task.status.in_([TaskStatus.scheduled, TaskStatus.in_progress]),
            Task.scheduled_start_date >= today,
        )
    ).scalar() or 0

    # Completed this week
    week_start = today - timedelta(days=today.weekday())
    tasks_completed_this_week = db.query(func.count(Task.id)).filter(
        _base_filters(
            Task.status == TaskStatus.completed,
            Task.completed_at >= week_start,
        )
    ).scalar() or 0

    # Completed this month
    month_start = today.replace(day=1)
    tasks_completed_this_month = db.query(func.count(Task.id)).filter(
        _base_filters(
            Task.status == TaskStatus.completed,
            Task.completed_at >= month_start,
        )
    ).scalar() or 0
    
    return TaskStatsResponse(
        total_tasks=total_tasks,
        by_status=by_status,
        by_category=by_category,
        by_priority=by_priority,
        total_hours_logged=total_hours,
        avg_completion_time_hours=avg_completion_time,
        tasks_on_time=tasks_on_time,
        tasks_overdue=tasks_overdue,
        tasks_completed_this_week=tasks_completed_this_week,
        tasks_completed_this_month=tasks_completed_this_month
    )

class TaskAssetUpsert(BaseModel):
    asset_id: int
    asset_type: Literal["equipment", "consumable"]  # sent by wizard
    is_required: bool = True
    quantity: Optional[Decimal] = Field(None, ge=0)     # for consumables (planned_quantity)
    planned_hours: Optional[Decimal] = Field(None, ge=0)  # for equipment (optional UI)
    planned_rate: Optional[Decimal] = Field(None, ge=0)
    role: Optional[Literal["primary", "secondary", "consumable"]] = None
    unit: Optional[str] = None
    notes: Optional[str] = None

    @validator("role", always=True)
    def default_role(cls, v, values):
        # sensible defaults per asset_type
        if v is not None:
            return v
        return "consumable" if values.get("asset_type") == "consumable" else "primary"

@router.post("/tasks/{task_id}/assets", status_code=status.HTTP_201_CREATED)
def add_or_update_task_asset(
    task_id: int,
    payload: TaskAssetUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create or update a TaskAsset entry based on (task_id, asset_id).
    - Equipment → role primary/secondary, planned_hours/rate
    - Consumable → role consumable, planned_quantity = quantity
    """
    # AuthN/AuthZ and tenant scoping
    task = check_task_access(db, task_id, current_user)  # must raise 404/403 appropriately

    # Validate asset
    asset = db.query(Asset).filter(Asset.id == payload.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Optional: Company/tenant guard
    if getattr(task, "company_id", None) and getattr(asset, "company_id", None):
        if task.company_id != asset.company_id:
            raise HTTPException(status_code=403, detail="Asset belongs to a different company")

    # Optional: Validate unit for consumables
    if payload.asset_type == "consumable" and payload.unit:
        expected = (asset.unit_of_measure or "").strip().lower()
        given = payload.unit.strip().lower()
        if expected and given and expected != given:
            # Don't block; warn in response
            unit_warning = f"Provided unit '{payload.unit}' does not match asset unit_of_measure '{asset.unit_of_measure}'."
        else:
            unit_warning = None
    else:
        unit_warning = None

    # Upsert by (task_id, asset_id)
    ta = (
        db.query(TaskAsset)
        .filter(TaskAsset.task_id == task_id, TaskAsset.asset_id == payload.asset_id)
        .first()
    )

    if ta is None:
        ta = TaskAsset(task_id=task_id, asset_id=payload.asset_id)

    # Map common fields
    ta.role = payload.role
    ta.is_required = payload.is_required
    ta.planned_rate = payload.planned_rate
    ta.notes = payload.notes

    # Equipment vs Consumable specifics
    if payload.asset_type == "consumable":
        ta.planned_quantity = payload.quantity  # wizard quantity → planned_quantity
        # clear equipment-only fields
        ta.planned_hours = None
        ta.requires_calibration = False
    else:
        ta.planned_hours = payload.planned_hours
        # good default for equipment
        ta.requires_calibration = bool(asset.requires_calibration)
        # clear consumable-only fields
        ta.planned_quantity = None

    db.add(ta)
    db.commit()
    db.refresh(ta)

    out = {
        "id": ta.id,
        "task_id": ta.task_id,
        "asset_id": ta.asset_id,
        "role": ta.role,
        "is_required": ta.is_required,
        "planned_quantity": str(ta.planned_quantity) if ta.planned_quantity is not None else None,
        "planned_hours": str(ta.planned_hours) if ta.planned_hours is not None else None,
        "planned_rate": str(ta.planned_rate) if ta.planned_rate is not None else None,
        "requires_calibration": ta.requires_calibration,
        "notes": ta.notes,
        "unit_warning": unit_warning,
    }
    return out