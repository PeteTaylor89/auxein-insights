# schemas/map_feature.py - Map points of interest (Maps V2)
from typing import Any, Dict, Optional
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class FeatureType(str, Enum):
    access = "access"
    infrastructure = "infrastructure"
    water = "water"
    amenity = "amenity"
    note = "note"
    # No `hazard` — hazards belong in SiteRisk (the WorkSafe register).


_ALLOWED_GEOMETRY = {"Point", "LineString", "Polygon"}


def validate_geometry(v):
    """Reject anything the map can't draw before it reaches PostGIS.

    The column is a generic GEOMETRY, so Postgres would happily accept a
    GeometryCollection or a MultiPolygon that no part of the UI can render or
    edit. Fail loudly at the edge instead.

    Passes None through — the update schema allows omitting geometry entirely.
    """
    if v is None:
        return v
    if not isinstance(v, dict):
        raise ValueError("geometry must be a GeoJSON object")
    geom_type = v.get("type")
    if geom_type not in _ALLOWED_GEOMETRY:
        raise ValueError(
            f"geometry.type must be one of {sorted(_ALLOWED_GEOMETRY)}, got {geom_type!r}"
        )
    if not v.get("coordinates"):
        raise ValueError("geometry.coordinates is required and must be non-empty")
    return v


class MapFeatureBase(BaseModel):
    feature_type: FeatureType
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    geometry: Dict[str, Any]  # GeoJSON
    property_id: Optional[int] = None
    style: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = True

    _validate_geometry = field_validator("geometry")(validate_geometry)


class MapFeatureCreate(MapFeatureBase):
    # Server fills from current_user when omitted — mirrors SpatialAreaCreate,
    # where making this required meant pydantic rejected the payload before the
    # endpoint's fallback could run.
    company_id: Optional[int] = None


class MapFeatureUpdate(BaseModel):
    feature_type: Optional[FeatureType] = None
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None
    property_id: Optional[int] = None
    style: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

    _validate_geometry = field_validator("geometry")(validate_geometry)


class MapFeatureResponse(MapFeatureBase):
    id: int
    company_id: int
    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _convert_geometry(cls, data):
        """PostGIS WKBElement -> GeoJSON dict.

        Must be `mode="before"` on a model_validator, NOT a custom
        model_validate override: the override only fires on the direct
        `.model_validate(orm_obj)` path and silently misses nested
        serialization, which is what broke GET /tasks for spatial areas.
        """
        if hasattr(data, "__dict__") and hasattr(data, "__table__"):
            out = {c.name: getattr(data, c.name) for c in data.__table__.columns}
            geom = out.get("geometry")
            if geom is not None:
                try:
                    from geoalchemy2.shape import to_shape
                    from shapely.geometry import mapping
                    out["geometry"] = mapping(to_shape(geom))
                except Exception:
                    out["geometry"] = None
            return out
        return data
