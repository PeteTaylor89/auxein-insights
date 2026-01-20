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


class SeasonSummary(BaseModel):
    """Summary of current growing season to date."""
    vintage_year: int
    label: str  # e.g., "2024/25"
    season_start: date  # July 1
    latest_data_date: date
    days_into_season: int
    
    # Accumulated totals
    gdd_total: Optional[Decimal] = None
    rainfall_total: Optional[Decimal] = None
    
    # Averages
    temp_mean_avg: Optional[Decimal] = None
    temp_max_avg: Optional[Decimal] = None
    temp_min_avg: Optional[Decimal] = None
    
    # Baseline comparison
    gdd_vs_baseline: Optional[BaselineComparison] = None
    rainfall_vs_baseline: Optional[BaselineComparison] = None


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