#!/usr/bin/env python3
"""
scripts/quarantine_stuck_sensors.py

Quarantine temperature from sensors that froze at a plausible value.

Found 2026-08-20 while running test interpolation months from the DB. Two months
(2023-06 and 2025-01) scored cv_rmse 2.6-3.2 against ~1.1 for their neighbours,
uniformly across every day of the month while the in-sample `rmse` stayed at
0.3-1.1 — the signature of a station the spline cannot predict from its
neighbours, rather than a bad-weather month.

WHY THE EXISTING GUARDS ALL MISS THIS
A frozen sensor reporting a physically ordinary value defeats every check we have:

  - the physical-range gate passes it: -16.50 and 3.96 degC are perfectly legal
  - MIN_TEMP_RECORDS_FOR_DAILY passes it: station 309 reports 288 records a day,
    every one of them exactly 3.96
  - the Hilltop degenerate-DTR work targeted too-FEW records; this is the opposite,
    a full record of identical values

The detector that does work is a PINNED VALUE: the share of days in a month whose
`temp_min` rounds to the same 0.1 degC. Over 2020->present that flags exactly two
stations at >50%, and both are real faults. A low monthly DTR finds the same two.
A HIGH monthly DTR does NOT work as a detector on its own — it flags 21 stations,
most of them legitimate (Molesworth at 887 m and the Central Otago vineyard sites
genuinely reach 16-20 degC diurnal range).

WHY IT MATTERS MORE THAN TWO STATIONS SOUNDS
Station 708 is one of only TWO WCRC thermometers and, at 1279 m, the highest
station on the West Coast — the sole high-country constraint in a region already
carrying the largest temperature coverage deficit in the country (16,243 km2).
The lapse retrend leans on exactly that kind of station, so a 22 degC error there
propagates far beyond its own cell.

Rows are FLAGGED, never deleted, per the HORIZONS_HAUTAPU / MDC_LAKE_ELTERWATER
precedent. Only the `temp` variable is touched: both stations' rainfall is
unaffected and stays in.

Usage:
    python scripts/quarantine_stuck_sensors.py --dry-run
    python scripts/quarantine_stuck_sensors.py
    python scripts/quarantine_stuck_sensors.py --undo
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal

REASON = 'stuck_sensor'

# (station_id, station_code, first_bad, last_bad, note)
#
# Windows are inclusive and were measured, not guessed:
#   708 first stuck value 2023-03-29, last 2025-04-09. March-May 2023 is an
#       INTERMITTENT phase — real readings alternating with the -16.5 sentinel,
#       which shows up as a monthly DTR of 13-18 degC rather than a low one — so
#       the window starts at the first bad day, not at the fully-frozen month.
#       Silent from 2025-04-10, returns healthy 2026-06-23 (DTR 10.1). Not
#       deactivated: the station is good again and is needed.
#   309 pinned at exactly 3.96 degC with 288 records/day. 51 affected days.
STUCK = [
    (708, 'WCRC_GREY_RV_CONICAL_HILL_NEW', '2023-03-29', '2025-04-09',
     'froze at -16.5 C; recovered 2026-06-23'),
    (309, 'MDC_PELORUS_AT_1446', '2025-05-18', '2025-08-20',
     'froze at 3.96 C with 288 records/day'),
]

TEMP_VARS = ('temp', 'temperature', 'air_temperature')


def survey(db):
    total = 0
    for sid, code, first, last, note in STUCK:
        n = db.execute(text("""
            SELECT count(*) FROM timeseries_observations
             WHERE station_id = :sid AND variable = ANY(:vars)
               AND timestamp >= :first AND timestamp < (CAST(:last AS date) + 1)
               AND coalesce(quality,'') <> 'QUARANTINED'
        """), {'sid': sid, 'vars': list(TEMP_VARS),
               'first': first, 'last': last}).scalar()
        total += n
        print("  %-32s %s .. %s  %8d raw row(s)   %s" % (code, first, last, n, note))
    return total


def apply(db):
    changed = 0
    for sid, code, first, last, note in STUCK:
        res = db.execute(text("""
            UPDATE timeseries_observations t
               SET quality = 'QUARANTINED',
                   quality_flags = coalesce(t.quality_flags, '{}'::jsonb)
                       || jsonb_build_object('quarantine', jsonb_build_object(
                              'reason', :reason,
                              'note', :note,
                              'window', :window,
                              'ref', 'test interpolation months 2026-08-20'))
             WHERE t.station_id = :sid AND t.variable = ANY(:vars)
               AND t.timestamp >= :first AND t.timestamp < (CAST(:last AS date) + 1)
               AND coalesce(t.quality,'') <> 'QUARANTINED'
        """), {'sid': sid, 'vars': list(TEMP_VARS), 'reason': REASON, 'note': note,
               'window': "%s..%s" % (first, last), 'first': first, 'last': last})
        print("  %-32s %8d quarantined" % (code, res.rowcount))
        changed += res.rowcount
    return changed


def undo(db):
    res = db.execute(text("""
        UPDATE timeseries_observations t
           SET quality = 'GOOD', quality_flags = t.quality_flags - 'quarantine'
         WHERE t.quality = 'QUARANTINED'
           AND t.quality_flags -> 'quarantine' ->> 'reason' = :reason
    """), {'reason': REASON})
    return res.rowcount


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--undo', action='store_true')
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.undo:
            n = undo(db)
            db.commit()
            print("released %d row(s) with reason=%s" % (n, REASON))
            return

        print("Stuck-sensor temperature quarantine\n")
        total = survey(db)
        print("\ntotal: %d raw row(s)\n" % total)
        if args.dry_run:
            print("[DRY RUN] nothing written")
            return
        if not total:
            print("nothing to do")
            return
        print("applying...")
        n = apply(db)
        db.commit()
        print("\nquarantined %d row(s)" % n)
        print("\nNow re-aggregate the affected windows:")
        for sid, code, first, last, _ in STUCK:
            print("  python scripts/daily_aggregation.py --start %s --end %s "
                  "--source %s" % (first, last, code.split('_')[0]))
    finally:
        db.close()


if __name__ == '__main__':
    main()
