# schemas/contractor.py - Fixed for Pydantic v2 (replace regex with pattern)
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, EmailStr, validator, Field
from core.security.password import validate_password

# ===== CONTRACTOR SCHEMAS =====

class ContractorBase(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=200)
    business_number: Optional[str] = Field(None, max_length=50)
    contact_person: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=7, max_length=20)
    mobile: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    contractor_type: str = Field(default="individual", pattern="^(individual|company|partnership)$")
    specializations: List[str] = Field(default_factory=list)
    equipment_owned: List[str] = Field(default_factory=list)

class ContractorCreate(ContractorBase):
    """Schema for contractor self-registration"""
    password: str
    
    # Optional business details (can be completed later)
    has_cleaning_protocols: bool = False
    cleaning_equipment_owned: List[str] = Field(default_factory=list)
    uses_approved_disinfectants: bool = False
    works_multiple_regions: bool = False
    works_with_high_risk_crops: bool = False
    
    @validator("password")
    def password_validation(cls, v):
        if not validate_password(v):
            raise ValueError(
                "Password must be at least 8 characters, include a number and uppercase letter"
            )
        return v
    
    @validator("specializations")
    def validate_specializations(cls, v):
        allowed_specializations = [
            "pruning", "spraying", "harvesting", "pest_control", "irrigation", 
            "machinery", "canopy_management", "soil_management", "consultation"
        ]
        for spec in v:
            if spec not in allowed_specializations:
                raise ValueError(f"Invalid specialization: {spec}")
        return v

class ContractorUpdate(BaseModel):
    """Schema for contractor profile updates"""
    business_name: Optional[str] = Field(None, min_length=2, max_length=200)
    business_number: Optional[str] = Field(None, max_length=50)
    contact_person: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, min_length=7, max_length=20)
    mobile: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    contractor_type: Optional[str] = Field(None, pattern="^(individual|company|partnership)$")
    specializations: Optional[List[str]] = None
    equipment_owned: Optional[List[str]] = None
    
    # Biosecurity details
    has_cleaning_protocols: Optional[bool] = None
    cleaning_equipment_owned: Optional[List[str]] = None
    uses_approved_disinfectants: Optional[bool] = None
    works_multiple_regions: Optional[bool] = None
    works_with_high_risk_crops: Optional[bool] = None
    last_biosecurity_training: Optional[date] = None
    min_days_between_properties: Optional[int] = Field(None, ge=0, le=30)

class ContractorInsuranceUpdate(BaseModel):
    """Schema for updating contractor insurance details"""
    # Public Liability Insurance
    public_liability_insurer: Optional[str] = None
    public_liability_policy_number: Optional[str] = None
    public_liability_coverage_amount: Optional[Decimal] = Field(None, ge=0)
    public_liability_expiry: Optional[date] = None
    
    # Professional Indemnity Insurance
    professional_indemnity_insurer: Optional[str] = None
    professional_indemnity_policy_number: Optional[str] = None
    professional_indemnity_coverage_amount: Optional[Decimal] = Field(None, ge=0)
    professional_indemnity_expiry: Optional[date] = None
    
    # Workers Compensation
    workers_comp_required: Optional[bool] = None
    workers_comp_insurer: Optional[str] = None
    workers_comp_policy_number: Optional[str] = None
    workers_comp_expiry: Optional[date] = None
    
    # Equipment Insurance
    equipment_insurance_insurer: Optional[str] = None
    equipment_insurance_coverage_amount: Optional[Decimal] = Field(None, ge=0)
    equipment_insurance_expiry: Optional[date] = None
    
    # Vehicle Insurance
    vehicle_insurance_insurer: Optional[str] = None
    vehicle_insurance_policy_number: Optional[str] = None
    vehicle_insurance_expiry: Optional[date] = None

class ContractorInDBBase(ContractorBase):
    id: int
    is_active: bool
    is_contractor_verified: bool
    is_verified: bool
    verification_level: str
    insurance_status: str
    biosecurity_risk_level: str
    registration_status: str
    
    # Performance tracking
    total_jobs_completed: int
    average_rating: Decimal
    last_active_date: Optional[date]
    
    # Registration tracking
    registration_source: str
    email_verified_at: Optional[datetime]
    profile_completed_at: Optional[datetime]
    
    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime]
    last_login: Optional[datetime]
    
    class Config:
        from_attributes = True

