from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pydantic import BaseModel, validator, model_validator
from enum import Enum
from geojson_pydantic import Point
import logging

class IncidentType(str, Enum):
    injury = "injury"
    near_miss = "near_miss"
    property_damage = "property_damage"
    environmental = "environmental"
    security = "security"
    dangerous_occurrence = "dangerous_occurrence"

class IncidentSeverity(str, Enum):
    minor = "minor"
    moderate = "moderate"
    serious = "serious"
    critical = "critical"
    fatal = "fatal"

class IncidentCategory(str, Enum):
    slip_trip_fall = "slip_trip_fall"
    chemical_exposure = "chemical_exposure"
    equipment_failure = "equipment_failure"
    manual_handling = "manual_handling"
    cuts_lacerations = "cuts_lacerations"
    burns = "burns"
    eye_injury = "eye_injury"
    respiratory = "respiratory"
    electrical = "electrical"
    vehicle_related = "vehicle_related"
    fire_explosion = "fire_explosion"
    structural_collapse = "structural_collapse"
    other = "other"

class NotifiableType(str, Enum):
    death = "death"
    serious_injury = "serious_injury"
    dangerous_occurrence = "dangerous_occurrence"

class IncidentStatus(str, Enum):
    open = "open"
    investigating = "investigating"
    awaiting_actions = "awaiting_actions"
    closed = "closed"

class InvestigationStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"

class IncidentBase(BaseModel):
    incident_title: str
    incident_description: str
    incident_type: IncidentType
    severity: IncidentSeverity
    category: IncidentCategory
    
    # Incident timing and location
    incident_date: datetime
    discovered_date: Optional[datetime] = None
    location_description: str
    location: Optional[Point] = None
    
    # People involved
    injured_person_name: Optional[str] = None
    injured_person_role: Optional[str] = None
    injured_person_company: Optional[str] = None
    witness_details: Optional[str] = None
    
    # Injury/damage details
    injury_type: Optional[str] = None
    body_part_affected: Optional[str] = None
    medical_treatment_required: bool = False
    medical_provider: Optional[str] = None
    time_off_work: bool = False
    estimated_time_off_days: Optional[int] = None
    
    property_damage_cost: Optional[Decimal] = None
    environmental_impact: Optional[str] = None
    
    # Investigation
    investigation_required: bool = True
    
    # Actions and findings
    immediate_actions_taken: Optional[str] = None
    
    # Risk linkage
    related_risk_id: Optional[int] = None
    
    # Evidence
    evidence_collected: bool = False
    photos_taken: bool = False
    
    # Metadata
    custom_fields: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None

class IncidentCreate(IncidentBase):
    company_id: int
    property_id: Optional[int] = None

class IncidentUpdate(BaseModel):
    incident_title: Optional[str] = None
    incident_description: Optional[str] = None
    property_id: Optional[int] = None
    incident_type: Optional[IncidentType] = None
    severity: Optional[IncidentSeverity] = None
    category: Optional[IncidentCategory] = None

    # Location updates
    location_description: Optional[str] = None
    location: Optional[Point] = None
    
    # People updates
    injured_person_name: Optional[str] = None
    injured_person_role: Optional[str] = None
    injured_person_company: Optional[str] = None
    witness_details: Optional[str] = None
    
    # Injury/damage updates
    injury_type: Optional[str] = None
    body_part_affected: Optional[str] = None
    medical_treatment_required: Optional[bool] = None
    medical_provider: Optional[str] = None
    time_off_work: Optional[bool] = None
    estimated_time_off_days: Optional[int] = None
    
    property_damage_cost: Optional[Decimal] = None
    environmental_impact: Optional[str] = None
    
    # Investigation updates
    investigation_required: Optional[bool] = None
    investigation_status: Optional[InvestigationStatus] = None
    investigator_id: Optional[int] = None
    investigation_findings: Optional[str] = None
    
    # Root cause analysis
    immediate_causes: Optional[List[str]] = None
    root_causes: Optional[List[str]] = None
    contributing_factors: Optional[List[str]] = None
    
    # Actions
    immediate_actions_taken: Optional[str] = None
    corrective_actions_required: Optional[str] = None
    
    # Status
    status: Optional[IncidentStatus] = None
    
    # Follow-up
    lessons_learned: Optional[str] = None
    communication_required: Optional[bool] = None
    communication_completed: Optional[bool] = None
    
    # Evidence
    evidence_collected: Optional[bool] = None
    photos_taken: Optional[bool] = None
    
    # Risk linkage
    related_risk_id: Optional[int] = None
    new_risk_created: Optional[bool] = None
    
    # Metadata
    custom_fields: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None

