# app/api/v1/auth.py - Enhanced with email verification and password reset

from datetime import timedelta, datetime, timezone
from typing import Any, Optional, Union
import secrets
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, BackgroundTasks, Header
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel

from api.deps import get_db, get_current_user, get_current_contractor, get_current_user_or_contractor
from core.config import settings
from core.security.auth import create_access_token, create_refresh_token, decode_token
from core.security.password import get_password_hash, verify_password, validate_password
from db.models.user import User
from db.models.contractor import Contractor
from db.models.company import Company
from schemas.token import Token
from schemas.user import (
    UserCreate, User as UserSchema, UserWithCompany, 
    PasswordReset, PasswordResetConfirm, EmailVerification, UserProfileUpdate
)
from schemas.contractor import (
    ContractorCreate, ContractorUpdate, ContractorProfile, 
    Contractor as ContractorSchema
)
from core.email import (
    send_verification_email, send_password_reset_email,
    send_contractor_verification_email, send_contractor_welcome_email
) 
from jose import JWTError

router = APIRouter()

# Helper function for timezone-aware datetime
def get_utc_now():
    """Get current UTC time as timezone-aware datetime"""
    return datetime.now(timezone.utc)

def make_timezone_aware(dt):
    """Convert naive datetime to timezone-aware datetime"""
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

class EnhancedToken(Token):
    user_type: str  # "company_user" | "contractor"
    user_id: int
    username: str
    full_name: Optional[str] = None
    role: Optional[str] = None  # Only for company users
    company_id: Optional[int] = None  # For company users
    company_ids: Optional[list[int]] = None  # For contractors

@router.post("/register", response_model=UserSchema)
def create_user(
    user_in: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Any:
    """
    Create new user with email verification.
    """
    # Check if user with same email exists
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    
    # Check if username is taken
    user = db.query(User).filter(User.username == user_in.username).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The username is already taken",
        )
    
    # Validate company exists if provided
    if user_in.company_id:
        company = db.query(Company).filter(Company.id == user_in.company_id).first()
        if not company:
            raise HTTPException(
                status_code=400,
                detail="The specified company does not exist",
            )
    
    # Generate verification token
    verification_token = str(uuid.uuid4())
    
    # Create new user - using timezone-aware datetime
    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        role=user_in.role,
        company_id=user_in.company_id,
        # Enhanced fields
        verification_token=verification_token,
        verification_sent_at=get_utc_now(),
        is_verified=user_in.is_verified,  # Can be set to True by admin
        timezone=user_in.timezone,
        language=user_in.language,
        preferences=user_in.preferences or {}
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Send verification email if not already verified
    if not user.is_verified and user_in.send_invitation:
        background_tasks.add_task(
            send_verification_email,
            email=user.email,
            username=user.username,
            verification_token=verification_token
        )
    
    return user

@router.post("/verify-email")
def verify_email(
    verification_data: EmailVerification,
    db: Session = Depends(get_db),
) -> Any:
    """
    Verify user email address.
    """
    user = db.query(User).filter(User.verification_token == verification_data.token).first()
    
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification token"
        )
    
    # Check if token is not expired (24 hours) - using timezone-aware comparison
    if user.verification_sent_at:
        current_time = get_utc_now()
        sent_at = make_timezone_aware(user.verification_sent_at)
        token_age = current_time - sent_at
        if token_age.total_seconds() > 86400:  # 24 hours
            raise HTTPException(
                status_code=400,
                detail="Verification token has expired"
            )
    
    # Verify the user
    user.is_verified = True
    user.verified_at = get_utc_now()
    user.verification_token = None
    user.verification_sent_at = None
    
    db.add(user)
    db.commit()
    
    return {"message": "Email verified successfully"}

