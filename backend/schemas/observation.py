# app/schemas/observation.py 
from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from geojson_pydantic import Point
from schemas.file import FileResponse

class ObservationType(str, Enum):
    disease = "disease"
    pests = "pests"
    irrigation = "irrigation"
    weather = "weather"
    development = "development"
    general = "general"

class ObservationBase(BaseModel):
    block_id: int
    observation_type: ObservationType
    notes: Optional[str] = None
    location: Optional[Point] = None

class ObservationCreate(ObservationBase):
    pass

class ObservationUpdate(BaseModel):
    block_id: Optional[int] = None
    observation_type: Optional[ObservationType] = None
    notes: Optional[str] = None
    location: Optional[Point] = None

class ObservationResponse(BaseModel):
    id: int
    block_id: int
    observation_type: ObservationType
    notes: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: datetime
    location: Optional[Dict[str, Any]] = None
    files: List[FileResponse] = []
    
    model_config = ConfigDict(from_attributes=True)
    
    @model_validator(mode='before')
    @classmethod
    def convert_location(cls, data):
        """Convert WKB location to GeoJSON"""
        if hasattr(data, '__dict__'):
            # Convert SQLAlchemy model to dict
            data_dict = {c.name: getattr(data, c.name) for c in data.__table__.columns}
            
            # Handle location conversion
            if 'location' in data_dict and data_dict['location'] is not None:
                try:
                    from geoalchemy2.shape import to_shape
                    from shapely.geometry import mapping
                    geom = to_shape(data_dict['location'])
                    data_dict['location'] = mapping(geom)
                except Exception as e:
                    print(f"Error converting location: {e}")
                    data_dict['location'] = None
            
            # Handle files relationship
            if hasattr(data, 'files'):
                data_dict['files'] = data.files
            
            return data_dict
        return data

# Simplified file info for display
class FileInfo(BaseModel):
    id: int
    file_name: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_at: datetime
    description: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

# Extended response with detailed file information
class ObservationWithFiles(ObservationResponse):
    files: List[FileInfo] = []