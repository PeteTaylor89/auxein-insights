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
from sqlalchemy import func, case, and_, desc, text
from sqlalchemy.orm import Session, joinedload

from db.session import get_db
from core import scope as scope_mod
from core.entitlements import is_pro, is_registered
from db.models.public_user import PublicUser
from core.public_security import get_optional_public_user
from services import insights_region_dashboard as region_dashboard
from db.models.wine_region import WineRegion
from db.models.climate import (
    ClimateHistoryMonthlySurface,
    ClimateZone,
    ClimateHistoryMonthly,
    ClimateBaselineMonthly,
    ClimateProjection,
    ClimateZoneSeasonStats,
    ClimateZoneSeasonBaseline,
    ClimateProjectionExtremes,
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
    SeasonExtremes,
    SeasonExtremesBaseline,
    ProjectionExtremeMetric,
    ProjectionExtremes,
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
    ZonesSeasonsCompareResponse,
    ZoneSeasonTrend,
    ZoneSeasonValue,
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

GROWING_SEASON_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4]  # Sep-Apr

# Truncated seasons to exclude from queries (incomplete data)
# 1986 = 85/86 season (missing Oct-Dec 1985)
# 2024 = 23/24 season (incomplete/current season)
# Seasons that cannot be complete, and therefore must never be offered.
#
# **1986** genuinely cannot exist: a Sep-Apr vintage labelled 1986 needs
# September to December 1985, which is before the archive starts.
#
# **2024 was removed on 2026-08-24.** It was excluded because the archive
# stopped part-way through it — not because the season is truncated in
# principle. The archive now runs to 2026-07 and vintage 2024 has all eight of
# its months across all 23 zones (verified), so excluding it was hiding a
# complete season.
#
# Anything added here should be a season that is IMPOSSIBLE, not one that is
# merely not published yet — a missing season already falls out of the data.
EXCLUDED_VINTAGE_YEARS = [1986]

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