class Contractor(ContractorInDBBase):
    """Public contractor schema (excludes sensitive data)"""
    pass

class ContractorWithInsurance(Contractor):
    """Contractor schema with insurance details"""
    public_liability_insurer: Optional[str]
    public_liability_coverage_amount: Optional[Decimal]
    public_liability_expiry: Optional[date]
    professional_indemnity_expiry: Optional[date]
    workers_comp_required: bool
    workers_comp_expiry: Optional[date]
    equipment_insurance_expiry: Optional[date]
    vehicle_insurance_expiry: Optional[date]

class ContractorProfile(ContractorWithInsurance):
    """Full contractor profile for own use"""
    verification_documents: List[Dict[str, Any]]
    has_cleaning_protocols: bool
    cleaning_equipment_owned: List[str]
    uses_approved_disinfectants: bool
    works_multiple_regions: bool
    works_with_high_risk_crops: bool
    has_biosecurity_incidents: bool
    requires_movement_tracking: bool
    failed_login_attempts: int
    is_account_locked: bool
    can_login: bool

class ContractorSummary(BaseModel):
    """Lightweight contractor info for lists"""
    id: int
    business_name: str
    contact_person: str
    email: str
    specializations: List[str]
    contractor_type: str
    is_active: bool
    is_verified: bool
    average_rating: Decimal
    insurance_status: str
    biosecurity_risk_level: str
    
    class Config:
        from_attributes = True

# ===== CONTRACTOR RELATIONSHIP SCHEMAS =====

class ContractorRelationshipBase(BaseModel):
    relationship_type: str = Field(default="contractor", pattern="^(contractor|preferred_contractor|blacklisted)$")
    hourly_rate: Optional[Decimal] = Field(None, ge=0)
    daily_rate: Optional[Decimal] = Field(None, ge=0)
    preferred_payment_terms: Optional[str] = Field(None, pattern="^(weekly|monthly|per_job)$")
    currency: str = Field(default="NZD", max_length=3)
    
    # Access permissions
    blocks_access: List[int] = Field(default_factory=list)
    areas_restricted: List[str] = Field(default_factory=list)
    can_create_observations: bool = True
    can_update_tasks: bool = True
    requires_supervision: bool = False
    
    # Contract details
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    auto_renew: bool = False
    
    # Emergency contact override
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    
    # Work preferences
    preferred_work_types: List[str] = Field(default_factory=list)
    work_restrictions: List[str] = Field(default_factory=list)
    company_notes: Optional[str] = Field(None, max_length=1000)

class ContractorRelationshipCreate(ContractorRelationshipBase):
    contractor_id: int
    company_id: Optional[int] = None  # Set from current user's company
    
    @validator("contract_end")
    def validate_contract_dates(cls, v, values):
        if v and values.get("contract_start") and v <= values["contract_start"]:
            raise ValueError("Contract end date must be after start date")
        return v

class ContractorRelationshipUpdate(BaseModel):
    relationship_type: Optional[str] = Field(None, pattern="^(contractor|preferred_contractor|blacklisted)$")
    status: Optional[str] = Field(None, pattern="^(active|inactive|suspended|terminated)$")
    hourly_rate: Optional[Decimal] = Field(None, ge=0)
    daily_rate: Optional[Decimal] = Field(None, ge=0)
    preferred_payment_terms: Optional[str] = Field(None, pattern="^(weekly|monthly|per_job)$")
    
    # Access permissions
    blocks_access: Optional[List[int]] = None
    areas_restricted: Optional[List[str]] = None
    can_create_observations: Optional[bool] = None
    can_update_tasks: Optional[bool] = None
    requires_supervision: Optional[bool] = None
    
    # Contract details
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    auto_renew: Optional[bool] = None
    
    # Emergency contact
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    
    # Work preferences
    preferred_work_types: Optional[List[str]] = None
    work_restrictions: Optional[List[str]] = None
    company_notes: Optional[str] = Field(None, max_length=1000)
    termination_reason: Optional[str] = Field(None, max_length=500)

class ContractorRelationshipInDB(ContractorRelationshipBase):
    id: int
    contractor_id: int
    company_id: int
    status: str
    
    # Performance metrics
    jobs_completed_for_company: int
    company_rating: Decimal
    last_worked_date: Optional[date]
    total_hours_worked: Decimal
    total_amount_paid: Decimal
    
    # Contract status
    is_active: bool
    is_contract_current: bool
    can_work_today: bool
    contract_status: str
    days_until_contract_end: Optional[int]
    
    # Training
    required_training_modules: List[int]
    completed_training_modules: List[int]
    has_required_training: bool
    
    # Termination details
    terminated_by: Optional[int]
    termination_date: Optional[date]
    
    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class ContractorRelationship(ContractorRelationshipInDB):
    pass

