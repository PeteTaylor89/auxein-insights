"""Monthly and 16-day index composites, per-area baselines and the zone rollup.

Phase 3 of the satellite indices plan. Reads `area_index_obs` (Phase 2) and
writes the three tables that customers and zone pages read:

* `area_index_composite` - one value per area, index and period
* `area_index_baseline`  - that area's own climatology per month / 16-day bin
* `zone_index_monthly`   - planted-weighted rollup of register blocks per zone

A dry run unless `--apply`.

    # nightly, after the ingest (satellite.sh): recent periods for every area,
    # plus a full build for any area whose baseline is missing or out of date
    python backend/scripts/satellite_composites.py --apply

    # everything, from scratch: after the archive backfill, or a rule change here
    python backend/scripts/satellite_composites.py --rebuild --apply

## What counts as a read (the Phase 0 rules, unchanged)

A read is CLEAN for an index when, at that index's own resolution (10 m for
NDVI, 20 m for NDMI and NDRE), at least `MIN_PX` pixels and `MIN_FRAC` of the
area were clear. The per-read value is the area's pixel MEDIAN (`*_p50`), not
its mean: a headland or a shed edge moves the mean.

One area can have several clean reads on one date, and exactly one counts:

1. **The latest processing baseline.** Planetary Computer serves many
   2017-2023 acquisitions TWICE, as the original processing and the 05.x
   reprocessing, under different item ids AND different `s2:datatake_id`s
   (`..._N04.00` vs `..._N05.10`) - so the ingest's per-acquisition
   de-duplication does not merge them and both are read. In the Phase 0 blocks
   10% of acquisitions came twice, mostly 2022-23. The two agree on average
   (NDVI 05.10 minus 04.00: mean +0.0002, p95 |diff| 0.01) but single pairs
   differ by up to 0.14, where the cloud mask was redone.
2. then the fuller read (overlapping tiles at a tile edge),
3. then the item id, so the choice never depends on row order. Without this a
   nightly run and a rebuild picked different reads from the same data.

## Composites

`median` is the median of the clean reads' per-area medians in the period.
`p10`/`p90` are the medians of the reads' own p10/p90 - the typical WITHIN-block
spread that period, which is what a vigour map would show - not the spread
between dates. `n_obs` is the number of clean dates, and is the honesty column:
a month built from one read carries the full single-read noise (Phase 0: NDVI
sigma ~0.05), and the reader decides what to show.

Monthly composites are written from one clean read. 16-day composites need
`MIN_OBS_16D`: Phase 0 found a 5-day median gap in season but an 18-day 90th
percentile, so a one-read 16-day value is the norm in cloudy spells and would
be a single read wearing a composite's name.

16-day bins are fixed from 1 January (bin 1 = days 1-16 ... bin 23 = day 353
to year end), so a bin means the same days every year and has a baseline.

## Baselines, anomaly, percentile

The baseline for a bin is the mean, SD and p10/p50/p90 of that area's own
composite medians for that bin across COMPLETE calendar years (the current NZ
year is excluded, so a baseline is fixed for the year and a value is never
scored against itself). It is rebuilt once a year, on the first nightly run
after 1 January, and whenever an area's history is newly complete.

Only areas with `history_complete` get a baseline: an area whose archive is
still being read would get a baseline from whatever years happened to land.

`anomaly = median - baseline mean`. `percentile` is where the value falls on a
normal distribution with the baseline's mean and SD. With 8-9 years of
Sentinel-2 an empirical rank moves in steps of ~11 points and cannot place a
value outside the range seen, which is exactly the case people look for. Both
are left NULL below `MIN_BASELINE_YEARS`.

## Zone rollup

Register areas only (`source = 'register'`), assigned to every active WINE zone
containing a point on the block's surface - a block counts in both its region
and its sub-zone. The same point-in-zone rule as the Phase 0 block selection.

`mean` is weighted by planted hectares. `anomaly` is the planted-weighted mean
of the areas' OWN anomalies, not the zone mean minus a zone baseline: which
blocks were clear changes month to month, and a month where only the high,
cool blocks were clear would otherwise read as a zone-wide anomaly.
`coverage` is the share of the zone's register hectares with a composite that
month.
"""
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from db.session import SessionLocal  # noqa: E402

