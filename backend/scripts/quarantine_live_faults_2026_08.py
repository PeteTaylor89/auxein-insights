#!/usr/bin/env python3
"""Quarantine two temperature sensors that failed during 2026, found by the
neighbour screen in the new daily surface engine.

Both were found on 2026-08-24 by `tps.screen_outliers` while bringing
`run_live.py` up, and neither is visible to any guard that existed before it.

## 473 Winton at Essex Street — reads far too warm since 2026-08-10

Southland, 50 m. Healthy through 2026-08-09 (diurnal range 3.6 degC), then from
2026-08-10 the daily range jumps to 15-20 degC with maxima of 27-29 degC in the
middle of a Southland winter. On 2026-08-19 it read **29.30 degC while its six
nearest neighbours, 13-31 km away, read 9.8-11.5 degC**.

The monthly means say the same thing: mean tmax ran 19.00 (Jan) down to 11.64
(Jul) — a textbook seasonal decline — then **19.96 in August**, above its own
midsummer mean.

## 100 Lake Elterwater Climate — stuck at exactly 0.0000 since 2026-07-01

Marlborough, 40 m. First zero at 2026-07-01 14:05 UTC, last real value 21.56 on
2026-07-05; intermittent for those four days, then a continuous run of 288
records a day of exactly 0.0000. This station has a stuck-sensor precedent
already — it is named in `quarantine_stuck_sensors.py` as the reason that script
flags rather than deletes.

## Why every existing guard misses both

  - the physical-range gate passes both: 29.3 degC and 0.0 degC are legal
    values in New Zealand
  - the record-count guard passes both: 24 and 288 records a day
  - the PINNED-VALUE detector catches 100 but NOT 473, whose readings vary
    across a 20 degC range
  - a fixed plausibility bound cannot catch 473 at all. 29.3 degC is ordinary in
    Hawke's Bay in February. What makes it wrong is Southland, August, and
    neighbours at 10 degC — so the test has to be outlier-VERSUS-NETWORK

## THE WINDOWS ARE OPEN, and that is a decision with a cost

Both faults are ongoing as of 2026-08-23, so `last_bad` runs to a far future
date and new observations are quarantined as they arrive. That is the right
default — bad data never reaches `weather_data_daily`, the zone rollups, disease
or phenology — but it has a consequence:

**a quarantined station cannot announce its own recovery.** Its rows never reach
the rollup, so it vanishes from the fit and the daily engine's neighbour screen
stops reporting it. Station 708 recovered on its own after two years and was
only noticed because its window had been closed. So these two need a periodic
check against their neighbours, and the window closed by hand when they are
fixed. `--survey` prints what is currently caught.

Rows are FLAGGED, never deleted.

Usage:
    python scripts/quarantine_live_faults_2026_08.py --dry-run
    python scripts/quarantine_live_faults_2026_08.py
    python scripts/quarantine_live_faults_2026_08.py --undo
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal

REASON = 'live_fault_2026_08'

# Open end date. Not `infinity` so the window is still a readable pair of dates
# in the flag, and so a plain BETWEEN in a diagnostic query behaves.
OPEN_END = '2099-12-31'

# (station_id, code, first_bad, last_bad, note)
FAULTS = [
    (473, 'ES_WINTON_AT_ESSEX_STREET', '2026-08-10', OPEN_END,
     'reads 15-19 C too warm; DTR jumped 3.6 -> 20.4 on 2026-08-10; '
     '29.3 C vs neighbours at 10 C. OPEN - close when repaired'),
    (100, 'MDC_LAKE_ELTERWATER_CLIMATE', '2026-07-01', OPEN_END,
     'stuck at exactly 0.0000, 288 records/day; last real value 21.56 on '
     '2026-07-05. OPEN - close when repaired'),
]

# Only temperature. Both stations carry rh/wind/rainfall series that are not
# implicated, and quarantining a whole station because one sensor failed throws
# away good data — the same reasoning that keeps 708's rainfall in.
TEMP_VARS = ('temp', 'temperature', 'air_temperature')


def survey(db):
    total = 0
    for sid, code, first, last, note in FAULTS:
        n = db.execute(text("""
            SELECT count(*) FROM timeseries_observations
             WHERE station_id = :sid AND variable = ANY(:vars)
               AND timestamp >= :first AND timestamp < (CAST(:last AS date) + 1)
               AND coalesce(quality,'') <> 'QUARANTINED'
        """), {'sid': sid, 'vars': list(TEMP_VARS),
               'first': first, 'last': last}).scalar()
        already = db.execute(text("""
            SELECT count(*) FROM timeseries_observations
             WHERE station_id = :sid AND variable = ANY(:vars)
               AND quality = 'QUARANTINED'
        """), {'sid': sid, 'vars': list(TEMP_VARS)}).scalar()
        print("  %-30s %s .. %s  %7d to flag, %7d already"
              % (code, first, last, n, already))
        total += n
    return total


def apply(db):
    changed = 0
    for sid, code, first, last, note in FAULTS:
        res = db.execute(text("""
            UPDATE timeseries_observations t
               SET quality = 'QUARANTINED',
                   quality_flags = coalesce(t.quality_flags, '{}'::jsonb)
                       || jsonb_build_object('quarantine', jsonb_build_object(
                              'reason', :reason,
                              'note', :note,
                              'window', :window,
                              'ref', 'run_live neighbour screen 2026-08-24'))
             WHERE t.station_id = :sid AND t.variable = ANY(:vars)
               AND t.timestamp >= :first AND t.timestamp < (CAST(:last AS date) + 1)
               AND coalesce(t.quality,'') <> 'QUARANTINED'
        """), {'sid': sid, 'vars': list(TEMP_VARS), 'reason': REASON,
               'note': note, 'window': "%s..%s" % (first, last),
               'first': first, 'last': last})
        print("  %-30s %7d quarantined" % (code, res.rowcount))
        changed += res.rowcount
    return changed


def clear_daily(db):
    """NULL the daily temperature columns over each window.

    **Re-aggregating is not enough on its own.** The daily upsert COALESCEs a
    freshly computed NULL against what is already stored, so a day whose only
    observations have just been quarantined keeps its old value and the
    quarantine looks like it did nothing. That is exactly how the stuck-rainfall
    work found its counts restored underneath it.

    Cleared here explicitly, then `daily_aggregation` is re-run over the window
    so any day that still has GOOD observations is rebuilt from them.
    """
    cleared = 0
    for sid, code, first, last, _ in FAULTS:
        res = db.execute(text("""
            UPDATE weather_data_daily
               SET temp_min = NULL, temp_max = NULL, temp_mean = NULL,
                   temp_record_count = 0
             WHERE station_id = :sid
               AND date >= CAST(:first AS date) AND date <= CAST(:last AS date)
               AND (temp_min IS NOT NULL OR temp_max IS NOT NULL
                    OR temp_mean IS NOT NULL)
        """), {'sid': sid, 'first': first, 'last': last})
        print("  %-30s %7d daily row(s) cleared" % (code, res.rowcount))
        cleared += res.rowcount
    return cleared


def undo(db):
    n = db.execute(text("""
        UPDATE timeseries_observations t
           SET quality = 'GOOD', quality_flags = t.quality_flags - 'quarantine'
         WHERE t.quality = 'QUARANTINED'
           AND t.quality_flags -> 'quarantine' ->> 'reason' = :reason
    """), {'reason': REASON}).rowcount
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--undo', action='store_true')
    ap.add_argument('--survey', action='store_true')
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.undo:
            n = undo(db)
            db.commit()
            print("released %d row(s) with reason=%s" % (n, REASON))
            print("NOTE: re-run daily_aggregation over the windows to rebuild "
                  "the daily rows.")
            return

        print("Live sensor faults found 2026-08-24 by the neighbour screen\n")
        total = survey(db)
        print("\ntotal: %d raw row(s) to quarantine\n" % total)

        if args.survey or args.dry_run:
            print("dry run - nothing written")
            return

        print("quarantining raw observations:")
        n = apply(db)
        print("\nclearing daily temperature columns:")
        c = clear_daily(db)
        db.commit()
        print("\n%d raw row(s) quarantined, %d daily row(s) cleared" % (n, c))
        print("\nNEXT: re-run daily_aggregation over both windows so any day "
              "with surviving GOOD observations is rebuilt:")
        for sid, code, first, last, _ in FAULTS:
            end = '2026-08-23' if last == OPEN_END else last
            print("  python scripts/daily_aggregation.py --start %s "
                  "--end %s" % (first, end))
    finally:
        db.close()


if __name__ == '__main__':
    main()
