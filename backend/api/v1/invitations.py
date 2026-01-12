# app/api/v1/invitations.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from datetime import datetime, timezone  
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from db.models.invitation import Invitation
from db.models.user import User
from db.models.company import Company
from schemas.invitation import InvitationCreate, Invitation as InvitationSchema, InvitationAccept
from api.deps import get_db, get_current_user
from core.email_utils import send_invitation_email
import logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=InvitationSchema)
def create_invitation(
    invitation_data: InvitationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):

    
    # Get company
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == invitation_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    # Check for existing pending invitation
    existing_invitation = db.query(Invitation).filter(
        Invitation.email == invitation_data.email,
        Invitation.company_id == current_user.company_id,
        Invitation.status == "pending"
    ).first()
    
    if existing_invitation and not existing_invitation.is_expired:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pending invitation already exists for this email"
        )
    
    # Load company with subscription
    company = db.query(Company).options(
        joinedload(Company.subscription)
    ).filter(Company.id == current_user.company_id).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )

    if not company.subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company has no subscription assigned"
        )
    
    import secrets
    import string
    def generate_temp_password(length=12):
        """Generate a secure temporary password"""
        characters = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(secrets.choice(characters) for _ in range(length))
    
    temp_password = generate_temp_password()

    # Create invitation
    invitation = Invitation.create_invitation(
        email=invitation_data.email,
        company_id=current_user.company_id,
        invited_by=current_user.id,
        role=invitation_data.role,
        first_name=invitation_data.first_name,
        last_name=invitation_data.last_name,
        suggested_username=invitation_data.suggested_username,
        message=invitation_data.message,
        temporary_password=temp_password
    )
    
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    
    # Send invitation email
    background_tasks.add_task(
        send_invitation_email,
        email=invitation.email,
        inviter_name=current_user.full_name,
        company_name=company.name,
        role=invitation.role,
        invitation_token=invitation.token,
        message=invitation.message,
        suggested_username=invitation.suggested_username,
        temporary_password=temp_password
    )
    
    return invitation

