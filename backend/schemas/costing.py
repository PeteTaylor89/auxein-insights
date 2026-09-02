# schemas/costing.py — pay rates and company cost settings.
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


class PayRateCreate(BaseModel):
    user_id: int
    hourly_rate: Decimal = Field(..., ge=0, le=10000)
    effective_from: date
    currency: str = "NZD"
    notes: Optional[str] = None


class PayRateUpdate(BaseModel):
    hourly_rate: Optional[Decimal] = Field(None, ge=0, le=10000)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    notes: Optional[str] = None


class PayRateOut(BaseModel):
    id: int
    company_id: int
    user_id: int
    hourly_rate: Decimal
    currency: str
    effective_from: date
    effective_to: Optional[date] = None
    notes: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    # Filled by the endpoint so an admin sees a person, not a user id.
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class CostSettingsIn(BaseModel):
    default_hourly_rate: Optional[Decimal] = Field(None, ge=0, le=10000)
    # A multiplier below 1 would mean employment costs LESS than the wage, which
    # is not a thing. Capped at 2 because anything higher is a typo, not a
    # 100%-on-cost employer.
    on_cost_multiplier: Optional[Decimal] = Field(None, ge=1, le=2)
    standard_day_hours: Optional[Decimal] = Field(None, gt=0, le=24)
    currency: Optional[str] = None
    stock_costing_method: Optional[str] = None
    uncoded_hours_policy: Optional[str] = None


class CostSettingsOut(BaseModel):
    company_id: int
    default_hourly_rate: Optional[Decimal] = None
    on_cost_multiplier: Optional[Decimal] = None
    standard_day_hours: Optional[Decimal] = None
    currency: str = "NZD"
    stock_costing_method: str = "weighted_average"
    uncoded_hours_policy: str = "overhead"
    updated_at: Optional[datetime] = None

    # What is not configured yet, and what each gap costs. Returned so the
    # screen can say "daily-rate contractors are not being costed" rather than
    # leaving an admin to work out why a number is missing.
    gaps: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class StaffRateSummary(BaseModel):
    """One row per staff member for the rates screen."""
    user_id: int
    user_name: str
    user_type: Optional[str] = None
    current_rate: Optional[Decimal] = None
    current_from: Optional[date] = None
    currency: str = "NZD"
    source: str = "none"          # pay_rate | company_default | none
    history_count: int = 0


class EquipmentRateIn(BaseModel):
    # Null clears the rate, returning the asset to uncosted. Capped at 5000/h
    # because anything above that is a typo, not a machine.
    hourly_operating_rate: Optional[Decimal] = Field(None, ge=0, le=5000)


class EquipmentRateOut(BaseModel):
    asset_id: int
    asset_number: Optional[str] = None
    asset_name: str
    category: Optional[str] = None
    hourly_operating_rate: Optional[Decimal] = None
    rate_basis: Optional[str] = None
    # The machine's hour meter, now actually advanced by task completion. Shown
    # because it is what tells an admin whether a rate is worth setting.
    current_hours: Optional[Decimal] = None
    status: Optional[str] = None

    class Config:
        from_attributes = True
