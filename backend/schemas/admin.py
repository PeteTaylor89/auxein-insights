# schemas/admin.py - Admin Dashboard Pydantic Schemas
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class StationStatus(str, Enum):
    HEALTHY = "healthy"      # Data within 2 hours, >95% completeness
    STALE = "stale"          # Data within 24 hours, >80% completeness
    OFFLINE = "offline"      # No data 24+ hours or <80% completeness


class DataSource(str, Enum):
    HARVEST = "HARVEST"
    ECAN = "ECAN"
    HBRC = "HBRC"
    MRC = "MRC"


# =============================================================================
# USER MANAGEMENT SCHEMAS
# =============================================================================

class UserTypeCount(BaseModel):
    user_type: str
    count: int
    percentage: float


class RegionCount(BaseModel):
    region: str
    count: int
    percentage: float


class MarketingSegmentCount(BaseModel):
    segment: str
    count: int
    percentage: float


class OptInStats(BaseModel):
    newsletter: int
    newsletter_pct: float
    marketing: int
    marketing_pct: float
    research: int
    research_pct: float


class UserStatsResponse(BaseModel):
    """Dashboard summary statistics for users."""
    total_users: int
    verified_users: int
    unverified_users: int
    active_users: int  # is_active = True
    
    # Activity metrics
    active_last_7_days: int
    active_last_30_days: int
    signups_today: int
    signups_this_week: int
    signups_this_month: int
    
    # Breakdowns
    by_type: List[UserTypeCount]
    by_region: List[RegionCount]
    by_segment: List[MarketingSegmentCount]
    opt_ins: OptInStats
    
    # Averages
    avg_login_count: float
    users_never_logged_in: int


