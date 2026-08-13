# app/api/v1/realtime_climate.py
"""
Realtime Climate Intelligence API endpoints.

Provides current season climate data, phenology estimates, and disease pressure
for vineyard regions based on daily weather station data.

Endpoints:
- /zones - List zones with current season data
- /current-season/{zone_slug} - Current season climate summary
- /gdd-progress/{zone_slug} - GDD accumulation vs baseline
- /phenology/{zone_slug} - Phenology estimates by variety
- /varieties - List varieties with GDD thresholds
- /disease-pressure/{zone_slug} - Disease risk indicators
- /regional-overview - All zones summary
"""

from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, and_, desc
from sqlalchemy.orm import Session, joinedload

from db.session import get_db
from db.models.wine_region import WineRegion
from db.models.climate import ClimateZone
from db.models.realtime_climate import (
    ClimateZoneDaily,
    ClimateZoneDailyBaseline,
    ClimateZoneHourly,
    PhenologyEstimate,
    PhenologyThreshold,
    DiseasePressure,
)
from schemas.realtime_climate import (
    ClimateZoneBrief,
    BaselineComparison,
    DailyClimateData,
    SeasonSummary,
    SeasonExtremes,
    CurrentSeasonResponse,
    SeasonProgressResponse,
    HourlyClimatePoint,
    HourlyClimateResponse,
    VarietyPhenology,
    PhenologyStage,
    PhenologyResponse,
    VarietyInfo,
    VarietiesListResponse,
    DiseaseRisk,
    DailyDiseasePressure,
    DiseasePressureResponse,
    ZoneClimateSnapshot,
    RegionalOverviewResponse,
    ZonesListResponse,
)

router = APIRouter(tags=["realtime-climate"])


# =============================================================================
# CONSTANTS
# =============================================================================

MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December"
}

STAGE_NAMES = {
    'dormant': 'Dormant',
    'budburst': 'Budburst',
    'pre_flowering': 'Pre-flowering',
    'flowering': 'Flowering',
    'fruit_set': 'Fruit Set',
    'veraison': 'Véraison',
    'ripening': 'Ripening',
    'harvest_ready': 'Harvest Ready',
}

DISEASE_NAMES = {
    'downy_mildew': 'Downy Mildew',
    'powdery_mildew': 'Powdery Mildew',
    'botrytis': 'Botrytis (Grey Rot)',
}

# GDD base options. Live daily GDD is derived from temp_mean so both bases are
# available without a stored base-10 column on climate_zone_daily.
GDD_BASES = {'base0': 0.0, 'base10': 10.0}
DEFAULT_GDD_BASE = 'base10'
FROST_THRESHOLD_C = 0.0       # Tmin <= 0C
HOT_DAY_THRESHOLD_C = 30.0    # Tmax > 30C
HEAVY_RAIN_THRESHOLD_MM = 25.0  # NIWA "heavy rain day"


def daily_gdd_from_mean(temp_mean, base_temp: float) -> float:
    """Daily GDD from a mean temperature for a given base (0 or 10)."""
    if temp_mean is None:
        return 0.0
    return max(0.0, float(temp_mean) - base_temp)


def baseline_daily_gdd_col(base_temp: float):
    """The matching daily baseline GDD column for a base."""
    if base_temp == 10.0:
        return ClimateZoneDailyBaseline.gdd_base10_avg
    return ClimateZoneDailyBaseline.gdd_base0_avg


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_zone_or_404(db: Session, slug: str) -> ClimateZone:
    """Get zone by slug or raise 404."""
    zone = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(ClimateZone.slug == slug).first()
    if not zone:
        raise HTTPException(status_code=404, detail=f"Climate zone '{slug}' not found")
    return zone


def to_decimal(value, places: int = 2) -> Optional[Decimal]:
    """Convert to Decimal with rounding, handle None."""
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)


def get_current_vintage_year(reference_date: date = None) -> int:
    """Get the current vintage year (July 1 - June 30 cycle)."""
    if reference_date is None:
        reference_date = date.today()
    if reference_date.month >= 7:
        return reference_date.year + 1
    return reference_date.year


def get_season_label(vintage_year: int) -> str:
    """Get season label like '2024/25' for vintage year 2025."""
    return f"{vintage_year - 1}/{str(vintage_year)[2:]}"


def get_season_start(vintage_year: int) -> date:
    """Get July 1 of the vintage year's start."""
    return date(vintage_year - 1, 7, 1)


def date_to_day_of_vintage(d: date) -> int:
    """Convert date to day-of-vintage (July 1 = day 1)."""
    if d.month >= 7:
        july_1 = date(d.year, 7, 1)
    else:
        july_1 = date(d.year - 1, 7, 1)
    return (d - july_1).days + 1


def get_zone_brief(zone: ClimateZone) -> ClimateZoneBrief:
    """Convert zone to brief schema."""
    return ClimateZoneBrief(
        id=zone.id,
        name=zone.name,
        slug=zone.slug,
        region_name=zone.region.name if zone.region else None
    )


