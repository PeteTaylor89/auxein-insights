# app/api/v1/admin.py - Admin endpoints updated for subscription table
from datetime import datetime, timedelta
from typing import Any, Optional
import secrets
import re
from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, validator

from api.deps import get_db, get_current_user
from core.security.password import get_password_hash, generate_random_password
from db.models.user import User
from db.models.company import Company
from db.models.subscription import Subscription
from schemas.company import Company as CompanySchema
from schemas.user import User as UserSchema
from core.email_templates import send_welcome_email
from core.email import send_admin_welcome_email

router = APIRouter()

class CompanyAdminCreate(BaseModel):
    """Schema for creating a company with admin user"""
    
    # Company details
    company_name: str
    company_address: Optional[str] = None
    company_number: Optional[str] = None
    subscription_id: int = 1  # Default to free subscription
    total_hectares: float = 0.0
    
    # Admin user details
    admin_email: EmailStr
    admin_username: str
    admin_first_name: str
    admin_last_name: str
    admin_phone: Optional[str] = None
    
    # Options
    send_welcome_email: bool = True
    generate_password: bool = True
    custom_password: Optional[str] = None
    start_trial: bool = False
    trial_days: int = 14
    
    @validator("company_name")
    def validate_company_name(cls, v):
        if len(v.strip()) < 2:
            raise ValueError("Company name must be at least 2 characters")
        if len(v) > 100:
            raise ValueError("Company name must be less than 100 characters")
        return v.strip()
    
    @validator("subscription_id")
    def validate_subscription_id(cls, v):
        if v < 1:
            raise ValueError("Subscription ID must be valid")
        return v
    
    @validator("admin_username")
    def validate_username(cls, v):
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Username must be less than 50 characters")
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("Username can only contain letters, numbers, underscores, and hyphens")
        return v.lower()
    
    @validator("custom_password")
    def validate_custom_password(cls, v, values):
        if not values.get("generate_password", True) and not v:
            raise ValueError("Custom password is required when generate_password is False")
        if v and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
    
    @validator("trial_days")
    def validate_trial_days(cls, v):
        if v < 0 or v > 90:
            raise ValueError("Trial days must be between 0 and 90")
        return v

class CompanyAdminResponse(BaseModel):
    """Response for company and admin creation"""
    
    company: CompanySchema
    admin_user: UserSchema
    generated_password: Optional[str] = None
    welcome_email_sent: bool
    trial_end_date: Optional[datetime] = None
    
    class Config:
        orm_mode = True

