# db/models/training_response.py - Training Response Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Numeric, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone

class TrainingResponse(Base):
    __tablename__ = "training_responses"

    # Basic response info
    id = Column(Integer, primary_key=True, index=True)
    training_attempt_id = Column(Integer, ForeignKey("training_attempts.id"), nullable=False)
    training_question_id = Column(Integer, ForeignKey("training_questions.id"), nullable=False)
    
    # Response details
    selected_option_ids = Column(JSON, default=list, nullable=False)  # List of selected option IDs
    response_text = Column(Text, nullable=True)  # For future text-based questions
    
    # Response metadata
    is_correct = Column(Boolean, nullable=False)
    points_earned = Column(Numeric(5, 2), default=0, nullable=False)
    points_possible = Column(Numeric(5, 2), nullable=False)
    
    # Timing and behavior
    time_spent_seconds = Column(Integer, default=0, nullable=False)  # Time spent on this question
    attempt_count = Column(Integer, default=1, nullable=False)  # How many times they changed answer
    
    # Question state when answered (for audit trail)
    question_text_snapshot = Column(Text, nullable=True)  # Question text at time of answer
    options_snapshot = Column(JSON, nullable=True)  # All options at time of answer
    
    # Audit fields
    answered_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    attempt = relationship("TrainingAttempt", back_populates="responses")
    question = relationship("TrainingQuestion", back_populates="responses")
    
    # Note: We don't create a direct relationship to TrainingQuestionOption 
    # since selected_option_ids is JSON and can contain multiple IDs
    
    def __repr__(self):
        return f"<TrainingResponse(id={self.id}, attempt_id={self.training_attempt_id}, question_id={self.training_question_id}, correct={self.is_correct})>"
    
    @property
    def selected_option_count(self):
        """Get number of options selected"""
        return len(self.selected_option_ids) if self.selected_option_ids else 0
    
    @property
    def response_time_display(self):
        """Get formatted response time"""
        if self.time_spent_seconds < 60:
            return f"{self.time_spent_seconds}s"
        else:
            minutes = self.time_spent_seconds // 60
            seconds = self.time_spent_seconds % 60
            return f"{minutes}m {seconds}s"
    
    def get_selected_options(self, db_session):
        """Get the actual TrainingQuestionOption objects that were selected"""
        if not self.selected_option_ids:
            return []
        
        from db.models.training_question_option import TrainingQuestionOption
        return db_session.query(TrainingQuestionOption).filter(
            TrainingQuestionOption.id.in_(self.selected_option_ids)
        ).all()
    
    def set_response(self, option_ids, question_obj, time_spent=0):
        """Set the response and calculate if it's correct"""
        if not isinstance(option_ids, list):
            option_ids = [option_ids] if option_ids else []
        
        self.selected_option_ids = option_ids
        self.time_spent_seconds = time_spent
        
        # Store question snapshot for audit trail
        self.question_text_snapshot = question_obj.question_text
        self.options_snapshot = [
            {
                "id": opt.id,
                "text": opt.option_text,
                "is_correct": opt.is_correct,
                "order": opt.order
            }
            for opt in question_obj.options
        ]
        
        # Check if answer is correct
        self.is_correct = question_obj.is_answer_correct(option_ids)
        
        # Calculate points earned
        self.points_possible = question_obj.points
        self.points_earned = self.points_possible if self.is_correct else 0
        
        self.answered_at = datetime.now(timezone.utc)
    
    def update_response(self, new_option_ids, time_spent_additional=0):
        """Update an existing response (if allowed)"""
        if not isinstance(new_option_ids, list):
            new_option_ids = [new_option_ids] if new_option_ids else []
        
        self.selected_option_ids = new_option_ids
        self.time_spent_seconds += time_spent_additional
        self.attempt_count += 1
        
        # Recalculate correctness based on updated response
        if hasattr(self, 'question') and self.question:
            self.is_correct = self.question.is_answer_correct(new_option_ids)
            self.points_earned = self.points_possible if self.is_correct else 0
        
        self.updated_at = datetime.now(timezone.utc)
    
    def get_response_summary(self, include_correct_answers=False):
        """Get response summary for review/reporting"""
        summary = {
            "question_id": self.training_question_id,
            "selected_options": self.selected_option_ids,
            "is_correct": self.is_correct,
            "points_earned": float(self.points_earned),
            "points_possible": float(self.points_possible),
            "time_spent": self.response_time_display,
            "attempt_count": self.attempt_count,
            "answered_at": self.answered_at
        }
        
        if include_correct_answers and self.options_snapshot:
            summary["correct_options"] = [
                opt["id"] for opt in self.options_snapshot 
                if opt.get("is_correct", False)
            ]
            summary["question_text"] = self.question_text_snapshot
            summary["all_options"] = self.options_snapshot
        
        return summary