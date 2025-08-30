# app/api/v1/subscriptions.py - Updated for single tier model
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db.models.subscription import Subscription
from db.models.company import Company
from schemas.subscription import (
    Subscription as SubscriptionSchema, 
    SubscriptionPublic, 
    SubscriptionWithPricing,
    FeatureCheck
)
from api.deps import get_db, get_current_user
from db.models.user import User

router = APIRouter()

@router.get("/", response_model=List[SubscriptionSchema])
def get_all_subscriptions(
    skip: int = 0,
    limit: int = 100,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all subscriptions - simplified for single tier model
    """
    # System admins can see everything
    if current_user.role == "admin":
        query = db.query(Subscription)
        if not include_inactive:
            query = query.filter(Subscription.is_active == True)
        subscriptions = query.order_by(Subscription.sort_order).offset(skip).limit(limit).all()
        return subscriptions
    
    # Regular users only see active, public subscriptions
    subscriptions = db.query(Subscription).filter(
        Subscription.is_active == True,
        Subscription.is_public == True
    ).order_by(Subscription.sort_order).offset(skip).limit(limit).all()
    
    return subscriptions

@router.get("/primary", response_model=SubscriptionPublic)
def get_primary_subscription(db: Session = Depends(get_db)):
    """
    Get the primary subscription (no authentication required)
    """
    subscription = db.query(Subscription).filter(
        Subscription.is_primary == True,
        Subscription.is_active == True
    ).first()
    
    if not subscription:
        # Fallback to professional if no primary is set
        subscription = db.query(Subscription).filter(
            Subscription.name == "professional",
            Subscription.is_active == True
        ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Primary subscription not found"
        )
    
    return subscription

@router.get("/public", response_model=List[SubscriptionPublic])
def get_public_subscriptions(db: Session = Depends(get_db)):
    """
    Get public subscriptions for pricing pages (no authentication required)
    """
    subscriptions = db.query(Subscription).filter(
        Subscription.is_active == True,
        Subscription.is_public == True
    ).order_by(Subscription.sort_order).all()
    
    result = []
    for sub in subscriptions:
        sub_dict = {
            "id": sub.id,
            "name": sub.name,
            "display_name": sub.display_name,
            "description": sub.description,
            "price_per_ha_monthly": sub.price_per_ha_monthly,
            "price_per_ha_yearly": sub.price_per_ha_yearly,
            "base_price_monthly": sub.base_price_monthly,
            "currency": sub.currency,
            "max_users": sub.max_users,
            "max_storage_gb": sub.max_storage_gb,
            "features": sub.features,
            "trial_days": sub.trial_days,
            "trial_enabled": sub.trial_enabled,
            "sort_order": sub.sort_order,
            "is_free": sub.is_free,
            "is_unlimited_users": sub.is_unlimited_users,
            "is_unlimited_storage": sub.is_unlimited_storage,
            "is_primary": sub.is_primary,
            "minimum_hectares": sub.minimum_hectares,
            "maximum_hectares": sub.maximum_hectares
        }
        result.append(sub_dict)
    
    return result

@router.get("/public/pricing", response_model=List[SubscriptionWithPricing])
def get_subscription_pricing(
    hectares: float,
    db: Session = Depends(get_db)
):
    """
    Get subscription pricing for specific hectares (no authentication required)
    """
    if hectares < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hectares must be a positive number"
        )
    
    subscriptions = db.query(Subscription).filter(
        Subscription.is_active == True,
        Subscription.is_public == True
    ).order_by(Subscription.sort_order).all()
    
    result = []
    for sub in subscriptions:
        # Check if hectares qualify for this subscription
        if not sub.is_eligible_for_hectares(hectares):
            continue
            
        monthly_price = sub.calculate_monthly_price(hectares)
        yearly_price = sub.calculate_yearly_price(hectares)
        yearly_savings = sub.get_yearly_savings(hectares)
        savings_percentage = sub.get_yearly_savings_percentage(hectares)
        
        sub_with_pricing = SubscriptionWithPricing(
            **sub.to_dict(),
            calculated_monthly_price=Decimal(str(monthly_price)),
            calculated_yearly_price=Decimal(str(yearly_price)),
            hectares_used_for_calculation=Decimal(str(hectares)),
            yearly_savings=Decimal(str(yearly_savings)),
            yearly_savings_percentage=savings_percentage
        )
        result.append(sub_with_pricing)
    
    return result

@router.get("/current/subscription", response_model=SubscriptionSchema)
def get_current_user_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the current user's company subscription
    """
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any company"
        )
    
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    if not company.subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company has no subscription assigned"
        )
    
    return company.subscription

