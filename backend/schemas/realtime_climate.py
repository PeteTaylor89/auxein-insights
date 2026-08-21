# app/schemas/realtime_climate.py
"""
Pydantic schemas for Realtime Climate Intelligence API.

Provides response models for:
- Current season climate data with GDD tracking
- Phenology estimates with harvest predictions
- Disease pressure indicators
- Baseline comparisons
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# =============================================================================
# COMMON SCHEMAS (reuse ClimateZoneBrief from public_climate if preferred)
# =============================================================================

class ClimateZoneBrief(BaseModel):
    """Brief zone info for list responses."""
    id: int
    name: str
    slug: str
    region_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class BaselineComparison(BaseModel):
    """Comparison of current values vs baseline."""
    current_value: Optional[Decimal] = None
    baseline_value: Optional[Decimal] = None
    difference: Optional[Decimal] = None
    difference_pct: Optional[Decimal] = None
    status: Optional[str] = None  # 'ahead', 'behind', 'normal'


# =============================================================================
# CURRENT SEASON CLIMATE
# =============================================================================

class DailyClimateData(BaseModel):
    """Single day's climate data for a zone."""
    date: date
    temp_min: Optional[Decimal] = None
    temp_max: Optional[Decimal] = None
    temp_mean: Optional[Decimal] = None
    humidity_mean: Optional[Decimal] = None
    rainfall_mm: Optional[Decimal] = None
    solar_radiation: Optional[Decimal] = None
    gdd_daily: Optional[Decimal] = None
    gdd_cumulative: Optional[Decimal] = None
    station_count: Optional[int] = None
    confidence: Optional[str] = None


class SeasonExtremes(BaseModel):
    """Season-to-date threshold metrics derived from daily data."""
    # Frost (Tmin <= 0C)
    last_frost_date: Optional[date] = None  # most recent frost in the growing season
    frost_days_total: int = 0
    early_frost_count: int = 0  # frost days in Sept-Nov
    # Heat (Tmax > 30C)
    hot_days_count: int = 0
    # Rainfall
    max_1day_rainfall: Optional[Decimal] = None
    max_1day_rainfall_date: Optional[date] = None
    heavy_rain_days_count: int = 0  # days >= heavy_rain_threshold_mm
    heavy_rain_threshold_mm: Decimal = Decimal('25')


class SeasonSummary(BaseModel):
    """Summary of current growing season to date."""
    vintage_year: int
    label: str  # e.g., "2024/25"
    season_start: date  # July 1
    latest_data_date: date
    days_into_season: int

    # Accumulated totals
    gdd_total: Optional[Decimal] = None
    gdd_base: str = 'base10'  # which GDD base the totals/comparison use
    rainfall_total: Optional[Decimal] = None

    # Averages
    temp_mean_avg: Optional[Decimal] = None
    temp_max_avg: Optional[Decimal] = None
    temp_min_avg: Optional[Decimal] = None

    # Baseline comparison
    gdd_vs_baseline: Optional[BaselineComparison] = None
    rainfall_vs_baseline: Optional[BaselineComparison] = None

    # Fraction of growing-season days that had at least one rain-reporting
    # station. Low for SYNOP/GHCNh-only zones (hourly synoptic carries no
    # precip), where the rainfall total/baseline read artificially dry.
    rainfall_coverage_pct: Optional[Decimal] = None

    # Threshold metrics (frost / hot days / extreme rainfall)
    extremes: Optional[SeasonExtremes] = None


class CurrentSeasonResponse(BaseModel):
    """Response for current season climate data."""
    zone: ClimateZoneBrief
    season: SeasonSummary
    recent_days: List[DailyClimateData]
    chart_data: Optional[Dict[str, Any]] = None


