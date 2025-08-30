# app/api/v1/observations.py 
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from db.session import get_db
from db.models.observation import Observation
from db.models.user import User
from db.models.block import VineyardBlock
from schemas.observation import ObservationCreate, ObservationUpdate, ObservationResponse, ObservationWithFiles
from api.deps import get_current_user
from utils.geometry import point_to_wkt
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/", response_model=ObservationResponse, status_code=201, tags=["observations"])
def create_observation(
    observation_in: ObservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new observation"""
    # Verify the block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == observation_in.block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Check company access permissions
    if current_user.role != "admin" and block.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to create observations for this block"
        )
    
    # Process location if provided
    location = None
    if observation_in.location:
        location = point_to_wkt(observation_in.location)
    
    # Create observation
    observation_data = observation_in.dict(exclude={"location"})
    
    # Ensure observation_type is valid
    if observation_data.get('observation_type') not in ['disease', 'pests', 'irrigation', 'weather', 'development', 'general']:
        observation_data['observation_type'] = 'general'  # Default to 'general' if invalid
    
    observation = Observation(
        **observation_data,
        location=location,
        created_by=current_user.id,
        company_id=block.company_id  # ADD THIS LINE - Set company_id from block
    )
    
    db.add(observation)
    db.commit()
    db.refresh(observation)

    logger.info(f"Observation {observation.id} created by user {current_user.id}")
    
    return observation

@router.get("/", response_model=List[ObservationResponse], tags=["observations"])
def list_observations(
    block_id: Optional[int] = None,
    observation_type: Optional[str] = None,
    created_by: Optional[int] = None,
    company_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List observations with filtering options"""
    query = db.query(Observation).options(
        joinedload(Observation.files)
    )
    
    # Apply company filtering
    if current_user.role == "admin" and company_id is not None:
        query = query.filter(Observation.company_id == company_id)
    elif current_user.role != "admin":
        if not current_user.company_id:
            return []
        query = query.filter(Observation.company_id == current_user.company_id)
    
    # Apply other filters
    if block_id:
        query = query.filter(Observation.block_id == block_id)
    if observation_type:
        query = query.filter(Observation.observation_type == observation_type)
    if created_by:
        query = query.filter(Observation.created_by == created_by)
    
    # Order by created_at desc
    query = query.order_by(Observation.created_at.desc())
    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    # Execute query
    observations = query.all()
    logger.info(f"Returning {len(observations)} observations with files")
    
    return observations

@router.get("/{observation_id}", response_model=ObservationWithFiles, tags=["observations"])
def get_observation(
    observation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific observation by ID, including its files"""
    observation = db.query(Observation).options(
        joinedload(Observation.files)
    ).filter(Observation.id == observation_id).first()
    
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    # Check company access permissions
    if current_user.role != "admin" and observation.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to view this observation"
        )

    return observation

@router.put("/{observation_id}", response_model=ObservationResponse, tags=["observations"])
def update_observation(
    observation_id: int,
    observation_update: ObservationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an observation"""
    observation = db.query(Observation).filter(Observation.id == observation_id).first()
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    # Check company access permissions
    if current_user.role != "admin" and observation.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to update this observation"
        )
    
    # Check if block is changing and verify permissions
    if observation_update.block_id and observation_update.block_id != observation.block_id:
        new_block = db.query(VineyardBlock).filter(VineyardBlock.id == observation_update.block_id).first()
        if not new_block:
            raise HTTPException(status_code=404, detail="New block not found")
        
        # If changing to a block in a different company
        if new_block.company_id != observation.company_id:
            # Only admins can change to a block from different company
            if current_user.role != "admin":
                raise HTTPException(
                    status_code=403,
                    detail="You can't assign an observation to a block from a different company"
                )
            # Update observation company to match the new block's company
            observation.company_id = new_block.company_id
    
    # Process location if provided
    location = None
    if observation_update.location:
        location = point_to_wkt(observation_update.location)
        observation.location = location
    
    # Update other attributes
    update_data = observation_update.dict(exclude={"location"}, exclude_unset=True)
    for key, value in update_data.items():
        setattr(observation, key, value)
    
    db.commit()
    db.refresh(observation)
    logger.info(f"Observation {observation_id} updated by user {current_user.id}")
    
    return observation

@router.delete("/{observation_id}", status_code=204, tags=["observations"])
def delete_observation(
    observation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an observation"""
    observation = db.query(Observation).filter(Observation.id == observation_id).first()
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    # Check company access permissions
    if current_user.role != "admin" and observation.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to delete this observation"
        )
    
    db.delete(observation)
    db.commit()
    logger.info(f"Observation {observation_id} deleted by user {current_user.id}")
    
    return None

@router.get("/block/{block_id}", response_model=List[ObservationResponse], tags=["observations"])
def get_observations_by_block(
    block_id: int,
    observation_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all observations for a specific block"""
    # Verify block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Check company access permissions
    if current_user.role != "admin" and block.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to view observations for this block"
        )
    
    # Query observations
    query = db.query(Observation).filter(Observation.block_id == block_id)
    
    if observation_type:
        query = query.filter(Observation.observation_type == observation_type)
    
    observations = query.offset(skip).limit(limit).all()
    return observations

@router.get("/company/{company_id}", response_model=List[ObservationResponse], tags=["observations"])
def get_observations_by_company(
    company_id: int,
    observation_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all observations for a specific company"""
    # Check permissions - admin or same company
    if current_user.role != "admin" and current_user.company_id != company_id:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to view observations for this company"
        )
    
    # Query observations
    query = db.query(Observation).filter(Observation.company_id == company_id)
    
    # Apply filters
    if observation_type:
        query = query.filter(Observation.observation_type == observation_type)
    
    # Order by date
    query = query.order_by(Observation.created_at.desc())
    
    observations = query.offset(skip).limit(limit).all()
    return observations