# api/v1/admin/admin_weather.py - Weather Infrastructure Admin Endpoints
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc, asc, distinct, and_, text
from sqlalchemy.orm import Session
import threading
from dataclasses import dataclass, field
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
    StationMapItem,
    StationMapResponse,
    SeriesPoint,
    StationSeriesResponse,
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
#
# `weather_data` is a VIEW over `timeseries_observations`, which is partitioned
# by year (47 partitions, ~35M rows). Every query here MUST carry a timestamp
# predicate or the planner fans out across all 47 partitions. Equally, nothing
# in this module may query per-station inside a loop: there are ~870 active
# stations, so a 6-query-per-station health check costs ~250s and the request
# is dead long before it returns.
#
# Both rules are satisfied the same way: load one bundle of telemetry for every
# station in a handful of bounded, grouped queries, then compute health in pure
# Python.

# Canonical cadences, used ONLY to label a station in the UI. Expected-record
# counts are computed from the raw measured median instead — see
# expected_records() — so a station reporting at an interval that is not on this
# list (there are stations at 4, 24.7 and 42.5 minutes) is still scored
# correctly rather than being snapped onto the nearest entry.
COMMON_INTERVALS_MINUTES = [
    1,      # 1-minute
    2,      # 2-minute
    5,      # 5-minute
    10,     # 10-minute
    15,     # 15-minute
    30,     # 30-minute
    60,     # Hourly
    180,    # 3-hourly
    360,    # 6-hourly
    720,    # 12-hourly
    1440,   # Daily
]

# Window used to derive logging intervals and recent-completeness counters.
HEALTH_WINDOW_DAYS = 7

# Minimum observations in the window before an interval can be derived.
MIN_OBSERVATIONS_FOR_INTERVAL = 5

# Gaps outside this range are ignored when taking the median (up to 25 hours, so
# daily loggers still register with some tolerance). The floor was 5 minutes,
# which made every station reporting faster than that unmeasurable: all of their
# gaps were discarded, the median came back NULL, and they fell through to the
# per-source fallback of 24/day against an actual ~1,440/day. 32 stations report
# at 1, 2 or 4 minutes. A 1-minute floor still discards nothing real, since the
# gaps are computed over DISTINCT timestamps so a zero gap cannot occur.
MIN_GAP_MINUTES = 1
MAX_GAP_MINUTES = 1500

# Wider bound used only to recover `last_data_timestamp` for stations that are
# silent inside the health window. Bounded rather than unbounded so the plan
# still prunes to a couple of partitions; a station dead longer than this
# reports None, which the status logic already treats as OFFLINE.
LAST_SEEN_LOOKBACK_DAYS = 400

# Window used to report which variables a station currently records in the bulk
# list view. The single-station detail endpoint stays unbounded — one station
# across 47 partitions is affordable, ~870 of them is not.
VARIABLES_WINDOW_DAYS = 90

# How long a whole-network telemetry bundle is reused. Short enough that the
# admin panel still reads as live, long enough that opening the dashboard, the
# station list and the map in sequence costs one load rather than three. Every
# endpoint that uses it accepts ?refresh=true to force a rebuild.
TELEMETRY_CACHE_TTL_SECONDS = 60


@dataclass
class StationTelemetry:
    """Raw per-station counters, loaded in bulk and free of further DB access."""
    last_timestamp: Optional[datetime] = None
    timestamps_yesterday: int = 0
    timestamps_today: int = 0
    timestamps_window: int = 0
    median_gap_minutes: Optional[float] = None
    variables: List[str] = field(default_factory=list)


def get_window_bounds(now: datetime) -> tuple[datetime, datetime, datetime]:
    """Return (window_start, yesterday_start, today_start) in UTC."""
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    window_start = now - timedelta(days=HEALTH_WINDOW_DAYS)
    return window_start, yesterday_start, today_start