class SeasonProgressResponse(BaseModel):
    """GDD accumulation progress through the season."""
    zone: ClimateZoneBrief
    vintage_year: int
    label: str
    gdd_base: str = 'base10'  # which GDD base the daily series uses

    # Current position
    current_date: date
    current_gdd: Decimal
    days_into_season: int
    
    # Comparison points
    baseline_gdd_at_date: Optional[Decimal] = None
    days_vs_baseline: Optional[int] = None
    
    # Time series for chart
    daily_data: List[Dict[str, Any]]
    
    # Key milestones
    milestones: List[Dict[str, Any]]


# =============================================================================
# HOURLY CLIMATE (10-day window)
# =============================================================================

class HourlyClimatePoint(BaseModel):
    """A single hour of zone-aggregated climate data."""
    timestamp: datetime  # local time
    temp_mean: Optional[Decimal] = None
    temp_min: Optional[Decimal] = None
    temp_max: Optional[Decimal] = None
    rh_mean: Optional[Decimal] = None
    precipitation: Optional[Decimal] = None
    is_wet_hour: Optional[bool] = None


class HourlyClimateResponse(BaseModel):
    """Hourly climate series for a zone over a recent window."""
    zone: ClimateZoneBrief
    days: int
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    points: List[HourlyClimatePoint]


# =============================================================================
# PHENOLOGY
# =============================================================================

class PhenologyStage(BaseModel):
    """Details for a single phenological stage."""
    stage_name: str
    gdd_threshold: Optional[Decimal] = None
    predicted_date: Optional[date] = None
    is_actual: bool = False
    days_from_now: Optional[int] = None
    baseline_date: Optional[date] = None
    days_vs_baseline: Optional[int] = None
    # Why `predicted_date` is or is not populated: observed, projected,
    # no_basis, beyond_season, not_modelled. See `services/phenology_basis` —
    # before a season starts the model projects flowering into April and harvest
    # into the following year, so a null date here is frequently a WITHHELD one
    # rather than a missing one, and a client needs to be able to tell them
    # apart to word its empty state honestly.
    status: Optional[str] = None


class VarietyPhenology(BaseModel):
    """Phenology data for a single variety."""
    variety_code: str
    variety_name: str
    current_stage: str
    gdd_accumulated: Optional[Decimal] = None
    stages: List[PhenologyStage]
    season_progress_pct: Optional[Decimal] = None


class PhenologyResponse(BaseModel):
    """Phenology data for a zone."""
    zone: ClimateZoneBrief
    vintage_year: int
    estimate_date: date
    varieties: List[VarietyPhenology]


class VarietyInfo(BaseModel):
    """Variety with phenology thresholds."""
    variety_code: str
    variety_name: str
    gdd_flowering: Optional[float] = None
    gdd_veraison: Optional[float] = None
    gdd_harvest_170: Optional[float] = None
    gdd_harvest_200: Optional[float] = None
    gdd_harvest_220: Optional[float] = None


class VarietiesListResponse(BaseModel):
    """List of varieties with phenology thresholds."""
    varieties: List[VarietyInfo]


# =============================================================================
# DISEASE PRESSURE
# =============================================================================

class DiseaseRisk(BaseModel):
    """Risk assessment for a single disease."""
    disease: str
    risk_level: str
    score: Optional[int] = None
    description: str
    contributing_factors: Optional[Dict[str, Any]] = None
    spray_recommendation: Optional[str] = None


class DailyDiseasePressure(BaseModel):
    """Disease pressure for a single day."""
    date: date
    overall_risk: str
    diseases: List[DiseaseRisk]
    recommendations: Optional[str] = None
    humidity_available: bool = False


class DiseasePressureResponse(BaseModel):
    """Disease pressure data for a zone."""
    zone: ClimateZoneBrief
    latest_date: date
    current_pressure: DailyDiseasePressure
    recent_days: List[DailyDiseasePressure]
    chart_data: Optional[Dict[str, Any]] = None


# =============================================================================
# REGIONAL OVERVIEW
# =============================================================================

