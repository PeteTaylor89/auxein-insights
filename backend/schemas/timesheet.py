
# app/schemas/timesheet.py
from __future__ import annotations
from decimal import Decimal
from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field, validator

class TimesheetStatus(str):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


# -------- Entries --------
class TimeEntryBase(BaseModel):
    task_id: Optional[int] = Field(None, description="Task identifier; keep required=True if you want all entries task-coded")
    hours: Decimal = Field(..., description="Hours in 0.25 increments")

    @validator("hours")
    def validate_hours(cls, v: Decimal):
        step = Decimal("0.25")
        if v <= 0:
            raise ValueError("hours must be > 0")
        if (v / step) != (v / step).to_integral_value():
            raise ValueError("hours must be in 0.25 increments")
        if v > Decimal("24.00"):
            raise ValueError("hours must be <= 24")
        return v


class TimeEntryCreate(TimeEntryBase):
    timesheet_day_id: int


class TimeEntryUpdate(BaseModel):
    task_id: Optional[int] = None
    hours: Optional[Decimal] = None


class TimeEntryOut(TimeEntryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


# -------- Days --------
class TimesheetDayBase(BaseModel):
    work_date: date
    day_hours: Optional[Decimal] = Field(None, description="Optional day total; if omitted, total = sum of entries")
    notes: Optional[str] = None

    @validator("day_hours")
    def validate_day_hours(cls, v: Optional[Decimal]):
        if v is None:
            return v
        step = Decimal("0.25")
        if v < 0:
            raise ValueError("day_hours cannot be negative")
        if (v / step) != (v / step).to_integral_value():
            raise ValueError("day_hours must be in 0.25 increments")
        if v > Decimal("24.00"):
            raise ValueError("day_hours must be <= 24")
        return v


class TimesheetDayCreate(TimesheetDayBase):
    pass


class TimesheetDayUpdate(BaseModel):
    day_hours: Optional[Decimal] = None
    notes: Optional[str] = None


class TimesheetDayOut(BaseModel):
    id: int
    company_id: int
    user_id: int
    work_date: date
    status: str
    day_hours: Optional[Decimal]
    entry_hours: Decimal
    uncoded_hours: Decimal
    effective_total_hours: Decimal
    notes: Optional[str]
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]
    approved_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    entries: List[TimeEntryOut] = []
    user: Optional[UserBasic] = None  # Add this line

    class Config:
        orm_mode = True

class UserBasic(BaseModel):
    id: int
    username: str
    first_name: Optional[str]
    last_name: Optional[str]
    
    @property
    def full_name(self):
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
        else:
            return self.username
    
    class Config:
        orm_mode = True