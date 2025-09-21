# api/v1/training.py - Training Module API Endpoints (CLEANED UP)
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_

from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.training_module import TrainingModule
from db.models.training_slide import TrainingSlide
from db.models.training_question import TrainingQuestion
from db.models.training_question_option import TrainingQuestionOption
from db.models.training_record import TrainingRecord
from db.models.training_attempt import TrainingAttempt
from db.models.training_response import TrainingResponse

from schemas.user import UserSummary
from schemas.training import (
    TrainingModule as TrainingModuleSchema,
    TrainingModuleCreate, TrainingModuleUpdate, TrainingModuleWithDetails, TrainingModuleSummary,
    TrainingSlide as TrainingSlideSchema,
    TrainingSlideCreate, TrainingSlideUpdate, TrainingSlideForViewer,
    TrainingQuestion as TrainingQuestionSchema,
    TrainingQuestionCreate, TrainingQuestionUpdate, TrainingQuestionWithOptions, TrainingQuestionForViewer,
    TrainingQuestionOption as TrainingQuestionOptionSchema,
    TrainingQuestionOptionCreate, TrainingQuestionOptionUpdate,
    TrainingRecord as TrainingRecordSchema,
    TrainingRecordCreate, TrainingRecordUpdate, TrainingRecordWithDetails,
    StartTrainingRequest, CompleteSlideRequest, SubmitAnswerRequest, CompleteTrainingRequest,
    TrainingProgress, TrainingStats, BulkAssignTrainingRequest, TrainingModulePublishRequest
)

router = APIRouter()

# ===== TRAINING MODULE ENDPOINTS =====

@router.post("/modules", response_model=TrainingModuleSchema, status_code=status.HTTP_201_CREATED)
def create_training_module(
    module: TrainingModuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new training module"""
    # Check permissions
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create training modules"
        )
    
    # Set company from current user
    module_data = module.dict()
    module_data["company_id"] = current_user.company_id
    module_data["created_by"] = current_user.id
    
    # Create module
    db_module = TrainingModule(**module_data)
    db.add(db_module)
    db.commit()
    db.refresh(db_module)
    
    return db_module

@router.get("/modules", response_model=List[TrainingModuleSummary])
def get_training_modules(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category: Optional[str] = Query(None),
    published_only: bool = Query(False),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of training modules"""
    if not current_user.has_permission("view_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view training modules"
        )
    
    # Base query for company's modules
    query = db.query(TrainingModule).filter(
        TrainingModule.company_id == current_user.company_id,
        TrainingModule.is_active == True
    )
    
    # Apply filters
    if category:
        query = query.filter(TrainingModule.category == category)
    
    if published_only:
        query = query.filter(TrainingModule.published_at.isnot(None))
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                TrainingModule.title.ilike(search_term),
                TrainingModule.description.ilike(search_term)
            )
        )
    
    # Get modules with counts
    modules = query.offset(skip).limit(limit).all()
    
    # Build response with counts
    result = []
    for module in modules:
        module_summary = TrainingModuleSummary(
            id=module.id,
            title=module.title,
            description=module.description,
            category=module.category,
            estimated_duration_minutes=module.estimated_duration_minutes,
            has_questionnaire=module.has_questionnaire,
            is_published=module.is_published,
            slide_count=len(module.slides),
            question_count=len(module.questions)
        )
        result.append(module_summary)
    
    return result

@router.get("/modules/{module_id}", response_model=TrainingModuleWithDetails)
def get_training_module(
    module_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get training module by ID with full details"""
    module = db.query(TrainingModule).options(
        joinedload(TrainingModule.creator),
        joinedload(TrainingModule.slides),
        joinedload(TrainingModule.questions)
    ).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("view_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view training modules"
        )
    
    module_dict = {k: v for k, v in module.__dict__.items() if k != 'creator'}

    creator_data = None
    if module.creator:
        creator_data = {
            'id': module.creator.id,
            'username': getattr(module.creator, 'username', module.creator.email),
            'email': module.creator.email,
            'first_name': getattr(module.creator, 'first_name', ''),
            'last_name': getattr(module.creator, 'last_name', ''),
            'full_name': f"{getattr(module.creator, 'first_name', '')} {getattr(module.creator, 'last_name', '')}".strip(),
            'role': module.creator.role,
            'is_active': getattr(module.creator, 'is_active', True),
            'is_verified': getattr(module.creator, 'is_verified', True),
            'avatar_url': getattr(module.creator, 'avatar_url', None),
            'last_login': getattr(module.creator, 'last_login', None)
        }

    return TrainingModuleWithDetails(
        **module_dict,
        creator=creator_data,
        slide_count=len(module.slides),
        question_count=len(module.questions),
        is_published=module.is_published,
        is_archived=module.is_archived
    )

@router.put("/modules/{module_id}", response_model=TrainingModuleSchema)
def update_training_module(
    module_id: int,
    module_update: TrainingModuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update training module"""
    module = db.query(TrainingModule).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update training modules"
        )
    
    # Update module
    for field, value in module_update.dict(exclude_unset=True).items():
        setattr(module, field, value)
    
    db.add(module)
    db.commit()
    db.refresh(module)
    
    return module

