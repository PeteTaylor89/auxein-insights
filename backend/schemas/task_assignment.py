# app/schemas/task_assignment.py - Task Assignment Schemas
from typing import Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from enum import Enum

from .user import UserSummary


class AssignmentRole(str, Enum):
    """Role of user in task assignment"""
    assignee = "assignee"
    lead = "lead"
    helper = "helper"


class AssignmentStatus(str, Enum):
    """Assignment acceptance status"""
    assigned = "assigned"
    accepted = "accepted"
    declined = "declined"
    completed = "completed"


class TaskAssignmentBase(BaseModel):
    """Base schema for task assignments"""
    user_id: int
    role: AssignmentRole = AssignmentRole.assignee
    is_primary: bool = False
    estimated_hours: Optional[Decimal] = Field(None, ge=0, le=999.99)


class TaskAssignmentCreate(TaskAssignmentBase):
    """Schema for creating a task assignment"""
    pass


class TaskAssignmentBulkCreate(BaseModel):
    """Schema for bulk creating assignments"""
    user_ids: list[int] = Field(..., min_length=1)
    role: AssignmentRole = AssignmentRole.assignee
    estimated_hours: Optional[Decimal] = Field(None, ge=0, le=999.99)
    
    # Auto-set first user as primary
    set_first_as_primary: bool = True


class TaskAssignmentUpdate(BaseModel):
    """Schema for updating a task assignment"""
    role: Optional[AssignmentRole] = None
    is_primary: Optional[bool] = None
    estimated_hours: Optional[Decimal] = Field(None, ge=0, le=999.99)


class TaskAssignmentResponse(TaskAssignmentBase):
    """Schema for task assignment responses"""
    id: int
    task_id: int
    status: AssignmentStatus
    
    # Assignment tracking
    assigned_at: datetime
    assigned_by: Optional[int] = None
    
    # Acceptance tracking
    accepted_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    decline_reason: Optional[str] = None
    
    # Time tracking
    actual_hours: Decimal = Field(ge=0)
    
    # Notifications
    notified_at: Optional[datetime] = None
    reminder_sent_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class TaskAssignmentWithUser(TaskAssignmentResponse):
    """Task assignment with user details included"""
    user: UserSummary
    assigner: Optional[UserSummary] = None
    
    class Config:
        from_attributes = True


class TaskAssignmentSummary(BaseModel):
    """Lightweight assignment info for task lists"""
    id: int
    user_id: int
    user_name: str
    role: AssignmentRole
    is_primary: bool
    status: AssignmentStatus
    actual_hours: Decimal
    
    class Config:
        from_attributes = True


class TaskAssignmentAcceptRequest(BaseModel):
    """Schema for accepting an assignment"""
    notes: Optional[str] = None


class TaskAssignmentDeclineRequest(BaseModel):
    """Schema for declining an assignment"""
    decline_reason: str = Field(..., min_length=1, max_length=500)


class TaskAssignmentFilter(BaseModel):
    """Filter schema for listing assignments"""
    task_id: Optional[int] = None
    user_id: Optional[int] = None
    status: Optional[AssignmentStatus] = None
    role: Optional[AssignmentRole] = None
    is_primary: Optional[bool] = None


class TaskAssignmentStats(BaseModel):
    """Statistics for user's task assignments"""
    user_id: int
    total_assignments: int
    pending_assignments: int
    accepted_assignments: int
    completed_assignments: int
    declined_assignments: int
    
    # Time tracking
    total_estimated_hours: Decimal
    total_actual_hours: Decimal
    hours_variance: Decimal  # actual - estimated
    
    # Current workload
    active_tasks: int
    overdue_tasks: int


class MyTasksFilter(BaseModel):
    """Filter for 'my tasks' view"""
    status: Optional[AssignmentStatus] = None
    role: Optional[AssignmentRole] = None
    include_completed: bool = False
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


class TaskReassignRequest(BaseModel):
    """Schema for reassigning a task to different user"""
    from_user_id: int
    to_user_id: int
    reason: Optional[str] = None
    notify_users: bool = True
    
    @field_validator('to_user_id')
    @classmethod
    def validate_different_users(cls, v: int, info) -> int:
        """Ensure we're not reassigning to the same user"""
        if 'from_user_id' in info.data and v == info.data['from_user_id']:
            raise ValueError("Cannot reassign to the same user")
        return v