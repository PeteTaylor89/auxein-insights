#!/usr/bin/env python3
"""
scripts/upload_climate_extremes.py

Load the seasonal extreme datasets in backend/data/Regional_additional_stats/
into the climate extreme tables. Zone is resolved by CSV filename stem
(e.g. "Waipara.csv" -> ClimateZone.name == "Waipara"), matching
upload_climate_history.py.

Datasets (sub-directories of --root):
  Regional_Seasonal_Stats         -> climate_zone_season_stats (source='modelled')
  Regional_Seasonal_Baseline      -> climate_zone_season_baseline
  Regional_Seasonal_Rx1day        -> climate_history_monthly.rx1day_* (UPDATE)
  Regional_Seasonal_Rx1day_Baseline -> climate_baseline_monthly.rx1day_* (UPDATE)
  Regional_Projections_Extremes   -> climate_projection_extremes

Reloading is idempotent: modelled season-stats / baseline / projection rows for
a zone are cleared before reinsert (observed season-stats rows are preserved).

Usage:
    python scripts/upload_climate_extremes.py --root backend/data/Regional_additional_stats
    python scripts/upload_climate_extremes.py --root <dir> --dataset stats --dry-run
"""

import argparse
import csv
import logging
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.session import SessionLocal
from db.models.climate import (
    ClimateZone,
    ClimateHistoryMonthly,
    ClimateBaselineMonthly,
    ClimateZoneSeasonStats,
    ClimateZoneSeasonBaseline,
    ClimateProjectionExtremes,
)

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

SUBDIRS = {
    'stats': 'Regional_Seasonal_Stats',
    'baseline': 'Regional_Seasonal_Baseline',
    'rx1day': 'Regional_Seasonal_Rx1day',
    'rx1day_baseline': 'Regional_Seasonal_Rx1day_Baseline',
    'projections': 'Regional_Projections_Extremes',
    'frost': 'Monthly Frost (*_frost.csv | Regional_Seasonal_Frost)',
    'frost_baseline': 'Monthly Frost Baseline (*_frost_baseline.csv | Regional_Seasonal_Frost_Baseline)',
}


def dec(value) -> Optional[Decimal]:
    if value is None:
        return None
    s = str(value).strip()
    if s == '' or s.lower() in ('na', 'nan', 'null'):
        return None
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def to_int(value) -> Optional[int]:
    d = dec(value)
    return int(d) if d is not None else None


def resolve_zone(db, stem: str):
    return db.query(ClimateZone).filter(ClimateZone.name == stem).first()


def iter_zone_files(root: Path, key: str):
    """Yield (zone_name, filepath) for each CSV in a dataset subdir."""
    subdir = root / SUBDIRS[key]
    if not subdir.exists():
        logger.warning(f"  Sub-directory missing: {subdir}")
        return
    for fp in sorted(subdir.glob('*.csv')):
        yield fp.stem, fp


