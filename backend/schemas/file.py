# app/schemas/file.py (renamed from image.py)
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class FileBase(BaseModel):
    file_name: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    description: Optional[str] = None

class FileCreate(FileBase):
    entity_type: str
    entity_id: int
    file_path: str

class FileUpdate(BaseModel):
    description: Optional[str] = None

class FileResponse(FileBase):
    id: int
    entity_type: str
    entity_id: int
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)