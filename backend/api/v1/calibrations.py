
# app/api/v1/calibrations.py - Calibration API Router (Complete)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc
from typing import List, Optional, Union
from datetime import date, datetime, timedelta
from decimal import Decimal
import logging

from db.session import get_db
from db.models.asset import Asset, AssetCalibration, AssetCalibrationSchedule, AssetCalibrationSpec
from db.models.user import User
from db.models.contractor import Contractor
from db.models.notification import NotificationType
from schemas.asset import (
    CalibrationCreate, CalibrationUpdate, CalibrationResponse, CalibrationDue
)
from services.notification_service import NotificationService
from api.deps import get_current_user, get_current_contractor, get_current_user_or_contractor

logger = logging.getLogger(__name__)
router = APIRouter()

# When a calibration fails (out_of_tolerance), schedule the recheck this many days out.
# Hard-coded for v0.1; promote to Asset.calibration_failure_recheck_days if per-asset config needed.
CALIBRATION_FAILURE_RECHECK_DAYS = 7


def _resolve_spec(db: Session, asset: Asset, calibration_type: str) -> Optional[AssetCalibrationSpec]:
    """Look up the active per-type spec for an asset. Returns None for legacy assets
    that still rely on the inline columns on the Asset row."""
    if not calibration_type:
        return None
    return db.query(AssetCalibrationSpec).filter(
        AssetCalibrationSpec.asset_id == asset.id,
        AssetCalibrationSpec.calibration_type == calibration_type,
        AssetCalibrationSpec.is_active.is_(True),
    ).first()