def calc_baseline_comparison(current: Decimal, baseline: Decimal) -> BaselineComparison:
    """Calculate comparison between current and baseline values."""
    if current is None or baseline is None:
        return BaselineComparison(current_value=current, baseline_value=baseline)
    
    diff = current - baseline
    diff_pct = (diff / baseline * 100) if baseline != 0 else None
    
    if diff_pct is not None:
        if diff_pct > 5:
            status = 'ahead'
        elif diff_pct < -5:
            status = 'behind'
        else:
            status = 'normal'
    else:
        status = None
    
    return BaselineComparison(
        current_value=to_decimal(current),
        baseline_value=to_decimal(baseline),
        difference=to_decimal(diff),
        difference_pct=to_decimal(diff_pct, 1),
        status=status
    )


def get_baseline_gdd_for_day(db: Session, zone_id: int, day_of_vintage: int) -> Optional[Decimal]:
    """
    Get cumulative GDD baseline for a specific day of vintage, calculated from September 1.

    The baseline table stores GDD cumulative from July 1, but season metrics
    are calibrated from September 1 (Southern Hemisphere growing season start).
    This function adjusts by subtracting the GDD accumulated July 1 - August 31.

    Day of vintage: July 1 = day 1, August 31 = day 62, September 1 = day 63
    """
    # Get GDD at requested day
    baseline = db.query(ClimateZoneDailyBaseline).filter(
        ClimateZoneDailyBaseline.zone_id == zone_id,
        ClimateZoneDailyBaseline.day_of_vintage == day_of_vintage
    ).first()

    if not baseline or not baseline.gdd_base0_cumulative_avg:
        return None

    # Get GDD at August 31 (day 62) to subtract winter accumulation
    # Only adjust if we're past September 1 (day 63)
    if day_of_vintage >= 63:
        aug31_baseline = db.query(ClimateZoneDailyBaseline).filter(
            ClimateZoneDailyBaseline.zone_id == zone_id,
            ClimateZoneDailyBaseline.day_of_vintage == 62
        ).first()

        if aug31_baseline and aug31_baseline.gdd_base0_cumulative_avg:
            gdd_from_sep1 = Decimal(str(baseline.gdd_base0_cumulative_avg)) - Decimal(str(aug31_baseline.gdd_base0_cumulative_avg))
            return gdd_from_sep1

    # Before September 1, return 0 (growing season hasn't started)
    if day_of_vintage < 63:
        return Decimal('0')

    return Decimal(str(baseline.gdd_base0_cumulative_avg))


def get_aug31_gdd_offset(db: Session, zone_id: int) -> Decimal:
    """
    Get the GDD accumulated from July 1 to August 31 for a zone.

    This offset is subtracted from current season gdd_cumulative (which starts July 1)
    to get GDD from September 1 for season comparisons.
    """
    aug31_baseline = db.query(ClimateZoneDailyBaseline).filter(
        ClimateZoneDailyBaseline.zone_id == zone_id,
        ClimateZoneDailyBaseline.day_of_vintage == 62  # August 31
    ).first()

    if aug31_baseline and aug31_baseline.gdd_base0_cumulative_avg:
        return Decimal(str(aug31_baseline.gdd_base0_cumulative_avg))
    return Decimal('0')


def adjust_gdd_to_sep1(gdd_from_july1: Decimal, aug31_offset: Decimal, day_of_vintage: int) -> Decimal:
    """
    Adjust GDD cumulative from July 1 start to September 1 start.

    Returns 0 if before September 1 (day 63).
    """
    if gdd_from_july1 is None:
        return None
    if day_of_vintage < 63:
        return Decimal('0')
    return max(Decimal('0'), Decimal(str(gdd_from_july1)) - aug31_offset)


# =============================================================================
# ENDPOINTS: ZONES
# =============================================================================

@router.get("/zones", response_model=ZonesListResponse)
def list_zones_with_current_data(
    region_id: Optional[int] = Query(None, description="Filter by region ID"),
    db: Session = Depends(get_db)
):
    """
    List all climate zones that have current season data.
    
    Returns zones with real-time data available for the current vintage year.
    """
    vintage_year = get_current_vintage_year()
    
    query = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(ClimateZone.is_active == True)
    
    if region_id:
        query = query.filter(ClimateZone.region_id == region_id)
    
    # Only include zones that have data for current season
    zones_with_data = db.query(ClimateZoneDaily.zone_id).filter(
        ClimateZoneDaily.vintage_year == vintage_year
    ).distinct().subquery()
    
    query = query.filter(ClimateZone.id.in_(
        db.query(zones_with_data.c.zone_id)
    ))
    
    zones = query.order_by(ClimateZone.display_order).all()
    
    return ZonesListResponse(
        zones=[get_zone_brief(z) for z in zones],
        vintage_year=vintage_year
    )


# =============================================================================
# ENDPOINTS: CURRENT SEASON CLIMATE
# =============================================================================

