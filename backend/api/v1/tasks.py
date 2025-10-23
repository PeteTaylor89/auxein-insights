# app/api/v1/tasks.py - Complete Task Management API
import logging
from typing import List, Optional
from datetime import datetime, date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc, asc

from db.session import get_db
from db.models.task_template import TaskTemplate, TaskCategory
from db.models.task import Task, TaskStatus
from db.models.task_assignment import TaskAssignment
from db.models.task_row import TaskRow
from db.models.task_gps_track import TaskGPSTrack
from db.models.user import User
from db.models.company import Company
from db.models.block import VineyardBlock
from db.models.spatial_area import SpatialArea
from db.models.vineyard_row import VineyardRow

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

from api.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_task_number(db: Session, company_id: int) -> str:
    """Generate unique task number: TASK-2025-001"""
    year = datetime.now().year
    
    # Get count of tasks for this company this year
    count = db.query(func.count(Task.id)).filter(
        Task.company_id == company_id,
        func.extract('year', Task.created_at) == year
    ).scalar() or 0
    
    return f"TASK-{year}-{count + 1:03d}"


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
    
    return task


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
    # Admin and manager can modify all tasks
    if user.role in ["admin", "manager"]:
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
    if current_user.role not in ["admin", "manager"]:
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
    if current_user.role not in ["admin", "manager"]:
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
    if current_user.role != "admin":
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
    
    # Create task
    task = Task(
        company_id=current_user.company_id,
        task_number=task_number,
        created_by=current_user.id,
        status=TaskStatus.draft,
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
    task_dict = task_data.model_dump(exclude_unset=True, exclude={'assigned_user_ids'})
    for key, value in task_dict.items():
        if value is not None:
            template_defaults[key] = value
    
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


@router.get("/tasks", response_model=List[TaskResponse])
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
    """List tasks with comprehensive filtering"""
    query = db.query(Task).filter(
        Task.company_id == current_user.company_id
    )
    
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
    return tasks


@router.get("/tasks/{task_id}", response_model=TaskWithRelations)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific task with all relations"""
    task = db.query(Task).options(
        joinedload(Task.block),
        joinedload(Task.spatial_area),
        joinedload(Task.creator),
        joinedload(Task.completer),
        joinedload(Task.assignments).joinedload(TaskAssignment.user)
    ).filter(
        Task.id == task_id,
        Task.company_id == current_user.company_id
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Add computed fields
    task.assignment_count = len(task.assignments)
    task.assignee_names = [a.user.full_name for a in task.assignments if a.user]
    
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
    
    # Don't allow updates to completed/cancelled tasks
    if task.status in [TaskStatus.completed, TaskStatus.cancelled]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update {task.status} tasks"
        )
    
    # Update fields
    update_data = task_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    
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
    
    # Only admin, manager, or creator can delete
    if current_user.role not in ["admin", "manager"] and task.created_by != current_user.id:
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

@router.post("/tasks/{task_id}/start", response_model=TaskResponse)
def start_task(
    task_id: int,
    start_request: TaskStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start a task"""
    task = check_task_access(db, task_id, current_user)
    
    # Check if task can be started
    if not task.can_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start task with status: {task.status}"
        )
    
    # Update task
    task.status = TaskStatus.in_progress
    task.actual_start_time = datetime.now()
    
    # Start GPS tracking if requested
    if start_request.start_gps_tracking and task.requires_gps_tracking:
        task.gps_tracking_active = True
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"Task {task_id} started by user {current_user.id}")
    return task


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
    current_user: User = Depends(get_current_user)
):
    """Complete a task"""
    task = check_task_access(db, task_id, current_user)
    
    if task.status in [TaskStatus.completed, TaskStatus.cancelled]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task is already {task.status}"
        )
    
    # Update task
    task.status = TaskStatus.completed
    task.actual_end_time = datetime.now()
    task.completed_at = datetime.now()
    task.completed_by = current_user.id
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
    
    # Update all assignments to completed
    for assignment in task.assignments:
        if assignment.status in ["assigned", "accepted"]:
            assignment.status = "completed"
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"Task {task_id} completed by user {current_user.id}")
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
    current_user: User = Depends(get_current_user)
):
    """List all rows for a task"""
    task = check_task_access(db, task_id, current_user)
    
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
    current_user: User = Depends(get_current_user)
):
    """Mark a row as completed"""
    task = check_task_access(db, task_id, current_user)
    
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
    
    # Update row
    task_row.status = "completed"
    task_row.completed_at = datetime.now()
    task_row.completed_by = current_user.id
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
    current_user: User = Depends(get_current_user)
):
    """Mark a row as skipped"""
    task = check_task_access(db, task_id, current_user)
    
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
    current_user: User = Depends(get_current_user)
):
    """Get progress summary for task rows"""
    task = check_task_access(db, task_id, current_user)
    
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
    current_user: User = Depends(get_current_user)
):
    """Start GPS tracking for a task"""
    task = check_task_access(db, task_id, current_user)
    
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
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=current_user.id,
            device_id=start_data.device_id,
            **start_data.initial_point.model_dump()
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
    current_user: User = Depends(get_current_user)
):
    """Bulk add GPS tracking points (for offline sync)"""
    task = check_task_access(db, task_id, current_user)
    
    # Get current segment ID
    last_point = db.query(TaskGPSTrack).filter(
        TaskGPSTrack.task_id == task_id
    ).order_by(desc(TaskGPSTrack.timestamp)).first()
    
    base_segment_id = last_point.segment_id if last_point else 1
    
    # Create GPS points
    gps_points = []
    for point_data in bulk_data.points:
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=current_user.id,
            segment_id=point_data.segment_id or base_segment_id,
            **point_data.model_dump()
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
    current_user: User = Depends(get_current_user)
):
    """Pause GPS tracking"""
    task = check_task_access(db, task_id, current_user)
    
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
        
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=current_user.id,
            segment_id=segment_id,
            timestamp=datetime.now(),
            **pause_data.final_point.model_dump()
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
    current_user: User = Depends(get_current_user)
):
    """Resume GPS tracking (increments segment ID)"""
    task = check_task_access(db, task_id, current_user)
    
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
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=current_user.id,
            segment_id=new_segment_id,
            timestamp=datetime.now(),
            **resume_data.initial_point.model_dump()
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
    current_user: User = Depends(get_current_user)
):
    """Stop GPS tracking"""
    task = check_task_access(db, task_id, current_user)
    
    # Add final point if provided
    if stop_data.final_point:
        last_point = db.query(TaskGPSTrack).filter(
            TaskGPSTrack.task_id == task_id
        ).order_by(desc(TaskGPSTrack.timestamp)).first()
        
        segment_id = last_point.segment_id if last_point else 1
        
        gps_point = TaskGPSTrack(
            task_id=task_id,
            user_id=current_user.id,
            segment_id=segment_id,
            timestamp=datetime.now(),
            **stop_data.final_point.model_dump()
        )
        db.add(gps_point)
    
    # Deactivate GPS tracking
    task.gps_tracking_active = False
    
    db.commit()
    db.refresh(task)
    
    logger.info(f"GPS tracking stopped for task {task_id}")
    return task


