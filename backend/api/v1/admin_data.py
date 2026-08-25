# api/v1/admin/admin_data.py - Data Quality Admin Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc, distinct, and_, or_, text
from sqlalchemy.orm import Session, load_only
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

def detect_gaps_bulk(
    db: Session,
    start_time: datetime,
    end_time: datetime,
    threshold_hours: float = GAP_THRESHOLD_HOURS,
    station_id: Optional[int] = None,
) -> dict:
    """Gaps for EVERY station in one query, keyed by station_id.

    `detect_gaps` below does one station at a time: a DISTINCT timestamp scan,
    then another query per gap to name the affected variables. Called across
    ~930 active stations that is roughly a thousand round trips and the /gaps
    endpoint took 54 seconds.

    A single `lag()` over (station_id, timestamp) finds every gap in the
    network at once - measured 5.1s for a 7-day window, 78 gaps across 31
    stations - and one more query names the variables at all the boundaries
    together.
    """
    params = {"start": start_time, "end": end_time,
              "threshold": f"{threshold_hours} hours"}
    station_filter = ""
    if station_id is not None:
        station_filter = "AND station_id = :station_id"
        params["station_id"] = station_id

    rows = db.execute(text(f"""
        WITH ts AS (
            SELECT DISTINCT station_id, timestamp
            FROM timeseries_observations
            WHERE timestamp >= :start AND timestamp <= :end
            {station_filter}
        ), g AS (
            SELECT station_id, timestamp,
                   lag(timestamp) OVER (
                       PARTITION BY station_id ORDER BY timestamp) AS prev
            FROM ts
        )
        SELECT station_id, prev AS gap_start, timestamp AS gap_end,
               EXTRACT(EPOCH FROM (timestamp - prev)) / 3600.0 AS gap_hours
        FROM g
        WHERE prev IS NOT NULL
          AND timestamp - prev >= CAST(:threshold AS interval)
        ORDER BY station_id, prev
    """), params).fetchall()

    if not rows:
        return {}

    # Variables at every gap boundary, in ONE query rather than one per gap.
    boundaries = list({(r.station_id, r.gap_start) for r in rows})
    vars_by_boundary: dict = {}
    var_rows = db.execute(text("""
        SELECT station_id, timestamp, array_agg(DISTINCT variable) AS vars
        FROM timeseries_observations
        WHERE (station_id, timestamp) IN (
            SELECT unnest(CAST(:sids AS bigint[])), unnest(CAST(:tss AS timestamptz[]))
        )
        GROUP BY station_id, timestamp
    """), {"sids": [b[0] for b in boundaries],
           "tss": [b[1] for b in boundaries]}).fetchall()
    for vr in var_rows:
        vars_by_boundary[(vr.station_id, vr.timestamp)] = list(vr.vars or [])

    out: dict = {}
    for r in rows:
        out.setdefault(r.station_id, []).append({
            "gap_start": r.gap_start,
            "gap_end": r.gap_end,
            "gap_hours": round(float(r.gap_hours), 1),
            "variables_affected": vars_by_boundary.get(
                (r.station_id, r.gap_start), []),
        })
    return out


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

# =============================================================================
# WHY THIS FILE DOES NOT AGGREGATE `weather_data` DIRECTLY
# =============================================================================
#
# `weather_data` is a VIEW over `timeseries_observations`, which is RANGE
# partitioned by year: 47 partitions, 22 of them non-empty, **96.4 million
# rows**. A bare `SELECT max(timestamp) FROM weather_data` times out at 60
# seconds. So did `count(*)`, `min(timestamp)`, and both `DISTINCT`s.
#
# The overview endpoint used to issue about FIFTY such queries - five over the
# whole view, then three more for each of fifteen data sources - and simply
# never returned. It was not slow; it was unbounded.
#
# The replacements below answer in well under a second by asking a cheaper
# authority for the same fact:
#
#   total rows      Postgres partition statistics (pg_class.reltuples)
#   earliest/latest ONE partition each, not all 22
#   per-source      `ingestion_log`, which already records exactly this per run
#
# THE TOTAL IS AN ESTIMATE. reltuples is maintained by ANALYZE, so it drifts a
# little between runs. For a dashboard reading "~96.4 million observations"
# that is the right trade; an exact figure is not worth a query that cannot
# finish.

OBS_TABLE = "timeseries_observations"

# The window the "what is reporting" figures are computed over. Seven days
# rather than all time, because both were DISTINCT scans of the whole view.
OVERVIEW_WINDOW_DAYS = 7

# The window /data/coverage reports per-station completeness over. All-time
# per-station figures are not obtainable from a 96-million-row view.
COVERAGE_WINDOW_DAYS = 90


def _partition_stats(db: Session) -> dict:
    """Row estimate and the non-empty partition list, from catalog statistics.

    Measured 0.05s against 47 partitions. Reads no observation data at all.
    """
    rows = db.execute(text("""
        SELECT c.relname, c.reltuples::bigint AS n
        FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        WHERE i.inhparent = 'timeseries_observations'::regclass
          AND c.reltuples > 0
        ORDER BY c.relname
    """)).fetchall()
    return {"total": sum(r.n for r in rows),
            "partitions": [r.relname for r in rows]}


def _observation_span(db: Session, partitions: list) -> tuple:
    """Earliest and latest observation, one partition each.

    `min()` on the OLDEST partition and `max()` on the NEWEST is exact - range
    partitioning guarantees no earlier row lives anywhere else - and it touches
    one table instead of twenty-two. Measured 0.05s and 2.34s.
    """
    if not partitions:
        return None, None
    earliest = db.execute(
        text("SELECT min(timestamp) FROM " + partitions[0])).scalar()
    latest = db.execute(
        text("SELECT max(timestamp) FROM " + partitions[-1])).scalar()
    return earliest, latest


