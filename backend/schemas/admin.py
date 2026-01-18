# schemas/admin.py - Admin Dashboard Pydantic Schemas
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
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
    """Admin update for user (limited fields)."""
    is_active: Optional[bool] = None
    notes: Optional[str] = None


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
# COMMON
# =============================================================================

class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
    success: bool = True