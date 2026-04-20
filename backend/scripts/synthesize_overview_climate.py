#!/usr/bin/env python3
"""
scripts/synthesize_overview_climate.py

Synthesize climate_history_monthly, climate_projections,
climate_baseline_monthly, and climate_zone_daily_baseline rows for parent
(region-level) climate_zones by averaging their direct sub-zones' data.

Why this exists
---------------
The BCSD climate model was run per-zone. For some regions both the whole-
region zone and its sub-zones were simulated separately (e.g. Central Otago,
Hawke's Bay). For Marlborough and Wairarapa only the sub-zones were run, so
the recently-added overview climate_zones rows have no history / projections
/ baseline.

The modelling approach permits aggregation, so we synthesize overview rows
as the simple mean of their direct sub-zones' data. Regional Insights
renders uniformly across all zones; users comparing Marlborough to Central
Otago see history/projections for both.

Targets
-------
By default: every `zone_level='region'` climate_zone that has zero rows in
`climate_history_monthly` and has at least one direct sub-zone with data.
Currently that's Marlborough and Wairarapa. Pass `--zone-id N` to target a
specific zone.

Usage
-----
    python scripts/synthesize_overview_climate.py                    # Dry run
    python scripts/synthesize_overview_climate.py --apply            # Commit
    python scripts/synthesize_overview_climate.py --zone-id 22 --apply
    python scripts/synthesize_overview_climate.py --replace --apply  # Overwrite existing

Safety
------
  - Idempotent by default (`ON CONFLICT DO NOTHING` on the natural keys).
  - `--replace` uses `ON CONFLICT DO UPDATE` if you want to re-derive after
    sub-zone data changes.
  - All-or-nothing per target zone: runs in a single transaction, rolls back
    on any error.
  - Prints counts in dry-run mode; commits only with `--apply`.
"""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# SQL fragments. Each INSERT ... SELECT averages each metric across the
# target zone's direct sub-zones (parent_zone_id = :target_id) and groups by
# the table's natural key.
# --------------------------------------------------------------------------

HISTORY_SQL = """
INSERT INTO climate_history_monthly (
    zone_id, date, month, year, vintage_year,
    tmean_mean, tmean_sd, tmin_mean, tmin_sd, tmax_mean, tmax_sd,
    gdd_mean, gdd_sd, rain_mean, rain_sd, solar_mean, solar_sd
)
SELECT
    :target_id, date, month, year, vintage_year,
    AVG(tmean_mean), AVG(tmean_sd),
    AVG(tmin_mean),  AVG(tmin_sd),
    AVG(tmax_mean),  AVG(tmax_sd),
    AVG(gdd_mean),   AVG(gdd_sd),
    AVG(rain_mean),  AVG(rain_sd),
    AVG(solar_mean), AVG(solar_sd)
FROM climate_history_monthly
WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)
GROUP BY date, month, year, vintage_year
{on_conflict}
"""

PROJECTIONS_SQL = """
INSERT INTO climate_projections (
    zone_id, ssp, period, month,
    tmean_delta, tmean_delta_sd, tmean_projected,
    tmax_delta,  tmax_delta_sd,  tmax_projected,
    tmin_delta,  tmin_delta_sd,  tmin_projected,
    rain_delta,  rain_delta_sd,  rain_projected,
    gdd_baseline, gdd_projected
)
SELECT
    :target_id, ssp, period, month,
    AVG(tmean_delta), AVG(tmean_delta_sd), AVG(tmean_projected),
    AVG(tmax_delta),  AVG(tmax_delta_sd),  AVG(tmax_projected),
    AVG(tmin_delta),  AVG(tmin_delta_sd),  AVG(tmin_projected),
    AVG(rain_delta),  AVG(rain_delta_sd),  AVG(rain_projected),
    AVG(gdd_baseline), AVG(gdd_projected)
FROM climate_projections
WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)
GROUP BY ssp, period, month
{on_conflict}
"""

BASELINE_DAILY_SQL = """
INSERT INTO climate_zone_daily_baseline (
    zone_id, day_of_vintage,
    tmean_avg, tmean_sd, tmin_avg, tmin_sd, tmax_avg, tmax_sd,
    gdd_base0_avg,  gdd_base0_sd,  gdd_base10_avg, gdd_base10_sd,
    gdd_base0_cumulative_avg, gdd_base0_cumulative_sd,
    rain_avg, rain_sd, solar_avg, solar_sd
)
SELECT
    :target_id, day_of_vintage,
    AVG(tmean_avg), AVG(tmean_sd),
    AVG(tmin_avg),  AVG(tmin_sd),
    AVG(tmax_avg),  AVG(tmax_sd),
    AVG(gdd_base0_avg),  AVG(gdd_base0_sd),
    AVG(gdd_base10_avg), AVG(gdd_base10_sd),
    AVG(gdd_base0_cumulative_avg), AVG(gdd_base0_cumulative_sd),
    AVG(rain_avg),  AVG(rain_sd),
    AVG(solar_avg), AVG(solar_sd)
FROM climate_zone_daily_baseline
WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)
GROUP BY day_of_vintage
{on_conflict}
"""