@router.get("/current-season/{zone_slug}", response_model=CurrentSeasonResponse)
def get_current_season_climate(
    zone_slug: str,
    recent_days: int = Query(14, ge=1, le=90, description="Number of recent days to include"),
    base: str = Query(DEFAULT_GDD_BASE, description="GDD base: 'base10' (default) or 'base0'"),
    db: Session = Depends(get_db)
):
    """
    Get current season climate summary for a zone.
    
    Returns:
    - Season summary with GDD/rainfall totals and baseline comparisons
    - Recent daily data for charts/tables
    - Chart-ready data structure
    """
    zone = get_zone_or_404(db, zone_slug)
    vintage_year = get_current_vintage_year()
    
    # Get all data for current season
    season_data = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.zone_id == zone.id,
        ClimateZoneDaily.vintage_year == vintage_year
    ).order_by(ClimateZoneDaily.date.desc()).all()
    
    if not season_data:
        raise HTTPException(
            status_code=404, 
            detail=f"No current season data for zone '{zone_slug}'"
        )
    
    # Latest date with data
    latest_date = season_data[0].date
    season_start = get_season_start(vintage_year)  # July 1
    growing_season_start = date(vintage_year - 1, 9, 1)  # Sep 1
    days_into_season = max(0, (latest_date - growing_season_start).days + 1)
    doy = date_to_day_of_vintage(latest_date)

    base = base if base in GDD_BASES else DEFAULT_GDD_BASE
    base_temp = GDD_BASES[base]

    # Filter to growing season data only (Sep 1 onwards, day_of_vintage >= 63)
    growing_data = [d for d in season_data if d.date >= growing_season_start]

    # Season GDD total from Sep 1, derived from daily mean temp for the chosen
    # base (live table only stores base-0; deriving from temp_mean covers both).
    gdd_total = to_decimal(
        sum(daily_gdd_from_mean(d.temp_mean, base_temp) for d in growing_data)
    ) if doy >= 63 else to_decimal(Decimal('0'))

    rainfall_total = to_decimal(sum(float(d.rainfall_mm or 0) for d in growing_data))

    # Calculate averages from Sep 1 onwards
    temps = [float(d.temp_mean) for d in growing_data if d.temp_mean]
    temp_mean_avg = to_decimal(sum(temps) / len(temps)) if temps else None

    temps_max = [float(d.temp_max) for d in growing_data if d.temp_max]
    temp_max_avg = to_decimal(sum(temps_max) / len(temps_max)) if temps_max else None

    temps_min = [float(d.temp_min) for d in growing_data if d.temp_min]
    temp_min_avg = to_decimal(sum(temps_min) / len(temps_min)) if temps_min else None

    # Baseline cumulative GDD from Sep 1 (day 63) to current doy, matching base
    baseline_gdd = None
    if doy >= 63:
        baseline_gdd = db.query(func.sum(baseline_daily_gdd_col(base_temp))).filter(
            ClimateZoneDailyBaseline.zone_id == zone.id,
            ClimateZoneDailyBaseline.day_of_vintage >= 63,
            ClimateZoneDailyBaseline.day_of_vintage <= doy,
        ).scalar()

    # Threshold metrics (frost / hot days / extreme rainfall) over the season
    frost_days = [d for d in growing_data if d.temp_min is not None and float(d.temp_min) <= FROST_THRESHOLD_C]
    rain_days = [d for d in growing_data if d.rainfall_mm is not None]
    wettest = max(rain_days, key=lambda d: float(d.rainfall_mm), default=None)
    extremes = SeasonExtremes(
        last_frost_date=max((d.date for d in frost_days), default=None),
        frost_days_total=len(frost_days),
        early_frost_count=sum(1 for d in frost_days if d.date.month in (9, 10, 11)),
        hot_days_count=sum(
            1 for d in growing_data
            if d.temp_max is not None and float(d.temp_max) > HOT_DAY_THRESHOLD_C
        ),
        max_1day_rainfall=to_decimal(wettest.rainfall_mm) if wettest else None,
        max_1day_rainfall_date=wettest.date if wettest else None,
        heavy_rain_days_count=sum(
            1 for d in growing_data
            if d.rainfall_mm is not None and float(d.rainfall_mm) >= HEAVY_RAIN_THRESHOLD_MM
        ),
        heavy_rain_threshold_mm=Decimal(str(HEAVY_RAIN_THRESHOLD_MM)),
    )

    # Calculate baseline rainfall total (from Sep 1 = day 63)
    baseline_rain = db.query(
        func.sum(ClimateZoneDailyBaseline.rain_avg)
    ).filter(
        ClimateZoneDailyBaseline.zone_id == zone.id,
        ClimateZoneDailyBaseline.day_of_vintage >= 63,
        ClimateZoneDailyBaseline.day_of_vintage <= doy
    ).scalar()

    # Rainfall coverage: fraction of growing-season days with >=1 rain-reporting
    # station. Near-100% for council-gauged zones; very low for SYNOP/GHCNh-only
    # zones (hourly synoptic carries no precip), where rainfall reads artificially dry.
    rainfall_coverage_pct = to_decimal(
        round(100 * sum(1 for d in growing_data if (d.stations_with_rain or 0) > 0) / len(growing_data))
    ) if growing_data else None

    # Build season summary (season_start = Sep 1 growing season start)
    season_summary = SeasonSummary(
        vintage_year=vintage_year,
        label=get_season_label(vintage_year),
        season_start=growing_season_start,
        latest_data_date=latest_date,
        days_into_season=days_into_season,
        gdd_total=gdd_total,
        gdd_base=base,
        rainfall_total=rainfall_total,
        temp_mean_avg=temp_mean_avg,
        temp_max_avg=temp_max_avg,
        temp_min_avg=temp_min_avg,
        gdd_vs_baseline=calc_baseline_comparison(gdd_total, to_decimal(baseline_gdd)) if baseline_gdd else None,
        rainfall_vs_baseline=calc_baseline_comparison(rainfall_total, to_decimal(baseline_rain)) if baseline_rain else None,
        rainfall_coverage_pct=rainfall_coverage_pct,
        extremes=extremes,
    )
    
    # Get recent days data
    recent = season_data[:recent_days]
    recent_daily = [
        DailyClimateData(
            date=d.date,
            temp_min=to_decimal(d.temp_min),
            temp_max=to_decimal(d.temp_max),
            temp_mean=to_decimal(d.temp_mean),
            humidity_mean=to_decimal(d.humidity_mean),
            rainfall_mm=to_decimal(d.rainfall_mm),
            solar_radiation=to_decimal(d.solar_radiation),
            gdd_daily=to_decimal(d.gdd_daily),
            gdd_cumulative=to_decimal(d.gdd_cumulative),
            station_count=d.station_count,
            confidence=d.confidence,
        )
        for d in recent
    ]
    
    # Build chart data (chronological order)
    chart_data = {
        "daily": [
            {
                "date": str(d.date),
                "temp_min": float(d.temp_min) if d.temp_min else None,
                "temp_max": float(d.temp_max) if d.temp_max else None,
                "temp_mean": float(d.temp_mean) if d.temp_mean else None,
                "rainfall": float(d.rainfall_mm) if d.rainfall_mm else 0,
                "gdd_cumulative": float(d.gdd_cumulative) if d.gdd_cumulative else None,
            }
            for d in reversed(recent)
        ]
    }
    
    return CurrentSeasonResponse(
        zone=get_zone_brief(zone),
        season=season_summary,
        recent_days=recent_daily,
        chart_data=chart_data
    )


