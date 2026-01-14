# backend/schemas/public_user.py - Pydantic Schemas with Marketing & User Segmentation
from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel, EmailStr, validator, Field

# ============================================
# ENUMS / CONSTANTS
# ============================================

USER_TYPE_OPTIONS = Literal[
    'wine_company_owner',
    'wine_company_employee', 
    'wine_enthusiast',
    'researcher',
    'consultant',
    'other'
]

NZ_WINE_REGIONS = Literal[
    'Marlborough',
    'Central Otago',
    'Waipara',
    'Hawke\'s Bay',
    'Martinborough',
    'Wairarapa',
    'Nelson',
    'Gisborne',
    'Auckland',
    'Northland',
    'Canterbury',
    'Other'
]

# ============================================
# BASE SCHEMAS
# ============================================

class PublicUserBase(BaseModel):
    """Base schema for public user"""
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class PublicUserSignup(PublicUserBase):
    """
    Schema for user signup with marketing and segmentation data.
    This is what the frontend sends during registration.
    """
    password: str = Field(..., min_length=8)
    
    # User segmentation (optional but encouraged)
    user_type: Optional[USER_TYPE_OPTIONS] = None
    company_name: Optional[str] = Field(None, max_length=200)
    job_title: Optional[str] = Field(None, max_length=100)
    region_of_interest: Optional[NZ_WINE_REGIONS] = None
    
    # Marketing opt-ins (default False for GDPR compliance)
    newsletter_opt_in: bool = False
    marketing_opt_in: bool = False
    research_opt_in: bool = False
    
    @validator("password")
    def validate_password_strength(cls, v):
        """Ensure password meets minimum security requirements"""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        
        if not (has_upper and has_lower and has_digit):
            raise ValueError(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, and one number"
            )
        
        return v
    
    @validator("first_name", "last_name", "job_title")
    def validate_text_fields(cls, v):
        """Clean and validate text fields"""
        if v:
            v = v.strip()
            if len(v) > 100:
                raise ValueError("Field must be 100 characters or less")
        return v
    
    @validator("company_name")
    def validate_company_name(cls, v):
        """Clean and validate company name"""
        if v:
            v = v.strip()
            if len(v) > 200:
                raise ValueError("Company name must be 200 characters or less")
        return v
    
    @validator("user_type")
    def validate_user_type_with_company(cls, v, values):
        """
        If user_type is wine_company_* but no company_name provided,
        that's okay but we might want to prompt for it in the UI.
        This is just a soft validation.
        """
        # No hard validation needed - just ensuring it's one of the allowed values
        # The Literal type already handles that
        return v

class PublicUserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr
    password: str

class PublicUserResponse(BaseModel):
    """
    Schema for user data in responses (without password).
    This is what gets returned after login/signup/profile fetch.
    """
    id: int
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: str
    
    # User segmentation
    user_type: Optional[str] = None
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    region_of_interest: Optional[str] = None
    
    # Marketing preferences
    newsletter_opt_in: bool
    marketing_opt_in: bool
    research_opt_in: bool
    
    # Account status
    is_verified: bool
    
    # Timestamps
    created_at: datetime
    last_login: Optional[datetime] = None
    last_active: Optional[datetime] = None
    
    # Computed properties
    is_wine_professional: Optional[bool] = None
    marketing_segment: Optional[str] = None
    
    class Config:
        orm_mode = True

class PublicUserToken(BaseModel):
    """Schema for auth token response"""
    access_token: str
    token_type: str = "bearer"
    user: PublicUserResponse

class PublicUserUpdate(BaseModel):
    """
    Schema for updating user profile.
    Users can update their info and marketing preferences.
    """
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    
    # Allow users to update their segmentation info
    user_type: Optional[USER_TYPE_OPTIONS] = None
    company_name: Optional[str] = Field(None, max_length=200)
    job_title: Optional[str] = Field(None, max_length=100)
    region_of_interest: Optional[NZ_WINE_REGIONS] = None
    
    # Allow users to update marketing preferences
    newsletter_opt_in: Optional[bool] = None
    marketing_opt_in: Optional[bool] = None
    research_opt_in: Optional[bool] = None
    
    @validator("first_name", "last_name", "job_title")
    def validate_text_fields(cls, v):
        """Clean and validate text fields"""
        if v:
            v = v.strip()
            if len(v) > 100:
                raise ValueError("Field must be 100 characters or less")
        return v
    
    @validator("company_name")
    def validate_company_name(cls, v):
        """Clean and validate company name"""
        if v:
            v = v.strip()
            if len(v) > 200:
                raise ValueError("Company name must be 200 characters or less")
        return v