def generate_company_slug(name: str, db: Session) -> str:
    """Generate a unique slug for the company"""
    base_slug = re.sub(r'[^a-zA-Z0-9-]', '-', name.lower())
    base_slug = re.sub(r'-+', '-', base_slug).strip('-')
    
    # Ensure uniqueness
    counter = 1
    slug = base_slug
    
    while db.query(Company).filter(Company.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    return slug

@router.post("/create-company-admin")
def create_company_with_admin(
    company_admin_data: CompanyAdminCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Create a new company with an admin user.
    Only accessible by system administrators.
    """
    # Check if current user is system admin
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can create companies"
        )
    
    # Verify subscription exists
    subscription = db.query(Subscription).filter(Subscription.id == company_admin_data.subscription_id).first()
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid subscription ID"
        )
    
    # Check if company name already exists
    existing_company = db.query(Company).filter(Company.name == company_admin_data.company_name).first()
    if existing_company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company with this name already exists"
        )
    
    # Check if company number already exists (if provided)
    if company_admin_data.company_number:
        existing_company = db.query(Company).filter(Company.company_number == company_admin_data.company_number).first()
        if existing_company:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company with this number already exists"
            )
    
    # Check if admin email already exists
    existing_user = db.query(User).filter(User.email == company_admin_data.admin_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    # Check if admin username already exists
    existing_user = db.query(User).filter(User.username == company_admin_data.admin_username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken"
        )
    
    # Generate company slug
    company_slug = generate_company_slug(company_admin_data.company_name, db)
    
    # Create company
    company = Company(
        name=company_admin_data.company_name,
        address=company_admin_data.company_address,
        company_number=company_admin_data.company_number,
        slug=company_slug,
        subscription_id=company_admin_data.subscription_id,
        total_hectares=company_admin_data.total_hectares,
        created_by=current_user.id,
        is_active=True
    )
    
    # Start trial if requested and subscription supports it
    if company_admin_data.start_trial and subscription.trial_enabled:
        company.start_trial(company_admin_data.trial_days)
    
    # Calculate initial pricing
    company.calculate_current_pricing()
    
    db.add(company)
    db.flush()  # This gives us the company.id
    
    # Generate or use provided password
    if company_admin_data.generate_password:
        admin_password = generate_random_password()
    else:
        admin_password = company_admin_data.custom_password
    
    # Create admin user
    admin_user = User(
        email=company_admin_data.admin_email,
        username=company_admin_data.admin_username,
        hashed_password=get_password_hash(admin_password),
        first_name=company_admin_data.admin_first_name,
        last_name=company_admin_data.admin_last_name,
        phone=company_admin_data.admin_phone,
        role="admin",  # Company admin, not system admin
        company_id=company.id,
        is_verified=True,  # Pre-verified
        is_active=True,
        #created_at=datetime.utcnow()
    )
    
    db.add(admin_user)
    db.commit()  # Commit both records
    
    # Refresh to ensure we have all the data including IDs
    db.refresh(company)
    db.refresh(admin_user)
    
    # Verify we have IDs before proceeding
    if not company.id or not admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create company or admin user - database error"
        )
    
    # Send welcome email if requested
    welcome_email_sent = False
    if company_admin_data.send_welcome_email:
        try:
            background_tasks.add_task(
                send_admin_welcome_email,
                email=admin_user.email,
                username=admin_user.username,
                company_name=company.name,
                password=admin_password if company_admin_data.generate_password else None
            )
            welcome_email_sent = True
        except Exception as e:
            print(f"Failed to send welcome email: {e}")
    
    # Return response with safely accessible IDs
    return {
        "message": "Company and admin user created successfully",
        "company": {
            "id": company.id,
            "name": company.name,
            "subscription_id": company.subscription_id,
            "subscription_name": subscription.name,
            "subscription_display_name": subscription.display_name,
            "total_hectares": float(company.total_hectares),
            "current_monthly_amount": float(company.current_monthly_amount) if company.current_monthly_amount else 0.0,
            "slug": company.slug,
            "is_active": company.is_active,
            "created_at": company.created_at.isoformat() if company.created_at else None
        },
        "admin_user": {
            "id": admin_user.id,
            "email": admin_user.email,
            "username": admin_user.username,
            "first_name": admin_user.first_name,
            "last_name": admin_user.last_name,
            "role": admin_user.role,
            "is_active": admin_user.is_active,
            "is_verified": admin_user.is_verified,
            #"created_at": admin_user.created_at.isoformat() if admin_user.created_at else None
        },
        "generated_password": admin_password if company_admin_data.generate_password else None,
        "welcome_email_sent": welcome_email_sent,
        "trial_end_date": company.trial_end.isoformat() if company.trial_end else None
    }

@router.get("/companies", response_model=list[CompanySchema])
def list_all_companies(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    subscription_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    List all companies (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can list all companies"
        )
    
    query = db.query(Company)
    
    # Apply filters
    if search:
        query = query.filter(Company.name.ilike(f"%{search}%"))
    
    if subscription_id:
        query = query.filter(Company.subscription_id == subscription_id)
    
    companies = query.offset(skip).limit(limit).all()
    return companies

@router.get("/companies/{company_id}/users", response_model=list[UserSchema])
def list_company_users(
    company_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    List all users for a specific company (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can list company users"
        )
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    users = db.query(User).filter(User.company_id == company_id).offset(skip).limit(limit).all()
    return users

@router.put("/companies/{company_id}/subscription")
def update_company_subscription(
    company_id: int,
    subscription_id: int,
    total_hectares: Optional[float] = None,
    trial_days: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Update company subscription (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can update subscriptions"
        )
    
    # Verify subscription exists
    subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid subscription ID"
        )
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Update subscription
    company.subscription_id = subscription_id
    if total_hectares is not None:
        company.total_hectares = total_hectares
    
    # Start trial if requested and subscription supports it
    if trial_days and subscription.trial_enabled:
        company.start_trial(trial_days)
    
    # Recalculate pricing
    company.calculate_current_pricing()
    
    db.add(company)
    db.commit()
    
    return {
        "message": f"Company subscription updated to {subscription.display_name}",
        "subscription_name": subscription.name,
        "subscription_display_name": subscription.display_name,
        "monthly_cost": float(company.current_monthly_amount) if company.current_monthly_amount else 0.0
    }

@router.post("/companies/{company_id}/deactivate")
def deactivate_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Deactivate a company (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can deactivate companies"
        )
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    company.is_active = False
    company.subscription_status = "suspended"
    
    # Deactivate all users in the company
    db.query(User).filter(User.company_id == company_id).update({"is_active": False})
    
    db.commit()
    
    return {"message": "Company deactivated successfully"}

@router.post("/companies/{company_id}/reactivate")
def reactivate_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Reactivate a company (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can reactivate companies"
        )
    
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    company.is_active = True
    company.subscription_status = "active"
    
    # Reactivate all users in the company (except suspended ones)
    db.query(User).filter(
        User.company_id == company_id,
        User.is_suspended == False
    ).update({"is_active": True})
    
    db.commit()
    
    return {"message": "Company reactivated successfully"}

@router.get("/users", response_model=list[UserSchema])
def list_all_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    company_id: Optional[int] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    List all users across all companies (system admin only).
    """
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can list all users"
        )
    
    query = db.query(User)
    
    # Apply filters
    if search:
        query = query.filter(
            or_(
                User.first_name.ilike(f"%{search}%"),
                User.last_name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.username.ilike(f"%{search}%")
            )
        )
    
    if company_id:
        query = query.filter(User.company_id == company_id)
    
    if role:
        query = query.filter(User.role == role)
    
    if status:
        if status == "active":
            query = query.filter(User.is_active == True, User.is_suspended == False)
        elif status == "suspended":
            query = query.filter(User.is_suspended == True)
        elif status == "unverified":
            query = query.filter(User.is_verified == False)
    
    users = query.offset(skip).limit(limit).all()
    return users

@router.put("/users/{user_id}/role")
def update_user_role_admin(
    user_id: int,
    role_data: dict,  # Expecting {"role": "new_role"}
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Update user role (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can update user roles"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    new_role = role_data.get("role")
    if not new_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role is required"
        )
    
    allowed_roles = ["admin", "manager", "user"]
    if new_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(allowed_roles)}"
        )
    
    # Prevent changing the role of the current user to avoid locking themselves out
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role"
        )
    
    user.role = new_role
    db.add(user)
    db.commit()
    
    return {"message": f"User role updated to {new_role}"}