NZ = ZoneInfo("Pacific/Auckland")
INDICES = (("ndvi", 10), ("ndmi", 20), ("ndre", 20))
MIN_PX, MIN_FRAC = 8, 0.8
MIN_OBS_16D = 2
MIN_BASELINE_YEARS = 5
LOOKBACK_DAYS = 45
EPOCH = "1900-01-01"

# 16-day bin of a date, as its first day and as its number 1..23.
BIN16_START = "(date_trunc('year', {d})::date + 16 * ((extract(doy from {d})::int - 1) / 16))"
BIN16_NO = "((extract(doy from {d})::int - 1) / 16 + 1)"

# `_scope(area_id, from_date)`: which areas to rebuild, from which date. An area
# built in full has from_date = EPOCH; the nightly recent pass uses the lookback.
SCOPE_DDL = """
CREATE TEMP TABLE _scope (area_id bigint PRIMARY KEY, from_date date NOT NULL,
                          month_from date, bin_from date) ON COMMIT DROP
"""

SCOPE_ALIGN = f"""
UPDATE _scope SET month_from = date_trunc('month', from_date)::date,
                  bin_from = {BIN16_START.format(d="from_date")}
"""

READS = """
CREATE TEMP TABLE _reads ON COMMIT DROP AS
SELECT DISTINCT ON (o.area_id, o.obs_date)
       o.area_id, o.obs_date, o.{ix}_p50 AS v, o.{ix}_p10 AS lo, o.{ix}_p90 AS hi,
       o.n_valid_{res} AS nv
FROM area_index_obs o
JOIN monitored_area a ON a.id = o.area_id AND a.geom_hash = o.geom_hash
JOIN _scope s ON s.area_id = o.area_id
JOIN sat_scene sc ON sc.item_id = o.item_id
WHERE o.obs_date >= LEAST(s.month_from, s.bin_from)
  AND o.n_valid_{res} >= {min_px} AND o.n_valid_{res} >= {min_frac} * o.n_total_{res}
  AND o.{ix}_p50 IS NOT NULL
ORDER BY o.area_id, o.obs_date,
         CASE WHEN sc.processing_baseline ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN sc.processing_baseline::numeric END DESC NULLS LAST,
         o.n_valid_{res} DESC, o.item_id DESC
"""

COMP_DDL = """
CREATE TEMP TABLE _comp (area_id bigint, index_name text, period text, period_start date,
                         median real, p10 real, p90 real, n_obs smallint, n_valid_px integer,
                         bin_kind text, bin smallint) ON COMMIT DROP
"""

# One composite per (area, period) from the clean reads, staged with the baseline
# bin it belongs to, so the final write picks up its anomaly in the same pass.
STAGE_COMPOSITES = """
INSERT INTO _comp
SELECT r.area_id, :ix, :period, {start} AS ps,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY r.v),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY r.lo),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY r.hi),
       count(*), sum(r.nv), :bin_kind, {bin_no}
FROM _reads r JOIN _scope s ON s.area_id = r.area_id
WHERE {start} >= s.{from_col}
GROUP BY r.area_id, ps
HAVING count(*) >= :min_obs
"""

# Areas whose baseline must be (re)built: history complete, and either no
# baseline yet or one built before this NZ year began.
BASELINE_DUE = """
SELECT a.id FROM monitored_area a
WHERE a.status = 'active' AND a.history_complete
  AND NOT EXISTS (SELECT 1 FROM area_index_baseline b
                  WHERE b.area_id = a.id AND b.updated_at >= :year_start)
"""

INSERT_BASELINE = """
INSERT INTO area_index_baseline (area_id, index_name, source, bin_kind, bin, mean, sd,
                                 p10, p50, p90, n_years, first_year, last_year, updated_at)
SELECT c.area_id, c.index_name, 's2', c.bin_kind, c.bin,
       avg(c.median), stddev_samp(c.median),
       percentile_cont(0.1) WITHIN GROUP (ORDER BY c.median),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY c.median),
       percentile_cont(0.9) WITHIN GROUP (ORDER BY c.median),
       count(*), min(extract(year from c.period_start)), max(extract(year from c.period_start)),
       now()
FROM _comp c
WHERE c.area_id = ANY(:ids) AND c.median IS NOT NULL
  AND extract(year from c.period_start) < :this_year
GROUP BY c.area_id, c.index_name, c.bin_kind, c.bin
"""

DELETE_COMPOSITES = """
DELETE FROM area_index_composite c USING _scope s
WHERE c.area_id = s.area_id
  AND ((c.period = 'month' AND c.period_start >= s.month_from)
    OR (c.period = '16d' AND c.period_start >= s.bin_from))
"""

