# schemas/property.py - Property & ManagementRelationship schemas (Phase A, Grow V1)
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


# --- Property ---

class PropertyBase(BaseModel):
    name: str
    owner_company_id: Optional[int] = None
    address: Optional[str] = None
    legal_description: Optional[str] = None
    total_area_ha: Optional[Decimal] = None
    region: Optional[str] = None
    grapelink_grower_id: Optional[str] = None
    grapelink_property_code: Optional[str] = None
    climate_zone_id: Optional[int] = None
    forecast_latitude: Optional[Decimal] = None
    forecast_longitude: Optional[Decimal] = None


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    legal_description: Optional[str] = None
    total_area_ha: Optional[Decimal] = None
    region: Optional[str] = None
    grapelink_grower_id: Optional[str] = None
    grapelink_property_code: Optional[str] = None
    climate_zone_id: Optional[int] = None
    forecast_latitude: Optional[Decimal] = None
    forecast_longitude: Optional[Decimal] = None


class PropertyOut(PropertyBase):
    id: int
    active_managing_company_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- ManagementRelationship ---

class ManagementRelationshipCreate(BaseModel):
    managing_company_id: int
    start_date: date
    contract_reference: Optional[str] = None
    notes: Optional[str] = None


class ManagementRelationshipOut(BaseModel):
    id: int
    property_id: int
    managing_company_id: int
    start_date: date
    end_date: Optional[date] = None
    contract_reference: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- UserPropertyScope ---

class UserPropertyScopeOut(BaseModel):
    id: int
    user_id: int
    property_id: int

    class Config:
        from_attributes = True


class UserPropertyScopeCreate(BaseModel):
    property_id: int
