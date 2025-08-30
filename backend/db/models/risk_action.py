from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Numeric, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from db.base_class import Base

class RiskAction(Base):
    __tablename__ = "risk_actions"

    id = Column(Integer, primary_key=True, index=True)
    risk_id = Column(Integer, ForeignKey("site_risks.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    
    # Action details
    action_title = Column(String(200), nullable=False)
    action_description = Column(Text, nullable=False)
    action_type = Column(String(50), nullable=False)  # preventive, detective, corrective, mitigative
    control_type = Column(String(50), nullable=False)  # engineering, administrative, ppe, elimination, substitution
    
    # Priority and urgency
    priority = Column(String(20), nullable=False, default="medium")  # low, medium, high, critical
    urgency = Column(String(20), nullable=False, default="medium")   # low, medium, high, urgent
    
    # Assignment and responsibility
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    responsible_person = Column(Integer, ForeignKey("users.id"), nullable=True)  # Overall responsible person
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Status and lifecycle
    status = Column(String(30), default="planned", nullable=False)  # planned, in_progress, completed, cancelled, overdue
    
    # Dates and scheduling
    target_start_date = Column(DateTime(timezone=True), nullable=True)
    target_completion_date = Column(DateTime(timezone=True), nullable=True)
    actual_start_date = Column(DateTime(timezone=True), nullable=True)
    actual_completion_date = Column(DateTime(timezone=True), nullable=True)
    
    # Cost and resources
    estimated_cost = Column(Numeric(10, 2), nullable=True)
    actual_cost = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), default="NZD", nullable=False)
    
    # Progress tracking
    progress_percentage = Column(Integer, default=0, nullable=False)  # 0-100
    completion_notes = Column(Text, nullable=True)
    
    # Effectiveness tracking
    effectiveness_rating = Column(Integer, nullable=True)  # 1-5 after implementation
    effectiveness_notes = Column(Text, nullable=True)
    effectiveness_reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    effectiveness_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Risk reduction expectations
    expected_likelihood_reduction = Column(Integer, nullable=True)  # Expected reduction in likelihood (1-5)
    expected_severity_reduction = Column(Integer, nullable=True)    # Expected reduction in severity (1-5)
    
    # Integration with task system
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)  # Auto-created task
    auto_create_task = Column(Boolean, default=True, nullable=False)  # Whether to auto-create task
    
    # Review and monitoring
    requires_verification = Column(Boolean, default=False, nullable=False)
    verification_completed = Column(Boolean, default=False, nullable=False)
    verification_date = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    verification_notes = Column(Text, nullable=True)
    
    # Recurring action management
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_frequency_days = Column(Integer, nullable=True)  # How often to repeat
    next_due_date = Column(DateTime(timezone=True), nullable=True)
    parent_action_id = Column(Integer, ForeignKey("risk_actions.id"), nullable=True)  # For recurring actions
    
    # Additional metadata
    custom_fields = Column(JSON, default=dict, nullable=False)
    tags = Column(JSON, default=list, nullable=False)  # For categorization/filtering
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    archived_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    risk = relationship("SiteRisk", back_populates="risk_actions")
    company = relationship("Company", back_populates="risk_actions")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_risk_actions")
    responsible = relationship("User", foreign_keys=[responsible_person], back_populates="responsible_risk_actions")
    creator = relationship("User", foreign_keys=[created_by], back_populates="created_risk_actions")
    task = relationship("Task", back_populates="risk_action", uselist=False)
    effectiveness_reviewer = relationship("User", foreign_keys=[effectiveness_reviewed_by])
    verifier = relationship("User", foreign_keys=[verified_by])
    
    # Self-referential for recurring actions
    child_actions = relationship("RiskAction", remote_side=[parent_action_id], back_populates="parent_action")
    parent_action = relationship("RiskAction", remote_side=[id], back_populates="child_actions")
    
    def __repr__(self):
        return f"<RiskAction(id={self.id}, title='{self.action_title}', status='{self.status}')>"
    
    @property
    def is_overdue(self):
        """Check if action is overdue"""
        if not self.target_completion_date or self.status in ["completed", "cancelled"]:
            return False
        from datetime import datetime, timezone
        return datetime.now(timezone.utc) > self.target_completion_date
    
    @property
    def days_until_due(self):
        """Get days until target completion (negative if overdue)"""
        if not self.target_completion_date:
            return None
        from datetime import datetime, timezone
        delta = self.target_completion_date - datetime.now(timezone.utc)
        return delta.days
    
    @property
    def is_completed(self):
        """Check if action is completed"""
        return self.status == "completed" and self.actual_completion_date is not None
    
    @property
    def requires_task(self):
        """Check if this action should have an associated task"""
        return (self.auto_create_task and 
                self.status not in ["completed", "cancelled"] and
                self.assigned_to is not None)
    
    @property
    def duration_days(self):
        """Calculate actual duration in days"""
        if self.actual_start_date and self.actual_completion_date:
            delta = self.actual_completion_date - self.actual_start_date
            return delta.days
        return None
    
    @property
    def cost_variance(self):
        """Calculate cost variance (actual - estimated)"""
        if self.estimated_cost and self.actual_cost:
            return float(self.actual_cost - self.estimated_cost)
        return None
    
    @property
    def is_high_priority(self):
        """Check if this is a high priority action"""
        return self.priority in ["high", "critical"] or self.urgency in ["high", "urgent"]
    
    def mark_completed(self, completed_by_id: int, completion_notes: str = None):
        """Mark action as completed"""
        from datetime import datetime, timezone
        self.status = "completed"
        self.actual_completion_date = datetime.now(timezone.utc)
        self.progress_percentage = 100
        if completion_notes:
            self.completion_notes = completion_notes
        
        # If no start date was set, assume it started when assigned
        if not self.actual_start_date and self.assigned_to:
            self.actual_start_date = self.created_at
    
    def mark_in_progress(self, started_by_id: int):
        """Mark action as in progress"""
        from datetime import datetime, timezone
        if self.status == "planned":
            self.status = "in_progress"
            self.actual_start_date = datetime.now(timezone.utc)
    
    def update_progress(self, percentage: int, notes: str = None):
        """Update progress percentage"""
        if 0 <= percentage <= 100:
            self.progress_percentage = percentage
            if notes:
                self.completion_notes = notes
            
            # Auto-complete if 100%
            if percentage == 100 and self.status != "completed":
                self.status = "completed"
                if not self.actual_completion_date:
                    from datetime import datetime, timezone
                    self.actual_completion_date = datetime.now(timezone.utc)
    
    def calculate_effectiveness(self, new_likelihood: int, new_severity: int):
        """Calculate effectiveness based on actual risk reduction"""
        if not (self.expected_likelihood_reduction or self.expected_severity_reduction):
            return None
        
        # Compare expected vs actual reduction
        # This would need the original risk values to calculate properly
        # Implementation depends on how you want to measure effectiveness
        pass
    
    def schedule_next_occurrence(self):
        """Schedule next occurrence for recurring actions"""
        if self.is_recurring and self.recurrence_frequency_days and self.is_completed:
            from datetime import datetime, timezone, timedelta
            self.next_due_date = datetime.now(timezone.utc) + timedelta(days=self.recurrence_frequency_days)
    
    def create_recurring_action(self):
        """Create the next occurrence of a recurring action"""
        if not (self.is_recurring and self.next_due_date):
            return None
        
        from datetime import datetime, timezone, timedelta
        
        # Create new action based on this one
        new_action = RiskAction(
            risk_id=self.risk_id,
            company_id=self.company_id,
            action_title=f"{self.action_title} (Recurring)",
            action_description=self.action_description,
            action_type=self.action_type,
            control_type=self.control_type,
            priority=self.priority,
            urgency=self.urgency,
            assigned_to=self.assigned_to,
            responsible_person=self.responsible_person,
            created_by=self.created_by,
            target_start_date=self.next_due_date,
            target_completion_date=self.next_due_date + timedelta(days=7),  # Default 1 week to complete
            auto_create_task=self.auto_create_task,
            requires_verification=self.requires_verification,
            is_recurring=True,
            recurrence_frequency_days=self.recurrence_frequency_days,
            parent_action_id=self.id,
            custom_fields=self.custom_fields,
            tags=self.tags
        )
        
        return new_action