# Each composite is written ONCE, with its anomaly, from the staged rows. The
# first prod rebuild (2026-09-24) inserted the composites and then UPDATEd ~6M of
# them to add the anomaly. An update writes a new row version and index entry for
# every row: locally 1.35M rows took ~55 s whatever the plan, and on the prod
# instance the step ran for over an hour. Joining at insert time makes it free.
WRITE_COMPOSITES = f"""
INSERT INTO area_index_composite (area_id, index_name, period, period_start, median, p10, p90,
                                  n_obs, n_valid_px, anomaly, percentile, baseline_source,
                                  baseline_years, updated_at)
SELECT k.area_id, k.index_name, k.period, k.period_start, k.median, k.p10, k.p90,
       k.n_obs, k.n_valid_px,
       k.median - b.mean,
       LEAST(100, GREATEST(0, 50 * (1 + erf(((k.median - b.mean) / (b.sd * sqrt(2)))::float8)))),
       b.source, b.n_years, now()
FROM _comp k
LEFT JOIN area_index_baseline b
  ON b.area_id = k.area_id AND b.index_name = k.index_name AND b.source = 's2'
 AND b.bin_kind = k.bin_kind AND b.bin = k.bin
 AND b.n_years >= {MIN_BASELINE_YEARS} AND b.sd > 0 AND k.median IS NOT NULL
"""