class IncidentInvestigation(BaseModel):
    """Schema for investigation updates"""
    investigation_findings: str
    immediate_causes: List[str]
    root_causes: List[str]
    contributing_factors: Optional[List[str]] = None
    corrective_actions_required: Optional[str] = None
    lessons_learned: Optional[str] = None

class WorkSafeNotification(BaseModel):
    """Schema for WorkSafe NZ notification"""
    worksafe_reference: Optional[str] = None
    notification_method: str  # online, phone, email
    notification_notes: Optional[str] = None

class IncidentClosure(BaseModel):
    """Schema for closing incidents"""
    closure_reason: str
    lessons_learned: Optional[str] = None
    communication_completed: bool = False

class IncidentResponse(BaseModel):
    id: int
    company_id: int
    property_id: Optional[int] = None

    # Basic incident info
    incident_number: str
    incident_title: str
    incident_description: str
    incident_type: IncidentType
    severity: IncidentSeverity
    category: IncidentCategory
    
    # NZ H&S specific
    is_notifiable: bool
    notifiable_type: Optional[NotifiableType] = None
    worksafe_notified: bool
    worksafe_notification_date: Optional[datetime] = None
    worksafe_reference: Optional[str] = None
    
    # Timing and location
    incident_date: datetime
    discovered_date: Optional[datetime] = None
    location_description: str
    location: Optional[Dict[str, Any]] = None
    
    # People involved
    reported_by: Optional[int] = None
    reported_by_contractor_id: Optional[int] = None
    injured_person_name: Optional[str] = None
    injured_person_role: Optional[str] = None
    injured_person_company: Optional[str] = None
    witness_details: Optional[str] = None
    
    # Injury/damage details
    injury_type: Optional[str] = None
    body_part_affected: Optional[str] = None
    medical_treatment_required: bool
    medical_provider: Optional[str] = None
    time_off_work: bool
    estimated_time_off_days: Optional[int] = None
    
    property_damage_cost: Optional[Decimal] = None
    environmental_impact: Optional[str] = None
    
    # Investigation
    investigation_required: bool
    investigation_status: InvestigationStatus
    investigator_id: Optional[int] = None
    investigation_due_date: Optional[datetime] = None
    investigation_completed_date: Optional[datetime] = None
    investigation_findings: Optional[str] = None
    
    # Root cause analysis
    immediate_causes: List[str]
    root_causes: List[str]
    contributing_factors: List[str]
    
    # Risk linkage
    related_risk_id: Optional[int] = None
    new_risk_created: bool
    
    # Actions
    immediate_actions_taken: Optional[str] = None
    corrective_actions_required: Optional[str] = None
    
    # Status and workflow
    status: IncidentStatus
    closed_date: Optional[datetime] = None
    closed_by: Optional[int] = None
    closure_reason: Optional[str] = None
    
    # Follow-up
    lessons_learned: Optional[str] = None
    communication_required: bool
    communication_completed: bool
    
    # Evidence
    evidence_collected: bool
    photos_taken: bool
    
    # Review and approval
    reviewed_by: Optional[int] = None
    reviewed_date: Optional[datetime] = None
    approved_by: Optional[int] = None
    approved_date: Optional[datetime] = None
    
    # Computed properties
    is_overdue_investigation: bool
    requires_worksafe_notification: bool
    is_serious_incident: bool
    days_since_incident: int
    investigation_days_remaining: Optional[int] = None
    notification_urgency: Optional[str] = None  # IMMEDIATE | AS_SOON_AS_POSSIBLE | None
    
    # Metadata
    custom_fields: Dict[str, Any]
    tags: List[str]
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
    
    @model_validator(mode='before')
    @classmethod
    def convert_location_field(cls, data):
        """Convert PostGIS location to GeoJSON"""
        if hasattr(data, '__dict__'):
            data_dict = {c.name: getattr(data, c.name) for c in data.__table__.columns}
            
            if 'location' in data_dict and data_dict['location'] is not None:
                try:
                    from geoalchemy2.shape import to_shape
                    from shapely.geometry import mapping
                    geom = to_shape(data_dict['location'])
                    data_dict['location'] = mapping(geom)
                except Exception as e:
                    print(f"Error converting location: {e}")
                    data_dict['location'] = None
            
            # Add computed properties
            if hasattr(data, 'is_overdue_investigation'):
                data_dict['is_overdue_investigation'] = data.is_overdue_investigation
                data_dict['requires_worksafe_notification'] = data.requires_worksafe_notification
                data_dict['is_serious_incident'] = data.is_serious_incident
                data_dict['days_since_incident'] = data.days_since_incident
                data_dict['investigation_days_remaining'] = data.investigation_days_remaining
                data_dict['notification_urgency'] = data.notification_urgency

            return data_dict
        return data

