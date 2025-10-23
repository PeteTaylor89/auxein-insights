# app/schemas/file.py - File Management Schemas (Updated)
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, validator, computed_field
from enum import Enum

class FileCategory(str, Enum):
    photo = "photo"
    document = "document"
    certificate = "certificate"
    invoice = "invoice"
    manual = "manual"
    video = "video"
    other = "other"

class FileEntityType(str, Enum):
    asset = "asset"
    asset_maintenance = "asset_maintenance"
    asset_calibration = "asset_calibration"
    stock_movement = "stock_movement"
    reference_item = "reference_item"
    training_slide = "training_slide"
    observation_spot = "observation_spot"
    task = "task"
    # incident = "incident"

class UploadStatus(str, Enum):
    uploaded = "uploaded"
    processing = "processing"
    failed = "failed"
    deleted = "deleted"

class FileBase(BaseModel):
    original_filename: str
    entity_type: FileEntityType
    entity_id: int
    file_category: FileCategory = FileCategory.document
    description: Optional[str] = None
    tags: Optional[List[str]] = []
    is_public: bool = False

class FileCreate(FileBase):
    pass

class FileUpdate(BaseModel):
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    file_category: Optional[FileCategory] = None
    is_public: Optional[bool] = None

class FileResponse(FileBase):
    id: str
    company_id: int
    stored_filename: str
    file_path: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    upload_status: UploadStatus
    is_active: bool
    uploaded_at: datetime
    uploaded_by: Optional[int] = None
    
    # Computed URLs
    @computed_field
    @property
    def file_url(self) -> str:
        return f"/api/v1/files/{self.id}"
    
    @computed_field
    @property
    def download_url(self) -> str:
        return f"/api/v1/files/{self.id}/download"
    
    class Config:
        from_attributes = True

class FileUploadResponse(BaseModel):
    """Response for successful file upload"""
    file_id: str
    message: str
    file_url: str
    download_url: str

class FileSummary(BaseModel):
    """Lightweight file info for references"""
    id: str
    original_filename: str
    file_category: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    uploaded_at: datetime
    
    @computed_field
    @property
    def download_url(self) -> str:
        return f"/api/v1/files/{self.id}/download"
            
    class Config:
        from_attributes = True