BASELINE_MONTHLY_SQL = """
INSERT INTO climate_baseline_monthly (
    zone_id, month, tmean, tmax, tmin, rain, gdd
)
SELECT
    :target_id, month,
    AVG(tmean), AVG(tmax), AVG(tmin), AVG(rain), AVG(gdd)
FROM climate_baseline_monthly
WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)
GROUP BY month
{on_conflict}
"""


ON_CONFLICT_SKIP = {
    'history':          'ON CONFLICT (zone_id, date) DO NOTHING',
    'projections':      'ON CONFLICT (zone_id, ssp, period, month) DO NOTHING',
    'baseline_daily':   'ON CONFLICT (zone_id, day_of_vintage) DO NOTHING',
    'baseline_monthly': 'ON CONFLICT (zone_id, month) DO NOTHING',
}
ON_CONFLICT_UPDATE = {
    'history': """ON CONFLICT (zone_id, date) DO UPDATE SET
        tmean_mean=EXCLUDED.tmean_mean, tmean_sd=EXCLUDED.tmean_sd,
        tmin_mean=EXCLUDED.tmin_mean,   tmin_sd=EXCLUDED.tmin_sd,
        tmax_mean=EXCLUDED.tmax_mean,   tmax_sd=EXCLUDED.tmax_sd,
        gdd_mean=EXCLUDED.gdd_mean,     gdd_sd=EXCLUDED.gdd_sd,
        rain_mean=EXCLUDED.rain_mean,   rain_sd=EXCLUDED.rain_sd,
        solar_mean=EXCLUDED.solar_mean, solar_sd=EXCLUDED.solar_sd""",
    'projections': """ON CONFLICT (zone_id, ssp, period, month) DO UPDATE SET
        tmean_delta=EXCLUDED.tmean_delta, tmean_delta_sd=EXCLUDED.tmean_delta_sd, tmean_projected=EXCLUDED.tmean_projected,
        tmax_delta=EXCLUDED.tmax_delta,   tmax_delta_sd=EXCLUDED.tmax_delta_sd,   tmax_projected=EXCLUDED.tmax_projected,
        tmin_delta=EXCLUDED.tmin_delta,   tmin_delta_sd=EXCLUDED.tmin_delta_sd,   tmin_projected=EXCLUDED.tmin_projected,
        rain_delta=EXCLUDED.rain_delta,   rain_delta_sd=EXCLUDED.rain_delta_sd,   rain_projected=EXCLUDED.rain_projected,
        gdd_baseline=EXCLUDED.gdd_baseline, gdd_projected=EXCLUDED.gdd_projected""",
    'baseline_daily': """ON CONFLICT (zone_id, day_of_vintage) DO UPDATE SET
        tmean_avg=EXCLUDED.tmean_avg, tmean_sd=EXCLUDED.tmean_sd,
        tmin_avg=EXCLUDED.tmin_avg,   tmin_sd=EXCLUDED.tmin_sd,
        tmax_avg=EXCLUDED.tmax_avg,   tmax_sd=EXCLUDED.tmax_sd,
        gdd_base0_avg=EXCLUDED.gdd_base0_avg,   gdd_base0_sd=EXCLUDED.gdd_base0_sd,
        gdd_base10_avg=EXCLUDED.gdd_base10_avg, gdd_base10_sd=EXCLUDED.gdd_base10_sd,
        gdd_base0_cumulative_avg=EXCLUDED.gdd_base0_cumulative_avg,
        gdd_base0_cumulative_sd=EXCLUDED.gdd_base0_cumulative_sd,
        rain_avg=EXCLUDED.rain_avg,  rain_sd=EXCLUDED.rain_sd,
        solar_avg=EXCLUDED.solar_avg, solar_sd=EXCLUDED.solar_sd""",
    'baseline_monthly': """ON CONFLICT (zone_id, month) DO UPDATE SET
        tmean=EXCLUDED.tmean, tmax=EXCLUDED.tmax, tmin=EXCLUDED.tmin,
        rain=EXCLUDED.rain, gdd=EXCLUDED.gdd""",
}


def find_target_zones(db, zone_id=None):
    """Return list of (id, slug, name) for zones that need synthesis.

    Auto-detect picks region-level zones where ANY of the four climate tables
    is missing data AND at least one direct sub-zone has data to source from.
    """
    if zone_id is not None:
        row = db.execute(text(
            "SELECT id, slug, name FROM climate_zones WHERE id = :zid"
        ), {'zid': zone_id}).first()
        return [row] if row else []

    rows = db.execute(text("""
        SELECT DISTINCT cz.id, cz.slug, cz.name, cz.display_order
        FROM climate_zones cz
        WHERE cz.is_active = true
          AND cz.zone_level = 'region'
          AND EXISTS (
            SELECT 1 FROM climate_zones sub
            WHERE sub.parent_zone_id = cz.id AND sub.is_active = true
          )
          AND (
               NOT EXISTS (SELECT 1 FROM climate_history_monthly h       WHERE h.zone_id = cz.id)
            OR NOT EXISTS (SELECT 1 FROM climate_projections p           WHERE p.zone_id = cz.id)
            OR NOT EXISTS (SELECT 1 FROM climate_zone_daily_baseline d   WHERE d.zone_id = cz.id)
            OR NOT EXISTS (SELECT 1 FROM climate_baseline_monthly m      WHERE m.zone_id = cz.id)
          )
        ORDER BY cz.display_order
    """)).fetchall()
    # Strip display_order from tuple so shape matches zone-id lookup path.
    return [(r[0], r[1], r[2]) for r in rows]