@router.get("/gdd-progress/{zone_slug}", response_model=SeasonProgressResponse)
def get_gdd_progress(
    zone_slug: str,
    vintage_year: Optional[int] = Query(None, description="Vintage year (default: current)"),
    base: str = Query(DEFAULT_GDD_BASE, description="GDD base: 'base10' (default) or 'base0'"),
    db: Session = Depends(get_db)
):
    """
    Get GDD accumulation progress compared to baseline.
    
    Returns daily GDD accumulation with baseline comparison for charts
    showing season progression and phenology milestones.
    """
    zone = get_zone_or_404(db, zone_slug)
    
    if vintage_year is None:
        vintage_year = get_current_vintage_year()
    
    # Get season data
    season_data = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.zone_id == zone.id,
        ClimateZoneDaily.vintage_year == vintage_year
    ).order_by(ClimateZoneDaily.date).all()
    
    if not season_data:
        raise HTTPException(
            status_code=404,
            detail=f"No data for vintage {vintage_year} in zone '{zone_slug}'"
        )
    
    # Get baseline data
    baseline_data = db.query(ClimateZoneDailyBaseline).filter(
        ClimateZoneDailyBaseline.zone_id == zone.id
    ).order_by(ClimateZoneDailyBaseline.day_of_vintage).all()
    baseline_by_doy = {b.day_of_vintage: b for b in baseline_data}
    
    base = base if base in GDD_BASES else DEFAULT_GDD_BASE
    base_temp = GDD_BASES[base]

    # Build cumulative GDD series from Sep 1 (day_of_vintage >= 63) for the chosen
    # base. Actual is derived from daily mean temp; baseline accumulates the daily
    # baseline average for the matching base. Both start at 0 on Sep 1.
    daily_data = []
    latest = season_data[-1]
    cum_actual = 0.0
    cum_baseline = 0.0
    cum_actual_base0 = 0.0  # phenology milestones are base-0 calibrated
    baseline_cum_by_doy = {}  # doy -> cumulative baseline from Sep 1

    for d in season_data:
        doy = date_to_day_of_vintage(d.date)
        baseline = baseline_by_doy.get(doy)

        if doy >= 63:
            cum_actual += daily_gdd_from_mean(d.temp_mean, base_temp)
            cum_actual_base0 += daily_gdd_from_mean(d.temp_mean, 0.0)
            gdd_baseline = None
            if baseline is not None:
                col = baseline.gdd_base10_avg if base_temp == 10.0 else baseline.gdd_base0_avg
                cum_baseline += float(col) if col is not None else 0.0
                baseline_cum_by_doy[doy] = cum_baseline
                gdd_baseline = round(cum_baseline, 1)
            daily_data.append({
                "date": str(d.date),
                "day_of_vintage": doy,
                "gdd_actual": round(cum_actual, 1),
                "gdd_baseline": gdd_baseline,
            })
        else:
            daily_data.append({
                "date": str(d.date),
                "day_of_vintage": doy,
                "gdd_actual": None,
                "gdd_baseline": None,
            })

    # Current position vs baseline
    current_doy = date_to_day_of_vintage(latest.date)
    current_gdd = Decimal(str(round(cum_actual, 2))) if current_doy >= 63 else Decimal('0')
    current_gdd_base0 = cum_actual_base0 if current_doy >= 63 else 0.0
    baseline_gdd = Decimal(str(round(cum_baseline, 2))) if (current_doy >= 63 and baseline_cum_by_doy) else None

    # Estimate days ahead/behind: the day whose baseline cumulative first reaches
    # the current actual GDD.
    days_vs_baseline = None
    if baseline_gdd and current_gdd:
        for doy in sorted(baseline_cum_by_doy.keys()):
            if baseline_cum_by_doy[doy] >= float(current_gdd):
                days_vs_baseline = current_doy - doy
                break

    # Get phenology milestones (default to Pinot Noir)
    # Thresholds are calibrated from September 1, so use adjusted current_gdd
    milestones = []
    thresholds = db.query(PhenologyThreshold).filter(
        PhenologyThreshold.variety_code == 'PN'
    ).first()
    
    if thresholds:
        milestone_defs = [
            ('Flowering', 'gdd_flowering'),
            ('Véraison', 'gdd_veraison'),
            ('Harvest (200g/L)', 'gdd_harvest_200')
        ]
        for stage, gdd_attr in milestone_defs:
            gdd_threshold = getattr(thresholds, gdd_attr)
            if gdd_threshold:
                milestones.append({
                    "name": stage,
                    "gdd_threshold": float(gdd_threshold),
                    "reached": current_gdd_base0 >= float(gdd_threshold),
                })

    return SeasonProgressResponse(
        zone=get_zone_brief(zone),
        vintage_year=vintage_year,
        label=get_season_label(vintage_year),
        gdd_base=base,
        current_date=latest.date,
        current_gdd=current_gdd,
        days_into_season=(latest.date - get_season_start(vintage_year)).days + 1,
        baseline_gdd_at_date=baseline_gdd,
        days_vs_baseline=days_vs_baseline,
        daily_data=daily_data,
        milestones=milestones,
    )