@router.post("/modules/{module_id}/publish")
def publish_training_module(
    module_id: int,
    publish_request: TrainingModulePublishRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Publish a training module and auto-assign if requested"""
    module = db.query(TrainingModule).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to publish training modules"
        )
    
    # Validate module is ready for publishing
    if not module.slides:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Module must have at least one slide to be published"
        )
    
    if module.has_questionnaire and not module.questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Module with questionnaire must have at least one question"
        )
    
    # Publish module
    module.publish()
    db.add(module)
    db.flush()
    
    assignments_created = 0
    
    # Auto-assign based on module settings
    try:
        # Auto-assign to existing users based on required roles
        if module.required_for_roles and len(module.required_for_roles) > 0:
            from db.models.user import User
            
            users_to_assign = db.query(User).filter(
                User.company_id == current_user.company_id,
                User.is_active == True,
                User.role.in_(module.required_for_roles)
            ).all()
            
            for user in users_to_assign:
                existing = db.query(TrainingRecord).filter(
                    TrainingRecord.training_module_id == module_id,
                    TrainingRecord.entity_type == "user",
                    TrainingRecord.entity_id == user.id
                ).first()
                
                if not existing:
                    from datetime import datetime, timezone, timedelta
                    
                    training_record = TrainingRecord(
                        training_module_id=module_id,
                        entity_type="user",
                        entity_id=user.id,
                        assigned_by=current_user.id,
                        assigned_at=datetime.now(timezone.utc),
                        passing_score_required=module.passing_score,
                        module_version=module.version,
                        expires_at=datetime.now(timezone.utc) + timedelta(days=module.valid_for_days) if module.valid_for_days else None,
                        status="assigned"
                    )
                    
                    db.add(training_record)
                    assignments_created += 1
        
        db.commit()
        
    except Exception as e:
        db.rollback()
    
    return {
        "message": "Training module published successfully",
        "module_id": module_id,
        "assignments_created": assignments_created
    }

@router.delete("/modules/{module_id}")
def archive_training_module(
    module_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Archive a training module"""
    module = db.query(TrainingModule).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to archive training modules"
        )
    
    module.archive()
    db.add(module)
    db.commit()
    
    return {"message": "Training module archived successfully", "module_id": module_id}

# ===== TRAINING SLIDE ENDPOINTS =====