class ContractorRelationshipWithDetails(ContractorRelationship):
    contractor: Optional[ContractorSummary] = None
    effective_hourly_rate: float
    effective_daily_rate: float

# ===== CONTRACTOR MOVEMENT SCHEMAS =====

class ContractorMovementBase(BaseModel):
    purpose: str = Field(..., min_length=4, max_length=200)
    blocks_visited: List[int] = Field(default_factory=list)
    areas_accessed: List[str] = Field(default_factory=list)
    equipment_brought: List[str] = Field(default_factory=list)
    
    # Previous location (optional for check-in)
    previous_location_name: Optional[str] = None
    previous_location_type: Optional[str] = Field(None, pattern="^(vineyard|nursery|farm|home|other)$")
    days_since_last_location: Optional[int] = Field(None, ge=0)
    
    # Vehicle details
    vehicle_registration: Optional[str] = None
    trailer_present: bool = False
    trailer_registration: Optional[str] = None
    
    # Environmental conditions
    weather_conditions: Optional[str] = None
    temperature_celsius: Optional[Decimal] = None
    soil_conditions: Optional[str] = None
    wind_conditions: Optional[str] = None

class ContractorMovementCreate(ContractorMovementBase):
    contractor_id: Optional[int] = None  # Set from auth
    company_id: Optional[int] = None  # Set from current user's company
    arrival_datetime: Optional[datetime] = None  # Defaults to now
    check_in_notes: Optional[str] = None

class ContractorMovementUpdate(BaseModel):
    purpose: Optional[str] = Field(None, min_length=4, max_length=200)
    blocks_visited: Optional[List[int]] = None
    areas_accessed: Optional[List[str]] = None
    equipment_brought: Optional[List[str]] = None
    work_summary: Optional[str] = None
    hours_worked: Optional[Decimal] = Field(None, ge=0)
    
    # Biosecurity
    equipment_cleaned: Optional[bool] = None
    cleaning_method: Optional[str] = None
    cleaning_products_used: Optional[List[str]] = None
    vehicle_cleaned: Optional[bool] = None
    
    # Safety
    safety_briefing_given: Optional[bool] = None
    ppe_provided: Optional[List[str]] = None
    
    # Check-out
    check_out_notes: Optional[str] = None

class ContractorMovementInDB(ContractorMovementBase):
    id: int
    contractor_id: int
    company_id: int
    
    arrival_datetime: datetime
    departure_datetime: Optional[datetime]
    
    # Previous location tracking
    previous_company_id: Optional[int]
    last_location_departure: Optional[datetime]
    
    # Biosecurity compliance
    equipment_cleaned: bool
    cleaning_method: Optional[str]
    cleaning_products_used: List[str]
    cleaning_verified_by: Optional[int]
    cleaning_verified_at: Optional[datetime]
    vehicle_cleaned: bool
    
    # Risk assessment
    biosecurity_risk_level: str
    risk_factors: List[str]
    risk_mitigation_measures: List[str]
    biosecurity_compliance_score: int
    is_biosecurity_compliant: bool
    
    # Work tracking
    tasks_assigned: List[int]
    tasks_completed: List[int]
    observations_created: List[int]
    work_summary: Optional[str]
    hours_worked: Optional[Decimal]
    
    # Safety
    safety_briefing_given: bool
    ppe_provided: List[str]
    incidents_occurred: List[Dict[str, Any]]
    
    # Status
    status: str
    is_active_visit: bool
    visit_duration_hours: Optional[float]
    visit_duration_minutes: Optional[int]
    
    # Check-in/out tracking
    checked_in_by: int
    checked_out_by: Optional[int]
    check_in_notes: Optional[str]
    check_out_notes: Optional[str]
    
    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class ContractorMovement(ContractorMovementInDB):
    pass

class ContractorMovementWithDetails(ContractorMovement):
    contractor: Optional[ContractorSummary] = None
    previous_company_name: Optional[str] = None
    time_since_last_location_hours: Optional[float] = None

# ===== CONTRACTOR ASSIGNMENT SCHEMAS =====

