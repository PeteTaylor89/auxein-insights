# app/api/v1/public_climate.py
"""
Public Climate API endpoints for Regional Intelligence.

Provides access to:
- Climate zones and regions
- Historical monthly climate data (1987-2023)
- 1986-2005 baseline data
- SSP climate projections (2021-2099)
- Season comparisons and zone comparisons
"""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, case, and_, desc
from sqlalchemy.orm import Session, joinedload

from db.session import get_db
from db.models.wine_region import WineRegion
from db.models.climate import (
    ClimateZone,
    ClimateHistoryMonthly,
    ClimateBaselineMonthly,
    ClimateProjection,
)
from schemas.public_climate import (
    RegionsListResponse,
    RegionWithZones,
    ZonesListResponse,
    ClimateZoneBrief,
    ClimateZoneDetail,
    ZoneBaseline,
    MonthlyBaseline,
    SeasonBaseline,
    HistoryResponse,
    MonthlyHistory,
    ClimateValue,
    SeasonsResponse,
    SeasonSummary,
    SeasonVsBaseline,
    SeasonRanking,
    ProjectionsResponse,
    ScenarioPeriodProjection,
    SSPScenario,
    ProjectionPeriod,
    MonthlyProjection,
    SeasonProjectionSummary,
    SeasonsCompareResponse,
    SeasonComparisonItem,
    ZonesCompareResponse,
    ZoneComparisonItem,
)

router = APIRouter(tags=["public_climate"])

# =============================================================================
# CONSTANTS
# =============================================================================

MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December"
}

GROWING_SEASON_MONTHS = [10, 11, 12, 1, 2, 3, 4]  # Oct-Apr

# Truncated seasons to exclude from queries (incomplete data)
# 1986 = 85/86 season (missing Oct-Dec 1985)
# 2024 = 23/24 season (incomplete/current season)
EXCLUDED_VINTAGE_YEARS = [1986, 2024]

SSP_SCENARIOS = {
    "SSP126": SSPScenario(
        code="SSP126",
        name="SSP1-2.6 (Sustainability)",
        description="Low emissions scenario with strong mitigation"
    ),
    "SSP245": SSPScenario(
        code="SSP245",
        name="SSP2-4.5 (Middle of the road)",
        description="Intermediate emissions scenario"
    ),
    "SSP370": SSPScenario(
        code="SSP370",
        name="SSP3-7.0 (Regional rivalry)",
        description="High emissions scenario with limited mitigation"
    ),
}

PROJECTION_PERIODS = {
    "2021_2040": ProjectionPeriod(code="2021_2040", name="Near-term (2021-2040)", start_year=2021, end_year=2040),
    "2041_2060": ProjectionPeriod(code="2041_2060", name="Mid-century (2041-2060)", start_year=2041, end_year=2060),
    "2080_2099": ProjectionPeriod(code="2080_2099", name="End of century (2080-2099)", start_year=2080, end_year=2099),
}

METRIC_LABELS = {
    "gdd": "Growing Degree Days",
    "rain": "Rainfall (mm)",
    "tmean": "Mean Temperature (°C)",
    "tmax": "Max Temperature (°C)",
    "tmin": "Min Temperature (°C)",
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_zone_or_404(db: Session, slug: str) -> ClimateZone:
    """Get zone by slug or raise 404."""
    zone = db.query(ClimateZone).filter(ClimateZone.slug == slug).first()
    if not zone:
        raise HTTPException(status_code=404, detail=f"Climate zone '{slug}' not found")
    return zone


def to_decimal(value, places: int = 2) -> Optional[Decimal]:
    """Convert to Decimal with rounding, handle None."""
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)


def calc_pct_diff(value: Decimal, baseline: Decimal) -> Optional[Decimal]:
    """Calculate percentage difference from baseline."""
    if baseline is None or baseline == 0 or value is None:
        return None
    return to_decimal(((value - baseline) / baseline) * 100, 1)


