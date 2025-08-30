# app/schemas/invitation.py - Invitation Pydantic Schemas (Updated for 3 roles)
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, validator
from .user import UserSummary
from .company import Company

class InvitationBase(BaseModel):
    email: EmailStr
    role: str = "user"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    suggested_username: Optional[str] = None
    message: Optional[str] = None

class InvitationCreate(InvitationBase):
    company_id: Optional[int] = None  # Will be set from current user's company
    
    @validator("role")
    def validate_role(cls, v):
        allowed_roles = ["admin", "manager", "user"]  # Simplified roles
        if v not in allowed_roles:
            raise ValueError(f"Role must be one of: {', '.join(allowed_roles)}")
        return v
    
    @validator("message")
    def validate_message(cls, v):
        if v and len(v) > 500:
            raise ValueError("Message must be less than 500 characters")
        return v

class InvitationUpdate(BaseModel):
    role: Optional[str] = None
    message: Optional[str] = None
    status: Optional[str] = None
    
    @validator("role")
    def validate_role(cls, v):
        if v is not None:
            allowed_roles = ["admin", "manager", "user"]  # Simplified roles
            if v not in allowed_roles:
                raise ValueError(f"Role must be one of: {', '.join(allowed_roles)}")
        return v
    
    @validator("status")
    def validate_status(cls, v):
        if v is not None:
            allowed_statuses = ["pending", "cancelled"]  # Only allow these changes
            if v not in allowed_statuses:
                raise ValueError(f"Status can only be changed to: {', '.join(allowed_statuses)}")
        return v

class InvitationInDBBase(InvitationBase):
    id: int
    token: str
    company_id: int
    invited_by: int
    status: str
    expires_at: datetime
    sent_at: datetime
    accepted_at: Optional[datetime] = None
    created_user_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        orm_mode = True

class Invitation(InvitationInDBBase):
    pass

class InvitationWithDetails(Invitation):
    """Invitation with related user and company details"""
    inviter: Optional[UserSummary] = None
    company: Optional[Company] = None
    created_user: Optional[UserSummary] = None
    
    # Computed fields
    is_expired: Optional[bool] = None
    is_valid: Optional[bool] = None
    days_until_expiry: Optional[int] = None

class InvitationSummary(BaseModel):
    """Lightweight invitation info for lists"""
    id: int
    email: str
    role: str
    status: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    sent_at: datetime
    expires_at: datetime
    invited_by_name: Optional[str] = None
    is_expired: bool
    
    class Config:
        orm_mode = True

class InvitationAccept(BaseModel):
    """Schema for accepting an invitation"""
    token: str
    username: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    timezone: str = "UTC"
    
    @validator("password")
    def password_validation(cls, v):
        from core.security.password import validate_password
        if not validate_password(v):
            raise ValueError(
                "Password must be at least 8 characters, include a number and uppercase letter"
            )
        return v
    
    @validator("username")
    def username_validation(cls, v):
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Username must be less than 50 characters")
        # Check for valid characters
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("Username can only contain letters, numbers, underscores, and hyphens")
        return v

class InvitationResponse(BaseModel):
    """Response for invitation operations"""
    message: str
    invitation_id: Optional[int] = None
    email: Optional[str] = None
    expires_at: Optional[datetime] = None

class InvitationStats(BaseModel):
    """Statistics about invitations for a company"""
    total_sent: int
    pending: int
    accepted: int
    expired: int
    cancelled: int
    acceptance_rate: float  # Percentage of accepted invitations
    
class BulkInvitation(BaseModel):
    """Schema for sending multiple invitations"""
    invitations: list[InvitationCreate]
    default_role: str = "user"
    default_message: Optional[str] = None
    
    @validator("invitations")
    def validate_invitations(cls, v):
        if len(v) == 0:
            raise ValueError("At least one invitation is required")
        if len(v) > 50:
            raise ValueError("Maximum 50 invitations can be sent at once")
        
        # Check for duplicate emails
        emails = [inv.email for inv in v]
        if len(emails) != len(set(emails)):
            raise ValueError("Duplicate email addresses found")
        
        return v

# Simplified role permission mappings for invitations
INVITATION_ROLE_PERMISSIONS = {
    "admin": {
        "can_invite": ["admin", "manager", "user"],
        "can_manage_invitations": True,
        "can_cancel_invitations": True
    },
    "manager": {
        "can_invite": ["user"],  # Managers can only invite users
        "can_manage_invitations": False,
        "can_cancel_invitations": False
    },
    "user": {
        "can_invite": [],
        "can_manage_invitations": False,
        "can_cancel_invitations": False
    }
}