def load_station_telemetry(
    db: Session,
    now: datetime,
    station_ids: Optional[List[int]] = None,
    include_variables: bool = False,
) -> dict[int, StationTelemetry]:
    """
    Load health telemetry for every station (or a named subset) in a fixed
    number of grouped queries, regardless of how many stations there are.

    Replaces the former per-station loop, which issued six queries per station.
    """
    window_start, yesterday_start, today_start = get_window_bounds(now)

    scoped = station_ids is not None
    station_filter = " AND station_id = ANY(:station_ids) " if scoped else ""
    params: dict = {
        "window_start": window_start,
        "yesterday_start": yesterday_start,
        "today_start": today_start,
    }
    if scoped:
        params["station_ids"] = list(station_ids)

    telemetry: dict[int, StationTelemetry] = {}

    # 1. Observation counts and last-seen, bucketed in a single pass.
    counts_sql = text(f"""
        SELECT station_id,
               max(timestamp) AS last_timestamp,
               count(DISTINCT timestamp) FILTER (
                   WHERE timestamp >= :yesterday_start
                     AND timestamp <  :today_start
               ) AS timestamps_yesterday,
               count(DISTINCT timestamp) FILTER (
                   WHERE timestamp >= :today_start
               ) AS timestamps_today,
               count(DISTINCT timestamp) AS timestamps_window
        FROM weather_data
        WHERE timestamp >= :window_start
        {station_filter}
        GROUP BY station_id
    """)
    for row in db.execute(counts_sql, params):
        telemetry[row.station_id] = StationTelemetry(
            last_timestamp=row.last_timestamp,
            timestamps_yesterday=row.timestamps_yesterday or 0,
            timestamps_today=row.timestamps_today or 0,
            timestamps_window=row.timestamps_window or 0,
        )

    # 2. Median gap between consecutive observations — the set-based form of
    #    the old per-station interval derivation.
    interval_sql = text(f"""
        WITH observed AS (
            SELECT DISTINCT station_id, timestamp
            FROM weather_data
            WHERE timestamp >= :window_start
            {station_filter}
        ),
        gaps AS (
            SELECT station_id,
                   EXTRACT(EPOCH FROM (timestamp - lag(timestamp) OVER (
                       PARTITION BY station_id ORDER BY timestamp
                   ))) / 60.0 AS gap_minutes
            FROM observed
        )
        SELECT station_id,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_minutes) AS median_gap
        FROM gaps
        WHERE gap_minutes BETWEEN :min_gap AND :max_gap
        GROUP BY station_id
    """)
    for row in db.execute(
        interval_sql,
        {**params, "min_gap": MIN_GAP_MINUTES, "max_gap": MAX_GAP_MINUTES},
    ):
        entry = telemetry.get(row.station_id)
        if entry is not None:
            entry.median_gap_minutes = float(row.median_gap) if row.median_gap is not None else None

    # 3. Variables currently reported, only when the caller needs them.
    if include_variables:
        attach_station_variables(db, now, telemetry, station_ids)

    return telemetry


def attach_station_variables(
    db: Session,
    now: datetime,
    telemetry: dict[int, StationTelemetry],
    station_ids: Optional[List[int]] = None,
) -> None:
    """
    Fill in each station's currently-reported variables.

    Split out from load_station_telemetry so a cached bundle loaded without
    variables can be topped up in place, rather than paying for the counts and
    interval queries a second time — variables are purely additive.
    """
    scoped = station_ids is not None
    station_filter = " AND station_id = ANY(:station_ids) " if scoped else ""

    params: dict = {"variables_start": now - timedelta(days=VARIABLES_WINDOW_DAYS)}
    if scoped:
        params["station_ids"] = list(station_ids)

    rows = db.execute(
        text(f"""
            SELECT station_id, array_agg(DISTINCT variable) AS variables
            FROM weather_data
            WHERE timestamp >= :variables_start
            {station_filter}
            GROUP BY station_id
        """),
        params,
    )
    for row in rows:
        entry = telemetry.setdefault(row.station_id, StationTelemetry())
        entry.variables = sorted(row.variables or [])


