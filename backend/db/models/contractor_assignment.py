# db/models/contractor_assignment.py - ContractorAssignment Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text, Date, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, date, timedelta

class ContractorAssignment(Base):
    __tablename__ = "contractor_assignments"

    id = Column(Integer, primary_key=True, index=True)
    contractor_id = Column(Integer, ForeignKey("contractors.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)  # Optional - for specific tasks
    
    # Assignment details
    assignment_type = Column(String(30), nullable=False, default="specific_task")  # specific_task, general_work, consultation, maintenance
    work_description = Column(Text, nullable=False)
    priority = Column(String(20), default="medium", nullable=False)  # low, medium, high, urgent
    
    # Estimation
    estimated_hours = Column(Numeric(5, 2), nullable=True)
    estimated_cost = Column(Numeric(10, 2), nullable=True)
    estimated_completion_date = Column(Date, nullable=True)
    
    # Scheduling
    scheduled_start = Column(DateTime(timezone=True), nullable=True)
    scheduled_end = Column(DateTime(timezone=True), nullable=True)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    
    # Location and scope
    blocks_involved = Column(JSON, default=list, nullable=False)  # Block IDs where work will be done
    areas_involved = Column(JSON, default=list, nullable=False)  # Specific areas within blocks
    work_scope = Column(Text, nullable=True)  # Detailed scope description
    
    # Requirements and constraints
    required_certifications = Column(JSON, default=list, nullable=False)  # Training/cert IDs required
    required_equipment = Column(JSON, default=list, nullable=False)  # Equipment needed
    required_weather_conditions = Column(JSON, default=list, nullable=False)  # Weather requirements
    special_instructions = Column(Text, nullable=True)
    safety_requirements = Column(JSON, default=list, nullable=False)  # Special safety needs
    
    # Status tracking
    status = Column(String(20), default="assigned", nullable=False)  
    # assigned, accepted, in_progress, paused, completed, cancelled, rejected
    completion_percentage = Column(Integer, default=0, nullable=False)
    quality_check_required = Column(Boolean, default=False, nullable=False)
    quality_check_completed = Column(Boolean, default=False, nullable=False)
    
    # Results and performance
    actual_hours_worked = Column(Numeric(5, 2), nullable=True)
    actual_cost = Column(Numeric(10, 2), nullable=True)
    materials_used = Column(JSON, default=list, nullable=False)  # Materials consumed
    quality_rating = Column(Integer, nullable=True)  # 1-5 stars
    client_satisfaction = Column(Integer, nullable=True)  # 1-5 stars
    work_notes = Column(Text, nullable=True)
    completion_photos = Column(JSON, default=list, nullable=False)  # Photo file paths
    
    # Weather and conditions during work
    weather_during_work = Column(JSON, default=dict, nullable=False)  # Weather log
    soil_conditions_during_work = Column(String(100), nullable=True)
    
    # Issues and delays
    issues_encountered = Column(JSON, default=list, nullable=False)  # Problems during work
    delays_encountered = Column(JSON, default=list, nullable=False)  # Delays and reasons
    change_requests = Column(JSON, default=list, nullable=False)  # Scope changes
    
    # Financial tracking
    rate_type = Column(String(20), nullable=True)  # hourly, daily, fixed_price
    agreed_rate = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), default="NZD", nullable=False)
    invoice_required = Column(Boolean, default=True, nullable=False)
    invoice_generated = Column(Boolean, default=False, nullable=False)
    payment_status = Column(String(20), default="pending", nullable=False)  # pending, paid, overdue
    
    # Recurring assignment info
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_pattern = Column(String(50), nullable=True)  # weekly, monthly, seasonal, annual
    next_occurrence = Column(Date, nullable=True)
    parent_assignment_id = Column(Integer, ForeignKey("contractor_assignments.id"), nullable=True)
    
    # Approval workflow
    requires_approval = Column(Boolean, default=False, nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    
    # Metadata
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who marked it complete
    cancelled_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contractor = relationship("Contractor", back_populates="assignments")
    company = relationship("Company", back_populates="contractor_assignments")
    task = relationship("Task", back_populates="contractor_assignments")
    assigner = relationship("User", foreign_keys=[assigned_by])
    completer = relationship("User", foreign_keys=[completed_by])
    approver = relationship("User", foreign_keys=[approved_by])
    canceller = relationship("User", foreign_keys=[cancelled_by])
    files = relationship(
        "File",
        primaryjoin="and_(ContractorAssignment.id == foreign(remote(File.entity_id)), "
                   "File.entity_type == 'contractor_assignment')",
        cascade="all, delete-orphan"
    )

    # Self-referential for recurring assignments
    parent_assignment = relationship("ContractorAssignment", remote_side=[id])
    child_assignments = relationship("ContractorAssignment", back_populates="parent_assignment")
    
    def __repr__(self):
        return f"<ContractorAssignment(id={self.id}, contractor_id={self.contractor_id}, status='{self.status}', type='{self.assignment_type}')>"
    
    @property
    def is_active(self):
        """Check if assignment is currently active"""
        return self.status in ["assigned", "accepted", "in_progress", "paused"]
    
    @property
    def is_overdue(self):
        """Check if assignment is overdue"""
        if not self.scheduled_end or self.status in ["completed", "cancelled"]:
            return False
        return datetime.now(timezone.utc) > self.scheduled_end
    
    @property
    def days_overdue(self):
        """Get number of days overdue"""
        if not self.is_overdue:
            return 0
        delta = datetime.now(timezone.utc) - self.scheduled_end
        return delta.days
    
    @property
    def scheduled_duration_hours(self):
        """Get scheduled duration in hours"""
        if not self.scheduled_start or not self.scheduled_end:
            return None
        delta = self.scheduled_end - self.scheduled_start
        return round(delta.total_seconds() / 3600, 2)
    
    @property
    def actual_duration_hours(self):
        """Get actual duration in hours"""
        if not self.actual_start:
            return None
        
        end_time = self.actual_end or datetime.now(timezone.utc)
        delta = end_time - self.actual_start
        return round(delta.total_seconds() / 3600, 2)
    
    @property
    def cost_variance(self):
        """Get cost variance (actual vs estimated)"""
        if not self.estimated_cost or not self.actual_cost:
            return None
        return float(self.actual_cost) - float(self.estimated_cost)
    
    @property
    def time_variance_hours(self):
        """Get time variance in hours (actual vs estimated)"""
        if not self.estimated_hours or not self.actual_hours_worked:
            return None
        return float(self.actual_hours_worked) - float(self.estimated_hours)
    
    @property
    def efficiency_rating(self):
        """Calculate efficiency rating based on time and cost performance"""
        time_efficiency = 100  # Default if no data
        cost_efficiency = 100  # Default if no data
        
        # Time efficiency (100% = on time, >100% = ahead of schedule)
        if self.estimated_hours and self.actual_hours_worked:
            time_efficiency = (float(self.estimated_hours) / float(self.actual_hours_worked)) * 100
        
        # Cost efficiency (100% = on budget, >100% = under budget)
        if self.estimated_cost and self.actual_cost:
            cost_efficiency = (float(self.estimated_cost) / float(self.actual_cost)) * 100
        
        # Overall efficiency (average of time and cost)
        return round((time_efficiency + cost_efficiency) / 2, 1)
    
    def start_work(self, started_by_user_id: int = None):
        """Mark assignment as started"""
        if self.status in ["assigned", "accepted"]:
            self.status = "in_progress"
            self.actual_start = datetime.now(timezone.utc)
            if started_by_user_id:
                # Could add a started_by field if needed
                pass
    
    def complete_assignment(self, completed_by_user_id: int, hours_worked: float = None, 
                          cost: float = None, notes: str = None, quality_rating: int = None):
        """Mark assignment as completed"""
        self.status = "completed"
        self.actual_end = datetime.now(timezone.utc)
        self.completed_by = completed_by_user_id
        self.completion_percentage = 100
        
        if hours_worked:
            self.actual_hours_worked = hours_worked
        elif not self.actual_hours_worked and self.actual_start:
            # Auto-calculate if not provided
            self.actual_hours_worked = self.actual_duration_hours
        
        if cost:
            self.actual_cost = cost
        
        if notes:
            self.work_notes = notes
        
        if quality_rating:
            self.quality_rating = quality_rating
    
    def cancel_assignment(self, cancelled_by_user_id: int, reason: str = None):
        """Cancel the assignment"""
        self.status = "cancelled"
        self.cancelled_by = cancelled_by_user_id
        self.cancellation_reason = reason
        if not self.actual_end:
            self.actual_end = datetime.now(timezone.utc)
    
    def pause_assignment(self, reason: str = None):
        """Pause an in-progress assignment"""
        if self.status == "in_progress":
            self.status = "paused"
            if reason:
                self.add_issue("work_paused", reason, "low")
    
    def resume_assignment(self):
        """Resume a paused assignment"""
        if self.status == "paused":
            self.status = "in_progress"
    
    def add_issue(self, issue_type: str, description: str, severity: str = "medium"):
        """Add an issue encountered during work"""
        if self.issues_encountered is None:
            self.issues_encountered = []
        
        issue = {
            "type": issue_type,
            "description": description,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "resolved": False
        }
        
        self.issues_encountered.append(issue)
    
    def add_delay(self, delay_type: str, reason: str, hours_delayed: float = None):
        """Add a delay to the assignment"""
        if self.delays_encountered is None:
            self.delays_encountered = []
        
        delay = {
            "type": delay_type,
            "reason": reason,
            "hours_delayed": hours_delayed,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        self.delays_encountered.append(delay)
    
    def add_change_request(self, change_type: str, description: str, approved: bool = False):
        """Add a scope change request"""
        if self.change_requests is None:
            self.change_requests = []
        
        change = {
            "type": change_type,
            "description": description,
            "approved": approved,
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "approved_at": None
        }
        
        self.change_requests.append(change)
    
    def update_progress(self, percentage: int, notes: str = None):
        """Update completion percentage"""
        self.completion_percentage = max(0, min(100, percentage))
        if notes and self.work_notes:
            self.work_notes += f"\n{datetime.now().strftime('%Y-%m-%d %H:%M')}: {notes}"
        elif notes:
            self.work_notes = notes
    
    def approve_assignment(self, approved_by_user_id: int):
        """Approve the assignment"""
        self.approved_by = approved_by_user_id
        self.approved_at = datetime.now(timezone.utc)
        if self.status == "assigned":
            # Could auto-transition to accepted if contractor auto-accepts approved work
            pass
    
    def reject_assignment(self, reason: str = None):
        """Reject the assignment"""
        self.status = "rejected"
        self.rejection_reason = reason
    
    def get_required_training_status(self, contractor_training_records):
        """Check if contractor has required training"""
        if not self.required_certifications:
            return {"compliant": True, "missing": []}
        
        completed_training = {record.training_module_id for record in contractor_training_records 
                            if record.status == "completed"}
        required_training = set(self.required_certifications)
        missing_training = required_training - completed_training
        
        return {
            "compliant": len(missing_training) == 0,
            "missing": list(missing_training),
            "completed": list(completed_training & required_training)
        }
    
    def calculate_payment_amount(self):
        """Calculate payment amount based on rate type and actual work"""
        if not self.agreed_rate:
            return 0.0
        
        rate = float(self.agreed_rate)
        
        if self.rate_type == "hourly" and self.actual_hours_worked:
            return rate * float(self.actual_hours_worked)
        elif self.rate_type == "daily" and self.actual_hours_worked:
            days_worked = float(self.actual_hours_worked) / 8  # Assume 8-hour days
            return rate * days_worked
        elif self.rate_type == "fixed_price":
            return rate
        else:
            return 0.0
    
    def create_next_occurrence(self):
        """Create next occurrence for recurring assignments"""
        if not self.is_recurring or not self.recurrence_pattern:
            return None
        
        # Calculate next occurrence date based on pattern
        next_date = None
        if self.recurrence_pattern == "weekly":
            next_date = (self.scheduled_start or datetime.now(timezone.utc)) + timedelta(weeks=1)
        elif self.recurrence_pattern == "monthly":
            next_date = (self.scheduled_start or datetime.now(timezone.utc)) + timedelta(days=30)
        elif self.recurrence_pattern == "seasonal":
            next_date = (self.scheduled_start or datetime.now(timezone.utc)) + timedelta(days=90)
        elif self.recurrence_pattern == "annual":
            next_date = (self.scheduled_start or datetime.now(timezone.utc)) + timedelta(days=365)
        
        if next_date:
            self.next_occurrence = next_date.date()
            return next_date
        
        return None