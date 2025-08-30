# db/models/training_module.py - Training Module Model
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone

class TrainingModule(Base):
    __tablename__ = "training_modules"

    # Basic module info
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    # Module details
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)  # "induction", "safety", "compliance", etc.
    
    # Module configuration
    is_active = Column(Boolean, default=True, nullable=False)
    is_required = Column(Boolean, default=False, nullable=False)  # Required for certain roles/types
    
    # Assessment configuration
    has_questionnaire = Column(Boolean, default=False, nullable=False)
    passing_score = Column(Integer, default=80, nullable=False)  # Percentage needed to pass
    max_attempts = Column(Integer, default=3, nullable=False)  # How many times can someone retry
    
    # Validity and expiry
    valid_for_days = Column(Integer, nullable=True)  # How long completion is valid (null = forever)
    
    # Assignment rules
    auto_assign_visitors = Column(Boolean, default=False)
    auto_assign_contractors = Column(Boolean, default=False) 
    required_for_roles = Column(JSON, default=list, nullable=False)  # ["user", "manager"] etc.
    
    # Metadata
    estimated_duration_minutes = Column(Integer, default=15, nullable=False)
    version = Column(String(20), default="1.0", nullable=False)
    
    # Audit fields
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    published_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    company = relationship("Company", back_populates="training_modules")
    creator = relationship("User", foreign_keys=[created_by])
    slides = relationship("TrainingSlide", back_populates="module", cascade="all, delete-orphan", order_by="TrainingSlide.order")
    questions = relationship("TrainingQuestion", back_populates="module", cascade="all, delete-orphan", order_by="TrainingQuestion.order")
    training_records = relationship("TrainingRecord", back_populates="module")
    
    def __repr__(self):
        return f"<TrainingModule(id={self.id}, title='{self.title}', company_id={self.company_id})>"
    
    @property
    def is_published(self):
        """Check if module is published and ready for use"""
        return self.published_at is not None and self.is_active
    
    @property
    def is_archived(self):
        """Check if module is archived"""
        return self.archived_at is not None
    
    @property
    def slide_count(self):
        """Get number of slides in this module"""
        return len(self.slides)
    
    @property
    def question_count(self):
        """Get number of questions in this module"""
        return len(self.questions)
    
    def publish(self):
        """Publish the module (make it available for training)"""
        if not self.published_at:
            self.published_at = datetime.now(timezone.utc)
        self.is_active = True
    
    def archive(self):
        """Archive the module (keep records but disable new assignments)"""
        self.archived_at = datetime.now(timezone.utc)
        self.is_active = False
    
    def can_be_assigned_to(self, entity_type: str, user_role: str = None):
        """Check if module should be auto-assigned to entity type"""
        if entity_type == "visitor":
            return self.auto_assign_visitors
        elif entity_type == "contractor":
            return self.auto_assign_contractors
        elif entity_type == "user" and user_role:
            return user_role in self.required_for_roles
        return False
    
    def is_valid_completion(self, completion_date: datetime):
        """Check if a completion is still valid based on expiry rules"""
        if not self.valid_for_days:
            return True  # Never expires
        
        from datetime import timedelta
        expiry_date = completion_date + timedelta(days=self.valid_for_days)
        return datetime.now(timezone.utc) < expiry_date