def backfill_last_seen(
    db: Session,
    now: datetime,
    telemetry: dict[int, StationTelemetry],
    station_ids: List[int],
) -> None:
    """
    Recover `last_data_timestamp` for stations silent through the health window.

    Only these stations are queried, and only over a bounded lookback, so the
    cost stays proportional to how many stations are actually dark.
    """
    missing = [
        sid for sid in station_ids
        if telemetry.get(sid) is None or telemetry[sid].last_timestamp is None
    ]
    if not missing:
        return

    rows = db.execute(
        text("""
            SELECT station_id, max(timestamp) AS last_timestamp
            FROM weather_data
            WHERE station_id = ANY(:station_ids)
              AND timestamp >= :lookback_start
            GROUP BY station_id
        """),
        {
            "station_ids": missing,
            "lookback_start": now - timedelta(days=LAST_SEEN_LOOKBACK_DAYS),
        },
    )
    for row in rows:
        entry = telemetry.setdefault(row.station_id, StationTelemetry())
        entry.last_timestamp = row.last_timestamp


@dataclass
class _TelemetryCacheEntry:
    """A whole-network bundle plus the instant it describes."""
    loaded_at: datetime
    telemetry: dict[int, StationTelemetry]
    has_variables: bool


_telemetry_cache: Optional[_TelemetryCacheEntry] = None
_telemetry_cache_lock = threading.Lock()


def load_network_telemetry(
    db: Session,
    include_variables: bool = False,
    refresh: bool = False,
) -> tuple[dict[int, StationTelemetry], datetime]:
    """
    Whole-network telemetry with a short cache, and the instant it describes.

    The dashboard, the station list and the map all want the same bundle and it
    costs several seconds to build, so they share one load for
    TELEMETRY_CACHE_TTL_SECONDS.

    **Callers must use the returned timestamp as their `now`** rather than
    calling datetime.now() themselves. The yesterday/today bucket counts were
    computed from boundaries derived from it; mixing in a fresher clock would,
    for up to the TTL just after UTC midnight, label the wrong day as
    "yesterday".

    Only the whole-network bundle is cached. Single-station lookups stay live —
    they are cheap, and `/stations/{id}/health` exists precisely to give an
    up-to-the-second answer for one station.

    The cache is per worker process (`gunicorn -w 2` means two of them), which
    is fine: it is a read-only freshness trade, not a correctness one.
    """
    global _telemetry_cache

    with _telemetry_cache_lock:
        entry = _telemetry_cache
        age = (
            (datetime.now(timezone.utc) - entry.loaded_at).total_seconds()
            if entry else None
        )
        fresh = entry is not None and not refresh and age < TELEMETRY_CACHE_TTL_SECONDS

        if fresh:
            if entry.has_variables or not include_variables:
                return entry.telemetry, entry.loaded_at

            # Top up in place rather than rebuilding the whole bundle.
            attach_station_variables(db, entry.loaded_at, entry.telemetry)
            entry.has_variables = True
            return entry.telemetry, entry.loaded_at

        now = datetime.now(timezone.utc)
        telemetry = load_station_telemetry(db, now, include_variables=include_variables)

        # Backfilled here, inside the cache, so the wider lookback for dark
        # stations is paid once per TTL instead of once per request.
        active_ids = [
            row.station_id for row in
            db.query(WeatherStation.station_id).filter(
                WeatherStation.is_active == True
            ).all()
        ]
        backfill_last_seen(db, now, telemetry, active_ids)

        _telemetry_cache = _TelemetryCacheEntry(
            loaded_at=now,
            telemetry=telemetry,
            has_variables=include_variables,
        )
        return telemetry, now


def snap_interval_minutes(median_gap: Optional[float], observations: int) -> Optional[int]:
    """Round a measured median gap to the nearest common logging interval."""
    if median_gap is None or observations < MIN_OBSERVATIONS_FOR_INTERVAL:
        return None
    return min(COMMON_INTERVALS_MINUTES, key=lambda x: abs(x - median_gap))


