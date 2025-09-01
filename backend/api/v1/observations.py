# app/api/v1/observations.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from db.session import get_db
from db.models.observation import Observation
from db.models.user import User
from db.models.block import VineyardBlock
from schemas.observation import (
    ObservationCreate,
    ObservationUpdate,
    ObservationResponse,
)
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

    # ObservationType is validated by schema; no need to coerce here
    observation_data = observation_in.model_dump(exclude={"location"})
    observation = Observation(
        **observation_data,
        location=location,
        created_by=current_user.id,
        company_id=block.company_id
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
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List observations with filtering options.
    Supports optional date range filters (start_date, end_date) for created_at.
    """
    query = db.query(Observation)

    # Company scoping
    if current_user.role == "admin" and company_id is not None:
        query = query.filter(Observation.company_id == company_id)
    elif current_user.role != "admin":
        if not current_user.company_id:
            return []
        query = query.filter(Observation.company_id == current_user.company_id)

    # Filters
    if block_id is not None:
        query = query.filter(Observation.block_id == block_id)
    if observation_type is not None:
        query = query.filter(Observation.observation_type == observation_type)
    if created_by is not None:
        query = query.filter(Observation.created_by == created_by)
    if start_date is not None:
        query = query.filter(Observation.created_at >= start_date)
    if end_date is not None:
        query = query.filter(Observation.created_at <= end_date)

    observations = (
        query.order_by(Observation.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    logger.info(f"Returning {len(observations)} observations")
    return observations


@router.get("/{observation_id}", response_model=ObservationResponse, tags=["observations"])
def get_observation(
    observation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific observation by ID"""
    observation = db.query(Observation).filter(Observation.id == observation_id).first()

    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")

    # Company access
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

    # Company access
    if current_user.role != "admin" and observation.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to update this observation"
        )

    # If block is changing, validate and possibly update company
    if observation_update.block_id and observation_update.block_id != observation.block_id:
        new_block = db.query(VineyardBlock).filter(VineyardBlock.id == observation_update.block_id).first()
        if not new_block:
            raise HTTPException(status_code=404, detail="New block not found")

        if new_block.company_id != observation.company_id:
            if current_user.role != "admin":
                raise HTTPException(
                    status_code=403,
                    detail="You can't assign an observation to a block from a different company"
                )
            observation.company_id = new_block.company_id

        observation.block_id = observation_update.block_id

    # Process location if provided
    if observation_update.location:
        observation.location = point_to_wkt(observation_update.location)

    # Update other attributes
    update_data = observation_update.model_dump(exclude={"location"}, exclude_unset=True)
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

    # Company access
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
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all observations for a specific block (optional type/date filters)"""
    # Verify block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    # Company access
    if current_user.role != "admin" and block.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to view observations for this block"
        )

    query = db.query(Observation).filter(Observation.block_id == block_id)

    if observation_type:
        query = query.filter(Observation.observation_type == observation_type)
    if start_date is not None:
        query = query.filter(Observation.created_at >= start_date)
    if end_date is not None:
        query = query.filter(Observation.created_at <= end_date)

    observations = query.order_by(Observation.created_at.desc()).offset(skip).limit(limit).all()
    return observations


@router.get("/company/{company_id}", response_model=List[ObservationResponse], tags=["observations"])
def get_observations_by_company(
    company_id: int,
    observation_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all observations for a specific company (optional type/date filters)"""
    # Permissions: admin or same company
    if current_user.role != "admin" and current_user.company_id != company_id:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to view observations for this company"
        )

    query = db.query(Observation).filter(Observation.company_id == company_id)

    if observation_type:
        query = query.filter(Observation.observation_type == observation_type)
    if start_date is not None:
        query = query.filter(Observation.created_at >= start_date)
    if end_date is not None:
        query = query.filter(Observation.created_at <= end_date)

    observations = query.order_by(Observation.created_at.desc()).offset(skip).limit(limit).all()
    return observations
