# api/v1/admin/admin_data.py - Data Quality Admin Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc, distinct, and_, or_
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from decimal import Decimal

from db.session import get_db
from db.models.weather import WeatherStation, WeatherData, IngestionLog
from db.models.climate import ClimateZone, ClimateHistoryMonthly, ClimateBaselineMonthly, ClimateProjection
from db.models.public_user import PublicUser
from core.admin_security import require_admin
from schemas.admin import (
    DataSourceCoverage,
    WeatherDataOverview,
    ClimateDataOverview,
    DataGap,
    DataGapsResponse,
    DataQualityIssue,
    DataQualityResponse,
    DataOverviewResponse,
)

router = APIRouter(prefix="/data", tags=["Admin - Data Quality"])


# =============================================================================
# CONSTANTS
# =============================================================================

# Thresholds for data quality checks
TEMP_MIN_VALID = -20.0   # Celsius - below this is suspicious
TEMP_MAX_VALID = 50.0    # Celsius - above this is suspicious
RAIN_MAX_VALID = 200.0   # mm per hour - above this is suspicious
HUMIDITY_MIN = 0.0
HUMIDITY_MAX = 100.0

# Gap detection threshold (hours without data = gap)
GAP_THRESHOLD_HOURS = 6


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def detect_gaps(
    db: Session,
    station_id: int,
    start_time: datetime,
    end_time: datetime,
    threshold_hours: float = GAP_THRESHOLD_HOURS
) -> List[dict]:
    """Detect data gaps for a station within a time range."""
    
    # Get all timestamps for the station in range
    timestamps = db.query(WeatherData.timestamp).filter(
        WeatherData.station_id == station_id,
        WeatherData.timestamp >= start_time,
        WeatherData.timestamp <= end_time
    ).distinct().order_by(WeatherData.timestamp).all()
    
    if len(timestamps) < 2:
        return []
    
    gaps = []
    for i in range(len(timestamps) - 1):
        current = timestamps[i][0]
        next_ts = timestamps[i + 1][0]
        gap_hours = (next_ts - current).total_seconds() / 3600
        
        if gap_hours >= threshold_hours:
            # Get variables at boundaries to identify affected variables
            vars_before = db.query(distinct(WeatherData.variable)).filter(
                WeatherData.station_id == station_id,
                WeatherData.timestamp == current
            ).all()
            
            gaps.append({
                "gap_start": current,
                "gap_end": next_ts,
                "gap_hours": round(gap_hours, 1),
                "variables_affected": [v[0] for v in vars_before],
            })
    
    return gaps


def check_value_quality(variable: str, value: Decimal) -> Optional[dict]:
    """Check if a value is within valid ranges."""
    
    value_float = float(value) if value else None
    if value_float is None:
        return None
    
    issues = []
    
    # Temperature checks
    if variable in ['temp', 'temp_mean', 'temp_min', 'temp_max', 'tmean', 'tmin', 'tmax']:
        if value_float < TEMP_MIN_VALID:
            return {
                "issue_type": "impossible_value",
                "details": f"Temperature {value_float}°C below minimum valid ({TEMP_MIN_VALID}°C)"
            }
        if value_float > TEMP_MAX_VALID:
            return {
                "issue_type": "impossible_value",
                "details": f"Temperature {value_float}°C above maximum valid ({TEMP_MAX_VALID}°C)"
            }
    
    # Rainfall checks
    if variable in ['rain', 'rainfall', 'precipitation']:
        if value_float < 0:
            return {
                "issue_type": "impossible_value",
                "details": f"Negative rainfall value: {value_float}mm"
            }
        if value_float > RAIN_MAX_VALID:
            return {
                "issue_type": "outlier",
                "details": f"Rainfall {value_float}mm unusually high (>{RAIN_MAX_VALID}mm)"
            }
    
    # Humidity checks
    if variable in ['humidity', 'rh', 'relative_humidity']:
        if value_float < HUMIDITY_MIN or value_float > HUMIDITY_MAX:
            return {
                "issue_type": "impossible_value",
                "details": f"Humidity {value_float}% outside valid range (0-100%)"
            }
    
    return None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/overview", response_model=DataOverviewResponse)
