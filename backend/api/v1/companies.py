# app/api/v1/companies.py - Updated to use new authentication dependencies
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, not_

from db.models.company import Company
from db.models.subscription import Subscription
from schemas.company import (
    CompanyCreate, CompanyUpdate, Company as CompanySchema, 
    CompanyStats, CompanyWithSubscription, CompanySubscriptionUpdate
)
from api.deps import get_db, get_current_user, get_current_contractor, get_current_user_or_contractor
from db.models.user import User
from db.models.contractor import Contractor
from db.models.block import VineyardBlock

from db.models.task import Task
import logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=CompanySchema, status_code=status.HTTP_201_CREATED)
def create_company(
    company_in: CompanyCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can create companies
):
    """
    Create a new company. Only available to company users.
    """
    # Check if company with same number already exists
    if company_in.company_number:
        existing_company = db.query(Company).filter(Company.company_number == company_in.company_number).first()
        if existing_company:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company with this number already exists"
            )
    
    # Check if company with same name already exists
    existing_company = db.query(Company).filter(Company.name == company_in.name).first()
    if existing_company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company with this name already exists"
        )
    
    # Verify subscription exists
    subscription = db.query(Subscription).filter(Subscription.id == company_in.subscription_id).first()
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid subscription ID"
        )
    
    # Create company
    db_company = Company(**company_in.dict())
    
    # Start trial if requested and subscription supports it
    if company_in.start_trial and subscription.trial_enabled:
        db_company.start_trial(company_in.trial_days)
    
    # Calculate initial pricing
    db_company.calculate_current_pricing()
    
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company

@router.get("/public", response_model=List[CompanySchema])
def read_companies_public(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """
    Retrieve companies for public registration (no authentication required).
    Returns basic company info for registration dropdown.
    """
    companies = db.query(Company).filter(Company.is_active == True).offset(skip).limit(limit).all()
    return companies

@router.post("/public", response_model=CompanySchema, status_code=status.HTTP_201_CREATED)
def create_company_public(
    company_in: CompanyCreate, 
    db: Session = Depends(get_db)
):
    """
    Create a new company during registration (no authentication required).
    """
    # Check if company with same number already exists
    if company_in.company_number:
        existing_company = db.query(Company).filter(Company.company_number == company_in.company_number).first()
        if existing_company:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company with this number already exists"
            )
    
    # Check if company with same name already exists
    existing_company = db.query(Company).filter(Company.name == company_in.name).first()
    if existing_company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company with this name already exists"
        )
    
    # Verify subscription exists and is public
    subscription = db.query(Subscription).filter(
        Subscription.id == company_in.subscription_id,
        Subscription.is_active == True,
        Subscription.is_public == True
    ).first()
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unavailable subscription"
        )
    
    # Create company
    db_company = Company(**company_in.dict())
    
    # Start trial if requested and subscription supports it
    if company_in.start_trial and subscription.trial_enabled:
        db_company.start_trial(company_in.trial_days)
    
    # Calculate initial pricing
    db_company.calculate_current_pricing()
    
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company

@router.get("/", response_model=List[CompanyWithSubscription])
def read_companies(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """
    Retrieve companies with subscription details.
    Available to both company users and contractors.
    """
    companies = db.query(Company).options(
        joinedload(Company.subscription)
    ).offset(skip).limit(limit).all()
    return companies

@router.get("/current", response_model=CompanySchema)
def get_current_company(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users have companies
):
    """
    Get the current company user's company.
    Only available to company users (contractors don't have companies).
    """
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any company"
        )
    
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    return company

@router.get("/{company_id}", response_model=CompanyWithSubscription)
def read_company(
    company_id: int, 
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """
    Get a specific company by id with subscription details.
    Available to both company users and contractors with appropriate permissions.
    """
    # Check permissions based on user type
    if isinstance(current_user_or_contractor, User):
        # Company user logic
        user = current_user_or_contractor
        if user.role != "admin" and user.company_id != company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    else:
        # Contractor logic - contractors might have different access rules
        contractor = current_user_or_contractor
        # TODO: Define contractor access rules for companies
        # For now, allow all contractors to view companies
        # You might want to restrict this based on business logic
        pass
    
    company = db.query(Company).options(
        joinedload(Company.subscription)
    ).filter(Company.id == company_id).first()
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    return company

@router.put("/{company_id}", response_model=CompanyWithSubscription)
def update_company(
    company_id: int,
    company_in: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can update companies
):
    """
    Update a company. Only available to company users.
    """
    # Check permissions (admin only for subscription changes, company admin for basic changes)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Only system admin or company owner can update
    if current_user.role != "admin" and current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Only system admin can change subscription
    if company_in.subscription_id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can change subscriptions"
        )
    
    # Check company number uniqueness if it's being updated
    if company_in.company_number and company_in.company_number != company.company_number:
        existing_company = db.query(Company).filter(
            Company.company_number == company_in.company_number
        ).first()
        if existing_company:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company with this number already exists"
            )
    
    # Verify new subscription if being changed
    if company_in.subscription_id:
        subscription = db.query(Subscription).filter(Subscription.id == company_in.subscription_id).first()
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid subscription ID"
            )
    
    # Update company attributes
    for field, value in company_in.dict(exclude_unset=True).items():
        setattr(company, field, value)
    
    # Recalculate pricing if subscription or hectares changed
    if company_in.subscription_id or company_in.total_hectares:
        company.calculate_current_pricing()
    
    db.add(company)
    db.commit()
    db.refresh(company)
    return company