@router.post("/users/{user_id}/suspend")
def suspend_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Suspend a user (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can suspend users"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent suspending yourself
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot suspend yourself"
        )
    
    # Don't suspend if already suspended
    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already suspended"
        )
    
    user.is_suspended = True
    user.is_active = False  # Also set inactive when suspended
    db.add(user)
    db.commit()
    
    return {"message": f"User {user.username} has been suspended"}

@router.post("/users/{user_id}/unsuspend")
def unsuspend_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Unsuspend a user (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can unsuspend users"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Don't unsuspend if not suspended
    if not user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not suspended"
        )
    
    user.is_suspended = False
    user.is_active = True  # Reactivate when unsuspended
    db.add(user)
    db.commit()
    
    return {"message": f"User {user.username} has been unsuspended"}

@router.put("/users/{user_id}/status")
def update_user_status_admin(
    user_id: int,
    status_data: dict,  # Expecting {"status": "active" | "inactive"}
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Update user active status (system admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can update user status"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    new_status = status_data.get("status")
    if new_status not in ["active", "inactive"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'active' or 'inactive'"
        )
    
    # Prevent deactivating yourself
    if user.id == current_user.id and new_status == "inactive":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself"
        )
    
    user.is_active = (new_status == "active")
    db.add(user)
    db.commit()
    
    return {"message": f"User status updated to {new_status}"}