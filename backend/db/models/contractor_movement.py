# db/models/contractor_movement.py - ContractorMovement Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text, Date, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, date, timedelta

class ContractorMovement(Base):
    __tablename__ = "contractor_movements"

    id = Column(Integer, primary_key=True, index=True)
    contractor_id = Column(Integer, ForeignKey("contractors.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Movement details
    arrival_datetime = Column(DateTime(timezone=True), nullable=False)
    departure_datetime = Column(DateTime(timezone=True), nullable=True)
    purpose = Column(String(200), nullable=False)
    
    # Location tracking within property
    blocks_visited = Column(JSON, default=list, nullable=False)  # Block IDs visited
    areas_accessed = Column(JSON, default=list, nullable=False)  # Specific area names/descriptions
    equipment_brought = Column(JSON, default=list, nullable=False)  # Equipment list with details
    
    # Previous location tracking (CRITICAL for biosecurity)
    previous_company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    previous_location_name = Column(String(200), nullable=True)  # If external location (not another vineyard)
    previous_location_type = Column(String(50), nullable=True)  # vineyard, nursery, farm, home, other
    days_since_last_location = Column(Integer, nullable=True)
    last_location_departure = Column(DateTime(timezone=True), nullable=True)
    
    # Biosecurity compliance
    equipment_cleaned = Column(Boolean, default=False, nullable=False)
    cleaning_method = Column(String(200), nullable=True)  # pressure_wash, disinfectant, steam, etc.
    cleaning_products_used = Column(JSON, default=list, nullable=False)  # List of disinfectants used
    cleaning_verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    cleaning_verified_at = Column(DateTime(timezone=True), nullable=True)
    
    # Risk assessment
    biosecurity_risk_level = Column(String(20), default="low", nullable=False)  # low, medium, high, critical
    risk_factors = Column(JSON, default=list, nullable=False)  # Identified risk factors
    risk_mitigation_measures = Column(JSON, default=list, nullable=False)  # Measures taken to reduce risk
    
    # Vehicle and transport
    vehicle_registration = Column(String(20), nullable=True)
    vehicle_cleaned = Column(Boolean, default=False, nullable=False)
    trailer_present = Column(Boolean, default=False, nullable=False)
    trailer_registration = Column(String(20), nullable=True)
    
    # Work performed
    tasks_assigned = Column(JSON, default=list, nullable=False)  # Task IDs assigned during visit
    tasks_completed = Column(JSON, default=list, nullable=False)  # Task IDs completed during visit
    observations_created = Column(JSON, default=list, nullable=False)  # Observation IDs created
    work_summary = Column(Text, nullable=True)
    hours_worked = Column(Numeric(5, 2), nullable=True)
    
    # Environmental conditions
    weather_conditions = Column(String(100), nullable=True)
    temperature_celsius = Column(Numeric(4, 1), nullable=True)
    soil_conditions = Column(String(100), nullable=True)  # dry, wet, muddy, frozen, etc.
    wind_conditions = Column(String(50), nullable=True)  # calm, light, moderate, strong
    
    # Safety and incidents
    safety_briefing_given = Column(Boolean, default=False, nullable=False)
    ppe_provided = Column(JSON, default=list, nullable=False)  # PPE items provided
    incidents_occurred = Column(JSON, default=list, nullable=False)  # Any incidents during visit
    emergency_contacts_updated = Column(Boolean, default=False, nullable=False)
    
    # Check-in/out tracking
    checked_in_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    checked_out_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    check_in_notes = Column(Text, nullable=True)
    check_out_notes = Column(Text, nullable=True)
    
    # Movement status
    status = Column(String(20), default="in_progress", nullable=False)  # in_progress, completed, incomplete
    completion_notes = Column(Text, nullable=True)
    
    # Metadata
    logged_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # Who created the record
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contractor = relationship("Contractor", back_populates="movements")    
    company = relationship(
        "Company", 
        foreign_keys=[company_id],  # Use square brackets for column reference
        back_populates="contractor_movements"
    )
    previous_company = relationship(
        "Company", 
        foreign_keys=[previous_company_id]  # Use square brackets for column reference
    )
    checked_in_by_user = relationship("User", foreign_keys=[checked_in_by])
    checked_out_by_user = relationship("User", foreign_keys=[checked_out_by])
    cleaning_verifier = relationship("User", foreign_keys=[cleaning_verified_by])
    logger = relationship("User", foreign_keys=[logged_by])
    
    def __repr__(self):
        return f"<ContractorMovement(id={self.id}, contractor_id={self.contractor_id}, company_id={self.company_id}, arrival={self.arrival_datetime})>"
    
    @property
    def is_active_visit(self):
        """Check if contractor is currently on site"""
        return self.departure_datetime is None and self.status == "in_progress"
    
    @property
    def visit_duration_hours(self):
        """Calculate visit duration in hours"""
        if not self.arrival_datetime:
            return None
        
        end_time = self.departure_datetime or datetime.now(timezone.utc)
        duration = end_time - self.arrival_datetime
        return round(duration.total_seconds() / 3600, 2)
    
    @property
    def visit_duration_minutes(self):
        """Calculate visit duration in minutes"""
        if not self.arrival_datetime:
            return None
        
        end_time = self.departure_datetime or datetime.now(timezone.utc)
        duration = end_time - self.arrival_datetime
        return int(duration.total_seconds() / 60)
    
    @property
    def biosecurity_compliance_score(self):
        """Calculate biosecurity compliance score (0-100)"""
        score = 0
        max_score = 100
        
        # Equipment cleaning (30 points)
        if self.equipment_cleaned:
            score += 20
            if self.cleaning_verified_by:
                score += 10
        
        # Previous location tracking (20 points)
        if self.days_since_last_location is not None:
            score += 10
            if self.days_since_last_location >= 1:  # At least 1 day gap
                score += 10
        
        # Vehicle cleaning (15 points)
        if self.vehicle_cleaned:
            score += 15
        
        # Risk assessment (15 points)
        if self.biosecurity_risk_level == "low":
            score += 15
        elif self.biosecurity_risk_level == "medium":
            score += 10
        elif self.biosecurity_risk_level == "high":
            score += 5
        
        # Risk mitigation (10 points)
        if self.risk_mitigation_measures:
            score += 10
        
        # Safety compliance (10 points)
        if self.safety_briefing_given:
            score += 5
        if self.ppe_provided:
            score += 5
        
        return min(score, max_score)
    
    @property
    def time_since_last_location_hours(self):
        """Get hours since departure from last location"""
        if not self.last_location_departure:
            return None
        
        time_diff = self.arrival_datetime - self.last_location_departure
        return round(time_diff.total_seconds() / 3600, 1)
    
    @property
    def is_biosecurity_compliant(self):
        """Check if movement meets basic biosecurity requirements"""
        # Equipment must be cleaned
        if not self.equipment_cleaned:
            return False
        
        # High-risk movements need verification
        if self.biosecurity_risk_level in ["high", "critical"] and not self.cleaning_verified_by:
            return False
        
        # Must have some gap between properties (if coming from another vineyard)
        if (self.previous_company_id and 
            self.days_since_last_location is not None and 
            self.days_since_last_location < 1 and 
            self.biosecurity_risk_level in ["medium", "high", "critical"]):
            return False
        
        return True
    
    def check_out(self, checked_out_by_user_id: int, notes: str = None):
        """Check contractor out of the property"""
        self.departure_datetime = datetime.now(timezone.utc)
        self.checked_out_by = checked_out_by_user_id
        self.check_out_notes = notes
        self.status = "completed"
        
        # Update hours worked if not already set
        if not self.hours_worked:
            self.hours_worked = self.visit_duration_hours
    
    def add_task(self, task_id: int, completed: bool = False):
        """Add a task to the movement record"""
        if self.tasks_assigned is None:
            self.tasks_assigned = []
        if self.tasks_completed is None:
            self.tasks_completed = []
        
        if task_id not in self.tasks_assigned:
            self.tasks_assigned.append(task_id)
        
        if completed and task_id not in self.tasks_completed:
            self.tasks_completed.append(task_id)
    
    def add_observation(self, observation_id: int):
        """Add an observation to the movement record"""
        if self.observations_created is None:
            self.observations_created = []
        
        if observation_id not in self.observations_created:
            self.observations_created.append(observation_id)
    
    def verify_equipment_cleaning(self, verified_by_user_id: int, cleaning_method: str = None, products_used: list = None):
        """Verify that equipment cleaning has been completed"""
        self.equipment_cleaned = True
        self.cleaning_verified_by = verified_by_user_id
        self.cleaning_verified_at = datetime.now(timezone.utc)
        
        if cleaning_method:
            self.cleaning_method = cleaning_method
        
        if products_used:
            self.cleaning_products_used = products_used
    
    def assess_biosecurity_risk(self):
        """Automatically assess biosecurity risk based on movement data"""
        risk_score = 0
        risk_factors = []
        
        # Previous location risk
        if self.previous_company_id:  # Coming from another vineyard
            risk_score += 3
            risk_factors.append("previous_vineyard_visit")
            
            if self.days_since_last_location is not None and self.days_since_last_location < 1:
                risk_score += 2
                risk_factors.append("same_day_multiple_properties")
        
        # Equipment risk
        if not self.equipment_cleaned:
            risk_score += 3
            risk_factors.append("uncleaned_equipment")
        
        # Weather conditions that increase risk
        if self.soil_conditions in ["wet", "muddy"]:
            risk_score += 1
            risk_factors.append("wet_soil_conditions")
        
        # Distance and type of previous location
        if self.previous_location_type in ["nursery", "farm"]:
            risk_score += 2
            risk_factors.append("high_risk_previous_location")
        
        # Contractor's general risk level
        if hasattr(self, 'contractor') and self.contractor:
            contractor_risk = self.contractor.biosecurity_risk_level
            if contractor_risk == "high":
                risk_score += 2
                risk_factors.append("high_risk_contractor")
            elif contractor_risk == "medium":
                risk_score += 1
                risk_factors.append("medium_risk_contractor")
        
        # Determine risk level
        if risk_score >= 7:
            self.biosecurity_risk_level = "critical"
        elif risk_score >= 5:
            self.biosecurity_risk_level = "high"
        elif risk_score >= 3:
            self.biosecurity_risk_level = "medium"
        else:
            self.biosecurity_risk_level = "low"
        
        self.risk_factors = risk_factors
        
        return self.biosecurity_risk_level
    
    def add_incident(self, incident_type: str, description: str, severity: str = "low"):
        """Add an incident to the movement record"""
        if self.incidents_occurred is None:
            self.incidents_occurred = []
        
        incident = {
            "type": incident_type,
            "description": description,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "resolved": False
        }
        
        self.incidents_occurred.append(incident)
    
    def get_blocks_visited_names(self, db_session):
        """Get the names of blocks visited (requires database session)"""
        if not self.blocks_visited:
            return []
        
        from db.models.block import VineyardBlock
        blocks = db_session.query(VineyardBlock).filter(
            VineyardBlock.id.in_(self.blocks_visited)
        ).all()
        
        return [block.name for block in blocks]
    
    def calculate_travel_time_from_previous(self):
        """Calculate travel time from previous location"""
        if not self.last_location_departure or not self.arrival_datetime:
            return None
        
        travel_time = self.arrival_datetime - self.last_location_departure
        return travel_time.total_seconds() / 3600  # Return hours