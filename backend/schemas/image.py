# app/schemas/image.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class ImageBase(BaseModel):
    file_name: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None

class ImageCreate(ImageBase):
    observation_id: int
    file_path: str

class ImageResponse(ImageBase):
    id: int
    observation_id: int
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)