def get_season_label(vintage_year: int) -> str:
    """Get season label like '2023/24' for vintage year 2024."""
    return f"{vintage_year - 1}/{str(vintage_year)[2:]}"


def get_zone_brief(zone: ClimateZone) -> ClimateZoneBrief:
    """Convert zone to brief schema."""
    return ClimateZoneBrief(
        id=zone.id,
        name=zone.name,
        slug=zone.slug,
        region_name=zone.region.name if zone.region else None
    )


def calculate_season_baseline(db: Session, zone_id: int) -> SeasonBaseline:
    """Calculate growing season baseline from monthly baseline data."""
    baseline_months = db.query(ClimateBaselineMonthly).filter(
        ClimateBaselineMonthly.zone_id == zone_id,
        ClimateBaselineMonthly.month.in_(GROWING_SEASON_MONTHS)
    ).all()
    
    if not baseline_months:
        return SeasonBaseline()
    
    gdd_total = sum(m.gdd or 0 for m in baseline_months)
    rain_total = sum(m.rain or 0 for m in baseline_months)
    tmean_avg = sum(m.tmean or 0 for m in baseline_months) / len(baseline_months)
    tmax_avg = sum(m.tmax or 0 for m in baseline_months) / len(baseline_months)
    tmin_avg = sum(m.tmin or 0 for m in baseline_months) / len(baseline_months)
    
    return SeasonBaseline(
        gdd_total=to_decimal(gdd_total),
        rain_total=to_decimal(rain_total),
        tmean_avg=to_decimal(tmean_avg),
        tmax_avg=to_decimal(tmax_avg),
        tmin_avg=to_decimal(tmin_avg),
    )


# =============================================================================
# ENDPOINTS: REGIONS & ZONES
# =============================================================================

@router.get("/regions", response_model=RegionsListResponse)
def list_regions(db: Session = Depends(get_db)):
    """
    List all wine regions with their climate zones.
    
    Returns regions that have at least one climate zone.
    """
    # Get regions that have climate zones
    regions = db.query(WineRegion).join(
        ClimateZone, ClimateZone.region_id == WineRegion.id
    ).distinct().order_by(WineRegion.display_order).all()
    
    result = []
    for region in regions:
        zones = db.query(ClimateZone).filter(
            ClimateZone.region_id == region.id,
            ClimateZone.is_active == True
        ).order_by(ClimateZone.display_order).all()
        
        result.append(RegionWithZones(
            id=region.id,
            name=region.name,
            slug=region.slug,
            zones=[ClimateZoneBrief(
                id=z.id,
                name=z.name,
                slug=z.slug,
                region_name=region.name
            ) for z in zones]
        ))
    
    return RegionsListResponse(regions=result)


@router.get("/zones", response_model=ZonesListResponse)
def list_zones(db: Session = Depends(get_db)):
    """List all climate zones."""
    zones = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(
        ClimateZone.is_active == True
    ).order_by(ClimateZone.display_order).all()
    
    return ZonesListResponse(zones=[
        ClimateZoneDetail(
            id=z.id,
            name=z.name,
            slug=z.slug,
            description=z.description,
            region_id=z.region_id,
            region_name=z.region.name if z.region else None,
            region_slug=z.region.slug if z.region else None,
        ) for z in zones
    ])


@router.get("/zones/{slug}", response_model=ClimateZoneDetail)
def get_zone(slug: str, db: Session = Depends(get_db)):
    """Get details for a specific climate zone."""
    zone = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(ClimateZone.slug == slug).first()
    
    if not zone:
        raise HTTPException(status_code=404, detail=f"Climate zone '{slug}' not found")
    
    return ClimateZoneDetail(
        id=zone.id,
        name=zone.name,
        slug=zone.slug,
        description=zone.description,
        region_id=zone.region_id,
        region_name=zone.region.name if zone.region else None,
        region_slug=zone.region.slug if zone.region else None,
    )


