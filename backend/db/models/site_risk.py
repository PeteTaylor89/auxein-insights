from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Numeric, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from db.base_class import Base

class SiteRisk(Base):
    __tablename__ = "site_risks"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    # Removed block_id - risks are company-wide with their own locations
    
    # Risk identification
    risk_title = Column(String(200), nullable=False)
    risk_description = Column(Text, nullable=False)
    risk_category = Column(String(50), nullable=False)  # weather, pests_diseases, biosecurity, equipment, chemical, personnel, etc.
    risk_type = Column(String(50), nullable=False)  # health_safety, environmental, production, operational, financial, regulatory
    
    # GIS location data
    location = Column(Geometry(geometry_type='POINT', srid=4326), nullable=True)
    area = Column(Geometry(geometry_type='POLYGON', srid=4326), nullable=True)
    location_description = Column(String(500), nullable=True)
    
    # Inherent risk assessment (before controls)
    inherent_likelihood = Column(Integer, nullable=False)  # 1-5 scale
    inherent_severity = Column(Integer, nullable=False)    # 1-5 scale
    inherent_risk_score = Column(Integer, nullable=False)  # likelihood Ã— severity
    inherent_risk_level = Column(String(20), nullable=False)  # Low, Medium, High, Critical
    
    # Residual risk assessment (after controls)
    residual_likelihood = Column(Integer, nullable=True)   # 1-5 scale
    residual_severity = Column(Integer, nullable=True)     # 1-5 scale
    residual_risk_score = Column(Integer, nullable=True)   # likelihood Ã— severity
    residual_risk_level = Column(String(20), nullable=True)  # Low, Medium, High, Critical
    
    # Risk management
    status = Column(String(30), default="active", nullable=False)  # active, under_review, closed, archived
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Risk owner
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Review and monitoring
    review_frequency_days = Column(Integer, nullable=True)  # How often to review (in days)
    last_reviewed = Column(DateTime(timezone=True), nullable=True)
    next_review_due = Column(DateTime(timezone=True), nullable=True)
    
    # Additional risk details
    potential_consequences = Column(Text, nullable=True)
    existing_controls = Column(Text, nullable=True)  # Current control measures
    regulatory_requirements = Column(Text, nullable=True)
    
    # Custom fields for flexibility
    custom_fields = Column(JSON, default=dict, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    archived_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    company = relationship("Company", back_populates="site_risks")
    owner = relationship("User", foreign_keys=[owner_id], back_populates="owned_risks")
    creator = relationship("User", foreign_keys=[created_by], back_populates="created_risks")
    risk_actions = relationship("RiskAction", back_populates="risk", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="related_risk")
    
    def __repr__(self):
        return f"<SiteRisk(id={self.id}, title='{self.risk_title}', level='{self.inherent_risk_level}')>"
    
    @property
    def has_residual_assessment(self):
        """Check if residual risk has been assessed"""
        return (self.residual_likelihood is not None and 
                self.residual_severity is not None)
    
    @property
    def risk_reduced(self):
        """Check if controls have reduced the risk"""
        if not self.has_residual_assessment:
            return False
        return self.residual_risk_score < self.inherent_risk_score
    
    @property
    def is_high_risk(self):
        """Check if this is a high or critical risk"""
        current_level = self.residual_risk_level or self.inherent_risk_level
        return current_level in ["high", "critical"]
    
    @property
    def is_review_overdue(self):
        """Check if risk review is overdue"""
        if not self.next_review_due:
            return False
        from datetime import datetime, timezone
        return datetime.now(timezone.utc) > self.next_review_due
    
    def calculate_risk_score(self, likelihood: int, severity: int) -> tuple:
        """Calculate risk score and level from likelihood and severity"""
        score = likelihood * severity
        
        # Risk level matrix (can be customized)
        if score <= 4:
            level = "low"
        elif score <= 9:
            level = "medium"
        elif score <= 16:
            level = "high"
        else:
            level = "critical"
        
        return score, level
    
    def update_inherent_risk(self, likelihood: int, severity: int):
        """Update inherent risk assessment"""
        self.inherent_likelihood = likelihood
        self.inherent_severity = severity
        self.inherent_risk_score, self.inherent_risk_level = self.calculate_risk_score(likelihood, severity)
    
    def update_residual_risk(self, likelihood: int, severity: int):
        """Update residual risk assessment"""
        self.residual_likelihood = likelihood
        self.residual_severity = severity
        self.residual_risk_score, self.residual_risk_level = self.calculate_risk_score(likelihood, severity)
    
    def set_next_review_date(self):
        """Set next review date based on frequency"""
        if self.review_frequency_days and self.last_reviewed:
            from datetime import timedelta
            self.next_review_due = self.last_reviewed + timedelta(days=self.review_frequency_days)
        elif self.review_frequency_days:
            from datetime import datetime, timezone, timedelta
            self.next_review_due = datetime.now(timezone.utc) + timedelta(days=self.review_frequency_days)
    
    def mark_reviewed(self, reviewed_by_id: int):
        """Mark risk as reviewed"""
        from datetime import datetime, timezone
        self.last_reviewed = datetime.now(timezone.utc)
        self.set_next_review_date()
        # Could add a review history table in the future