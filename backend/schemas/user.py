# app/schemas/user.py - User Schemas (5-tier user types)
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, validator
from .company import Company
from core.security.password import validate_password

VALID_USER_TYPES = ["auxein_admin", "company_admin", "company_manager", "company_user", "contractor"]
VALID_ROLES = ["admin", "manager", "user"]  # Backward-compat old roles

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = "user"
    user_type: Optional[str] = "company_user"

    # Enhanced profile fields
    phone: Optional[str] = None
    bio: Optional[str] = None
    timezone: str = "UTC"
    language: str = "en"
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    email: EmailStr
    username: str
    password: str
    company_id: int

    # Optional fields for admin creation
    role: str = "user"
    user_type: str = "company_user"
    is_verified: bool = False  # Will be set to True if created by admin
    send_invitation: bool = True  # Whether to send invitation email

    @validator("password")
    def password_validation(cls, v):
        if not validate_password(v):
            raise ValueError(
                "Password must be at least 8 characters, include a number and uppercase letter"
            )
        return v

    @validator("role")
    def validate_role(cls, v):
        allowed = VALID_ROLES + VALID_USER_TYPES
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(allowed)}")
        return v

    @validator("user_type")
    def validate_user_type(cls, v):
        if v not in VALID_USER_TYPES:
            raise ValueError(f"user_type must be one of: {', '.join(VALID_USER_TYPES)}")
        return v

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    avatar_url: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None

    # Admin-only fields
    role: Optional[str] = None
    user_type: Optional[str] = None
    is_active: Optional[bool] = None
    is_suspended: Optional[bool] = None
    company_id: Optional[int] = None

    @validator("role")
    def validate_role(cls, v):
        if v is not None:
            allowed = VALID_ROLES + VALID_USER_TYPES
            if v not in allowed:
                raise ValueError(f"Role must be one of: {', '.join(allowed)}")
        return v

    @validator("user_type")
    def validate_user_type(cls, v):
        if v is not None and v not in VALID_USER_TYPES:
            raise ValueError(f"user_type must be one of: {', '.join(VALID_USER_TYPES)}")
        return v

class UserProfileUpdate(BaseModel):
    """Schema for users updating their own profile"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    job_title: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    avatar_url: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None

class UserInDBBase(UserBase):
    id: Optional[int] = None
    company_id: Optional[int] = None
    
    # Account status
    is_active: bool
    is_verified: bool
    is_suspended: bool
    
    # Security tracking
    last_login: Optional[datetime] = None
    login_count: int
    failed_login_attempts: int
    locked_until: Optional[datetime] = None
    
    # Verification
    verified_at: Optional[datetime] = None
    
    # Invitation tracking
    invited_by: Optional[int] = None
    invited_at: Optional[datetime] = None
    accepted_invite_at: Optional[datetime] = None
    
    # User preferences
    preferences: Dict[str, Any]
    
    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    
    class Config:
        orm_mode = True

class User(UserInDBBase):
    pass

class UserInDB(UserInDBBase):
    hashed_password: str

class UserWithCompany(User):
    company: Optional[Company] = None
    full_name: Optional[str] = None  # Computed field
    can_login: Optional[bool] = None  # Computed field

class UserSummary(BaseModel):
    """Lightweight user info for lists and references"""
    id: int
    username: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: str
    role: str
    user_type: Optional[str] = None
    is_active: bool
    is_verified: bool
    avatar_url: Optional[str] = None
    last_login: Optional[datetime] = None

    class Config:
        orm_mode = True

class UserInvitation(BaseModel):
    """Schema for inviting new users"""
    email: EmailStr
    role: str = "user"
    user_type: Optional[str] = None  # If set, takes precedence over role
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    message: Optional[str] = None  # Custom invitation message

    @validator("role")
    def validate_role(cls, v):
        allowed = VALID_ROLES + VALID_USER_TYPES
        if v not in allowed:
            raise ValueError(f"Can only invite users with roles: {', '.join(allowed)}")
        return v

    @validator("user_type")
    def validate_user_type(cls, v):
        if v is not None:
            invitable = ["company_admin", "company_manager", "company_user"]
            if v not in invitable:
                raise ValueError(f"Can only invite user_types: {', '.join(invitable)}")
        return v

class UserPermissions(BaseModel):
    """Schema for user permissions"""
    user_id: int
    permissions: Dict[str, List[str]]  # module → actions
    role: str
    user_type: str
    can_manage_users: bool
    can_manage_company: bool
    can_manage_billing: bool

class PasswordReset(BaseModel):
    """Schema for password reset"""
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    """Schema for confirming password reset"""
    token: str
    new_password: str
    
    @validator("new_password")
    def password_validation(cls, v):
        if not validate_password(v):
            raise ValueError(
                "Password must be at least 8 characters, include a number and uppercase letter"
            )
        return v

class EmailVerification(BaseModel):
    """Schema for email verification"""
    token: str

class UserStats(BaseModel):
    """User activity statistics"""
    user_id: int
    observations_created: int
    tasks_created: int
    tasks_completed: int
    blocks_managed: int
    login_count: int
    last_active: Optional[datetime] = None

# Legacy role permissions - DEPRECATED: Use core.permissions module instead
# Kept for backward compatibility during migration
ROLE_PERMISSIONS = {
    "admin": [
        "manage_company", "manage_users", "manage_billing",
        "manage_blocks", "manage_observations", "manage_tasks", "manage_risks",
        "view_analytics", "export_data", "manage_settings", "view_training"
    ],
    "manager": [
        "manage_blocks", "manage_observations", "manage_tasks", "manage_risks",
        "view_analytics", "export_data", "view_training"
    ],
    "user": [
        "create_observations", "complete_tasks", "edit_own_tasks",
        "view_blocks", "export_own_data", "view_training"
    ]
}