class UserListItem(BaseModel):
    """User item for list view."""
    id: int
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    full_name: str
    
    user_type: Optional[str]
    company_name: Optional[str]
    job_title: Optional[str]
    region_of_interest: Optional[str]
    marketing_segment: str
    
    is_active: bool
    is_verified: bool
    
    newsletter_opt_in: bool
    marketing_opt_in: bool
    research_opt_in: bool
    
    # Subscription. `subscription_tier` is the stored value and `is_pro` is the
    # DECISION — 'grow' counts as Pro and an expired 'pro' does not, so an admin
    # screen that renders the tier string alone will disagree with what the user
    # actually sees. Both travel together deliberately.
    subscription_tier: str
    is_pro: bool
    pro_started_at: Optional[datetime] = None
    pro_expires_at: Optional[datetime] = None
    pro_site_quota: int = 0
    # 'grow' rows are password-less projections of a Grow user and their Pro
    # entitlement follows that relationship, not an Insights subscription.
    origin: str = "signup"

    login_count: int
    last_login: Optional[datetime]
    last_active: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Paginated user list response."""
    users: List[UserListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class UserDetailResponse(UserListItem):
    """Extended user detail with additional fields."""
    verified_at: Optional[datetime]
    first_map_view: Optional[datetime]
    notes: Optional[str]
    updated_at: Optional[datetime]


class UserUpdateRequest(BaseModel):
    """Admin update for user.

    Subscription fields are here because there is otherwise NO way to make
    somebody Pro: nothing in the product writes `subscription_tier='pro'`, and
    until this existed the only route was an UPDATE in psql.

    `subscription_tier` accepts 'free' and 'pro' only. 'grow' is written by
    `insights_profile.ensure_insights_profile` from the SSO handshake and means
    "this row is a projection of a Grow user"; setting it by hand would claim a
    relationship that does not exist and survive the next sync.
    """
    is_active: Optional[bool] = None
    notes: Optional[str] = None

    subscription_tier: Optional[str] = None
    # None means open-ended, which is NOT the same as "no change" — send
    # `clear_pro_expiry` to distinguish, since a JSON null cannot.
    pro_expires_at: Optional[datetime] = None
    clear_pro_expiry: Optional[bool] = None
    # A point subscription is priced separately and stacks, so this is set
    # independently of the tier. 0 means Pro without a saved site.
    pro_site_quota: Optional[int] = None


class ActivityTimelineItem(BaseModel):
    """Activity event for timeline."""
    timestamp: datetime
    event_type: str  # signup, login, verification
    user_id: int
    user_email: str
    user_name: str


class ActivityTimelineResponse(BaseModel):
    """Recent activity timeline."""
    events: List[ActivityTimelineItem]
    total_signups_period: int
    total_logins_period: int
    total_verifications_period: int


# =============================================================================
# WEATHER INFRASTRUCTURE SCHEMAS
# =============================================================================

class VariableCoverage(BaseModel):
    """Coverage stats for a single variable."""
    variable: str
    record_count: int
    expected_count: int
    coverage_pct: float


class StationHealthMetrics(BaseModel):
    """Health metrics for a weather station."""
    last_data_timestamp: Optional[datetime]
    hours_since_last_data: Optional[float]
    status: StationStatus
    
    records_last_24h: int
    expected_records_24h: int
    completeness_24h_pct: float
    
    records_last_7d: int
    expected_records_7d: int
    completeness_7d_pct: float
    derived_interval_minutes: Optional[int] = None
    records_today: Optional[int] = None
    completeness_today_pct: Optional[float] = None


class StationListItem(BaseModel):
    """Weather station item for list view."""
    station_id: int
    station_code: str
    station_name: Optional[str]
    data_source: str
    source_id: Optional[str]
    
    latitude: Optional[Decimal]
    longitude: Optional[Decimal]
    elevation: Optional[int]
    region: Optional[str]
    
    is_active: bool
    created_at: datetime
    
    # Health metrics
    health: StationHealthMetrics
    variables_available: List[str]


class StationStatsResponse(BaseModel):
    """Overview statistics for weather stations."""
    total_stations: int
    active_stations: int
    inactive_stations: int
    
    healthy_stations: int
    stale_stations: int
    offline_stations: int
    
    by_source: Dict[str, int]
    by_region: Dict[str, int]
    
    total_records_all_time: int
    records_last_24h: int
    records_last_7d: int


class StationListResponse(BaseModel):
    """List of weather stations with health status."""
    stations: List[StationListItem]
    total: int
    summary: StationStatsResponse


class StationMapItem(BaseModel):
    """
    Lightweight station row for the coverage map.

    Deliberately flatter and smaller than StationListItem — the map draws ~870
    of these at once and needs coordinates, one status and the variable list to
    filter on, not the full health block.
    """
    station_id: int
    station_code: str
    station_name: Optional[str]
    data_source: str
    region: Optional[str]

    latitude: float
    longitude: float
    elevation: Optional[int]

    status: StationStatus
    last_data_timestamp: Optional[datetime]
    hours_since_last_data: Optional[float]
    completeness_24h_pct: float
    derived_interval_minutes: Optional[int]

    variables: List[str]

    # ZONE ASSIGNMENT IS WHAT DECIDES DISEASE PRESSURE, and it is manual.
    #
    # `hourly_aggregation` resolves a zone's stations through
    # `weather_stations.zone_id` down the zone subtree — nothing spatial, no
    # containment test. A station that reports perfectly good humidity but has no
    # zone_id is invisible to every zone rollup and therefore to all three
    # disease models. 130 hygrometers are in exactly that state.
    #
    # `region` is a different thing entirely: a free-text label off the source
    # feed, not a wine climate zone, and filtering on it tells you nothing about
    # what the models can see.
    zone_id: Optional[int] = None
    zone_name: Optional[str] = None


class JobStatusItem(BaseModel):
    """One scheduled job, judged by the age of what it last produced.

    `last_at` is the newest row the job is responsible for, NOT the last time it
    ran. A job that ran and wrote nothing is the failure mode this exists to
    catch — see `api/v1/admin_jobs.py`.
    """
    key: str
    name: str
    runs_on: str
    cadence: str
    produces: str

    last_at: Optional[datetime]
    age_hours: Optional[float]
    # Cadence plus the job's designed-in data lag. Surfaces target D-2
    # deliberately, so a healthy fit is two days old.
    max_age_hours: float
    # ok | late | stale | never | unknown
    status: str

    # The one number that says whether the output is any good — zones covered,
    # variables published — rather than merely present.
    detail_value: Optional[int] = None
    detail_label: Optional[str] = None
    error: Optional[str] = None


class JobStatusResponse(BaseModel):
    jobs: List[JobStatusItem]
    checked_at: datetime
    counts_by_status: Dict[str, int]
    # The WORST job, not an average: nine healthy jobs and one dark pipeline is
    # an outage, not 90% health.
    overall: str


class JobHistoryDay(BaseModel):
    """What one job produced on one day. Absent days are holes, not zeroes.

    The API returns only days that produced something. The caller fills the
    calendar, because a day with no row and a day with a zero count are the
    same finding and collapsing them in the response would hide which days the
    window even covers.
    """
    day: date
    count: int


class JobHistoryItem(BaseModel):
    key: str
    name: str
    # Which day a row is filed under. "data" means the day the row DESCRIBES —
    # a gap is missing data. "run" means the day the job executed — a gap is a
    # missed run. They fail differently and must not be read the same way.
    axis: str
    # The count a complete day reaches: 23 zones, 4 variables. None where the
    # count has no fixed target, in which case only presence can be judged.
    expected: Optional[int] = None
    unit: Optional[str] = None
    days: List[JobHistoryDay] = []
    error: Optional[str] = None


class JobHistoryResponse(BaseModel):
    jobs: List[JobHistoryItem]
    start: date
    end: date
    checked_at: datetime


class ZoneOption(BaseModel):
    """A zone, for a filter list or an assignment field. Id and name only.

    Deliberately not the ClimateZone model: it carries two MULTIPOLYGON columns
    and selecting them for a dropdown pulls tens of megabytes of boundary the
    caller never draws.
    """
    id: int
    name: str


class StationMapResponse(BaseModel):
    """Stations plus the filter vocabularies actually present in the result."""
    stations: List[StationMapItem]
    total: int
    without_coordinates: int
    variables: List[str]
    sources: List[str]
    regions: List[str]
    counts_by_status: Dict[str, int]
    # Every active zone, not only those already used — the point of the filter is
    # to find what is MISSING from a zone, and a vocabulary built from the result
    # set cannot name an empty one.
    zones: List[ZoneOption] = []
    unassigned_count: int = 0


class StationZoneAssignRequest(BaseModel):
    """Assign a station to a climate zone, or clear it with null."""
    zone_id: Optional[int] = None


class StationZoneAssignResponse(BaseModel):
    station_id: int
    station_code: str
    zone_id: Optional[int]
    zone_name: Optional[str]
    previous_zone_id: Optional[int]
    # What the assignment actually buys the models, which is the only reason to
    # make one. A station with no thermometer contributes no disease-usable hour
    # however it is assigned.
    variables: List[str] = []
    disease_usable: bool = False


class SeriesPoint(BaseModel):
    """One observation. Short keys — a 10-day series can be ~7,000 of these."""
    t: datetime
    v: Optional[float]


class StationSeriesResponse(BaseModel):
    """A single variable's recent history for one station."""
    station_id: int
    station_code: str
    station_name: Optional[str]
    variable: str
    unit: Optional[str]
    days: int

    point_count: int
    points: List[SeriesPoint]

    min_value: Optional[float]
    max_value: Optional[float]
    avg_value: Optional[float]
    latest_value: Optional[float]
    latest_at: Optional[datetime]