# =============================================================================
# ENDPOINTS: BASELINE
# =============================================================================

@router.get("/zones/{slug}/baseline", response_model=ZoneBaseline)
def get_zone_baseline(slug: str, db: Session = Depends(get_db)):
    """
    Get 1986-2005 baseline climate data for a zone.
    
    Returns monthly baseline values and aggregated growing season baseline.
    """
    zone = get_zone_or_404(db, slug)
    
    # Get monthly baseline
    baseline_records = db.query(ClimateBaselineMonthly).filter(
        ClimateBaselineMonthly.zone_id == zone.id
    ).order_by(ClimateBaselineMonthly.month).all()
    
    monthly = [
        MonthlyBaseline(
            month=b.month,
            month_name=MONTH_NAMES[b.month],
            tmean=b.tmean,
            tmax=b.tmax,
            tmin=b.tmin,
            rain=b.rain,
            gdd=b.gdd,
        ) for b in baseline_records
    ]
    
    # Calculate season baseline
    season = calculate_season_baseline(db, zone.id)
    
    return ZoneBaseline(
        zone=get_zone_brief(zone),
        monthly=monthly,
        season=season,
    )


# =============================================================================
# ENDPOINTS: HISTORY
# =============================================================================

@router.get("/zones/{slug}/history", response_model=HistoryResponse)
def get_zone_history(
    slug: str,
    start_year: Optional[int] = Query(None, description="Start year (calendar year)"),
    end_year: Optional[int] = Query(None, description="End year (calendar year)"),
    vintage_year: Optional[int] = Query(None, description="Filter to single vintage year"),
    months: Optional[str] = Query(None, description="Comma-separated months (e.g., '10,11,12,1,2,3,4' for growing season)"),
    db: Session = Depends(get_db)
):
    """
    Get monthly climate history for a zone.
    
    Filter options:
    - start_year/end_year: Calendar year range
    - vintage_year: Single growing season (Oct-Apr)
    - months: Specific months only
    """
    zone = get_zone_or_404(db, slug)
    
    # Validate no truncated season requested
    if vintage_year and vintage_year in EXCLUDED_VINTAGE_YEARS:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot retrieve truncated season {vintage_year}. This season has incomplete data."
        )
    
    query = db.query(ClimateHistoryMonthly).filter(
        ClimateHistoryMonthly.zone_id == zone.id
    )
    
    # Apply filters
    if vintage_year:
        query = query.filter(ClimateHistoryMonthly.vintage_year == vintage_year)
    else:
        if start_year:
            query = query.filter(ClimateHistoryMonthly.year >= start_year)
        if end_year:
            query = query.filter(ClimateHistoryMonthly.year <= end_year)
    
    if months:
        month_list = [int(m.strip()) for m in months.split(",")]
        query = query.filter(ClimateHistoryMonthly.month.in_(month_list))
    
    records = query.order_by(ClimateHistoryMonthly.date).all()
    
    data = [
        MonthlyHistory(
            date=r.date,
            month=r.month,
            year=r.year,
            vintage_year=r.vintage_year,
            tmean=ClimateValue(mean=r.tmean_mean, sd=r.tmean_sd),
            tmin=ClimateValue(mean=r.tmin_mean, sd=r.tmin_sd),
            tmax=ClimateValue(mean=r.tmax_mean, sd=r.tmax_sd),
            gdd=ClimateValue(mean=r.gdd_mean, sd=r.gdd_sd),
            rain=ClimateValue(mean=r.rain_mean, sd=r.rain_sd),
            solar=ClimateValue(mean=r.solar_mean, sd=r.solar_sd),
        ) for r in records
    ]
    
    # Metadata
    metadata = {
        "total_records": len(data),
        "filters_applied": {
            "vintage_year": vintage_year,
            "start_year": start_year,
            "end_year": end_year,
            "months": months,
        }
    }
    if data:
        metadata["date_range"] = {
            "start": str(data[0].date),
            "end": str(data[-1].date),
        }
    
    return HistoryResponse(
        zone=get_zone_brief(zone),
        data=data,
        metadata=metadata,
    )