def load_stats(db, root, dry_run):
    inserted = 0
    for stem, fp in iter_zone_files(root, 'stats'):
        zone = resolve_zone(db, stem)
        if not zone:
            logger.warning(f"  [stats] zone '{stem}' not found — skipping")
            continue
        if not dry_run:
            db.query(ClimateZoneSeasonStats).filter(
                ClimateZoneSeasonStats.zone_id == zone.id,
                ClimateZoneSeasonStats.source == 'modelled',
            ).delete()
        rows = []
        with open(fp, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                vy = to_int(row.get('vintage_year'))
                if vy is None:
                    continue
                rows.append(ClimateZoneSeasonStats(
                    zone_id=zone.id,
                    vintage_year=vy,
                    last_frost_doy=dec(row.get('last_frost_doy')),
                    last_frost_date=(row.get('last_frost_date') or '').strip() or None,
                    early_frost_mean=dec(row.get('early_frost_mean')),
                    early_frost_sd=dec(row.get('early_frost_sd')),
                    frost_days_mean=dec(row.get('frost_days_mean')),
                    frost_days_sd=dec(row.get('frost_days_sd')),
                    hot_days30_mean=dec(row.get('hot_days30_mean')),
                    hot_days30_sd=dec(row.get('hot_days30_sd')),
                    r99p_mean=dec(row.get('r99p_mean')),
                    r99p_sd=dec(row.get('r99p_sd')),
                    source='modelled',
                ))
        if not dry_run:
            db.bulk_save_objects(rows)
            db.commit()
        inserted += len(rows)
        logger.info(f"  [stats] {zone.name}: {len(rows)} seasons")
    return inserted


def load_season_baseline(db, root, dry_run):
    inserted = 0
    for stem, fp in iter_zone_files(root, 'baseline'):
        zone = resolve_zone(db, stem)
        if not zone:
            logger.warning(f"  [baseline] zone '{stem}' not found — skipping")
            continue
        if not dry_run:
            db.query(ClimateZoneSeasonBaseline).filter(
                ClimateZoneSeasonBaseline.zone_id == zone.id
            ).delete()
        with open(fp, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                rec = ClimateZoneSeasonBaseline(
                    zone_id=zone.id,
                    baseline_period=(row.get('baseline_period') or '').strip() or None,
                    last_frost_doy_mean=dec(row.get('last_frost_doy_mean')),
                    last_frost_doy_sd=dec(row.get('last_frost_doy_sd')),
                    last_frost_date=(row.get('last_frost_date') or '').strip() or None,
                    early_frost_mean=dec(row.get('early_frost_mean')),
                    early_frost_sd=dec(row.get('early_frost_sd')),
                    frost_days_mean=dec(row.get('frost_days_mean')),
                    frost_days_sd=dec(row.get('frost_days_sd')),
                    hot_days30_mean=dec(row.get('hot_days30_mean')),
                    hot_days30_sd=dec(row.get('hot_days30_sd')),
                    r99p_mean=dec(row.get('r99p_mean')),
                    r99p_sd=dec(row.get('r99p_sd')),
                )
                if not dry_run:
                    db.add(rec)
                inserted += 1
                break  # one baseline row per zone
        if not dry_run:
            db.commit()
        logger.info(f"  [baseline] {zone.name}: 1 row")
    return inserted


def load_rx1day(db, root, dry_run):
    """UPDATE monthly history rows by (zone, vintage_year, month)."""
    updated = 0
    for stem, fp in iter_zone_files(root, 'rx1day'):
        zone = resolve_zone(db, stem)
        if not zone:
            logger.warning(f"  [rx1day] zone '{stem}' not found — skipping")
            continue
        n = 0
        with open(fp, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                vy = to_int(row.get('vintage_year'))
                month = to_int(row.get('month'))
                if vy is None or month is None:
                    continue
                if not dry_run:
                    n += db.query(ClimateHistoryMonthly).filter(
                        ClimateHistoryMonthly.zone_id == zone.id,
                        ClimateHistoryMonthly.vintage_year == vy,
                        ClimateHistoryMonthly.month == month,
                    ).update({
                        'rx1day_mean': dec(row.get('rx1day_mean')),
                        'rx1day_sd': dec(row.get('rx1day_sd')),
                    })
                else:
                    n += 1
        if not dry_run:
            db.commit()
        updated += n
        logger.info(f"  [rx1day] {zone.name}: {n} monthly rows updated")
    return updated


def load_rx1day_baseline(db, root, dry_run):
    """UPDATE monthly baseline rows by (zone, month)."""
    updated = 0
    for stem, fp in iter_zone_files(root, 'rx1day_baseline'):
        zone = resolve_zone(db, stem)
        if not zone:
            logger.warning(f"  [rx1day_baseline] zone '{stem}' not found — skipping")
            continue
        n = 0
        with open(fp, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                month = to_int(row.get('month'))
                if month is None:
                    continue
                if not dry_run:
                    n += db.query(ClimateBaselineMonthly).filter(
                        ClimateBaselineMonthly.zone_id == zone.id,
                        ClimateBaselineMonthly.month == month,
                    ).update({
                        'rx1day_mean': dec(row.get('rx1day_mean')),
                        'rx1day_sd': dec(row.get('rx1day_sd')),
                    })
                else:
                    n += 1
        if not dry_run:
            db.commit()
        updated += n
        logger.info(f"  [rx1day_baseline] {zone.name}: {n} months updated")
    return updated


def iter_frost_files(root: Path, kind: str):
    """
    Yield (zone_name, filepath) for monthly-frost CSVs. Supports both the
    subdir convention (Regional_Seasonal_Frost[_Baseline]/{Zone}.csv) and the
    top-level example naming ({Zone}_frost[_baseline].csv).
    """
    suffix = '_frost_baseline' if kind == 'baseline' else '_frost'
    subdir = root / ('Regional_Seasonal_FrostMonthly_Baseline' if kind == 'baseline' else 'Regional_Seasonal_FrostMonthly')
    if subdir.exists():
        for fp in sorted(subdir.glob('*.csv')):
            yield fp.stem, fp
    for fp in sorted(root.glob(f'*{suffix}.csv')):
        yield fp.stem[:-len(suffix)], fp


def load_frost(db, root, dry_run):
    """UPDATE monthly history frost_days by (zone, vintage_year, month)."""
    updated = 0
    for stem, fp in iter_frost_files(root, 'monthly'):
        zone = resolve_zone(db, stem)
        if not zone:
            logger.warning(f"  [frost] zone '{stem}' not found — skipping")
            continue
        n = 0
        with open(fp, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                vy = to_int(row.get('vintage_year'))
                month = to_int(row.get('month'))
                if vy is None or month is None:
                    continue
                if not dry_run:
                    n += db.query(ClimateHistoryMonthly).filter(
                        ClimateHistoryMonthly.zone_id == zone.id,
                        ClimateHistoryMonthly.vintage_year == vy,
                        ClimateHistoryMonthly.month == month,
                    ).update({
                        'frost_days_mean': dec(row.get('frost_days_mean')),
                        'frost_days_sd': dec(row.get('frost_days_sd')),
                    })
                else:
                    n += 1
        if not dry_run:
            db.commit()
        updated += n
        logger.info(f"  [frost] {zone.name}: {n} monthly rows updated")
    return updated


def load_frost_baseline(db, root, dry_run):
    """UPDATE monthly baseline frost_days by (zone, month)."""
    updated = 0
    for stem, fp in iter_frost_files(root, 'baseline'):
        zone = resolve_zone(db, stem)
        if not zone:
            logger.warning(f"  [frost_baseline] zone '{stem}' not found — skipping")
            continue
        n = 0
        with open(fp, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                month = to_int(row.get('month'))
                if month is None:
                    continue
                if not dry_run:
                    n += db.query(ClimateBaselineMonthly).filter(
                        ClimateBaselineMonthly.zone_id == zone.id,
                        ClimateBaselineMonthly.month == month,
                    ).update({
                        'frost_days_mean': dec(row.get('frost_days_mean')),
                        'frost_days_sd': dec(row.get('frost_days_sd')),
                    })
                else:
                    n += 1
        if not dry_run:
            db.commit()
        updated += n
        logger.info(f"  [frost_baseline] {zone.name}: {n} months updated")
    return updated


def load_projection_extremes(db, root, dry_run):
    inserted = 0
    for stem, fp in iter_zone_files(root, 'projections'):
        zone = resolve_zone(db, stem)
        if not zone:
            logger.warning(f"  [projections] zone '{stem}' not found — skipping")
            continue
        if not dry_run:
            db.query(ClimateProjectionExtremes).filter(
                ClimateProjectionExtremes.zone_id == zone.id
            ).delete()
        rows = []
        with open(fp, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                ssp = (row.get('SSP') or '').strip()
                period = (row.get('Period') or '').strip()
                if not ssp or not period:
                    continue
                rows.append(ClimateProjectionExtremes(
                    zone_id=zone.id,
                    ssp=ssp,
                    period=period,
                    frost_days_baseline=dec(row.get('Baseline_FrostDays')),
                    frost_days_delta=dec(row.get('Delta_FrostDays_FD')),
                    frost_days_projected=dec(row.get('Projected_FrostDays')),
                    spring_frost_baseline=dec(row.get('Baseline_SpringFrost')),
                    spring_frost_delta=dec(row.get('Delta_SpringFrost_FD_SON')),
                    spring_frost_projected=dec(row.get('Projected_SpringFrost')),
                    hot_days30_baseline=dec(row.get('Baseline_HotDays30')),
                    hot_days30_delta=dec(row.get('Delta_HotDays30_TX30')),
                    hot_days30_projected=dec(row.get('Projected_HotDays30')),
                    r99p_baseline=dec(row.get('Baseline_R99p')),
                    r99p_delta=dec(row.get('Delta_R99p_R99pVAL')),
                    r99p_projected=dec(row.get('Projected_R99p')),
                ))
        if not dry_run:
            db.bulk_save_objects(rows)
            db.commit()
        inserted += len(rows)
        logger.info(f"  [projections] {zone.name}: {len(rows)} scenario/period rows")
    return inserted


LOADERS = {
    'stats': load_stats,
    'baseline': load_season_baseline,
    'rx1day': load_rx1day,
    'rx1day_baseline': load_rx1day_baseline,
    'projections': load_projection_extremes,
    'frost': load_frost,
    'frost_baseline': load_frost_baseline,
}


def main():
    parser = argparse.ArgumentParser(description="Upload climate extreme datasets")
    parser.add_argument('--root', required=True, help="Path to Regional_additional_stats directory")
    parser.add_argument('--dataset', choices=['all'] + list(LOADERS), default='all')
    parser.add_argument('--dry-run', action='store_true', help="Parse only, no DB writes")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        logger.error(f"Root not found: {root}")
        sys.exit(1)

    datasets = list(LOADERS) if args.dataset == 'all' else [args.dataset]
    db = SessionLocal()
    try:
        for key in datasets:
            logger.info(f"\n=== {SUBDIRS[key]} ===")
            total = LOADERS[key](db, root, args.dry_run)
            logger.info(f"  -> {total} rows {'(dry-run)' if args.dry_run else 'written'}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
