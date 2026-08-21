#!/usr/bin/env python3
"""
scripts/quarantine_stuck_rainfall.py

Find and quarantine rain gauges stuck at exactly zero while still reporting.

Found 2026-08-21 during the Waikato (WRC) build, on the first station validated:
`WRC_20_HENDERSON_ROAD_HORSHAM_DOWNS` returned a FULL complement of 5-minute
readings — 8,928 rows in a 31-day month, every one exactly 0.0000 — continuously
from 2024-10 to 2025-04. Seven months of no rain in the Waikato is not weather.

WHY EVERY EXISTING GUARD MISSES THIS
------------------------------------
This is the rainfall twin of the pinned-temperature fault in
`quarantine_stuck_sensors.py`, and it is harder to see:

  - the physical-range gate passes it. 0.0 mm is the single most common legitimate
    rainfall reading in the entire database.
  - the record-count guards pass it. The station is not thin, it is FULL — 288
    records a day is the healthy signature, not a suspicious one.
  - `ingestion_log` passes it. The fetch succeeded and returned data.
  - a zero-run is invisible in any per-day or per-month row count, because the rows
    are all there.
  - and unlike a frozen thermometer, there is no value to eyeball as absurd. Every
    individual reading is perfectly ordinary.

It is also the most damaging direction of error for a rainfall surface. A stuck
gauge does not add noise, it adds a confident zero: the spline is told, with a full
month of evidence, that a place had no rain. That drags the fitted field down over
a wide radius, and `cv_rmse` will not flag it because the station agrees with
itself.

WHY THE DETECTOR IS A RUN, NOT A VALUE
--------------------------------------
**Do not build a rule on `value = 0`.** That is the MDC_LAKE_ELTERWATER mistake in
a new costume: there, a blanket zero rule would have destroyed 442k genuinely-zero
readings from a lake that really does reach freezing. Zero rainfall is real and
overwhelmingly common.

What is not real is a LONG RUN of exactly zero while telemetry stays healthy. So the
detector needs three things together, and none of them alone:

  1. the month totals exactly 0.0 mm,
  2. the gauge reported on essentially every day of it (so this is not a gap), and
  3. it persists for MIN_RUN_MONTHS consecutive months.

Two consecutive full-telemetry zero months does not occur anywhere in New Zealand.
NIWA's longest recorded dry spell is 71 days (Wairarapa, 2012-13); no NZ site has
gone two calendar months with a working gauge and no measurable rain. The threshold
is deliberately far outside the climatological envelope so that a real drought can
never trip it — the aim is to catch instruments, not seasons.

Rows are FLAGGED, never deleted, per the HORIZONS_HAUTAPU / MDC_LAKE_ELTERWATER
precedent, and only the rainfall variable is touched — a station's temperature is
unaffected and stays in.

Usage:
    python scripts/quarantine_stuck_rainfall.py --survey                # read-only, all sources
    python scripts/quarantine_stuck_rainfall.py --survey --source WRC
    python scripts/quarantine_stuck_rainfall.py --source WRC            # apply
    python scripts/quarantine_stuck_rainfall.py --undo
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal

REASON = 'stuck_rainfall_zero'

RAIN_VARS = ('rainfall', 'precipitation')

# A month counts as "reporting" only if the gauge produced rows on at least this
# many days. Below it the zero is a gap, not a stuck sensor, and gaps are somebody
# else's problem (see window_util).
MIN_REPORTING_DAYS = 26

# Consecutive qualifying months needed before we call it a fault. See the module
# docstring: one dry month is climate, two with full telemetry is hardware.
MIN_RUN_MONTHS = 2


SURVEY_SQL = """
    WITH monthly AS (
        SELECT d.station_id,
               date_trunc('month', d.date)::date AS m,
               sum(d.rainfall_mm)                AS mm,
               count(*) FILTER (WHERE d.rainfall_record_count > 0) AS reporting_days,
               sum(d.rainfall_record_count)      AS records
          FROM weather_data_daily d
          JOIN weather_stations s ON s.station_id = d.station_id
         WHERE d.rainfall_mm IS NOT NULL
           AND (:source IS NULL OR s.data_source = :source)
         GROUP BY 1, 2
    )
    SELECT s.data_source, s.station_code, m.station_id, m.m, m.mm,
           m.reporting_days, m.records
      FROM monthly m
      JOIN weather_stations s ON s.station_id = m.station_id
     WHERE m.mm = 0
       AND m.reporting_days >= :min_days
     ORDER BY s.data_source, s.station_code, m.m