# =============================================================================
# ENDPOINTS: SEASONS
# =============================================================================

@router.get("/zones/{slug}/seasons", response_model=SeasonsResponse)
def get_zone_seasons(
    slug: str,
    start_vintage: Optional[int] = Query(None, description="Start vintage year"),
    end_vintage: Optional[int] = Query(None, description="End vintage year"),
    limit: Optional[int] = Query(None, description="Limit number of seasons (most recent)"),
    db: Session = Depends(get_db)
):
    """
    Get growing season summaries for a zone with baseline comparisons.
    
    Each season is Oct-Apr aggregated with GDD total, rainfall total, and temp averages.
    Includes comparison to 1986-2005 baseline.
    Excludes truncated seasons (85/86 and 23/24).
    """
    zone = get_zone_or_404(db, slug)
    
    # Get baseline
    baseline = calculate_season_baseline(db, zone.id)
    
    # Get available vintage years (excluding truncated seasons)
    vintage_query = db.query(
        ClimateHistoryMonthly.vintage_year
    ).filter(
        ClimateHistoryMonthly.zone_id == zone.id,
        ClimateHistoryMonthly.month.in_(GROWING_SEASON_MONTHS),
        ~ClimateHistoryMonthly.vintage_year.in_(EXCLUDED_VINTAGE_YEARS)
    ).distinct()
    
    if start_vintage:
        vintage_query = vintage_query.filter(ClimateHistoryMonthly.vintage_year >= start_vintage)
    if end_vintage:
        vintage_query = vintage_query.filter(ClimateHistoryMonthly.vintage_year <= end_vintage)
    
    vintage_query = vintage_query.order_by(desc(ClimateHistoryMonthly.vintage_year))
    
    if limit:
        vintage_query = vintage_query.limit(limit)
    
    vintage_years = [v[0] for v in vintage_query.all()]
    
    # Build season summaries
    seasons = []
    all_gdd_totals = []  # For ranking
    
    # Get all seasons for ranking calculation (excluding truncated)
    all_vintages = db.query(
        ClimateHistoryMonthly.vintage_year,
        func.sum(ClimateHistoryMonthly.gdd_mean).label('gdd_total')
    ).filter(
        ClimateHistoryMonthly.zone_id == zone.id,
        ClimateHistoryMonthly.month.in_(GROWING_SEASON_MONTHS),
        ~ClimateHistoryMonthly.vintage_year.in_(EXCLUDED_VINTAGE_YEARS)
    ).group_by(ClimateHistoryMonthly.vintage_year).all()
    
    gdd_ranking = sorted([(v.vintage_year, float(v.gdd_total or 0)) for v in all_vintages], 
                         key=lambda x: x[1], reverse=True)
    
    for vintage_year in vintage_years:
        # Get season data
        season_data = db.query(ClimateHistoryMonthly).filter(
            ClimateHistoryMonthly.zone_id == zone.id,
            ClimateHistoryMonthly.vintage_year == vintage_year,
            ClimateHistoryMonthly.month.in_(GROWING_SEASON_MONTHS)
        ).all()
        
        if not season_data:
            continue
        
        # Aggregate
        gdd_total = to_decimal(sum(r.gdd_mean or 0 for r in season_data))
        rain_total = to_decimal(sum(r.rain_mean or 0 for r in season_data))
        solar_total = to_decimal(sum(r.solar_mean or 0 for r in season_data))
        tmean_avg = to_decimal(sum(r.tmean_mean or 0 for r in season_data) / len(season_data))
        tmax_avg = to_decimal(sum(r.tmax_mean or 0 for r in season_data) / len(season_data))
        tmin_avg = to_decimal(sum(r.tmin_mean or 0 for r in season_data) / len(season_data))
        
        # Compare to baseline
        vs_baseline = None
        if baseline.gdd_total:
            vs_baseline = SeasonVsBaseline(
                gdd_diff=to_decimal(gdd_total - baseline.gdd_total) if gdd_total else None,
                gdd_pct=calc_pct_diff(gdd_total, baseline.gdd_total) if gdd_total else None,
                rain_diff=to_decimal(rain_total - baseline.rain_total) if rain_total and baseline.rain_total else None,
                rain_pct=calc_pct_diff(rain_total, baseline.rain_total) if rain_total and baseline.rain_total else None,
                tmean_diff=to_decimal(tmean_avg - baseline.tmean_avg) if tmean_avg and baseline.tmean_avg else None,
            )
        
        # Calculate GDD ranking
        rankings = []
        if gdd_total:
            rank = next((i + 1 for i, (vy, gdd) in enumerate(gdd_ranking) if vy == vintage_year), None)
            if rank:
                total_years = len(gdd_ranking)
                percentile = to_decimal(((total_years - rank + 1) / total_years) * 100, 0)
                suffix = {1: "st", 2: "nd", 3: "rd"}.get(rank if rank < 20 else rank % 10, "th")
                label = f"{rank}{suffix} warmest" if rank <= total_years / 2 else f"{total_years - rank + 1}{suffix} coolest"
                rankings.append(SeasonRanking(
                    metric="gdd",
                    rank=rank,
                    total_years=total_years,
                    percentile=percentile,
                    label=label
                ))
        
        seasons.append(SeasonSummary(
            vintage_year=vintage_year,
            season_label=get_season_label(vintage_year),
            gdd_total=gdd_total,
            rain_total=rain_total,
            tmean_avg=tmean_avg,
            tmax_avg=tmax_avg,
            tmin_avg=tmin_avg,
            solar_total=solar_total,
            vs_baseline=vs_baseline,
            rankings=rankings if rankings else None,
        ))
    
    return SeasonsResponse(
        zone=get_zone_brief(zone),
        baseline=baseline,
        seasons=seasons,
    )


