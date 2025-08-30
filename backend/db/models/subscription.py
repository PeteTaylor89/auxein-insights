# db/models/subscription.py - Updated for single powerful tier model
from sqlalchemy import Column, Integer, String, Text, Boolean, JSON, Numeric, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base_class import Base

class Subscription(Base):
    __tablename__ = "subscriptions"

    # Primary subscription info
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "pro", "enterprise" 
    display_name = Column(String(100), nullable=False)  # e.g., "Professional", "Enterprise"
    description = Column(Text, nullable=True)

    # Simplified pricing - only per hectare
    price_per_ha_monthly = Column(Numeric(10, 2), default=0.00, nullable=False)
    price_per_ha_yearly = Column(Numeric(10, 2), nullable=True)  # Optional yearly discount
    base_price_monthly = Column(Numeric(10, 2), default=0.00, nullable=False)  # Usually 0 for hectare-only pricing
    currency = Column(String(3), default="USD", nullable=False)

    # Unlimited for the main subscription, but keep model flexible
    max_users = Column(Integer, default=-1, nullable=False)  # -1 = unlimited
    max_storage_gb = Column(Numeric(10, 2), default=-1, nullable=False)  # -1 = unlimited
    
    # All features enabled by default for main subscription
    features = Column(JSON, default=dict, nullable=False)

    trial_days = Column(Integer, default=14, nullable=False)  # Standard 14-day trial
    trial_enabled = Column(Boolean, default=True, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)  
    sort_order = Column(Integer, default=0, nullable=False)  
    
    # Future expansion fields
    is_primary = Column(Boolean, default=False, nullable=False)  # Mark the main subscription
    minimum_hectares = Column(Numeric(10, 2), default=0.0, nullable=False)  # Future: minimum to qualify
    maximum_hectares = Column(Numeric(10, 2), default=-1, nullable=False)  # Future: -1 = no max
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    companies = relationship("Company", back_populates="subscription")
    
    def __repr__(self):
        return f"<Subscription(id={self.id}, name='{self.name}', display_name='{self.display_name}')>"
    
    @property
    def is_free(self):
        """Check if this is a free subscription"""
        return self.price_per_ha_monthly == 0 and self.base_price_monthly == 0
    
    @property
    def is_unlimited_users(self):
        """Check if subscription has unlimited users"""
        return self.max_users == -1
    
    @property
    def is_unlimited_storage(self):
        """Check if subscription has unlimited storage"""
        return self.max_storage_gb == -1
    
    @property
    def is_hectare_based(self):
        """Check if subscription is primarily hectare-based pricing"""
        return self.price_per_ha_monthly > 0
    
    def has_feature(self, feature_name: str) -> bool:
        """Check if subscription includes a specific feature"""
        # For the main subscription, all features are enabled by default
        if self.is_primary:
            return True
        return feature_name in self.features.get("enabled_features", [])
    
    def get_feature_config(self, feature_name: str, default=None):
        """Get configuration for a specific feature"""
        return self.features.get("feature_config", {}).get(feature_name, default)
    
    def calculate_monthly_price(self, hectares: float) -> float:
        """Calculate total monthly price based on hectares"""
        if hectares < self.minimum_hectares:
            hectares = float(self.minimum_hectares)
            
        base = float(self.base_price_monthly) if self.base_price_monthly else 0.0
        per_ha = float(self.price_per_ha_monthly) if self.price_per_ha_monthly else 0.0
        
        # Apply maximum if set (for future tiered pricing)
        if self.maximum_hectares > 0 and hectares > self.maximum_hectares:
            hectares = float(self.maximum_hectares)
            
        return base + (per_ha * hectares)
    
    def calculate_yearly_price(self, hectares: float) -> float:
        """Calculate total yearly price based on hectares"""
        if hectares < self.minimum_hectares:
            hectares = float(self.minimum_hectares)
            
        if self.price_per_ha_yearly is not None:
            base = float(self.base_price_monthly * 12) if self.base_price_monthly else 0.0
            per_ha = float(self.price_per_ha_yearly) if self.price_per_ha_yearly else 0.0
            
            # Apply maximum if set
            if self.maximum_hectares > 0 and hectares > self.maximum_hectares:
                hectares = float(self.maximum_hectares)
                
            return base + (per_ha * hectares)
        else:
            # Default to monthly * 12 if no yearly pricing
            return self.calculate_monthly_price(hectares) * 12
    
    def get_yearly_savings(self, hectares: float) -> float:
        """Calculate savings when paying yearly vs monthly"""
        monthly_annual = self.calculate_monthly_price(hectares) * 12
        yearly_price = self.calculate_yearly_price(hectares)
        return max(0, monthly_annual - yearly_price)
    
    def get_yearly_savings_percentage(self, hectares: float) -> float:
        """Get yearly savings as percentage"""
        monthly_annual = self.calculate_monthly_price(hectares) * 12
        if monthly_annual == 0:
            return 0.0
        savings = self.get_yearly_savings(hectares)
        return (savings / monthly_annual) * 100
    
    def get_usage_percentage(self, current_count: int, limit_field: str) -> float:
        """Get usage percentage for a given limit"""
        limit = getattr(self, limit_field, 0)
        if limit == -1:  # Unlimited
            return 0.0
        if limit == 0:
            return 100.0
        return min(100.0, (current_count / float(limit)) * 100)
    
    def can_add_users(self, current_user_count: int, additional_users: int = 1) -> bool:
        """Check if subscription allows adding more users"""
        if self.is_unlimited_users:
            return True
        return (current_user_count + additional_users) <= self.max_users
    
    def can_add_storage(self, current_storage_gb: float, additional_gb: float) -> bool:
        """Check if subscription allows additional storage"""
        if self.is_unlimited_storage:
            return True
        return (current_storage_gb + additional_gb) <= float(self.max_storage_gb)
    
    def is_eligible_for_hectares(self, hectares: float) -> bool:
        """Check if given hectares qualify for this subscription"""
        if hectares < self.minimum_hectares:
            return False
        if self.maximum_hectares > 0 and hectares > self.maximum_hectares:
            return False
        return True
    
    def to_dict(self):
        """Convert subscription to dictionary for API responses"""
        return {
            "id": self.id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "price_per_ha_monthly": float(self.price_per_ha_monthly) if self.price_per_ha_monthly else 0.0,
            "price_per_ha_yearly": float(self.price_per_ha_yearly) if self.price_per_ha_yearly else None,
            "base_price_monthly": float(self.base_price_monthly) if self.base_price_monthly else 0.0,
            "currency": self.currency,
            "max_users": self.max_users,
            "max_storage_gb": float(self.max_storage_gb) if self.max_storage_gb else 0.0,
            "features": self.features,
            "trial_days": self.trial_days,
            "trial_enabled": self.trial_enabled,
            "is_active": self.is_active,
            "is_public": self.is_public,
            "is_primary": self.is_primary,
            "minimum_hectares": float(self.minimum_hectares) if self.minimum_hectares else 0.0,
            "maximum_hectares": float(self.maximum_hectares) if self.maximum_hectares != -1 else -1,
            "sort_order": self.sort_order
        }