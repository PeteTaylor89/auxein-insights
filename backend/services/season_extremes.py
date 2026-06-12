# backend/services/season_extremes.py
"""
Compute seasonal extreme metrics for a completed growing season from the live
zone-daily series, and fold them into climate_zone_season_stats as 'observed'
rows — so the history self-extends each year without new modelled CSVs.

Definitions match the modelled dataset (verified from the CSVs 2026-06-12):
- FD (frost_days)   = days Tmin < 0°C over the FULL vintage year (Jul-Jun) —
                      most frosts are winter, so this is an annual count
- spring frost      = FD in Sep-Nov (SON)
- last frost        = last spring frost (Sep-Dec window), DOY + 'DD-Mon'
- TX30 (hot_days30) = days Tmax > 30°C (vintage year; summer only in practice)
- R99p              = 99th-percentile of wet-day (>=1mm) daily rainfall (mm)

Caveats:
- climate_zone_daily is a single IDW-aggregated series, so observed rows have no
  spatial SD (mean only); modelled rows keep their SD.
- Annual FD needs full Jul-Jun coverage incl. winter. The station series is young
  (Waipara starts Sep 2025), so upsert is gated on full vintage coverage and will
  legitimately skip until a complete vintage year of data exists (~2027).
"""

from datetime import date
from decimal import Decimal
from typing import Optional, Dict

from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models.realtime_climate import ClimateZoneDaily
from db.models.climate import ClimateZone, ClimateZoneSeasonStats

FROST_THRESHOLD_C = 0.0     # Tmin < 0
HOT_DAY_THRESHOLD_C = 30.0  # Tmax > 30
WET_DAY_MM = 1.0            # rainfall >= 1mm counts as a wet day
SPRING_MONTHS = (9, 10, 11)
LAST_FROST_MONTHS = (9, 10, 11, 12)  # spring last-frost window within Sep-Apr


def _percentile(sorted_vals, p: float) -> Optional[float]:
    """Linear-interpolation percentile (p in 0-100) over a sorted list."""
    n = len(sorted_vals)
    if n == 0:
        return None
    if n == 1:
        return sorted_vals[0]
    k = (n - 1) * (p / 100.0)
    lo = int(k)
    hi = min(lo + 1, n - 1)
    frac = k - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def vintage_window(vintage_year: int):
    """Full vintage year date range (Jul 1 prev year -> Jun 30 vintage year)."""
    return date(vintage_year - 1, 7, 1), date(vintage_year, 6, 30)


def compute_season_extremes(db: Session, zone_id: int, vintage_year: int) -> Optional[Dict]:
    """
    Compute seasonal extremes from climate_zone_daily for one zone/vintage.
    FD/hot/R99p are over the full vintage year; spring frost is the Sep-Nov
    subset. Returns a dict of values (sd omitted — single series), or None if no
    data.
    """
    start, end = vintage_window(vintage_year)
    rows = db.query(ClimateZoneDaily).filter(
        ClimateZoneDaily.zone_id == zone_id,
        ClimateZoneDaily.date >= start,
        ClimateZoneDaily.date <= end,
    ).order_by(ClimateZoneDaily.date).all()

    if not rows:
        return None

    frost_days = [d for d in rows if d.temp_min is not None and float(d.temp_min) < FROST_THRESHOLD_C]
    spring_frost = [d for d in frost_days if d.date.month in SPRING_MONTHS]
    hot_days = [d for d in rows if d.temp_max is not None and float(d.temp_max) > HOT_DAY_THRESHOLD_C]

    # Last spring frost (Sep-Dec)
    last_spring = [d for d in frost_days if d.date.month in LAST_FROST_MONTHS]
    last_frost_d = max((d.date for d in last_spring), default=None)

    # R99p — 99th percentile of wet-day rainfall (mm)
    wet = sorted(float(d.rainfall_mm) for d in rows if d.rainfall_mm is not None and float(d.rainfall_mm) >= WET_DAY_MM)
    r99p = _percentile(wet, 99.0)

    return {
        'vintage_year': vintage_year,
        'frost_days_mean': len(frost_days),
        'early_frost_mean': len(spring_frost),
        'hot_days30_mean': len(hot_days),
        'last_frost_doy': (last_frost_d.timetuple().tm_yday if last_frost_d else None),
        'last_frost_date': (last_frost_d.strftime('%d-%b') if last_frost_d else None),
        'r99p_mean': (round(r99p, 2) if r99p is not None else None),
        'latest_data_date': rows[-1].date,
    }


def season_is_complete(db: Session, zone_id: int, vintage_year: int) -> bool:
    """
    The vintage is complete only when the daily series covers the full Jul-Jun
    window — early winter (≤ early Aug) through end-of-vintage (≥ late Jun).
    Annual FD is meaningless without the winter months.
    """
    start, end = vintage_window(vintage_year)
    earliest = db.query(func.min(ClimateZoneDaily.date)).filter(
        ClimateZoneDaily.zone_id == zone_id,
        ClimateZoneDaily.date >= start,
        ClimateZoneDaily.date <= end,
    ).scalar()
    latest = db.query(func.max(ClimateZoneDaily.date)).filter(
        ClimateZoneDaily.zone_id == zone_id,
        ClimateZoneDaily.date >= start,
        ClimateZoneDaily.date <= end,
    ).scalar()
    if not earliest or not latest:
        return False
    # Need coverage from early winter through the end of the vintage year.
    return earliest <= date(vintage_year - 1, 8, 1) and latest >= date(vintage_year, 6, 25)


def upsert_observed_season(db: Session, zone_id: int, vintage_year: int, force: bool = False) -> str:
    """
    Compute + store an 'observed' season-stats row. Never clobbers a 'modelled'
    row (the modelled record wins for 1987-2024). Returns a status string.
    """
    if not force and not season_is_complete(db, zone_id, vintage_year):
        return 'skipped: season incomplete'

    existing = db.query(ClimateZoneSeasonStats).filter(
        ClimateZoneSeasonStats.zone_id == zone_id,
        ClimateZoneSeasonStats.vintage_year == vintage_year,
    ).first()
    if existing and existing.source == 'modelled':
        return 'skipped: modelled row present'

    stats = compute_season_extremes(db, zone_id, vintage_year)
    if not stats:
        return 'skipped: no daily data'

    target = existing or ClimateZoneSeasonStats(zone_id=zone_id, vintage_year=vintage_year)
    target.source = 'observed'
    target.frost_days_mean = Decimal(str(stats['frost_days_mean']))
    target.early_frost_mean = Decimal(str(stats['early_frost_mean']))
    target.hot_days30_mean = Decimal(str(stats['hot_days30_mean']))
    target.r99p_mean = Decimal(str(stats['r99p_mean'])) if stats['r99p_mean'] is not None else None
    target.last_frost_doy = Decimal(str(stats['last_frost_doy'])) if stats['last_frost_doy'] is not None else None
    target.last_frost_date = stats['last_frost_date']
    # SD columns intentionally left null (single IDW series)
    if existing is None:
        db.add(target)
    db.commit()
    return 'updated' if existing else 'inserted'