class StationDetailResponse(StationListItem):
    """Extended station detail."""
    notes: Optional[Dict[str, Any]]
    updated_at: Optional[datetime]
    variable_coverage: List[VariableCoverage]
    
    # Recent data sample
    recent_data: List[Dict[str, Any]]


class IngestionLogItem(BaseModel):
    """Ingestion log entry."""
    log_id: int
    data_source: str
    station_id: Optional[int]
    station_code: Optional[str]
    
    start_time: datetime
    end_time: Optional[datetime]
    duration_seconds: Optional[float]
    
    records_processed: Optional[int]
    records_inserted: Optional[int]
    status: Optional[str]
    error_msg: Optional[str]
    
    logged_at: datetime


class IngestionLogsResponse(BaseModel):
    """Paginated ingestion logs."""
    logs: List[IngestionLogItem]
    total: int
    page: int
    page_size: int


class IngestionSummaryBySource(BaseModel):
    """Ingestion summary for a data source."""
    data_source: str
    total_runs: int
    successful_runs: int
    failed_runs: int
    success_rate_pct: float
    total_records_ingested: int
    last_successful_run: Optional[datetime]
    last_failed_run: Optional[datetime]
    avg_records_per_run: float


class IngestionSummaryResponse(BaseModel):
    """Ingestion summary statistics."""
    period_days: int
    by_source: List[IngestionSummaryBySource]
    total_runs: int
    total_successful: int
    total_failed: int
    overall_success_rate_pct: float


# =============================================================================
# DATA QUALITY SCHEMAS
# =============================================================================

class DataSourceCoverage(BaseModel):
    """Coverage stats for a data source."""
    data_source: str
    station_count: int
    total_records: int
    earliest_record: Optional[datetime]
    latest_record: Optional[datetime]
    status: str  # active, pending, inactive


class WeatherDataOverview(BaseModel):
    """Overview of weather data coverage."""
    earliest_record: Optional[datetime]
    latest_record: Optional[datetime]
    total_records: int
    stations_with_data: int
    variables_tracked: List[str]
    by_source: List[DataSourceCoverage]


class ClimateDataOverview(BaseModel):
    """Overview of climate reference data."""
    zones_total: int
    zones_with_baseline: int
    zones_with_history: int
    zones_with_projections: int
    baseline_period: str
    history_range: str
    projection_scenarios: List[str]


