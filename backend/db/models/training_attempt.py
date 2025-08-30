# db/models/training_attempt.py - Training Attempt Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Numeric, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone

class TrainingAttempt(Base):
    __tablename__ = "training_attempts"

    # Basic attempt info
    id = Column(Integer, primary_key=True, index=True)
    training_record_id = Column(Integer, ForeignKey("training_records.id"), nullable=False)
    
    # Attempt details
    attempt_number = Column(Integer, nullable=False)  # 1, 2, 3, etc.
    status = Column(String(20), default="in_progress", nullable=False)  # "in_progress", "completed", "abandoned"
    
    # Timing
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    time_spent_minutes = Column(Integer, default=0, nullable=False)
    
    # Content tracking
    slides_viewed = Column(JSON, default=list, nullable=False)  # [1, 2, 3] - slide IDs viewed
    slides_time_spent = Column(JSON, default=dict, nullable=False)  # {"1": 30, "2": 45} - seconds per slide
    
    # Assessment results
    questions_answered = Column(Integer, default=0, nullable=False)
    questions_correct = Column(Integer, default=0, nullable=False)
    total_points_earned = Column(Numeric(8, 2), default=0, nullable=False)
    total_points_possible = Column(Numeric(8, 2), default=0, nullable=False)
    final_score = Column(Numeric(5, 2), nullable=True)  # Final percentage score
    
    # Completion details
    passed = Column(Boolean, default=False, nullable=False)
    passing_score_required = Column(Numeric(5, 2), nullable=False)  # Copy from module at time of attempt
    
    # Technical details
    user_agent = Column(String(500), nullable=True)
    ip_address = Column(String(45), nullable=True)
    device_info = Column(JSON, default=dict, nullable=False)  # Browser, OS, screen size, etc.
    
    # Notes and feedback
    completion_notes = Column(Text, nullable=True)  # Any notes about the completion
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    training_record = relationship("TrainingRecord", back_populates="attempts")
    responses = relationship("TrainingResponse", back_populates="attempt", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<TrainingAttempt(id={self.id}, record_id={self.training_record_id}, attempt={self.attempt_number}, score={self.final_score})>"
    
    @property
    def is_completed(self):
        """Check if attempt is completed"""
        return self.status == "completed"
    
    @property
    def is_in_progress(self):
        """Check if attempt is still in progress"""
        return self.status == "in_progress"
    
    @property
    def duration_minutes(self):
        """Get total duration of attempt in minutes"""
        if self.completed_at and self.started_at:
            delta = self.completed_at - self.started_at
            return int(delta.total_seconds() / 60)
        elif self.is_in_progress:
            delta = datetime.now(timezone.utc) - self.started_at
            return int(delta.total_seconds() / 60)
        return self.time_spent_minutes
    
    @property
    def completion_percentage(self):
        """Get percentage of content completed"""
        if not hasattr(self.training_record, 'module') or not self.training_record.module:
            return 0
        
        total_slides = len(self.training_record.module.slides)
        viewed_slides = len(self.slides_viewed)
        
        if total_slides == 0:
            return 100
        
        return min(100, (viewed_slides / total_slides) * 100)
    
    def mark_slide_viewed(self, slide_id: int, time_spent_seconds: int = 0):
        """Mark a slide as viewed and track time spent"""
        if slide_id not in self.slides_viewed:
            self.slides_viewed.append(slide_id)
        
        # Track time spent on this slide
        if not self.slides_time_spent:
            self.slides_time_spent = {}
        
        current_time = self.slides_time_spent.get(str(slide_id), 0)
        self.slides_time_spent[str(slide_id)] = current_time + time_spent_seconds
    
    def calculate_final_score(self):
        """Calculate the final percentage score"""
        if self.total_points_possible <= 0:
            self.final_score = 0
        else:
            self.final_score = round((self.total_points_earned / self.total_points_possible) * 100, 2)
        
        self.passed = self.final_score >= self.passing_score_required
        return self.final_score
    
    def complete_attempt(self, notes: str = None):
        """Mark attempt as completed"""
        self.status = "completed"
        self.completed_at = datetime.now(timezone.utc)
        self.time_spent_minutes = self.duration_minutes
        
        if notes:
            self.completion_notes = notes
        
        # Calculate final score
        self.calculate_final_score()
    
    def abandon_attempt(self, reason: str = None):
        """Mark attempt as abandoned"""
        self.status = "abandoned"
        self.time_spent_minutes = self.duration_minutes
        
        if reason:
            self.completion_notes = f"Abandoned: {reason}"
    
    def get_summary(self):
        """Get attempt summary for reporting"""
        return {
            "attempt_number": self.attempt_number,
            "status": self.status,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_minutes": self.duration_minutes,
            "final_score": self.final_score,
            "passed": self.passed,
            "questions_answered": self.questions_answered,
            "questions_correct": self.questions_correct,
            "completion_percentage": self.completion_percentage,
            "slides_viewed_count": len(self.slides_viewed)
        }