@router.post("/resend-verification")
def resend_verification_email(
    email: str = Body(..., embed=True),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
) -> Any:
    """
    Resend verification email.
    """
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        # Don't reveal if email exists or not for security
        return {"message": "If the email exists, a verification email has been sent"}
    
    if user.is_verified:
        raise HTTPException(
            status_code=400,
            detail="Email is already verified"
        )
    
    # Generate new verification token
    verification_token = str(uuid.uuid4())
    user.verification_token = verification_token
    user.verification_sent_at = get_utc_now()
    
    db.add(user)
    db.commit()
    
    # Send verification email
    background_tasks.add_task(
        send_verification_email,
        email=user.email,
        username=user.username,
        verification_token=verification_token
    )
    
    return {"message": "Verification email sent"}


@router.post("/contractor/register", response_model=ContractorSchema)
def create_contractor(
    contractor_in: ContractorCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Any:
    """
    Contractor self-registration.
    """
    # Check if contractor with same email exists
    contractor = db.query(Contractor).filter(Contractor.email == contractor_in.email).first()
    if contractor:
        raise HTTPException(
            status_code=400,
            detail="A contractor with this email already exists in the system",
        )
    
    # Check if company user with same email exists (prevent conflicts)
    user = db.query(User).filter(User.email == contractor_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists. Please use a different email.",
        )
    
    # Generate verification token
    verification_token = str(uuid.uuid4())
    
    # Create new contractor
    contractor = Contractor(
        business_name=contractor_in.business_name,
        business_number=contractor_in.business_number,
        contact_person=contractor_in.contact_person,
        email=contractor_in.email,
        phone=contractor_in.phone,
        mobile=contractor_in.mobile,
        address=contractor_in.address,
        hashed_password=get_password_hash(contractor_in.password),
        contractor_type=contractor_in.contractor_type,
        specializations=contractor_in.specializations,
        equipment_owned=contractor_in.equipment_owned,
        # Business details
        has_cleaning_protocols=contractor_in.has_cleaning_protocols,
        cleaning_equipment_owned=contractor_in.cleaning_equipment_owned,
        uses_approved_disinfectants=contractor_in.uses_approved_disinfectants,
        works_multiple_regions=contractor_in.works_multiple_regions,
        works_with_high_risk_crops=contractor_in.works_with_high_risk_crops,
        # Email verification
        verification_token=verification_token,
        verification_sent_at=get_utc_now(),
        is_contractor_verified=False,  # Must verify email
        registration_source="web_signup"
    )
    
    db.add(contractor)
    db.commit()
    db.refresh(contractor)
    
    # Send contractor-specific verification email
    background_tasks.add_task(
        send_contractor_verification_email,
        email=contractor.email,
        contractor_name=contractor.contact_person,
        verification_token=verification_token
    )
    
    return contractor

@router.post("/contractor/verify-email")
def verify_contractor_email(
    verification_data: EmailVerification,
    db: Session = Depends(get_db),
) -> Any:
    """Verify contractor email address."""
    contractor = db.query(Contractor).filter(Contractor.verification_token == verification_data.token).first()
    
    if not contractor:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification token"
        )
    
    # Check if token is not expired (24 hours)
    if contractor.verification_sent_at:
        current_time = get_utc_now()
        sent_at = make_timezone_aware(contractor.verification_sent_at)
        token_age = current_time - sent_at
        if token_age.total_seconds() > 86400:  # 24 hours
            raise HTTPException(
                status_code=400,
                detail="Verification token has expired"
            )
    
    # Verify the contractor
    contractor.is_contractor_verified = True
    contractor.verified_at = get_utc_now()
    contractor.verification_token = None
    contractor.verification_sent_at = None
    
    db.add(contractor)
    db.commit()
    
    return {"message": "Email verified successfully"}