ZONE_ROLLUP = """
WITH za AS (
  SELECT a.id AS area_id, z.id AS zone_id, a.area_ha::float8 AS ha
  FROM monitored_area a
  JOIN climate_zones z
    ON z.is_active AND z.geometry IS NOT NULL
   AND z.industry_id = (SELECT id FROM industries WHERE key = 'wine')
   AND ST_Intersects(z.geometry, ST_PointOnSurface(a.geometry))
  WHERE a.source = 'register' AND a.status = 'active'
),
tot AS (SELECT zone_id, sum(ha) AS ha FROM za GROUP BY zone_id)
INSERT INTO zone_index_monthly (zone_id, index_name, year, month, mean, p10, p90, anomaly,
                                n_areas, n_obs, planted_ha, coverage, updated_at)
SELECT za.zone_id, c.index_name,
       extract(year from c.period_start), extract(month from c.period_start),
       sum(c.median * za.ha) / sum(za.ha),
       percentile_cont(0.1) WITHIN GROUP (ORDER BY c.median),
       percentile_cont(0.9) WITHIN GROUP (ORDER BY c.median),
       sum(c.anomaly * za.ha) FILTER (WHERE c.anomaly IS NOT NULL)
         / NULLIF(sum(za.ha) FILTER (WHERE c.anomaly IS NOT NULL), 0),
       count(*), sum(c.n_obs), sum(za.ha), LEAST(1, sum(za.ha) / max(tot.ha)), now()
FROM za
JOIN tot ON tot.zone_id = za.zone_id
JOIN area_index_composite c ON c.area_id = za.area_id AND c.period = 'month'
WHERE c.period_start >= :zone_from AND c.median IS NOT NULL
GROUP BY za.zone_id, c.index_name, c.period_start
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--rebuild", action="store_true",
                    help="every active area, every period, every baseline and zone month")
    ap.add_argument("--lookback-days", type=int, default=LOOKBACK_DAYS,
                    help="nightly: recompute periods touching the last N days")
    ap.add_argument("--area-ids", help="comma-separated monitored_area ids to build in full")
    ap.add_argument("--apply", action="store_true", help="write (default: report only)")
    args = ap.parse_args()

    now_nz = datetime.now(NZ)
    this_year = now_nz.year
    year_start = datetime(this_year, 1, 1, tzinfo=NZ)
    since = (now_nz - timedelta(days=args.lookback_days)).date()

    db = SessionLocal()
    try:
        if args.rebuild:
            full = [r[0] for r in db.execute(text(
                "SELECT id FROM monitored_area WHERE status = 'active' ORDER BY id"))]
            base = [r[0] for r in db.execute(text(
                "SELECT id FROM monitored_area WHERE status = 'active' AND history_complete"))]
            recent_all = False
        else:
            base = [r[0] for r in db.execute(text(BASELINE_DUE), {"year_start": year_start})]
            full = sorted(set(base) | {int(x) for x in (args.area_ids or "").split(",") if x})
            recent_all = True
        recent_month = since.replace(day=1).isoformat()

        n_active = db.execute(text(
            "SELECT count(*) FROM monitored_area WHERE status = 'active'")).scalar()
        print(f"[composites] {'rebuild' if args.rebuild else 'nightly'}: "
              f"{len(full)} area(s) in full, {len(base)} baseline(s) due, "
              f"recent from {since if recent_all else '-'} for {n_active if recent_all else 0} "
              f"area(s), apply={args.apply}")
        if not args.apply:
            print("[composites] dry run - pass --apply to write")
            return

        db.execute(text(SCOPE_DDL))
        if recent_all:
            db.execute(text("INSERT INTO _scope (area_id, from_date) SELECT id, :d "
                            "FROM monitored_area WHERE status = 'active'"), {"d": since})
        if full:
            db.execute(text("""INSERT INTO _scope (area_id, from_date)
                               SELECT unnest(CAST(:ids AS bigint[])), CAST(:d AS date)
                               ON CONFLICT (area_id) DO UPDATE SET from_date = EXCLUDED.from_date"""),
                       {"ids": full, "d": EPOCH})
        db.execute(text(SCOPE_ALIGN))
        db.execute(text("ANALYZE _scope"))

        db.execute(text(COMP_DDL))
        for ix, res in INDICES:
            db.execute(text("DROP TABLE IF EXISTS _reads"))
            db.execute(text(READS.format(ix=ix, res=res, min_px=MIN_PX, min_frac=MIN_FRAC)))
            n_reads = db.execute(text("SELECT count(*) FROM _reads")).scalar()
            # bin_no is written over the GROUPED start expression, not r.obs_date.
            month_start = "date_trunc('month', r.obs_date)::date"
            bin_start = BIN16_START.format(d="r.obs_date")
            n_m = db.execute(text(STAGE_COMPOSITES.format(
                start=month_start, from_col="month_from",
                bin_no=f"extract(month from {month_start})::int")),
                {"ix": ix, "period": "month", "bin_kind": "month", "min_obs": 1}).rowcount
            n_16 = db.execute(text(STAGE_COMPOSITES.format(
                start=bin_start, from_col="bin_from",
                bin_no=BIN16_NO.format(d=bin_start))),
                {"ix": ix, "period": "16d", "bin_kind": "doy16",
                 "min_obs": MIN_OBS_16D}).rowcount
            print(f"[composites] {ix}: {n_reads} clean reads -> {n_m} monthly, {n_16} 16-day")
        db.execute(text("DROP TABLE IF EXISTS _reads"))
        # Temp tables are never auto-analyzed; without this the planner guesses.
        db.execute(text("ANALYZE _comp"))

        # Baselines come from the staged composites: an area due one is always
        # built in full (from EPOCH), so _comp holds its whole history.
        n_b = 0
        if base:
            db.execute(text("DELETE FROM area_index_baseline WHERE area_id = ANY(:ids)"),
                       {"ids": base})
            n_b = db.execute(text(INSERT_BASELINE),
                             {"ids": base, "this_year": this_year}).rowcount
            print(f"[composites] baselines: {n_b} rows for {len(base)} area(s), "
                  f"years before {this_year}")
            # Written in this transaction, so autovacuum has not seen them.
            db.execute(text("ANALYZE area_index_baseline"))

        db.execute(text(DELETE_COMPOSITES))
        n_c, n_a = db.execute(text(
            f"WITH w AS ({WRITE_COMPOSITES} RETURNING anomaly) "
            "SELECT count(*), count(anomaly) FROM w")).one()
        print(f"[composites] wrote {n_c} composite(s), {n_a} with an anomaly "
              f"(baseline of {MIN_BASELINE_YEARS}+ years)")

        # New baselines change the anomalies of every past month, so the zone
        # history is rebuilt with them; otherwise only the recent months move. An
        # area that is due but had nothing to build from (no clean read in any
        # complete year) writes no baseline rows and does not trigger this.
        zone_from = EPOCH if (args.rebuild or n_b) else recent_month
        db.execute(text("ANALYZE area_index_composite"))
        db.execute(text("DELETE FROM zone_index_monthly WHERE make_date(year, month, 1) >= :z"),
                   {"z": zone_from})
        n_z = db.execute(text(ZONE_ROLLUP), {"zone_from": zone_from}).rowcount
        print(f"[composites] zone rollup from {zone_from}: {n_z} zone-index-month row(s)")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
