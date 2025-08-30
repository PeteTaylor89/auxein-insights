# app/api/endpoints/files.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import inspect
import os
import shutil
from typing import List, Optional
import logging

from db.session import get_db
from db.models.file import File as FileModel
from db.models.observation import Observation
from db.models.contractor import Contractor
from db.models.incident import Incident
from db.models.user import User
from schemas.file import FileResponse
from api.deps import get_current_user
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Ensure upload directory exists
def ensure_upload_dir():
    """Ensure upload directory exists and is writable"""
    # Use the upload_dir from settings - it's already properly resolved in config.py
    upload_dir = settings.UPLOAD_DIR
    
    # Create directory if it doesn't exist
    os.makedirs(upload_dir, exist_ok=True)
    
    # Test if directory is writable
    test_file = os.path.join(upload_dir, 'test_write.tmp')
    try:
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        logger.info(f"Upload directory verified: {upload_dir}")
    except Exception as e:
        logger.error(f"Upload directory not writable: {upload_dir}, Error: {e}")
        raise HTTPException(status_code=500, detail="Upload directory not accessible")
    
    return upload_dir

# Entity validation mapping
VALID_ENTITIES = {
    'observation': Observation,
    'contractor': Contractor, 
    'incident': Incident,
    # Add more entities as needed
}

def validate_entity_exists(db: Session, entity_type: str, entity_id: int):
    """Validate that the entity type is valid and the entity exists"""
    if entity_type not in VALID_ENTITIES:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
    
    model_class = VALID_ENTITIES[entity_type]
    entity = db.query(model_class).filter(model_class.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{entity_type.title()} not found")
    
    return entity

def check_entity_access(entity, entity_type: str, current_user: User):
    """Check if user has access to this entity"""
    if current_user.role == "admin":
        return  # Admins have access to everything
    
    # Add entity-specific access checks
    if hasattr(entity, 'company_id') and entity.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail=f"You don't have permission to access this {entity_type}"
        )

@router.post("/{entity_type}/{entity_id}/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    entity_type: str,
    entity_id: int,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload a file for any entity"""
    
    # Validate entity exists and user has access
    entity = validate_entity_exists(db, entity_type, entity_id)
    check_entity_access(entity, entity_type, current_user)
    
    # Define file path
    file_name = file.filename
    file_path = os.path.join(settings.UPLOAD_DIR, f"{entity_type}_{entity_id}_{file_name}")
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"Error saving file: {str(e)}")
        raise HTTPException(status_code=500, detail="Error saving file")
    finally:
        file.file.close()
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    # Create database record
    file_record = FileModel(
        entity_type=entity_type,
        entity_id=entity_id,
        file_path=file_path,
        file_name=file_name,
        mime_type=file.content_type,
        file_size=file_size,
        description=description
    )
    
    db.add(file_record)
    db.commit()
    db.refresh(file_record)
    
    logger.info(f"File {file_record.id} uploaded for {entity_type} {entity_id}")
    
    return file_record

@router.get("/{entity_type}/{entity_id}/files", response_model=List[FileResponse])
def list_files(
    entity_type: str,
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all files for an entity"""
    
    # Validate entity exists and user has access
    entity = validate_entity_exists(db, entity_type, entity_id)
    check_entity_access(entity, entity_type, current_user)
    
    # Get files
    files = db.query(FileModel).filter(
        FileModel.entity_type == entity_type,
        FileModel.entity_id == entity_id
    ).all()
    
    logger.info(f"Found {len(files)} files for {entity_type} {entity_id}")
    return files

@router.get("/{entity_type}/{entity_id}/files/{file_id}")
def get_file(
    entity_type: str,
    entity_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve a file"""
    
    # Validate entity exists and user has access
    entity = validate_entity_exists(db, entity_type, entity_id)
    check_entity_access(entity, entity_type, current_user)
    
    # Get file record
    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.entity_type == entity_type,
        FileModel.entity_id == entity_id
    ).first()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if file exists
    if not os.path.exists(file_record.file_path):
        logger.error(f"File not found at path: {file_record.file_path}")
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    logger.info(f"Serving file: {file_record.file_path}")
    return FileResponse(
        path=file_record.file_path,
        filename=file_record.file_name,
        media_type=file_record.mime_type
    )

@router.put("/{entity_type}/{entity_id}/files/{file_id}", response_model=FileResponse)
def update_file_metadata(
    entity_type: str,
    entity_id: int,
    file_id: int,
    description: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update file metadata"""
    
    # Validate entity exists and user has access
    entity = validate_entity_exists(db, entity_type, entity_id)
    check_entity_access(entity, entity_type, current_user)
    
    # Get file record
    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.entity_type == entity_type,
        FileModel.entity_id == entity_id
    ).first()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Update metadata
    if description is not None:
        file_record.description = description
    
    db.commit()
    db.refresh(file_record)
    
    logger.info(f"File {file_id} metadata updated by user {current_user.id}")
    return file_record

@router.delete("/{entity_type}/{entity_id}/files/{file_id}", status_code=204)
def delete_file(
    entity_type: str,
    entity_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a file"""
    
    # Validate entity exists and user has access
    entity = validate_entity_exists(db, entity_type, entity_id)
    check_entity_access(entity, entity_type, current_user)
    
    # Get file record
    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.entity_type == entity_type,
        FileModel.entity_id == entity_id
    ).first()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete file from disk if it exists
    if os.path.exists(file_record.file_path):
        try:
            os.remove(file_record.file_path)
        except Exception as e:
            logger.error(f"Error deleting file: {str(e)}")
    
    # Delete database record
    db.delete(file_record)
    db.commit()
    
    logger.info(f"File {file_id} deleted by user {current_user.id}")
    
    return None