@router.post("/login", response_model=EnhancedToken)
def login_access_token(
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
    client_type: Optional[str] = Header(None, alias="x-client-type"),  # "web" | "mobile"
) -> Any:
    """
    Enhanced OAuth2 compatible token login supporting both company users and contractors.
    Includes client type validation.
    """
    
    # Validate client type
    if client_type not in ["web", "mobile"]:
        client_type = "web"  # Default to web for backward compatibility
    
    # STEP 1: Look up user in both tables (consistent timing)
    company_user_by_username = db.query(User).filter(User.username == form_data.username).first()
    company_user_by_email = db.query(User).filter(User.email == form_data.username).first()
    
    contractor_by_email = db.query(Contractor).filter(Contractor.email == form_data.username).first()
    
    # Determine which account to use (prefer company user if both exist)
    company_user = company_user_by_username or company_user_by_email
    contractor = contractor_by_email
    
    # STEP 2: Determine user type and validate password
    authenticated_user = None
    user_type = None
    
    if company_user and contractor:
        # Both exist - prefer company user but validate both passwords for timing consistency
        company_password_valid = verify_password(form_data.password, company_user.hashed_password)
        contractor_password_valid = verify_password(form_data.password, contractor.hashed_password)
        
        if company_password_valid:
            authenticated_user = company_user
            user_type = "company_user"
        elif contractor_password_valid:
            authenticated_user = contractor
            user_type = "contractor"
            
    elif company_user:
        # Only company user exists
        password_valid = verify_password(form_data.password, company_user.hashed_password)
        if password_valid:
            authenticated_user = company_user
            user_type = "company_user"
        else:
            # Increment failed login attempts
            company_user.increment_failed_login()
            db.add(company_user)
            db.commit()
            
    elif contractor:
        # Only contractor exists
        password_valid = verify_password(form_data.password, contractor.hashed_password)
        if password_valid:
            authenticated_user = contractor
            user_type = "contractor"
        else:
            # Increment failed login attempts
            contractor.increment_failed_login()
            db.add(contractor)
            db.commit()
    else:
        # Neither exists - perform dummy password verification for timing consistency
        dummy_hash = "$2b$12$dummy.hash.to.prevent.timing.attacks.dummy"
        verify_password(form_data.password, dummy_hash)
    
    # STEP 3: Validate authentication
    if not authenticated_user or not user_type:
        raise HTTPException(
            status_code=400, 
            detail="Incorrect username/email or password"
        )
    
    # STEP 4: Client type validation
    if client_type == "web" and user_type == "contractor":
        raise HTTPException(
            status_code=403,
            detail="Contractors can only access the mobile application"
        )
    
    # STEP 5: Account status validation
    if user_type == "company_user":
        if not authenticated_user.can_login:
            if authenticated_user.is_account_locked:
                raise HTTPException(
                    status_code=423,
                    detail="Account is temporarily locked due to too many failed login attempts"
                )
            elif not authenticated_user.is_verified:
                raise HTTPException(
                    status_code=401,
                    detail="Email address not verified. Please check your email for verification link."
                )
            elif authenticated_user.is_suspended:
                raise HTTPException(
                    status_code=403,
                    detail="Account is suspended. Please contact support."
                )
            elif not authenticated_user.is_active:
                raise HTTPException(
                    status_code=403,
                    detail="Account is inactive. Please contact support."
                )
    
    elif user_type == "contractor":
        if not authenticated_user.can_login:
            if authenticated_user.is_account_locked:
                raise HTTPException(
                    status_code=423,
                    detail="Account is temporarily locked due to too many failed login attempts"
                )
            elif not authenticated_user.is_contractor_verified:
                raise HTTPException(
                    status_code=401,
                    detail="Email address not verified. Please check your email for verification link."
                )
            elif not authenticated_user.is_active:
                raise HTTPException(
                    status_code=403,
                    detail="Account is inactive. Please contact support."
                )
    
    # STEP 6: Success - update login tracking
    if user_type == "company_user":
        authenticated_user.reset_failed_login()
        authenticated_user.last_login = get_utc_now()
        authenticated_user.login_count += 1
    else:  # contractor
        authenticated_user.reset_failed_login()
        authenticated_user.update_last_login()  # Contractor has different method
    
    db.add(authenticated_user)
    db.commit()
    
    # STEP 7: Create tokens with enhanced payload
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    # Build company_ids for contractors
    company_ids = None
    if user_type == "contractor":
        company_ids = [rel.company_id for rel in authenticated_user.get_active_company_relationships()]
    
    # Create enhanced token payload
    token_data = {
        "user_type": user_type,
        "client_type": client_type,
        "role": authenticated_user.role if user_type == "company_user" else None,
        "company_id": authenticated_user.company_id if user_type == "company_user" else None,
        "company_ids": company_ids if user_type == "contractor" else None,
        "contractor_id": authenticated_user.id if user_type == "contractor" else None,
    }
    
    access_token, access_jti = create_access_token(
        authenticated_user.id, expires_delta=access_token_expires, extra_data=token_data
    )
    refresh_token, refresh_jti = create_refresh_token(
        authenticated_user.id, expires_delta=refresh_token_expires, extra_data=token_data
    )

    # Prepare response
    full_name = None
    if user_type == "company_user":
        full_name = authenticated_user.full_name
    else:  # contractor  
        full_name = authenticated_user.full_contact_name
    
    return EnhancedToken(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user_type=user_type,
        user_id=authenticated_user.id,
        username=authenticated_user.username if user_type == "company_user" else authenticated_user.email,
        full_name=full_name,
        role=authenticated_user.role if user_type == "company_user" else None,
        company_id=authenticated_user.company_id if user_type == "company_user" else None,
        company_ids=company_ids
    )