async def get_data_overview(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get combined data overview for dashboard.
    
    Includes weather data coverage, climate reference data status,
    recent gaps, and recent quality issues.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    
    # Weather data overview
    weather_earliest = db.query(func.min(WeatherData.timestamp)).scalar()
    weather_latest = db.query(func.max(WeatherData.timestamp)).scalar()
    weather_total = db.query(func.count(WeatherData.timestamp)).scalar() or 0
    
    stations_with_data = db.query(func.count(distinct(WeatherData.station_id))).scalar() or 0
    
    variables = db.query(distinct(WeatherData.variable)).all()
    variables_list = [v[0] for v in variables]
    
    # By source coverage
    sources = db.query(distinct(WeatherStation.data_source)).all()
    by_source = []
    
    for (source,) in sources:
        station_count = db.query(func.count(WeatherStation.station_id)).filter(
            WeatherStation.data_source == source,
            WeatherStation.is_active == True
        ).scalar() or 0
        
        station_ids = db.query(WeatherStation.station_id).filter(
            WeatherStation.data_source == source
        ).all()
        station_id_list = [s[0] for s in station_ids]
        
        if station_id_list:
            source_records = db.query(func.count(WeatherData.timestamp)).filter(
                WeatherData.station_id.in_(station_id_list)
            ).scalar() or 0
            
            source_earliest = db.query(func.min(WeatherData.timestamp)).filter(
                WeatherData.station_id.in_(station_id_list)
            ).scalar()
            
            source_latest = db.query(func.max(WeatherData.timestamp)).filter(
                WeatherData.station_id.in_(station_id_list)
            ).scalar()
        else:
            source_records = 0
            source_earliest = None
            source_latest = None
        
        # Determine status
        if station_count == 0:
            status = "pending"
        elif source_latest and (now - source_latest).total_seconds() < 86400:
            status = "active"
        else:
            status = "inactive"
        
        by_source.append(DataSourceCoverage(
            data_source=source,
            station_count=station_count,
            total_records=source_records,
            earliest_record=source_earliest,
            latest_record=source_latest,
            status=status,
        ))
    
    weather_overview = WeatherDataOverview(
        earliest_record=weather_earliest,
        latest_record=weather_latest,
        total_records=weather_total,
        stations_with_data=stations_with_data,
        variables_tracked=variables_list,
        by_source=by_source,
    )
    
    # Climate data overview
    zones_total = db.query(func.count(ClimateZone.id)).scalar() or 0
    
    zones_with_baseline = db.query(func.count(distinct(ClimateBaselineMonthly.zone_id))).scalar() or 0
    zones_with_history = db.query(func.count(distinct(ClimateHistoryMonthly.zone_id))).scalar() or 0
    zones_with_projections = db.query(func.count(distinct(ClimateProjection.zone_id))).scalar() or 0
    
    # Get history range
    history_min = db.query(func.min(ClimateHistoryMonthly.vintage_year)).scalar()
    history_max = db.query(func.max(ClimateHistoryMonthly.vintage_year)).scalar()
    history_range = f"{history_min}-{history_max}" if history_min and history_max else "No data"
    
    # Get projection scenarios
    scenarios = db.query(distinct(ClimateProjection.ssp_scenario)).all()
    scenario_list = [s[0] for s in scenarios if s[0]]
    
    climate_overview = ClimateDataOverview(
        zones_total=zones_total,
        zones_with_baseline=zones_with_baseline,
        zones_with_history=zones_with_history,
        zones_with_projections=zones_with_projections,
        baseline_period="1986-2005",
        history_range=history_range,
        projection_scenarios=scenario_list,
    )
    
    # Recent gaps (last 7 days, limit 10)
    recent_gaps = []
    active_stations = db.query(WeatherStation).filter(
        WeatherStation.is_active == True
    ).all()
    
    for station in active_stations[:10]:  # Check first 10 stations
        gaps = detect_gaps(db, station.station_id, week_ago, now)
        for gap in gaps[:2]:  # Max 2 gaps per station
            recent_gaps.append(DataGap(
                station_id=station.station_id,
                station_code=station.station_code,
                station_name=station.station_name,
                gap_start=gap["gap_start"],
                gap_end=gap["gap_end"],
                gap_hours=gap["gap_hours"],
                variables_affected=gap["variables_affected"],
            ))
    
    recent_gaps = recent_gaps[:10]  # Limit total
    
    # Recent quality issues (last 7 days, limit 10)
    recent_issues = []
    
    # Sample recent data for quality checks
    recent_data = db.query(WeatherData).filter(
        WeatherData.timestamp >= week_ago
    ).order_by(desc(WeatherData.timestamp)).limit(1000).all()
    
    for record in recent_data:
        issue = check_value_quality(record.variable, record.value)
        if issue:
            station = db.query(WeatherStation).filter(
                WeatherStation.station_id == record.station_id
            ).first()
            
            recent_issues.append(DataQualityIssue(
                station_id=record.station_id,
                station_code=station.station_code if station else "unknown",
                timestamp=record.timestamp,
                variable=record.variable,
                value=record.value,
                issue_type=issue["issue_type"],
                details=issue["details"],
            ))
            
            if len(recent_issues) >= 10:
                break
    
    return DataOverviewResponse(
        weather=weather_overview,
        climate=climate_overview,
        recent_gaps=recent_gaps,
        recent_issues=recent_issues,
    )


@router.get("/gaps", response_model=DataGapsResponse)
async def get_data_gaps(
    days: int = Query(7, ge=1, le=30),
    station_id: Optional[int] = Query(None),
    min_gap_hours: float = Query(GAP_THRESHOLD_HOURS, ge=1),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Identify data gaps across stations.
    
    Returns gaps where data is missing for longer than threshold.
    """
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(days=days)
    
    # Get stations to check
    if station_id:
        stations = db.query(WeatherStation).filter(
            WeatherStation.station_id == station_id
        ).all()
    else:
        stations = db.query(WeatherStation).filter(
            WeatherStation.is_active == True
        ).all()
    
    all_gaps = []
    stations_with_gaps = set()
    
    for station in stations:
        gaps = detect_gaps(db, station.station_id, start_time, now, min_gap_hours)
        
        for gap in gaps:
            all_gaps.append(DataGap(
                station_id=station.station_id,
                station_code=station.station_code,
                station_name=station.station_name,
                gap_start=gap["gap_start"],
                gap_end=gap["gap_end"],
                gap_hours=gap["gap_hours"],
                variables_affected=gap["variables_affected"],
            ))
            stations_with_gaps.add(station.station_id)
    
    # Sort by gap size (largest first)
    all_gaps.sort(key=lambda x: x.gap_hours, reverse=True)
    
    total_gap_hours = sum(g.gap_hours for g in all_gaps)
    
    return DataGapsResponse(
        gaps=all_gaps,
        total_gaps=len(all_gaps),
        total_gap_hours=round(total_gap_hours, 1),
        stations_with_gaps=len(stations_with_gaps),
    )


@router.get("/quality-issues", response_model=DataQualityResponse)
async def get_quality_issues(
    days: int = Query(7, ge=1, le=30),
    station_id: Optional[int] = Query(None),
    issue_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Find data quality issues (outliers, impossible values).
    """
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(days=days)
    
    query = db.query(WeatherData).filter(
        WeatherData.timestamp >= start_time
    )
    
    if station_id:
        query = query.filter(WeatherData.station_id == station_id)
    
    # Get data to check (sample if large dataset)
    records = query.order_by(desc(WeatherData.timestamp)).limit(10000).all()
    
    issues = []
    by_type = {}
    by_station = {}
    
    # Get station info for display
    station_ids = list(set(r.station_id for r in records))
    stations = db.query(WeatherStation).filter(
        WeatherStation.station_id.in_(station_ids)
    ).all()
    station_map = {s.station_id: s.station_code for s in stations}
    
    for record in records:
        issue = check_value_quality(record.variable, record.value)
        
        if issue:
            # Filter by issue type if specified
            if issue_type and issue["issue_type"] != issue_type:
                continue
            
            station_code = station_map.get(record.station_id, "unknown")
            
            issues.append(DataQualityIssue(
                station_id=record.station_id,
                station_code=station_code,
                timestamp=record.timestamp,
                variable=record.variable,
                value=record.value,
                issue_type=issue["issue_type"],
                details=issue["details"],
            ))
            
            # Count by type
            by_type[issue["issue_type"]] = by_type.get(issue["issue_type"], 0) + 1
            
            # Count by station
            by_station[station_code] = by_station.get(station_code, 0) + 1
            
            if len(issues) >= limit:
                break
    
    return DataQualityResponse(
        issues=issues,
        total_issues=len(issues),
        by_type=by_type,
        by_station=by_station,
    )


@router.get("/coverage")
async def get_temporal_coverage(
    station_id: Optional[int] = Query(None),
    data_source: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get temporal coverage statistics by station.
    
    Shows date ranges and record counts per station.
    """
    query = db.query(WeatherStation)
    
    if station_id:
        query = query.filter(WeatherStation.station_id == station_id)
    
    if data_source:
        query = query.filter(WeatherStation.data_source == data_source)
    
    stations = query.filter(WeatherStation.is_active == True).all()
    
    coverage = []
    
    for station in stations:
        earliest = db.query(func.min(WeatherData.timestamp)).filter(
            WeatherData.station_id == station.station_id
        ).scalar()
        
        latest = db.query(func.max(WeatherData.timestamp)).filter(
            WeatherData.station_id == station.station_id
        ).scalar()
        
        record_count = db.query(func.count(WeatherData.timestamp)).filter(
            WeatherData.station_id == station.station_id
        ).scalar() or 0
        
        # Calculate expected records if we have date range
        expected = 0
        completeness_pct = 0
        if earliest and latest:
            days = (latest - earliest).days + 1
            per_day = 24  # Assume hourly as baseline
            if station.data_source == "HARVEST":
                per_day = 96  # 15-min intervals
            expected = days * per_day
            completeness_pct = round((record_count / expected * 100) if expected > 0 else 0, 1)
        
        coverage.append({
            "station_id": station.station_id,
            "station_code": station.station_code,
            "station_name": station.station_name,
            "data_source": station.data_source,
            "region": station.region,
            "earliest_record": earliest.isoformat() if earliest else None,
            "latest_record": latest.isoformat() if latest else None,
            "total_records": record_count,
            "expected_records": expected,
            "completeness_pct": completeness_pct,
        })
    
    return {
        "stations": coverage,
        "total_stations": len(coverage),
    }


@router.get("/climate/status")
async def get_climate_data_status(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get detailed status of climate reference data per zone.
    """
    zones = db.query(ClimateZone).filter(ClimateZone.is_active == True).order_by(
        ClimateZone.region_id, ClimateZone.display_order
    ).all()
    
    zone_status = []
    
    for zone in zones:
        # Check baseline data
        baseline_count = db.query(func.count(ClimateBaselineMonthly.id)).filter(
            ClimateBaselineMonthly.zone_id == zone.id
        ).scalar() or 0
        
        # Check history data
        history_count = db.query(func.count(ClimateHistoryMonthly.id)).filter(
            ClimateHistoryMonthly.zone_id == zone.id
        ).scalar() or 0
        
        history_years = db.query(
            func.min(ClimateHistoryMonthly.vintage_year),
            func.max(ClimateHistoryMonthly.vintage_year)
        ).filter(ClimateHistoryMonthly.zone_id == zone.id).first()
        
        # Check projections
        projection_count = db.query(func.count(ClimateProjection.id)).filter(
            ClimateProjection.zone_id == zone.id
        ).scalar() or 0
        
        scenarios = db.query(distinct(ClimateProjection.ssp_scenario)).filter(
            ClimateProjection.zone_id == zone.id
        ).all()
        
        zone_status.append({
            "zone_id": zone.id,
            "zone_name": zone.name,
            "zone_slug": zone.slug,
            "region_id": zone.region_id,
            "baseline": {
                "has_data": baseline_count > 0,
                "record_count": baseline_count,
                "expected": 12,  # 12 months
                "complete": baseline_count >= 12,
            },
            "history": {
                "has_data": history_count > 0,
                "record_count": history_count,
                "year_range": f"{history_years[0]}-{history_years[1]}" if history_years[0] else None,
                "years_covered": (history_years[1] - history_years[0] + 1) if history_years[0] and history_years[1] else 0,
            },
            "projections": {
                "has_data": projection_count > 0,
                "record_count": projection_count,
                "scenarios": [s[0] for s in scenarios],
            },
        })
    
    return {
        "zones": zone_status,
        "total_zones": len(zone_status),
        "zones_complete": sum(
            1 for z in zone_status
            if z["baseline"]["complete"] and z["history"]["has_data"] and z["projections"]["has_data"]
        ),
    }