# =============================================================================
# ENDPOINTS: HOURLY CLIMATE
# =============================================================================

@router.get("/hourly/{zone_slug}", response_model=HourlyClimateResponse)
def get_hourly_climate(
    zone_slug: str,
    days: int = Query(10, ge=1, le=30, description="Days of hourly history (default 10)"),
    db: Session = Depends(get_db)
):
    """
    Hourly zone-aggregated climate for a recent window (default 10 days).

    Reads the pre-computed ``climate_zone_hourly`` table (the same source the
    disease models use), so no on-the-fly interpolation is needed.
    """
    zone = get_zone_or_404(db, zone_slug)

    # Anchor the window on the latest hour we actually have, not wall-clock now,
    # so the chart is never blank when ingestion lags.
    latest = db.query(func.max(ClimateZoneHourly.timestamp_local)).filter(
        ClimateZoneHourly.zone_id == zone.id
    ).scalar()

    if latest is None:
        return HourlyClimateResponse(zone=get_zone_brief(zone), days=days, points=[])

    cutoff = latest - timedelta(days=days)
    rows = db.query(ClimateZoneHourly).filter(
        ClimateZoneHourly.zone_id == zone.id,
        ClimateZoneHourly.timestamp_local > cutoff,
    ).order_by(ClimateZoneHourly.timestamp_local).all()

    points = [
        HourlyClimatePoint(
            timestamp=r.timestamp_local,
            temp_mean=to_decimal(r.temp_mean),
            temp_min=to_decimal(r.temp_min),
            temp_max=to_decimal(r.temp_max),
            rh_mean=to_decimal(r.rh_mean),
            precipitation=to_decimal(r.precipitation),
            is_wet_hour=r.is_wet_hour,
        )
        for r in rows
    ]

    return HourlyClimateResponse(
        zone=get_zone_brief(zone),
        days=days,
        start=rows[0].timestamp_local if rows else None,
        end=rows[-1].timestamp_local if rows else None,
        points=points,
    )


# =============================================================================
# ENDPOINTS: PHENOLOGY
# =============================================================================

