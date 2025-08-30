# db/models/contractor_relationship.py - ContractorRelationship Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Date, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, date

class ContractorRelationship(Base):
    __tablename__ = "contractor_relationships"

    id = Column(Integer, primary_key=True, index=True)
    contractor_id = Column(Integer, ForeignKey("contractors.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Relationship details
    relationship_type = Column(String(30), default="contractor", nullable=False)  # contractor, preferred_contractor, blacklisted
    status = Column(String(20), default="active", nullable=False)  # active, inactive, suspended, terminated
    
    # Contract terms
    hourly_rate = Column(Numeric(10, 2), nullable=True)
    daily_rate = Column(Numeric(10, 2), nullable=True)
    preferred_payment_terms = Column(String(50), nullable=True)  # weekly, monthly, per_job
    currency = Column(String(3), default="NZD", nullable=False)
    
    # Access and permissions
    blocks_access = Column(JSON, default=list, nullable=False)  # Specific block IDs they can access (empty = all blocks)
    areas_restricted = Column(JSON, default=list, nullable=False)  # Areas they cannot access
    can_create_observations = Column(Boolean, default=True, nullable=False)
    can_update_tasks = Column(Boolean, default=True, nullable=False)
    requires_supervision = Column(Boolean, default=False, nullable=False)
    
    # Contract period
    contract_start = Column(Date, nullable=True)
    contract_end = Column(Date, nullable=True)
    auto_renew = Column(Boolean, default=False, nullable=False)
    
    # Performance for this company
    jobs_completed_for_company = Column(Integer, default=0, nullable=False)
    company_rating = Column(Numeric(3, 2), default=0.0, nullable=False)  # Average rating from this company
    last_worked_date = Column(Date, nullable=True)
    total_hours_worked = Column(Numeric(8, 2), default=0.0, nullable=False)
    total_amount_paid = Column(Numeric(12, 2), default=0.0, nullable=False)
    
    # Emergency contact override (if different from contractor's main contact)
    emergency_contact_name = Column(String(100), nullable=True)
    emergency_contact_phone = Column(String(20), nullable=True)
    
    # Work preferences and notes
    preferred_work_types = Column(JSON, default=list, nullable=False)  # What they prefer to do for this company
    work_restrictions = Column(JSON, default=list, nullable=False)  # What they cannot/will not do
    company_notes = Column(String(1000), nullable=True)  # Private notes about this contractor
    contractor_notes = Column(String(1000), nullable=True)  # Notes from contractor about working with this company
    
    # Training and compliance for this company
    required_training_modules = Column(JSON, default=list, nullable=False)  # Company-specific training requirements
    completed_training_modules = Column(JSON, default=list, nullable=False)  # Completed training for this company
    
    # Termination details
    terminated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    termination_date = Column(Date, nullable=True)
    termination_reason = Column(String(500), nullable=True)
    
    # Metadata
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contractor = relationship("Contractor", back_populates="company_relationships")
    company = relationship("Company", back_populates="contractor_relationships")
    creator = relationship("User", foreign_keys=[created_by])
    terminator = relationship("User", foreign_keys=[terminated_by])
    
    # Unique constraint to prevent duplicate relationships
    __table_args__ = (
        # Allow multiple relationships but only one active at a time
        # This is handled by business logic rather than DB constraint
        # to allow for relationship history
    )
    
    def __repr__(self):
        return f"<ContractorRelationship(id={self.id}, contractor_id={self.contractor_id}, company_id={self.company_id}, status='{self.status}')>"
    
    @property
    def is_active(self):
        """Check if relationship is currently active"""
        return self.status == "active"
    
    @property
    def is_contract_current(self):
        """Check if contract period is current"""
        if not self.contract_start and not self.contract_end:
            return True  # No contract period specified = ongoing
        
        today = date.today()
        
        if self.contract_start and today < self.contract_start:
            return False  # Contract hasn't started yet
        
        if self.contract_end and today > self.contract_end:
            return False  # Contract has ended
        
        return True
    
    @property
    def can_work_today(self):
        """Check if contractor can work today based on relationship status"""
        return (self.is_active and 
                self.is_contract_current and 
                self.status not in ["suspended", "terminated", "blacklisted"])
    
    @property
    def contract_status(self):
        """Get human-readable contract status"""
        if not self.is_active:
            return f"Inactive ({self.status})"
        
        if not self.is_contract_current:
            if self.contract_end and date.today() > self.contract_end:
                return "Contract Expired"
            elif self.contract_start and date.today() < self.contract_start:
                return "Contract Pending"
        
        return "Active"
    
    @property
    def days_until_contract_end(self):
        """Get days until contract ends (None if no end date)"""
        if not self.contract_end:
            return None
        
        delta = self.contract_end - date.today()
        return max(0, delta.days)
    
    @property
    def effective_hourly_rate(self):
        """Get the hourly rate, calculating from daily if needed"""
        if self.hourly_rate:
            return float(self.hourly_rate)
        elif self.daily_rate:
            return float(self.daily_rate) / 8  # Assume 8-hour day
        else:
            return 0.0
    
    @property
    def effective_daily_rate(self):
        """Get the daily rate, calculating from hourly if needed"""
        if self.daily_rate:
            return float(self.daily_rate)
        elif self.hourly_rate:
            return float(self.hourly_rate) * 8  # Assume 8-hour day
        else:
            return 0.0
    
    def can_access_block(self, block_id: int):
        """Check if contractor can access a specific block"""
        # If no specific blocks are listed, they can access all
        if not self.blocks_access:
            return True
        
        return block_id in self.blocks_access
    
    def is_area_restricted(self, area_name: str):
        """Check if an area is restricted for this contractor"""
        return area_name in (self.areas_restricted or [])
    
    def has_required_training(self):
        """Check if contractor has completed all required training"""
        if not self.required_training_modules:
            return True
        
        completed = set(self.completed_training_modules or [])
        required = set(self.required_training_modules)
        
        return required.issubset(completed)
    
    def add_completed_training(self, training_module_id: int):
        """Add a completed training module"""
        if self.completed_training_modules is None:
            self.completed_training_modules = []
        
        if training_module_id not in self.completed_training_modules:
            self.completed_training_modules.append(training_module_id)
    
    def update_performance_stats(self, rating: float = None, hours_worked: float = None, amount_paid: float = None):
        """Update performance statistics"""
        if rating is not None:
            # Update company rating (simple average for now)
            if self.jobs_completed_for_company == 0:
                self.company_rating = rating
            else:
                current_total = float(self.company_rating) * self.jobs_completed_for_company
                new_total = current_total + rating
                self.company_rating = new_total / (self.jobs_completed_for_company + 1)
        
        # Increment job count
        self.jobs_completed_for_company += 1
        self.last_worked_date = date.today()
        
        # Update hours and payment if provided
        if hours_worked:
            self.total_hours_worked = float(self.total_hours_worked or 0) + hours_worked
        
        if amount_paid:
            self.total_amount_paid = float(self.total_amount_paid or 0) + amount_paid
    
    def terminate_relationship(self, terminated_by_user_id: int, reason: str = None):
        """Terminate the contractor relationship"""
        self.status = "terminated"
        self.terminated_by = terminated_by_user_id
        self.termination_date = date.today()
        self.termination_reason = reason
    
    def suspend_relationship(self, reason: str = None):
        """Suspend the contractor relationship"""
        self.status = "suspended"
        if reason:
            self.company_notes = (self.company_notes or "") + f"\nSuspended: {reason}"
    
    def reactivate_relationship(self):
        """Reactivate a suspended relationship"""
        if self.status == "suspended":
            self.status = "active"
    
    def get_missing_training(self):
        """Get list of training modules that are required but not completed"""
        if not self.required_training_modules:
            return []
        
        completed = set(self.completed_training_modules or [])
        required = set(self.required_training_modules)
        
        return list(required - completed)