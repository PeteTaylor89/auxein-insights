# app/schemas/training.py - Training Module Pydantic Schemas
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, date
from pydantic import BaseModel, validator, Field
from .user import UserSummary
from pydantic.config import ConfigDict

# ===== TRAINING MODULE SCHEMAS =====

class TrainingModuleBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    is_required: bool = False
    has_questionnaire: bool = False
    passing_score: int = Field(80, ge=0, le=100)
    max_attempts: int = Field(3, ge=1, le=10)
    valid_for_days: Optional[int] = Field(None, gt=0)
    auto_assign_visitors: bool = False  
    auto_assign_contractors: bool = False  
    required_for_roles: List[str] = []
    estimated_duration_minutes: int = Field(15, ge=1, le=480)
    version: str = Field("1.0", max_length=20)

    @validator("required_for_roles")
    def validate_roles(cls, v):
        allowed_roles = ["admin", "manager", "user"]
        for role in v:
            if role not in allowed_roles:
                raise ValueError(f"Role '{role}' not allowed. Must be one of: {', '.join(allowed_roles)}")
        return v

    @validator("category")
    def validate_category(cls, v):
        if v:
            allowed_categories = [
                "induction", "safety", "compliance", "equipment", "operations",
                "emergency", "environmental", "quality", "other"
            ]
            if v not in allowed_categories:
                raise ValueError(f"Category must be one of: {', '.join(allowed_categories)}")
        return v

class TrainingModuleCreate(TrainingModuleBase):
    company_id: Optional[int] = None  # Will be set from current user's company

class TrainingModuleUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    is_required: Optional[bool] = None
    has_questionnaire: Optional[bool] = None
    passing_score: Optional[int] = Field(None, ge=0, le=100)
    max_attempts: Optional[int] = Field(None, ge=1, le=10)
    valid_for_days: Optional[int] = Field(None, gt=0)
    auto_assign_visitors: Optional[bool] = None
    auto_assign_contractors: Optional[bool] = None
    required_for_roles: Optional[List[str]] = None
    estimated_duration_minutes: Optional[int] = Field(None, ge=1, le=480)
    is_active: Optional[bool] = None

class TrainingModuleInDBBase(TrainingModuleBase):
    id: int
    company_id: int
    is_active: bool
    published_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class TrainingModule(TrainingModuleInDBBase):
    pass

class TrainingModuleWithDetails(TrainingModule):
    """Training module with related content"""
    creator: Optional[UserSummary] = None
    slide_count: int = 0
    question_count: int = 0
    is_published: bool = False
    is_archived: bool = False

class TrainingModuleSummary(BaseModel):
    """Lightweight module info for lists"""
    id: int
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    estimated_duration_minutes: int
    has_questionnaire: bool
    is_published: bool
    slide_count: int = 0
    question_count: int = 0
    
    model_config = ConfigDict(from_attributes=True)

# ===== TRAINING SLIDE SCHEMAS =====

class TrainingSlideBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: Optional[str] = None
    bullet_points: List[str] = []
    order: int = Field(1, ge=1)
    auto_advance: bool = False
    auto_advance_seconds: Optional[int] = Field(None, ge=5, le=60)
    estimated_read_time_seconds: int = Field(30, ge=10, le=300)
    notes: Optional[str] = None
    
    # Image support
    image_url: Optional[str] = Field(None, max_length=500)
    image_alt_text: Optional[str] = Field(None, max_length=200)
    image_caption: Optional[str] = Field(None, max_length=300)
    image_position: str = Field("top", pattern="^(top|bottom|left|right)$")

    @validator("bullet_points")
    def validate_bullet_points(cls, v):
        if len(v) > 10:
            raise ValueError("Maximum 10 bullet points allowed per slide")
        return [point.strip() for point in v if point.strip()]

class TrainingSlideCreate(TrainingSlideBase):
    training_module_id: int

class TrainingSlideUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    bullet_points: Optional[List[str]] = None
    order: Optional[int] = Field(None, ge=1)
    auto_advance: Optional[bool] = None
    auto_advance_seconds: Optional[int] = Field(None, ge=5, le=60)
    estimated_read_time_seconds: Optional[int] = Field(None, ge=10, le=300)
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    
    # Image support
    image_url: Optional[str] = Field(None, max_length=500)
    image_alt_text: Optional[str] = Field(None, max_length=200)
    image_caption: Optional[str] = Field(None, max_length=300)
    image_position: Optional[str] = Field(None, pattern="^(top|bottom|left|right)$")

