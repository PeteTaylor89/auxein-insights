# api/v1/public_auth.py - Updated to use EmailService
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List

from api.deps import get_db
from db.models.public_user import PublicUser
from schemas.public_user import (
    PublicUserSignup,
    PublicUserLogin,
    PublicUserToken,
    PublicUserResponse,
    PublicUserUpdate,
    MarketingPreferencesUpdate,
    PasswordResetRequest,
    PasswordResetConfirm,
    EmailVerificationRequest,
    MessageResponse,
    UserTypeInfo,
    RegionInfo,
    USER_TYPE_DESCRIPTIONS,
    NZ_REGION_DESCRIPTIONS
)
from core.public_security import (
    hash_password,
    verify_password,
    create_access_token,
    generate_verification_token,
    generate_reset_token,
    get_current_public_user
)
from services.email_service import email_service

router = APIRouter(prefix="/public/auth", tags=["Public Authentication"])

# ============================================
# SIGNUP WITH MARKETING DATA
# ============================================

@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: PublicUserSignup,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Register a new user for Regional Intelligence with marketing preferences.
    
    - Creates unverified account
    - Captures user segmentation data (type, company, region)
    - Records marketing opt-ins (newsletter, marketing, research)
    - Sends verification email
    """
    # Check if email already exists
    existing_user = db.query(PublicUser).filter(
        PublicUser.email == user_data.email.lower()
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user with all marketing and segmentation data
    verification_token = generate_verification_token()
    
    new_user = PublicUser(
        # Basic info
        email=user_data.email.lower(),
        hashed_password=hash_password(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        
        # User segmentation
        user_type=user_data.user_type,
        company_name=user_data.company_name,
        job_title=user_data.job_title,
        region_of_interest=user_data.region_of_interest,
        
        # Marketing opt-ins
        newsletter_opt_in=user_data.newsletter_opt_in,
        marketing_opt_in=user_data.marketing_opt_in,
        research_opt_in=user_data.research_opt_in,
        
        # Verification
        is_verified=False,
        verification_token=verification_token,
        verification_sent_at=datetime.now(timezone.utc)
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Send verification email (background task)
    background_tasks.add_task(
        email_service.send_verification_email,
        email=new_user.email,
        token=verification_token,
        name=new_user.first_name or "there"
    )
    
    return MessageResponse(
        message="Account created successfully. Please check your email to verify your account."
    )

# ============================================
# LOGIN
# ============================================

@router.post("/login", response_model=PublicUserToken)
async def login(
    credentials: PublicUserLogin,
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return access token.
    
    - Validates credentials
    - Checks account is active and verified
    - Updates last_login and login_count
    - Returns JWT token + full user info including marketing preferences
    """
    # Find user by email
    user = db.query(PublicUser).filter(
        PublicUser.email == credentials.email.lower()
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if account is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Please contact support."
        )
    
    # Check if account is verified
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address before logging in."
        )
    
    # Update login tracking
    user.last_login = datetime.now(timezone.utc)
    user.last_active = datetime.now(timezone.utc)
    user.login_count += 1
    db.commit()
    
    # Create access token
    access_token = create_access_token(
        data={"user_id": user.id, "email": user.email}
    )
    
    # Return token and user info
    user_response = PublicUserResponse.from_orm(user)
    
    return PublicUserToken(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

# ============================================
# GET CURRENT USER
# ============================================

@router.get("/me", response_model=PublicUserResponse)
async def get_current_user_info(
    current_user: PublicUser = Depends(get_current_public_user)
):
    """
    Get current authenticated user's information including marketing preferences.
    
    Requires valid JWT token in Authorization header.
    """
    return PublicUserResponse.from_orm(current_user)

# ============================================
# UPDATE PROFILE
# ============================================

@router.patch("/me", response_model=PublicUserResponse)
async def update_profile(
    update_data: PublicUserUpdate,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile information.
    
    - Can update name, user segmentation, and marketing preferences
    - Tracks changes for analytics
    """
    # Update basic profile fields
    if update_data.first_name is not None:
        current_user.first_name = update_data.first_name
    
    if update_data.last_name is not None:
        current_user.last_name = update_data.last_name
    
    # Update segmentation fields
    if update_data.user_type is not None:
        current_user.user_type = update_data.user_type
    
    if update_data.company_name is not None:
        current_user.company_name = update_data.company_name
    
    if update_data.job_title is not None:
        current_user.job_title = update_data.job_title
    
    if update_data.region_of_interest is not None:
        current_user.region_of_interest = update_data.region_of_interest
    
    # Marketing preferences
    if update_data.newsletter_opt_in is not None:
        current_user.newsletter_opt_in = update_data.newsletter_opt_in
    
    if update_data.marketing_opt_in is not None:
        current_user.marketing_opt_in = update_data.marketing_opt_in
    
    if update_data.research_opt_in is not None:
        current_user.research_opt_in = update_data.research_opt_in
    
    db.commit()
    db.refresh(current_user)
    
    return PublicUserResponse.from_orm(current_user)

# ============================================
# UPDATE MARKETING PREFERENCES ONLY
# ============================================

@router.patch("/me/marketing-preferences", response_model=MessageResponse)
async def update_marketing_preferences(
    preferences: MarketingPreferencesUpdate,
    current_user: PublicUser = Depends(get_current_public_user),
    db: Session = Depends(get_db)
):
    """
    Update only marketing preferences.
    
    Useful for "Manage Preferences" links in emails where users
    just want to opt-in/out without updating their profile.
    """
    if preferences.newsletter_opt_in is not None:
        current_user.newsletter_opt_in = preferences.newsletter_opt_in
    
    if preferences.marketing_opt_in is not None:
        current_user.marketing_opt_in = preferences.marketing_opt_in
    
    if preferences.research_opt_in is not None:
        current_user.research_opt_in = preferences.research_opt_in
    
    db.commit()
    
    return MessageResponse(message="Marketing preferences updated successfully")

# ============================================
# EMAIL VERIFICATION
# ============================================

@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    verification: EmailVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Verify user's email address using verification token.
    
    - Marks account as verified
    - Sends welcome email
    - Allows user to login
    """
    user = db.query(PublicUser).filter(
        PublicUser.verification_token == verification.token
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )
    
    # Check if already verified
    if user.is_verified:
        return MessageResponse(message="Email already verified")
    
    # Mark as verified
    user.is_verified = True
    user.verified_at = datetime.now(timezone.utc)
    user.verification_token = None  # Clear token after use
    
    db.commit()
    
    # Send welcome email (optional - background task)
    background_tasks.add_task(
        email_service.send_welcome_email,
        email=user.email,
        name=user.first_name or "there"
    )
    
    return MessageResponse(
        message="Email verified successfully. You can now log in."
    )

# ============================================
# RESEND VERIFICATION EMAIL
# ============================================

@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    email_request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Resend verification email to user.
    
    - Generates new verification token
    - Sends new email
    """
    user = db.query(PublicUser).filter(
        PublicUser.email == email_request.email.lower()
    ).first()
    
    if not user:
        # Don't reveal if email exists or not (security)
        return MessageResponse(
            message="If the email exists, a verification link has been sent."
        )
    
    if user.is_verified:
        return MessageResponse(message="Email is already verified")
    
    # Generate new token
    new_token = generate_verification_token()
    user.verification_token = new_token
    user.verification_sent_at = datetime.now(timezone.utc)
    
    db.commit()
    
    # Send email (background task)
    background_tasks.add_task(
        email_service.send_verification_email,
        email=user.email,
        token=new_token,
        name=user.first_name or "there"
    )
    
    return MessageResponse(
        message="Verification email sent. Please check your inbox."
    )

# ============================================
# PASSWORD RESET REQUEST
# ============================================

@router.post("/forgot-password", response_model=MessageResponse)
async def request_password_reset(
    reset_request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Request password reset email.
    
    - Generates reset token
    - Sends reset email
    - Token expires in 1 hour
    """
    user = db.query(PublicUser).filter(
        PublicUser.email == reset_request.email.lower()
    ).first()
    
    # Always return success (don't reveal if email exists)
    if not user:
        return MessageResponse(
            message="If the email exists, a password reset link has been sent."
        )
    
    # Generate reset token
    reset_token = generate_reset_token()
    user.reset_token = reset_token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    
    db.commit()
    
    # Send reset email (background task)
    background_tasks.add_task(
        email_service.send_password_reset_email,
        email=user.email,
        token=reset_token,
        name=user.first_name or "there"
    )
    
    return MessageResponse(
        message="If the email exists, a password reset link has been sent."
    )

# ============================================
# PASSWORD RESET CONFIRM
# ============================================

@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    reset_data: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """
    Reset password using reset token.
    
    - Validates token and expiration
    - Updates password
    - Clears reset token
    """
    user = db.query(PublicUser).filter(
        PublicUser.reset_token == reset_data.token
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Check if token is expired
    if user.reset_token_expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new one."
        )
    
    # Update password
    user.hashed_password = hash_password(reset_data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    
    db.commit()
    
    return MessageResponse(
        message="Password reset successfully. You can now log in with your new password."
    )

# ============================================
# HELPER ENDPOINTS (for frontend dropdowns)
# ============================================

@router.get("/user-types", response_model=list)
async def get_user_types():
    """
    Get list of user types for frontend dropdown.
    
    Returns user type options with descriptions and whether
    company name is required.
    """
    from schemas.public_user import USER_TYPE_DESCRIPTIONS
    return USER_TYPE_DESCRIPTIONS

@router.get("/regions", response_model=list)
async def get_regions():
    """
    Get list of NZ wine regions for frontend dropdown.
    
    Returns region options with descriptions.
    """
    from schemas.public_user import NZ_REGION_DESCRIPTIONS
    return NZ_REGION_DESCRIPTIONS