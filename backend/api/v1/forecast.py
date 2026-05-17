"""
api/v1/forecast.py — Forecast endpoints. Thin layer over services.forecast_service.

Routes (all require an authenticated user or contractor):
  GET /current?lat&lon            current weather only
  GET /forecast?lat&lon&hours=24  current + N-hour forecast (3-hour interval)
  GET /property/{id}              convenience — uses property.forecast_latitude/longitude

Provider is MetOcean (see services/forecast_service.py). Backend caches
responses for FORECAST_CACHE_TTL_SECONDS (default 3 h) so client refreshes
don't burn the API quota.
"""

from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.deps import get_current_user_or_contractor
from db.models.contractor import Contractor
from db.models.property import Property
from db.models.user import User
from db.session import get_db
from services.forecast_service import (
    ForecastError,
    get_conditions,
    get_current_only,
)
from services.property_service import get_visible_property_ids

router = APIRouter(tags=["forecast"])


def _handle_forecast_call(fn):
    """Translate ForecastError into clean HTTPException; uncaught exceptions
    bubble up to the FastAPI default handler."""
    try:
        return fn()
    except ForecastError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.get("/current")
def current_at_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    _user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    return _handle_forecast_call(lambda: get_current_only(lat, lon))


@router.get("/forecast")
def forecast_at_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    hours: int = Query(24, ge=3, le=72),
    interval_h: int = Query(3, ge=1, le=6),
    _user: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    return _handle_forecast_call(lambda: get_conditions(lat, lon, hours=hours, interval_h=interval_h))


@router.get("/property/{property_id}")
def forecast_for_property(
    property_id: int,
    hours: int = Query(24, ge=3, le=72),
    interval_h: int = Query(3, ge=1, le=6),
    db: Session = Depends(get_db),
    user_or_contractor: Union[User, Contractor] = Depends(get_current_user_or_contractor),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    # Property scoping — same gating used elsewhere. Contractors share visibility
    # with users when on the same property scope.
    if isinstance(user_or_contractor, User):
        visible = get_visible_property_ids(db, user_or_contractor)
        if visible and property_id not in visible:
            raise HTTPException(status_code=403, detail="Property not accessible")

    if prop.forecast_latitude is None or prop.forecast_longitude is None:
        raise HTTPException(
            status_code=409,
            detail="Property has no forecast point set. Pick a forecast location in property admin first.",
        )

    return _handle_forecast_call(lambda: get_conditions(
        float(prop.forecast_latitude),
        float(prop.forecast_longitude),
        hours=hours,
        interval_h=interval_h,
    ))