def _source_activity(db: Session) -> dict:
    """Per-source rows and last run, from `ingestion_log`.

    The log records `records_inserted` and `end_time` for every run of every
    source - the same question the overview was asking the observation table.
    A few thousand rows against ninety-six million.
    """
    rows = db.execute(text("""
        SELECT data_source,
               sum(records_inserted)::bigint AS inserted,
               min(start_time) AS first_run,
               max(end_time)   AS last_run
        FROM ingestion_log
        GROUP BY data_source
    """)).fetchall()
    return {r.data_source: r for r in rows}


@router.get("/overview", response_model=DataOverviewResponse)
def get_data_overview(
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
    
    # Weather data overview. See the note above the helpers: every figure here
    # used to be an unbounded aggregate over a 96-million-row view.
    stats = _partition_stats(db)
    weather_total = stats["total"]
    weather_earliest, weather_latest = _observation_span(db, stats["partitions"])

    # BOUNDED. Both of these were DISTINCT over the whole view. A recent window
    # answers the question an operator is actually asking - what is reporting
    # now - and it answers it in under a second.
    since = now - timedelta(days=OVERVIEW_WINDOW_DAYS)
    stations_with_data = db.execute(text(
        "SELECT count(DISTINCT station_id) FROM timeseries_observations "
        "WHERE timestamp >= :since"), {"since": since}).scalar() or 0

    variables_list = [r[0] for r in db.execute(text(
        "SELECT DISTINCT variable FROM timeseries_observations "
        "WHERE timestamp >= :since ORDER BY variable"),
        {"since": since}).fetchall()]

    # By source, from the ingestion log rather than from the observations.
    activity = _source_activity(db)
    station_counts = dict(db.query(
        WeatherStation.data_source, func.count(WeatherStation.station_id)
    ).filter(WeatherStation.is_active == True).group_by(
        WeatherStation.data_source
    ).all())

    by_source = []
    for source in sorted(set(station_counts) | set(activity)):
        station_count = station_counts.get(source, 0)
        log = activity.get(source)
        source_latest = log.last_run if log else None

        if station_count == 0:
            status = "pending"
        elif source_latest and (now - source_latest).total_seconds() < 86400:
            status = "active"
        else:
            status = "inactive"

        by_source.append(DataSourceCoverage(
            data_source=source,
            station_count=station_count,
            total_records=int(log.inserted or 0) if log else 0,
            earliest_record=log.first_run if log else None,
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
    # `ssp`, not `ssp_scenario` - see get_climate_data_status.
    scenarios = db.query(distinct(ClimateProjection.ssp)).all()
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
    # `.limit(10)` - this loaded all 900-odd active stations to use ten.
    active_stations = db.query(WeatherStation).filter(
        WeatherStation.is_active == True
    ).limit(10).all()
    
    # Per-station here on purpose: this samples TEN stations, and a
    # whole-network bulk scan for ten of them costs more than it saves.
    for station in active_stations:
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
def get_data_gaps(
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
    
    # One query for the whole network - see detect_gaps_bulk.
    gaps_by_station = detect_gaps_bulk(
        db, start_time, now, min_gap_hours, station_id=station_id)

    for station in stations:
        gaps = gaps_by_station.get(station.station_id, [])
        
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
def get_quality_issues(
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
def get_temporal_coverage(
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

    # ONE GROUPED QUERY, NOT THREE PER STATION.
    #
    # This looped over every active station issuing an unbounded min(), max()
    # and count() against `weather_data` - a view over 96 million rows across
    # 47 partitions. At ~930 active stations that is about 2,800 unbounded
    # aggregates, and the endpoint never returned.
    #
    # One GROUP BY over a bounded window answers all of them in ~4s.
    #
    # THE WINDOW IS THE TRADE and the response declares it: `coverage_window_days`.
    # These are no longer all-time figures per station, they are coverage over a
    # recent window - which is the question this page is actually asked ("is
    # this station reporting, and how completely"). An all-time per-station
    # figure cannot be computed against this table in any reasonable time.
    since = datetime.now(timezone.utc) - timedelta(days=COVERAGE_WINDOW_DAYS)
    spans = {
        r.station_id: r for r in db.execute(text("""
            SELECT station_id,
                   min(timestamp) AS earliest,
                   max(timestamp) AS latest,
                   count(*)::bigint AS n
            FROM timeseries_observations
            WHERE timestamp >= :since
            GROUP BY station_id
        """), {"since": since}).fetchall()
    }

    coverage = []

    for station in stations:
        span = spans.get(station.station_id)
        earliest = span.earliest if span else None
        latest = span.latest if span else None
        record_count = int(span.n) if span else 0

        
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
def get_climate_data_status(
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get detailed status of climate reference data per zone.
    """
    # load_only: SELECT * here pulls `geometry` (16 MB across 23 zones) and
    # `geometry_clipped` (14 MB) for a status table that shows names and counts.
    zones = db.query(ClimateZone).options(
        load_only(ClimateZone.id, ClimateZone.name, ClimateZone.slug,
                  ClimateZone.region_id, ClimateZone.display_order),
    ).filter(ClimateZone.is_active == True).order_by(
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
        
        # `ssp`, NOT `ssp_scenario`. The column has always been `ssp`; the
        # attribute here does not exist, so this raised AttributeError and the
        # endpoint 500'd for every caller. Nothing catches it, so the admin
        # climate page has simply been broken.
        scenarios = db.query(distinct(ClimateProjection.ssp)).filter(
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