# =============================================================================
# ENDPOINTS: PROJECTIONS
# =============================================================================

@router.get("/zones/{slug}/projections", response_model=ProjectionsResponse)
def get_zone_projections(
    slug: str,
    ssp: Optional[str] = Query(None, description="SSP scenario (SSP126, SSP245, SSP370) or 'all'"),
    period: Optional[str] = Query(None, description="Time period (2021_2040, 2041_2060, 2080_2099) or 'all'"),
    db: Session = Depends(get_db)
):
    """
    Get climate projections for a zone.
    
    Returns projected changes by SSP scenario and time period,
    with monthly breakdown and growing season summary.
    """
    zone = get_zone_or_404(db, slug)
    
    query = db.query(ClimateProjection).filter(ClimateProjection.zone_id == zone.id)
    
    # Filter by SSP
    if ssp and ssp.lower() != "all":
        ssp_upper = ssp.upper()
        if ssp_upper not in SSP_SCENARIOS:
            raise HTTPException(status_code=400, detail=f"Invalid SSP scenario. Valid: {list(SSP_SCENARIOS.keys())}")
        query = query.filter(ClimateProjection.ssp == ssp_upper)
    
    # Filter by period
    if period and period.lower() != "all":
        if period not in PROJECTION_PERIODS:
            raise HTTPException(status_code=400, detail=f"Invalid period. Valid: {list(PROJECTION_PERIODS.keys())}")
        query = query.filter(ClimateProjection.period == period)
    
    records = query.order_by(ClimateProjection.ssp, ClimateProjection.period, ClimateProjection.month).all()
    
    # Get baseline for reference
    baseline_records = {
        b.month: b for b in db.query(ClimateBaselineMonthly).filter(
            ClimateBaselineMonthly.zone_id == zone.id
        ).all()
    }
    
    # Group by SSP and period
    grouped = {}
    for r in records:
        key = (r.ssp, r.period)
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(r)
    
    projections = []
    for (ssp_code, period_code), month_records in grouped.items():
        monthly = []
        season_gdd_baseline = Decimal(0)
        season_gdd_projected = Decimal(0)
        season_rain_baseline = Decimal(0)
        season_rain_projected = Decimal(0)
        season_tmean_deltas = []
        
        for r in sorted(month_records, key=lambda x: x.month):
            baseline = baseline_records.get(r.month)
            
            monthly.append(MonthlyProjection(
                month=r.month,
                month_name=MONTH_NAMES[r.month],
                baseline={
                    "tmean": baseline.tmean if baseline else None,
                    "tmax": baseline.tmax if baseline else None,
                    "tmin": baseline.tmin if baseline else None,
                    "rain": baseline.rain if baseline else None,
                    "gdd": r.gdd_baseline,
                },
                delta={
                    "tmean": r.tmean_delta,
                    "tmax": r.tmax_delta,
                    "tmin": r.tmin_delta,
                    "rain": r.rain_delta,
                },
                delta_sd={
                    "tmean": r.tmean_delta_sd,
                    "tmax": r.tmax_delta_sd,
                    "tmin": r.tmin_delta_sd,
                    "rain": r.rain_delta_sd,
                },
                projected={
                    "tmean": r.tmean_projected,
                    "tmax": r.tmax_projected,
                    "tmin": r.tmin_projected,
                    "rain": r.rain_projected,
                    "gdd": r.gdd_projected,
                },
            ))
            
            # Accumulate season totals
            if r.month in GROWING_SEASON_MONTHS:
                season_gdd_baseline += r.gdd_baseline or 0
                season_gdd_projected += r.gdd_projected or 0
                season_rain_baseline += baseline.rain if baseline else 0
                season_rain_projected += r.rain_projected or 0
                if r.tmean_delta:
                    season_tmean_deltas.append(r.tmean_delta)
        
        # Calculate season summary
        season_summary = SeasonProjectionSummary(
            gdd_baseline=to_decimal(season_gdd_baseline),
            gdd_projected=to_decimal(season_gdd_projected),
            gdd_change=to_decimal(season_gdd_projected - season_gdd_baseline),
            gdd_change_pct=calc_pct_diff(season_gdd_projected, season_gdd_baseline),
            rain_baseline=to_decimal(season_rain_baseline),
            rain_projected=to_decimal(season_rain_projected),
            rain_change_pct=calc_pct_diff(season_rain_projected, season_rain_baseline),
            tmean_change=to_decimal(sum(season_tmean_deltas) / len(season_tmean_deltas)) if season_tmean_deltas else None,
        )
        
        projections.append(ScenarioPeriodProjection(
            scenario=SSP_SCENARIOS[ssp_code],
            period=PROJECTION_PERIODS[period_code],
            monthly=monthly,
            season_summary=season_summary,
        ))
    
    return ProjectionsResponse(
        zone=get_zone_brief(zone),
        projections=projections,
    )


