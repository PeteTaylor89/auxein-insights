# app/schemas/public_climate.py
"""
Pydantic schemas for Climate API responses.
"""

from datetime import date
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# =============================================================================
# BASE SCHEMAS
# =============================================================================

class ClimateValue(BaseModel):
    """Single climate metric with mean and standard deviation."""
    mean: Optional[Decimal] = None
    sd: Optional[Decimal] = None


class BaselineComparison(BaseModel):
    """Comparison of a value to baseline."""
    value: Decimal
    baseline: Decimal
    diff: Decimal = Field(..., description="Absolute difference from baseline")
    diff_pct: Decimal = Field(..., description="Percentage difference from baseline")


# =============================================================================
# ZONE SCHEMAS
# =============================================================================

class ClimateZoneBrief(BaseModel):
    """Brief zone info for lists."""
    id: int
    name: str
    slug: str
    region_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class ClimateZoneDetail(BaseModel):
    """Full zone details."""
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    region_id: Optional[int] = None
    region_name: Optional[str] = None
    region_slug: Optional[str] = None
    
    class Config:
        from_attributes = True


class RegionWithZones(BaseModel):
    """Wine region with its climate zones."""
    id: int
    name: str
    slug: str
    zones: List[ClimateZoneBrief] = []
    
    class Config:
        from_attributes = True


# =============================================================================
# BASELINE SCHEMAS
# =============================================================================

class MonthlyBaseline(BaseModel):
    """Baseline values for a single month."""
    month: int
    month_name: str
    tmean: Optional[Decimal] = None
    tmax: Optional[Decimal] = None
    tmin: Optional[Decimal] = None
    rain: Optional[Decimal] = None
    gdd: Optional[Decimal] = None


class SeasonBaseline(BaseModel):
    """Aggregated baseline for growing season (Oct-Apr)."""
    period: str = "1986-2005"
    gdd_total: Optional[Decimal] = None
    rain_total: Optional[Decimal] = None
    tmean_avg: Optional[Decimal] = None
    tmax_avg: Optional[Decimal] = None
    tmin_avg: Optional[Decimal] = None


class ZoneBaseline(BaseModel):
    """Complete baseline data for a zone."""
    zone: ClimateZoneBrief
    period: str = "1986-2005"
    monthly: List[MonthlyBaseline] = []
    season: SeasonBaseline


# =============================================================================
# HISTORY SCHEMAS
# =============================================================================

class MonthlyHistory(BaseModel):
    """Monthly climate history record."""
    date: date
    month: int
    year: int
    vintage_year: int
    tmean: ClimateValue
    tmin: ClimateValue
    tmax: ClimateValue
    gdd: ClimateValue
    rain: ClimateValue
    solar: ClimateValue


class HistoryResponse(BaseModel):
    """Response for zone history endpoint."""
    zone: ClimateZoneBrief
    data: List[MonthlyHistory] = []
    metadata: Dict[str, Any] = {}


# =============================================================================
# SEASON SCHEMAS
# =============================================================================

class SeasonVsBaseline(BaseModel):
    """Season metrics compared to baseline."""
    gdd_diff: Optional[Decimal] = None
    gdd_pct: Optional[Decimal] = None
    rain_diff: Optional[Decimal] = None
    rain_pct: Optional[Decimal] = None
    tmean_diff: Optional[Decimal] = None


class SeasonRanking(BaseModel):
    """Where this season ranks historically."""
    metric: str
    rank: int
    total_years: int
    percentile: Decimal
    label: str  # e.g., "3rd warmest"


class SeasonSummary(BaseModel):
    """Summary for a single growing season."""
    vintage_year: int
    season_label: str  # e.g., "2023/24"
    gdd_total: Optional[Decimal] = None
    rain_total: Optional[Decimal] = None
    tmean_avg: Optional[Decimal] = None
    tmax_avg: Optional[Decimal] = None
    tmin_avg: Optional[Decimal] = None
    solar_total: Optional[Decimal] = None
    vs_baseline: Optional[SeasonVsBaseline] = None
    rankings: Optional[List[SeasonRanking]] = None


