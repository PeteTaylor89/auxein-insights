# app/schemas/company.py - Fixed to properly handle subscription relationship
from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, validator
import re

class SubscriptionBase(BaseModel):
    """Basic subscription info for company responses"""
    id: int
    name: str
    display_name: str
    description: Optional[str] = None
    is_active: bool
    max_users: int
    max_storage_gb: Decimal
    features: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

class CompanyBase(BaseModel):
    name: str
    address: Optional[str] = None
    company_number: Optional[str] = None
    slug: Optional[str] = None
    domain: Optional[str] = None
    subdomain: Optional[str] = None
    billing_email: Optional[str] = None

class CompanyCreate(CompanyBase):
    # Subscription defaults - now references subscription_id instead of tier
    subscription_id: int = 1  # Default to free subscription
    total_hectares: Optional[Decimal] = Decimal('0.0')
    
    # Trial settings
    start_trial: bool = False
    trial_days: int = 14
    
    @validator("slug", pre=True, always=True)
    def generate_slug(cls, v, values):
        if v:
            v = re.sub(r'[^a-zA-Z0-9-]', '-', v.lower())
            v = re.sub(r'-+', '-', v).strip('-')
        else:
            if 'name' in values:
                v = re.sub(r'[^a-zA-Z0-9-]', '-', values['name'].lower())
                v = re.sub(r'-+', '-', v).strip('-')
        return v
    
    @validator("subscription_id")
    def validate_subscription_id(cls, v):
        if v < 1:
            raise ValueError("Subscription ID must be valid")
        return v

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    company_number: Optional[str] = None
    slug: Optional[str] = None
    domain: Optional[str] = None
    subdomain: Optional[str] = None
    billing_email: Optional[str] = None
    total_hectares: Optional[Decimal] = None
    
    # Admin-only fields
    subscription_id: Optional[int] = None
    subscription_status: Optional[str] = None
    feature_overrides: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    
    @validator("subscription_id")
    def validate_subscription_id(cls, v):
        if v is not None and v < 1:
            raise ValueError("Subscription ID must be valid")
        return v

class CompanyInDBBase(CompanyBase):
    id: int
    subscription_id: int
    subscription_status: str
    total_hectares: Decimal
    feature_overrides: Dict[str, Any]
    settings: Dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Subscription info
    subscription_provider_id: Optional[str] = None
    subscription_external_id: Optional[str] = None
    current_monthly_amount: Optional[Decimal] = None
    current_yearly_amount: Optional[Decimal] = None
    currency: str
    billing_interval: str
    
    # Trial info
    trial_start: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    is_trial: bool
    
    # Subscription dates
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None

    class Config:
        from_attributes = True  # Updated for Pydantic V2

class Company(CompanyInDBBase):
    pass

class CompanyWithSubscription(Company):
    """Company with subscription details included"""
    subscription: Optional[SubscriptionBase] = None

class CompanyWithStats(CompanyWithSubscription):
    """Company with usage statistics and subscription details"""
    user_count: Optional[int] = None
    observation_count: Optional[int] = None
    task_count: Optional[int] = None
    storage_used_gb: Optional[float] = None
    
    # Usage percentages (calculated from subscription limits)
    user_usage_percent: Optional[float] = None
    storage_usage_percent: Optional[float] = None

class CompanyStats(BaseModel):
    """Standalone statistics schema - now gets limits from subscription"""
    block_count: int
    observation_count: int
    task_count: int
    user_count: int
    storage_used_gb: float = 0.0
    
    # Limits from subscription
    max_users: int
    max_storage_gb: float
    user_usage_percent: float
    storage_usage_percent: float
    
    # Feature access from subscription
    enabled_features: List[str] = []
    
    # Subscription info
    subscription_name: str
    subscription_display_name: str
    
    class Config:
        from_attributes = True  # Updated for Pydantic V2

class CompanySubscriptionUpdate(BaseModel):
    """Schema for updating company subscription (admin only)"""
    subscription_id: int
    total_hectares: Optional[Decimal] = None
    start_trial: bool = False
    trial_days: Optional[int] = None
    
    @validator("subscription_id")
    def validate_subscription_id(cls, v):
        if v < 1:
            raise ValueError("Subscription ID must be valid")
        return v