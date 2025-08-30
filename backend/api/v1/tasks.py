# app/api/v1/tasks.py
from fastapi import APIRouter, Depends, HTTPException, Query, logger
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from db.session import get_db
from db.models.task import Task
from db.models.user import User
from db.models.block import VineyardBlock
from schemas.task import TaskCreate, TaskUpdate, TaskResponse
from api.deps import get_current_user
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/", response_model=TaskResponse, status_code=201, tags=["tasks"])
def create_task(
    task_in: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new task"""
    # Verify the block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == task_in.block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    task_data = task_in.dict()
    task_data['status'] = 'planned'
    

    # Create task
    task = Task(
        **task_data,
        created_by=current_user.id
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info(f"Task {task.id} created by user {current_user.id}")
    
    return task

@router.get("/", response_model=List[TaskResponse], tags=["tasks"])
def list_tasks(
    block_id: Optional[int] = None,
    created_by: Optional[int] = None,
    assigned_to: Optional[int] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    priority: Optional[str] = None,
    status: Optional[str] = None,
    due_date: Optional[date] = None,
    completion_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List tasks with filtering options"""
    query = db.query(Task)
    
    # Apply other filters
    if block_id:
        query = query.filter(Task.block_id == block_id)
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    if assigned_to:
        query = query.filter(Task.assigned_to == assigned_to)

    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    # Execute query
    tasks = query.all()
    return tasks

@router.get("/{task_id}", response_model=TaskResponse, tags=["tasks"])
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific task by ID"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check company access permissions
    if current_user.role != "admin" and task.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this task"
        )
    
    return task

@router.put("/{task_id}", response_model=TaskResponse, tags=["tasks"])
def update_task(
    task_id: int,
    task_update: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Update task attributes
    update_data = task_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)
    
    # Handle completion status
    if task_update.status and task_update.status.lower() == "completed" and not task.completion_date:
        task.completion_date = date.today()
    
    db.commit()
    db.refresh(task)
    logger.info(f"Task {task_id} updated by user {current_user.id}")
    
    return task

@router.delete("/{task_id}", status_code=204, tags=["tasks"])
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check company access permissions
    if current_user.role != "admin" and task.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to delete this task"
        )
    
    db.delete(task)
    db.commit()
    logger.info(f"Task {task_id} deleted by user {current_user.id}")
    
    return None

@router.get("/block/{block_id}", response_model=List[TaskResponse], tags=["tasks"])
def get_tasks_by_block(
    block_id: int,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all tasks for a specific block"""
    # Verify block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Check company access permissions
    if current_user.role != "admin" and block.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to view tasks for this block"
        )
    
    # Query tasks
    query = db.query(Task).filter(Task.block_id == block_id)
    
    if status:
        query = query.filter(Task.status == status)
    
    tasks = query.offset(skip).limit(limit).all()
    return tasks

@router.get("/user/{user_id}", response_model=List[TaskResponse], tags=["tasks"])
def get_tasks_by_user(
    user_id: int,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all tasks assigned to a specific user"""
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check company access permissions - can only see tasks for users in same company
    if current_user.role != "admin" and current_user.id != user_id:
        if current_user.company_id != user.company_id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to view tasks for this user"
            )
    
    # Start with base query
    query = db.query(Task).filter(Task.assigned_to == user_id)
    
    # Apply company filter for non-admin users viewing other users' tasks
    if current_user.role != "admin" and current_user.id != user_id:
        query = query.filter(Task.company_id == current_user.company_id)
    
    # Apply status filter if provided
    if status:
        query = query.filter(Task.status == status)
    
    tasks = query.offset(skip).limit(limit).all()
    return tasks

# Add an additional endpoint to get tasks by company
@router.get("/company/{company_id}", response_model=List[TaskResponse], tags=["tasks"])
def get_tasks_by_company(
    company_id: int,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all tasks for a specific company"""
    # Only admins or users from the company can access
    if current_user.role != "admin" and current_user.company_id != company_id:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to view tasks for this company"
        )
    
    # Query tasks
    query = db.query(Task).filter(Task.company_id == company_id)
    
    if status:
        query = query.filter(Task.status == status)
    
    tasks = query.offset(skip).limit(limit).all()
    return tasks