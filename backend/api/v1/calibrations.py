
# app/api/v1/calibrations.py - Calibration API Router (Complete)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc
from typing import List, Optional, Union
from datetime import date, datetime, timedelta
from decimal import Decimal
import logging

from db.session import get_db
from db.models.asset import Asset, AssetCalibration
from db.models.user import User
from db.models.contractor import Contractor
from schemas.asset import (
    CalibrationCreate, CalibrationUpdate, CalibrationResponse, CalibrationDue
)
from api.deps import get_current_user, get_current_contractor, get_current_user_or_contractor

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("", response_model=CalibrationResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=CalibrationResponse, status_code=status.HTTP_201_CREATED)
def create_calibration_record(
    calibration_in: CalibrationCreate,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Create a new calibration record"""
    logger.info(f"Creating calibration record for asset {calibration_in.asset_id}")
    
    # Verify asset exists and requires calibration
    asset = db.query(Asset).filter(Asset.id == calibration_in.asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    if not asset.requires_calibration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset does not require calibration"
        )
    
    # Check permissions
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and asset.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        created_by = user.id
    else:
        # Contractor can create calibration records
        created_by = None
    
    # Create calibration record
    calibration_data = calibration_in.dict()
    calibration = AssetCalibration(
        **calibration_data,
        company_id=asset.company_id,
        created_by=created_by
    )
    
    # Determine calibration status based on tolerance
    if calibration.tolerance_min is not None and calibration.tolerance_max is not None:
        within_tolerance = (
            calibration.tolerance_min <= calibration.measured_value <= calibration.tolerance_max
        )
        calibration.within_tolerance = within_tolerance
        calibration.status = "pass" if within_tolerance else "out_of_tolerance"
    elif calibration.target_value is not None:
        # If no tolerance specified, assume 5% tolerance
        tolerance = float(calibration.target_value) * 0.05
        within_tolerance = abs(float(calibration.measured_value) - float(calibration.target_value)) <= tolerance
        calibration.within_tolerance = within_tolerance
        calibration.status = "pass" if within_tolerance else "out_of_tolerance"
    else:
        # No target or tolerance - manual status determination required
        calibration.status = "pass"  # Default to pass, can be updated
        calibration.within_tolerance = True
    
    # Calculate next due date
    if asset.calibration_interval_days:
        calibration.next_due_date = calibration.calibration_date + timedelta(days=asset.calibration_interval_days)
    
    db.add(calibration)
    db.commit()
    db.refresh(calibration)
    
    logger.info(f"Calibration record {calibration.id} created for asset {asset.id}")
    return calibration

@router.get("", response_model=List[CalibrationResponse])
@router.get("/", response_model=List[CalibrationResponse])
def list_calibration_records(
    asset_id: Optional[int] = None,
    calibration_type: Optional[str] = None,
    status: Optional[str] = None,
    calibrated_from: Optional[date] = None,
    calibrated_to: Optional[date] = None,
    overdue_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """List calibration records with filtering"""
    logger.info(f"Listing calibration records with filters")
    
    query = db.query(AssetCalibration).options(joinedload(AssetCalibration.asset))
    
    # Filter by company for users
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin":
            query = query.filter(AssetCalibration.company_id == user.company_id)
    
    # Apply filters
    if asset_id:
        query = query.filter(AssetCalibration.asset_id == asset_id)
    if calibration_type:
        query = query.filter(AssetCalibration.calibration_type == calibration_type)
    if status:
        query = query.filter(AssetCalibration.status == status)
    if calibrated_from:
        query = query.filter(AssetCalibration.calibration_date >= calibrated_from)
    if calibrated_to:
        query = query.filter(AssetCalibration.calibration_date <= calibrated_to)
    if overdue_only:
        today = date.today()
        query = query.filter(
            and_(
                AssetCalibration.next_due_date.isnot(None),
                AssetCalibration.next_due_date < today
            )
        )
    
    # Order by calibration date (most recent first)
    query = query.order_by(desc(AssetCalibration.calibration_date))
    
    # Apply pagination
    calibration_records = query.offset(skip).limit(limit).all()
    logger.info(f"Retrieved {len(calibration_records)} calibration records")
    return calibration_records

@router.get("/due", response_model=List[CalibrationDue])
def get_calibrations_due(
    days_ahead: int = 30,
    include_overdue: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users for due calibrations
):
    """Get calibrations that are due or coming due"""
    company_id = current_user.company_id
    today = date.today()
    future_date = today + timedelta(days=days_ahead)
    
    logger.info(f"Getting calibrations due for company {company_id}")
    
    # Get assets that require calibration
    assets_requiring_calibration = db.query(Asset).filter(
        Asset.company_id == company_id,
        Asset.requires_calibration == True,
        Asset.is_active == True
    ).all()
    
    due_items = []
    
    for asset in assets_requiring_calibration:
        # Get the most recent calibration for this asset
        latest_calibration = db.query(AssetCalibration).filter(
            AssetCalibration.asset_id == asset.id
        ).order_by(desc(AssetCalibration.calibration_date)).first()
        
        due_date = None
        last_calibration_date = None
        days_overdue = None
        
        if latest_calibration:
            last_calibration_date = latest_calibration.calibration_date
            if latest_calibration.next_due_date:
                due_date = latest_calibration.next_due_date
        else:
            # Never been calibrated - due immediately if asset requires it
            due_date = today
        
        # If no due date but asset has calibration interval, calculate it
        if not due_date and asset.calibration_interval_days:
            if last_calibration_date:
                due_date = last_calibration_date + timedelta(days=asset.calibration_interval_days)
            else:
                # Default to due now if never calibrated
                due_date = today
        
        # Check if it's due within our window or overdue
        if due_date:
            if include_overdue and due_date <= future_date:
                should_include = True
            elif not include_overdue and today <= due_date <= future_date:
                should_include = True
            else:
                should_include = False
            
            if should_include:
                if due_date < today:
                    days_overdue = (today - due_date).days
                
                due_items.append(CalibrationDue(
                    asset_id=asset.id,
                    asset_name=asset.name,
                    calibration_type=asset.category,  # Use category as default calibration type
                    last_calibration=last_calibration_date,
                    due_date=due_date,
                    days_overdue=days_overdue
                ))
    
    # Sort by due date (overdue first, then upcoming)
    return sorted(due_items, key=lambda x: (x.due_date, x.days_overdue or 0))

@router.get("/{calibration_id}", response_model=CalibrationResponse)
def get_calibration_record(
    calibration_id: int,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get a specific calibration record"""
    calibration = db.query(AssetCalibration).options(
        joinedload(AssetCalibration.asset)
    ).filter(AssetCalibration.id == calibration_id).first()
    
    if not calibration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calibration record not found"
        )
    
    # Check permissions
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and calibration.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    return calibration