def count_source_subzones(db, target_id):
    """Number of direct sub-zones with data, for reporting."""
    return db.execute(text("""
        SELECT
            (SELECT COUNT(DISTINCT zone_id) FROM climate_history_monthly
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)),
            (SELECT COUNT(DISTINCT zone_id) FROM climate_projections
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)),
            (SELECT COUNT(DISTINCT zone_id) FROM climate_zone_daily_baseline
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)),
            (SELECT COUNT(DISTINCT zone_id) FROM climate_baseline_monthly
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true))
    """), {'target_id': target_id}).first()


def preview_row_counts(db, target_id):
    """Estimate how many rows would be inserted (via GROUP BY over sub-zones)."""
    return db.execute(text("""
        SELECT
            (SELECT COUNT(DISTINCT date) FROM climate_history_monthly
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)),
            (SELECT COUNT(DISTINCT (ssp, period, month)) FROM climate_projections
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)),
            (SELECT COUNT(DISTINCT day_of_vintage) FROM climate_zone_daily_baseline
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true)),
            (SELECT COUNT(DISTINCT month) FROM climate_baseline_monthly
             WHERE zone_id IN (SELECT id FROM climate_zones WHERE parent_zone_id = :target_id AND is_active = true))
    """), {'target_id': target_id}).first()


def synthesize_for_zone(db, target_id, target_name, replace=False, apply=False):
    conflict = ON_CONFLICT_UPDATE if replace else ON_CONFLICT_SKIP

    statements = [
        ('climate_history_monthly',       HISTORY_SQL.format(on_conflict=conflict['history'])),
        ('climate_projections',           PROJECTIONS_SQL.format(on_conflict=conflict['projections'])),
        ('climate_zone_daily_baseline',   BASELINE_DAILY_SQL.format(on_conflict=conflict['baseline_daily'])),
        ('climate_baseline_monthly',      BASELINE_MONTHLY_SQL.format(on_conflict=conflict['baseline_monthly'])),
    ]

    if not apply:
        hist_subs, proj_subs, base_d_subs, base_m_subs = count_source_subzones(db, target_id)
        hist_rows, proj_rows, base_d_rows, base_m_rows = preview_row_counts(db, target_id)
        logger.info(f"  would synthesize from:")
        logger.info(f"    climate_history_monthly     - {hist_subs} sub-zones -> up to {hist_rows} monthly rows")
        logger.info(f"    climate_projections         - {proj_subs} sub-zones -> up to {proj_rows} scenario rows")
        logger.info(f"    climate_zone_daily_baseline - {base_d_subs} sub-zones -> up to {base_d_rows} day-of-vintage rows")
        logger.info(f"    climate_baseline_monthly    - {base_m_subs} sub-zones -> up to {base_m_rows} monthly rows")
        return

    inserted = {}
    for table_name, sql in statements:
        result = db.execute(text(sql), {'target_id': target_id})
        inserted[table_name] = result.rowcount
        logger.info(f"  {table_name:32s} {result.rowcount:>6} rows affected")
    db.commit()
    return inserted


def main():
    parser = argparse.ArgumentParser(description='Synthesize overview climate data from sub-zones')
    parser.add_argument('--zone-id', type=int, help='Target a specific zone (default: auto-detect regions missing data)')
    parser.add_argument('--apply',   action='store_true', help='Commit changes (otherwise dry run)')
    parser.add_argument('--replace', action='store_true', help='Overwrite existing rows (otherwise ON CONFLICT DO NOTHING)')
    args = parser.parse_args()

    db = SessionLocal()
    try:
        targets = find_target_zones(db, args.zone_id)
        if not targets:
            logger.info("No zones need synthesis. (Pass --zone-id to force, or every region-level zone already has history.)")
            return

        logger.info(f"Mode: {'APPLY (commit)' if args.apply else 'DRY RUN'}"
                    f"{', REPLACE existing' if args.replace else ''}")
        logger.info(f"Target zones ({len(targets)}):")
        for t in targets:
            logger.info(f"  [{t[0]}] {t[2]} (slug={t[1]})")
        logger.info("")

        for target in targets:
            target_id, target_slug, target_name = target
            logger.info(f"--- {target_name} (zone_id={target_id}) ---")
            synthesize_for_zone(db, target_id, target_name,
                                replace=args.replace, apply=args.apply)
            logger.info("")

        if args.apply:
            logger.info("Done. Run the script again to verify idempotency (should be no-ops).")
        else:
            logger.info("Dry run complete. Re-run with --apply to commit.")

    finally:
        db.close()


if __name__ == '__main__':
    main()