class ContractorAssignmentBase(BaseModel):
    assignment_type: str = Field(default="specific_task", pattern="^(specific_task|general_work|consultation|maintenance)$")
    work_description: str = Field(..., min_length=10)
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    
    # Estimation
    estimated_hours: Optional[Decimal] = Field(None, ge=0)
    estimated_cost: Optional[Decimal] = Field(None, ge=0)
    estimated_completion_date: Optional[date] = None
    
    # Scheduling
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    
    # Location and scope
    blocks_involved: List[int] = Field(default_factory=list)
    areas_involved: List[str] = Field(default_factory=list)
    work_scope: Optional[str] = None
    
    # Requirements
    required_certifications: List[int] = Field(default_factory=list)
    required_equipment: List[str] = Field(default_factory=list)
    required_weather_conditions: List[str] = Field(default_factory=list)
    special_instructions: Optional[str] = None
    safety_requirements: List[str] = Field(default_factory=list)
    
    # Financial
    rate_type: Optional[str] = Field(None, pattern="^(hourly|daily|fixed_price)$")
    agreed_rate: Optional[Decimal] = Field(None, ge=0)
    currency: str = Field(default="NZD", max_length=3)

class ContractorAssignmentCreate(ContractorAssignmentBase):
    contractor_id: int
    company_id: Optional[int] = None  # Set from current user's company
    task_id: Optional[int] = None
    
    # Assignment options
    requires_approval: bool = False
    quality_check_required: bool = False
    invoice_required: bool = True
    
    # Recurring options
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = Field(None, pattern="^(weekly|monthly|seasonal|annual)$")

class ContractorAssignmentUpdate(BaseModel):
    work_description: Optional[str] = Field(None, min_length=10)
    priority: Optional[str] = Field(None, pattern="^(low|medium|high|urgent)$")
    status: Optional[str] = Field(None, pattern="^(assigned|accepted|in_progress|paused|completed|cancelled|rejected)$")
    
    # Scheduling updates
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    
    # Progress tracking
    completion_percentage: Optional[int] = Field(None, ge=0, le=100)
    work_notes: Optional[str] = None
    
    # Results
    actual_hours_worked: Optional[Decimal] = Field(None, ge=0)
    actual_cost: Optional[Decimal] = Field(None, ge=0)
    quality_rating: Optional[int] = Field(None, ge=1, le=5)
    client_satisfaction: Optional[int] = Field(None, ge=1, le=5)
    
    # Issues and changes
    cancellation_reason: Optional[str] = None

class ContractorAssignmentInDB(ContractorAssignmentBase):
    id: int
    contractor_id: int
    company_id: int
    task_id: Optional[int]
    
    # Status tracking
    status: str
    completion_percentage: int
    quality_check_required: bool
    quality_check_completed: bool
    
    # Actual vs estimated
    actual_start: Optional[datetime]
    actual_end: Optional[datetime]
    actual_hours_worked: Optional[Decimal]
    actual_cost: Optional[Decimal]
    
    # Performance metrics
    quality_rating: Optional[int]
    client_satisfaction: Optional[int]
    cost_variance: Optional[float]
    time_variance_hours: Optional[float]
    efficiency_rating: float
    
    # Status checks
    is_active: bool
    is_overdue: bool
    days_overdue: int
    scheduled_duration_hours: Optional[float]
    actual_duration_hours: Optional[float]
    
    # Work tracking
    materials_used: List[str]
    completion_photos: List[str]
    issues_encountered: List[Dict[str, Any]]
    delays_encountered: List[Dict[str, Any]]
    change_requests: List[Dict[str, Any]]
    
    # Financial
    invoice_required: bool
    invoice_generated: bool
    payment_status: str
    
    # Recurring
    is_recurring: bool
    recurrence_pattern: Optional[str]
    next_occurrence: Optional[date]
    parent_assignment_id: Optional[int]
    
    # Approval
    requires_approval: bool
    approved_by: Optional[int]
    approved_at: Optional[datetime]
    rejection_reason: Optional[str]
    
    # Metadata
    assigned_by: int
    completed_by: Optional[int]
    cancelled_by: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class ContractorAssignment(ContractorAssignmentInDB):
    pass

class ContractorAssignmentWithDetails(ContractorAssignment):
    contractor: Optional[ContractorSummary] = None
    task_name: Optional[str] = None
    assigner_name: Optional[str] = None
    payment_amount: float