@router.get("/varieties", response_model=VarietiesListResponse)
def list_varieties(db: Session = Depends(get_db)):
    """
    List all grape varieties with phenology thresholds.
    
    Returns GDD thresholds for flowering, véraison, and harvest stages.
    """
    varieties = db.query(PhenologyThreshold).filter(
        PhenologyThreshold.is_active == True
    ).order_by(PhenologyThreshold.variety_name).all()
    
    return VarietiesListResponse(
        varieties=[
            VarietyInfo(
                variety_code=v.variety_code,
                variety_name=v.variety_name,
                gdd_flowering=float(v.gdd_flowering) if v.gdd_flowering else None,
                gdd_veraison=float(v.gdd_veraison) if v.gdd_veraison else None,
                gdd_harvest_170=float(v.gdd_harvest_170) if v.gdd_harvest_170 else None,
                gdd_harvest_200=float(v.gdd_harvest_200) if v.gdd_harvest_200 else None,
                gdd_harvest_220=float(v.gdd_harvest_220) if v.gdd_harvest_220 else None,
            )
            for v in varieties
        ]
    )


@router.get("/phenology/{zone_slug}", response_model=PhenologyResponse)
def get_phenology_estimates(
    zone_slug: str,
    varieties: Optional[str] = Query(None, description="Comma-separated variety codes (default: all)"),
    db: Session = Depends(get_db)
):
    """
    Get phenology estimates for a zone by variety.
    
    Returns current stage, GDD accumulation, and predicted dates
    for flowering, véraison, and harvest at various sugar levels.
    """
    zone = get_zone_or_404(db, zone_slug)
    vintage_year = get_current_vintage_year()
    
    # Get latest estimates
    query = db.query(PhenologyEstimate).filter(
        PhenologyEstimate.zone_id == zone.id,
        PhenologyEstimate.vintage_year == vintage_year
    )
    
    if varieties:
        variety_list = [v.strip().upper() for v in varieties.split(',')]
        query = query.filter(PhenologyEstimate.variety_code.in_(variety_list))
    
    # Get the most recent estimate date
    latest_date = db.query(func.max(PhenologyEstimate.estimate_date)).filter(
        PhenologyEstimate.zone_id == zone.id,
        PhenologyEstimate.vintage_year == vintage_year
    ).scalar()
    
    if not latest_date:
        raise HTTPException(
            status_code=404,
            detail=f"No phenology data for zone '{zone_slug}'"
        )
    
    estimates = query.filter(PhenologyEstimate.estimate_date == latest_date).all()
    
    # Get variety names
    thresholds = {t.variety_code: t for t in db.query(PhenologyThreshold).all()}
    
    # Build response
    variety_results = []
    today = date.today()
    
    for est in estimates:
        threshold = thresholds.get(est.variety_code)
        variety_name = threshold.variety_name if threshold else est.variety_code
        
        # Get current GDD to determine if stages are actual (reached) vs predicted
        current_gdd = float(est.gdd_accumulated) if est.gdd_accumulated else 0
        
        # Build stages list
        stages = []
        
        # Flowering - check if GDD has passed flowering threshold
        flowering_threshold = float(threshold.gdd_flowering) if threshold and threshold.gdd_flowering else None
        flowering_is_actual = flowering_threshold is not None and current_gdd >= flowering_threshold
        
        stages.append(PhenologyStage(
            stage_name='Flowering',
            gdd_threshold=to_decimal(threshold.gdd_flowering) if threshold else None,
            predicted_date=est.flowering_date,
            is_actual=flowering_is_actual,
            days_from_now=(est.flowering_date - today).days if est.flowering_date and est.flowering_date > today else None,
        ))
        
        # Note: Véraison removed - unreliable predictions pending better calibration data
        # Will be re-added when regional véraison GDD thresholds are validated
        
        # Harvest stages
        harvest_levels = [
            (170, 'harvest_170', 'Harvest (170g/L - 16 Brix)'),
            (180, 'harvest_180', 'Harvest (180g/L - 16.9 Brix)'),
            (190, 'harvest_190', 'Harvest (190g/L - 17.8 Brix)'),
            (200, 'harvest_200', 'Harvest (200g/L - 18.6 Brix)'),
            (210, 'harvest_210', 'Harvest (210g/L - 19.5 Brix)'),
            (220, 'harvest_220', 'Harvest (220g/L - 20.3 Brix)'),
        ]
        
        for sugar, attr, label in harvest_levels:
            harvest_date = getattr(est, f'{attr}_date', None)
            gdd_threshold = getattr(threshold, f'gdd_{attr}', None) if threshold else None
            harvest_threshold_val = float(gdd_threshold) if gdd_threshold else None
            is_harvest_actual = harvest_threshold_val is not None and current_gdd >= harvest_threshold_val
            
            stages.append(PhenologyStage(
                stage_name=label,
                gdd_threshold=to_decimal(gdd_threshold) if gdd_threshold else None,
                predicted_date=harvest_date,
                is_actual=is_harvest_actual,
                days_from_now=(harvest_date - today).days if harvest_date and harvest_date > today else None,
            ))
        
        # Calculate progress percentage (toward typical harvest ~200g/L)
        progress = None
        if threshold and threshold.gdd_harvest_200 and est.gdd_accumulated:
            progress = min(100, (float(est.gdd_accumulated) / float(threshold.gdd_harvest_200)) * 100)
        
        variety_results.append(VarietyPhenology(
            variety_code=est.variety_code,
            variety_name=variety_name,
            current_stage=est.current_stage or 'unknown',
            gdd_accumulated=to_decimal(est.gdd_accumulated),
            stages=stages,
            season_progress_pct=to_decimal(progress) if progress else None,
        ))
    
    return PhenologyResponse(
        zone=get_zone_brief(zone),
        vintage_year=vintage_year,
        estimate_date=latest_date,
        varieties=variety_results,
    )