# =============================================================================
# ENDPOINTS: COMPARISONS
# =============================================================================

@router.get("/compare/seasons", response_model=SeasonsCompareResponse)
def compare_seasons(
    zone: str = Query(..., description="Zone slug"),
    vintages: str = Query(..., description="Comma-separated vintage years (e.g., '2020,2022,2023')"),
    include_baseline: bool = Query(True, description="Include baseline in comparison"),
    db: Session = Depends(get_db)
):
    """
    Compare multiple growing seasons for a single zone.
    
    Returns side-by-side metrics and chart-ready monthly data.
    """
    zone_obj = get_zone_or_404(db, zone)
    vintage_list = [int(v.strip()) for v in vintages.split(",")]
    
    if len(vintage_list) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 vintages can be compared")
    
    # Validate no truncated seasons requested
    invalid_vintages = [v for v in vintage_list if v in EXCLUDED_VINTAGE_YEARS]
    if invalid_vintages:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot compare truncated seasons: {invalid_vintages}. These seasons have incomplete data."
        )
    
    baseline = calculate_season_baseline(db, zone_obj.id)
    
    seasons = []
    chart_data = {"monthly": []}
    
    # Initialize chart data structure
    for month in GROWING_SEASON_MONTHS:
        chart_data["monthly"].append({
            "month": month,
            "month_name": MONTH_NAMES[month],
            "baseline_gdd": None,
        })
    
    # Add baseline to chart data
    if include_baseline:
        baseline_months = db.query(ClimateBaselineMonthly).filter(
            ClimateBaselineMonthly.zone_id == zone_obj.id,
            ClimateBaselineMonthly.month.in_(GROWING_SEASON_MONTHS)
        ).all()
        baseline_by_month = {b.month: b for b in baseline_months}
        for item in chart_data["monthly"]:
            b = baseline_by_month.get(item["month"])
            if b:
                item["baseline_gdd"] = float(b.gdd) if b.gdd else None
    
    for vintage_year in vintage_list:
        # Get season data
        season_data = db.query(ClimateHistoryMonthly).filter(
            ClimateHistoryMonthly.zone_id == zone_obj.id,
            ClimateHistoryMonthly.vintage_year == vintage_year,
            ClimateHistoryMonthly.month.in_(GROWING_SEASON_MONTHS)
        ).all()
        
        if not season_data:
            continue
        
        gdd_total = to_decimal(sum(r.gdd_mean or 0 for r in season_data))
        rain_total = to_decimal(sum(r.rain_mean or 0 for r in season_data))
        tmean_avg = to_decimal(sum(r.tmean_mean or 0 for r in season_data) / len(season_data))
        
        vs_baseline = None
        if baseline.gdd_total and gdd_total:
            vs_baseline = SeasonVsBaseline(
                gdd_diff=to_decimal(gdd_total - baseline.gdd_total),
                gdd_pct=calc_pct_diff(gdd_total, baseline.gdd_total),
                rain_diff=to_decimal(rain_total - baseline.rain_total) if rain_total and baseline.rain_total else None,
                rain_pct=calc_pct_diff(rain_total, baseline.rain_total) if rain_total and baseline.rain_total else None,
                tmean_diff=to_decimal(tmean_avg - baseline.tmean_avg) if tmean_avg and baseline.tmean_avg else None,
            )
        
        seasons.append(SeasonComparisonItem(
            vintage_year=vintage_year,
            label=get_season_label(vintage_year),
            gdd_total=gdd_total,
            rain_total=rain_total,
            tmean_avg=tmean_avg,
            vs_baseline=vs_baseline,
        ))
        
        # Add to chart data
        data_by_month = {r.month: r for r in season_data}
        for item in chart_data["monthly"]:
            r = data_by_month.get(item["month"])
            if r:
                item[f"{vintage_year}_gdd"] = float(r.gdd_mean) if r.gdd_mean else None
    
    return SeasonsCompareResponse(
        zone=get_zone_brief(zone_obj),
        baseline=baseline,
        seasons=seasons,
        chart_data=chart_data,
    )