class TrainingSlideInDBBase(TrainingSlideBase):
    id: int
    training_module_id: int
    is_active: bool
    slide_type: str
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class TrainingSlide(TrainingSlideInDBBase):
    pass

class TrainingSlideForViewer(BaseModel):
    """Slide formatted for training viewer"""
    id: int
    title: str
    content: Optional[str] = None
    bullet_points: List[str] = []
    order: int
    estimated_read_time_seconds: int
    auto_advance: bool
    auto_advance_seconds: Optional[int] = None
    image: Optional[Dict[str, Any]] = None  # Image details if present
    
    class Config:
        from_attributes = True

# ===== TRAINING QUESTION SCHEMAS =====

class TrainingQuestionOptionBase(BaseModel):
    option_text: str = Field(..., min_length=1, max_length=500)
    explanation: Optional[str] = Field(None, max_length=1000)
    order: int = Field(1, ge=1)
    is_correct: bool = False

class TrainingQuestionOptionCreate(TrainingQuestionOptionBase):
    training_question_id: Optional[int] = None  # Set when creating question

class TrainingQuestionOptionUpdate(BaseModel):
    option_text: Optional[str] = Field(None, min_length=1, max_length=500)
    explanation: Optional[str] = Field(None, max_length=1000)
    order: Optional[int] = Field(None, ge=1)
    is_correct: Optional[bool] = None
    is_active: Optional[bool] = None

class TrainingQuestionOptionInDBBase(TrainingQuestionOptionBase):
    id: int
    training_question_id: int
    is_active: bool
    option_type: str
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class TrainingQuestionOption(TrainingQuestionOptionInDBBase):
    pass

class TrainingQuestionOptionForViewer(BaseModel):
    """Option formatted for training viewer (without correct answers)"""
    id: int
    text: str
    letter: str  # A, B, C, D
    order: int
    image_url: Optional[str] = None

class TrainingQuestionBase(BaseModel):
    question_text: str = Field(..., min_length=10, max_length=2000)
    explanation: Optional[str] = Field(None, max_length=2000)
    order: int = Field(1, ge=1)
    is_required: bool = True
    question_type: str = Field("multiple_choice", pattern="^(multiple_choice|true_false|text)$")
    points: int = Field(1, ge=1, le=10)
    randomize_options: bool = False
    allow_multiple_answers: bool = False
    difficulty_level: str = Field("medium", pattern="^(easy|medium|hard)$")
    tags: List[str] = []

    @validator("tags")
    def validate_tags(cls, v):
        if len(v) > 5:
            raise ValueError("Maximum 5 tags allowed per question")
        return [tag.strip().lower() for tag in v if tag.strip()]

class TrainingQuestionCreate(TrainingQuestionBase):
    training_module_id: int
    options: List[TrainingQuestionOptionCreate] = []
    
    @validator("options")
    def validate_options(cls, v, values):
        if values.get("question_type") == "multiple_choice":
            if len(v) < 2:
                raise ValueError("Multiple choice questions must have at least 2 options")
            if len(v) > 6:
                raise ValueError("Maximum 6 options allowed per question")
            
            correct_count = sum(1 for opt in v if opt.is_correct)
            allow_multiple = values.get("allow_multiple_answers", False)
            
            if not allow_multiple and correct_count != 1:
                raise ValueError("Must have exactly one correct answer (unless multiple answers allowed)")
            elif allow_multiple and correct_count < 1:
                raise ValueError("Must have at least one correct answer")
        
        return v

class TrainingQuestionUpdate(BaseModel):
    question_text: Optional[str] = Field(None, min_length=10, max_length=2000)
    explanation: Optional[str] = Field(None, max_length=2000)
    order: Optional[int] = Field(None, ge=1)
    is_required: Optional[bool] = None
    points: Optional[int] = Field(None, ge=1, le=10)
    randomize_options: Optional[bool] = None
    allow_multiple_answers: Optional[bool] = None
    difficulty_level: Optional[str] = Field(None, pattern="^(easy|medium|hard)$")
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None

class TrainingQuestionInDBBase(TrainingQuestionBase):
    id: int
    training_module_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class TrainingQuestion(TrainingQuestionInDBBase):
    pass

