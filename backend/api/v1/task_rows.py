# api/v1/task_rows.py — Row-level task management endpoints (Grow V1, Revision 2)
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.user import User
from db.models.task import Task
from db.models.task_row import TaskRow
from db.models.vineyard_row import VineyardRow
from db.models.block import VineyardBlock
from api.deps import get_current_user
from schemas.task_row import (
    TaskRowResponse, TaskRowUpdate, TaskRowCompleteRequest,
    TaskRowSkipRequest, TaskRowProgressSummary,
    TaskRowBulkCompleteRequest, TaskRowBulkSkipRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_task_or_404(db: Session, task_id: int, user: User) -> Task:
    """Fetch task with company check."""
    task = db.query(Task).filter(Task.id == task_id, Task.company_id == user.company_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def _recalc_task_progress(db: Session, task: Task):
    """Recalculate task progress from row statuses."""
    rows = db.query(TaskRow).filter(TaskRow.task_id == task.id).all()
    if not rows:
        return
    total = len(rows)
    completed = sum(1 for r in rows if r.status == "completed")
    skipped = sum(1 for r in rows if r.status == "skipped")
    # Progress = completed / (total - skipped), or 100 if all skipped
    countable = total - skipped
    task.rows_total = total
    task.rows_completed = completed
    if countable > 0:
        task.progress_percentage = int(round(completed / countable * 100))
    elif total > 0:
        task.progress_percentage = 100  # all rows skipped = task done
    db.flush()


# ============================================================================
# LIST ROWS
# ============================================================================

@router.get("/tasks/{task_id}/rows", response_model=List[TaskRowResponse])
def list_task_rows(
    task_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all rows for a task, with optional status filter."""
    _get_task_or_404(db, task_id, current_user)

    query = db.query(TaskRow).filter(TaskRow.task_id == task_id)
    if status_filter:
        query = query.filter(TaskRow.status == status_filter)

    return query.order_by(TaskRow.row_number, TaskRow.id).all()


# ============================================================================
# PROGRESS SUMMARY
# ============================================================================

@router.get("/tasks/{task_id}/rows/progress", response_model=TaskRowProgressSummary)
def get_row_progress(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get aggregated row progress summary for a task."""
    _get_task_or_404(db, task_id, current_user)

    rows = db.query(TaskRow).filter(TaskRow.task_id == task_id).all()
    total = len(rows)
    completed = sum(1 for r in rows if r.status == "completed")
    skipped = sum(1 for r in rows if r.status == "skipped")
    in_progress = sum(1 for r in rows if r.status == "in_progress")
    pending = sum(1 for r in rows if r.status == "pending")
    countable = total - skipped

    rated = [r.quality_rating for r in rows if r.quality_rating is not None]
    durations = [r.duration_minutes for r in rows if r.duration_minutes is not None]
    issues = sum(1 for r in rows if r.issues_found)

    avg_dur = round(sum(durations) / len(durations), 1) if durations else None
    remaining = pending + in_progress
    est_remaining = int(avg_dur * remaining) if avg_dur and remaining else None

    return TaskRowProgressSummary(
        task_id=task_id,
        total_rows=total,
        completed_rows=completed,
        skipped_rows=skipped,
        in_progress_rows=in_progress,
        pending_rows=pending,
        completion_percentage=int(round(completed / countable * 100)) if countable > 0 else (100 if total > 0 else 0),
        avg_quality_rating=round(sum(rated) / len(rated), 1) if rated else None,
        rows_with_issues=issues,
        total_duration_minutes=sum(durations) if durations else 0,
        avg_duration_per_row=avg_dur,
        estimated_time_remaining_minutes=est_remaining,
    )


# ============================================================================
# GENERATE ROWS FROM BLOCK
# ============================================================================

@router.post("/tasks/{task_id}/rows/generate", response_model=List[TaskRowResponse],
             status_code=status.HTTP_201_CREATED)
def generate_task_rows(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Auto-generate TaskRows from the task's block vineyard rows.
    If no VineyardRow records exist, generates numbered rows from block metadata.
    """
    task = _get_task_or_404(db, task_id, current_user)

    if not task.block_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Task has no block assigned — cannot generate rows")

    # Check if rows already exist
    existing = db.query(TaskRow).filter(TaskRow.task_id == task_id).count()
    if existing > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Task already has {existing} rows. Delete them first to regenerate.")

    block = db.query(VineyardBlock).filter(VineyardBlock.id == task.block_id).first()
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    # Try vineyard rows first
    vineyard_rows = db.query(VineyardRow).filter(
        VineyardRow.block_id == block.id
    ).order_by(VineyardRow.row_number).all()

    created = []
    if vineyard_rows:
        for vr in vineyard_rows:
            tr = TaskRow(
                task_id=task_id,
                vineyard_row_id=vr.id,
                row_number=vr.row_number,
                block_id=block.id,
                status="pending",
            )
            db.add(tr)
            created.append(tr)
    else:
        # Fallback: generate from block row_count or row_start/row_end
        count = block.row_count or 0
        if count == 0 and block.row_start and block.row_end:
            try:
                count = int(block.row_end) - int(block.row_start) + 1
            except (ValueError, TypeError):
                count = 0

        if count == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Block has no vineyard rows and no row_count/row_start/row_end metadata")

        start = int(block.row_start) if block.row_start else 1
        for i in range(count):
            tr = TaskRow(
                task_id=task_id,
                row_number=str(start + i),
                block_id=block.id,
                status="pending",
            )
            db.add(tr)
            created.append(tr)

    # Update task totals
    task.rows_total = len(created)
    task.rows_completed = 0
    task.progress_percentage = 0

    db.commit()
    for tr in created:
        db.refresh(tr)

    logger.info(f"Generated {len(created)} rows for task {task_id} from block {block.id}")
    return created


# ============================================================================
# UPDATE ROW
# ============================================================================

@router.patch("/tasks/{task_id}/rows/{row_id}", response_model=TaskRowResponse)
def update_task_row(
    task_id: int,
    row_id: int,
    row_update: TaskRowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a task row (status, progress, notes, quality)."""
    task = _get_task_or_404(db, task_id, current_user)
    row = db.query(TaskRow).filter(TaskRow.id == row_id, TaskRow.task_id == task_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task row not found")

    update_data = row_update.model_dump(exclude_unset=True)

    # Handle status transitions
    if 'status' in update_data:
        new_status = update_data['status']
        if new_status == "completed" and row.status != "completed":
            row.completed_at = datetime.now(timezone.utc)
            row.completed_by = current_user.id
            row.percentage_complete = 100
        elif new_status == "in_progress" and row.status == "pending":
            row.start_time = datetime.now(timezone.utc)

    for field, value in update_data.items():
        setattr(row, field, value)

    _recalc_task_progress(db, task)
    db.commit()
    db.refresh(row)
    return row


# ============================================================================
# COMPLETE ROW
# ============================================================================

@router.post("/tasks/{task_id}/rows/{row_id}/complete", response_model=TaskRowResponse)
def complete_task_row(
    task_id: int,
    row_id: int,
    body: TaskRowCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a row as completed."""
    task = _get_task_or_404(db, task_id, current_user)
    row = db.query(TaskRow).filter(TaskRow.id == row_id, TaskRow.task_id == task_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task row not found")

    row.status = "completed"
    row.completed_at = datetime.now(timezone.utc)
    row.completed_by = current_user.id
    row.percentage_complete = 100
    row.end_time = datetime.now(timezone.utc)
    if body.notes:
        row.notes = body.notes
    if body.issues_found:
        row.issues_found = body.issues_found
    if body.quality_rating:
        row.quality_rating = body.quality_rating
    if body.duration_minutes is not None:
        row.duration_minutes = body.duration_minutes

    _recalc_task_progress(db, task)
    db.commit()
    db.refresh(row)
    return row


# ============================================================================
# SKIP ROW
# ============================================================================

@router.post("/tasks/{task_id}/rows/{row_id}/skip", response_model=TaskRowResponse)
def skip_task_row(
    task_id: int,
    row_id: int,
    body: TaskRowSkipRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skip a row with a reason."""
    task = _get_task_or_404(db, task_id, current_user)
    row = db.query(TaskRow).filter(TaskRow.id == row_id, TaskRow.task_id == task_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task row not found")

    row.status = "skipped"
    row.skip_reason = body.skip_reason
    row.completed_at = datetime.now(timezone.utc)
    row.completed_by = current_user.id

    _recalc_task_progress(db, task)
    db.commit()
    db.refresh(row)
    return row


# ============================================================================
# BULK COMPLETE
# ============================================================================

@router.post("/tasks/{task_id}/rows/bulk-complete", response_model=List[TaskRowResponse])
def bulk_complete_rows(
    task_id: int,
    body: TaskRowBulkCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark multiple rows as completed."""
    task = _get_task_or_404(db, task_id, current_user)

    rows = db.query(TaskRow).filter(
        TaskRow.task_id == task_id,
        TaskRow.id.in_(body.row_ids),
    ).all()

    if len(rows) != len(body.row_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Some row IDs not found in this task")

    now = datetime.now(timezone.utc)
    for row in rows:
        row.status = "completed"
        row.completed_at = now
        row.completed_by = current_user.id
        row.percentage_complete = 100
        row.end_time = now
        if body.notes:
            row.notes = body.notes
        if body.quality_rating:
            row.quality_rating = body.quality_rating

    _recalc_task_progress(db, task)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


# ============================================================================
# BULK SKIP
# ============================================================================

@router.post("/tasks/{task_id}/rows/bulk-skip", response_model=List[TaskRowResponse])
def bulk_skip_rows(
    task_id: int,
    body: TaskRowBulkSkipRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skip multiple rows."""
    task = _get_task_or_404(db, task_id, current_user)

    rows = db.query(TaskRow).filter(
        TaskRow.task_id == task_id,
        TaskRow.id.in_(body.row_ids),
    ).all()

    if len(rows) != len(body.row_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Some row IDs not found in this task")

    now = datetime.now(timezone.utc)
    for row in rows:
        row.status = "skipped"
        row.skip_reason = body.skip_reason
        row.completed_at = now
        row.completed_by = current_user.id

    _recalc_task_progress(db, task)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows
