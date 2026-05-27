# schemas/spatial_area.py
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, model_validator
from datetime import datetime
from enum import Enum

class AreaType(str, Enum):
    paddock = "paddock"
    orchard = "orchard"
    plantation_forestry = "plantation_forestry"
    native_forest = "native_forest"
    infrastructure_zone = "infrastructure_zone"
    waterway = "waterway"
    wetland = "wetland"
    conservation_area = "conservation_area"
    waste_management = "waste_management"

class SpatialAreaBase(BaseModel):
    area_type: AreaType
    name: str
    description: Optional[str] = None
    geometry: Dict[str, Any]  # GeoJSON
    parent_area_id: Optional[int] = None
    area_metadata: Optional[Dict[str, Any]] = {}
    is_active: Optional[bool] = True
    area_hectares: Optional[float] = None

class SpatialAreaCreate(SpatialAreaBase):
    # Optional — server fills from current_user when omitted by the client.
    # The /spatial-areas POST endpoint already has the fallback (defaults to
    # current_user.company_id when not provided). Pydantic was rejecting the
    # payload before that fallback could run.
    company_id: Optional[int] = None

class SpatialAreaUpdate(BaseModel):
    area_type: Optional[AreaType] = None
    name: Optional[str] = None
    description: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None
    parent_area_id: Optional[int] = None
    area_metadata: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class SpatialAreaResponse(SpatialAreaBase):
    id: int
    company_id: int
    area_hectares: Optional[float] = None
    centroid: Optional[Dict[str, float]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='before')
    @classmethod
    def _convert_geometry_fields(cls, data):
        """Convert PostGIS WKBElement → GeoJSON dict for `geometry` and `centroid`.

        Fires for both direct `.model_validate(orm_obj)` calls and nested
        Pydantic serialization (e.g. `TaskWithRelations.spatial_area`).
        The old override only handled the direct path, which is why GET
        /tasks broke whenever a task had a spatial_area assigned.
        """
        if hasattr(data, '__dict__') and hasattr(data, '__table__'):
            data_dict = {c.name: getattr(data, c.name) for c in data.__table__.columns}

            geom = data_dict.get('geometry')
            if geom is not None:
                try:
                    from geoalchemy2.shape import to_shape
                    from shapely.geometry import mapping
                    data_dict['geometry'] = mapping(to_shape(geom))
                except Exception:
                    data_dict['geometry'] = None

            # Centroid is a computed property on the ORM model, not a column.
            try:
                data_dict['centroid'] = data.centroid
            except Exception:
                data_dict['centroid'] = None

            return data_dict
        return data

class SpatialAreaWithChildren(SpatialAreaResponse):
    child_areas: List[SpatialAreaResponse] = []

class SpatialAreaFilter(BaseModel):
    area_type: Optional[AreaType] = None
    company_id: Optional[int] = None
    parent_area_id: Optional[int] = None
    is_active: Optional[bool] = None
    name_contains: Optional[str] = None