def expected_records(
    median_gap_minutes: Optional[float],
    data_source: Optional[str],
    hours: int = 24,
    observations: int = 0,
) -> int:
    """
    Expected observation count over a period.

    Uses the raw measured median gap rather than the snapped display interval:
    snapping first means a station on a cadence absent from
    COMMON_INTERVALS_MINUTES is scored against the wrong denominator, which is
    how 5-minute loggers came to report 200% completeness. Falls back to the
    per-source estimate only when no interval could be measured at all.
    """
    if median_gap_minutes and observations >= MIN_OBSERVATIONS_FOR_INTERVAL:
        records_per_hour = 60 / median_gap_minutes
        return max(1, int(round(records_per_hour * hours)))

    per_day = FALLBACK_RECORDS_PER_DAY.get(
        data_source,
        FALLBACK_RECORDS_PER_DAY["DEFAULT"],
    )
    return int(per_day * hours / 24)


def build_station_health(
    station: WeatherStation,
    telemetry: StationTelemetry,
    now: datetime,
) -> StationHealthMetrics:
    """
    Derive health metrics from already-loaded telemetry. Pure — no DB access.

    Health is primarily based on YESTERDAY's completeness, since today's data
    may still be arriving through an ingestion lag of 6-12 hours.
    """
    latest = telemetry.last_timestamp
    hours_since = (now - latest).total_seconds() / 3600 if latest else None

    # Snapped only for display; scoring uses the raw median.
    interval_minutes = snap_interval_minutes(
        telemetry.median_gap_minutes,
        telemetry.timestamps_window,
    )
    expected_per_day = expected_records(
        telemetry.median_gap_minutes,
        station.data_source,
        24,
        telemetry.timestamps_window,
    )

    # Yesterday's completeness (primary health indicator)
    timestamps_yesterday = telemetry.timestamps_yesterday
    completeness_yesterday = (
        (timestamps_yesterday / expected_per_day * 100) if expected_per_day > 0 else 0
    )

    # Today's records (informational, not used for health)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hours_today = (now - today_start).total_seconds() / 3600
    timestamps_today = telemetry.timestamps_today
    expected_today = int(expected_per_day * hours_today / 24) if hours_today > 0 else 1
    completeness_today = (
        (timestamps_today / expected_today * 100) if expected_today > 0 else 0
    )

    # Last 7 days completeness
    timestamps_7d = telemetry.timestamps_window
    expected_7d = expected_per_day * 7
    completeness_7d = (timestamps_7d / expected_7d * 100) if expected_7d > 0 else 0

    # Determine status based on:
    # 1. Hours since last data (with lag tolerance)
    # 2. Yesterday's completeness (primary indicator)

    if hours_since is None or hours_since > STALE_HOURS_THRESHOLD:
        # No data or very old - offline
        status = StationStatus.OFFLINE
    elif completeness_yesterday >= HEALTHY_COMPLETENESS_PCT:
        # Good yesterday completeness - healthy even if the feed lags a little
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
        derived_interval_minutes=interval_minutes,
        records_today=timestamps_today,
        completeness_today_pct=round(min(completeness_today, 100), 1),  # Cap at 100
    )


def calculate_station_health(
    db: Session,
    station: WeatherStation,
    now: datetime,
) -> StationHealthMetrics:
    """Health metrics for one station. Bulk callers must not use this in a loop."""
    telemetry = load_station_telemetry(db, now, station_ids=[station.station_id])
    backfill_last_seen(db, now, telemetry, [station.station_id])
    return build_station_health(
        station,
        telemetry.get(station.station_id, StationTelemetry()),
        now,
    )


def get_station_variables(db: Session, station_id: int) -> List[str]:
    """
    Every variable a station has ever recorded. Unbounded, so single-station
    callers only — see VARIABLES_WINDOW_DAYS for the bulk path.
    """
    variables = db.query(distinct(WeatherData.variable)).filter(
        WeatherData.station_id == station_id
    ).all()
    return sorted(v[0] for v in variables)


