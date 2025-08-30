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

class IncidentUpdate(BaseModel):
    incident_title: Optional[str] = None
    incident_description: Optional[str] = None
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
    reported_by: int
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

# NZ-specific injury types for dropdown lists
NZ_INJURY_TYPES = [
    "cut", "bruise", "fracture", "sprain", "strain", "burn", "laceration",
    "amputation", "eye_injury", "head_injury", "spinal_injury", "crush",
    "puncture", "abrasion", "concussion", "chemical_burn", "heat_exhaustion",
    "allergic_reaction", "repetitive_strain", "other"
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

class IncidentWorkSafeCompliance:
    """Enhanced WorkSafe compliance methods for the Incident model"""
    
    def determine_notifiability(self):
        """
        Determine if incident is notifiable to WorkSafe NZ according to 
        Health and Safety at Work Act 2015 and HSW (Notifiable Events) Regulations 2016
        """
        self.is_notifiable = False
        self.notifiable_type = None
        
        # DEATH - Section 23 of HSW Act 2015
        if self.severity == "fatal":
            self.is_notifiable = True
            self.notifiable_type = "death"
            return
        
        # NOTIFIABLE INJURY OR ILLNESS - Regulation 4 of HSW (Notifiable Events) Regulations 2016
        notifiable_injury_conditions = [
            # Fractures (except minor fractures to fingers, toes, or nose)
            (self.injury_type == "fracture" and 
             self.body_part_affected not in ["finger", "toe", "nose"] and
             self.severity in ["moderate", "serious", "critical"]),
            
            # Amputation of any part of the body
            self.injury_type == "amputation",
            
            # Serious head injury including loss of consciousness
            (self.injury_type in ["head_injury", "concussion"] or
             self.body_part_affected == "head" or
             "consciousness" in (self.incident_description or "").lower() or
             "unconscious" in (self.incident_description or "").lower()),
            
            # Serious eye injury
            (self.injury_type == "eye_injury" or 
             self.body_part_affected == "eye" or
             "eye" in (self.injury_type or "")),
            
            # Serious burns
            (self.injury_type in ["burn", "chemical_burn"] and
             (self.severity in ["serious", "critical"] or
              self.body_part_affected in ["face", "hand", "multiple"] or
              self.medical_treatment_required)),
            
            # Spinal injury
            (self.injury_type == "spinal_injury" or 
             self.body_part_affected in ["neck", "back"] or
             "spinal" in (self.injury_type or "") or
             "spine" in (self.incident_description or "").lower()),
            
            # Serious lacerations requiring immediate medical treatment
            (self.injury_type in ["laceration", "cut"] and 
             self.medical_treatment_required and
             self.severity in ["serious", "critical"]),
            
            # Any injury requiring immediate treatment as an in-patient in a hospital
            (self.medical_treatment_required and 
             self.medical_provider and
             any(term in self.medical_provider.lower() for term in ["hospital", "emergency", "ed", "a&e"]) and
             self.severity in ["serious", "critical"]),
            
            # Occupational illness requiring medical treatment
            (self.incident_type in ["chemical_exposure"] and
             self.medical_treatment_required and
             self.severity in ["moderate", "serious", "critical"]),
        ]
        
        if any(notifiable_injury_conditions):
            self.is_notifiable = True
            self.notifiable_type = "serious_injury"
            return
        
        # NOTIFIABLE INCIDENT - Regulation 5 of HSW (Notifiable Events) Regulations 2016
        notifiable_incident_conditions = [
            # Uncontrolled escape, spillage, or leakage of dangerous substances
            (self.incident_type == "environmental" and
             any(term in (self.incident_description or "").lower() for term in 
                 ["chemical", "spill", "leak", "escape", "release", "gas", "toxic", "hazardous"])),
            
            # Uncontrolled implosion, explosion, or fire
            (self.category == "fire_explosion" or
             any(term in (self.incident_description or "").lower() for term in 
                 ["explosion", "fire", "blast", "ignition"])),
            
            # Uncontrolled escape of gas, steam, or pressurised substance
            any(term in (self.incident_description or "").lower() for term in 
                ["gas escape", "steam", "pressure", "pressurised", "compressed air"]),
            
            # Electric shock requiring medical treatment or causing unconsciousness
            (self.category == "electrical" and
             (self.medical_treatment_required or 
              any(term in (self.incident_description or "").lower() for term in 
                  ["unconscious", "shock", "electrocuted"]))),
            
            # Collapse, overturning, failure of plant designed to lift, handle, or transport persons
            (self.category == "equipment_failure" and
             any(term in (self.incident_description or "").lower() for term in 
                 ["crane", "lift", "elevator", "forklift", "platform", "hoist", "cherry picker", 
                  "boom lift", "scissor lift"])),
            
            # Collapse or partial collapse of structure
            (self.category == "structural_collapse" or
             any(term in (self.incident_description or "").lower() for term in 
                 ["collapse", "structural failure", "building collapse", "roof collapse"])),
            
            # Collapse or failure of excavation face, wall, or roof
            any(term in (self.incident_description or "").lower() for term in 
                ["excavation", "trench", "tunnel", "wall collapse", "cave-in"]),
            
            # Inrush of water, mud, or gas
            any(term in (self.incident_description or "").lower() for term in 
                ["inrush", "water inrush", "mud inrush", "gas inrush", "flooding"]),
            
            # Major property damage that could have exposed persons to serious risk
            (self.incident_type == "property_damage" and
             self.property_damage_cost and
             float(self.property_damage_cost) >= 50000 and
             any(term in (self.incident_description or "").lower() for term in 
                 ["could have", "near miss", "potential", "narrowly avoided", "lucky"])),
        ]
        
        if any(notifiable_incident_conditions):
            self.is_notifiable = True
            self.notifiable_type = "dangerous_occurrence"
            return
        
        # Near miss with serious potential (dangerous occurrence)
        if (self.incident_type == "near_miss" and 
            self.severity in ["serious", "critical", "fatal"]):
            dangerous_near_miss_indicators = [
                any(term in (self.incident_description or "").lower() for term in 
                    ["could have died", "potential fatality", "serious injury potential", 
                     "narrowly avoided", "close call", "lucky"]),
                self.category in ["fire_explosion", "structural_collapse", "electrical"]
            ]
            
            if any(dangerous_near_miss_indicators):
                self.is_notifiable = True
                self.notifiable_type = "dangerous_occurrence"
                return

    def set_investigation_due_date(self):
        """Set investigation due date based on severity and notifiability (NZ best practices)"""
        if self.severity == "fatal":
            # Immediate investigation required for fatalities
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(hours=2)
        elif self.is_notifiable:
            # 24 hours for notifiable incidents
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(hours=24)
        elif self.severity in ["serious", "critical"]:
            # 48 hours for serious incidents
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(hours=48)
        elif self.severity == "moderate":
            # 7 days for moderate incidents
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(days=7)
        else:
            # 14 days for minor incidents
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(days=14)

    def check_notification_compliance(self):
        """Check WorkSafe notification compliance"""
        if not self.is_notifiable:
            return {"required": False, "compliant": True}
        
        if not self.worksafe_notified:
            return {
                "required": True, 
                "compliant": False, 
                "reason": "Notification not completed",
                "deadline_passed": self.is_notification_overdue()
            }
        
        if self.worksafe_notification_date and self.incident_date:
            hours_to_notify = (self.worksafe_notification_date - self.incident_date).total_seconds() / 3600
            
            # Death must be notified immediately (within 1 hour is acceptable)
            if self.notifiable_type == "death":
                deadline_hours = 1
            else:
                deadline_hours = 48
            
            return {
                "required": True,
                "compliant": hours_to_notify <= deadline_hours,
                "hours_to_notify": hours_to_notify,
                "deadline_hours": deadline_hours,
                "reason": f"Notified after {hours_to_notify:.1f} hours (deadline: {deadline_hours} hours)" if hours_to_notify > deadline_hours else None
            }
        
        return {"required": True, "compliant": False, "reason": "Cannot determine notification timeline"}

    def is_notification_overdue(self):
        """Check if WorkSafe notification deadline has passed"""
        if not self.is_notifiable or self.worksafe_notified:
            return False
        
        if self.notifiable_type == "death":
            deadline = self.incident_date + timedelta(hours=1)
        else:
            deadline = self.incident_date + timedelta(hours=48)
        
        return datetime.now(timezone.utc) > deadline

    def get_notification_requirements(self):
        """Get specific WorkSafe notification requirements for this incident"""
        if not self.is_notifiable:
            return None
        
        requirements = {
            "death": {
                "deadline_hours": 1,
                "urgency": "IMMEDIATE",
                "primary_method": "Phone: 0800 030 040",
                "methods": ["phone"],
                "details_required": [
                    "Date, time and location of death",
                    "Name of deceased person",
                    "Circumstances of death",
                    "Name and contact details of person reporting"
                ],
                "follow_up": "Written notification within 48 hours"
            },
            "serious_injury": {
                "deadline_hours": 48,
                "urgency": "WITHIN 48 HOURS",
                "primary_method": "Phone: 0800 030 040 or Online: worksafe.govt.nz/notifications/",
                "methods": ["phone", "online", "email"],
                "details_required": [
                    "Date, time and location of incident",
                    "Name and contact details of injured person",
                    "Nature and extent of injury",
                    "Circumstances of incident",
                    "Medical treatment provided"
                ]
            },
            "dangerous_occurrence": {
                "deadline_hours": 48,
                "urgency": "WITHIN 48 HOURS",
                "primary_method": "Phone: 0800 030 040 or Online: worksafe.govt.nz/notifications/",
                "methods": ["phone", "online", "email"],
                "details_required": [
                    "Date, time and location of incident",
                    "Nature of dangerous occurrence",
                    "Circumstances of incident",
                    "Any injuries or damage",
                    "Immediate actions taken"
                ]
            }
        }
        
        requirement = requirements.get(self.notifiable_type, {})
        
        # Calculate time remaining
        if self.incident_date and requirement:
            deadline = self.incident_date + timedelta(hours=requirement.get("deadline_hours", 48))
            time_remaining = deadline - datetime.now(timezone.utc)
            
            requirement["deadline"] = deadline.isoformat()
            requirement["time_remaining_hours"] = time_remaining.total_seconds() / 3600
            requirement["overdue"] = time_remaining.total_seconds() < 0
        
        return requirement

    def get_notification_instructions(self):
        """Get step-by-step WorkSafe notification instructions"""
        if not self.is_notifiable:
            return None
        
        requirements = self.get_notification_requirements()
        if not requirements:
            return None
        
        instructions = {
            "urgency": requirements.get("urgency", "WITHIN 48 HOURS"),
            "primary_method": requirements.get("primary_method", "Phone: 0800 030 040"),
            "contact_info": {
                "phone": "0800 030 040",
                "online": "https://worksafe.govt.nz/notifications/",
                "email": "info@worksafe.govt.nz"
            },
            "steps": []
        }
        
        if self.notifiable_type == "death":
            instructions["steps"] = [
                "1. Call WorkSafe IMMEDIATELY: 0800 030 040",
                "2. Provide: Date, time, location of death",
                "3. Provide: Name of deceased person",
                "4. Describe: Circumstances of death",
                "5. Provide: Your name and contact details",
                "6. Secure the scene and preserve evidence",
                "7. Follow up with written notification within 48 hours"
            ]
        else:
            instructions["steps"] = [
                "1. Call WorkSafe: 0800 030 040 OR submit online notification",
                "2. Provide: Date, time, location of incident",
                "3. Provide: Details of injured person (if applicable)",
                "4. Describe: Nature and circumstances of incident",
                "5. Describe: Immediate actions taken",
                "6. Note the reference number provided by WorkSafe"
            ]
        
        return instructions

    def validate_closure_requirements(self):
        """Validate that incident meets all requirements for closure"""
        validation_errors = []
        warnings = []
        
        # WorkSafe notification compliance
        if self.is_notifiable and not self.worksafe_notified:
            validation_errors.append("WorkSafe notification is required before closure")
        
        # Investigation requirements
        if self.investigation_required:
            if self.investigation_status != "completed":
                if self.is_notifiable or self.severity in ["serious", "critical", "fatal"]:
                    validation_errors.append("Investigation must be completed before closure")
                else:
                    warnings.append("Investigation is not completed")
            
            # Check investigation timeline
            if (self.investigation_due_date and 
                not self.investigation_completed_date and
                datetime.now(timezone.utc) > self.investigation_due_date):
                validation_errors.append("Investigation is overdue and must be completed")
        
        # Documentation requirements for serious incidents
        if self.severity in ["serious", "critical", "fatal"] or self.is_notifiable:
            if not self.investigation_findings:
                validation_errors.append("Investigation findings are required for serious incidents")
            
            if not self.corrective_actions_required:
                warnings.append("Corrective actions should be identified for serious incidents")
            
            if not self.lessons_learned:
                warnings.append("Lessons learned should be documented for serious incidents")
        
        # Root cause analysis for serious incidents
        if (self.severity in ["serious", "critical", "fatal"] and 
            not self.root_causes):
            warnings.append("Root cause analysis should be completed for serious incidents")
        
        # Medical treatment follow-up for injuries
        if (self.incident_type == "injury" and 
            self.medical_treatment_required and 
            self.severity in ["moderate", "serious"] and
            not self.time_off_work):
            warnings.append("Consider follow-up on medical treatment status")
        
        # Communication requirements
        if self.communication_required and not self.communication_completed:
            warnings.append("Required communications have not been completed")
        
        return {
            "can_close": len(validation_errors) == 0,
            "validation_errors": validation_errors,
            "warnings": warnings
        }

    def get_compliance_status(self):
        """Get comprehensive compliance status for the incident"""
        status = {
            "overall_compliant": True,
            "worksafe_compliance": self.check_notification_compliance(),
            "investigation_compliance": self.check_investigation_compliance(),
            "documentation_compliance": self.check_documentation_compliance(),
            "closure_validation": self.validate_closure_requirements()
        }
        
        # Overall compliance check
        if not status["worksafe_compliance"]["compliant"]:
            status["overall_compliant"] = False
        
        if not status["investigation_compliance"]["compliant"]:
            status["overall_compliant"] = False
        
        if not status["documentation_compliance"]["compliant"]:
            status["overall_compliant"] = False
        
        return status

    def check_investigation_compliance(self):
        """Check investigation compliance"""
        if not self.investigation_required:
            return {"required": False, "compliant": True}
        
        is_overdue = (self.investigation_due_date and 
                     datetime.now(timezone.utc) > self.investigation_due_date and
                     self.investigation_status != "completed")
        
        return {
            "required": True,
            "compliant": not is_overdue,
            "status": self.investigation_status,
            "overdue": is_overdue,
            "due_date": self.investigation_due_date.isoformat() if self.investigation_due_date else None
        }

    def check_documentation_compliance(self):
        """Check documentation compliance"""
        required_fields = ["incident_description", "incident_date", "location_description"]
        missing_fields = [field for field in required_fields if not getattr(self, field)]
        
        # Additional requirements for serious incidents
        if self.severity in ["serious", "critical", "fatal"] or self.is_notifiable:
            serious_fields = ["immediate_actions_taken"]
            if self.investigation_status == "completed":
                serious_fields.append("investigation_findings")
            
            missing_serious = [field for field in serious_fields if not getattr(self, field)]
            missing_fields.extend(missing_serious)
        
        return {
            "compliant": len(missing_fields) == 0,
            "missing_fields": missing_fields,
            "required_fields": required_fields
        }

# Constants for WorkSafe compliance
WORKSAFE_CONTACT_INFO = {
    "emergency_phone": "0800 030 040",
    "general_phone": "0800 030 040", 
    "online_notifications": "https://worksafe.govt.nz/notifications/",
    "email": "info@worksafe.govt.nz",
    "website": "https://worksafe.govt.nz"
}

NOTIFICATION_DEADLINES = {
    "death": "Immediate (within 1 hour)",
    "serious_injury": "Within 48 hours",
    "dangerous_occurrence": "Within 48 hours"
}

REGULATORY_REFERENCES = {
    "primary_act": "Health and Safety at Work Act 2015",
    "notification_regulations": "Health and Safety at Work (Notifiable Events) Regulations 2016",
    "general_regulations": "Health and Safety at Work (General Risk and Workplace Management) Regulations 2016",
    "worksafe_guidance": "WorkSafe New Zealand Guidance on Notifiable Events"
}