"""


def find_runs(rows):
    """Group qualifying months into consecutive runs, keeping runs >= MIN_RUN_MONTHS."""
    by_station = defaultdict(list)
    for source, code, sid, month, mm, days, records in rows:
        by_station[(source, code, sid)].append((month, days, records))

    found = []
    for (source, code, sid), months in by_station.items():
        months.sort()
        run = [months[0]]
        for prev, cur in zip(months, months[1:]):
            # consecutive calendar months?
            gap = (cur[0].year - prev[0].year) * 12 + (cur[0].month - prev[0].month)
            if gap == 1:
                run.append(cur)
            else:
                if len(run) >= MIN_RUN_MONTHS:
                    found.append((source, code, sid, run))
                run = [cur]
        if len(run) >= MIN_RUN_MONTHS:
            found.append((source, code, sid, run))
    return found


def month_end(month):
    """Last day of the calendar month, as an exclusive upper bound date."""
    return (month.replace(day=28) + __import__('datetime').timedelta(days=8)).replace(day=1)


def survey(db, source):
    rows = db.execute(text(SURVEY_SQL),
                      {'source': source, 'min_days': MIN_REPORTING_DAYS}).fetchall()
    found = find_runs(rows)
    if not found:
        print("  no stuck-at-zero rainfall runs found "
              f"(>= {MIN_RUN_MONTHS} consecutive months, "
              f">= {MIN_REPORTING_DAYS} reporting days each)")
        return []

    print(f"  {'source':<10} {'station':<40} {'window':<20} {'months':>6} {'records':>10}")
    for src, code, sid, run in sorted(found, key=lambda f: (f[0], f[1])):
        first, last = run[0][0], run[-1][0]
        records = sum(r[2] or 0 for r in run)
        print(f"  {src:<10} {code[:40]:<40} {first:%Y-%m}..{last:%Y-%m}  "
              f"{len(run):>6} {records:>10,d}")
    return found


def apply(db, found):
    """Quarantine the raw rows AND clear the daily columns they fed.

    THE SECOND HALF IS NOT OPTIONAL, and re-aggregation will not do it for you.

    `daily_aggregation.py` correctly excludes QUARANTINED rows from its statistics,
    so a re-aggregated day computes `rainfall_mm = NULL`. But `rainfall_mm` is not
    in that script's `TEMP_AUTHORITATIVE_COLUMNS`, so it is written through the B4.1
    guard — `COALESCE(EXCLUDED.rainfall_mm, existing.rainfall_mm)` — which exists
    because GHCN-Daily PRCP is a legitimate second writer that a precip-less hourly
    source must not clobber.

    The consequence here is exact and silent: the incoming NULL loses to the stored
    0.0, **the fabricated zeros survive a re-aggregation that reports success**, and
    nothing anywhere says so. This is the same collision that let 5,483 fabricated
    temperature extremes survive the 2026-08-19 repair, in the one column where the
    guard genuinely has to stay.

    So the daily columns are nulled explicitly, by station and date window, rather
    than left to a rebuild.
    """
    changed = daily_cleared = 0
    for src, code, sid, run in found:
        first, last = run[0][0], month_end(run[-1][0])
        note = (f"gauge reported {sum(r[2] or 0 for r in run):,d} readings across "
                f"{len(run)} consecutive months totalling exactly 0.0 mm")
        res = db.execute(text("""
            UPDATE timeseries_observations t
               SET quality = 'QUARANTINED',
                   quality_flags = coalesce(t.quality_flags, '{}'::jsonb)
                       || jsonb_build_object('quarantine', jsonb_build_object(
                              'reason', :reason,
                              'note', :note,
                              'window', :window,
                              'ref', 'WRC build rainfall validation 2026-08-21'))
             WHERE t.station_id = :sid AND t.variable = ANY(:vars)
               AND t.timestamp >= :first AND t.timestamp < :last
               AND coalesce(t.quality,'') <> 'QUARANTINED'
        """), {'sid': sid, 'vars': list(RAIN_VARS), 'reason': REASON, 'note': note,
               'window': f"{first}..{last}", 'first': first, 'last': last})

        # See the docstring: the B4.1 COALESCE would otherwise restore these.
        dres = db.execute(text("""
            UPDATE weather_data_daily
               SET rainfall_mm = NULL, rainfall_record_count = 0
             WHERE station_id = :sid AND date >= :first AND date < :last
               AND rainfall_mm IS NOT NULL
        """), {'sid': sid, 'first': first, 'last': last})

        print(f"  {code[:40]:<40} {res.rowcount:>9,d} raw quarantined, "
              f"{dres.rowcount:>5,d} daily row(s) cleared")
        changed += res.rowcount
        daily_cleared += dres.rowcount
    print(f"\n  {daily_cleared:,d} daily rainfall value(s) cleared in total")
    return changed


def undo(db):
    res = db.execute(text("""
        UPDATE timeseries_observations t
           SET quality = 'PROVISIONAL', quality_flags = t.quality_flags - 'quarantine'
         WHERE t.quality = 'QUARANTINED'
           AND t.quality_flags -> 'quarantine' ->> 'reason' = :reason
    """), {'reason': REASON})
    return res.rowcount


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--survey', action='store_true', help='read-only')
    ap.add_argument('--source', default=None, help='limit to one data_source')
    ap.add_argument('--undo', action='store_true')
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.undo:
            n = undo(db)
            db.commit()
            print(f"released {n} row(s) with reason={REASON}")
            return

        scope = args.source or 'ALL SOURCES'
        print(f"Stuck-at-zero rainfall detector — {scope}\n")
        found = survey(db, args.source)
        if args.survey or not found:
            if args.survey:
                print("\n[SURVEY] nothing written")
            return

        print("\napplying...")
        n = apply(db, found)
        db.commit()
        print(f"\nquarantined {n} row(s)")
        print("\nNow re-aggregate the affected windows so the daily table drops "
              "the zeros:")
        for src, code, sid, run in found:
            print(f"  python scripts/daily_aggregation.py --start {run[0][0]} "
                  f"--end {month_end(run[-1][0])} --source {src}")
    finally:
        db.close()


if __name__ == '__main__':
    main()