class IncidentSummary(BaseModel):
    """Lightweight incident info for lists and dashboards"""
    id: int
    incident_number: str
    incident_title: str
    incident_type: IncidentType
    severity: IncidentSeverity
    status: IncidentStatus
    incident_date: datetime
    is_notifiable: bool
    is_serious_incident: bool
    is_overdue_investigation: bool
    requires_worksafe_notification: bool
    days_since_incident: int
    
    class Config:
        from_attributes = True

class IncidentMetrics(BaseModel):
    """Incident statistics and metrics"""
    total_incidents: int
    incidents_by_type: Dict[str, int]
    incidents_by_severity: Dict[str, int]
    notifiable_incidents: int
    overdue_investigations: int
    open_incidents: int
    average_investigation_days: Optional[float] = None
    
    # Trend data
    incidents_this_month: int
    incidents_last_month: int
    trend_percentage: float

class NotifiableIncidentReport(BaseModel):
    """Report for notifiable incidents (WorkSafe NZ)"""
    incident_id: int
    incident_number: str
    incident_date: datetime
    notifiable_type: NotifiableType
    description: str
    location: str
    injured_person: Optional[str] = None
    injury_details: Optional[str] = None
    immediate_actions: Optional[str] = None
    worksafe_notified: bool
    notification_date: Optional[datetime] = None
    reference_number: Optional[str] = None

# NZ-specific injury types for dropdown lists.
# The trailing group (degloving … infection) are notifiable-injury triggers
# from the HSW (Notifiable Events) Regulations 2016 Table 1 that previously
# had no structured value — see Incident.determine_notifiability().
NZ_INJURY_TYPES = [
    "cut", "bruise", "fracture", "sprain", "strain", "burn", "laceration",
    "amputation", "eye_injury", "head_injury", "spinal_injury", "crush",
    "puncture", "abrasion", "concussion", "chemical_burn", "heat_exhaustion",
    "allergic_reaction", "repetitive_strain",
    "loss_of_consciousness", "degloving", "scalping", "infection", "other"
]

# Body parts commonly affected
BODY_PARTS = [
    "head", "neck", "shoulder", "arm", "elbow", "wrist", "hand", "finger",
    "chest", "back", "abdomen", "hip", "leg", "knee", "ankle", "foot", "toe",
    "eye", "multiple", "other"
]

# Common immediate causes
IMMEDIATE_CAUSES = [
    "unsafe_act", "unsafe_condition", "equipment_failure", "procedural_failure",
    "inadequate_training", "poor_communication", "time_pressure", "fatigue",
    "environmental_factors", "design_deficiency", "maintenance_failure"
]

# Common root causes
ROOT_CAUSES = [
    "inadequate_procedures", "insufficient_training", "poor_supervision",
    "inadequate_maintenance", "design_flaws", "organizational_pressure",
    "communication_breakdown", "resource_constraints", "cultural_issues",
    "regulatory_gaps", "vendor_issues"
]

# WorkSafe notifiability is determined by Incident.determine_notifiability()
# in backend/db/models/incident.py — the single source of truth. A former
# IncidentWorkSafeCompliance helper class lived here but was never wired into
# the model and has been removed to avoid a divergent second engine.

# Constants for WorkSafe compliance
WORKSAFE_CONTACT_INFO = {
    "emergency_phone": "0800 030 040",
    "general_phone": "0800 030 040", 
    "online_notifications": "https://worksafe.govt.nz/notifications/",
    "email": "info@worksafe.govt.nz",
    "website": "https://worksafe.govt.nz"
}

# HSWA requires notification 'as soon as possible … by the fastest way
# possible'. There is no fixed hour-clock for serious injuries or dangerous
# occurrences; a death must be reported immediately by phone.
NOTIFICATION_DEADLINES = {
    "death": "Immediately — phone 0800 030 040 (24/7)",
    "serious_injury": "As soon as possible — Notify WorkSafe online",
    "dangerous_occurrence": "As soon as possible — Notify WorkSafe online"
}

REGULATORY_REFERENCES = {
    "primary_act": "Health and Safety at Work Act 2015",
    "notification_regulations": "Health and Safety at Work (Notifiable Events) Regulations 2016",
    "general_regulations": "Health and Safety at Work (General Risk and Workplace Management) Regulations 2016",
    "worksafe_guidance": "WorkSafe New Zealand Guidance on Notifiable Events"
}
