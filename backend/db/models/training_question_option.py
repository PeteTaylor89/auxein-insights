# db/models/training_question_option.py - Training Question Option Model
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class TrainingQuestionOption(Base):
    __tablename__ = "training_question_options"

    # Basic option info
    id = Column(Integer, primary_key=True, index=True)
    training_question_id = Column(Integer, ForeignKey("training_questions.id"), nullable=False)
    
    # Option content
    option_text = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)  # Explanation for why this answer is correct/incorrect
    
    # Option configuration
    order = Column(Integer, nullable=False, default=1)  # Display order (A, B, C, D)
    is_correct = Column(Boolean, default=False, nullable=False)  # Whether this is a correct answer
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Future enhancement fields
    option_type = Column(String(20), default="text", nullable=False)  # "text", "image" for future
    image_url = Column(String(500), nullable=True)  # For image-based options in future
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    question = relationship("TrainingQuestion", back_populates="options")
    
    
    def __repr__(self):
        return f"<TrainingQuestionOption(id={self.id}, question_id={self.training_question_id}, order={self.order}, correct={self.is_correct})>"
    
    @property
    def option_letter(self):
        """Get the letter representation (A, B, C, D) based on order"""
        if self.order <= 26:
            return chr(64 + self.order)  # A=65, B=66, etc.
        return str(self.order)
    
    @property
    def has_explanation(self):
        """Check if option has an explanation"""
        return bool(self.explanation and self.explanation.strip())
    
    def get_display_text(self, include_letter=True):
        """Get formatted display text for the option"""
        if include_letter:
            return f"{self.option_letter}. {self.option_text}"
        return self.option_text
    
    def get_formatted_option(self, include_correct_answer=False, include_explanation=False):
        """Get option formatted for display"""
        formatted = {
            "id": self.id,
            "text": self.option_text,
            "letter": self.option_letter,
            "order": self.order,
            "option_type": self.option_type
        }
        
        # Include image if present
        if self.image_url:
            formatted["image_url"] = self.image_url
        
        # Include correct answer flag if requested (for admin/results view)
        if include_correct_answer:
            formatted["is_correct"] = self.is_correct
        
        # Include explanation if requested and available
        if include_explanation and self.has_explanation:
            formatted["explanation"] = self.explanation
        
        return formatted
    
    def validate_option(self):
        """Validate option setup"""
        errors = []
        
        # Must have option text
        if not self.option_text or not self.option_text.strip():
            errors.append("Option text is required")
        
        # Option text should be reasonable length
        if len(self.option_text.strip()) < 2:
            errors.append("Option text must be at least 2 characters")
        
        if len(self.option_text) > 500:
            errors.append("Option text must be less than 500 characters")
        
        return errors