@router.put("/{calibration_id}", response_model=CalibrationResponse)
def update_calibration_record(
    calibration_id: int,
    calibration_update: CalibrationUpdate,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Update a calibration record"""
    calibration = db.query(AssetCalibration).filter(AssetCalibration.id == calibration_id).first()
    if not calibration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calibration record not found"
        )
    
    # Check permissions
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and calibration.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Update calibration record
    update_data = calibration_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(calibration, key, value)
    
    # Recalculate status if measured value changed
    if "measured_value" in update_data:
        if calibration.tolerance_min is not None and calibration.tolerance_max is not None:
            within_tolerance = (
                calibration.tolerance_min <= calibration.measured_value <= calibration.tolerance_max
            )
            calibration.within_tolerance = within_tolerance
            calibration.status = "pass" if within_tolerance else "out_of_tolerance"
        elif calibration.target_value is not None:
            tolerance = float(calibration.target_value) * 0.05
            within_tolerance = abs(float(calibration.measured_value) - float(calibration.target_value)) <= tolerance
            calibration.within_tolerance = within_tolerance
            calibration.status = "pass" if within_tolerance else "out_of_tolerance"
    
    db.commit()
    db.refresh(calibration)
    
    logger.info(f"Calibration record {calibration_id} updated")
    return calibration

@router.delete("/{calibration_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calibration_record(
    calibration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Only company users can delete
):
    """Delete a calibration record"""
    calibration = db.query(AssetCalibration).filter(AssetCalibration.id == calibration_id).first()
    if not calibration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calibration record not found"
        )
    
    # Check permissions
    if current_user.role != "admin" and calibration.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    db.delete(calibration)
    db.commit()
    
    logger.info(f"Calibration record {calibration_id} deleted by user {current_user.id}")
    return None

@router.get("/asset/{asset_id}", response_model=List[CalibrationResponse])
def get_asset_calibration_history(
    asset_id: int,
    calibration_type: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor)
):
    """Get calibration history for a specific asset"""
    # Verify asset exists and check permissions
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if user.role != "admin" and asset.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Get calibration history
    query = db.query(AssetCalibration).filter(AssetCalibration.asset_id == asset_id)
    
    if calibration_type:
        query = query.filter(AssetCalibration.calibration_type == calibration_type)
    
    calibration_records = query.order_by(
        desc(AssetCalibration.calibration_date)
    ).limit(limit).all()
    
    return calibration_records