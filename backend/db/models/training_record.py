# db/models/training_record.py - Training Record Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, timedelta

class TrainingRecord(Base):
    __tablename__ = "training_records"

    # Basic record info
    id = Column(Integer, primary_key=True, index=True)
    training_module_id = Column(Integer, ForeignKey("training_modules.id"), nullable=False)
    
    # Who completed the training (polymorphic)
    entity_type = Column(String(20), nullable=False)  # "user", "visitor", "contractor"
    entity_id = Column(Integer, nullable=False)  # ID of the user/visitor/contractor
    
    # Completion details
    status = Column(String(20), default="assigned", nullable=False)  # "assigned", "in_progress", "completed", "failed", "expired"
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # When this completion expires
    
    # Scoring and attempts
    current_attempt = Column(Integer, default=0, nullable=False)  # Current attempt number
    best_score = Column(Numeric(5, 2), nullable=True)  # Best score achieved (percentage)
    passing_score_required = Column(Numeric(5, 2), nullable=False)  # Score needed to pass (copied from module)
    
    # Assignment details
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who assigned this training
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    assignment_reason = Column(String(100), nullable=True)  # "auto_visitor", "manual", "role_requirement"
    
    # Completion tracking
    time_spent_minutes = Column(Integer, default=0, nullable=False)  # Total time spent
    slides_viewed = Column(JSON, default=list, nullable=False)  # List of slide IDs viewed
    
    # Certificate and validation
    certificate_issued = Column(Boolean, default=False, nullable=False)
    certificate_url = Column(String(500), nullable=True)  # Path to generated certificate
    validation_code = Column(String(50), nullable=True)  # Unique code for certificate validation
    
    # Metadata
    module_version = Column(String(20), nullable=True)  # Version of module when completed
    user_agent = Column(String(500), nullable=True)  # Browser/device info
    ip_address = Column(String(45), nullable=True)  # IP address for audit trail
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    module = relationship("TrainingModule", back_populates="training_records")
    assigner = relationship("User", foreign_keys=[assigned_by])
    attempts = relationship("TrainingAttempt", back_populates="training_record", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<TrainingRecord(id={self.id}, module_id={self.training_module_id}, entity={self.entity_type}:{self.entity_id}, status='{self.status}')>"
    
    @property
    def is_completed(self):
        """Check if training is successfully completed"""
        return self.status == "completed"
    
    @property
    def is_passed(self):
        """Check if training was passed (completed with sufficient score)"""
        return self.is_completed and self.best_score and self.best_score >= self.passing_score_required
    
    @property
    def is_expired(self):
        """Check if training completion has expired"""
        return self.expires_at and datetime.now(timezone.utc) > self.expires_at
    
    @property
    def is_valid(self):
        """Check if training completion is still valid"""
        return self.is_passed and not self.is_expired
    
    @property
    def attempts_remaining(self):
        """Get number of attempts remaining"""
        if not hasattr(self.module, 'max_attempts'):
            return 999  # Unlimited if module not loaded
        return max(0, self.module.max_attempts - self.current_attempt)
    
    @property
    def can_attempt(self):
        """Check if user can make another attempt"""
        return self.attempts_remaining > 0 and self.status in ["assigned", "in_progress", "failed"]
    
    def start_training(self):
        """Mark training as started"""
        if self.status == "assigned":
            self.status = "in_progress"
            self.started_at = datetime.now(timezone.utc)
    
    def complete_training(self, final_score: float):
        """Mark training as completed with final score"""
        self.status = "completed" if final_score >= self.passing_score_required else "failed"
        self.completed_at = datetime.now(timezone.utc)
        
        # Update best score
        if not self.best_score or final_score > self.best_score:
            self.best_score = final_score
        
        # Set expiry date if module has validity period
        if self.module and self.module.valid_for_days and self.status == "completed":
            self.expires_at = self.completed_at + timedelta(days=self.module.valid_for_days)
    
    def expire_training(self):
        """Mark training as expired"""
        self.status = "expired"
    
    def calculate_expiry_date(self):
        """Calculate when this training will expire"""
        if not self.completed_at or not self.module or not self.module.valid_for_days:
            return None
        return self.completed_at + timedelta(days=self.module.valid_for_days)
    
    def get_entity_info(self, db_session):
        """Get information about the entity that completed this training"""
        if self.entity_type == "user":
            from db.models.user import User
            entity = db_session.query(User).filter(User.id == self.entity_id).first()
            return {
                "type": "user",
                "name": entity.full_name if entity else "Unknown User",
                "email": entity.email if entity else None,
                "role": entity.role if entity else None
            }
        elif self.entity_type == "visitor":
            from db.models.visitor import Visitor
            entity = db_session.query(Visitor).filter(Visitor.id == self.entity_id).first()
            return {
                "type": "visitor", 
                "name": entity.full_name if entity else "Unknown Visitor",
                "email": entity.email if entity else None,
                "company": entity.company_representing if entity else None
            }
        elif self.entity_type == "contractor":
            # Future implementation for contractors
            return {
                "type": "contractor",
                "name": "Contractor User",  # Placeholder
                "email": None,
                "company": None
            }
        return None