@router.get("/", response_model=List[InvitationSchema])
def list_invitations(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List company invitations"""
    
    if not current_user.has_permission("manage_users"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    query = db.query(Invitation).filter(Invitation.company_id == current_user.company_id)
    
    if status_filter:
        query = query.filter(Invitation.status == status_filter)
    
    invitations = query.offset(skip).limit(limit).all()
    return invitations

@router.get("/token/{token}")
def get_invitation_by_token(
    token: str,
    db: Session = Depends(get_db)
):
    """Get invitation details by token (public endpoint for invitation acceptance)"""
    
    # Find invitation by token
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    # Check if invitation is still valid
    if not invitation.is_valid:
        if invitation.is_expired:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired"
            )
        elif invitation.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invitation has already been {invitation.status}"
            )
    
    # Get related data with subscription loaded
    company = db.query(Company).options(
        joinedload(Company.subscription)
    ).filter(Company.id == invitation.company_id).first()
    
    inviter = db.query(User).filter(User.id == invitation.invited_by).first()
    
    # Return invitation details (no auth required for this endpoint)
    return {
        "id": invitation.id,
        "email": invitation.email,
        "role": invitation.role,
        "first_name": invitation.first_name,
        "last_name": invitation.last_name,
        "suggested_username": invitation.suggested_username,
        "message": invitation.message,
        "status": invitation.status,
        "expires_at": invitation.expires_at,
        "sent_at": invitation.sent_at,
        "is_expired": invitation.is_expired,
        "is_valid": invitation.is_valid,
        "company": {
            "id": company.id,
            "name": company.name,
            "subscription_name": company.subscription.name if company.subscription else "unknown",
            "subscription_display_name": company.subscription.display_name if company.subscription else "Unknown"
        } if company else None,
        "inviter": {
            "id": inviter.id,
            "full_name": inviter.full_name,
            "email": inviter.email
        } if inviter else None,
        "days_until_expiry": (invitation.expires_at - datetime.now(timezone.utc)).days if not invitation.is_expired else 0
    }

@router.post("/accept")
def accept_invitation(
    acceptance_data: InvitationAccept,
    db: Session = Depends(get_db)
):
    """Accept an invitation and create user account"""
    
    # Find invitation
    invitation = db.query(Invitation).filter(Invitation.token == acceptance_data.token).first()
    
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invitation token"
        )
    
    if not invitation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation is expired or already used"
        )
    
    # Check if username is available
    existing_user = db.query(User).filter(User.username == acceptance_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken"
        )
    
    # Create user
    from core.security.password import get_password_hash
    new_user = User(
        email=invitation.email,
        username=acceptance_data.username,
        hashed_password=get_password_hash(acceptance_data.password),
        first_name=acceptance_data.first_name or invitation.first_name,
        last_name=acceptance_data.last_name or invitation.last_name,
        role=invitation.role,
        company_id=invitation.company_id,
        timezone=acceptance_data.timezone,
        is_verified=True,  # Pre-verified through invitation
        is_active=True
    )
    
    db.add(new_user)
    db.flush()  # Get user ID
    
    # Update invitation
    invitation.status = "accepted"
    invitation.accepted_at = datetime.now(timezone.utc)
    invitation.created_user_id = new_user.id
    
    db.commit()
    
    return {"message": "Invitation accepted successfully", "user_id": new_user.id}

@router.post("/login-temp")
def login_with_temp_credentials(
    login_data: dict,  # {"token": "...", "password": "..."}
    db: Session = Depends(get_db)
):
    """Login directly using temporary credentials from invitation"""
    
    token = login_data.get("token")
    password = login_data.get("password")
    
    if not token or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token and password are required"
        )
    
    # Find invitation
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    
    if not invitation or not invitation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation"
        )
    
    # Verify temporary password
    from core.security.password import verify_password
    if not invitation.temporary_password or not verify_password(password, invitation.temporary_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid temporary password"
        )
    
    # Check if user already exists for this invitation
    existing_user = db.query(User).filter(User.email == invitation.email).first()
    
    if existing_user:
        # User already exists, just login
        from api.v1.auth import create_access_token
        access_token = create_access_token(data={"sub": existing_user.username})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": existing_user.id,
                "username": existing_user.username,
                "email": existing_user.email,
                "role": existing_user.role,
                "company_id": existing_user.company_id
            },
            "message": "Logged in with temporary credentials"
        }
    else:
        # Create user automatically with invitation details
        company = db.query(Company).filter(Company.id == invitation.company_id).first()
        
        # Generate username from email if not suggested
        suggested_username = invitation.suggested_username
        if not suggested_username:
            suggested_username = invitation.email.split('@')[0]
            # Make sure username is unique
            counter = 1
            base_username = suggested_username
            while db.query(User).filter(User.username == suggested_username).first():
                suggested_username = f"{base_username}{counter}"
                counter += 1
        
        new_user = User(
            email=invitation.email,
            username=suggested_username,
            hashed_password=invitation.temporary_password,  # Use the hashed temp password
            first_name=invitation.first_name or invitation.email.split('@')[0],
            last_name=invitation.last_name or "",
            role=invitation.role,
            company_id=invitation.company_id,
            timezone="UTC",
            is_verified=True,
            is_active=True,
            #created_at=datetime.now(timezone.utc)
        )
        
        db.add(new_user)
        db.flush()
        
        # Update invitation
        invitation.status = "accepted"
        invitation.accepted_at = datetime.now(timezone.utc)
        invitation.created_user_id = new_user.id
        
        db.commit()
        
        # Create access token
        from api.v1.auth import create_access_token
        access_token = create_access_token(data={"sub": new_user.username})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": new_user.id,
                "username": new_user.username,
                "email": new_user.email,
                "role": new_user.role,
                "company_id": new_user.company_id
            },
            "message": "Account created and logged in successfully",
            "note": "Please change your password in your profile settings"
        }