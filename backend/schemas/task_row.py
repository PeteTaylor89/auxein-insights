# app/schemas/task_row.py - Task Row Tracking Schemas
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from enum import Enum

from .vineyard_row import VineyardRow


class TaskRowStatus(str, Enum):
    """Row completion status"""
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    skipped = "skipped"


class TaskRowBase(BaseModel):
    """Base schema for task rows"""
    vineyard_row_id: Optional[int] = None
    row_number: Optional[str] = Field(None, max_length=20)
    block_id: Optional[int] = None
    
    @field_validator('row_number')
    @classmethod
    def validate_row_identifier(cls, v: Optional[str], info) -> Optional[str]:
        """Ensure either vineyard_row_id or row_number is provided"""
        vineyard_row_id = info.data.get('vineyard_row_id')
        if not vineyard_row_id and not v:
            raise ValueError("Either vineyard_row_id or row_number must be provided")
        return v


class TaskRowCreate(TaskRowBase):
    """Schema for creating a task row"""
    pass


class TaskRowBulkCreate(BaseModel):
    """Schema for bulk creating task rows from a block"""
    block_id: int
    vineyard_row_ids: Optional[list[int]] = None  # If None, create for all rows in block
    
    # Or create by row number range
    row_number_start: Optional[str] = None
    row_number_end: Optional[str] = None


class TaskRowUpdate(BaseModel):
    """Schema for updating a task row"""
    status: Optional[TaskRowStatus] = None
    percentage_complete: Optional[int] = Field(None, ge=0, le=100)
    notes: Optional[str] = None
    issues_found: Optional[str] = None
    quality_rating: Optional[int] = Field(None, ge=1, le=5)


class TaskRowCompleteRequest(BaseModel):
    """Schema for completing a row"""
    notes: Optional[str] = None
    issues_found: Optional[str] = None
    quality_rating: Optional[int] = Field(None, ge=1, le=5)
    duration_minutes: Optional[int] = Field(None, ge=0)


class TaskRowSkipRequest(BaseModel):
    """Schema for skipping a row"""
    skip_reason: str = Field(..., min_length=1, max_length=500)


class TaskRowResponse(TaskRowBase):
    """Schema for task row responses"""
    id: int
    task_id: int
    status: TaskRowStatus
    
    # Completion tracking
    completed_at: Optional[datetime] = None
    completed_by: Optional[int] = None
    
    # Work details
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    
    # Progress
    percentage_complete: int = Field(ge=0, le=100)
    
    # Quality & notes
    notes: Optional[str] = None
    issues_found: Optional[str] = None
    quality_rating: Optional[int] = Field(None, ge=1, le=5)
    
    # Skipped rows
    skip_reason: Optional[str] = None
    
    # Metadata
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class TaskRowWithVineyardRow(TaskRowResponse):
    """Task row with vineyard row details included"""
    vineyard_row: Optional[VineyardRow] = None
    
    class Config:
        from_attributes = True


class TaskRowSummary(BaseModel):
    """Lightweight row info for task progress display"""
    id: int
    row_identifier: str  # "Row 5" or "Row A1"
    status: TaskRowStatus
    percentage_complete: int
    quality_rating: Optional[int] = None
    has_issues: bool = False
    
    class Config:
        from_attributes = True


class TaskRowFilter(BaseModel):
    """Filter schema for listing task rows"""
    task_id: Optional[int] = None
    status: Optional[TaskRowStatus] = None
    block_id: Optional[int] = None
    vineyard_row_id: Optional[int] = None
    completed_by: Optional[int] = None
    has_issues: Optional[bool] = None
    quality_rating_min: Optional[int] = Field(None, ge=1, le=5)
    quality_rating_max: Optional[int] = Field(None, ge=1, le=5)


class TaskRowProgressSummary(BaseModel):
    """Summary of row progress for a task"""
    task_id: int
    total_rows: int
    completed_rows: int
    skipped_rows: int
    in_progress_rows: int
    pending_rows: int
    
    # Progress percentage
    completion_percentage: int = Field(ge=0, le=100)
    
    # Quality metrics
    avg_quality_rating: Optional[float] = None
    rows_with_issues: int
    
    # Time metrics
    total_duration_minutes: int
    avg_duration_per_row: Optional[float] = None
    estimated_time_remaining_minutes: Optional[int] = None


class TaskRowBulkCompleteRequest(BaseModel):
    """Schema for bulk completing multiple rows"""
    row_ids: list[int] = Field(..., min_items=1)
    notes: Optional[str] = None
    quality_rating: Optional[int] = Field(None, ge=1, le=5)


class TaskRowBulkSkipRequest(BaseModel):
    """Schema for bulk skipping multiple rows"""
    row_ids: list[int] = Field(..., min_items=1)
    skip_reason: str = Field(..., min_length=1, max_length=500)


class TaskRowReorderRequest(BaseModel):
    """Schema for reordering task rows (change work sequence)"""
    row_ids_in_order: list[int] = Field(..., min_items=2)


class TaskRowQualityReport(BaseModel):
    """Quality metrics for completed rows"""
    task_id: int
    total_completed_rows: int
    
    # Quality distribution
    quality_5_star: int
    quality_4_star: int
    quality_3_star: int
    quality_2_star: int
    quality_1_star: int
    
    # Issues
    rows_with_issues: int
    common_issues: list[str]
    
    # Performance
    fastest_row_minutes: Optional[int] = None
    slowest_row_minutes: Optional[int] = None
    avg_row_minutes: Optional[float] = None