# =============================================================================
# ENDPOINTS: DISEASE PRESSURE
# =============================================================================

@router.get("/disease-pressure/{zone_slug}", response_model=DiseasePressureResponse)
def get_disease_pressure(
    zone_slug: str,
    recent_days: int = Query(14, ge=1, le=30, description="Number of recent days"),
    db: Session = Depends(get_db)
):
    """
    Get disease pressure indicators for a zone.
    
    Returns current and recent disease risk levels with contributing
    factors and spray recommendations based on validated scientific models:
    - Powdery Mildew: UC Davis Risk Index
    - Botrytis: González-Domínguez mechanistic model
    - Downy Mildew: 3-10 primary model + Goidanich Index
    """
    zone = get_zone_or_404(db, zone_slug)
    
    # Get recent disease pressure data
    pressure_data = db.query(DiseasePressure).filter(
        DiseasePressure.zone_id == zone.id
    ).order_by(DiseasePressure.date.desc()).limit(recent_days).all()
    
    if not pressure_data:
        raise HTTPException(
            status_code=404,
            detail=f"No disease pressure data for zone '{zone_slug}'"
        )
    
    # Build response
    def build_daily_pressure(p: DiseasePressure) -> DailyDiseasePressure:
        diseases = []
        risk_factors = p.risk_factors or {}
        
        for disease_key, disease_name in DISEASE_NAMES.items():
            risk_attr = f"{disease_key}_risk"
            risk_level = getattr(p, risk_attr, 'low') or 'low'
            
            # Get disease-specific factors and descriptions
            # Key in risk_factors may be 'powdery', 'botrytis', 'downy'
            factor_key = disease_key.replace('_mildew', '').replace('_', '')
            factors = risk_factors.get(factor_key, {})
            
            score = factors.get('score') or risk_factors.get('scores', {}).get(factor_key)
            description = factors.get('description', f'{disease_name} risk is {risk_level}')
            spray_rec = factors.get('spray_recommendation', '')
            
            diseases.append(DiseaseRisk(
                disease=disease_key,
                risk_level=risk_level,
                score=score,
                description=description,
                contributing_factors=factors if factors else None,
                spray_recommendation=spray_rec if spray_rec else None,
            ))
        
        # Determine overall risk
        risk_order = {'low': 0, 'moderate': 1, 'high': 2, 'extreme': 3}
        overall = max(
            (d.risk_level for d in diseases),
            key=lambda x: risk_order.get(x, 0),
            default='low'
        )
        
        return DailyDiseasePressure(
            date=p.date,
            overall_risk=overall,
            diseases=diseases,
            recommendations=p.recommendations,
            humidity_available=p.humidity_available or False,
        )
    
    current = build_daily_pressure(pressure_data[0])
    recent = [build_daily_pressure(p) for p in pressure_data]
    
    # Build chart data (chronological order)
    chart_data = {
        "daily": [
            {
                "date": str(p.date),
                "downy_mildew": p.risk_factors.get('scores', {}).get('downy') if p.risk_factors else None,
                "powdery_mildew": p.risk_factors.get('scores', {}).get('powdery') if p.risk_factors else None,
                "botrytis": p.risk_factors.get('scores', {}).get('botrytis') if p.risk_factors else None,
            }
            for p in reversed(pressure_data)
        ]
    }
    
    return DiseasePressureResponse(
        zone=get_zone_brief(zone),
        latest_date=pressure_data[0].date,
        current_pressure=current,
        recent_days=recent,
        chart_data=chart_data,
    )


# =============================================================================
# ENDPOINTS: REGIONAL OVERVIEW
# =============================================================================

