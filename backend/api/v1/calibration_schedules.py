# app/api/v1/calibration_schedules.py — Read endpoints for forward-looking calibration tickets.
# Mutations happen as side-effects of /calibrations POST (event creation marks a schedule
# completed and auto-spawns the next pending one). For v0.1 we only expose read endpoints.

from typing import List, Optional, Union
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import asc

from db.session import get_db
from db.models.asset import AssetCalibrationSchedule
from db.models.user import User
from db.models.contractor import Contractor
from schemas.asset import CalibrationScheduleResponse
from api.deps import get_current_user_or_contractor

router = APIRouter()


def _company_filter(query, current_user_or_contractor):
    """Scope queries to the caller's company unless they're an Auxein admin."""
    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if not getattr(user, "is_auxein_admin", False):
            query = query.filter(AssetCalibrationSchedule.company_id == user.company_id)
    return query


@router.get("", response_model=List[CalibrationScheduleResponse])
@router.get("/", response_model=List[CalibrationScheduleResponse])
def list_calibration_schedules(
    asset_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    pending_only: bool = Query(False),
    due_before: Optional[date] = None,
    skip: int = 0,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """List calibration schedules with optional filtering."""
    query = db.query(AssetCalibrationSchedule).options(joinedload(AssetCalibrationSchedule.asset))
    query = _company_filter(query, current_user_or_contractor)

    if asset_id is not None:
        query = query.filter(AssetCalibrationSchedule.asset_id == asset_id)
    if pending_only:
        query = query.filter(AssetCalibrationSchedule.status == "pending")
    elif status_filter:
        query = query.filter(AssetCalibrationSchedule.status == status_filter)
    if due_before:
        query = query.filter(AssetCalibrationSchedule.due_date <= due_before)

    schedules = query.order_by(asc(AssetCalibrationSchedule.due_date)).offset(skip).limit(limit).all()
    # Attach asset_name for the response (matches existing pattern on calibration responses).
    for s in schedules:
        s.asset_name = s.asset.name if s.asset else None
    return schedules


@router.get("/{schedule_id}", response_model=CalibrationScheduleResponse)
def get_calibration_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    """Fetch one schedule (used by clients to load the spec before performing the calibration)."""
    schedule = db.query(AssetCalibrationSchedule).options(
        joinedload(AssetCalibrationSchedule.asset)
    ).filter(AssetCalibrationSchedule.id == schedule_id).first()

    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    if isinstance(current_user_or_contractor, User):
        user = current_user_or_contractor
        if not getattr(user, "is_auxein_admin", False) and schedule.company_id != user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    schedule.asset_name = schedule.asset.name if schedule.asset else None
    return schedule
