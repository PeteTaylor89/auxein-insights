from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, validator
from enum import Enum

class ActionType(str, Enum):
    preventive = "preventive"   
    detective = "detective"  
    corrective = "corrective"    
    mitigative = "mitigative"

class ControlType(str, Enum):
    elimination = "elimination"      
    substitution = "substitution"    
    engineering = "engineering"      
    administrative = "administrative" 
    ppe = "ppe"            

class ActionPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class ActionUrgency(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"

class ActionStatus(str, Enum):
    planned = "planned"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"
    overdue = "overdue"

class RiskActionBase(BaseModel):
    action_title: str
    action_description: str
    action_type: ActionType
    control_type: ControlType
    priority: ActionPriority = ActionPriority.medium
    urgency: ActionUrgency = ActionUrgency.medium
    
    # Assignment
    assigned_to: Optional[int] = None
    responsible_person: Optional[int] = None
    
    # Scheduling
    target_start_date: Optional[datetime] = None
    target_completion_date: Optional[datetime] = None
    
    # Cost estimation
    estimated_cost: Optional[Decimal] = None
    currency: str = "NZD"
    
    # Risk reduction expectations
    expected_likelihood_reduction: Optional[int] = None
    expected_severity_reduction: Optional[int] = None
    
    # Task integration
    auto_create_task: bool = True
    
    # Verification requirements
    requires_verification: bool = False
    
    # Recurring settings
    is_recurring: bool = False
    recurrence_frequency_days: Optional[int] = None
    
    # Metadata
    custom_fields: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    
    @validator("expected_likelihood_reduction", "expected_severity_reduction")
    def validate_reduction_values(cls, v):
        if v is not None and not 0 <= v <= 5:
            raise ValueError("Risk reduction values must be between 0 and 5")
        return v
    
    @validator("recurrence_frequency_days")
    def validate_recurrence(cls, v, values):
        if values.get("is_recurring") and (v is None or v < 1):
            raise ValueError("Recurring actions must have a frequency of at least 1 day")
        return v

class RiskActionCreate(RiskActionBase):
    risk_id: int

class RiskActionUpdate(BaseModel):
    action_title: Optional[str] = None
    action_description: Optional[str] = None
    action_type: Optional[ActionType] = None
    control_type: Optional[ControlType] = None
    priority: Optional[ActionPriority] = None
    urgency: Optional[ActionUrgency] = None
    
    # Assignment updates
    assigned_to: Optional[int] = None
    responsible_person: Optional[int] = None
    
    # Status updates
    status: Optional[ActionStatus] = None
    progress_percentage: Optional[int] = None
    
    # Date updates
    target_start_date: Optional[datetime] = None
    target_completion_date: Optional[datetime] = None
    actual_start_date: Optional[datetime] = None
    actual_completion_date: Optional[datetime] = None
    
    # Cost updates
    estimated_cost: Optional[Decimal] = None
    actual_cost: Optional[Decimal] = None
    
    # Risk reduction updates
    expected_likelihood_reduction: Optional[int] = None
    expected_severity_reduction: Optional[int] = None
    
    # Notes and verification
    completion_notes: Optional[str] = None
    requires_verification: Optional[bool] = None
    verification_notes: Optional[str] = None
    
    # Recurring updates
    is_recurring: Optional[bool] = None
    recurrence_frequency_days: Optional[int] = None
    
    # Metadata updates
    custom_fields: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    
    @validator("progress_percentage")
    def validate_progress(cls, v):
        if v is not None and not 0 <= v <= 100:
            raise ValueError("Progress percentage must be between 0 and 100")
        return v

class ActionProgressUpdate(BaseModel):
    """Specific schema for updating action progress"""
    progress_percentage: int
    notes: Optional[str] = None
    
    @validator("progress_percentage")
    def validate_progress(cls, v):
        if not 0 <= v <= 100:
            raise ValueError("Progress percentage must be between 0 and 100")
        return v

class ActionCompletion(BaseModel):
    """Schema for marking actions as completed"""
    completion_notes: Optional[str] = None
    actual_cost: Optional[Decimal] = None
    requires_verification: bool = False

class ActionVerification(BaseModel):
    """Schema for verifying completed actions"""
    verification_notes: Optional[str] = None
    effectiveness_rating: Optional[int] = None
    effectiveness_notes: Optional[str] = None
    
    @validator("effectiveness_rating")
    def validate_effectiveness(cls, v):
        if v is not None and not 1 <= v <= 5:
            raise ValueError("Effectiveness rating must be between 1 and 5")
        return v

class RiskActionResponse(BaseModel):
    id: int
    risk_id: int
    company_id: int
    
    # Action details
    action_title: str
    action_description: str
    action_type: ActionType
    control_type: ControlType
    priority: ActionPriority
    urgency: ActionUrgency
    
    # Assignment and responsibility
    assigned_to: Optional[int] = None
    responsible_person: Optional[int] = None
    created_by: int
    
    # Status and progress
    status: ActionStatus
    progress_percentage: int
    
    # Dates
    target_start_date: Optional[datetime] = None
    target_completion_date: Optional[datetime] = None
    actual_start_date: Optional[datetime] = None
    actual_completion_date: Optional[datetime] = None
    
    # Cost tracking
    estimated_cost: Optional[Decimal] = None
    actual_cost: Optional[Decimal] = None
    currency: str
    
    # Risk reduction
    expected_likelihood_reduction: Optional[int] = None
    expected_severity_reduction: Optional[int] = None
    
    # Task integration
    task_id: Optional[int] = None
    auto_create_task: bool
    
    # Verification
    requires_verification: bool
    verification_completed: bool
    verification_date: Optional[datetime] = None
    verified_by: Optional[int] = None
    verification_notes: Optional[str] = None
    
    # Effectiveness tracking
    effectiveness_rating: Optional[int] = None
    effectiveness_notes: Optional[str] = None
    effectiveness_reviewed_by: Optional[int] = None
    effectiveness_reviewed_at: Optional[datetime] = None
    
    # Recurring
    is_recurring: bool
    recurrence_frequency_days: Optional[int] = None
    next_due_date: Optional[datetime] = None
    parent_action_id: Optional[int] = None
    
    # Notes and metadata
    completion_notes: Optional[str] = None
    custom_fields: Dict[str, Any]
    tags: List[str]
    
    # Computed properties
    is_overdue: bool
    days_until_due: Optional[int] = None
    is_completed: bool
    duration_days: Optional[int] = None
    cost_variance: Optional[float] = None
    is_high_priority: bool
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class RiskActionSummary(BaseModel):
    """Lightweight action info for lists and dashboards"""
    id: int
    risk_id: int
    action_title: str
    action_description: str
    action_type: ActionType
    control_type: ControlType
    priority: ActionPriority
    urgency: ActionUrgency
    status: ActionStatus
    progress_percentage: int
    assigned_to: Optional[int] = None
    target_completion_date: Optional[datetime] = None
    is_overdue: bool
    is_high_priority: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class ActionEffectiveness(BaseModel):
    """Schema for tracking action effectiveness"""
    action_id: int
    effectiveness_rating: int
    effectiveness_notes: Optional[str] = None
    actual_likelihood_reduction: Optional[int] = None
    actual_severity_reduction: Optional[int] = None
    
    @validator("effectiveness_rating")
    def validate_rating(cls, v):
        if not 1 <= v <= 5:
            raise ValueError("Effectiveness rating must be between 1 and 5")
        return v

class ActionMetrics(BaseModel):
    """Action performance metrics"""
    total_actions: int
    completed_actions: int
    overdue_actions: int
    in_progress_actions: int
    completion_rate: float
    average_completion_days: Optional[float] = None
    cost_variance_total: Optional[float] = None
    effectiveness_average: Optional[float] = None

class ActionsByRisk(BaseModel):
    """Actions grouped by risk"""
    risk_id: int
    risk_title: str
    risk_level: str
    actions: List[RiskActionSummary]
    completed_actions: int
    total_actions: int
    completion_percentage: float

class RecurringActionSchedule(BaseModel):
    """Schema for managing recurring action schedules"""
    action_id: int
    next_due_date: datetime
    frequency_days: int
    last_completed: Optional[datetime] = None
    overdue_count: int = 0

# Action type descriptions for UI
ACTION_TYPE_DESCRIPTIONS = {
    "preventive": "Actions that prevent the risk from occurring in the first place",
    "detective": "Actions that detect when a risk event is occurring or has occurred",
    "corrective": "Actions that fix problems after a risk event has occurred",
    "mitigative": "Actions that reduce the impact when a risk event occurs"
}

CONTROL_TYPE_DESCRIPTIONS = {
    "elimination": "Remove the hazard entirely (most effective)",
    "substitution": "Replace with something less hazardous",
    "engineering": "Engineering controls (guards, ventilation, etc.)",
    "administrative": "Procedures, training, signage, job rotation",
    "ppe": "Personal protective equipment (least effective)"
}

# Priority matrix for determining action urgency
PRIORITY_URGENCY_MATRIX = {
    ("critical", "urgent"): "immediate",
    ("critical", "high"): "within_24h",
    ("critical", "medium"): "within_week",
    ("high", "urgent"): "within_24h",
    ("high", "high"): "within_week",
    ("high", "medium"): "within_month",
    ("medium", "urgent"): "within_week",
    ("medium", "high"): "within_month",
    ("medium", "medium"): "within_quarter",
    ("low", "urgent"): "within_month",
    ("low", "high"): "within_quarter",
    ("low", "medium"): "when_convenient"
}