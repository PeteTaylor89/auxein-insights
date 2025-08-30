# db/models/visitor.py - Visitor Models
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, timedelta

class Visitor(Base):
    """Master visitor records - stores visitor details"""
    __tablename__ = "visitors"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Personal details
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    email = Column(String(100), nullable=True, index=True)
    phone = Column(String(20), nullable=True)
    
    # Emergency contact
    emergency_contact_name = Column(String(100), nullable=True)
    emergency_contact_phone = Column(String(20), nullable=True)
    
    # Vehicle details
    vehicle_registration = Column(String(20), nullable=True)
    driver_license = Column(String(50), nullable=True)
    
    # Company/organization they represent
    company_representing = Column(String(100), nullable=True)
    position_title = Column(String(100), nullable=True)
    
    # Visitor status
    is_active = Column(Boolean, default=True, nullable=False)
    is_banned = Column(Boolean, default=False, nullable=False)
    ban_reason = Column(Text, nullable=True)
    
    # Metadata
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    company = relationship("Company", back_populates="visitors")
    creator = relationship("User", foreign_keys=[created_by])
    visits = relationship("VisitorVisit", back_populates="visitor", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Visitor(id={self.id}, name='{self.full_name}', company_id={self.company_id})>"
    
    @property
    def full_name(self):
        """Return visitor's full name"""
        return f"{self.first_name} {self.last_name}"
    
    @property
    def total_visits(self):
        """Count total visits for this visitor"""
        return len(self.visits)
    
    @property
    def last_visit_date(self):
        """Get the date of the most recent visit"""
        if not self.visits:
            return None
        return max(visit.visit_date for visit in self.visits)
    
    @property
    def is_frequent_visitor(self):
        """Check if visitor has 3+ visits"""
        return self.total_visits >= 3


class VisitorVisit(Base):
    """Individual visit log entries"""
    __tablename__ = "visitor_visits"

    id = Column(Integer, primary_key=True, index=True)
    visitor_id = Column(Integer, ForeignKey("visitors.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Visit details
    visit_date = Column(Date, nullable=False, default=func.current_date())
    purpose = Column(String(200), nullable=False)
    expected_duration_hours = Column(Integer, nullable=True)  # Expected visit duration
    
    # Host information
    host_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    host_notified = Column(Boolean, default=False, nullable=False)
    
    # Areas and access
    areas_accessed = Column(JSON, default=list, nullable=False)  # List of block IDs or area names
    restricted_areas = Column(JSON, default=list, nullable=False)  # Areas visitor cannot access
    
    # Time tracking
    signed_in_at = Column(DateTime(timezone=True), nullable=True)
    signed_out_at = Column(DateTime(timezone=True), nullable=True)
    signed_in_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    signed_out_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Safety and compliance
    induction_completed = Column(Boolean, default=False, nullable=False)
    induction_completed_at = Column(DateTime(timezone=True), nullable=True)
    induction_completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    ppe_provided = Column(JSON, default=list, nullable=False)  # List of PPE items provided
    safety_briefing_given = Column(Boolean, default=False, nullable=False)
    
    # Visit notes and incidents
    visit_notes = Column(Text, nullable=True)
    incidents = Column(JSON, default=list, nullable=False)  # Any incidents during visit
    weather_conditions = Column(String(100), nullable=True)
    
    # Visit status
    status = Column(String(20), default="planned", nullable=False)  # planned, in_progress, completed, cancelled
    cancelled_reason = Column(Text, nullable=True)
    
    # Metadata
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    visitor = relationship("Visitor", back_populates="visits")
    company = relationship("Company", back_populates="visitor_visits")
    host = relationship("User", foreign_keys=[host_user_id])
    creator = relationship("User", foreign_keys=[created_by])
    signed_in_by_user = relationship("User", foreign_keys=[signed_in_by])
    signed_out_by_user = relationship("User", foreign_keys=[signed_out_by])
    induction_by_user = relationship("User", foreign_keys=[induction_completed_by])
    
    def __repr__(self):
        return f"<VisitorVisit(id={self.id}, visitor_id={self.visitor_id}, date={self.visit_date}, status='{self.status}')>"
    
    @property
    def is_active_visit(self):
        """Check if visitor is currently on site"""
        return self.signed_in_at and not self.signed_out_at
    
    @property
    def visit_duration_minutes(self):
        """Calculate visit duration in minutes"""
        if not self.signed_in_at:
            return None
        
        end_time = self.signed_out_at or datetime.now(timezone.utc)
        duration = end_time - self.signed_in_at
        return int(duration.total_seconds() / 60)
    
    @property
    def is_overdue(self):
        """Check if visit is running longer than expected"""
        if not self.expected_duration_hours or not self.signed_in_at or self.signed_out_at:
            return False
        
        expected_end = self.signed_in_at + timedelta(hours=self.expected_duration_hours)
        return datetime.now(timezone.utc) > expected_end
    
    def sign_in(self, user_id: int):
        """Sign visitor in"""
        self.signed_in_at = datetime.now(timezone.utc)
        self.signed_in_by = user_id
        self.status = "in_progress"
    
    def sign_out(self, user_id: int, notes: str = None):
        """Sign visitor out"""
        self.signed_out_at = datetime.now(timezone.utc)
        self.signed_out_by = user_id
        self.status = "completed"
        if notes:
            self.visit_notes = (self.visit_notes or "") + f"\nSign-out notes: {notes}"
    
    def complete_induction(self, user_id: int):
        """Mark induction as completed"""
        self.induction_completed = True
        self.induction_completed_at = datetime.now(timezone.utc)
        self.induction_completed_by = user_id