# app/api/v1/files.py - File Management API
import os
import uuid
import logging
from typing import List, Optional, Union
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File as FastAPIFile, Form
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.orm import Session
from pathlib import Path

from core.config import settings
from db.session import get_db
from db.models.file import File
from db.models.user import User
from db.models.contractor import Contractor
from db.models.company import Company
from schemas.file import (
    FileCreate, FileUpdate, FileResponse, FileUploadResponse, 
    FileSummary, FileEntityType, FileCategory
)
from api.deps import get_current_user, get_current_contractor, get_current_user_or_contractor

logger = logging.getLogger(__name__)
router = APIRouter()

# Allowed file types and size limits
ALLOWED_EXTENSIONS = {
    'image': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
    'document': ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
    'spreadsheet': ['.xls', '.xlsx', '.csv'],
    'video': ['.mp4', '.avi', '.mov', '.wmv', '.flv'],
    'archive': ['.zip', '.rar', '.7z', '.tar']
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_MIME_TYPES = {
    'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/rtf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv',
    'application/zip', 'application/x-rar-compressed'
}

def validate_file(file: UploadFile) -> None:
    """Validate file type and size"""
    if file.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size {file.size} exceeds maximum allowed size of {MAX_FILE_SIZE} bytes"
        )
    
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file.content_type} is not allowed"
        )
    
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    allowed = False
    for category, extensions in ALLOWED_EXTENSIONS.items():
        if file_ext in extensions:
            allowed = True
            break
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension {file_ext} is not allowed"
        )

def create_upload_directory(company_id: int, entity_type: str) -> Path:
    """Create upload directory structure"""
    today = date.today()
    upload_path = Path(settings.UPLOAD_DIR) / str(company_id) / entity_type / str(today.year) / f"{today.month:02d}"
    upload_path.mkdir(parents=True, exist_ok=True)
    return upload_path

def save_uploaded_file(file: UploadFile, file_path: Path) -> None:
    """Save uploaded file to disk"""
    try:
        with open(file_path, "wb") as buffer:
            content = file.file.read()
            buffer.write(content)
    except Exception as e:
        logger.error(f"Error saving file {file_path}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file"
        )

@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    entity_type: FileEntityType = Form(...),
    entity_id: int = Form(...),
    file_category: FileCategory = Form(FileCategory.document),
    description: Optional[str] = Form(None),
    file: UploadFile = FastAPIFile(...),
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Upload a file and associate it with an entity"""
    logger.info(f"File upload started: {file.filename} for {entity_type}:{entity_id}")
    
    # Validate file
    validate_file(file)
    
    # Get company_id based on user type
    if isinstance(current_user_or_contractor, User):
        company_id = current_user_or_contractor.company_id
        uploaded_by = current_user_or_contractor.id
        if not company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must be associated with a company"
            )
    else:
        # For contractors, we need to determine company from the entity they're working with
        # This is business logic dependent - for now, raise an error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contractors cannot upload files directly. Files must be uploaded by company users."
        )
    
    # Verify entity exists and user has access (basic check)
    # You might want to add specific entity validation here
    
    try:
        # Generate file ID and stored filename
        file_id = str(uuid.uuid4())
        stored_filename = File.generate_stored_filename(
            entity_type=entity_type.value,
            entity_id=entity_id,
            original_filename=file.filename
        )
        
        # Create upload directory
        upload_dir = create_upload_directory(company_id, entity_type.value)
        file_path = upload_dir / stored_filename
        
        # Save file to disk
        save_uploaded_file(file, file_path)
        
        # Create file record in database
        db_file = File(
            id=file_id,
            company_id=company_id,
            entity_type=entity_type.value,
            entity_id=entity_id,
            original_filename=file.filename,
            stored_filename=stored_filename,
            file_path=str(file_path),
            file_size=file.size,
            mime_type=file.content_type,
            file_category=file_category.value,
            description=description,
            uploaded_by=uploaded_by,
            upload_status="uploaded"
        )
        
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        
        logger.info(f"File uploaded successfully: {file_id}")
        
        return FileUploadResponse(
            file_id=file_id,
            message="File uploaded successfully",
            file_url=f"/api/v1/files/{file_id}",
            download_url=f"/api/v1/files/{file_id}/download"
        )
        
    except Exception as e:
        logger.error(f"File upload failed: {str(e)}")
        # Clean up file if database operation failed
        if 'file_path' in locals() and file_path.exists():
            try:
                file_path.unlink()
            except:
                pass
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File upload failed"
        )

@router.get("/", response_model=List[FileResponse])
def list_files(
    entity_type: Optional[FileEntityType] = None,
    entity_id: Optional[int] = None,
    file_category: Optional[FileCategory] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """List files with filtering options"""
    query = db.query(File).filter(File.is_active == True)
    
    # Filter by company for users
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin":
            query = query.filter((File.company_id == user.company_id) | (File.is_public == True))
    
    # Apply filters
    if entity_type:
        query = query.filter(File.entity_type == entity_type.value)
    if entity_id:
        query = query.filter(File.entity_id == entity_id)
    if file_category:
        query = query.filter(File.file_category == file_category.value)
    
    # Apply pagination and order
    files = query.order_by(File.uploaded_at.desc()).offset(skip).limit(limit).all()
    
    # Add computed URLs
    for file in files:
        file.file_url = f"/api/v1/files/{file.id}"
        file.download_url = f"/api/v1/files/{file.id}/download"
    
    return files

@router.get("/{file_id}", response_model=FileResponse)
def get_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get file metadata by ID"""
    file = db.query(File).filter(File.id == file_id, File.is_active == True).first()
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # Check permissions
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and (not file.is_public) and file.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Add computed URLs
    file.file_url = f"/api/v1/files/{file.id}"
    file.download_url = f"/api/v1/files/{file.id}/download"
    
    return file