# =============================================================================
# ENDPOINTS
# =============================================================================
#
# These are deliberately `def`, not `async def`. They use a synchronous
# SQLAlchemy Session, and a sync query inside an `async def` runs on the event
# loop and blocks it — with `gunicorn -w 2` that means one slow admin request
# stalls every other request the worker is serving, public site included.
# Declared `def`, FastAPI runs them in a threadpool instead.


def build_station_stats(
    db: Session,
    now: datetime,
    active_stations: List,
    telemetry: dict[int, StationTelemetry],
) -> StationStatsResponse:
    """
    Assemble the station overview from already-loaded telemetry.

    `active_stations` needs only `station_id` and `data_source`, so column rows
    from load_active_stations() are accepted as readily as full model instances.
    """
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=HEALTH_WINDOW_DAYS)

    total = db.query(func.count(WeatherStation.station_id)).scalar() or 0
    active = len(active_stations)

    healthy = 0
    stale = 0
    offline = 0

    for station in active_stations:
        health = build_station_health(
            station,
            telemetry.get(station.station_id, StationTelemetry()),
            now,
        )
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

    # Record counts (distinct timestamps, not total records). Both windows come
    # from one bounded scan; the former unbounded all-time variant cost ~39s on
    # its own because it had to touch every partition.
    records = db.execute(
        text("""
            SELECT count(DISTINCT timestamp) FILTER (
                       WHERE timestamp >= :day_ago
                   ) AS records_24h,
                   count(DISTINCT timestamp) AS records_7d
            FROM weather_data
            WHERE timestamp >= :week_ago
        """),
        {"day_ago": day_ago, "week_ago": week_ago},
    ).one()

    # Total observation rows, estimated from partition statistics rather than
    # counted. Nothing renders this field, and an exact count means a full scan
    # of ~35M rows.
    total_records = db.execute(
        text("""
            SELECT COALESCE(sum(GREATEST(c.reltuples, 0)), 0)::bigint AS estimated_rows
            FROM pg_inherits i
            JOIN pg_class c ON c.oid = i.inhrelid
            WHERE i.inhparent = to_regclass('timeseries_observations')
        """)
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
        records_last_24h=records.records_24h or 0,
        records_last_7d=records.records_7d or 0,
    )


def load_active_stations(db: Session) -> List:
    """
    Active stations, as plain column rows.

    build_station_health and build_station_stats only read `station_id` and
    `data_source`, and loading full WeatherStation objects makes geoalchemy2
    deserialise ~900 Geography blobs nobody looks at.
    """
    return db.query(
        WeatherStation.station_id,
        WeatherStation.data_source,
    ).filter(WeatherStation.is_active == True).all()


