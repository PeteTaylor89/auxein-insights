# app/schemas/visitor.py - Visitor Pydantic Schemas
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel, EmailStr, validator
from .user import UserSummary

class VisitorBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    vehicle_registration: Optional[str] = None
    driver_license: Optional[str] = None
    company_representing: Optional[str] = None
    position_title: Optional[str] = None

class VisitorCreate(VisitorBase):
    company_id: Optional[int] = None  # Will be set from current user's company
    
    @validator("first_name", "last_name")
    def validate_names(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v.strip()
    
    @validator("phone", "emergency_contact_phone")
    def validate_phone(cls, v):
        if v and len(v.strip()) < 7:
            raise ValueError("Phone number must be at least 7 characters")
        return v.strip() if v else v

class VisitorUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    vehicle_registration: Optional[str] = None
    driver_license: Optional[str] = None
    company_representing: Optional[str] = None
    position_title: Optional[str] = None
    is_active: Optional[bool] = None
    is_banned: Optional[bool] = None
    ban_reason: Optional[str] = None

class VisitorInDBBase(VisitorBase):
    id: int
    company_id: int
    is_active: bool
    is_banned: bool
    ban_reason: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        orm_mode = True

class Visitor(VisitorInDBBase):
    pass

class VisitorWithStats(Visitor):
    """Visitor with visit statistics"""
    total_visits: int
    last_visit_date: Optional[date] = None
    is_frequent_visitor: bool
    creator: Optional[UserSummary] = None

# ===== VISITOR VISIT SCHEMAS =====

class VisitorVisitBase(BaseModel):
    purpose: str
    expected_duration_hours: Optional[int] = None
    host_user_id: int
    areas_accessed: List[str] = []
    restricted_areas: List[str] = []
    visit_notes: Optional[str] = None
    weather_conditions: Optional[str] = None

class VisitorVisitCreate(VisitorVisitBase):
    visitor_id: int
    visit_date: Optional[date] = None  # Defaults to today
    company_id: Optional[int] = None  # Will be set from current user's company
    
    @validator("purpose")
    def validate_purpose(cls, v):
        if not v or len(v.strip()) < 4:
            raise ValueError("Purpose must be at least 4 characters")
        return v.strip()
    
    @validator("expected_duration_hours")
    def validate_duration(cls, v):
        if v is not None and (v < 1 or v > 24):
            raise ValueError("Expected duration must be between 1 and 24 hours")
        return v

class VisitorVisitUpdate(BaseModel):
    purpose: Optional[str] = None
    expected_duration_hours: Optional[int] = None
    host_user_id: Optional[int] = None
    areas_accessed: Optional[List[str]] = None
    restricted_areas: Optional[List[str]] = None
    visit_notes: Optional[str] = None
    weather_conditions: Optional[str] = None
    status: Optional[str] = None
    cancelled_reason: Optional[str] = None
    
    @validator("status")
    def validate_status(cls, v):
        if v is not None:
            allowed_statuses = ["planned", "in_progress", "completed", "cancelled"]
            if v not in allowed_statuses:
                raise ValueError(f"Status must be one of: {', '.join(allowed_statuses)}")
        return v

class VisitorVisitInDBBase(VisitorVisitBase):
    id: int
    visitor_id: int
    company_id: int
    visit_date: date
    host_notified: bool
    signed_in_at: Optional[datetime] = None
    signed_out_at: Optional[datetime] = None
    signed_in_by: Optional[int] = None
    signed_out_by: Optional[int] = None
    induction_completed: bool
    induction_completed_at: Optional[datetime] = None
    induction_completed_by: Optional[int] = None
    ppe_provided: List[str] = []
    safety_briefing_given: bool
    incidents: List[Dict[str, Any]] = []
    status: str
    cancelled_reason: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        orm_mode = True

class VisitorVisit(VisitorVisitInDBBase):
    pass

class VisitorVisitWithDetails(VisitorVisit):
    """Visit with related visitor and user details"""
    visitor: Optional[Visitor] = None
    host: Optional[UserSummary] = None
    creator: Optional[UserSummary] = None
    signed_in_by_user: Optional[UserSummary] = None
    signed_out_by_user: Optional[UserSummary] = None
    induction_by_user: Optional[UserSummary] = None
    
    # Computed fields
    is_active_visit: bool
    visit_duration_minutes: Optional[int] = None
    is_overdue: bool

class VisitorVisitSummary(BaseModel):
    """Lightweight visit info for lists"""
    id: int
    visitor_name: str
    purpose: str
    visit_date: date
    status: str
    host_name: str
    signed_in_at: Optional[datetime] = None
    signed_out_at: Optional[datetime] = None
    is_active_visit: bool
    
    class Config:
        orm_mode = True

# ===== OPERATION SCHEMAS =====

class VisitorSignIn(BaseModel):
    """Schema for signing a visitor in"""
    visit_id: int
    induction_completed: bool = False
    ppe_provided: List[str] = []
    safety_briefing_given: bool = False
    areas_accessed: Optional[List[str]] = None
    notes: Optional[str] = None

class VisitorSignOut(BaseModel):
    """Schema for signing a visitor out"""
    visit_id: int
    notes: Optional[str] = None
    incidents: Optional[List[Dict[str, Any]]] = None

class VisitorInduction(BaseModel):
    """Schema for completing visitor induction"""
    visit_id: int
    ppe_provided: List[str] = []
    safety_briefing_given: bool = True
    notes: Optional[str] = None

class VisitorIncident(BaseModel):
    """Schema for logging visitor incidents"""
    visit_id: int
    incident_type: str  # "injury", "near_miss", "property_damage", "other"
    description: str
    severity: str  # "low", "medium", "high", "critical"
    immediate_action_taken: str
    reported_at: Optional[datetime] = None
    
    @validator("incident_type")
    def validate_incident_type(cls, v):
        allowed_types = ["injury", "near_miss", "property_damage", "security", "other"]
        if v not in allowed_types:
            raise ValueError(f"Incident type must be one of: {', '.join(allowed_types)}")
        return v
    
    @validator("severity")
    def validate_severity(cls, v):
        allowed_severities = ["low", "medium", "high", "critical"]
        if v not in allowed_severities:
            raise ValueError(f"Severity must be one of: {', '.join(allowed_severities)}")
        return v

# ===== REPORTING SCHEMAS =====

class VisitorStats(BaseModel):
    """Visitor statistics for a company"""
    total_visitors: int
    total_visits: int
    active_visits_today: int
    frequent_visitors: int  # 3+ visits
    visitors_this_month: int
    visits_this_month: int
    average_visit_duration_minutes: float
    most_common_purposes: List[Dict[str, Any]]  # [{"purpose": "Meeting", "count": 5}]

class VisitorReport(BaseModel):
    """Visitor report data"""
    period_start: date
    period_end: date
    total_visits: int
    unique_visitors: int
    by_purpose: Dict[str, int]
    by_host: Dict[str, int]
    incidents_count: int
    average_duration_hours: float
    overdue_visits: int

# ===== BULK OPERATIONS =====

class BulkVisitorCreate(BaseModel):
    """Schema for creating multiple visitors at once"""
    visitors: List[VisitorCreate]
    
    @validator("visitors")
    def validate_visitors(cls, v):
        if len(v) == 0:
            raise ValueError("At least one visitor is required")
        if len(v) > 20:
            raise ValueError("Maximum 20 visitors can be created at once")
        return v