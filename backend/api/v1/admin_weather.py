# api/v1/admin/admin_weather.py - Weather Infrastructure Admin Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc, asc, distinct, and_, text
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from decimal import Decimal

from db.session import get_db
from db.models.weather import WeatherStation, WeatherData, IngestionLog
from db.models.public_user import PublicUser
from core.admin_security import require_admin
from schemas.admin import (
    StationStatus,
    StationHealthMetrics,
    StationListItem,
    StationStatsResponse,
    StationListResponse,
    StationDetailResponse,
    VariableCoverage,
    IngestionLogItem,
    IngestionLogsResponse,
    IngestionSummaryBySource,
    IngestionSummaryResponse,
)

router = APIRouter(prefix="/weather", tags=["Admin - Weather"])


# =============================================================================
# CONSTANTS
# =============================================================================

# Health thresholds - adjusted for ingestion lag
# Data up to 12 hours old is considered current (accounts for ingestion cycles)
HEALTHY_HOURS_THRESHOLD = 12     
# Data up to 36 hours old is stale (yesterday's data still arriving)
STALE_HOURS_THRESHOLD = 36       

# Completeness thresholds (based on YESTERDAY's data, not today)
HEALTHY_COMPLETENESS_PCT = 90.0  # Above this = healthy
STALE_COMPLETENESS_PCT = 70.0    # Above this = stale (else offline)

# Fallback expected records (only used if we can't derive from data)
FALLBACK_RECORDS_PER_DAY = {
    "HARVEST": 144,   # 10-minute intervals (24 * 6 = 144)
    "ECAN": 24,       # Hourly
    "HBRC": 24,       # Hourly
    "MRC": 24,        # Hourly
    "DEFAULT": 24,
}