class MarketingPreferencesUpdate(BaseModel):
    """
    Dedicated schema for updating just marketing preferences.
    Useful for "Manage Preferences" links in emails.
    """
    newsletter_opt_in: Optional[bool] = None
    marketing_opt_in: Optional[bool] = None
    research_opt_in: Optional[bool] = None

class PasswordResetRequest(BaseModel):
    """Schema for requesting password reset"""
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    """Schema for confirming password reset with new password"""
    token: str
    new_password: str = Field(..., min_length=8)
    
    @validator("new_password")
    def validate_password_strength(cls, v):
        """Ensure password meets minimum security requirements"""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        
        if not (has_upper and has_lower and has_digit):
            raise ValueError(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, and one number"
            )
        
        return v

class EmailVerificationRequest(BaseModel):
    """Schema for email verification"""
    token: str

class MessageResponse(BaseModel):
    """Generic message response"""
    message: str

# ============================================
# ADMIN/ANALYTICS SCHEMAS
# ============================================

class UserStats(BaseModel):
    """
    User statistics for analytics/admin dashboard.
    Not exposed to regular users.
    """
    total_users: int
    verified_users: int
    
    # By user type
    wine_company_owners: int
    wine_company_employees: int
    wine_enthusiasts: int
    researchers: int
    consultants: int
    other_users: int
    
    # Marketing opt-ins
    newsletter_subscribers: int
    marketing_subscribers: int
    research_subscribers: int
    
    # Engagement
    active_last_7_days: int
    active_last_30_days: int
    never_logged_in: int
    
    # Top regions of interest
    top_regions: dict

class UserSegmentationReport(BaseModel):
    """
    Detailed segmentation report for marketing campaigns.
    Shows distribution of users by type and preferences.
    """
    segment: str  # e.g., "high_value_prospect"
    count: int
    newsletter_opt_in_count: int
    marketing_opt_in_count: int
    avg_engagement_days: float  # Average days since last_active
    top_regions: list

# ============================================
# HELPER SCHEMAS FOR VALIDATION
# ============================================

class UserTypeInfo(BaseModel):
    """
    Information about user types - useful for frontend dropdowns.
    This can be returned by an endpoint like /public/auth/user-types
    """
    value: str
    label: str
    description: str
    requires_company: bool  # Whether company_name should be asked

# Example data for user types
USER_TYPE_DESCRIPTIONS = [
    {
        "value": "wine_company_owner",
        "label": "Wine Company Owner/Manager",
        "description": "I own or manage a vineyard or winery",
        "requires_company": True
    },
    {
        "value": "wine_company_employee",
        "label": "Wine Industry Professional",
        "description": "I work in viticulture, winemaking, or wine production",
        "requires_company": True
    },
    {
        "value": "wine_enthusiast",
        "label": "Wine Enthusiast",
        "description": "I enjoy wine as a consumer or collector",
        "requires_company": False
    },
    {
        "value": "researcher",
        "label": "Researcher/Academic",
        "description": "I'm conducting research or studying viticulture",
        "requires_company": False
    },
    {
        "value": "consultant",
        "label": "Wine Consultant/Advisor",
        "description": "I provide consulting services to the wine industry",
        "requires_company": False
    },
    {
        "value": "other",
        "label": "Other",
        "description": "None of the above categories fit",
        "requires_company": False
    }
]

class RegionInfo(BaseModel):
    """Information about NZ wine regions - for frontend dropdowns"""
    value: str
    label: str
    description: str

# Example data for regions
NZ_REGION_DESCRIPTIONS = [
    {"value": "Marlborough", "label": "Marlborough", "description": "Famous for Sauvignon Blanc"},
    {"value": "Central Otago", "label": "Central Otago", "description": "World-class Pinot Noir"},
    {"value": "Waipara", "label": "Waipara", "description": "Diverse cool climate wines"},
    {"value": "Hawke's Bay", "label": "Hawke's Bay", "description": "Premium red wine region"},
    {"value": "Martinborough", "label": "Martinborough", "description": "Boutique Pinot Noir"},
    {"value": "Wairarapa", "label": "Wairarapa", "description": "Cool climate excellence"},
    {"value": "Nelson", "label": "Nelson", "description": "Sunshine and Sauvignon Blanc"},
    {"value": "Gisborne", "label": "Gisborne", "description": "Chardonnay capital"},
    {"value": "Auckland", "label": "Auckland", "description": "Urban wine region"},
    {"value": "Northland", "label": "Northland", "description": "Emerging warm climate"},
    {"value": "Canterbury", "label": "Canterbury", "description": "Cool climate Pinot & Riesling"},
    {"value": "Other", "label": "Other/Multiple", "description": "Other or multiple regions"}
]