@router.get("/current/pricing", response_model=SubscriptionWithPricing)
def get_current_subscription_pricing(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the current user's company subscription with calculated pricing
    """
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any company"
        )
    
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company or not company.subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company or subscription not found"
        )
    
    hectares = float(company.total_hectares) if company.total_hectares else 0.0
    subscription = company.subscription
    
    monthly_price = subscription.calculate_monthly_price(hectares)
    yearly_price = subscription.calculate_yearly_price(hectares)
    yearly_savings = subscription.get_yearly_savings(hectares)
    savings_percentage = subscription.get_yearly_savings_percentage(hectares)
    
    return SubscriptionWithPricing(
        **subscription.to_dict(),
        calculated_monthly_price=Decimal(str(monthly_price)),
        calculated_yearly_price=Decimal(str(yearly_price)),
        hectares_used_for_calculation=Decimal(str(hectares)),
        yearly_savings=Decimal(str(yearly_savings)),
        yearly_savings_percentage=savings_percentage
    )

@router.get("/features/{feature_name}", response_model=FeatureCheck)
def check_feature_access(
    feature_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Check if current user's company has access to a specific feature
    In single tier model, most features are available to all
    """
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any company"
        )
    
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    has_feature = company.has_feature(feature_name)
    feature_config = company.get_feature_config(feature_name) if has_feature else None
    
    return FeatureCheck(
        feature_name=feature_name,
        is_available=has_feature,
        feature_config=feature_config,
        subscription_name=company.subscription.name if company.subscription else "unknown",
        subscription_display_name=company.subscription.display_name if company.subscription else "Unknown"
    )

@router.post("/current/calculate-pricing")
def calculate_pricing_for_hectares(
    hectares: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Calculate pricing for current subscription with different hectare amounts
    """
    if hectares < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hectares must be a positive number"
        )
    
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any company"
        )
    
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company or not company.subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company or subscription not found"
        )
    
    subscription = company.subscription
    monthly_price = subscription.calculate_monthly_price(hectares)
    yearly_price = subscription.calculate_yearly_price(hectares)
    yearly_savings = subscription.get_yearly_savings(hectares)
    savings_percentage = subscription.get_yearly_savings_percentage(hectares)
    
    return {
        "subscription_name": subscription.name,
        "subscription_display_name": subscription.display_name,
        "hectares": hectares,
        "currency": subscription.currency,
        "base_monthly_price": float(subscription.base_price_monthly),
        "per_hectare_monthly_price": float(subscription.price_per_ha_monthly),
        "per_hectare_yearly_price": float(subscription.price_per_ha_yearly) if subscription.price_per_ha_yearly else None,
        "calculated_monthly_total": monthly_price,
        "calculated_yearly_total": yearly_price,
        "yearly_savings": yearly_savings,
        "yearly_savings_percentage": savings_percentage,
        "is_unlimited_users": subscription.is_unlimited_users,
        "is_unlimited_storage": subscription.is_unlimited_storage,
        "trial_days": subscription.trial_days,
        "all_features_included": subscription.is_primary
    }

@router.get("/estimate", response_model=dict)
def get_pricing_estimate(
    hectares: float,
    db: Session = Depends(get_db)
):
    """
    Get quick pricing estimate for hectares (no authentication required)
    """
    if hectares < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hectares must be a positive number"
        )
    
    # Get the primary subscription for estimates
    subscription = db.query(Subscription).filter(
        Subscription.is_primary == True,
        Subscription.is_active == True
    ).first()
    
    if not subscription:
        subscription = db.query(Subscription).filter(
            Subscription.name == "professional",
            Subscription.is_active == True
        ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not available"
        )
    
    monthly_price = subscription.calculate_monthly_price(hectares)
    yearly_price = subscription.calculate_yearly_price(hectares)
    yearly_savings = subscription.get_yearly_savings(hectares)
    
    return {
        "hectares": hectares,
        "monthly_price": monthly_price,
        "yearly_price": yearly_price,
        "yearly_savings": yearly_savings,
        "currency": subscription.currency,
        "subscription_name": subscription.name,
        "subscription_display_name": subscription.display_name,
        "per_hectare_monthly": float(subscription.price_per_ha_monthly),
        "per_hectare_yearly": float(subscription.price_per_ha_yearly) if subscription.price_per_ha_yearly else None,
        "unlimited_users": True,
        "unlimited_storage": True,
        "trial_days": subscription.trial_days
    }