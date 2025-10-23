# app/schemas/task.py - Main Task Schemas
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, computed_field
from enum import Enum

from .task_template import TaskCategory, TaskPriority
from .user import UserSummary
from .block import Block
from .spatial_area import SpatialAreaResponse 
from .file import FileSummary


class TaskStatus(str, Enum):
    """Task lifecycle status matching database enum"""
    draft = "draft"
    scheduled = "scheduled"
    ready = "ready"
    in_progress = "in_progress"
    paused = "paused"
    completed = "completed"
    cancelled = "cancelled"


class TaskBase(BaseModel):
    """Base schema for tasks"""
    title: str = Field(..., min_length=1, max_length=200)
    task_category: TaskCategory
    task_subcategory: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    
    # Location (hybrid approach)
    block_id: Optional[int] = None
    spatial_area_id: Optional[int] = None
    location_type: Optional[str] = Field(None, max_length=50)
    location_id: Optional[int] = None
    location_notes: Optional[str] = None
    
    # Scheduling
    scheduled_start_date: Optional[date] = None
    scheduled_end_date: Optional[date] = None
    scheduled_start_time: Optional[datetime] = None
    priority: TaskPriority = TaskPriority.medium
    
    # Progress tracking
    rows_total: Optional[int] = Field(None, ge=0)
    area_total_hectares: Optional[Decimal] = Field(None, ge=0)
    
    # Time estimation
    estimated_hours: Optional[Decimal] = Field(None, ge=0, le=9999.99)
    
    # GPS tracking
    requires_gps_tracking: bool = False
    
    # Related entities
    related_observation_run_id: Optional[int] = None
    related_maintenance_id: Optional[int] = None
    related_calibration_id: Optional[int] = None
    
    # Metadata
    weather_conditions: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = Field(default_factory=list)
    
    @field_validator('scheduled_end_date')
    @classmethod
    def validate_end_date(cls, v: Optional[date], info) -> Optional[date]:
        """Validate end date is after start date"""
        if v and 'scheduled_start_date' in info.data:
            start_date = info.data.get('scheduled_start_date')
            if start_date and v < start_date:
                raise ValueError("scheduled_end_date must be on or after scheduled_start_date")
        return v


class TaskCreate(TaskBase):
    """Schema for creating a new task"""
    template_id: Optional[int] = None  # Create from template