# ===== CONTRACTOR TRAINING SCHEMAS =====

class ContractorTrainingBase(BaseModel):
    training_module_id: int
    priority: str = Field(default="medium", pattern="^(low|medium|high|mandatory)$")
    due_date: Optional[date] = None
    assignment_reason: Optional[str] = Field(None, pattern="^(new_contractor|company_requirement|incident_response|renewal)$")
    
    # Company requirements
    required_by_companies: List[int] = Field(default_factory=list)
    mandatory_for_work_types: List[str] = Field(default_factory=list)
    must_complete_before_work: bool = False
    
    # Supervision
    requires_supervision: bool = False
    supervisor_id: Optional[int] = None

class ContractorTrainingCreate(ContractorTrainingBase):
    contractor_id: int
    assigning_company_id: Optional[int] = None
    passing_score_required: Optional[Decimal] = None
    max_attempts: int = Field(default=3, ge=1, le=10)

class ContractorTrainingUpdate(BaseModel):
    due_date: Optional[date] = None
    priority: Optional[str] = Field(None, pattern="^(low|medium|high|mandatory)$")
    must_complete_before_work: Optional[bool] = None
    requires_supervision: Optional[bool] = None
    supervisor_id: Optional[int] = None
    contractor_feedback: Optional[str] = None

class ContractorTrainingInDB(ContractorTrainingBase):
    id: int
    contractor_id: int
    
    # Assignment details
    assigned_by: int
    assigned_date: date
    assigning_company_id: Optional[int]
    
    # Completion tracking
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    
    # Performance
    attempts: int
    max_attempts: int
    time_spent_minutes: int
    score: Optional[Decimal]
    passing_score_required: Optional[Decimal]
    passed: Optional[bool]
    
    # Progress
    modules_completed: List[str]
    current_module: Optional[str]
    progress_percentage: int
    last_activity: Optional[datetime]
    
    # Validity
    valid_until: Optional[date]
    renewal_required: bool
    renewal_notification_sent: bool
    
    # Supervision
    supervised_by: Optional[int]
    supervision_notes: Optional[str]
    
    # Certification
    certificate_issued: bool
    certificate_number: Optional[str]
    certificate_file_path: Optional[str]
    
    # Remedial
    is_remedial: bool
    remedial_reason: Optional[str]
    original_training_id: Optional[int]
    
    # Status properties
    is_overdue: bool
    days_overdue: int
    is_expired: bool
    days_until_expiry: Optional[int]
    needs_renewal_notification: bool
    can_attempt: bool
    
    # Performance metrics
    average_score: Optional[float]
    best_score: Optional[float]
    total_time_spent: int
    urgency_score: int
    
    # Notes
    contractor_feedback: Optional[str]
    trainer_notes: Optional[str]
    completion_notes: Optional[str]
    
    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class ContractorTraining(ContractorTrainingInDB):
    pass

class ContractorTrainingWithDetails(ContractorTraining):
    training_module_name: Optional[str] = None
    contractor_name: Optional[str] = None
    assigner_name: Optional[str] = None
    completion_summary: Dict[str, Any]
    attempt_statistics: Dict[str, Any]

# ===== OPERATIONAL SCHEMAS =====

class ContractorCheckIn(BaseModel):
    contractor_id: Optional[int] = None  # Set from auth
    company_id: Optional[int] = None  # Set from current user
    purpose: str = Field(..., min_length=4)
    equipment_brought: List[str] = Field(default_factory=list)
    previous_location_name: Optional[str] = None
    vehicle_registration: Optional[str] = None
    notes: Optional[str] = None

class ContractorCheckOut(BaseModel):
    movement_id: int
    work_summary: Optional[str] = None
    hours_worked: Optional[Decimal] = Field(None, ge=0)
    equipment_cleaned: bool = False
    notes: Optional[str] = None

class ContractorPerformanceReport(BaseModel):
    contractor_id: int
    period_start: date
    period_end: date
    total_assignments: int
    completed_assignments: int
    average_rating: float
    total_hours_worked: float
    total_amount_earned: float
    efficiency_rating: float
    biosecurity_compliance_rate: float
    training_completion_rate: float

class ContractorDocumentUpload(BaseModel):
    document_type: str = Field(..., pattern="^(insurance_certificate|license|certification|contract|other)$")
    document_subtype: Optional[str] = None
    expires_at: Optional[date] = None
    description: Optional[str] = None