@router.get("/regional-overview", response_model=RegionalOverviewResponse)
def get_regional_overview(
    region_id: Optional[int] = Query(None, description="Filter by region ID"),
    db: Session = Depends(get_db)
):
    """
    Get overview of all zones with current climate status.
    
    Returns a snapshot of GDD progress, disease risk, and phenology
    status for each zone in the region.
    """
    vintage_year = get_current_vintage_year()
    
    # Get region info
    if region_id:
        region = db.query(WineRegion).filter(WineRegion.id == region_id).first()
        if not region:
            raise HTTPException(status_code=404, detail="Region not found")
        region_name = region.name
    else:
        region_name = "All Regions"
    
    # Get all active zones
    zone_query = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(ClimateZone.is_active == True)
    
    if region_id:
        zone_query = zone_query.filter(ClimateZone.region_id == region_id)
    
    zones = zone_query.order_by(ClimateZone.display_order).all()
    
    # Get latest climate data for each zone
    snapshots = []
    all_gdds = []
    latest_date = None
    
    for zone in zones:
        # Get latest climate data
        latest = db.query(ClimateZoneDaily).filter(
            ClimateZoneDaily.zone_id == zone.id,
            ClimateZoneDaily.vintage_year == vintage_year
        ).order_by(ClimateZoneDaily.date.desc()).first()
        
        if not latest:
            continue
        
        if latest_date is None or latest.date > latest_date:
            latest_date = latest.date
        
        # Get actual September 30 GDD offset for this zone
        doy = date_to_day_of_vintage(latest.date)
        
        # Query for Sept 30 actual GDD for this zone
        aug31_actual = db.query(ClimateZoneDaily).filter(
            ClimateZoneDaily.zone_id == zone.id,
            ClimateZoneDaily.vintage_year == vintage_year,
            ClimateZoneDaily.date <= date(vintage_year - 1, 8, 31)
        ).order_by(ClimateZoneDaily.date.desc()).first()

        actual_aug31_offset = Decimal(str(aug31_actual.gdd_cumulative)) if aug31_actual and aug31_actual.gdd_cumulative else Decimal('0')

        # Adjust actual GDD to September 1 start
        actual_gdd_adjusted = None
        if latest.gdd_cumulative and doy >= 63:
            actual_gdd_adjusted = max(Decimal('0'), Decimal(str(latest.gdd_cumulative)) - actual_aug31_offset)
        
        # Get baseline for comparison (already adjusted to Sep 1)
        baseline_gdd = get_baseline_gdd_for_day(db, zone.id, doy)
        
        gdd_vs_baseline_pct = None
        if baseline_gdd and actual_gdd_adjusted:
            diff = float(actual_gdd_adjusted) - float(baseline_gdd)
            gdd_vs_baseline_pct = to_decimal((diff / float(baseline_gdd)) * 100, 1) if baseline_gdd != 0 else None
        
        # Get disease risk
        disease = db.query(DiseasePressure).filter(
            DiseasePressure.zone_id == zone.id
        ).order_by(DiseasePressure.date.desc()).first()
        
        disease_risk = None
        if disease:
            risk_order = {'low': 0, 'moderate': 1, 'high': 2, 'extreme': 3}
            risks = [disease.downy_mildew_risk, disease.powdery_mildew_risk, disease.botrytis_risk]
            disease_risk = max((r for r in risks if r), key=lambda x: risk_order.get(x, 0), default='low')
        
        # Get current phenology stage (for default variety - Pinot Noir)
        phenology = db.query(PhenologyEstimate).filter(
            PhenologyEstimate.zone_id == zone.id,
            PhenologyEstimate.vintage_year == vintage_year,
            PhenologyEstimate.variety_code == 'PN'
        ).order_by(PhenologyEstimate.estimate_date.desc()).first()
        
        current_stage = phenology.current_stage if phenology else None
        
        # Calculate days to veraison
        days_to_veraison = None
        if phenology and phenology.veraison_date:
            days_diff = (phenology.veraison_date - date.today()).days
            if days_diff > 0:
                days_to_veraison = days_diff
        
        # Use adjusted GDD for display and stats
        gdd_val = float(actual_gdd_adjusted) if actual_gdd_adjusted else None
        if gdd_val:
            all_gdds.append((zone.name, gdd_val))
        
        snapshots.append(ZoneClimateSnapshot(
            zone_id=zone.id,
            zone_name=zone.name,
            zone_slug=zone.slug,
            region_name=zone.region.name if zone.region else None,
            latest_date=latest.date,
            gdd_cumulative=to_decimal(actual_gdd_adjusted) if actual_gdd_adjusted else None,
            gdd_vs_baseline_pct=gdd_vs_baseline_pct,
            disease_risk_overall=disease_risk,
            current_stage=current_stage,
            days_to_veraison=days_to_veraison,
            # Straight off `latest`, which is already loaded above. No extra query.
            temp_min=latest.temp_min,
            temp_max=latest.temp_max,
            temp_mean=latest.temp_mean,
            rainfall_mm=latest.rainfall_mm,
            confidence=latest.confidence,
            station_count=latest.station_count,
        ))
    
    # Calculate region stats
    avg_gdd = to_decimal(sum(g[1] for g in all_gdds) / len(all_gdds)) if all_gdds else None
    min_gdd_zone = min(all_gdds, key=lambda x: x[1])[0] if all_gdds else None
    max_gdd_zone = max(all_gdds, key=lambda x: x[1])[0] if all_gdds else None
    
    return RegionalOverviewResponse(
        region_name=region_name,
        vintage_year=vintage_year,
        latest_data_date=latest_date or date.today(),
        zones=snapshots,
        avg_gdd=avg_gdd,
        min_gdd_zone=min_gdd_zone,
        max_gdd_zone=max_gdd_zone,
    )