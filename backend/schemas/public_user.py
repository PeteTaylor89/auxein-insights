# backend/schemas/public_user.py - Pydantic Schemas with Marketing & User Segmentation
from typing import Optional, Literal, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, validator, Field, ConfigDict

# ============================================
# ENUMS / CONSTANTS
# ============================================

# EXISTING VALUES ARE NEVER RENAMED. `user_type` is a plain VARCHAR(50) with
# live rows in it and it drives `PublicUser.marketing_segment`, so the four
# `wine_*`/`consultant` values keep their exact spelling; only their LABELS
# changed. New values are added alongside.
#
# The audience widened on 2026-08-25 because the product did. Insights is a
# climate platform with a country/industry dimension underneath it, and a
# sign-up form whose only professions were wine ones told an orchardist, an
# agronomist or a council hydrologist that they had come to the wrong site. The
# wine professions stay first and stay specific — they are still who most of
# this is built for.
USER_TYPE_OPTIONS = Literal[
    'wine_company_owner',
    'wine_company_employee',
    'wine_enthusiast',
    'grower',
    'agronomist',
    'consultant',
    'researcher',
    'public_sector',
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
    model_config = ConfigDict(from_attributes=True)
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
    is_admin: bool = False
    subscription_tier: str = "free"
    # Server-computed entitlement. The client reads this and never re-derives it
    # from subscription_tier: 'grow' also counts as Pro, and an expired 'pro'
    # does not, neither of which is visible from the tier string alone.
    is_pro: bool = False
    # Active enterprise accounts this user is a named member of, as
    # {slug, name, role}. Almost always empty — an account is an enterprise
    # arrangement, not a tier.
    #
    # Carried on the auth payload rather than fetched by the header, because the
    # header renders on EVERY page and a per-page request to decide whether to
    # draw one nav link is a request per page view. It also means the nav and
    # the entitlement cannot disagree: both read the same list.
    portfolio_accounts: List[dict] = []
    # Whether "My Site" is a thing this user HAS rather than one they could buy.
    # Server-computed and never re-derived on the client: it is not visible from
    # `is_pro`, which is true for a Grow user and an account member who both
    # hold no point at all. Exposing `pro_site_quota` instead would invite the
    # frontend to reimplement the rule and drift from it.
    has_site_access: bool = False
    origin: str = "signup"  # 'grow' => projection row crossed over from Grow
    
    # Timestamps
    created_at: datetime
    last_login: Optional[datetime] = None
    last_active: Optional[datetime] = None
    
    # Computed properties
    is_wine_professional: Optional[bool] = None
    marketing_segment: Optional[str] = None
    

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
    frequency_preference: Optional[str] = None
    preferred_regions: Optional[List[str]] = None

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
# ORDER IS THE MESSAGE. Wine first, because that is the industry the archive,
# the zones and the phenology models are actually built on and it would be
# dishonest to bury it. Everything after it is there so that someone who is not
# in wine can still describe themselves accurately instead of picking "Other".
#
# `requires_company` drives whether the form asks for an organisation. It is
# False for the individual roles on purpose — an enthusiast or a student typing
# a company name to get past a field is worse data than no company name.
USER_TYPE_DESCRIPTIONS = [
    {
        "value": "wine_company_owner",
        "label": "Vineyard or winery owner / manager",
        "description": "I own or manage a vineyard or winery",
        "requires_company": True
    },
    {
        "value": "wine_company_employee",
        "label": "Wine industry professional",
        "description": "I work in viticulture, winemaking or wine production",
        "requires_company": True
    },
    {
        "value": "grower",
        "label": "Grower or orchardist",
        "description": "I grow another crop - horticulture, arable or pasture",
        "requires_company": True
    },
    {
        "value": "agronomist",
        "label": "Agronomist or field advisor",
        "description": "I advise growers on agronomy, spray programmes or crop management",
        "requires_company": False
    },
    {
        "value": "consultant",
        "label": "Consultant or advisor",
        "description": "I provide consulting services to the wine or primary sector",
        "requires_company": False
    },
    {
        "value": "researcher",
        "label": "Researcher or academic",
        "description": "I am conducting research or studying",
        "requires_company": False
    },
    {
        "value": "public_sector",
        "label": "Regional council or public sector",
        "description": "I work in local government, a CRI or a public agency",
        "requires_company": True
    },
    {
        "value": "wine_enthusiast",
        "label": "Wine enthusiast",
        "description": "I follow wine as a consumer or collector",
        "requires_company": False
    },
    {
        "value": "other",
        "label": "Something else",
        "description": "None of these fit",
        "requires_company": False
    }
]

class RegionInfo(BaseModel):
    """Information about NZ wine regions - for frontend dropdowns"""
    value: str
    label: str
    description: str

# Example data for regions
# Described by CLIMATE, not by variety. This is a climate platform and the
# blurbs read beside a "region of interest" field, so "Famous for Sauvignon
# Blanc" was both off-product and off-putting to anyone here for a different
# crop. The regions themselves are unchanged - they are the areas the surfaces
# and zone statistics actually cover.
NZ_REGION_DESCRIPTIONS = [
    {"value": "Marlborough", "label": "Marlborough", "description": "Dry, sunny, cool nights"},
    {"value": "Central Otago", "label": "Central Otago", "description": "Continental, wide temperature range"},
    {"value": "Waipara", "label": "Waipara", "description": "Sheltered and cool, warm summers"},
    {"value": "Hawke's Bay", "label": "Hawke's Bay", "description": "Warm, high sunshine hours"},
    {"value": "Martinborough", "label": "Martinborough", "description": "Cool and windy, low rainfall"},
    {"value": "Wairarapa", "label": "Wairarapa", "description": "Cool climate, marked seasons"},
    {"value": "Nelson", "label": "Nelson", "description": "High sunshine, moderate rainfall"},
    {"value": "Gisborne", "label": "Gisborne", "description": "Warm and humid, early season"},
    {"value": "Auckland", "label": "Auckland", "description": "Warm, humid, higher disease pressure"},
    {"value": "Northland", "label": "Northland", "description": "Subtropical, warmest in the country"},
    {"value": "Canterbury", "label": "Canterbury", "description": "Cool and dry, strong nor'westers"},
    {"value": "Other", "label": "Other or multiple", "description": "Elsewhere, or more than one"}
]