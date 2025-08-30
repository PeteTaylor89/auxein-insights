# db/models/contractor_training.py - ContractorTraining Model
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text, Date, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base
from datetime import datetime, timezone, date, timedelta

class ContractorTraining(Base):
    __tablename__ = "contractor_training"

    id = Column(Integer, primary_key=True, index=True)
    contractor_id = Column(Integer, ForeignKey("contractors.id"), nullable=False)
    training_module_id = Column(Integer, ForeignKey("training_modules.id"), nullable=False)
    
    # Assignment details
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_date = Column(Date, nullable=False, default=func.current_date())
    due_date = Column(Date, nullable=True)
    priority = Column(String(20), default="medium", nullable=False)  # low, medium, high, mandatory
    
    # Training context
    assignment_reason = Column(String(100), nullable=True)  # new_contractor, company_requirement, incident_response, renewal
    assigning_company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)  # Company that required this training
    
    # Completion tracking
    status = Column(String(20), default="assigned", nullable=False)  
    # assigned, started, in_progress, completed, failed, overdue, expired
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Performance tracking
    attempts = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=3, nullable=False)
    time_spent_minutes = Column(Integer, default=0, nullable=False)
    score = Column(Numeric(5, 2), nullable=True)  # Final score achieved
    passing_score_required = Column(Numeric(5, 2), nullable=True)  # Score needed to pass
    passed = Column(Boolean, nullable=True)
    
    # Attempt history
    attempt_history = Column(JSON, default=list, nullable=False)
    # [
    #   {
    #     "attempt_number": 1,
    #     "started_at": "2024-01-15T10:00:00Z",
    #     "completed_at": "2024-01-15T11:30:00Z",
    #     "score": 85.5,
    #     "passed": true,
    #     "time_minutes": 90,
    #     "questions_answered": 20,
    #     "questions_correct": 17
    #   }
    # ]
    
    # Company-specific requirements
    required_by_companies = Column(JSON, default=list, nullable=False)  # Company IDs that require this
    mandatory_for_work_types = Column(JSON, default=list, nullable=False)  # Work types requiring this training
    must_complete_before_work = Column(Boolean, default=False, nullable=False)  # Blocks work assignment if not complete
    
    # Renewal and validity
    valid_until = Column(Date, nullable=True)  # When this training expires
    renewal_required = Column(Boolean, default=True, nullable=False)
    renewal_notification_sent = Column(Boolean, default=False, nullable=False)
    renewal_notification_date = Column(Date, nullable=True)
    
    # Training module version tracking
    module_version = Column(String(20), nullable=True)  # Version of training module when assigned
    completed_module_version = Column(String(20), nullable=True)  # Version when completed
    
    # Supervision and verification
    requires_supervision = Column(Boolean, default=False, nullable=False)
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    supervised_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who actually supervised
    supervision_notes = Column(Text, nullable=True)
    
    # Certification outcome
    certificate_issued = Column(Boolean, default=False, nullable=False)
    certificate_number = Column(String(100), nullable=True)
    certificate_file_path = Column(String(500), nullable=True)
    
    # Remedial training
    is_remedial = Column(Boolean, default=False, nullable=False)  # Required due to incident/failure
    remedial_reason = Column(String(200), nullable=True)
    original_training_id = Column(Integer, ForeignKey("contractor_training.id"), nullable=True)
    
    # Progress tracking
    modules_completed = Column(JSON, default=list, nullable=False)  # Sub-modules completed
    current_module = Column(String(100), nullable=True)  # Current sub-module
    progress_percentage = Column(Integer, default=0, nullable=False)
    last_activity = Column(DateTime(timezone=True), nullable=True)
    
    # Notes and feedback
    contractor_feedback = Column(Text, nullable=True)  # Contractor's feedback on training
    trainer_notes = Column(Text, nullable=True)  # Notes from trainer/supervisor
    completion_notes = Column(Text, nullable=True)  # Notes when marking complete
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contractor = relationship("Contractor", back_populates="training_records")
    training_module = relationship("TrainingModule")
    assigner = relationship("User", foreign_keys=[assigned_by])
    supervisor = relationship("User", foreign_keys=[supervisor_id])
    actual_supervisor = relationship("User", foreign_keys=[supervised_by])
    assigning_company = relationship("Company")
    
    # Self-referential for remedial training
    original_training = relationship("ContractorTraining", remote_side=[id])
    remedial_trainings = relationship("ContractorTraining", back_populates="original_training")
    
    def __repr__(self):
        return f"<ContractorTraining(id={self.id}, contractor_id={self.contractor_id}, module_id={self.training_module_id}, status='{self.status}')>"
    
    @property
    def is_overdue(self):
        """Check if training is overdue"""
        if not self.due_date or self.status in ["completed", "failed", "expired"]:
            return False
        return date.today() > self.due_date
    
    @property
    def days_overdue(self):
        """Get number of days overdue"""
        if not self.is_overdue:
            return 0
        return (date.today() - self.due_date).days
    
    @property
    def is_expired(self):
        """Check if completed training has expired"""
        if self.status != "completed" or not self.valid_until:
            return False
        return date.today() > self.valid_until
    
    @property
    def days_until_expiry(self):
        """Get days until training expires"""
        if not self.valid_until or self.status != "completed":
            return None
        delta = self.valid_until - date.today()
        return max(0, delta.days)
    
    @property
    def needs_renewal_notification(self):
        """Check if renewal notification should be sent"""
        if (self.status == "completed" and 
            self.renewal_required and 
            not self.renewal_notification_sent and
            self.days_until_expiry is not None and 
            self.days_until_expiry <= 30):  # 30 days before expiry
            return True
        return False
    
    @property
    def average_score(self):
        """Calculate average score across all attempts"""
        if not self.attempt_history:
            return None
        
        scores = [attempt.get("score") for attempt in self.attempt_history if attempt.get("score")]
        return sum(scores) / len(scores) if scores else None
    
    @property
    def best_score(self):
        """Get best score across all attempts"""
        if not self.attempt_history:
            return None
        
        scores = [attempt.get("score") for attempt in self.attempt_history if attempt.get("score")]
        return max(scores) if scores else None
    
    @property
    def total_time_spent(self):
        """Get total time spent across all attempts (in minutes)"""
        if not self.attempt_history:
            return self.time_spent_minutes
        
        total = sum(attempt.get("time_minutes", 0) for attempt in self.attempt_history)
        return max(total, self.time_spent_minutes)
    
    @property
    def can_attempt(self):
        """Check if contractor can make another attempt"""
        return self.attempts < self.max_attempts and self.status not in ["completed", "expired"]
    
    def start_training(self):
        """Mark training as started"""
        if self.status == "assigned":
            self.status = "started"
            self.started_at = datetime.now(timezone.utc)
            self.last_activity = datetime.now(timezone.utc)
    
    def record_progress(self, module_name: str = None, percentage: int = None):
        """Update training progress"""
        self.last_activity = datetime.now(timezone.utc)
        
        if self.status == "assigned":
            self.status = "in_progress"
        
        if module_name:
            self.current_module = module_name
            if self.modules_completed is None:
                self.modules_completed = []
            if module_name not in self.modules_completed:
                self.modules_completed.append(module_name)
        
        if percentage is not None:
            self.progress_percentage = max(0, min(100, percentage))
    
    def complete_attempt(self, score: float, time_minutes: int, passed: bool = None, 
                        questions_answered: int = None, questions_correct: int = None):
        """Record completion of a training attempt"""
        self.attempts += 1
        self.last_activity = datetime.now(timezone.utc)
        
        # Determine if passed based on score and required passing score
        if passed is None and self.passing_score_required:
            passed = score >= float(self.passing_score_required)
        
        # Record attempt in history
        if self.attempt_history is None:
            self.attempt_history = []
        
        attempt_record = {
            "attempt_number": self.attempts,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "score": float(score),
            "passed": passed,
            "time_minutes": time_minutes,
            "questions_answered": questions_answered,
            "questions_correct": questions_correct
        }
        
        self.attempt_history.append(attempt_record)
        
        # Update current record with best/latest results
        if not self.score or score > self.score:
            self.score = score
        
        self.time_spent_minutes += time_minutes
        
        # Update status based on result
        if passed:
            self.status = "completed"
            self.completed_at = datetime.now(timezone.utc)
            self.passed = True
            self.progress_percentage = 100
            
            # Set validity period if training expires
            if self.renewal_required and hasattr(self, 'training_module'):
                if hasattr(self.training_module, 'valid_for_days') and self.training_module.valid_for_days:
                    self.valid_until = date.today() + timedelta(days=self.training_module.valid_for_days)
        else:
            self.passed = False
            if self.attempts >= self.max_attempts:
                self.status = "failed"
            else:
                self.status = "assigned"  # Allow retry
    
    def mark_overdue(self):
        """Mark training as overdue"""
        if self.is_overdue and self.status not in ["completed", "failed", "expired"]:
            self.status = "overdue"
    
    def mark_expired(self):
        """Mark completed training as expired"""
        if self.is_expired:
            self.status = "expired"
    
    def reset_for_renewal(self, assigned_by_user_id: int, new_due_date: date = None):
        """Reset training for renewal"""
        self.status = "assigned"
        self.assigned_by = assigned_by_user_id
        self.assigned_date = date.today()
        self.due_date = new_due_date
        self.started_at = None
        self.completed_at = None
        self.attempts = 0
        self.score = None
        self.passed = None
        self.progress_percentage = 0
        self.modules_completed = []
        self.current_module = None
        self.renewal_notification_sent = False
        self.renewal_notification_date = None
        
        # Keep attempt history for reference
        if self.attempt_history is None:
            self.attempt_history = []
    
    def send_renewal_notification(self):
        """Mark that renewal notification has been sent"""
        self.renewal_notification_sent = True
        self.renewal_notification_date = date.today()
    
    def assign_supervisor(self, supervisor_user_id: int):
        """Assign a supervisor for this training"""
        self.supervisor_id = supervisor_user_id
        self.requires_supervision = True
    
    def complete_supervision(self, supervised_by_user_id: int, notes: str = None):
        """Mark supervision as completed"""
        self.supervised_by = supervised_by_user_id
        self.supervision_notes = notes
    
    def issue_certificate(self, certificate_number: str = None, file_path: str = None):
        """Issue certificate for completed training"""
        if self.status == "completed" and self.passed:
            self.certificate_issued = True
            self.certificate_number = certificate_number
            self.certificate_file_path = file_path
    
    def create_remedial_training(self, reason: str, assigned_by_user_id: int, due_date: date = None):
        """Create a remedial training record"""
        # This would be called as a class method to create a new instance
        # Implementation depends on how you want to handle this
        pass
    
    def get_completion_summary(self):
        """Get summary of training completion"""
        return {
            "status": self.status,
            "passed": self.passed,
            "score": float(self.score) if self.score else None,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
            "time_spent_minutes": self.total_time_spent,
            "progress_percentage": self.progress_percentage,
            "is_overdue": self.is_overdue,
            "days_overdue": self.days_overdue if self.is_overdue else 0,
            "is_expired": self.is_expired,
            "days_until_expiry": self.days_until_expiry,
            "certificate_issued": self.certificate_issued,
            "needs_renewal": self.needs_renewal_notification
        }
    
    def get_attempt_statistics(self):
        """Get statistics about training attempts"""
        if not self.attempt_history:
            return {
                "total_attempts": self.attempts,
                "average_score": None,
                "best_score": None,
                "total_time_minutes": self.time_spent_minutes,
                "improvement_trend": None
            }
        
        scores = [attempt.get("score") for attempt in self.attempt_history if attempt.get("score")]
        times = [attempt.get("time_minutes") for attempt in self.attempt_history if attempt.get("time_minutes")]
        
        # Calculate improvement trend
        improvement_trend = None
        if len(scores) >= 2:
            first_half = scores[:len(scores)//2]
            second_half = scores[len(scores)//2:]
            if len(first_half) > 0 and len(second_half) > 0:
                first_avg = sum(first_half) / len(first_half)
                second_avg = sum(second_half) / len(second_half)
                improvement_trend = "improving" if second_avg > first_avg else "declining" if second_avg < first_avg else "stable"
        
        return {
            "total_attempts": len(self.attempt_history),
            "average_score": sum(scores) / len(scores) if scores else None,
            "best_score": max(scores) if scores else None,
            "worst_score": min(scores) if scores else None,
            "total_time_minutes": sum(times) if times else 0,
            "average_time_minutes": sum(times) / len(times) if times else None,
            "improvement_trend": improvement_trend,
            "pass_rate": sum(1 for attempt in self.attempt_history if attempt.get("passed")) / len(self.attempt_history) if self.attempt_history else 0
        }
    
    def is_blocking_work_assignment(self, work_types: list = None):
        """Check if incomplete training blocks work assignment"""
        if not self.must_complete_before_work or self.status == "completed":
            return False
        
        # If specific work types are provided, check if this training is required for any of them
        if work_types and self.mandatory_for_work_types:
            return any(work_type in self.mandatory_for_work_types for work_type in work_types)
        
        # If no specific work types, but training is mandatory before work
        return self.must_complete_before_work
    
    def calculate_urgency_score(self):
        """Calculate urgency score for prioritizing training (0-100)"""
        score = 0
        
        # Base priority
        priority_scores = {"low": 10, "medium": 30, "high": 60, "mandatory": 80}
        score += priority_scores.get(self.priority, 30)
        
        # Overdue penalty
        if self.is_overdue:
            score += min(20, self.days_overdue * 2)  # Up to 20 points for being overdue
        
        # Blocking work penalty
        if self.must_complete_before_work:
            score += 15
        
        # Expiry urgency (for renewals)
        if self.status == "completed" and self.days_until_expiry is not None:
            if self.days_until_expiry <= 7:
                score += 20
            elif self.days_until_expiry <= 30:
                score += 10
        
        # Multiple companies requiring it
        if len(self.required_by_companies) > 1:
            score += 5
        
        # Failed attempts increase urgency
        if self.attempts > 0 and not self.passed:
            score += self.attempts * 5
        
        return min(100, score)
    
    def can_start_work_for_company(self, company_id: int, work_types: list = None):
        """Check if contractor can start work for a company given this training status"""
        # If this training is not required by the company, it doesn't block work
        if company_id not in (self.required_by_companies or []):
            return True
        
        # If training is completed, work can proceed
        if self.status == "completed" and not self.is_expired:
            return True
        
        # If training is not mandatory before work, work can proceed
        if not self.must_complete_before_work:
            return True
        
        # If specific work types are provided and training is not required for those types
        if work_types and self.mandatory_for_work_types:
            if not any(work_type in self.mandatory_for_work_types for work_type in work_types):
                return True
        
        # Otherwise, training must be completed before work can start
        return False