# Rolling window for ingestion logs (days)
INGESTION_LOG_RETENTION_DAYS = 30


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def derive_station_interval_minutes(db: Session, station_id: int) -> Optional[int]:
    """
    Derive the typical logging interval for a station by analyzing actual data.
    
    Looks at gaps between consecutive timestamps over the last 7 days
    and returns the median interval in minutes.
    """
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    
    # Get distinct timestamps for this station (last 7 days)
    timestamps = db.query(WeatherData.timestamp).filter(
        WeatherData.station_id == station_id,
        WeatherData.timestamp >= week_ago
    ).distinct().order_by(WeatherData.timestamp).limit(1000).all()
    
    if len(timestamps) < 5:
        return None  # Not enough data to derive interval
    
    # Calculate gaps between consecutive timestamps
    gaps = []
    for i in range(1, len(timestamps)):
        gap_minutes = (timestamps[i][0] - timestamps[i-1][0]).total_seconds() / 60
        # Allow gaps from 5 minutes to 25 hours (to catch daily with some tolerance)
        if 5 <= gap_minutes <= 1500:
            gaps.append(gap_minutes)
    
    if not gaps:
        return None
    
    # Return median gap (more robust than mean)
    gaps.sort()
    median_gap = gaps[len(gaps) // 2]
    
    # Round to common intervals (in minutes)
    common_intervals = [
        10,     # 10-minute
        15,     # 15-minute  
        30,     # 30-minute
        60,     # Hourly
        180,    # 3-hourly
        360,    # 6-hourly
        720,    # 12-hourly
        1440,   # Daily
    ]
    closest = min(common_intervals, key=lambda x: abs(x - median_gap))
    
    return closest


def get_expected_records_for_station(
    db: Session, 
    station: WeatherStation, 
    hours: int = 24
) -> int:
    """
    Get expected record count for a station over given hours.
    
    First tries to derive from actual data, falls back to source defaults.
    """
    interval_minutes = derive_station_interval_minutes(db, station.station_id)
    
    if interval_minutes:
        # Records per day = (24 * 60) / interval_minutes
        # Then scale to requested hours
        records_per_day = (24 * 60) / interval_minutes
        return max(1, int(records_per_day * hours / 24))
    
    # Fallback to source-based estimate
    per_day = FALLBACK_RECORDS_PER_DAY.get(
        station.data_source, 
        FALLBACK_RECORDS_PER_DAY["DEFAULT"]
    )
    return max(1, int(per_day * hours / 24))


def get_expected_records_for_station(
    db: Session, 
    station: WeatherStation, 
    hours: int = 24
) -> int:
    """
    Get expected record count for a station over given hours.
    
    First tries to derive from actual data, falls back to source defaults.
    """
    interval_minutes = derive_station_interval_minutes(db, station.station_id)
    
    if interval_minutes:
        # Records per hour = 60 / interval_minutes
        records_per_hour = 60 / interval_minutes
        return int(records_per_hour * hours)
    
    # Fallback to source-based estimate
    per_day = FALLBACK_RECORDS_PER_DAY.get(
        station.data_source, 
        FALLBACK_RECORDS_PER_DAY["DEFAULT"]
    )
    return int(per_day * hours / 24)


def get_yesterday_date_range(now: datetime) -> tuple[datetime, datetime]:
    """Get start and end of yesterday (UTC)."""
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    yesterday_end = today_start - timedelta(seconds=1)
    return yesterday_start, yesterday_end


def calculate_station_health(
    db: Session,
    station: WeatherStation,
    now: datetime
) -> StationHealthMetrics:
    """
    Calculate health metrics for a station.
    
    Health is primarily based on YESTERDAY's completeness (since today's data 
    may still be arriving due to ingestion lag of 6-12 hours).
    """
    
    # Get most recent data timestamp
    latest = db.query(func.max(WeatherData.timestamp)).filter(
        WeatherData.station_id == station.station_id
    ).scalar()
    
    hours_since = None
    if latest:
        hours_since = (now - latest).total_seconds() / 3600
    
    # Get expected records based on actual station interval
    expected_per_day = get_expected_records_for_station(db, station, 24)
    
    # Count DISTINCT timestamps (not total records, which includes multiple variables)
    # This gives us actual observation count, not record count
    
    # Yesterday's completeness (primary health indicator)
    yesterday_start, yesterday_end = get_yesterday_date_range(now)
    
    timestamps_yesterday = db.query(func.count(distinct(WeatherData.timestamp))).filter(
        WeatherData.station_id == station.station_id,
        WeatherData.timestamp >= yesterday_start,
        WeatherData.timestamp <= yesterday_end
    ).scalar() or 0
    
    completeness_yesterday = (timestamps_yesterday / expected_per_day * 100) if expected_per_day > 0 else 0
    
    # Today's records (informational, not used for health)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    timestamps_today = db.query(func.count(distinct(WeatherData.timestamp))).filter(
        WeatherData.station_id == station.station_id,
        WeatherData.timestamp >= today_start
    ).scalar() or 0
    
    # Hours elapsed today
    hours_today = (now - today_start).total_seconds() / 3600
    expected_today = int(expected_per_day * hours_today / 24) if hours_today > 0 else 1
    completeness_today = (timestamps_today / expected_today * 100) if expected_today > 0 else 0
    
    # Last 7 days completeness
    week_ago = now - timedelta(days=7)
    timestamps_7d = db.query(func.count(distinct(WeatherData.timestamp))).filter(
        WeatherData.station_id == station.station_id,
        WeatherData.timestamp >= week_ago
    ).scalar() or 0
    
    expected_7d = expected_per_day * 7
    completeness_7d = (timestamps_7d / expected_7d * 100) if expected_7d > 0 else 0
    
    # Determine status based on:
    # 1. Hours since last data (with lag tolerance)
    # 2. Yesterday's completeness (primary indicator)
    
    if hours_since is None or hours_since > STALE_HOURS_THRESHOLD:
        # No data or very old - offline
        status = StationStatus.OFFLINE
    elif completeness_yesterday >= HEALTHY_COMPLETENESS_PCT:
        # Good yesterday completeness and recent-ish data
        if hours_since <= HEALTHY_HOURS_THRESHOLD:
            status = StationStatus.HEALTHY
        else:
            # Data is a bit old but yesterday was good - likely just ingestion lag
            status = StationStatus.HEALTHY
    elif completeness_yesterday >= STALE_COMPLETENESS_PCT:
        # Partial data yesterday
        status = StationStatus.STALE
    else:
        # Poor completeness yesterday
        if hours_since <= HEALTHY_HOURS_THRESHOLD:
            # Recent data but poor yesterday - might be recovering
            status = StationStatus.STALE
        else:
            status = StationStatus.OFFLINE
    
    return StationHealthMetrics(
        last_data_timestamp=latest,
        hours_since_last_data=round(hours_since, 1) if hours_since else None,
        status=status,
        records_last_24h=timestamps_yesterday,  # Yesterday's count (complete day)
        expected_records_24h=expected_per_day,
        completeness_24h_pct=round(completeness_yesterday, 1),  # Yesterday's %
        records_last_7d=timestamps_7d,
        expected_records_7d=expected_7d,
        completeness_7d_pct=round(completeness_7d, 1),
        # Additional context
        derived_interval_minutes=derive_station_interval_minutes(db, station.station_id),
        records_today=timestamps_today,
        completeness_today_pct=round(min(completeness_today, 100), 1),  # Cap at 100
    )