@router.get("/tasks/{task_id}/gps/track", response_model=List[TaskGPSTrackResponse])
def get_gps_track(
    task_id: int,
    segment_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get GPS track points for a task"""
    task = check_task_access(db, task_id, current_user)
    
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
    current_user: User = Depends(get_current_user)
):
    """Get summary statistics for GPS track"""
    task = check_task_access(db, task_id, current_user)
    
    # Get all points
    points = db.query(TaskGPSTrack).filter(
        TaskGPSTrack.task_id == task_id
    ).order_by(TaskGPSTrack.timestamp).all()
    
    if not points:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No GPS data available for this task"
        )
    
    # Calculate statistics
    total_points = len(points)
    total_segments = len(set(p.segment_id for p in points))
    
    # Time range
    tracking_start = points[0].timestamp
    tracking_end = points[-1].timestamp
    total_duration = int((tracking_end - tracking_start).total_seconds() / 60)
    
    # Speed statistics
    speeds = [float(p.speed) for p in points if p.speed is not None]
    max_speed = Decimal(str(max(speeds))) if speeds else None
    avg_speed = Decimal(str(sum(speeds) / len(speeds))) if speeds else None
    min_speed = Decimal(str(min(speeds))) if speeds else None
    
    # Accuracy statistics
    accuracies = [float(p.accuracy) for p in points if p.accuracy is not None]
    avg_accuracy = Decimal(str(sum(accuracies) / len(accuracies))) if accuracies else None
    poor_accuracy_count = sum(1 for a in accuracies if a > 20)
    
    # Calculate distance (simplified - should use haversine formula)
    total_distance = Decimal("0")
    # TODO: Implement proper distance calculation
    
    return TaskGPSTrackSummaryStats(
        task_id=task_id,
        total_points=total_points,
        total_segments=total_segments,
        total_distance_meters=total_distance,
        total_distance_km=total_distance / 1000,
        tracking_start_time=tracking_start,
        tracking_end_time=tracking_end,
        total_tracking_duration_minutes=total_duration,
        active_tracking_duration_minutes=total_duration,  # TODO: Exclude pauses
        max_speed_kmh=max_speed,
        avg_speed_kmh=avg_speed,
        min_speed_kmh=min_speed,
        avg_accuracy_meters=avg_accuracy,
        points_with_poor_accuracy=poor_accuracy_count
    )


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
    query = db.query(Task).join(TaskAssignment).filter(
        TaskAssignment.user_id == current_user.id,
        Task.company_id == current_user.company_id
    )
    
    # Filter by status
    if status:
        query = query.filter(TaskAssignment.status == status)
    
    if not include_completed:
        query = query.filter(Task.status != TaskStatus.completed)
    
    tasks = query.order_by(desc(Task.priority), Task.scheduled_start_date).all()
    
    # Add computed fields
    for task in tasks:
        task.assignment_count = len(task.assignments)
        task.assignee_names = [a.user.full_name for a in task.assignments if a.user]
    
    return tasks


@router.get("/tasks/calendar", response_model=List[TaskCalendarEvent])
def get_tasks_calendar(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get tasks formatted for calendar view"""
    tasks = db.query(Task).filter(
        Task.company_id == current_user.company_id,
        Task.scheduled_start_date >= start_date,
        Task.scheduled_start_date <= end_date
    ).all()
    
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
    # Total tasks
    total_tasks = db.query(func.count(Task.id)).filter(
        Task.company_id == current_user.company_id
    ).scalar()
    
    # Tasks by status
    status_counts = db.query(
        Task.status,
        func.count(Task.id)
    ).filter(
        Task.company_id == current_user.company_id
    ).group_by(Task.status).all()
    
    by_status = {status: count for status, count in status_counts}
    
    # Tasks by category
    category_counts = db.query(
        Task.task_category,
        func.count(Task.id)
    ).filter(
        Task.company_id == current_user.company_id
    ).group_by(Task.task_category).all()
    
    by_category = {category: count for category, count in category_counts}
    
    # Tasks by priority
    priority_counts = db.query(
        Task.priority,
        func.count(Task.id)
    ).filter(
        Task.company_id == current_user.company_id
    ).group_by(Task.priority).all()
    
    by_priority = {priority: count for priority, count in priority_counts}
    
    # Time statistics
    total_hours = db.query(func.sum(Task.actual_hours)).filter(
        Task.company_id == current_user.company_id
    ).scalar() or Decimal("0")
    
    # Completed tasks
    completed_tasks = db.query(Task).filter(
        Task.company_id == current_user.company_id,
        Task.status == TaskStatus.completed
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
        Task.company_id == current_user.company_id,
        Task.status.in_([TaskStatus.scheduled, TaskStatus.in_progress]),
        Task.scheduled_start_date < today
    ).scalar() or 0
    
    tasks_on_time = db.query(func.count(Task.id)).filter(
        Task.company_id == current_user.company_id,
        Task.status.in_([TaskStatus.scheduled, TaskStatus.in_progress]),
        Task.scheduled_start_date >= today
    ).scalar() or 0
    
    # Completed this week
    week_start = today - timedelta(days=today.weekday())
    tasks_completed_this_week = db.query(func.count(Task.id)).filter(
        Task.company_id == current_user.company_id,
        Task.status == TaskStatus.completed,
        Task.completed_at >= week_start
    ).scalar() or 0
    
    # Completed this month
    month_start = today.replace(day=1)
    tasks_completed_this_month = db.query(func.count(Task.id)).filter(
        Task.company_id == current_user.company_id,
        Task.status == TaskStatus.completed,
        Task.completed_at >= month_start
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