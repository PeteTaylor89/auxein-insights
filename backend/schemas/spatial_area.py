# schemas/spatial_area.py 
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict
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
    company_id: int

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
    
    @classmethod
    def model_validate(cls, obj, strict=None, from_attributes=None, context=None):
        if hasattr(obj, '__dict__'):
            data = {}
            for column in obj.__table__.columns:
                data[column.name] = getattr(obj, column.name)
            
            data['geometry'] = obj.geometry_geojson
            data['centroid'] = obj.centroid
            
            return super().model_validate(data, strict=strict, from_attributes=True, context=context)
        return super().model_validate(obj, strict=strict, from_attributes=from_attributes, context=context)

class SpatialAreaWithChildren(SpatialAreaResponse):
    child_areas: List[SpatialAreaResponse] = []

class SpatialAreaFilter(BaseModel):
    area_type: Optional[AreaType] = None
    company_id: Optional[int] = None
    parent_area_id: Optional[int] = None
    is_active: Optional[bool] = None
    name_contains: Optional[str] = None