class TrainingQuestionWithOptions(TrainingQuestion):
    """Question with all options (for admin view)"""
    options: List[TrainingQuestionOption] = []

class TrainingQuestionForViewer(BaseModel):
    """Question formatted for training viewer (without correct answers)"""
    id: int
    question_text: str
    question_type: str
    allow_multiple_answers: bool
    randomize_options: bool
    points: int
    order: int
    options: List[TrainingQuestionOptionForViewer] = []

# ===== TRAINING RECORD SCHEMAS =====

class TrainingRecordBase(BaseModel):
    entity_type: str = Field(..., pattern="^(user|visitor|contractor)$")
    entity_id: int
    assignment_reason: Optional[str] = Field(None, max_length=100)

class TrainingRecordCreate(TrainingRecordBase):
    training_module_id: int
    assigned_by: Optional[int] = None  # Will be set from current user

class TrainingRecordUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(assigned|in_progress|completed|failed|expired)$")
    assignment_reason: Optional[str] = Field(None, max_length=100)

class TrainingRecordInDBBase(TrainingRecordBase):
    id: int
    training_module_id: int
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    current_attempt: int
    best_score: Optional[float] = None
    passing_score_required: float
    assigned_by: Optional[int] = None
    assigned_at: datetime
    time_spent_minutes: int
    slides_viewed: List[int] = []
    certificate_issued: bool
    certificate_url: Optional[str] = None
    validation_code: Optional[str] = None
    module_version: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class TrainingRecord(TrainingRecordInDBBase):
    pass

class TrainingRecordWithDetails(TrainingRecord):
    """Training record with related info"""
    module: Optional[TrainingModuleSummary] = None
    assigner: Optional[UserSummary] = None
    entity_info: Optional[Dict[str, Any]] = None  # User/visitor/contractor details
    is_completed: bool = False
    is_passed: bool = False
    is_expired: bool = False
    is_valid: bool = False
    attempts_remaining: int = 0

# ===== TRAINING OPERATIONS SCHEMAS =====

class StartTrainingRequest(BaseModel):
    """Request to start a training module"""
    training_record_id: int

class CompleteSlideRequest(BaseModel):
    """Request to mark a slide as viewed"""
    slide_id: int
    time_spent_seconds: int = Field(0, ge=0, le=600)

class SubmitAnswerRequest(BaseModel):
    """Request to submit an answer to a question"""
    question_id: int
    selected_option_ids: List[int] = Field(..., min_items=1, max_items=6)
    time_spent_seconds: int = Field(0, ge=0, le=600)

class CompleteTrainingRequest(BaseModel):
    """Request to complete a training module"""
    training_record_id: int
    completion_notes: Optional[str] = Field(None, max_length=1000)

# ===== TRAINING PROGRESS SCHEMAS =====

class TrainingProgress(BaseModel):
    """Current training progress"""
    training_record_id: int
    module_title: str
    status: str
    progress_percentage: float = Field(0, ge=0, le=100)
    current_slide: Optional[int] = None
    slides_completed: int = 0
    total_slides: int = 0
    questions_answered: int = 0
    total_questions: int = 0
    time_spent_minutes: int = 0
    started_at: Optional[datetime] = None
    can_continue: bool = True

class TrainingAttemptSummary(BaseModel):
    """Summary of a training attempt"""
    attempt_number: int
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_minutes: int
    final_score: Optional[float] = None
    passed: bool
    questions_answered: int
    questions_correct: int

class TrainingStats(BaseModel):
    """Training statistics for reporting"""
    total_modules: int
    published_modules: int
    completions_this_period: int
    active_assignments: int
    completion_rate: float = Field(0, ge=0, le=100)
    average_score: float = Field(0, ge=0, le=100)
    period_days: int = 30

# ===== BULK OPERATIONS SCHEMAS =====

class BulkAssignTrainingRequest(BaseModel):
    """Request to assign training to multiple entities"""
    training_module_id: int
    assignments: List[TrainingRecordCreate] = Field(..., min_items=1, max_items=50)
    
    @validator("assignments")
    def validate_assignments(cls, v):
        if len(v) > 50:
            raise ValueError("Maximum 50 assignments per bulk operation")
        return v

class TrainingModulePublishRequest(BaseModel):
    """Request to publish a training module"""
    training_module_id: int
    auto_assign_existing: bool = True  # Auto-assign to existing users/visitors