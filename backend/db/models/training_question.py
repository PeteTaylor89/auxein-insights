# db/models/training_question.py - Training Question Model
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class TrainingQuestion(Base):
    __tablename__ = "training_questions"

    # Basic question info
    id = Column(Integer, primary_key=True, index=True)
    training_module_id = Column(Integer, ForeignKey("training_modules.id"), nullable=False)
    
    # Question content
    question_text = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)  # Explanation shown after answering
    
    # Question configuration
    order = Column(Integer, nullable=False, default=1)  # Order within the questionnaire
    is_active = Column(Boolean, default=True, nullable=False)
    is_required = Column(Boolean, default=True, nullable=False)  # Must be answered to proceed
    
    # Question type and scoring
    question_type = Column(String(50), default="multiple_choice", nullable=False)  # Future: "true_false", "text"
    points = Column(Integer, default=1, nullable=False)  # Points awarded for correct answer
    
    # Multiple choice specific
    randomize_options = Column(Boolean, default=False, nullable=False)  # Randomize answer order
    allow_multiple_answers = Column(Boolean, default=False, nullable=False)  # Multiple correct answers
    
    # Metadata
    difficulty_level = Column(String(20), default="medium", nullable=False)  # "easy", "medium", "hard"
    tags = Column(JSON, default=list, nullable=False)  # ["safety", "equipment"] for categorization
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    module = relationship("TrainingModule", back_populates="questions")
    options = relationship("TrainingQuestionOption", back_populates="question", cascade="all, delete-orphan", order_by="TrainingQuestionOption.order")
    responses = relationship("TrainingResponse", back_populates="question")
    
    def __repr__(self):
        return f"<TrainingQuestion(id={self.id}, module_id={self.training_module_id}, order={self.order})>"
    
    @property
    def option_count(self):
        """Get number of answer options"""
        return len(self.options)
    
    @property
    def correct_options(self):
        """Get list of correct answer options"""
        return [option for option in self.options if option.is_correct]
    
    @property
    def correct_option_count(self):
        """Get number of correct answers"""
        return len(self.correct_options)
    
    @property
    def has_multiple_correct_answers(self):
        """Check if question has multiple correct answers"""
        return self.correct_option_count > 1
    
    def validate_question(self):
        """Validate question setup"""
        errors = []
        
        # Must have question text
        if not self.question_text.strip():
            errors.append("Question text is required")
        
        # Must have at least 2 options for multiple choice
        if self.question_type == "multiple_choice" and self.option_count < 2:
            errors.append("Multiple choice questions must have at least 2 options")
        
        # Must have exactly one correct answer (unless multiple allowed)
        if self.question_type == "multiple_choice":
            correct_count = self.correct_option_count
            if not self.allow_multiple_answers and correct_count != 1:
                errors.append("Must have exactly one correct answer (unless multiple answers allowed)")
            elif self.allow_multiple_answers and correct_count < 1:
                errors.append("Must have at least one correct answer")
        
        return errors
    
    def is_answer_correct(self, selected_option_ids):
        """Check if selected options are correct"""
        if not isinstance(selected_option_ids, list):
            selected_option_ids = [selected_option_ids]
        
        correct_option_ids = [option.id for option in self.correct_options]
        
        # For single answer questions
        if not self.allow_multiple_answers:
            return len(selected_option_ids) == 1 and selected_option_ids[0] in correct_option_ids
        
        # For multiple answer questions - must select ALL correct answers and NO incorrect ones
        return set(selected_option_ids) == set(correct_option_ids)
    
    def get_formatted_question(self, include_correct_answers=False):
        """Get question formatted for display"""
        formatted = {
            "id": self.id,
            "question_text": self.question_text,
            "explanation": self.explanation,
            "question_type": self.question_type,
            "allow_multiple_answers": self.allow_multiple_answers,
            "randomize_options": self.randomize_options,
            "points": self.points,
            "order": self.order,
            "options": []
        }
        
        # Add options
        options = list(self.options)
        if self.randomize_options:
            import random
            random.shuffle(options)
        
        for option in options:
            option_data = {
                "id": option.id,
                "text": option.option_text,
                "order": option.order
            }
            if include_correct_answers:
                option_data["is_correct"] = option.is_correct
            formatted["options"].append(option_data)
        
        return formatted