"""
backend/api/v1/seasonal_stats.py

Public endpoint for seasonal stats widget.
Calculates climate metrics from 1 Sep to harvest date using daily zone data.
No auth required for calculation; auth optional for data capture.
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["seasonal-stats"])

# Optional bearer — won't 403 if missing
_optional_bearer = HTTPBearer(auto_error=False)


class SeasonalStatsRequest(BaseModel):
    zone_slug: str
    variety: Optional[str] = None
    harvest_date: date
    selected_variables: Optional[List[str]] = None


class SeasonalStatsResponse(BaseModel):
    zone_slug: str
    zone_name: Optional[str] = None
    variety: Optional[str] = None
    season_start: date
    harvest_date: date
    vintage_year: int
    day_count: int
    metrics: dict


async def _get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    db: Session = Depends(get_db)
) -> Optional[int]:
    """Extract public_user_id from token if present, else None."""
    if not credentials:
        return None
    try:
        import jwt
        from core.config import settings
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=["HS256"])
        return payload.get("sub")
    except Exception:
        return None


@router.post("/calculate")
async def calculate_seasonal_stats(
    request: SeasonalStatsRequest,
    db: Session = Depends(get_db),
    user_id: Optional[int] = Depends(_get_optional_user_id)
):
    """
    Calculate seasonal climate metrics from 1 Sep to harvest date.

    Metrics: gdd10, gdd0, avg_temp, avg_diurnal, total_rainfall,
    avg_min_temp, avg_max_temp, frost_days, hot_days
    """
    harvest = request.harvest_date

    # Determine season start: 1 Sep of the year before if harvest is Jan-Aug,
    # or 1 Sep of the same year if harvest is Sep-Dec
    if harvest.month >= 9:
        season_start = date(harvest.year, 9, 1)
        vintage_year = harvest.year + 1
    else:
        season_start = date(harvest.year - 1, 9, 1)
        vintage_year = harvest.year

    if harvest <= season_start:
        raise HTTPException(status_code=400, detail="Harvest date must be after 1 September")

    # Fetch zone name
    zone_row = db.execute(
        text("SELECT id, name FROM climate_zones WHERE slug = :slug AND is_active = true"),
        {"slug": request.zone_slug}
    ).fetchone()

    if not zone_row:
        raise HTTPException(status_code=404, detail=f"Zone '{request.zone_slug}' not found")

    # Calculate metrics from daily data
    query = text("""
        SELECT
            COUNT(*) as day_count,
            -- GDD base 10: sum of max(0, temp_mean - 10) per day
            COALESCE(SUM(GREATEST(temp_mean - 10, 0)), 0) as gdd10,
            -- GDD base 0: sum of max(0, temp_mean) per day
            COALESCE(SUM(GREATEST(temp_mean, 0)), 0) as gdd0,
            -- Average temperature
            ROUND(AVG(temp_mean)::numeric, 1) as avg_temp,
            -- Average diurnal range (max - min)
            ROUND(AVG(temp_max - temp_min)::numeric, 1) as avg_diurnal,
            -- Total rainfall
            ROUND(COALESCE(SUM(rainfall_mm), 0)::numeric, 1) as total_rainfall,
            -- Average min temp
            ROUND(AVG(temp_min)::numeric, 1) as avg_min_temp,
            -- Average max temp
            ROUND(AVG(temp_max)::numeric, 1) as avg_max_temp,
            -- Frost days (min temp <= 0)
            COUNT(*) FILTER (WHERE temp_min <= 0) as frost_days,
            -- Hot days (max temp > 30)
            COUNT(*) FILTER (WHERE temp_max > 30) as hot_days
        FROM climate_zone_daily
        WHERE zone_id = :zone_id
          AND date >= :season_start
          AND date <= :harvest_date
    """)

    result = db.execute(query, {
        "zone_id": zone_row.id,
        "season_start": season_start,
        "harvest_date": harvest
    }).fetchone()

    if not result or result.day_count == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No daily climate data found for '{request.zone_slug}' between {season_start} and {harvest}"
        )

    metrics = {
        "gdd10": round(float(result.gdd10), 0),
        "gdd0": round(float(result.gdd0), 0),
        "avg_temp": float(result.avg_temp) if result.avg_temp else None,
        "avg_diurnal": float(result.avg_diurnal) if result.avg_diurnal else None,
        "total_rainfall": float(result.total_rainfall),
        "avg_min_temp": float(result.avg_min_temp) if result.avg_min_temp else None,
        "avg_max_temp": float(result.avg_max_temp) if result.avg_max_temp else None,
        "frost_days": int(result.frost_days),
        "hot_days": int(result.hot_days),
    }

    # Capture submission for modelling (non-blocking)
    try:
        import json as _json
        db.execute(text("""
            INSERT INTO seasonal_stats_submissions
                (public_user_id, zone_slug, variety, harvest_date, selected_variables, results)
            VALUES (:user_id, :zone_slug, :variety, :harvest_date, :selected_vars::jsonb, :results::jsonb)
        """), {
            "user_id": user_id,
            "zone_slug": request.zone_slug,
            "variety": request.variety,
            "harvest_date": harvest,
            "selected_vars": _json.dumps(request.selected_variables) if request.selected_variables else None,
            "results": _json.dumps(metrics),
        })
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to capture seasonal stats submission: {e}")
        db.rollback()

    return SeasonalStatsResponse(
        zone_slug=request.zone_slug,
        zone_name=zone_row.name,
        variety=request.variety,
        season_start=season_start,
        harvest_date=harvest,
        vintage_year=vintage_year,
        day_count=int(result.day_count),
        metrics=metrics,
    )
