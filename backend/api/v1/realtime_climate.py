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
- /live-extremes - Warmest/coldest/wettest station right now, from raw obs
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response
import logging
import time
from functools import lru_cache

from sqlalchemy import func, and_, desc, text, bindparam
from sqlalchemy.orm import Session, joinedload

from db.session import get_db, SessionLocal
from core import scope as scope_mod
from services import insights_site_baseline
from services import phenology_basis
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
    LiveStationExtreme,
    LiveExtremesResponse,
)

logger = logging.getLogger(__name__)

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
    country: Optional[str] = Query(None, description="ISO2, defaults to NZ"),
    industry: Optional[str] = Query(None, description="Industry key, defaults to wine"),
    db: Session = Depends(get_db)
):
    """
    List all climate zones that have current season data.

    Returns zones with real-time data available for the current vintage year.
    This is the COVERAGE list, not the full zone list — 14 of 23 zones have
    `climate_zone_daily` rows, so a caller that needs every region (a dropdown,
    a sitemap) must use `/public/public_climate/zones` and mark the rest as
    uncovered rather than assume this is everything.

    Scoped by (country, industry), both defaulting to New Zealand wine.
    """
    vintage_year = get_current_vintage_year()
    sc = scope_mod.resolve(db, country, industry)

    query = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(
        ClimateZone.is_active == True,
        ClimateZone.country_id == sc.country_id,
        ClimateZone.industry_id == sc.industry_id,
    )

    if region_id:
        query = query.filter(ClimateZone.region_id == region_id)
    
    # Only include zones that have data for current season
    zones_with_data = db.query(ClimateZoneDaily.zone_id).filter(
        ClimateZoneDaily.vintage_year == vintage_year
    ).distinct().subquery()
    
    query = query.filter(ClimateZone.id.in_(
        db.query(zones_with_data.c.zone_id)
    ))
    
    zones = query.outerjoin(
        WineRegion, ClimateZone.region_id == WineRegion.id
    ).order_by(
        WineRegion.display_order.nulls_last(),
        WineRegion.name.nulls_last(),
        ClimateZone.display_order,
        ClimateZone.name,
    ).all()
    
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
    as_of: Optional[date] = Query(
        None,
        description="Report the season AS IT STOOD on this date. Default: today.",
    ),
    vintage_year: Optional[int] = Query(
        None,
        description="Vintage year (July-June). Default: the vintage current at `as_of`.",
    ),
    db: Session = Depends(get_db)
):
    """
    Get current season climate summary for a zone.

    Returns:
    - Season summary with GDD/rainfall totals and baseline comparisons
    - Recent daily data for charts/tables
    - Chart-ready data structure

    ## `as_of` — why this endpoint is not only about *now*

    A published article embeds this widget and keeps rendering it for years. With
    no `as_of` the widget silently follows the calendar, so an article headed
    "week ending 27 February 2026" ends up drawing a season that had not started
    when the reader opens it. `as_of` pins BOTH halves of that: the vintage, and
    how far into it the data is allowed to run. Passing only a vintage would show
    the whole finished season, including everything that happened after the piece
    was written.

    Defaults are unchanged — no `as_of` and no `vintage_year` behaves exactly as
    before.
    """
    zone = get_zone_or_404(db, zone_slug)
    if vintage_year is None:
        vintage_year = get_current_vintage_year(as_of)

    # Get all data for the season, truncated at `as_of` when one is given. The
    # filter has to be here rather than applied to the result: `recent_days`,
    # the season totals and `doy` are all derived from this list, so trimming it
    # afterwards would leave the totals running past the recent window.
    query = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.zone_id == zone.id,
        ClimateZoneDaily.vintage_year == vintage_year
    )
    if as_of is not None:
        query = query.filter(ClimateZoneDaily.date <= as_of)
    season_data = query.order_by(ClimateZoneDaily.date.desc()).all()

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
    as_of: Optional[date] = Query(
        None,
        description="Stop the curve on this date, and default the vintage to the "
                    "one current then. Default: today.",
    ),
    db: Session = Depends(get_db)
):
    """
    Get GDD accumulation progress compared to baseline.

    Returns daily GDD accumulation with baseline comparison for charts
    showing season progression and phenology milestones.

    `as_of` exists for embedded widgets in published articles — see the note on
    `/current-season`. `vintage_year` alone would draw the whole finished season
    under a heading written mid-season.
    """
    zone = get_zone_or_404(db, zone_slug)

    if vintage_year is None:
        vintage_year = get_current_vintage_year(as_of)

    # Get season data
    query = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.zone_id == zone.id,
        ClimateZoneDaily.vintage_year == vintage_year
    )
    if as_of is not None:
        query = query.filter(ClimateZoneDaily.date <= as_of)
    season_data = query.order_by(ClimateZoneDaily.date).all()

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
    # The Sep-Apr window this vintage covers. A projected date outside it is
    # wrong for this vintage however healthy the accumulation looks, and that is
    # the second of the two basis tests.
    season_start, season_end = insights_site_baseline.season_bounds(vintage_year)

    for est in estimates:
        threshold = thresholds.get(est.variety_code)
        variety_name = threshold.variety_name if threshold else est.variety_code
        
        # Get current GDD to determine if stages are actual (reached) vs predicted
        current_gdd = float(est.gdd_accumulated) if est.gdd_accumulated else 0
        
        # Build stages list
        stages = []

        def staged(stage_name, gdd_threshold, predicted, is_actual):
            """One stage, with an unprojectable date WITHHELD rather than shown.

            Before a season starts the model accumulates zero GDD and projects
            flowering into April and harvest into the following year, all at
            `confidence = 'high'`. Every one of the 5,733 rows in the 2027
            vintage sat at zero on 2026-08-19. See `services/phenology_basis`.

            The date is removed from the RESPONSE, not merely hidden by a
            client, and `status` says which of the five reasons applies so the
            page can word its empty state correctly.
            """
            status = phenology_basis.classify(
                predicted, is_actual, current_gdd, season_start, season_end)
            show = phenology_basis.is_shown(status)
            return PhenologyStage(
                stage_name=stage_name,
                gdd_threshold=to_decimal(gdd_threshold) if gdd_threshold else None,
                predicted_date=predicted if show else None,
                is_actual=is_actual,
                days_from_now=((predicted - today).days
                               if show and predicted and predicted > today
                               else None),
                status=status,
            )

        # Flowering - check if GDD has passed flowering threshold
        flowering_threshold = float(threshold.gdd_flowering) if threshold and threshold.gdd_flowering else None
        flowering_is_actual = flowering_threshold is not None and current_gdd >= flowering_threshold

        stages.append(staged(
            'Flowering',
            threshold.gdd_flowering if threshold else None,
            est.flowering_date,
            flowering_is_actual,
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

            stages.append(staged(label, gdd_threshold, harvest_date,
                                 is_harvest_actual))
        
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
    as_of: Optional[date] = Query(
        None,
        description="Treat this date as 'now', so the window is the N days "
                    "ending then. Default: today.",
    ),
    db: Session = Depends(get_db)
):
    """
    Get disease pressure indicators for a zone.

    Returns current and recent disease risk levels with contributing
    factors and spray recommendations based on validated scientific models:
    - Powdery Mildew: UC Davis Risk Index
    - Botrytis: González-Domínguez mechanistic model
    - Downy Mildew: 3-10 primary model + Goidanich Index

    Note this endpoint takes `as_of` and NOT a vintage: disease pressure is a
    rolling window of recent days, not a season, so "which season" is the wrong
    question to pin it with. An article embedding it wants the N days that ended
    when it was written.
    """
    zone = get_zone_or_404(db, zone_slug)

    # Get recent disease pressure data
    query = db.query(DiseasePressure).filter(
        DiseasePressure.zone_id == zone.id
    )
    if as_of is not None:
        query = query.filter(DiseasePressure.date <= as_of)
    pressure_data = query.order_by(DiseasePressure.date.desc()).limit(recent_days).all()

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
    
    # Region first. `display_order` on a zone is now its position WITHIN its
    # region (migration zone_display_order), so ordering on it alone would
    # interleave the country — every region's own zone first, then everybody's
    # first sub-region, and so on.
    zones = zone_query.outerjoin(
        WineRegion, ClimateZone.region_id == WineRegion.id
    ).order_by(
        WineRegion.display_order.nulls_last(),
        WineRegion.name.nulls_last(),
        ClimateZone.display_order,
        ClimateZone.name,
    ).all()
    
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


# =============================================================================
# ENDPOINTS: LIVE STATION EXTREMES
# =============================================================================

# Variable names as they appear in `weather_data`. Sources disagree on
# spelling, so these mirror daily_aggregation.py rather than restating a subset
# of it — a headline that silently ignored 'air_temperature' would quietly drop
# every SYNOP and ECan air-quality station.
LIVE_TEMP_VARS = ['temp', 'temperature', 'air_temperature']
LIVE_RAIN_VARS = ['rainfall', 'precipitation', 'precip', 'rain']

# Matches daily_aggregation.QUARANTINE_QUALITY. Quarantined rows are marked,
# not deleted, precisely so a failed sensor stays provable — which means every
# read path has to exclude them itself.
LIVE_QUARANTINE_QUALITY = 'QUARANTINED'

# --- Guard 1: absolute bounds ------------------------------------------------
# Deliberately wider than any plausible NZ reading rather than tuned close to
# it. NZ's records are -25.6 and 42.4 degC, so clipping a genuine record would
# be its own kind of lie. This layer only catches nonsense: HORIZONS' Hautapu
# station reports exactly -100, and TDC once published 214699991.0 as an air
# temperature.
LIVE_TEMP_MIN_C = -30.0
LIVE_TEMP_MAX_C = 45.0

# One observation, not a daily total. NZ's 24 hour record is around 758 mm, so
# a single sub-daily reading above 250 mm is an instrument fault or a unit
# error, not weather. The window TOTAL gets its own ceiling above the record.
LIVE_RAIN_MAX_MM = 250.0
LIVE_RAIN_MAX_WINDOW_MM = 800.0

# --- Guard 2: outlier against the national field -----------------------------
# Absolute bounds are not enough, and the reason is worth stating because it is
# not obvious. Measured 2026-08-19: the warmest reading in the country was
# 29.3 degC at Winton, Southland — at 1am, in August. That station sits at
# 21-29 degC day and night through a Southland winter, so it is not measuring
# air. Every one of the national top fifteen readings was that one sensor.
# 29.3 is individually plausible, so no fixed bound can reject it.
#
# What does reject it is the rest of the network, at the same moment. Every
# station is reduced to its current reading, and a candidate is refused if it
# sits more than OUTLIER_MARGIN_C beyond the 95th percentile of those readings.
# Measured 2026-08-20 on the 2h current window: p95 was 11.6 so the cut was
# 19.6, Winton at 26.2 was refused, and Kapoaiaia at Cape Egmont at 13.3 stood
# as the genuine national high.
#
# The margin is generous on purpose. A real extreme IS an outlier, and the cold
# side has to leave room for inland frost hollows: Upper Waikaia at Hyde Rock
# reported -1.7 against a 5th-percentile of 2.4, and that is real weather.
#
# This is READ-SIDE ONLY. It decides what the home page prints; it never writes,
# flags or quarantines a row, so it cannot collide with the ingest-side
# physical-range QC. Three stations it keeps rejecting — 330, 473, 760 — are
# quarantine candidates for whoever owns that, not for this endpoint to fix.
LIVE_OUTLIER_MARGIN_C = 8.0
LIVE_HI_PERCENTILE = 0.95
LIVE_LO_PERCENTILE = 0.05

# How many candidates to pull per side. If the top few are all one broken
# sensor there is nothing left to fall back to, and the tile is omitted rather
# than filled with the next-worst guess.
LIVE_CANDIDATES = 6

# TEMPERATURE IS "NOW", NOT "TODAY".
#
# This started as a 24 hour window, which made Warmest the afternoon high and
# Coldest the overnight low. Both are useful numbers but neither is current:
# on 2026-08-20 they were showing readings 22 and 9 hours old on a page whose
# whole point is that the network is live.
#
# So temperature is each station's LATEST reading, and the window is only there
# to decide what still counts as current. Two hours, measured the same day:
#
#     1h ->  72 stations      2h -> 193      3h -> 193      6h -> 193
#
# Ingestion is hourly, so one hour catches barely a third of the network and
# whichever third depends on where the clock is. At two hours it saturates —
# 3h, 4h and 6h return the identical station set and the identical extremes —
# so 2 is the smallest window that is also stable.
# Widened from 2 to 4 hours on 2026-08-24, when the strip was gated to SYNOP.
#
# Two hours was tuned for the council network, which was measured at 0.7 hours
# behind real time. SYNOP arrives hourly over the GTS with a longer ingest lag —
# measured 2h09 at the moment of the change — so a 2-hour window returned
# **zero candidates** and the warmest and coldest tiles silently disappeared.
#
# Four rather than three: three would have cleared today's lag by fifty minutes,
# which is not margin. The tile prints the reading's own age, so a stale one is
# visible rather than being passed off as current.
LIVE_CURRENT_WINDOW_HOURS = 4

# Rainfall CANNOT use that window. It is an accumulation, not a state: over two
# hours the national wettest was 3.0 mm against 20.5 mm over 24, and 3.0 mm
# describes nothing. A rain total needs a period long enough to be weather, so
# this tile stays on 24 hours and says so.
LIVE_RAIN_WINDOW_HOURS = 24

# The station count also stays on 24 hours — see LIVE_BREADTH_CACHE_TTL_SECONDS
# below for why a short window makes it swing by hundreds.
LIVE_WINDOW_HOURS = 24

# The station count is deliberately taken over the SAME window as the extremes,
# after a short window was tried and rejected. Distinct public stations
# reporting, measured 2026-08-19:
#
#     1h -> 2     2h -> 482    3h -> 786    6h -> 836
#    12h -> 843   24h -> 854   48h -> 863   (881 active in total)
#
# Ingestion runs hourly, so anything under about three hours sits on the knee
# of that curve and the figure swings with where the clock happens to be: two
# successive calls eleven minutes apart returned 784 and then 483. A headline
# that says "784 stations" and then "483 stations" reads as a broken feed, and
# the shorter window buys nothing — 24 hours is both stable and nearly the
# whole network.
#
# Counting distinct stations across ALL variables cannot use the variable
# filter, so it is the most expensive query here (1.6-5.5s). It gets its own
# hourly cache rather than being recomputed every time the extremes refresh:
# the size of the network is not a five-minute quantity.
LIVE_BREADTH_CACHE_TTL_SECONDS = 3600

# Ingestion runs hourly (`weather-ingestion.yml` at :05) and SYNOP every three,
# so nothing here can change faster than once an hour. Five minutes keeps the
# page honest about being live while removing essentially all of the load: the
# uncached query set costs a few seconds against a 47-partition view, which is
# far too slow to sit in front of a home page render.
LIVE_CACHE_TTL_SECONDS = 300

# MAINLAND ONLY. The network reaches the Kermadecs and the subantarctic, and
# those stations kept winning: Raoul Island at -29.25 is subtropical and took
# the national high every day, which tells a New Zealand grower nothing about
# New Zealand. Excluded by this box, verified 2026-08-20 as exactly four
# stations, all SYNOP_GTS:
#
#     Raoul Island        -29.250, -177.933   (Kermadecs)
#     Chatham Island       -43.817, -176.483  (note: NEGATIVE longitude)
#     Enderby Island       -50.483,  166.300  (Auckland Islands)
#     Campbell Island      -52.550,  169.150
#
# The longitude bound is what catches the Chathams and Raoul — both sit east of
# the dateline and are stored as negative degrees, so they fall outside
# 166..179.2 rather than needing a special case. The latitude bound catches the
# subantarctic pair. Stewart Island (-47.0) and Cape Reinga (-34.4) are inside.
#
# Every active public station has coordinates (checked: zero nulls), so this
# drops nothing by accident. If that ever changes, a NULL fails the BETWEEN and
# the station disappears silently — worth re-checking before trusting it.
_MAINLAND_LAT_MIN, _MAINLAND_LAT_MAX = -47.5, -34.0
_MAINLAND_LON_MIN, _MAINLAND_LON_MAX = 166.0, 179.2

# SYNOP ONLY, as well as mainland (2026-08-24).
#
# The strip was drawing from all ~800 public stations, and most of them are
# council hydrometry: gauges sited for river management, in gullies, under
# canopy, on bridges, with no shielding standard and no obligation to be
# comparable with anything. They produced a stream of implausible national
# headlines — the coldest in the country reading exactly 0.0 from a bowling
# club, a 29.3 degC winter maximum from a sensor nobody was auditing.
#
# `SYNOP_GTS` is the World Meteorological Organization synoptic network: 54
# stations on the GTS, sited and maintained to a standard, and the set every
# published New Zealand weather statistic is actually built on. A national
# "warmest right now" is a claim about the country, and it should come from the
# network that exists to make that claim.
#
# The trade is breadth: 54 stations rather than ~800, so the strip can miss a
# genuine local extreme that only a council gauge saw. That is the right way
# round — a missed extreme is invisible, a wrong one is on the home page. The
# reporting-station COUNT still runs over the whole network, so the footnote
# keeps describing the real breadth of the platform.
#
# This does NOT change the zone aggregates. Those are interpolated from every
# station and want the density; it is only the single-station headline that
# needs a defensible source.
_SYNOP_SOURCE = 'SYNOP_GTS'

# TWO ELIGIBILITY SETS, AND THEY ARE NOT THE SAME QUESTION.
#
# `visibility` defaults to 'public' but a Grow customer's own station is
# private, and it must never surface as a national headline on an anonymous
# page. That much both sets share. Written as a scalar subquery rather than a
# CTE: `eligible` referenced more than once forces Postgres to materialise it,
# which measured 2.0s against 0.07s for the same filter inline.
#
# HEADLINE set — mainland SYNOP, per the note above. A single named station
# making a claim about the whole country has to come from the network that
# exists to make that claim.
_SYNOP_STATION_IDS_SQL = f"""
    SELECT station_id FROM weather_stations
    WHERE is_active = true AND visibility = 'public'
      AND data_source = '{_SYNOP_SOURCE}'
      AND latitude  BETWEEN {_MAINLAND_LAT_MIN} AND {_MAINLAND_LAT_MAX}
      AND longitude BETWEEN {_MAINLAND_LON_MIN} AND {_MAINLAND_LON_MAX}
"""

# BREADTH set — every active public station, no source and no bounding box.
#
# Split back out on 2026-08-25. When the SYNOP filter landed on 2026-08-24 it
# was added to the ONE constant both the headlines and the count were reading,
# so the footnote silently went from "854 stations reporting" to the 54 GTS
# stations — while the comment above still promised the count ran over the
# whole network. The two questions are genuinely different and now have
# genuinely different SQL:
#
#   headline   which station may make a national claim   -> defensible siting
#   footnote   how big is this platform's network        -> everything we ingest
#
# No mainland box here either. Campbell Island and the Chathams are stations we
# ingest hourly; they are excluded from the headline because a subtropical
# record tells a grower nothing, not because they are not part of the network.
_ALL_PUBLIC_STATION_IDS_SQL = """
    SELECT station_id FROM weather_stations
    WHERE is_active = true AND visibility = 'public'
"""


def _live_temperature_candidates(db: Session, since: datetime):
    """
    Warmest and coldest station RIGHT NOW, plus the reference percentiles
    needed to judge them.

    `DISTINCT ON (station_id) ... ORDER BY timestamp DESC` takes each station's
    most recent reading inside the window, so the comparison is between places
    at the same moment rather than between one station's afternoon and
    another's dawn. That is what makes "warmest" a current claim.

    Candidates come back UNFILTERED by the outlier guard. The guard is applied
    in Python so a rejection can be logged by name — a query that filtered
    silently would hide exactly the broken sensors this is here to catch.
    """
    sql = text(f"""
        WITH obs AS (
            SELECT DISTINCT ON (wd.station_id)
                   wd.station_id, wd.value, wd.timestamp
            FROM weather_data wd
            WHERE wd.timestamp >= :since
              AND wd.variable IN :temp_vars
              AND wd.value IS NOT NULL
              AND wd.value BETWEEN :temp_lo AND :temp_hi
              AND coalesce(wd.quality, '') <> :quarantine
              AND wd.station_id IN ({_SYNOP_STATION_IDS_SQL})
            ORDER BY wd.station_id, wd.timestamp DESC
        ),
        bounds AS (
            SELECT percentile_cont(:hi_pct) WITHIN GROUP (ORDER BY value) AS hi_ref,
                   percentile_cont(:lo_pct) WITHIN GROUP (ORDER BY value) AS lo_ref,
                   -- Newest temperature anywhere, carried out of a scan that is
                   -- happening anyway. A dedicated MAX(timestamp) over all
                   -- variables measured 1.9s; this costs nothing.
                   MAX(timestamp) AS newest_at
            FROM obs
        )
        (
            SELECT 'warmest' AS key, o.station_id, o.value,
                   o.timestamp AS observed_at, b.hi_ref AS ref, b.newest_at
            FROM obs o CROSS JOIN bounds b
            ORDER BY o.value DESC, o.timestamp DESC LIMIT :limit
        )
        UNION ALL
        (
            SELECT 'coldest' AS key, o.station_id, o.value,
                   o.timestamp AS observed_at, b.lo_ref AS ref, b.newest_at
            FROM obs o CROSS JOIN bounds b
            ORDER BY o.value ASC, o.timestamp DESC LIMIT :limit
        )
    """).bindparams(bindparam('temp_vars', expanding=True))

    return db.execute(sql, {
        'since': since,
        'temp_vars': LIVE_TEMP_VARS,
        'temp_lo': LIVE_TEMP_MIN_C,
        'temp_hi': LIVE_TEMP_MAX_C,
        'quarantine': LIVE_QUARANTINE_QUALITY,
        'hi_pct': LIVE_HI_PERCENTILE,
        'lo_pct': LIVE_LO_PERCENTILE,
        'limit': LIVE_CANDIDATES,
    }).mappings().all()


def _pick_temperature(rows, key: str):
    """
    First candidate that survives the outlier guard, or None.

    Rejections are logged at WARNING with the station named. This project has
    been bitten repeatedly by code that discards data and reports success, so a
    guard that silently swallowed a 57.9 degC sensor would be trading one
    invisible fault for another.
    """
    warmest = key == 'warmest'
    candidates = [r for r in rows if r['key'] == key]

    for row in candidates:
        ref = row['ref']
        value = row['value']
        if ref is None or value is None:
            continue
        limit = (float(ref) + LIVE_OUTLIER_MARGIN_C) if warmest \
            else (float(ref) - LIVE_OUTLIER_MARGIN_C)
        passes = float(value) <= limit if warmest else float(value) >= limit
        if passes:
            return row
        logger.warning(
            "live-extremes: rejected station %s as %s outlier — %.1f vs limit %.1f "
            "(p%d of %s = %.1f). Sensor is a quarantine candidate.",
            row['station_id'], key, float(value), limit,
            int((LIVE_HI_PERCENTILE if warmest else LIVE_LO_PERCENTILE) * 100),
            'current readings', float(ref),
        )

    logger.warning("live-extremes: no %s candidate survived the guard (%d examined)",
                   key, len(candidates))
    return None


def _live_rainfall(db: Session, since: datetime):
    """
    Wettest station by window TOTAL.

    Rain has no instantaneous reading to be "wettest" with — a tipping bucket
    reports an increment, so a spot value is meaningless. The honest headline
    is the total over the window, stamped with the last observation that
    contributed to it.
    """
    sql = text(f"""
        WITH obs AS (
            SELECT wd.station_id, wd.value, wd.timestamp
            FROM weather_data wd
            WHERE wd.timestamp >= :since
              AND wd.variable IN :rain_vars
              AND wd.value IS NOT NULL
              AND wd.value >= 0
              AND wd.value <= :rain_hi
              AND coalesce(wd.quality, '') <> :quarantine
              AND wd.station_id IN ({_SYNOP_STATION_IDS_SQL})
        )
        SELECT station_id, SUM(value) AS value, MAX(timestamp) AS observed_at,
               MAX(MAX(timestamp)) OVER () AS newest_at
        FROM obs
        GROUP BY station_id
        HAVING SUM(value) > 0 AND SUM(value) <= :window_hi
        ORDER BY value DESC
        LIMIT 1
    """).bindparams(bindparam('rain_vars', expanding=True))

    rows = db.execute(sql, {
        'since': since,
        'rain_vars': LIVE_RAIN_VARS,
        'rain_hi': LIVE_RAIN_MAX_MM,
        'window_hi': LIVE_RAIN_MAX_WINDOW_MM,
        'quarantine': LIVE_QUARANTINE_QUALITY,
    }).mappings().all()
    return rows[0] if rows else None


def _compute_live_extremes(db: Session, window_hours: int) -> LiveExtremesResponse:
    """
    Three tiles on two different clocks, which is why each carries its own
    `window_hours` rather than inheriting one from the response.

    Temperature is a STATE — the warmest place in the country right now — so it
    reads each station's latest value inside a short window. Rainfall is an
    ACCUMULATION and has no instantaneous value, so it totals a long one. Giving
    both the same window would either make temperature stale or make rainfall
    meaningless; there is no single number that is right for both.
    """
    now = datetime.now(timezone.utc)
    temp_since = now - timedelta(hours=LIVE_CURRENT_WINDOW_HOURS)
    rain_since = now - timedelta(hours=LIVE_RAIN_WINDOW_HOURS)

    temp_rows = _live_temperature_candidates(db, temp_since)
    winners = {
        'warmest': _pick_temperature(temp_rows, 'warmest'),
        'coldest': _pick_temperature(temp_rows, 'coldest'),
        'wettest': _live_rainfall(db, rain_since),
    }

    # `latest_at` is separate from any tile's `observed_at` and it matters. It
    # says when the network last spoke, where the tile says when ITS reading was
    # taken. Assembled from the two scans already done rather than bought with a
    # third query.
    latest_candidates = [r['newest_at'] for r in temp_rows if r.get('newest_at')]
    rain_row = winners['wettest']
    if rain_row is not None and rain_row.get('newest_at'):
        latest_candidates.append(rain_row['newest_at'])
    latest_at = max(latest_candidates) if latest_candidates else None

    reporting = _live_reporting_stations(
        window_hours, int(time.time() // LIVE_BREADTH_CACHE_TTL_SECONDS))

    station_ids = [r['station_id'] for r in winners.values() if r is not None]
    details = {}
    if station_ids:
        for row in db.execute(text("""
            SELECT ws.station_id, ws.station_name, ws.region,
                   cz.slug AS zone_slug, cz.name AS zone_name
            FROM weather_stations ws
            LEFT JOIN climate_zones cz ON cz.id = ws.zone_id
            WHERE ws.station_id = ANY(:ids)
        """), {'ids': station_ids}).mappings().all():
            details[row['station_id']] = row

    # "now" and "24h" are load-bearing, not decoration: without them the strip
    # shows a 12 degC current temperature beside a 20 mm total and invites the
    # reader to think both describe the same moment.
    labels = {'warmest': 'Warmest now', 'coldest': 'Coldest now', 'wettest': 'Wettest 24h'}
    units = {'warmest': '°C', 'coldest': '°C', 'wettest': 'mm'}
    windows = {
        'warmest': LIVE_CURRENT_WINDOW_HOURS,
        'coldest': LIVE_CURRENT_WINDOW_HOURS,
        'wettest': LIVE_RAIN_WINDOW_HOURS,
    }

    extremes = []
    # Ordered warmest, coldest, wettest — the strip reads in that order and the
    # frontend should not have to sort a response to lay itself out.
    for key in ('warmest', 'coldest', 'wettest'):
        row = winners.get(key)
        # A missing key is a real state, not an error. No rain anywhere in the
        # country is a dry day, and the tile should be absent rather than
        # showing 0.0 mm as though it had been measured.
        if row is None or row['value'] is None:
            continue
        detail = details.get(row['station_id'], {})
        extremes.append(LiveStationExtreme(
            key=key,
            label=labels[key],
            value=row['value'],
            unit=units[key],
            station_id=row['station_id'],
            station_name=detail.get('station_name') or f"Station {row['station_id']}",
            station_region=detail.get('region'),
            zone_slug=detail.get('zone_slug'),
            zone_name=detail.get('zone_name'),
            observed_at=row['observed_at'],
            window_hours=windows[key],
        ))

    return LiveExtremesResponse(
        generated_at=now,
        network_latest_at=latest_at,
        reporting_stations=reporting,
        reporting_window_hours=window_hours,
        mainland_only=True,
        extremes=extremes,
    )


@lru_cache(maxsize=8)
def _live_reporting_stations(window_hours: int, hour_bucket: int) -> int:
    """
    Distinct public stations that reported ANYTHING in the window — not just
    temperature and rainfall, and NOT restricted to the headline set. 854
    against 228 on 2026-08-19; the wider figure is the one that describes the
    network, and it is counted rather than asserted.

    Reads `_ALL_PUBLIC_STATION_IDS_SQL`, deliberately not the SYNOP set the
    headlines use. Sharing one constant is what silently cut this number to 54
    on 2026-08-24 — the whole point of the footnote is that the platform is
    much wider than the handful of stations a national headline may come from.

    Cached on its own hourly bucket. It is the most expensive query in this
    module and the least time-sensitive, so recomputing it every time the
    extremes refresh would pay the whole cost for none of the benefit.
    """
    db = SessionLocal()
    try:
        since = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        return db.execute(text(f"""
            SELECT COUNT(DISTINCT wd.station_id)
            FROM weather_data wd
            WHERE wd.timestamp >= :since
              AND wd.value IS NOT NULL
              AND coalesce(wd.quality, '') <> :quarantine
              AND wd.station_id IN ({_ALL_PUBLIC_STATION_IDS_SQL})
        """), {'since': since, 'quarantine': LIVE_QUARANTINE_QUALITY}).scalar() or 0
    finally:
        db.close()


@lru_cache(maxsize=8)
def _live_extremes_cached(window_hours: int, bucket: int) -> LiveExtremesResponse:
    """
    Time-bucketed cache. `bucket` is wall clock floor-divided by the TTL, so a
    new key appears every TTL seconds and lru_cache evicts the old one — a TTL
    without another dependency.

    Opens its own session: the request-scoped one cannot be a cache key, and
    holding a request's session across a cache hit for another request would be
    worse than opening one here.
    """
    db = SessionLocal()
    try:
        return _compute_live_extremes(db, window_hours)
    finally:
        db.close()


@router.get("/live-extremes", response_model=LiveExtremesResponse)
def get_live_extremes(
    response: Response,
    window_hours: int = Query(
        LIVE_WINDOW_HOURS, ge=1, le=72,
        description=(
            "Window for the reporting-station COUNT only. The readings "
            "themselves use fixed windows suited to each: temperature is the "
            "latest value within 2h, rainfall is a 24h total."
        ),
    ),
):
    """
    The warmest, coldest and wettest station in the country right now.

    Read straight off raw observations rather than the zone aggregates the rest
    of this router uses. Those are a day or two behind by design; the point of
    this endpoint is that the home page can show a real reading with the time
    it was taken. Measured 2026-08-19, most councils were 0.7 hours behind
    real time, so "live" is an honest word for it.

    MAINLAND SYNOP ONLY. Two filters, for two different reasons.

    Mainland, because the network reaches the Kermadecs and the subantarctic and
    Raoul Island took the national high every day — true, and useless to a New
    Zealand grower.

    SYNOP, because the rest of the network is council hydrometry sited for river
    management rather than meteorology, and it produced a steady supply of
    implausible headlines. The 54 GTS stations are the ones every published New
    Zealand weather statistic is built on.

    Breadth is still shown, through the reporting-station count, which runs over
    the whole network.

    Tiles only carry a link when the station falls inside a wine zone, which
    most do not — the network runs well past the wine regions.

    TWO CLOCKS. Temperature is a state, so it is each station's latest reading
    within 2 hours. Rainfall is an accumulation with no instantaneous value, so
    it is a 24 hour total. Each tile carries its own `window_hours`; there is no
    single window that is honest for both.

    Two guards stand between a sensor fault and the home page: absolute bounds,
    and an outlier test against the rest of the network. See the constants
    above for what each one is for and why neither is sufficient alone. Both
    are READ-SIDE only — this endpoint never writes, flags or quarantines
    anything, so it cannot collide with the ingest-side QC work.

    `weather_data` is a VIEW over 47 partitions. Every query here is bounded on
    `timestamp` so the planner can prune; an unbounded one reads all of them.
    """
    bucket = int(time.time() // LIVE_CACHE_TTL_SECONDS)
    result = _live_extremes_cached(window_hours, bucket)
    response.headers['Cache-Control'] = f'public, max-age={LIVE_CACHE_TTL_SECONDS}'
    return result
