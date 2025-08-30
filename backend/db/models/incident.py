from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from db.base_class import Base
from api.deps import get_db, get_current_user

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    
    # Incident identification
    incident_number = Column(String(50), unique=False, nullable=False)  # Auto-generated
    incident_title = Column(String(200), nullable=False)
    incident_description = Column(Text, nullable=False)
    
    # Incident classification
    incident_type = Column(String(50), nullable=False)  # injury, near_miss, property_damage, environmental, security
    severity = Column(String(30), nullable=False)  # minor, moderate, serious, critical, fatal
    category = Column(String(50), nullable=False)  # slip_trip_fall, chemical_exposure, equipment, etc.
    
    # NZ H&S specific fields
    is_notifiable = Column(Boolean, default=False, nullable=False)  # WorkSafe NZ notification required
    notifiable_type = Column(String(50), nullable=True)  # death, serious_injury, dangerous_occurrence
    worksafe_notified = Column(Boolean, default=False, nullable=False)
    worksafe_notification_date = Column(DateTime(timezone=True), nullable=True)
    worksafe_reference = Column(String(100), nullable=True)
    
    # Incident details
    incident_date = Column(DateTime(timezone=True), nullable=False)
    discovered_date = Column(DateTime(timezone=True), nullable=True)  # When discovered (if different)
    location_description = Column(String(500), nullable=False)
    location = Column(Geometry(geometry_type='POINT', srid=4326), nullable=True)  # GPS coordinates
    
    # People involved
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    injured_person_name = Column(String(200), nullable=True)  # May not be a system user
    injured_person_role = Column(String(100), nullable=True)
    injured_person_company = Column(String(200), nullable=True)  # For contractors
    witness_details = Column(Text, nullable=True)
    
    # Injury/damage details
    injury_type = Column(String(100), nullable=True)  # cut, bruise, fracture, etc.
    body_part_affected = Column(String(100), nullable=True)
    medical_treatment_required = Column(Boolean, default=False, nullable=False)
    medical_provider = Column(String(200), nullable=True)
    time_off_work = Column(Boolean, default=False, nullable=False)
    estimated_time_off_days = Column(Integer, nullable=True)
    
    property_damage_cost = Column(Numeric(10, 2), nullable=True)
    environmental_impact = Column(Text, nullable=True)
    
    # Investigation
    investigation_required = Column(Boolean, default=True, nullable=False)
    investigation_status = Column(String(30), default="pending", nullable=False)  # pending, in_progress, completed
    investigator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    investigation_due_date = Column(DateTime(timezone=True), nullable=True)
    investigation_completed_date = Column(DateTime(timezone=True), nullable=True)
    investigation_findings = Column(Text, nullable=True)
    
    # Root cause analysis
    immediate_causes = Column(JSON, default=list, nullable=False)  # List of immediate causes
    root_causes = Column(JSON, default=list, nullable=False)  # List of root causes
    contributing_factors = Column(JSON, default=list, nullable=False)
    
    # Risk linkage
    related_risk_id = Column(Integer, ForeignKey("site_risks.id"), nullable=True)  # Link to existing risk
    new_risk_created = Column(Boolean, default=False, nullable=False)  # If new risk was created
    
    # Corrective actions
    immediate_actions_taken = Column(Text, nullable=True)
    corrective_actions_required = Column(Text, nullable=True)
    
    # Status and workflow
    status = Column(String(30), default="open", nullable=False)  # open, investigating, awaiting_actions, closed
    closed_date = Column(DateTime(timezone=True), nullable=True)
    closed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    closure_reason = Column(Text, nullable=True)
    
    # Follow-up and lessons learned
    lessons_learned = Column(Text, nullable=True)
    communication_required = Column(Boolean, default=False, nullable=False)
    communication_completed = Column(Boolean, default=False, nullable=False)
    
    # File attachments and evidence
    evidence_collected = Column(Boolean, default=False, nullable=False)
    photos_taken = Column(Boolean, default=False, nullable=False)
    
    # Review and approval
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_date = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_date = Column(DateTime(timezone=True), nullable=True)
    
    # Additional metadata
    custom_fields = Column(JSON, default=dict, nullable=False)
    tags = Column(JSON, default=list, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    
    # Relationships
    company = relationship("Company", back_populates="incidents")
    reporter = relationship("User", foreign_keys=[reported_by], back_populates="reported_incidents")
    investigator = relationship("User", foreign_keys=[investigator_id], back_populates="investigated_incidents")
    closer = relationship("User", foreign_keys=[closed_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    approver = relationship("User", foreign_keys=[approved_by])
    related_risk = relationship("SiteRisk", back_populates="incidents")
    files = relationship(
        "File",
        primaryjoin="and_(Incident.id == foreign(remote(File.entity_id)), "
                   "File.entity_type == 'incident')",
        cascade="all, delete-orphan"
    )
    # corrective_actions = relationship("RiskAction", back_populates="incident")
    
    def __repr__(self):
        return f"<Incident(id={self.id}, number='{self.incident_number}', type='{self.incident_type}')>"
    
    @property
    def is_overdue_investigation(self):
        """Check if investigation is overdue"""
        if (self.investigation_required and 
            self.investigation_status != "completed" and 
            self.investigation_due_date):
            from datetime import datetime, timezone
            return datetime.now(timezone.utc) > self.investigation_due_date
        return False
    
    @property
    def requires_worksafe_notification(self):
        """Check if this incident requires WorkSafe NZ notification"""
        return self.is_notifiable and not self.worksafe_notified
    
    @property
    def is_serious_incident(self):
        """Check if this is a serious incident (for prioritization)"""
        return (self.severity in ["serious", "critical", "fatal"] or 
                self.is_notifiable or 
                self.medical_treatment_required)
    
    @property
    def days_since_incident(self):
        """Calculate days since the incident occurred"""
        from datetime import datetime, timezone
        delta = datetime.now(timezone.utc) - self.incident_date
        return delta.days
    
    @property
    def investigation_days_remaining(self):
        """Calculate days remaining for investigation"""
        if not self.investigation_due_date:
            return None
        from datetime import datetime, timezone
        delta = self.investigation_due_date - datetime.now(timezone.utc)
        return delta.days
    
    def generate_incident_number(self):
        """Generate unique incident number"""
        from datetime import datetime
        year = datetime.now().year
        current_user: User = Depends(get_current_user)
        # This would typically query the database for the next sequence number
        # For now, using a simple format: INC-YYYY-NNNN
        return f"INC-{current_year}-{current_user.company_id}-{self.id:04d}"
    
    def determine_notifiability(self):
        """Determine if incident is notifiable to WorkSafe NZ"""
        # NZ-specific notifiable event criteria
        notifiable_conditions = [
            # Death
            self.severity == "fatal",
            
            # Serious injury requiring immediate treatment
            (self.severity in ["serious", "critical"] and self.medical_treatment_required),
            
            # Specific injury types that are notifiable
            self.injury_type in [
                "fracture", "amputation", "serious_burns", "loss_of_consciousness",
                "serious_laceration", "eye_injury", "spinal_injury"
            ],
            
            # Dangerous occurrences
            self.incident_type == "dangerous_occurrence",
            
            # Environmental incidents
            (self.incident_type == "environmental" and self.environmental_impact),
            
            # Property damage over threshold (example: $10,000)
            (self.property_damage_cost and float(self.property_damage_cost) >= 10000)
        ]
        
        self.is_notifiable = any(notifiable_conditions)
        
        # Set notifiable type
        if self.severity == "fatal":
            self.notifiable_type = "death"
        elif self.severity in ["serious", "critical"] or self.medical_treatment_required:
            self.notifiable_type = "serious_injury"
        elif self.incident_type == "dangerous_occurrence":
            self.notifiable_type = "dangerous_occurrence"
    
    def set_investigation_due_date(self):
        """Set investigation due date based on severity"""
        from datetime import datetime, timezone, timedelta
        
        if self.severity == "fatal":
            # Immediate investigation required
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(hours=24)
        elif self.severity in ["serious", "critical"] or self.is_notifiable:
            # 48 hours for serious incidents
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(hours=48)
        elif self.severity == "moderate":
            # 7 days for moderate incidents
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(days=7)
        else:
            # 14 days for minor incidents
            self.investigation_due_date = datetime.now(timezone.utc) + timedelta(days=14)
    
    def mark_worksafe_notified(self, reference_number: str = None):
        """Mark as notified to WorkSafe NZ"""
        from datetime import datetime, timezone
        self.worksafe_notified = True
        self.worksafe_notification_date = datetime.now(timezone.utc)
        if reference_number:
            self.worksafe_reference = reference_number
    
    def close_incident(self, closed_by_id: int, closure_reason: str):
        """Close the incident"""
        from datetime import datetime, timezone
        self.status = "closed"
        self.closed_date = datetime.now(timezone.utc)
        self.closed_by = closed_by_id
        self.closure_reason = closure_reason