def create_pending_schedule(
    db: Session,
    asset: Asset,
    due_date: date,
    *,
    calibration_type: str = "general",
    parameter_name: Optional[str] = None,
    unit_of_measure: Optional[str] = None,
    target_value: Optional[Decimal] = None,
    tolerance_min: Optional[Decimal] = None,
    tolerance_max: Optional[Decimal] = None,
    created_by: Optional[int] = None,
    notes: Optional[str] = None,
) -> Optional[AssetCalibrationSchedule]:
    """
    Create a pending calibration schedule for an asset, but only if no pending schedule
    already exists for the (asset, calibration_type) pair (partial unique index enforces this
    at the DB level too — this check just avoids the integrity error).
    """
    existing = db.query(AssetCalibrationSchedule).filter(
        AssetCalibrationSchedule.asset_id == asset.id,
        AssetCalibrationSchedule.calibration_type == calibration_type,
        AssetCalibrationSchedule.status == "pending",
    ).first()
    if existing:
        return None

    schedule = AssetCalibrationSchedule(
        asset_id=asset.id,
        company_id=asset.company_id,
        calibration_type=calibration_type,
        parameter_name=parameter_name,
        unit_of_measure=unit_of_measure,
        target_value=target_value,
        tolerance_min=tolerance_min,
        tolerance_max=tolerance_max,
        due_date=due_date,
        status="pending",
        created_by=created_by,
        notes=notes,
    )
    db.add(schedule)
    db.flush()
    return schedule

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
        if not getattr(user, 'is_auxein_admin', False) and asset.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        created_by = user.id
    else:
        # Contractor can create calibration records
        created_by = None
    
    # Validate schedule_id (if supplied) belongs to the same asset and is pending.
    schedule_to_consume: Optional[AssetCalibrationSchedule] = None
    if calibration_in.schedule_id is not None:
        schedule_to_consume = db.query(AssetCalibrationSchedule).filter(
            AssetCalibrationSchedule.id == calibration_in.schedule_id
        ).first()
        if not schedule_to_consume:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        if schedule_to_consume.asset_id != asset.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Schedule does not belong to this asset",
            )
        if schedule_to_consume.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Schedule is already {schedule_to_consume.status}",
            )

    # Create calibration record
    calibration_data = calibration_in.dict()
    # schedule_id is on the create payload but stored on the event row too, so just keep it.
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
    
    # Resolve the per-type spec (multi-spec path). Falls back to the asset's inline
    # columns when no spec row exists (legacy assets).
    spec = _resolve_spec(db, asset, calibration.calibration_type)

    # Calculate next due date.
    # pass → schedule next at the spec's (or asset's) normal interval
    # out_of_tolerance → schedule a recheck in CALIBRATION_FAILURE_RECHECK_DAYS days
    #   regardless of interval (the asset is suspect, recheck soon)
    if calibration.status == "out_of_tolerance":
        calibration.next_due_date = calibration.calibration_date + timedelta(days=CALIBRATION_FAILURE_RECHECK_DAYS)
    else:
        interval_days = None
        if spec and spec.interval_days:
            interval_days = spec.interval_days
        elif asset.calibration_interval_days:
            interval_days = asset.calibration_interval_days
        if interval_days:
            calibration.next_due_date = calibration.calibration_date + timedelta(days=interval_days)

    db.add(calibration)
    db.flush()  # so calibration.id is available for the schedule link below

    # If this event resolved a scheduled ticket, mark it completed and link.
    # Then auto-create the next pending schedule for this (asset, calibration_type).
    if schedule_to_consume:
        schedule_to_consume.status = "completed"
        schedule_to_consume.completed_at = func.now()
        schedule_to_consume.completed_calibration_id = calibration.id
        # Flush before create_pending_schedule queries — otherwise its existing-pending
        # check can still see this row as 'pending' (autoflush is unreliable across sessions),
        # which would make it return None silently and skip spawning the next cycle.
        db.flush()

    if calibration.next_due_date and asset.requires_calibration:
        # Mirror the next-due date to a fresh pending schedule so the feed surfaces it.
        # Preference order for the spec snapshot, per field:
        #   1. The per-type spec row (multi-spec path)
        #   2. The asset's inline column (legacy single-spec)
        #   3. The just-completed event's value (last-resort fallback)
        # calibration_type stays the same — auto-respawn never crosses types.
        if spec:
            spec_type = spec.calibration_type
            spec_param = spec.parameter_name
            spec_unit = spec.unit_of_measure
            spec_target = spec.target_value
            spec_tmin = spec.tolerance_min
            spec_tmax = spec.tolerance_max
        else:
            spec_type = asset.calibration_type or calibration.calibration_type
            spec_param = asset.calibration_parameter_name or calibration.parameter_name
            spec_unit = asset.calibration_unit_of_measure or calibration.unit_of_measure
            spec_target = asset.calibration_target_value if asset.calibration_target_value is not None else calibration.target_value
            spec_tmin = asset.calibration_tolerance_min if asset.calibration_tolerance_min is not None else calibration.tolerance_min
            spec_tmax = asset.calibration_tolerance_max if asset.calibration_tolerance_max is not None else calibration.tolerance_max

        create_pending_schedule(
            db,
            asset,
            due_date=calibration.next_due_date,
            calibration_type=spec_type,
            parameter_name=spec_param,
            unit_of_measure=spec_unit,
            target_value=spec_target,
            tolerance_min=spec_tmin,
            tolerance_max=spec_tmax,
            created_by=created_by,
        )

    db.commit()
    db.refresh(calibration)

    # Dispatch fail notifications: managers get a heads-up; the user who performed the
    # calibration gets a persistent record (in addition to whatever in-app toast the client shows).
    if calibration.status == "out_of_tolerance":
        unit = calibration.unit_of_measure or ""
        title = f"Calibration failed: {asset.name}"
        body = (
            f"Reading {calibration.measured_value} {unit} outside tolerance. "
            f"Recheck scheduled {calibration.next_due_date.isoformat()}."
        )
        data = {
            "calibration_id": calibration.id,
            "asset_id": asset.id,
            "next_due_date": calibration.next_due_date.isoformat(),
        }
        notif_service = NotificationService(db)
        notif_service.notify_managers(
            company_id=calibration.company_id,
            notification_type=NotificationType.action,
            title=title,
            body=body,
            data=data,
        )
        if isinstance(current_user_or_contractor, User):
            notif_service.notify_user(
                user=current_user_or_contractor,
                notification_type=NotificationType.action,
                title=title,
                body=body,
                data=data,
            )
        logger.info(
            f"Calibration {calibration.id} failed (out_of_tolerance) — notified managers, "
            f"recheck scheduled {calibration.next_due_date}"
        )

    logger.info(f"Calibration record {calibration.id} created for asset {asset.id}")
    return calibration

@router.get("", response_model=List[CalibrationResponse])
@router.get("/", response_model=List[CalibrationResponse])
def list_calibration_records(
    asset_id: Optional[int] = None,
    calibration_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
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
        if not getattr(user, 'is_auxein_admin', False):
            query = query.filter(AssetCalibration.company_id == user.company_id)
    
    # Apply filters
    if asset_id:
        query = query.filter(AssetCalibration.asset_id == asset_id)
    if calibration_type:
        query = query.filter(AssetCalibration.calibration_type == calibration_type)
    if status_filter:
        query = query.filter(AssetCalibration.status == status_filter)
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
    # Surface the asset's display name as a flat field so the web table doesn't have
    # to dive into the relationship object (which Pydantic doesn't serialize by default).
    for c in calibration_records:
        c.asset_name = c.asset.name if c.asset else None
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
        if not getattr(user, 'is_auxein_admin', False) and calibration.company_id != user.company_id:
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
        if not getattr(user, 'is_auxein_admin', False) and calibration.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Update calibration record. PUT is for genuine corrections to an existing record
    # (typo in measured_value, etc). Field calibration completions must POST a new record
    # so each event is preserved in history; see create_calibration_record.
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
    if not current_user.is_auxein_admin and calibration.company_id != current_user.company_id:
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
        if not getattr(user, 'is_auxein_admin', False) and asset.company_id != user.company_id:
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