@router.post("/forgot-password")
def forgot_password(
    password_reset: PasswordReset,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Any:
    """Send password reset email - works for both company users and contractors"""
    # Check both tables for the email
    user = db.query(User).filter(User.email == password_reset.email).first()
    contractor = db.query(Contractor).filter(Contractor.email == password_reset.email).first()
    
    found_account = user or contractor
    
    if not found_account:
        # Don't reveal if email exists or not for security
        return {"message": "If the email exists, a password reset link has been sent"}
    
    reset_token = secrets.token_urlsafe(32)
    reset_expires = get_utc_now() + timedelta(hours=24)  
    
    found_account.reset_token = reset_token
    found_account.reset_token_expires = reset_expires
    
    db.add(found_account)
    db.commit()
    
    # Send password reset email
    username = found_account.username if hasattr(found_account, 'username') else found_account.contact_person
    background_tasks.add_task(
        send_password_reset_email,
        email=found_account.email,
        username=username,
        reset_token=reset_token
    )
    
    return {"message": "Password reset email sent"}

@router.post("/reset-password")
def reset_password(
    password_reset_confirm: PasswordResetConfirm,
    db: Session = Depends(get_db),
) -> Any:
    """Reset password using reset token - works for both user types"""
    # Check both tables for the reset token
    user = db.query(User).filter(User.reset_token == password_reset_confirm.token).first()
    contractor = db.query(Contractor).filter(Contractor.reset_token == password_reset_confirm.token).first()
    
    found_account = user or contractor
    
    if not found_account:
        raise HTTPException(
            status_code=400,
            detail="Invalid reset token"
        )
    
    # Check if token is not expired
    current_time = get_utc_now()
    
    if not found_account.reset_token_expires:
        raise HTTPException(
            status_code=400,
            detail="Invalid reset token"
        )
    
    # Make sure both datetimes are timezone-aware for comparison
    token_expires = make_timezone_aware(found_account.reset_token_expires)
    
    if current_time > token_expires:
        raise HTTPException(
            status_code=400,
            detail="Reset token has expired. Please request a new password reset."
        )
    
    # Validate new password
    if not validate_password(password_reset_confirm.new_password):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters, include a number and uppercase letter"
        )
    
    # Update password and clear reset token
    found_account.hashed_password = get_password_hash(password_reset_confirm.new_password)
    found_account.reset_token = None
    found_account.reset_token_expires = None
    
    # Reset failed login attempts
    if hasattr(found_account, 'failed_login_attempts'):
        found_account.failed_login_attempts = 0
        found_account.locked_until = None
    
    db.add(found_account)
    db.commit()
    
    return {"message": "Password reset successfully"}

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/refresh-token", response_model=Token)
def refresh_token(
    token_data: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> Any:
    """
    Refresh access token.
    """
    try:
        clean_token = token_data.refresh_token.strip()
        payload = decode_token(clean_token)
        token_type = payload.get("type")
        if token_type != "refresh":
            raise HTTPException(
                status_code=403,
                detail=f"Invalid token type: {token_type}",
            )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=403,
                detail="User ID not found in token",
            )
    except JWTError as e:
        raise HTTPException(
            status_code=403,
            detail=f"Invalid refresh token: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=403,
            detail=f"Token verification failed: {str(e)}",
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user can still login
    if not user.can_login:
        raise HTTPException(
            status_code=403,
            detail="User account is not in good standing"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    return {
        "access_token": create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "refresh_token": create_refresh_token(
            user.id, expires_delta=refresh_token_expires
        ),
        "token_type": "bearer",
    }

@router.get("/me")
def read_current_profile(current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor)) -> Any:
    """Get current user/contractor profile."""
    if isinstance(current_user, Contractor):
        # Return contractor profile as dictionary
        return {
            "user_type": "contractor",
            "id": current_user.id,
            "business_name": current_user.business_name,
            "contact_person": current_user.contact_person,
            "email": current_user.email,
            "phone": current_user.phone,
            "specializations": current_user.specializations,
            "is_contractor_verified": current_user.is_contractor_verified,
            "verification_level": current_user.verification_level,
            "registration_status": current_user.registration_status,
            "created_at": current_user.created_at
        }
    else:
        # Return company user profile as dictionary (convert User object)
        return {
            "user_type": "company_user",
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "company_id": current_user.company_id,
            "is_active": current_user.is_active,
            "is_verified": current_user.is_verified,
            "avatar_url": current_user.avatar_url,
            "phone": current_user.phone,
            "bio": current_user.bio,
            "timezone": current_user.timezone,
            "language": current_user.language,
            "preferences": current_user.preferences,
            "last_login": current_user.last_login,
            "created_at": getattr(current_user, 'created_at', None)
        }

@router.put("/contractor/me", response_model=ContractorProfile)
def update_contractor_profile(
    contractor_update: ContractorUpdate,
    current_contractor: Contractor = Depends(get_current_contractor),
    db: Session = Depends(get_db)
) -> Any:
    """Update contractor profile."""
    # Update contractor fields
    for field, value in contractor_update.dict(exclude_unset=True).items():
        setattr(current_contractor, field, value)
    
    # Update profile completion status
    if not current_contractor.profile_completed_at:
        # Check if profile is now complete
        required_fields = [
            current_contractor.business_name,
            current_contractor.contact_person,
            current_contractor.email,
            current_contractor.phone,
            current_contractor.specializations
        ]
        if all(required_fields):
            current_contractor.profile_completed_at = get_utc_now()
    
    db.add(current_contractor)
    db.commit()
    db.refresh(current_contractor)
    
    return current_contractor

@router.post("/change-password")
def change_password(
    current_password: str = Body(...),
    new_password: str = Body(...),
    current_user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
    db: Session = Depends(get_db)
) -> Any:
    """Change current user/contractor password."""
    # Verify current password
    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if not validate_password(new_password):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters, include a number and uppercase letter"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(new_password)
    db.add(current_user)
    db.commit()
    
    return {"message": "Password updated successfully"}

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)) -> Any:
    """
    Logout user (invalidate tokens on client side).
    Note: In a production system, you might want to maintain a token blacklist.
    """
    return {"message": "Successfully logged out"}