class ZoneClimateSnapshot(BaseModel):
    """Snapshot of climate conditions for one zone."""
    zone_id: int
    zone_name: str
    zone_slug: str
    region_name: Optional[str] = None
    latest_date: date
    gdd_cumulative: Optional[Decimal] = None
    gdd_vs_baseline_pct: Optional[Decimal] = None
    disease_risk_overall: Optional[str] = None
    current_stage: Optional[str] = None
    days_to_veraison: Optional[int] = None

    # Latest observed conditions. These come off the same ClimateZoneDaily row
    # the GDD figures already use, so they cost no extra query — the row was
    # simply not being surfaced. They are what the Insights home page needs to
    # answer "where is warmest right now" without N per-zone requests.
    #
    # None means the zone has no reading for that variable on its latest date.
    # It NEVER means zero — a zone with no rain gauge is not a dry zone (B4.1).
    temp_min: Optional[Decimal] = None
    temp_max: Optional[Decimal] = None
    temp_mean: Optional[Decimal] = None
    rainfall_mm: Optional[Decimal] = None
    # 'high' | 'medium' | 'low' — how well-observed the zone was that day.
    confidence: Optional[str] = None
    station_count: Optional[int] = None


class RegionalOverviewResponse(BaseModel):
    """Overview of all zones in a region."""
    region_name: str
    vintage_year: int
    latest_data_date: date
    zones: List[ZoneClimateSnapshot]
    avg_gdd: Optional[Decimal] = None
    min_gdd_zone: Optional[str] = None
    max_gdd_zone: Optional[str] = None


class ZonesListResponse(BaseModel):
    """List of climate zones with current season info."""
    zones: List[ClimateZoneBrief]
    vintage_year: int

# =============================================================================
# LIVE STATION EXTREMES (home page "National Pulse")
# =============================================================================

class LiveStationExtreme(BaseModel):
    """
    One headline reading, traced back to the single station that produced it.

    Every field the home page prints is here, including the station's own name
    and the moment it reported. A national extreme with no attribution is a
    marketing figure; with the station and the timestamp it is a measurement.
    """
    key: str                              # warmest | coldest | wettest
    label: str
    value: Decimal
    unit: str
    station_id: int
    station_name: str
    station_region: Optional[str] = None
    # Present only when the station falls inside a wine climate zone. Most do
    # not — the network is national — and the tile must not invent a link.
    zone_slug: Optional[str] = None
    zone_name: Optional[str] = None
    observed_at: datetime
    # The basis for THIS reading, per tile, because the tiles are not on one
    # clock. Temperature is a state read from a short window; rainfall is a
    # total accumulated over a long one. A single response-level window would
    # be a lie about one of them.
    window_hours: int


class LiveExtremesResponse(BaseModel):
    """
    The live half of the home page stat strip.

    `window_hours` is not decoration. "Coldest" over a 24 hour window is an
    overnight low, which is the number a grower cares about; the same word
    applied to the latest reading at 2pm would be a different and far less
    useful claim. The window has to travel with the number so the copy can say
    which one it is.
    """
    generated_at: datetime
    # The newest observation anywhere in the network. This is the "live" stamp,
    # and it is deliberately NOT any tile's `observed_at`.
    network_latest_at: Optional[datetime] = None
    # Distinct stations that reported anything. Counted from the database on
    # every refresh — it is a live figure, not a fixed claim about network size,
    # and it moves as councils report. A shorter window was tried and
    # abandoned: ingestion is hourly, so under about three hours it swings by
    # hundreds between calls (784 then 483, eleven minutes apart).
    reporting_stations: int
    reporting_window_hours: int
    # Offshore territories are excluded — Raoul Island, the Chathams and the
    # subantarctic islands. They are in the network but they are not weather a
    # New Zealand grower can use, and Raoul took the national high every day.
    mainland_only: bool = True
    extremes: List[LiveStationExtreme]