def get_station_variables(db: Session, station_id: int) -> List[str]:
    """Get list of variables recorded by a station."""
    variables = db.query(distinct(WeatherData.variable)).filter(
        WeatherData.station_id == station_id
    ).all()
    return [v[0] for v in variables]


# =============================================================================
# ENDPOINTS (unchanged except for using updated calculate_station_health)
# =============================================================================

@router.get("/stations/stats", response_model=StationStatsResponse)
async def get_station_stats(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get overview statistics for all weather stations.
    """
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)
    
    # Total counts
    total = db.query(func.count(WeatherStation.station_id)).scalar() or 0
    active = db.query(func.count(WeatherStation.station_id)).filter(
        WeatherStation.is_active == True
    ).scalar() or 0
    
    # Get all active stations and calculate health
    stations = db.query(WeatherStation).filter(WeatherStation.is_active == True).all()
    
    healthy = 0
    stale = 0
    offline = 0
    
    for station in stations:
        health = calculate_station_health(db, station, now)
        if health.status == StationStatus.HEALTHY:
            healthy += 1
        elif health.status == StationStatus.STALE:
            stale += 1
        else:
            offline += 1
    
    # By source
    source_counts = db.query(
        WeatherStation.data_source,
        func.count(WeatherStation.station_id)
    ).filter(WeatherStation.is_active == True).group_by(WeatherStation.data_source).all()
    
    by_source = {s[0]: s[1] for s in source_counts}
    
    # By region
    region_counts = db.query(
        WeatherStation.region,
        func.count(WeatherStation.station_id)
    ).filter(WeatherStation.is_active == True).group_by(WeatherStation.region).all()
    
    by_region = {r[0] or 'unspecified': r[1] for r in region_counts}
    
    # Record counts (distinct timestamps, not total records)
    total_records = db.query(func.count(distinct(WeatherData.timestamp))).scalar() or 0
    records_24h = db.query(func.count(distinct(WeatherData.timestamp))).filter(
        WeatherData.timestamp >= day_ago
    ).scalar() or 0
    records_7d = db.query(func.count(distinct(WeatherData.timestamp))).filter(
        WeatherData.timestamp >= week_ago
    ).scalar() or 0
    
    return StationStatsResponse(
        total_stations=total,
        active_stations=active,
        inactive_stations=total - active,
        healthy_stations=healthy,
        stale_stations=stale,
        offline_stations=offline,
        by_source=by_source,
        by_region=by_region,
        total_records_all_time=total_records,
        records_last_24h=records_24h,
        records_last_7d=records_7d,
    )


@router.get("/stations", response_model=StationListResponse)
async def list_stations(
    data_source: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    status: Optional[StationStatus] = Query(None),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    List all weather stations with health status.
    """
    now = datetime.now(timezone.utc)
    
    query = db.query(WeatherStation)
    
    if data_source:
        query = query.filter(WeatherStation.data_source == data_source)
    
    if region:
        query = query.filter(WeatherStation.region == region)
    
    if is_active is not None:
        query = query.filter(WeatherStation.is_active == is_active)
    
    stations = query.order_by(WeatherStation.data_source, WeatherStation.station_name).all()
    
    station_items = []
    for station in stations:
        health = calculate_station_health(db, station, now)
        
        if status and health.status != status:
            continue
        
        variables = get_station_variables(db, station.station_id)
        
        station_items.append(StationListItem(
            station_id=station.station_id,
            station_code=station.station_code,
            station_name=station.station_name,
            data_source=station.data_source,
            source_id=station.source_id,
            latitude=station.latitude,
            longitude=station.longitude,
            elevation=station.elevation,
            region=station.region,
            is_active=station.is_active,
            created_at=station.created_at,
            health=health,
            variables_available=variables,
        ))
    
    stats = await get_station_stats(db=db, admin=admin)
    
    return StationListResponse(
        stations=station_items,
        total=len(station_items),
        summary=stats,
    )


@router.get("/stations/{station_id}", response_model=StationDetailResponse)
async def get_station_detail(
    station_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get detailed information for a single station.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    
    station = db.query(WeatherStation).filter(
        WeatherStation.station_id == station_id
    ).first()
    
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    health = calculate_station_health(db, station, now)
    variables = get_station_variables(db, station.station_id)
    
    # Calculate coverage per variable (last 7 days)
    # Use distinct timestamps per variable
    variable_coverage = []
    expected_7d = get_expected_records_for_station(db, station, 24 * 7)
    
    for var in variables:
        var_count = db.query(func.count(distinct(WeatherData.timestamp))).filter(
            WeatherData.station_id == station_id,
            WeatherData.variable == var,
            WeatherData.timestamp >= week_ago
        ).scalar() or 0
        
        variable_coverage.append(VariableCoverage(
            variable=var,
            record_count=var_count,
            expected_count=expected_7d,
            coverage_pct=round((var_count / expected_7d * 100) if expected_7d > 0 else 0, 1),
        ))
    
    # Get recent data sample
    recent_data = db.query(WeatherData).filter(
        WeatherData.station_id == station_id
    ).order_by(desc(WeatherData.timestamp)).limit(100).all()
    
    recent_data_list = [
        {
            "timestamp": r.timestamp.isoformat(),
            "variable": r.variable,
            "value": float(r.value) if r.value else None,
            "unit": r.unit,
            "quality": r.quality,
        }
        for r in recent_data
    ]
    
    return StationDetailResponse(
        station_id=station.station_id,
        station_code=station.station_code,
        station_name=station.station_name,
        data_source=station.data_source,
        source_id=station.source_id,
        latitude=station.latitude,
        longitude=station.longitude,
        elevation=station.elevation,
        region=station.region,
        is_active=station.is_active,
        created_at=station.created_at,
        health=health,
        variables_available=variables,
        notes=station.notes,
        updated_at=station.updated_at,
        variable_coverage=variable_coverage,
        recent_data=recent_data_list,
    )


@router.get("/stations/{station_id}/health", response_model=StationHealthMetrics)
async def get_station_health(
    station_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """Get health metrics for a single station."""
    now = datetime.now(timezone.utc)
    
    station = db.query(WeatherStation).filter(
        WeatherStation.station_id == station_id
    ).first()
    
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    return calculate_station_health(db, station, now)


@router.get("/ingestion/logs", response_model=IngestionLogsResponse)
async def get_ingestion_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    data_source: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """Get paginated ingestion logs."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    
    query = db.query(IngestionLog).filter(IngestionLog.logged_at >= since)
    
    if data_source:
        query = query.filter(IngestionLog.data_source == data_source)
    
    if status:
        query = query.filter(IngestionLog.status == status)
    
    total = query.count()
    
    logs = query.order_by(desc(IngestionLog.logged_at)).offset(
        (page - 1) * page_size
    ).limit(page_size).all()
    
    station_ids = [log.station_id for log in logs if log.station_id]
    stations = {}
    if station_ids:
        station_records = db.query(WeatherStation).filter(
            WeatherStation.station_id.in_(station_ids)
        ).all()
        stations = {s.station_id: s.station_code for s in station_records}
    
    log_items = []
    for log in logs:
        duration = None
        if log.start_time and log.end_time:
            duration = (log.end_time - log.start_time).total_seconds()
        
        log_items.append(IngestionLogItem(
            log_id=log.log_id,
            data_source=log.data_source,
            station_id=log.station_id,
            station_code=stations.get(log.station_id),
            start_time=log.start_time,
            end_time=log.end_time,
            duration_seconds=duration,
            records_processed=log.records_processed,
            records_inserted=log.records_inserted,
            status=log.status,
            error_msg=log.error_msg,
            logged_at=log.logged_at,
        ))
    
    return IngestionLogsResponse(
        logs=log_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/ingestion/summary", response_model=IngestionSummaryResponse)
async def get_ingestion_summary(
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """Get ingestion success rates by data source."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    
    sources = db.query(distinct(IngestionLog.data_source)).filter(
        IngestionLog.logged_at >= since
    ).all()
    
    summaries = []
    total_runs = 0
    total_successful = 0
    total_failed = 0
    
    for (source,) in sources:
        runs = db.query(IngestionLog).filter(
            IngestionLog.data_source == source,
            IngestionLog.logged_at >= since
        ).all()
        
        run_count = len(runs)
        success_count = sum(1 for r in runs if r.status == 'success')
        fail_count = sum(1 for r in runs if r.status in ['failed', 'error'])
        records_total = sum(r.records_inserted or 0 for r in runs)
        
        last_success = None
        last_fail = None
        for r in sorted(runs, key=lambda x: x.logged_at, reverse=True):
            if r.status == 'success' and not last_success:
                last_success = r.logged_at
            if r.status in ['failed', 'error'] and not last_fail:
                last_fail = r.logged_at
            if last_success and last_fail:
                break
        
        summaries.append(IngestionSummaryBySource(
            data_source=source,
            total_runs=run_count,
            successful_runs=success_count,
            failed_runs=fail_count,
            success_rate_pct=round((success_count / run_count * 100) if run_count > 0 else 0, 1),
            total_records_ingested=records_total,
            last_successful_run=last_success,
            last_failed_run=last_fail,
            avg_records_per_run=round(records_total / run_count, 0) if run_count > 0 else 0,
        ))
        
        total_runs += run_count
        total_successful += success_count
        total_failed += fail_count
    
    return IngestionSummaryResponse(
        period_days=days,
        by_source=summaries,
        total_runs=total_runs,
        total_successful=total_successful,
        total_failed=total_failed,
        overall_success_rate_pct=round(
            (total_successful / total_runs * 100) if total_runs > 0 else 0, 1
        ),
    )


@router.delete("/ingestion/logs/cleanup")
async def cleanup_old_logs(
    days_to_keep: int = Query(INGESTION_LOG_RETENTION_DAYS, ge=7, le=90),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """Clean up ingestion logs older than specified days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_to_keep)
    
    deleted = db.query(IngestionLog).filter(
        IngestionLog.logged_at < cutoff
    ).delete()
    
    db.commit()
    
    return {
        "message": f"Deleted {deleted} ingestion log entries older than {days_to_keep} days",
        "deleted_count": deleted,
    }