class SeasonsResponse(BaseModel):
    """Response for zone seasons endpoint."""
    zone: ClimateZoneBrief
    baseline: SeasonBaseline
    seasons: List[SeasonSummary] = []


# =============================================================================
# PROJECTION SCHEMAS
# =============================================================================

class SSPScenario(BaseModel):
    """SSP scenario metadata."""
    code: str  # SSP126, SSP245, SSP370
    name: str  # "SSP1-2.6 (Sustainability)"
    description: Optional[str] = None


class ProjectionPeriod(BaseModel):
    """Projection time period metadata."""
    code: str  # 2021_2040, 2041_2060, 2080_2099
    name: str  # "Mid-century (2041-2060)"
    start_year: int
    end_year: int


class MonthlyProjection(BaseModel):
    """Projected values for a single month."""
    month: int
    month_name: str
    baseline: Dict[str, Optional[Decimal]]  # tmean, tmax, tmin, rain, gdd
    delta: Dict[str, Optional[Decimal]]  # Change from baseline
    delta_sd: Dict[str, Optional[Decimal]]  # Uncertainty
    projected: Dict[str, Optional[Decimal]]  # Absolute projected values


class SeasonProjectionSummary(BaseModel):
    """Projected season summary (Oct-Apr aggregated)."""
    gdd_baseline: Optional[Decimal] = None
    gdd_projected: Optional[Decimal] = None
    gdd_change: Optional[Decimal] = None
    gdd_change_pct: Optional[Decimal] = None
    rain_baseline: Optional[Decimal] = None
    rain_projected: Optional[Decimal] = None
    rain_change_pct: Optional[Decimal] = None
    tmean_change: Optional[Decimal] = None


class ScenarioPeriodProjection(BaseModel):
    """Projections for one SSP scenario and time period."""
    scenario: SSPScenario
    period: ProjectionPeriod
    monthly: List[MonthlyProjection] = []
    season_summary: Optional[SeasonProjectionSummary] = None


class ProjectionsResponse(BaseModel):
    """Response for zone projections endpoint."""
    zone: ClimateZoneBrief
    baseline_period: str = "1986-2005"
    projections: List[ScenarioPeriodProjection] = []


# =============================================================================
# COMPARISON SCHEMAS
# =============================================================================

class SeasonComparisonItem(BaseModel):
    """Single season in a comparison."""
    vintage_year: int
    label: str
    gdd_total: Optional[Decimal] = None
    rain_total: Optional[Decimal] = None
    tmean_avg: Optional[Decimal] = None
    vs_baseline: Optional[SeasonVsBaseline] = None


class SeasonsCompareResponse(BaseModel):
    """Response for comparing multiple seasons."""
    zone: ClimateZoneBrief
    baseline: SeasonBaseline
    seasons: List[SeasonComparisonItem] = []
    chart_data: Optional[Dict[str, Any]] = None  # Monthly breakdown for charts


class ZoneComparisonItem(BaseModel):
    """Single zone in a comparison."""
    zone_id: int
    zone_name: str
    zone_slug: str
    region_name: Optional[str] = None
    value: Optional[Decimal] = None
    vs_baseline: Optional[Decimal] = None  # Percentage difference


class ZonesCompareResponse(BaseModel):
    """Response for comparing multiple zones."""
    metric: str
    metric_label: str
    vintage_year: Optional[int] = None  # None = baseline comparison
    comparison_type: str  # "season" or "baseline"
    zones: List[ZoneComparisonItem] = []
    chart_data: Optional[Dict[str, Any]] = None


# =============================================================================
# LIST RESPONSES
# =============================================================================

class RegionsListResponse(BaseModel):
    """Response for regions list endpoint."""
    regions: List[RegionWithZones] = []


class ZonesListResponse(BaseModel):
    """Response for zones list endpoint."""
    zones: List[ClimateZoneDetail] = []