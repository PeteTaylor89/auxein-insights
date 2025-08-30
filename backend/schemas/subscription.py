# app/schemas/subscription.py - Updated for single tier model
from typing import Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, validator

class SubscriptionBase(BaseModel):
    name: str
    display_name: str
    description: Optional[str] = None
    price_per_ha_monthly: Decimal = Decimal('0.00')
    price_per_ha_yearly: Optional[Decimal] = None
    base_price_monthly: Decimal = Decimal('0.00')
    currency: str = "USD"
    max_users: int = -1  # Default to unlimited
    max_storage_gb: Decimal = Decimal('-1')  # Default to unlimited
    features: Dict[str, Any] = {}
    trial_days: int = 14  # Default 14-day trial
    trial_enabled: bool = True
    is_active: bool = True
    is_public: bool = True
    is_primary: bool = False  # Mark the main subscription
    minimum_hectares: Decimal = Decimal('0.0')
    maximum_hectares: Decimal = Decimal('-1')  # -1 = no maximum
    sort_order: int = 0

class SubscriptionCreate(SubscriptionBase):
    """Schema for creating new subscriptions (admin only)"""
    
    @validator("name")
    def validate_name(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError("Subscription name must be at least 2 characters")
        import re
        if not re.match(r'^[a-z0-9_-]+$', v):
            raise ValueError("Subscription name must be lowercase with only letters, numbers, underscores, and hyphens")
        return v.strip().lower()
    
    @validator("display_name")
    def validate_display_name(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError("Display name must be at least 2 characters")
        return v.strip()
    
    @validator("price_per_ha_monthly")
    def validate_monthly_price(cls, v):
        if v < 0:
            raise ValueError("Monthly price per hectare must be non-negative")
        return v
    
    @validator("price_per_ha_yearly")
    def validate_yearly_price(cls, v):
        if v is not None and v < 0:
            raise ValueError("Yearly price per hectare must be non-negative")
        return v
    
    @validator("max_users")
    def validate_max_users(cls, v):
        if v < -1:
            raise ValueError("Max users must be -1 (unlimited) or positive number")
        return v
    
    @validator("max_storage_gb")
    def validate_storage(cls, v):
        if v < -1:
            raise ValueError("Storage limit must be -1 (unlimited) or positive number")
        return v
    
    @validator("trial_days")
    def validate_trial_days(cls, v):
        if v < 0 or v > 365:
            raise ValueError("Trial days must be between 0 and 365")
        return v
    
    @validator("minimum_hectares")
    def validate_minimum_hectares(cls, v):
        if v < 0:
            raise ValueError("Minimum hectares must be non-negative")
        return v
    
    @validator("maximum_hectares")
    def validate_maximum_hectares(cls, v, values):
        if v != -1 and v <= 0:
            raise ValueError("Maximum hectares must be -1 (unlimited) or positive number")
        if v != -1 and "minimum_hectares" in values and v <= values["minimum_hectares"]:
            raise ValueError("Maximum hectares must be greater than minimum hectares")
        return v
    
    @validator("features")
    def validate_features(cls, v):
        if not isinstance(v, dict):
            raise ValueError("Features must be a dictionary")
        
        if "enabled_features" in v and not isinstance(v["enabled_features"], list):
            raise ValueError("enabled_features must be a list")
        
        if "feature_config" in v and not isinstance(v["feature_config"], dict):
            raise ValueError("feature_config must be a dictionary")
        
        return v

class SubscriptionUpdate(BaseModel):
    """Schema for updating subscriptions (admin only)"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    price_per_ha_monthly: Optional[Decimal] = None
    price_per_ha_yearly: Optional[Decimal] = None
    base_price_monthly: Optional[Decimal] = None
    currency: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[Decimal] = None
    features: Optional[Dict[str, Any]] = None
    trial_days: Optional[int] = None
    trial_enabled: Optional[bool] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None
    is_primary: Optional[bool] = None
    minimum_hectares: Optional[Decimal] = None
    maximum_hectares: Optional[Decimal] = None
    sort_order: Optional[int] = None
    
    @validator("price_per_ha_monthly")
    def validate_monthly_price(cls, v):
        if v is not None and v < 0:
            raise ValueError("Monthly price per hectare must be non-negative")
        return v
    
    @validator("price_per_ha_yearly")
    def validate_yearly_price(cls, v):
        if v is not None and v < 0:
            raise ValueError("Yearly price per hectare must be non-negative")
        return v
    
    @validator("max_users")
    def validate_max_users(cls, v):
        if v is not None and v < -1:
            raise ValueError("Max users must be -1 (unlimited) or positive number")
        return v
    
    @validator("max_storage_gb")
    def validate_storage(cls, v):
        if v is not None and v < -1:
            raise ValueError("Storage limit must be -1 (unlimited) or positive number")
        return v

class SubscriptionInDBBase(SubscriptionBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True  # Updated for Pydantic V2

class Subscription(SubscriptionInDBBase):
    """Standard subscription response"""
    pass

class SubscriptionPublic(BaseModel):
    """Public subscription info for registration/pricing pages"""
    id: int
    name: str
    display_name: str
    description: Optional[str] = None
    price_per_ha_monthly: Decimal
    price_per_ha_yearly: Optional[Decimal] = None
    base_price_monthly: Decimal
    currency: str
    max_users: int
    max_storage_gb: Decimal
    features: Dict[str, Any]
    trial_days: int
    trial_enabled: bool
    sort_order: int
    is_primary: bool
    minimum_hectares: Decimal
    maximum_hectares: Decimal
    
    # Computed properties for display
    is_free: bool = False
    is_unlimited_users: bool = False
    is_unlimited_storage: bool = False
    is_hectare_based: bool = False
    
    @validator("is_free", pre=False, always=True)
    def set_is_free(cls, v, values):
        return (
            values.get("price_per_ha_monthly", 0) == 0 and 
            values.get("base_price_monthly", 0) == 0
        )
    
    @validator("is_unlimited_users", pre=False, always=True) 
    def set_is_unlimited_users(cls, v, values):
        return values.get("max_users", 0) == -1
    
    @validator("is_unlimited_storage", pre=False, always=True)
    def set_is_unlimited_storage(cls, v, values):
        return values.get("max_storage_gb", 0) == -1
    
    @validator("is_hectare_based", pre=False, always=True)
    def set_is_hectare_based(cls, v, values):
        return values.get("price_per_ha_monthly", 0) > 0
    
    class Config:
        from_attributes = True

class SubscriptionWithPricing(Subscription):
    """Subscription with calculated pricing for specific hectares"""
    calculated_monthly_price: Decimal
    calculated_yearly_price: Decimal
    hectares_used_for_calculation: Decimal
    yearly_savings: Optional[Decimal] = None
    yearly_savings_percentage: Optional[float] = None

class SubscriptionEstimate(BaseModel):
    """Quick pricing estimate (no auth required)"""
    hectares: float
    monthly_price: float
    yearly_price: float
    yearly_savings: float
    currency: str
    subscription_name: str
    subscription_display_name: str
    per_hectare_monthly: float
    per_hectare_yearly: Optional[float] = None
    unlimited_users: bool = True
    unlimited_storage: bool = True
    trial_days: int

class SubscriptionUsage(BaseModel):
    """Subscription with current usage statistics - simplified for single tier"""
    subscription: Subscription
    current_users: int
    current_storage_gb: Decimal
    
    # Usage percentages (always 0 for unlimited)
    users_usage_percent: float = 0.0
    storage_usage_percent: float = 0.0
    
    # Limit checks (always true for single tier)
    can_add_users: bool = True
    can_add_storage: bool = True
    
    class Config:
        from_attributes = True

class FeatureCheck(BaseModel):
    """Response for checking if a feature is available"""
    feature_name: str
    is_available: bool
    feature_config: Optional[Dict[str, Any]] = None
    subscription_name: str
    subscription_display_name: str
    is_primary_subscription: bool = False

class BillingCalculation(BaseModel):
    """Detailed billing calculation breakdown"""
    subscription_name: str
    subscription_display_name: str
    hectares: float
    currency: str
    
    # Base pricing
    base_monthly_price: float
    per_hectare_monthly_price: float
    per_hectare_yearly_price: Optional[float] = None
    
    # Calculated totals
    calculated_monthly_total: float
    calculated_yearly_total: float
    
    # Savings
    yearly_savings: float
    yearly_savings_percentage: float
    
    # Benefits
    is_unlimited_users: bool
    is_unlimited_storage: bool
    trial_days: int
    all_features_included: bool

class CompanyBillingSummary(BaseModel):
    """Complete billing summary for a company"""
    company_name: str
    total_hectares: float
    subscription_name: str
    monthly_cost: float
    yearly_cost: float
    cost_per_hectare_monthly: float
    yearly_savings: float
    yearly_savings_percentage: float
    currency: str
    billing_interval: str
    is_trial: bool
    days_remaining_trial: int
    subscription_status: str
    unlimited_users: bool
    unlimited_storage: bool