@router.get("/stations/stats", response_model=StationStatsResponse)
def get_station_stats(
    refresh: bool = Query(False, description="Bypass the telemetry cache"),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Get overview statistics for all weather stations.
    """
    telemetry, now = load_network_telemetry(db, refresh=refresh)
    return build_station_stats(db, now, load_active_stations(db), telemetry)


@router.get("/stations/map", response_model=StationMapResponse)
def get_station_map(
    refresh: bool = Query(False, description="Bypass the telemetry cache"),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Every station with coordinates, for the coverage map.

    Declared before /stations/{station_id} so the literal path wins the match.
    Columns are selected explicitly rather than loading WeatherStation objects:
    the model carries a Geography column, and letting geoalchemy2 deserialise
    ~900 WKB blobs we never use costs more than the rest of this endpoint.
    """
    telemetry, now = load_network_telemetry(db, include_variables=True, refresh=refresh)

    rows = db.query(
        WeatherStation.station_id,
        WeatherStation.station_code,
        WeatherStation.station_name,
        WeatherStation.data_source,
        WeatherStation.region,
        WeatherStation.latitude,
        WeatherStation.longitude,
        WeatherStation.elevation,
    ).filter(WeatherStation.is_active == True).all()

    placed = [r for r in rows if r.latitude is not None and r.longitude is not None]

    stations = []
    counts_by_status: dict[str, int] = {s.value: 0 for s in StationStatus}
    variables: set[str] = set()
    sources: set[str] = set()
    regions: set[str] = set()

    for row in placed:
        entry = telemetry.get(row.station_id, StationTelemetry())
        # build_station_health only reads .data_source off the station, so the
        # lightweight row stands in for the full model here.
        health = build_station_health(row, entry, now)

        counts_by_status[health.status.value] = counts_by_status.get(health.status.value, 0) + 1
        variables.update(entry.variables)
        sources.add(row.data_source)
        if row.region:
            regions.add(row.region)

        stations.append(StationMapItem(
            station_id=row.station_id,
            station_code=row.station_code,
            station_name=row.station_name,
            data_source=row.data_source,
            region=row.region,
            latitude=float(row.latitude),
            longitude=float(row.longitude),
            elevation=row.elevation,
            status=health.status,
            last_data_timestamp=health.last_data_timestamp,
            hours_since_last_data=health.hours_since_last_data,
            completeness_24h_pct=health.completeness_24h_pct,
            derived_interval_minutes=health.derived_interval_minutes,
            variables=entry.variables,
        ))

    return StationMapResponse(
        stations=stations,
        total=len(stations),
        without_coordinates=len(rows) - len(placed),
        variables=sorted(variables),
        sources=sorted(sources),
        regions=sorted(regions),
        counts_by_status=counts_by_status,
    )


@router.get("/stations/{station_id}/series", response_model=StationSeriesResponse)
def get_station_series(
    station_id: int,
    variable: str = Query(..., description="Variable to plot, e.g. 'temp'"),
    days: int = Query(10, ge=1, le=90),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    Recent history for one station and one variable, for the map's chart modal.

    Bounded by `days`, so the scan prunes to one or two partitions: ~50ms for a
    typical 10-day series, ~230ms for the densest station in the network.
    """
    station = db.query(WeatherStation).filter(
        WeatherStation.station_id == station_id
    ).first()

    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = db.query(
        WeatherData.timestamp,
        WeatherData.value,
        WeatherData.unit,
    ).filter(
        WeatherData.station_id == station_id,
        WeatherData.variable == variable,
        WeatherData.timestamp >= since,
    ).order_by(WeatherData.timestamp).all()

    points = [
        SeriesPoint(t=r.timestamp, v=float(r.value) if r.value is not None else None)
        for r in rows
    ]
    values = [p.v for p in points if p.v is not None]
    unit = next((r.unit for r in rows if r.unit), None)

    return StationSeriesResponse(
        station_id=station.station_id,
        station_code=station.station_code,
        station_name=station.station_name,
        variable=variable,
        unit=unit,
        days=days,
        point_count=len(points),
        points=points,
        min_value=min(values) if values else None,
        max_value=max(values) if values else None,
        avg_value=round(sum(values) / len(values), 3) if values else None,
        latest_value=values[-1] if values else None,
        latest_at=points[-1].t if points else None,
    )


@router.get("/stations", response_model=StationListResponse)
def list_stations(
    data_source: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    status: Optional[StationStatus] = Query(None),
    refresh: bool = Query(False, description="Bypass the telemetry cache"),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """
    List all weather stations with health status.
    """
    telemetry, now = load_network_telemetry(db, include_variables=True, refresh=refresh)

    query = db.query(WeatherStation)

    if data_source:
        query = query.filter(WeatherStation.data_source == data_source)

    if region:
        query = query.filter(WeatherStation.region == region)

    if is_active is not None:
        query = query.filter(WeatherStation.is_active == is_active)

    stations = query.order_by(WeatherStation.data_source, WeatherStation.station_name).all()

    # The cached bundle backfills last-seen for ACTIVE stations only. If the
    # caller has asked for inactive ones too, top those up — backfill_last_seen
    # skips anything already resolved, so this queries only what is genuinely
    # still missing, and the result lands in the shared bundle for next time.
    backfill_last_seen(db, now, telemetry, [s.station_id for s in stations])

    station_items = []
    for station in stations:
        entry = telemetry.get(station.station_id, StationTelemetry())
        health = build_station_health(station, entry, now)

        if status and health.status != status:
            continue

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
            variables_available=entry.variables,
        ))

    return StationListResponse(
        stations=station_items,
        total=len(station_items),
        summary=build_station_stats(db, now, load_active_stations(db), telemetry),
    )


@router.get("/stations/{station_id}", response_model=StationDetailResponse)
def get_station_detail(
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
    
    # Calculate coverage per variable (last 7 days), in one grouped pass rather
    # than a query per variable.
    expected_7d = health.expected_records_7d

    counts_by_variable = dict(
        db.query(
            WeatherData.variable,
            func.count(distinct(WeatherData.timestamp)),
        ).filter(
            WeatherData.station_id == station_id,
            WeatherData.timestamp >= week_ago,
        ).group_by(WeatherData.variable).all()
    )

    variable_coverage = [
        VariableCoverage(
            variable=var,
            record_count=counts_by_variable.get(var, 0),
            expected_count=expected_7d,
            coverage_pct=round(
                (counts_by_variable.get(var, 0) / expected_7d * 100) if expected_7d > 0 else 0,
                1,
            ),
        )
        for var in variables
    ]

    # Get recent data sample. Anchored to the station's own last reading so the
    # scan prunes to a partition or two — unbounded, it walks all 47.
    recent_data_query = db.query(WeatherData).filter(
        WeatherData.station_id == station_id
    )
    if health.last_data_timestamp:
        recent_data_query = recent_data_query.filter(
            WeatherData.timestamp >= health.last_data_timestamp - timedelta(days=7)
        )
    recent_data = recent_data_query.order_by(desc(WeatherData.timestamp)).limit(100).all()
    
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
def get_station_health(
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
def get_ingestion_logs(
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
def get_ingestion_summary(
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin)
):
    """Get ingestion success rates by data source."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # One grouped pass. The former shape ran a query per source and hydrated
    # every matching row into an ORM object to count it in Python — ~120k rows
    # over a 7-day window.
    # Status is written uppercase by the ingestion clients ('SUCCESS', 'FAILED',
    # 'NO_DATA'). This used to compare against lowercase literals, so every
    # source reported a 0% success rate and a null last-successful-run no matter
    # what had actually happened. Compared case-insensitively so either casing
    # counts. 'NO_DATA' is deliberately neither a success nor a failure.
    status_upper = func.upper(IngestionLog.status)

    rows = db.query(
        IngestionLog.data_source,
        func.count().label('total_runs'),
        func.count().filter(status_upper == 'SUCCESS').label('successful_runs'),
        func.count().filter(status_upper.in_(['FAILED', 'ERROR'])).label('failed_runs'),
        func.coalesce(func.sum(IngestionLog.records_inserted), 0).label('records_ingested'),
        func.max(IngestionLog.logged_at).filter(
            status_upper == 'SUCCESS'
        ).label('last_successful_run'),
        func.max(IngestionLog.logged_at).filter(
            status_upper.in_(['FAILED', 'ERROR'])
        ).label('last_failed_run'),
    ).filter(
        IngestionLog.logged_at >= since
    ).group_by(IngestionLog.data_source).all()

    summaries = []
    total_runs = 0
    total_successful = 0
    total_failed = 0

    for row in rows:
        run_count = row.total_runs or 0
        success_count = row.successful_runs or 0
        fail_count = row.failed_runs or 0
        records_total = int(row.records_ingested or 0)

        summaries.append(IngestionSummaryBySource(
            data_source=row.data_source,
            total_runs=run_count,
            successful_runs=success_count,
            failed_runs=fail_count,
            success_rate_pct=round((success_count / run_count * 100) if run_count > 0 else 0, 1),
            total_records_ingested=records_total,
            last_successful_run=row.last_successful_run,
            last_failed_run=row.last_failed_run,
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
def cleanup_old_logs(
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