# Seasonal extreme metrics — one value per zone per season, read directly from
# climate_zone_season_stats / climate_zone_season_baseline (NOT aggregated from
# monthly history). Map: metric -> (column attr [same on stats + baseline], label).
SEASON_EXTREME_FIELDS = {
    "frost_days": ("frost_days_mean", "Frost Days"),
    "hot_days30": ("hot_days30_mean", "Hot Days >30°C"),
    "r99p": ("r99p_mean", "Extreme Rain (R99p)"),
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


# p90 - p10 spans this many standard deviations for a normal distribution.
# Same estimator, and same caveat, as `history_surface_view`: fair for the
# symmetric fields, understates the upper tail for counts bounded at zero.
_SD_FROM_P10_P90 = 2.5631




def build_season_extremes(metrics: Optional[dict]) -> Optional[SeasonExtremes]:
    """Season extremes for one vintage, from the SURFACE roll-up.

    Repointed 2026-08-24. This used to take a `ClimateZoneSeasonStats` row,
    which stops at vintage 2023 and is 100% `source='modelled'` — so frost,
    spring frost, hot days and extreme rainfall simply vanished for every
    season after 2023 while the rest of the row rendered fine.

    `climate_zone_surface_season` carries all four for **1987..2026**, over each
    zone's planted cells, which is the same basis as everything else on the
    page.

    `metrics` is `{metric_name: row}` for one vintage. `sd` is derived from the
    p10/p90 spread — the roll-up stores percentiles, not a standard deviation.

    ## TOTAL FROST DAYS ARE NOT EMITTED

    Total frost days were removed on 2026-08-24 after a diagnosis, not a preference.

The count is produced by thresholding an interpolated Tmin field at 0 degC, and
that field is lapse-rate retrended (0.4-0.6 degC per 100 m). On calm frost nights
the atmosphere INVERTS - cold air drains to the valley floor - so the lapse is
wrong in SIGN for exactly the nights that generate the count. Measured against
stations in July 2025: Red Hills at 1328 m observed 1 frost night and its own
pixel says 20; Flaxbourne at 39 m observed 6 and its pixel says 0. Frost is
loaded onto the tops and erased from the valley floors, which is where the vines
are.

It only breaks where the July mean Tmin sits near zero. Central Otago (well
below) is accurate to within 5%; Marlborough (2.37 degC normal) lost 95% of its
frost. Publishing a number that is right in Otago and absent in Marlborough is
worse than publishing none.

SPRING FROST IS KEPT because it is what growers act on, but it is derived from
the same field and carries the same bias - it is simply smaller, so the error is
less visible. It should be revisited with the fix, not trusted because it looks
plausible. The fix is in the engine: interpolate the COUNT rather than threshold
an interpolated temperature.
\n    """
    if not metrics:
        return None

    def val(name):
        r = metrics.get(name)
        if r is None or r["mean"] is None:
            return ClimateValue()
        sd = None
        if r["p10"] is not None and r["p90"] is not None:
            sd = (float(r["p90"]) - float(r["p10"])) / _SD_FROM_P10_P90
        return ClimateValue(mean=r["mean"], sd=sd)

    return SeasonExtremes(
        hot_days30=val("hot_days_30"),
        r99p=val("r99p"),
        # Every row here is derived from the interpolated surface archive. The
        # old table distinguished 'modelled' from an 'observed' fold-in that
        # never actually ran, so nothing is lost by stating the one true source.
        source="surface",
    )


# The page's baseline window. Matches `insights_site_baseline.BASELINE_LO/HI`
# and the projection composition, so a normal means one thing site-wide.
SURFACE_BASELINE_LO, SURFACE_BASELINE_HI = 1986, 2005


def build_surface_baseline_extremes(metrics: dict) -> Optional[SeasonExtremesBaseline]:
    """The 1986-2005 normal for the extremes, from the surface roll-up.

    Deliberately built the same way and from the same table as
    `build_season_extremes`, because the two are rendered against each other.
    Any divergence between them is invisible on the page and reads as a wild
    season rather than as a mismatched baseline — which is exactly what
    happened with the old 1987-2006 table's annual frost count.
    """
    if not metrics:
        return None

    def val(name):
        r = metrics.get(name)
        if r is None or r["mean"] is None:
            return ClimateValue()
        sd = None
        if r["p10"] is not None and r["p90"] is not None:
            sd = (float(r["p90"]) - float(r["p10"])) / _SD_FROM_P10_P90
        return ClimateValue(mean=r["mean"], sd=sd)

    return SeasonExtremesBaseline(
        baseline_period=f"{SURFACE_BASELINE_LO}-{SURFACE_BASELINE_HI}",
        hot_days30=val("hot_days_30"),
        r99p=val("r99p"),
    )


def build_season_extremes_baseline(b: Optional[ClimateZoneSeasonBaseline]) -> Optional[SeasonExtremesBaseline]:
    """Map a season-baseline row to the SeasonExtremesBaseline schema."""
    if not b:
        return None
    return SeasonExtremesBaseline(
        baseline_period=b.baseline_period,
        last_frost_doy=ClimateValue(mean=b.last_frost_doy_mean, sd=b.last_frost_doy_sd),
        last_frost_date=b.last_frost_date,
        early_frost=ClimateValue(mean=b.early_frost_mean, sd=b.early_frost_sd),
        frost_days=ClimateValue(mean=b.frost_days_mean, sd=b.frost_days_sd),
        hot_days30=ClimateValue(mean=b.hot_days30_mean, sd=b.hot_days30_sd),
        r99p=ClimateValue(mean=b.r99p_mean, sd=b.r99p_sd),
    )


def build_projection_extremes(p: Optional[ClimateProjectionExtremes]) -> Optional[ProjectionExtremes]:
    """Map a projection-extremes row to the ProjectionExtremes schema."""
    if not p:
        return None

    def metric(baseline, delta, projected):
        return ProjectionExtremeMetric(baseline=baseline, delta=delta, projected=projected)

    return ProjectionExtremes(
        frost_days=metric(p.frost_days_baseline, p.frost_days_delta, p.frost_days_projected),
        spring_frost=metric(p.spring_frost_baseline, p.spring_frost_delta, p.spring_frost_projected),
        hot_days30=metric(p.hot_days30_baseline, p.hot_days30_delta, p.hot_days30_projected),
        r99p=metric(p.r99p_baseline, p.r99p_delta, p.r99p_projected),
    )


def season_extreme_value(db: Session, zone_id: int, vintage_year: int, metric: str) -> Optional[Decimal]:
    """Per-season value of a seasonal-extreme metric from climate_zone_season_stats."""
    attr = SEASON_EXTREME_FIELDS[metric][0]
    row = db.query(ClimateZoneSeasonStats).filter(
        ClimateZoneSeasonStats.zone_id == zone_id,
        ClimateZoneSeasonStats.vintage_year == vintage_year,
    ).first()
    return to_decimal(getattr(row, attr)) if row else None


def season_extreme_baseline(db: Session, zone_id: int, metric: str) -> Optional[Decimal]:
    """Baseline (1987-2006 normal) value of a seasonal-extreme metric."""
    attr = SEASON_EXTREME_FIELDS[metric][0]
    row = db.query(ClimateZoneSeasonBaseline).filter(
        ClimateZoneSeasonBaseline.zone_id == zone_id,
    ).first()
    return to_decimal(getattr(row, attr)) if row else None


# =============================================================================
# ENDPOINTS: REGIONS & ZONES
# =============================================================================

@router.get("/regions", response_model=RegionsListResponse)
def list_regions(
    country: Optional[str] = Query(None, description="ISO2, defaults to NZ"),
    industry: Optional[str] = Query(None, description="Industry key, defaults to wine"),
    db: Session = Depends(get_db),
):
    """
    List all wine regions with their climate zones.

    Returns regions that have at least one climate zone.

    Scoped by (country, industry); both default to New Zealand wine, which is
    the entire contents of the database, so an unscoped call is unchanged.
    """
    sc = scope_mod.resolve(db, country, industry)

    # Get regions that have climate zones
    regions = db.query(WineRegion).join(
        ClimateZone, ClimateZone.region_id == WineRegion.id
    ).filter(
        WineRegion.country_id == sc.country_id,
        WineRegion.industry_id == sc.industry_id,
    ).distinct().order_by(WineRegion.display_order).all()

    result = []
    for region in regions:
        zones = db.query(ClimateZone).filter(
            ClimateZone.region_id == region.id,
            ClimateZone.is_active == True,
            ClimateZone.country_id == sc.country_id,
            ClimateZone.industry_id == sc.industry_id,
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
def list_zones(
    country: Optional[str] = Query(None, description="ISO2, defaults to NZ"),
    industry: Optional[str] = Query(None, description="Industry key, defaults to wine"),
    db: Session = Depends(get_db),
):
    """List all climate zones for a (country, industry) scope.

    Both default to New Zealand wine, so an unscoped call returns exactly what
    it always has.
    """
    sc = scope_mod.resolve(db, country, industry)

    zones = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).outerjoin(
        WineRegion, ClimateZone.region_id == WineRegion.id
    ).filter(
        ClimateZone.is_active == True,
        ClimateZone.country_id == sc.country_id,
        ClimateZone.industry_id == sc.industry_id,
    ).order_by(
        WineRegion.display_order.nulls_last(),
        WineRegion.name.nulls_last(),
        ClimateZone.display_order,
        ClimateZone.name,
    ).all()
    
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
            rx1day=b.rx1day_mean,
            frost_days=b.frost_days_mean,
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
    - vintage_year: Single growing season (Sep-Apr)
    - months: Specific months only
    """
    zone = get_zone_or_404(db, slug)
    
    # Validate no truncated season requested
    if vintage_year and vintage_year in EXCLUDED_VINTAGE_YEARS:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot retrieve truncated season {vintage_year}. This season has incomplete data."
        )
    
    query = db.query(ClimateHistoryMonthlySurface).filter(
        ClimateHistoryMonthlySurface.zone_id == zone.id
    )
    
    # Apply filters
    if vintage_year:
        query = query.filter(ClimateHistoryMonthlySurface.vintage_year == vintage_year)
    else:
        if start_year:
            query = query.filter(ClimateHistoryMonthlySurface.year >= start_year)
        if end_year:
            query = query.filter(ClimateHistoryMonthlySurface.year <= end_year)
    
    if months:
        month_list = [int(m.strip()) for m in months.split(",")]
        query = query.filter(ClimateHistoryMonthlySurface.month.in_(month_list))
    
    records = query.order_by(ClimateHistoryMonthlySurface.date).all()
    
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
            rx1day=ClimateValue(mean=r.rx1day_mean, sd=r.rx1day_sd),
            frost_days=ClimateValue(mean=r.frost_days_mean, sd=r.frost_days_sd),
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

    # Seasonal extremes (per vintage) + baseline extremes.
    #
    # From `climate_zone_surface_season`, not `climate_zone_season_stats`: the
    # latter ends at vintage 2023, which is why frost, hot days and extreme
    # rainfall disappeared from every newer season.
    stats_by_vintage: dict = {}
    for r in db.execute(text("""
        SELECT vintage_year, metric, mean, p10, p90, unit
          FROM climate_zone_surface_season
         WHERE zone_id = :z
    """), {"z": zone.id}).mappings():
        stats_by_vintage.setdefault(r["vintage_year"], {})[r["metric"]] = r
    # The baseline MUST come from the same table as the seasons it is compared
    # against. It used to read `climate_zone_season_baseline`, stamped
    # 1987-2006 and carrying an ANNUAL frost count — so the page put a
    # growing-season 13.7 next to a baseline of 105.7 and the comparison was
    # meaningless. Averaged over the page's own 1986-2005 window, from the
    # surface roll-up, every figure below is the same quantity as the rows.
    base_rows = db.execute(text("""
        SELECT metric, avg(mean) AS mean, avg(p10) AS p10, avg(p90) AS p90
          FROM climate_zone_surface_season
         WHERE zone_id = :z AND vintage_year BETWEEN :lo AND :hi
         GROUP BY metric
    """), {"z": zone.id, "lo": SURFACE_BASELINE_LO,
           "hi": SURFACE_BASELINE_HI}).mappings().all()
    baseline_extremes = build_surface_baseline_extremes(
        {r["metric"]: r for r in base_rows})

    # Get available vintage years (excluding truncated seasons)
    vintage_query = db.query(
        ClimateHistoryMonthlySurface.vintage_year
    ).filter(
        ClimateHistoryMonthlySurface.zone_id == zone.id,
        ClimateHistoryMonthlySurface.month.in_(GROWING_SEASON_MONTHS),
        ~ClimateHistoryMonthlySurface.vintage_year.in_(EXCLUDED_VINTAGE_YEARS)
    ).distinct()
    
    if start_vintage:
        vintage_query = vintage_query.filter(ClimateHistoryMonthlySurface.vintage_year >= start_vintage)
    if end_vintage:
        vintage_query = vintage_query.filter(ClimateHistoryMonthlySurface.vintage_year <= end_vintage)
    
    vintage_query = vintage_query.order_by(desc(ClimateHistoryMonthlySurface.vintage_year))
    
    if limit:
        vintage_query = vintage_query.limit(limit)
    
    vintage_years = [v[0] for v in vintage_query.all()]
    
    # Build season summaries
    seasons = []
    all_gdd_totals = []  # For ranking
    
    # Get all seasons for ranking calculation (excluding truncated)
    all_vintages = db.query(
        ClimateHistoryMonthlySurface.vintage_year,
        func.sum(ClimateHistoryMonthlySurface.gdd_mean).label('gdd_total')
    ).filter(
        ClimateHistoryMonthlySurface.zone_id == zone.id,
        ClimateHistoryMonthlySurface.month.in_(GROWING_SEASON_MONTHS),
        ~ClimateHistoryMonthlySurface.vintage_year.in_(EXCLUDED_VINTAGE_YEARS)
    ).group_by(ClimateHistoryMonthlySurface.vintage_year).all()
    
    gdd_ranking = sorted([(v.vintage_year, float(v.gdd_total or 0)) for v in all_vintages], 
                         key=lambda x: x[1], reverse=True)
    
    for vintage_year in vintage_years:
        # Get season data
        season_data = db.query(ClimateHistoryMonthlySurface).filter(
            ClimateHistoryMonthlySurface.zone_id == zone.id,
            ClimateHistoryMonthlySurface.vintage_year == vintage_year,
            ClimateHistoryMonthlySurface.month.in_(GROWING_SEASON_MONTHS)
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
            extremes=build_season_extremes(stats_by_vintage.get(vintage_year)),
        ))

    return SeasonsResponse(
        zone=get_zone_brief(zone),
        baseline=baseline,
        baseline_extremes=baseline_extremes,
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

    # Projected seasonal extremes, keyed by (ssp, period)
    extremes_by_key = {
        (e.ssp, e.period): e for e in db.query(ClimateProjectionExtremes).filter(
            ClimateProjectionExtremes.zone_id == zone.id
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
        season_tmean_baselines = []
        season_tmean_projecteds = []
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
                if baseline and baseline.tmean is not None:
                    season_tmean_baselines.append(baseline.tmean)
                if r.tmean_projected is not None:
                    season_tmean_projecteds.append(r.tmean_projected)
                if r.tmean_delta:
                    season_tmean_deltas.append(r.tmean_delta)

        tmean_baseline_avg = (
            to_decimal(sum(season_tmean_baselines) / len(season_tmean_baselines))
            if season_tmean_baselines else None
        )
        tmean_projected_avg = (
            to_decimal(sum(season_tmean_projecteds) / len(season_tmean_projecteds))
            if season_tmean_projecteds else None
        )

        # Calculate season summary
        season_summary = SeasonProjectionSummary(
            gdd_baseline=to_decimal(season_gdd_baseline),
            gdd_projected=to_decimal(season_gdd_projected),
            gdd_change=to_decimal(season_gdd_projected - season_gdd_baseline),
            gdd_change_pct=calc_pct_diff(season_gdd_projected, season_gdd_baseline),
            rain_baseline=to_decimal(season_rain_baseline),
            rain_projected=to_decimal(season_rain_projected),
            rain_change_pct=calc_pct_diff(season_rain_projected, season_rain_baseline),
            tmean_baseline=tmean_baseline_avg,
            tmean_projected=tmean_projected_avg,
            tmean_change=to_decimal(sum(season_tmean_deltas) / len(season_tmean_deltas)) if season_tmean_deltas else None,
        )
        
        projections.append(ScenarioPeriodProjection(
            scenario=SSP_SCENARIOS[ssp_code],
            period=PROJECTION_PERIODS[period_code],
            monthly=monthly,
            season_summary=season_summary,
            extremes=build_projection_extremes(extremes_by_key.get((ssp_code, period_code))),
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

    if metric not in METRIC_LABELS and metric not in SEASON_EXTREME_FIELDS:
        valid = list(METRIC_LABELS.keys()) + list(SEASON_EXTREME_FIELDS.keys())
        raise HTTPException(status_code=400, detail=f"Invalid metric. Valid: {valid}")

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
        if metric in SEASON_EXTREME_FIELDS:
            # Seasonal extreme: one value per zone, straight from season_stats /
            # season_baseline (no monthly breakdown).
            baseline_value = season_extreme_baseline(db, zone_obj.id, metric)
            if vintage_year:
                value = season_extreme_value(db, zone_obj.id, vintage_year, metric)
                vs_baseline = calc_pct_diff(value, baseline_value) if (value is not None and baseline_value) else None
            else:
                value = baseline_value
                vs_baseline = None

            comparison_items.append(ZoneComparisonItem(
                zone_id=zone_obj.id,
                zone_name=zone_obj.name,
                zone_slug=zone_obj.slug,
                region_name=zone_obj.region.name if zone_obj.region else None,
                value=value,
                vs_baseline=vs_baseline,
            ))
            continue

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
        metric_label=METRIC_LABELS.get(metric) or SEASON_EXTREME_FIELDS[metric][1],
        vintage_year=vintage_year,
        comparison_type="season" if vintage_year else "baseline",
        zones=comparison_items,
        chart_data=chart_data,
    )


@router.get("/compare/zones/seasons", response_model=ZonesSeasonsCompareResponse)
def compare_zones_seasons(
    zones: str = Query(..., description="Comma-separated zone slugs (max 5)"),
    metric: str = Query("gdd", description="Metric: gdd, rain, tmean, tmax, tmin"),
    limit: Optional[int] = Query(None, ge=1, description="Most recent N seasons; omit for all"),
    db: Session = Depends(get_db),
):
    """
    Compare multiple zones across multiple seasons for a single metric.

    Returns a per-zone series of season totals (gdd, rain) or averages (tmean, tmax, tmin)
    plus that zone's 1986-2005 baseline value for overlay. Excludes truncated seasons.
    """
    zone_slugs = [z.strip() for z in zones.split(",") if z.strip()]

    if not zone_slugs:
        raise HTTPException(status_code=400, detail="At least one zone slug required")
    if len(zone_slugs) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 zones can be compared")
    if metric not in METRIC_LABELS and metric not in SEASON_EXTREME_FIELDS:
        valid = list(METRIC_LABELS.keys()) + list(SEASON_EXTREME_FIELDS.keys())
        raise HTTPException(status_code=400, detail=f"Invalid metric. Valid: {valid}")

    zone_objs = db.query(ClimateZone).options(
        joinedload(ClimateZone.region)
    ).filter(ClimateZone.slug.in_(zone_slugs)).all()

    if len(zone_objs) != len(zone_slugs):
        found = {z.slug for z in zone_objs}
        missing = [s for s in zone_slugs if s not in found]
        raise HTTPException(status_code=404, detail=f"Zones not found: {missing}")

    # Preserve caller's zone order
    zones_by_slug = {z.slug: z for z in zone_objs}
    ordered_zones = [zones_by_slug[s] for s in zone_slugs]

    is_extreme = metric in SEASON_EXTREME_FIELDS
    is_total_metric = metric in ("gdd", "rain")
    if not is_extreme:
        metric_col = getattr(ClimateHistoryMonthly, f"{metric}_mean")
        agg_expr = func.sum(metric_col) if is_total_metric else func.avg(metric_col)

    # Union of vintage years across all selected zones (monthly history is the
    # full season index; season_stats covers the same modelled range).
    vintage_query = db.query(ClimateHistoryMonthly.vintage_year).filter(
        ClimateHistoryMonthly.zone_id.in_([z.id for z in ordered_zones]),
        ClimateHistoryMonthly.month.in_(GROWING_SEASON_MONTHS),
        ~ClimateHistoryMonthly.vintage_year.in_(EXCLUDED_VINTAGE_YEARS),
    ).distinct().order_by(desc(ClimateHistoryMonthly.vintage_year))

    if limit:
        vintage_query = vintage_query.limit(limit)

    vintage_years = sorted([v[0] for v in vintage_query.all()])

    zones_trends = []
    for zone_obj in ordered_zones:
        if is_extreme:
            baseline_value = season_extreme_baseline(db, zone_obj.id, metric)
            attr = SEASON_EXTREME_FIELDS[metric][0]
            stat_rows = db.query(ClimateZoneSeasonStats).filter(
                ClimateZoneSeasonStats.zone_id == zone_obj.id,
                ClimateZoneSeasonStats.vintage_year.in_(vintage_years),
            ).all()
            value_by_year = {r.vintage_year: getattr(r, attr) for r in stat_rows}
        else:
            baseline = calculate_season_baseline(db, zone_obj.id)
            baseline_value = getattr(
                baseline, f"{metric}_total" if is_total_metric else f"{metric}_avg", None
            )

            rows = db.query(
                ClimateHistoryMonthly.vintage_year.label("vintage_year"),
                agg_expr.label("value"),
            ).filter(
                ClimateHistoryMonthly.zone_id == zone_obj.id,
                ClimateHistoryMonthly.month.in_(GROWING_SEASON_MONTHS),
                ClimateHistoryMonthly.vintage_year.in_(vintage_years),
            ).group_by(ClimateHistoryMonthly.vintage_year).all()

            value_by_year = {r.vintage_year: r.value for r in rows}

        series = [
            ZoneSeasonValue(
                vintage_year=vy,
                season_label=get_season_label(vy),
                value=to_decimal(value_by_year.get(vy)) if value_by_year.get(vy) is not None else None,
            )
            for vy in vintage_years
        ]

        zones_trends.append(ZoneSeasonTrend(
            zone_id=zone_obj.id,
            zone_name=zone_obj.name,
            zone_slug=zone_obj.slug,
            region_name=zone_obj.region.name if zone_obj.region else None,
            baseline=to_decimal(baseline_value),
            series=series,
        ))

    return ZonesSeasonsCompareResponse(
        metric=metric,
        metric_label=METRIC_LABELS.get(metric) or SEASON_EXTREME_FIELDS[metric][1],
        vintage_years=vintage_years,
        zones=zones_trends,
    )

# =============================================================================
# ENDPOINT: REGIONAL DASHBOARD
# =============================================================================

@router.get("/zones/{slug}/dashboard")
def get_zone_dashboard(
    slug: str,
    user: Optional[PublicUser] = Depends(get_optional_public_user),
    db: Session = Depends(get_db),
):
    """The whole regional dashboard in one payload.

    Phase 3 of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`. The lighter,
    regional sibling of the Pro site dashboard: current-season curve against the
    1986-2005 normal, phenology, disease pressure, a seasonal-history summary
    and regional projections.

    One call rather than five. Every block on the page keys off the same zone,
    so five round trips would be five chances for a partial render — and the
    blocks have DIFFERENT coverage, which the client has to reconcile in one
    place to decide what the page looks like.

    ## Coverage is per block and each block says so

    Thirteen of 23 zones have a live season, 12 have disease, 13 phenology, 21
    seasonal history, 23 projections. No single availability flag can be
    correct, so each block carries `available` and a `reason` written for a
    reader. A region with a season curve, no phenology and full projections is a
    normal response, not a degraded one.

    ## Entitlement

    Public, like every sibling `/zones/{slug}/*` route: the endpoint always
    answers, and two of its blocks answer with a stub instead of numbers.

    **History and projections need a FREE ACCOUNT, not Pro** (changed
    2026-08-25). They were gated on `is_pro`, which withheld what a region IS
    and what it is becoming — the two things that make a region page worth
    linking to and worth landing on from a search, and neither of them a
    decision anyone takes this week. Pro sells the subscriber's own POINT.
    Nothing on this page is Pro any more.

    The stub still names the span and the metrics behind it, so the page shell
    stays crawlable and the prompt can say what signing in actually opens.
    """
    zone = get_zone_or_404(db, slug)
    payload = region_dashboard.build(db, zone.slug,
                                     registered=is_registered(user))
    if payload is None:
        # get_zone_or_404 passed, so the zone exists but is inactive — the
        # builder filters on is_active and this is the only way to reach here.
        raise HTTPException(
            status_code=404,
            detail=f"Climate zone '{slug}' is not active")
    return payload
