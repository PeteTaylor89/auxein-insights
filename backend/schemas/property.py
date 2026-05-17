# schemas/property.py - Property & ManagementRelationship schemas (Phase A, Grow V1)
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Any, Dict
from pydantic import BaseModel, field_validator

logger = logging.getLogger(__name__)


def _coerce_geometry_to_geojson(v):
    """Field validator helper: PostGIS column → GeoJSON dict.

    `model_validate(prop)` reads `prop.geometry` directly off the SQLAlchemy
    instance, which is a `WKBElement`. Pydantic can't coerce that to a Dict,
    so we intercept the raw value here and convert via shapely. Already-dict
    inputs (manual assignments) pass through unchanged.
    """
    if v is None:
        return None
    if isinstance(v, dict):
        return v
    try:
        from geoalchemy2.shape import to_shape
        from shapely.geometry import mapping
        return mapping(to_shape(v))
    except Exception as e:
        logger.warning(f"Failed to coerce property geometry to GeoJSON: {e}")
        return None


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
    # GeoJSON Polygon or MultiPolygon. Stored in PostGIS as 4326. Pass null to
    # clear an existing boundary; omit the field entirely to leave it untouched.
    geometry: Optional[Dict[str, Any]] = None


class PropertyOut(PropertyBase):
    id: int
    active_managing_company_id: Optional[int] = None
    # Boundary polygon as GeoJSON geometry (Polygon or MultiPolygon). The
    # field_validator below transparently converts the WKBElement read from
    # `prop.geometry` (via from_attributes) into a GeoJSON dict at validation
    # time, so model_validate(prop) Just Works.
    geometry: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    _coerce_geometry = field_validator('geometry', mode='before')(_coerce_geometry_to_geojson)

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