class TaskQuickCreate(BaseModel):
    """Simplified schema for quick task creation in the field"""
    template_id: int  # Required for quick create
    title: Optional[str] = None  # Override template name if needed
    block_id: Optional[int] = None
    spatial_area_id: Optional[int] = None
    location_notes: Optional[str] = None
    scheduled_start_date: Optional[date] = None
    priority: Optional[TaskPriority] = None
    
    # Quick assignment
    assigned_user_ids: Optional[List[int]] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    """Schema for updating a task"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    task_category: Optional[TaskCategory] = None
    task_subcategory: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    
    # Location
    block_id: Optional[int] = None
    spatial_area_id: Optional[int] = None
    location_type: Optional[str] = None
    location_id: Optional[int] = None
    location_notes: Optional[str] = None
    
    # Scheduling
    scheduled_start_date: Optional[date] = None
    scheduled_end_date: Optional[date] = None
    scheduled_start_time: Optional[datetime] = None
    priority: Optional[TaskPriority] = None
    
    # Progress
    rows_total: Optional[int] = Field(None, ge=0)
    area_total_hectares: Optional[Decimal] = Field(None, ge=0)
    estimated_hours: Optional[Decimal] = Field(None, ge=0, le=9999.99)
    
    # GPS
    requires_gps_tracking: Optional[bool] = None
    
    # Related entities
    related_observation_run_id: Optional[int] = None
    related_maintenance_id: Optional[int] = None
    related_calibration_id: Optional[int] = None
    
    # Metadata
    weather_conditions: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None


class TaskResponse(TaskBase):
    """Schema for task responses"""
    id: int
    company_id: int
    template_id: Optional[int] = None
    task_number: str
    status: TaskStatus
    
    # Progress tracking
    progress_percentage: int = Field(ge=0, le=100)
    rows_completed: int = Field(ge=0)
    area_completed_hectares: Optional[Decimal] = Field(None, ge=0)
    
    # Time tracking
    actual_hours: Decimal = Field(ge=0)
    
    # GPS tracking
    gps_tracking_active: bool
    total_distance_meters: Optional[Decimal] = None
    area_covered_hectares: Optional[Decimal] = None
    
    # Execution tracking
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    paused_at: Optional[datetime] = None
    total_pause_duration_minutes: int = Field(ge=0)
    
    # Completion
    completed_at: Optional[datetime] = None
    completed_by: Optional[int] = None
    completion_notes: Optional[str] = None
    completion_photos: Optional[List[str]] = Field(default_factory=list)
    
    # Cancellation
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[int] = None
    cancellation_reason: Optional[str] = None
    
    # Metadata
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    
    # Computed properties
    @computed_field
    @property
    def is_active(self) -> bool:
        """Check if task is currently active"""
        return self.status in [TaskStatus.in_progress, TaskStatus.paused]
    
    @computed_field
    @property
    def is_complete(self) -> bool:
        """Check if task is completed"""
        return self.status == TaskStatus.completed
    
    @computed_field
    @property
    def can_start(self) -> bool:
        """Check if task can be started"""
        return self.status in [TaskStatus.scheduled, TaskStatus.ready, TaskStatus.draft]
    
    @computed_field
    @property
    def duration_minutes(self) -> Optional[int]:
        """Calculate actual working duration excluding pauses"""
        if not self.actual_start_time:
            return None
        
        from datetime import datetime as dt, timezone
        end_time = self.actual_end_time or dt.now(timezone.utc)
        total_minutes = int((end_time - self.actual_start_time).total_seconds() / 60)
        
        return max(0, total_minutes - self.total_pause_duration_minutes)
    
    class Config:
        from_attributes = True


class TaskWithRelations(TaskResponse):
    """Task with related entities included"""
    block: Optional[Block] = None
    spatial_area: Optional[SpatialAreaResponse] = None
    creator: Optional[UserSummary] = None
    completer: Optional[UserSummary] = None
    
    # Assignment count
    assignment_count: int = 0
    assignee_names: List[str] = Field(default_factory=list)
    
    # File attachments
    files: List[FileSummary] = Field(default_factory=list)
    
    class Config:
        from_attributes = True


class TaskSummary(BaseModel):
    """Lightweight task info for lists and references"""
    id: int
    task_number: str
    title: str
    task_category: TaskCategory
    task_subcategory: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    scheduled_start_date: Optional[date] = None
    progress_percentage: int
    
    # Location display
    block_id: Optional[int] = None
    spatial_area_id: Optional[int] = None
    
    @computed_field
    @property
    def location_display(self) -> str:
        """Simple location display"""
        if self.block_id:
            return f"Block #{self.block_id}"
        elif self.spatial_area_id:
            return f"Area #{self.spatial_area_id}"
        return "No location"
    
    class Config:
        from_attributes = True


class TaskFilter(BaseModel):
    """Filter schema for listing tasks"""
    status: Optional[TaskStatus] = None
    task_category: Optional[TaskCategory] = None
    task_subcategory: Optional[str] = None
    priority: Optional[TaskPriority] = None
    block_id: Optional[int] = None
    spatial_area_id: Optional[int] = None
    assigned_to_user_id: Optional[int] = None
    created_by: Optional[int] = None
    
    # Date filters
    scheduled_start_from: Optional[date] = None
    scheduled_start_to: Optional[date] = None
    completed_from: Optional[date] = None
    completed_to: Optional[date] = None
    
    # Boolean filters
    requires_gps_tracking: Optional[bool] = None
    is_overdue: Optional[bool] = None
    has_assignments: Optional[bool] = None
    
    # Search
    search: Optional[str] = None  # Search in title, description, task_number


class TaskActionRequest(BaseModel):
    """Base schema for task action requests"""
    notes: Optional[str] = None


class TaskStartRequest(TaskActionRequest):
    """Schema for starting a task"""
    start_gps_tracking: bool = False


class TaskPauseRequest(TaskActionRequest):
    """Schema for pausing a task"""
    pause_gps_tracking: bool = True


class TaskResumeRequest(TaskActionRequest):
    """Schema for resuming a task"""
    resume_gps_tracking: bool = True


class TaskCompleteRequest(TaskActionRequest):
    """Schema for completing a task"""
    completion_notes: Optional[str] = None
    completion_photo_ids: Optional[List[str]] = Field(default_factory=list)
    weather_conditions: Optional[Dict[str, Any]] = None


class TaskCancelRequest(TaskActionRequest):
    """Schema for cancelling a task"""
    cancellation_reason: str = Field(..., min_length=1)


class TaskStatsResponse(BaseModel):
    """Statistics for tasks"""
    total_tasks: int
    by_status: Dict[str, int]
    by_category: Dict[str, int]
    by_priority: Dict[str, int]
    
    # Time statistics
    total_hours_logged: Decimal
    avg_completion_time_hours: Optional[Decimal] = None
    
    # Progress
    tasks_on_time: int
    tasks_overdue: int
    tasks_completed_this_week: int
    tasks_completed_this_month: int


class TaskCalendarEvent(BaseModel):
    """Task formatted for calendar view"""
    id: int
    task_number: str
    title: str
    status: TaskStatus
    priority: TaskPriority
    start: datetime  # scheduled_start_time or scheduled_start_date
    end: Optional[datetime] = None
    all_day: bool
    color: Optional[str] = None
    
    # Additional info
    location: str
    assignees: List[str] = Field(default_factory=list)
    progress_percentage: int
    
    class Config:
        from_attributes = True


class TaskBulkUpdateRequest(BaseModel):
    """Schema for bulk updating multiple tasks"""
    task_ids: List[int] = Field(..., min_items=1)
    update_data: TaskUpdate


class TaskBulkActionRequest(BaseModel):
    """Schema for bulk actions on multiple tasks"""
    task_ids: List[int] = Field(..., min_items=1)
    action: str = Field(..., pattern=r'^(cancel|delete|assign|change_priority|change_status)$')
    action_data: Optional[Dict[str, Any]] = None