@router.get("/compare/zones", response_model=ZonesCompareResponse)
def compare_zones(
    zones: str = Query(..., description="Comma-separated zone slugs (max 5)"),
    metric: str = Query("gdd", description="Metric to compare: gdd, rain, tmean, tmax, tmin"),
    vintage_year: Optional[int] = Query(None, description="Vintage year (omit for baseline comparison)"),
    db: Session = Depends(get_db)
):
    """
    Compare multiple zones for a specific metric.
    
    Can compare either a specific vintage year or baseline values.
    """
    zone_slugs = [z.strip() for z in zones.split(",")]
    
    if len(zone_slugs) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 zones can be compared")
    
    if metric not in METRIC_LABELS:
        raise HTTPException(status_code=400, detail=f"Invalid metric. Valid: {list(METRIC_LABELS.keys())}")
    
    # Validate no truncated season requested
    if vintage_year and vintage_year in EXCLUDED_VINTAGE_YEARS:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot compare truncated season {vintage_year}. This season has incomplete data."
        )
    
    # Get zones
    zone_objs = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(ClimateZone.slug.in_(zone_slugs)).all()
    
    if len(zone_objs) != len(zone_slugs):
        found = {z.slug for z in zone_objs}
        missing = [s for s in zone_slugs if s not in found]
        raise HTTPException(status_code=404, detail=f"Zones not found: {missing}")
    
    comparison_items = []
    chart_data = {"monthly": []}
    
    # Initialize chart structure
    for month in GROWING_SEASON_MONTHS:
        chart_data["monthly"].append({
            "month": month,
            "month_name": MONTH_NAMES[month],
        })
    
    for zone_obj in zone_objs:
        # Get baseline for comparison reference
        baseline = calculate_season_baseline(db, zone_obj.id)
        baseline_value = getattr(baseline, f"{metric}_total" if metric in ["gdd", "rain"] else f"{metric}_avg", None)
        
        if vintage_year:
            # Get season data for specific vintage
            season_data = db.query(ClimateHistoryMonthly).filter(
                ClimateHistoryMonthly.zone_id == zone_obj.id,
                ClimateHistoryMonthly.vintage_year == vintage_year,
                ClimateHistoryMonthly.month.in_(GROWING_SEASON_MONTHS)
            ).all()
            
            if season_data:
                if metric in ["gdd", "rain", "solar"]:
                    value = to_decimal(sum(getattr(r, f"{metric}_mean") or 0 for r in season_data))
                else:
                    value = to_decimal(sum(getattr(r, f"{metric}_mean") or 0 for r in season_data) / len(season_data))
                
                vs_baseline = calc_pct_diff(value, baseline_value) if baseline_value else None
                
                # Add to chart data
                data_by_month = {r.month: r for r in season_data}
                for item in chart_data["monthly"]:
                    r = data_by_month.get(item["month"])
                    if r:
                        item[zone_obj.slug] = float(getattr(r, f"{metric}_mean")) if getattr(r, f"{metric}_mean") else None
            else:
                value = None
                vs_baseline = None
        else:
            # Use baseline values
            value = baseline_value
            vs_baseline = None
            
            # Add baseline to chart data
            baseline_months = db.query(ClimateBaselineMonthly).filter(
                ClimateBaselineMonthly.zone_id == zone_obj.id,
                ClimateBaselineMonthly.month.in_(GROWING_SEASON_MONTHS)
            ).all()
            data_by_month = {b.month: b for b in baseline_months}
            for item in chart_data["monthly"]:
                b = data_by_month.get(item["month"])
                if b:
                    item[zone_obj.slug] = float(getattr(b, metric)) if getattr(b, metric) else None
        
        comparison_items.append(ZoneComparisonItem(
            zone_id=zone_obj.id,
            zone_name=zone_obj.name,
            zone_slug=zone_obj.slug,
            region_name=zone_obj.region.name if zone_obj.region else None,
            value=value,
            vs_baseline=vs_baseline,
        ))
    
    # Sort by value descending
    comparison_items.sort(key=lambda x: x.value or 0, reverse=True)
    
    return ZonesCompareResponse(
        metric=metric,
        metric_label=METRIC_LABELS[metric],
        vintage_year=vintage_year,
        comparison_type="season" if vintage_year else "baseline",
        zones=comparison_items,
        chart_data=chart_data,
    )