class DataGap(BaseModel):
    """Identified data gap."""
    station_id: int
    station_code: str
    station_name: Optional[str]
    gap_start: datetime
    gap_end: datetime
    gap_hours: float
    variables_affected: List[str]


class DataGapsResponse(BaseModel):
    """Data gaps report."""
    gaps: List[DataGap]
    total_gaps: int
    total_gap_hours: float
    stations_with_gaps: int


class DataQualityIssue(BaseModel):
    """Data quality issue/anomaly."""
    station_id: int
    station_code: str
    timestamp: datetime
    variable: str
    value: Decimal
    issue_type: str  # outlier, impossible_value, suspicious_pattern
    details: str


class DataQualityResponse(BaseModel):
    """Data quality issues report."""
    issues: List[DataQualityIssue]
    total_issues: int
    by_type: Dict[str, int]
    by_station: Dict[str, int]


class DataOverviewResponse(BaseModel):
    """Combined data overview for dashboard."""
    weather: WeatherDataOverview
    climate: ClimateDataOverview
    recent_gaps: List[DataGap]
    recent_issues: List[DataQualityIssue]


# =============================================================================
# DAILY QC
# =============================================================================

class QcRunItem(BaseModel):
    """One invocation of the daily QC stage.

    `n_station_days` is NULL on the eight passes reconstructed by
    `backfill_qc_runs.py` — the denominator depended on what the rollup held at
    the time and is not recoverable. A null there means the row was rebuilt from
    its findings, not that the pass examined nothing.
    """
    run_id: str
    status: str                      # running | complete | aborted | failed
    started_at: datetime
    finished_at: Optional[datetime] = None
    window_start: date
    window_end: date
    n_station_days: Optional[int] = None
    n_findings: Optional[int] = None
    n_reject: Optional[int] = None
    n_flag: Optional[int] = None
    n_quarantined_rows: Optional[int] = None
    n_cleared_rows: Optional[int] = None
    n_late_enforced: Optional[int] = None
    reject_rate: Optional[float] = None
    max_reject_rate: Optional[float] = None
    reaggregated: Optional[bool] = None
    error: Optional[str] = None


class QcRunsResponse(BaseModel):
    runs: List[QcRunItem]
    total: int


class QcHealth(BaseModel):
    """Is the stage running at all — the question findings cannot answer."""
    status: str                      # healthy | stale | attention | unknown
    hours_since_last_run: Optional[float] = None
    expected_interval_hours: int
    n_runs: int
    n_complete: int
    n_aborted: int
    n_failed: int
    n_running: int
    # Opened but never closed, and old enough that it cannot still be going.
    # This is the signature of a killed pass.
    n_stuck: int
    last_run: Optional[QcRunItem] = None


class QcCoverageDay(BaseModel):
    """Whether a given day was ever inside a run's window."""
    date: date
    n_runs: int
    examined: bool


class QcCheckCount(BaseModel):
    check_name: str
    severity: str
    n: int
    n_stations: int


class QcOffender(BaseModel):
    """A station ranked by how OFTEN it trips, not by how many findings it has.

    One neighbour rejection is a thunderstorm; the same station on most of the
    days it was examined is a broken sensor, and that is a source problem the
    fit-time screen cannot fix.
    """
    station_id: int
    station_name: Optional[str] = None
    station_code: Optional[str] = None
    data_source: Optional[str] = None
    n_findings: int
    n_reject: int
    n_days: int
    n_days_examined: int
    trip_rate: float
    persistent: bool
    first_seen: date
    last_seen: date
    checks: List[str] = []


class QcSummaryResponse(BaseModel):
    window_start: date
    window_end: date
    days: int
    health: QcHealth
    coverage: List[QcCoverageDay]
    checks: List[QcCheckCount]
    # Registered checks that fired zero times in the window. Listed explicitly
    # so a check removed in a refactor cannot look like one that is passing.
    silent_checks: List[str] = []
    offenders: List[QcOffender]
    n_findings: int
    n_reject: int
    n_flag: int
    n_stations: int


class QcFindingItem(BaseModel):
    id: int
    station_id: int
    station_name: Optional[str] = None
    station_code: Optional[str] = None
    data_source: Optional[str] = None
    date: date
    variable: str
    check_name: str
    severity: str
    value: Optional[float] = None
    expected: Optional[float] = None
    detail: Optional[Dict[str, Any]] = None
    action: str
    run_id: Optional[str] = None
    created_at: datetime


class QcFindingsResponse(BaseModel):
    findings: List[QcFindingItem]
    total: int
    limit: int
    offset: int


# =============================================================================
# COMMON
# =============================================================================

class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
    success: bool = True