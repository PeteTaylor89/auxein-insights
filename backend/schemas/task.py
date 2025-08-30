# app/schemas/task.py
from enum import Enum
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = "planned"
    due_date: Optional[date] = None
    block_id: int
    assigned_to: Optional[int] = None

class TaskStatus(str, Enum):
    planned = "planned"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None
    completion_date: Optional[date] = None
    assigned_to: Optional[int] = None

class TaskResponse(TaskBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: datetime
    completion_date: Optional[date] = None
    
    class Config:
        orm_mode = True