@router.put("/{company_id}/subscription", response_model=CompanyWithSubscription)
def update_company_subscription(
    company_id: int,
    subscription_update: CompanySubscriptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users, specifically admins
):
    """
    Update company subscription (admin only).
    Only available to company admin users.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can update subscriptions"
        )
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Verify subscription exists
    subscription = db.query(Subscription).filter(Subscription.id == subscription_update.subscription_id).first()
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid subscription ID"
        )
    
    # Update subscription
    company.subscription_id = subscription_update.subscription_id
    if subscription_update.total_hectares is not None:
        company.total_hectares = subscription_update.total_hectares
    
    # Start trial if requested
    if subscription_update.start_trial and subscription.trial_enabled:
        trial_days = subscription_update.trial_days or subscription.trial_days
        company.start_trial(trial_days)
    
    # Recalculate pricing
    company.calculate_current_pricing()
    
    db.add(company)
    db.commit()
    db.refresh(company)
    return company

@router.get("/current/stats")  # Remove response_model temporarily
def get_current_company_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users have company stats
):
    """
    Get statistics for the current user's company using subscription limits.
    Only available to company users (contractors don't have companies).
    """
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any company"
        )
    
    company_id = current_user.company_id
    logger.info(f"Getting stats for current user's company_id: {company_id}")
    
    # Get the company with subscription
    company = db.query(Company).options(
        joinedload(Company.subscription)
    ).filter(Company.id == company_id).first()
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
        
    if not company.subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company subscription not found"
        )
    
    logger.info(f"Found company: {company.name} with subscription: {company.subscription.display_name}")
    
    # Count vineyard blocks
    block_count = 0
    try:
        block_count = db.query(func.count(VineyardBlock.id)).filter(
            VineyardBlock.company_id == company_id
        ).scalar() or 0
    except Exception as e:
        logger.warning(f"Error counting blocks: {e}")
    
    # Get all block IDs for this company
    company_blocks = []
    company_block_ids = []
    try:
        company_blocks = db.query(VineyardBlock).filter(
            VineyardBlock.company_id == company_id
        ).all()
        company_block_ids = [block.id for block in company_blocks]
    except Exception as e:
        logger.warning(f"Error getting company blocks: {e}")
    
    # Get all user IDs for this company
    company_users = []
    company_user_ids = []
    try:
        company_users = db.query(User).filter(
            User.company_id == company_id
        ).all()
        company_user_ids = [user.id for user in company_users]
    except Exception as e:
        logger.warning(f"Error getting company users: {e}")
    
       
    # Count tasks
    task_count = 0
    if company_user_ids:
        try:
            task_count = db.query(func.count(Task.id)).filter(
                and_(
                    or_(
                        Task.created_by.in_(company_user_ids),
                        Task.assigned_to.in_(company_user_ids)
                    ),
                    Task.status != "completed"
                )
            ).scalar() or 0
        except Exception as e:
            logger.warning(f"Error counting tasks: {e}")
    
    # Count team members
    user_count = len(company_users)
    
    # Get limits from subscription
    subscription = company.subscription
    max_users = subscription.max_users
    max_storage_gb = float(subscription.max_storage_gb) if subscription.max_storage_gb != -1 else -1
    
    # Calculate usage percentages
    user_usage_percent = 0.0
    try:
        user_usage_percent = subscription.get_usage_percentage(user_count, 'max_users')
    except Exception as e:
        logger.warning(f"Error calculating user usage percentage: {e}")
    
    storage_usage_percent = 0.0  # TODO: Calculate actual storage usage
    
    # Get enabled features from subscription
    enabled_features = []
    try:
        enabled_features = subscription.features.get("enabled_features", []) if subscription.features else []
    except Exception as e:
        logger.warning(f"Error getting enabled features: {e}")
    
    result = {

        "task_count": task_count,
        "user_count": user_count,
        "storage_used_gb": 0.0,  # TODO: Calculate actual storage usage
        
        # Limits from subscription
        "max_users": max_users,
        "max_storage_gb": max_storage_gb,
        
        # Usage percentages
        "user_usage_percent": user_usage_percent,
        "storage_usage_percent": storage_usage_percent,
        
        # Feature access
        "enabled_features": enabled_features,
        
        # Subscription info
        "subscription_name": subscription.name,
        "subscription_display_name": subscription.display_name
    }
    
    logger.info(f"Final result: {result}")
    return result