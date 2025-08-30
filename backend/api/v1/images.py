# app/api/endpoints/images.py - FIXED VERSION
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import shutil
from typing import List
import logging

from db.session import get_db
from db.models.image import Image
from db.models.observation import Observation
from db.models.user import User
from schemas.image import ImageResponse
from api.deps import get_current_user
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=ImageResponse, status_code=201, tags=["images"])
async def upload_image(
    observation_id: int,  # This comes from the router mount path
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload an image for an observation"""
    # Verify the observation exists
    observation = db.query(Observation).filter(Observation.id == observation_id).first()
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    # Check company access permissions
    if current_user.role != "admin" and observation.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to upload images for this observation"
        )
    
    # Define file path
    file_name = file.filename
    file_path = os.path.join(settings.UPLOAD_DIR, f"obs_{observation_id}_{file_name}")
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"Error saving file: {str(e)}")
        raise HTTPException(status_code=500, detail="Error saving image")
    finally:
        file.file.close()
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    # Create database record
    image = Image(
        observation_id=observation_id,
        file_path=file_path,
        file_name=file_name,
        mime_type=file.content_type,
        file_size=file_size
    )
    
    db.add(image)
    db.commit()
    db.refresh(image)
    logger.info(f"Image {image.id} uploaded for observation {observation_id}")
    
    return image

@router.get("/", response_model=List[ImageResponse], tags=["images"])
def list_observation_images(
    observation_id: int,  # This comes from the router mount path
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all images for an observation"""
    logger.info(f"Listing images for observation {observation_id}")
    
    # Verify the observation exists
    observation = db.query(Observation).filter(Observation.id == observation_id).first()
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    # Check company access permissions
    if current_user.role != "admin" and observation.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to view images for this observation"
        )
    
    # Get images
    images = db.query(Image).filter(Image.observation_id == observation_id).all()
    logger.info(f"Found {len(images)} images for observation {observation_id}")
    return images

@router.get("/{image_id}/view", tags=["images"])
def get_image(
    observation_id: int,  # This comes from the router mount path
    image_id: int,
    db: Session = Depends(get_db),

):
    """Retrieve an image file"""
    logger.info(f"Getting image {image_id} for observation {observation_id}")
    
    # Get image record
    image = db.query(Image).filter(
        Image.id == image_id,
        Image.observation_id == observation_id  # Extra safety check
    ).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get the associated observation to check company permissions
    observation = db.query(Observation).filter(Observation.id == image.observation_id).first()
    if not observation:
        raise HTTPException(status_code=404, detail="Associated observation not found")
    
    

    # Check if file exists
    if not os.path.exists(image.file_path):
        logger.error(f"Image file not found at path: {image.file_path}")
        raise HTTPException(status_code=404, detail="Image file not found")
    
    logger.info(f"Serving image file: {image.file_path}")
    return FileResponse(
        path=image.file_path,
        filename=image.file_name,
        media_type=image.mime_type
    )

@router.delete("/{image_id}", status_code=204, tags=["images"])
def delete_image(
    observation_id: int,  # This comes from the router mount path
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an image"""
    # Get image record
    image = db.query(Image).filter(
        Image.id == image_id,
        Image.observation_id == observation_id  # Extra safety check
    ).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get the associated observation to check company permissions
    observation = db.query(Observation).filter(Observation.id == image.observation_id).first()
    if not observation:
        raise HTTPException(status_code=404, detail="Associated observation not found")
    
    # Check company access permissions
    if current_user.role != "admin" and observation.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to delete this image"
        )
    
    # Delete file if it exists
    if os.path.exists(image.file_path):
        try:
            os.remove(image.file_path)
        except Exception as e:
            logger.error(f"Error deleting file: {str(e)}")
    
    # Delete database record
    db.delete(image)
    db.commit()
    logger.info(f"Image {image_id} deleted by user {current_user.id}")
    
    return None