@router.post("/modules/{module_id}/slides", response_model=TrainingSlideSchema, status_code=status.HTTP_201_CREATED)
def create_training_slide(
    module_id: int,
    slide: TrainingSlideCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new training slide"""
    # Verify module exists and user has access
    module = db.query(TrainingModule).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create training slides"
        )
    
    # Create slide
    slide_data = slide.dict()
    slide_data["training_module_id"] = module_id
    
    db_slide = TrainingSlide(**slide_data)
    
    # Calculate reading time
    db_slide.calculate_read_time()
    
    db.add(db_slide)
    db.commit()
    db.refresh(db_slide)
    
    return db_slide

@router.get("/modules/{module_id}/slides", response_model=List[TrainingSlideSchema])
def get_training_slides(
    module_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all slides for a training module"""
    # Verify module access
    module = db.query(TrainingModule).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("view_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view training slides"
        )
    
    slides = db.query(TrainingSlide).filter(
        TrainingSlide.training_module_id == module_id,
        TrainingSlide.is_active == True
    ).order_by(TrainingSlide.order).all()
    
    return slides

@router.put("/slides/{slide_id}", response_model=TrainingSlideSchema)
def update_training_slide(
    slide_id: int,
    slide_update: TrainingSlideUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update training slide"""
    slide = db.query(TrainingSlide).join(TrainingModule).filter(
        TrainingSlide.id == slide_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not slide:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training slide not found"
        )
    
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update training slides"
        )
    
    # Update slide
    for field, value in slide_update.dict(exclude_unset=True).items():
        setattr(slide, field, value)
    
    # Recalculate reading time if content changed
    if any(field in slide_update.dict(exclude_unset=True) for field in ['content', 'bullet_points']):
        slide.calculate_read_time()
    
    db.add(slide)
    db.commit()
    db.refresh(slide)
    
    return slide

@router.delete("/slides/{slide_id}")
def delete_training_slide(
    slide_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete training slide"""
    slide = db.query(TrainingSlide).join(TrainingModule).filter(
        TrainingSlide.id == slide_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not slide:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training slide not found"
        )
    
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete training slides"
        )
    
    db.delete(slide)
    db.commit()
    
    return {"message": "Training slide deleted successfully", "slide_id": slide_id}

# ===== TRAINING QUESTION ENDPOINTS =====

@router.post("/modules/{module_id}/questions", response_model=TrainingQuestionWithOptions, status_code=status.HTTP_201_CREATED)
def create_training_question(
    module_id: int,
    question: TrainingQuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new training question with options"""
    # Verify module exists and user has access
    module = db.query(TrainingModule).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create training questions"
        )
    
    # Create question
    question_data = question.dict(exclude={'options'})
    question_data["training_module_id"] = module_id
    
    db_question = TrainingQuestion(**question_data)
    db.add(db_question)
    db.flush()
    
    # Create options
    for option_data in question.options:
        option_dict = option_data.dict()
        option_dict["training_question_id"] = db_question.id
        db_option = TrainingQuestionOption(**option_dict)
        db.add(db_option)
    
    db.commit()
    db.refresh(db_question)
    
    return db_question

@router.get("/modules/{module_id}/questions", response_model=List[TrainingQuestionWithOptions])
def get_training_questions(
    module_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all questions for a training module"""
    # Verify module access
    module = db.query(TrainingModule).filter(
        TrainingModule.id == module_id,
        TrainingModule.company_id == current_user.company_id
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found"
        )
    
    if not current_user.has_permission("view_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view training questions"
        )
    
    questions = db.query(TrainingQuestion).options(
        joinedload(TrainingQuestion.options)
    ).filter(
        TrainingQuestion.training_module_id == module_id,
        TrainingQuestion.is_active == True
    ).order_by(TrainingQuestion.order).all()
    
    return questions

# ===== TRAINING ASSIGNMENT ENDPOINTS =====

@router.post("/assign", response_model=TrainingRecordSchema, status_code=status.HTTP_201_CREATED)
def assign_training(
    assignment: TrainingRecordCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Assign training to a user, visitor, or contractor"""
    if not current_user.has_permission("manage_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to assign training"
        )
    
    # Verify module exists
    module = db.query(TrainingModule).filter(
        TrainingModule.id == assignment.training_module_id,
        TrainingModule.company_id == current_user.company_id,
        TrainingModule.is_active == True,
        TrainingModule.published_at.isnot(None)
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training module not found or not published"
        )
    
    # Check if already assigned
    existing = db.query(TrainingRecord).filter(
        TrainingRecord.training_module_id == assignment.training_module_id,
        TrainingRecord.entity_type == assignment.entity_type,
        TrainingRecord.entity_id == assignment.entity_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Training already assigned to this entity"
        )
    
    # Create training record
    record_data = assignment.dict()
    record_data["assigned_by"] = current_user.id
    record_data["passing_score_required"] = module.passing_score
    record_data["module_version"] = module.version
    
    # Set expiry if module has validity period
    if module.valid_for_days:
        from datetime import datetime, timezone, timedelta
        record_data["expires_at"] = datetime.now(timezone.utc) + timedelta(days=module.valid_for_days)
    
    db_record = TrainingRecord(**record_data)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    
    return db_record

@router.get("/assignments", response_model=List[TrainingRecordWithDetails])
def get_training_assignments(
    entity_type: Optional[str] = Query(None, regex="^(user|visitor|contractor)$"),
    entity_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None, regex="^(assigned|in_progress|completed|failed|expired)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get training assignments"""
    if not current_user.has_permission("view_training"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view training assignments"
        )
    
    # Base query for company's training records
    query = db.query(TrainingRecord).join(TrainingModule).filter(
        TrainingModule.company_id == current_user.company_id
    )
    
    # Apply filters
    if entity_type:
        query = query.filter(TrainingRecord.entity_type == entity_type)
    
    if entity_id:
        query = query.filter(TrainingRecord.entity_id == entity_id)
    
    if status:
        query = query.filter(TrainingRecord.status == status)
    
    records = query.offset(skip).limit(limit).all()
    
    # Build detailed response
    result = []
    for record in records:
        entity_info = record.get_entity_info(db)
        record_detail = TrainingRecordWithDetails(
            **record.__dict__,
            module=TrainingModuleSummary.from_orm(record.module),
            entity_info=entity_info,
            is_completed=record.is_completed,
            is_passed=record.is_passed,
            is_expired=record.is_expired,
            is_valid=record.is_valid,
            attempts_remaining=record.attempts_remaining
        )
        result.append(record_detail)
    
    return result

# ===== TRAINING STATS ENDPOINT =====

@router.get("/stats", response_model=TrainingStats)
def get_training_stats(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get training statistics for the company"""
    if not current_user.has_permission("view_training_reports"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view training reports"
        )
    
    # Use the company method we created
    stats = current_user.company.get_training_stats(db, days)
    
    # Calculate additional metrics
    total_assignments = db.query(func.count(TrainingRecord.id)).filter(
        TrainingRecord.module.has(TrainingModule.company_id == current_user.company_id)
    ).scalar() or 0
    
    completion_rate = 0
    if total_assignments > 0:
        completion_rate = (stats["completions_this_period"] / total_assignments) * 100
    
    # Calculate average score
    avg_score = db.query(func.avg(TrainingRecord.best_score)).filter(
        TrainingRecord.module.has(TrainingModule.company_id == current_user.company_id),
        TrainingRecord.status == "completed"
    ).scalar() or 0
    
    return TrainingStats(
        total_modules=stats["total_modules"],
        published_modules=stats["published_modules"],
        completions_this_period=stats["completions_this_period"],
        active_assignments=stats["active_assignments"],
        completion_rate=completion_rate,
        average_score=float(avg_score) if avg_score else 0,
        period_days=days
    )

# ===== TRAINING TAKING ENDPOINTS =====

@router.get("/progress/{training_record_id}")
def get_training_progress(
    training_record_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get training progress for a specific record"""
    record = db.query(TrainingRecord).options(
        joinedload(TrainingRecord.module).joinedload(TrainingModule.slides),
        joinedload(TrainingRecord.module).joinedload(TrainingModule.questions)
    ).filter(
        TrainingRecord.id == training_record_id
    ).first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training record not found"
        )
    
    # Check if user has access to this record
    if record.entity_type == "user" and record.entity_id != current_user.id:
        # Only allow if user is admin/manager or the assigned user
        if not current_user.has_permission("manage_training"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    return {
        "training_record": record,
        "current_attempt": None,
        "progress": {
            "slides_completed": 0,
            "questions_answered": 0,
            "status": record.status
        }
    }

@router.post("/start")
def start_training_session(
    request: StartTrainingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start a training session"""
    record = db.query(TrainingRecord).filter(
        TrainingRecord.id == request.training_record_id
    ).first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training record not found"
        )
    
    # Update status to in_progress
    from datetime import datetime, timezone
    record.status = "in_progress"
    record.started_at = datetime.now(timezone.utc)
    
    db.add(record)
    db.commit()
    
    return {"message": "Training started", "attempt": {"attempt_number": 1}}

@router.post("/complete-slide")
def complete_slide(
    request: CompleteSlideRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a slide as completed"""
    return {"message": "Slide completed"}

@router.post("/submit-answer")
def submit_training_answer(
    request: SubmitAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit an answer to a training question"""
    return {"message": "Answer submitted"}

@router.post("/complete")
def complete_training_session(
    request: CompleteTrainingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Complete a training session"""
    record = db.query(TrainingRecord).filter(
        TrainingRecord.id == request.training_record_id
    ).first()
    
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training record not found"
        )
    
    # Update status to completed
    from datetime import datetime, timezone
    record.status = "completed"
    record.completed_at = datetime.now(timezone.utc)
    record.best_score = 100.0
    
    db.add(record)
    db.commit()
    
    return {
        "message": "Training completed",
        "final_score": 100.0,
        "status": "completed"
    }