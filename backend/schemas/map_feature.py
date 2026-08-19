# schemas/map_feature.py - Map points of interest (Maps V2)
import re
from typing import Any, Dict, Optional
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class FeatureType(str, Enum):
    """The five system types.

    **No longer the validation boundary.** Companies define their own types in
    `map_feature_types`, so the valid set is per-caller and needs a DB session —
    which pydantic does not have. `feature_type` is now a plain slug string on
    the schemas, and `api/v1/map_feature_types.resolve_feature_type()` does the
    checking inside the endpoint.

    This enum is kept because it still names the built-ins in code, but adding a
    value here does nothing on its own — seed a system row in the migration
    instead.

    The `hazard` prohibition moved with the validation: hazards belong in
    SiteRisk, the WorkSafe register, and the reserved-word guard in
    api/v1/map_feature_types.py now enforces it. See
    docs/plans/MAP_POI_CUSTOM_TYPES_2026-08-19.md §2.
    """
    access = "access"
    infrastructure = "infrastructure"
    water = "water"
    amenity = "amenity"
    note = "note"


# Slug shape only — existence is checked against the caller's vocabulary in the
# endpoint. Matches schemas/map_feature_type.slugify output.
FEATURE_TYPE_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def validate_feature_type_slug(v):
    if v is None:
        return v
    if not isinstance(v, str) or not FEATURE_TYPE_SLUG.match(v) or len(v) > 40:
        raise ValueError(
            "feature_type must be a lower-case slug such as 'access' or 'cattle-stop'"
        )
    return v


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
    feature_type: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    geometry: Dict[str, Any]  # GeoJSON
    property_id: Optional[int] = None
    style: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = True

    _validate_geometry = field_validator("geometry")(validate_geometry)
    _validate_feature_type = field_validator("feature_type")(validate_feature_type_slug)


class MapFeatureCreate(MapFeatureBase):
    # Server fills from current_user when omitted — mirrors SpatialAreaCreate,
    # where making this required meant pydantic rejected the payload before the
    # endpoint's fallback could run.
    company_id: Optional[int] = None


class MapFeatureUpdate(BaseModel):
    feature_type: Optional[str] = Field(None, min_length=1, max_length=40)
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None
    property_id: Optional[int] = None
    style: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

    _validate_geometry = field_validator("geometry")(validate_geometry)
    _validate_feature_type = field_validator("feature_type")(validate_feature_type_slug)


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