@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Download file by ID"""
    file = db.query(File).filter(File.id == file_id, File.is_active == True).first()
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # For photos, allow public access within company (skip permission check)
    if file.file_category == "photo" and file.mime_type and file.mime_type.startswith("image/"):
        pass  # Skip all permission checks for photos
    else:
        # Keep existing permission checks for other file types
        if isinstance(current_user_or_contractor, User):
            user = current_user_or_contractor
            if user.role != "admin" and (not file.is_public) and file.company_id != user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not enough permissions"
                )

    # Check if file exists on disk
    file_path = Path(file.file_path)
    if not file_path.exists():
        logger.error(f"File not found on disk: {file.file_path}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk"
        )
    
    return FastAPIFileResponse(
        path=file_path,
        filename=file.original_filename,
        media_type=file.mime_type
    )

@router.put("/{file_id}", response_model=FileResponse)
def update_file(
    file_id: str,
    file_update: FileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can update
):
    """Update file metadata"""
    file = db.query(File).filter(File.id == file_id, File.is_active == True).first()
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and file.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Update file attributes
    update_data = file_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(file, key, value)
    
    db.commit()
    db.refresh(file)
    
    # Computed URLs are automatically available via the model's @property methods
    
    logger.info(f"File {file_id} updated by user {current_user.id}")
    return file

@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: str,
    permanent: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can delete
):
    """Delete file (soft delete by default)"""
    file = db.query(File).filter(File.id == file_id).first()
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and file.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    if permanent:
        # Hard delete - remove from disk and database
        file_path = Path(file.file_path)
        if file_path.exists():
            try:
                file_path.unlink()
                logger.info(f"File deleted from disk: {file.file_path}")
            except Exception as e:
                logger.error(f"Failed to delete file from disk: {str(e)}")
        
        db.delete(file)
        logger.info(f"File {file_id} permanently deleted by user {current_user.id}")
    else:
        # Soft delete
        file.is_active = False
        file.upload_status = "deleted"
        file.deleted_at = datetime.now()
        file.deleted_by = current_user.id
        logger.info(f"File {file_id} soft deleted by user {current_user.id}")
    
    db.commit()
    return None

@router.get("/entity/{entity_type}/{entity_id}", response_model=List[FileSummary])
def get_entity_files(
    entity_type: FileEntityType,
    entity_id: int,
    file_category: Optional[FileCategory] = None,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get all files for a specific entity"""
    query = db.query(File).filter(
        File.entity_type == entity_type.value,
        File.entity_id == entity_id,
        File.is_active == True
    )
    
    # Filter by company for users
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin":
            query = query.filter((File.company_id == user.company_id) | (File.is_public == True))
    
    if file_category:
        query = query.filter(File.file_category == file_category.value)
    
    files = query.order_by(File.uploaded_at.desc()).all()
    return files