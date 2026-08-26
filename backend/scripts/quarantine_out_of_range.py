#!/usr/bin/env python3
"""
scripts/quarantine_out_of_range.py

Mark historical raw observations that fall outside physical plausibility as
QUARANTINED, using the same bounds the ingest path now enforces.

This is the retrospective half of LIVE_SURFACES_DISCOVERY_2026-08-19 Phase 0.1.
The forward half is `ingestion/sources/db_util.py`, which screens at write time;
this handles the rows that landed before that gate existed.

Rows are FLAGGED, never deleted. A failed sensor is evidence: deleting it makes
the failure unprovable and makes the gap indistinguishable from "never reported".
`daily_aggregation.py` already excludes `quality = 'QUARANTINED'`, so flagging is
sufficient to keep the values out of every daily statistic, and the precedent is
HORIZONS_HAUTAPU and MDC_LAKE_ELTERWATER.

Why this matters more than the row count suggests: ~12,500 rows across 6.5 years
is 0.017% of the raw table and reads as noise, but ONE -6,999 degC in a national
thin-plate fit takes out that day's surface, and GCV will choose a smoothing that
accommodates the outlier rather than rejecting it.

Usage:
    python scripts/quarantine_out_of_range.py --dry-run
    python scripts/quarantine_out_of_range.py
    python scripts/quarantine_out_of_range.py --since 2020-01-01
    python scripts/quarantine_out_of_range.py --undo      # clears rows THIS script set

After running, re-aggregate the affected dates — the daily table still holds the
statistics computed from the bad rows:

    python scripts/daily_aggregation.py --start <first> --end <last> --source <src>
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal

# Kept in step with ingestion/sources/db_util.py VARIABLE_RANGES / VARIABLE_CLAMPS.
# (lo, hi, lo_tolerance, hi_tolerance) — a value outside [lo, hi] but within the
# tolerance is instrument drift the ingest path clamps to the bound; only values
# beyond the tolerance are sentinels, and only those are quarantined here.
#
# The tolerances are why solar_radiation barely appears in the census: every one
# of its ~20,000 negative readings sits between -9.31 and 0 W/m2, which is a
# pyranometer's nighttime thermal offset and not a fault.
RANGES = {
    'temp':              (-30.0, 45.0, 0.0, 0.0),
    'temperature':       (-30.0, 45.0, 0.0, 0.0),
    'air_temperature':   (-30.0, 45.0, 0.0, 0.0),
    'soil_temp':         (-30.0, 60.0, 0.0, 0.0),
    'dewpoint':          (-40.0, 40.0, 0.0, 0.0),
    'rainfall':          (0.0, 750.0, 0.2, 0.0),
    'precipitation':     (0.0, 750.0, 0.2, 0.0),
    'rh':                (0.0, 100.0, 5.0, 10.0),
    'humidity':          (0.0, 100.0, 5.0, 10.0),
    'solar_radiation':   (0.0, 1500.0, 20.0, 0.0),
    'wind_speed':        (0.0, 75.0, 0.0, 0.0),
    'wind_gust':         (0.0, 90.0, 0.0, 0.0),
    'wind_direction':    (0.0, 360.0, 0.0, 0.0),
    'pressure':          (800.0, 1100.0, 0.0, 0.0),
    'pressure_msl':      (800.0, 1100.0, 0.0, 0.0),
    'soil_moisture_vwc': (0.0, 100.0, 0.0, 0.0),
}

REASON = 'physical_range'

PREDICATE = """
    t.timestamp >= :since
    AND t.variable = :variable
    AND (t.value < :lo_eff OR t.value > :hi_eff)
    AND coalesce(t.quality, '') <> 'QUARANTINED'
"""


def _fmt(v):
    return '' if v is None else "%g" % float(v)


def survey(db, since):
    print("%-20s %8s %9s %7s %12s %12s" %
          ('variable', 'rows', 'stations', 'dates', 'worst low', 'worst high'))
    total = 0
    per_source = {}
    for variable, (lo, hi, ltol, htol) in sorted(RANGES.items()):
        params = {'since': since, 'variable': variable,
                  'lo_eff': lo - ltol, 'hi_eff': hi + htol}
        row = db.execute(text("""
            SELECT count(*) n, count(DISTINCT t.station_id) stns,
                   count(DISTINCT (t.timestamp AT TIME ZONE 'Pacific/Auckland')::date) dates,
                   min(t.value) FILTER (WHERE t.value < :lo_eff) lo_worst,
                   max(t.value) FILTER (WHERE t.value > :hi_eff) hi_worst
              FROM timeseries_observations t
             WHERE """ + PREDICATE), params).mappings().one()
        if not row['n']:
            continue
        total += row['n']
        print("%-20s %8d %9d %7d %12s %12s" %
              (variable, row['n'], row['stns'], row['dates'],
               _fmt(row['lo_worst']), _fmt(row['hi_worst'])))

        for s in db.execute(text("""
            SELECT d.data_source src, count(*) n,
                   min((t.timestamp AT TIME ZONE 'Pacific/Auckland')::date) d0,
                   max((t.timestamp AT TIME ZONE 'Pacific/Auckland')::date) d1
              FROM timeseries_observations t
              JOIN devices d ON d.station_id = t.station_id
             WHERE """ + PREDICATE + """
             GROUP BY 1"""), params).mappings():
            e = per_source.setdefault(s['src'], {'n': 0, 'd0': s['d0'], 'd1': s['d1']})
            e['n'] += s['n']
            e['d0'] = min(e['d0'], s['d0'])
            e['d1'] = max(e['d1'], s['d1'])
    return total, per_source


def quarantine(db, since):
    changed = 0
    for variable, (lo, hi, ltol, htol) in sorted(RANGES.items()):
        res = db.execute(text("""
            UPDATE timeseries_observations t
               SET quality = 'QUARANTINED',
                   quality_flags = coalesce(t.quality_flags, '{}'::jsonb)
                       || jsonb_build_object('quarantine', jsonb_build_object(
                              'reason', :reason,
                              'bounds', :bounds,
                              'observed', t.value,
                              'ref', 'LIVE_SURFACES_DISCOVERY_2026-08-19 Phase 0.1'))
             WHERE """ + PREDICATE),
            {'since': since, 'variable': variable, 'reason': REASON,
             'bounds': "%s..%s" % (lo, hi), 'lo_eff': lo - ltol, 'hi_eff': hi + htol})
        if res.rowcount:
            print("  %-20s %8d quarantined" % (variable, res.rowcount))
            changed += res.rowcount
    return changed


def undo(db):
    """Clear only rows THIS script quarantined.

    Station-level quarantines (HORIZONS_HAUTAPU all-time, MDC_LAKE_ELTERWATER
    from 2026-07-07) carry a different reason and must not be reopened by an
    undo of the range pass — MDC's historical 0.00 readings are REAL for a lake
    that reaches freezing, and releasing them would be the second time that
    station's good data was nearly destroyed.
    """
    res = db.execute(text("""
        UPDATE timeseries_observations t
           SET quality = 'GOOD',
               quality_flags = t.quality_flags - 'quarantine'
         WHERE t.quality = 'QUARANTINED'
           AND t.quality_flags -> 'quarantine' ->> 'reason' = :reason
    """), {'reason': REASON})
    return res.rowcount



# weather_data_daily column -> the variable whose range governs it.
#
# `solar_radiation` is DELIBERATELY ABSENT. The daily column is a SUM of the day's
# raw W/m2 readings, not an instantaneous value, so the 0-1500 instantaneous bound
# is a category error against it: measured p95 is 5,140 and the max 396,359, and
# applying the raw bound would have nulled 6,849 legitimate daily totals.
#
# Daily solar IS separately broken — median 0.7, 12,235 negative station-days,
# minimum -12,085 — but that needs a daily-integral bound in whatever unit the sum
# is actually accumulating, which is unresolved. Solar is not an interpolation
# input (35 stations, none in Canterbury/Otago/Southland; the archive takes it from
# Z:), so it is out of scope here rather than fixed badly.
#
# `rainfall_mm` is also a sum, but its bound survives the same scrutiny: 750 mm is
# a DAILY total to begin with, and the archive's own daily maximum is 691.8 mm.
DAILY_COLUMNS = {
    'temp_min': 'temp', 'temp_max': 'temp', 'temp_mean': 'temp',
    'rainfall_mm': 'rainfall',
    'humidity_min': 'rh', 'humidity_max': 'rh', 'humidity_mean': 'rh',
}


def repair_daily(db, since, dry_run):
    """Null out-of-range values in weather_data_daily itself.

    Quarantining the raw rows is NOT sufficient, and it is worth being precise
    about why, because both failure modes are silent and neither shows up as an
    error in a re-aggregation that reports success:

    1. **The station-day vanishes from the aggregation entirely.** If every raw
       row for a (station, date) was quarantined, `aggregate_station_day` sees
       `total_count == 0`, returns None, and nothing is upserted — so the stale
       daily row is never revisited. WCRC station 715 on 2021-11-04 keeps
       `rainfall_mm = 232036.00` with `rainfall_record_count = 1` for exactly
       this reason: the single raw row behind that 1 is now quarantined.

    2. **The B4.1 COALESCE restores it.** Where a record IS produced but its
       rainfall is now NULL, `bulk_upsert_daily_records` does
       `COALESCE(EXCLUDED.rainfall_mm, existing)` — which exists because
       GHCN-Daily is a second writer for that column — and the stored bad value
       wins. Same guard that silently undid the temperature floor on 2026-08-19;
       see HILLTOP_TEMPERATURE_DEGENERATE_2026-08-19.md.

    So the derived value must be cleared explicitly. It has no raw support left,
    and NULL is the honest representation of that.
    """
    total = 0
    for column, variable in sorted(DAILY_COLUMNS.items()):
        lo, hi, ltol, htol = RANGES[variable]
        params = {'since': since, 'lo': lo - ltol, 'hi': hi + htol}
        where = ("date >= :since AND {c} IS NOT NULL "
                 "AND ({c} < :lo OR {c} > :hi)").format(c=column)
        n = db.execute(text("SELECT count(*) FROM weather_data_daily WHERE " + where),
                       params).scalar()
        if not n:
            continue
        total += n
        print("  %-18s %6d station-day(s) out of range" % (column, n))
        if not dry_run:
            db.execute(text("UPDATE weather_data_daily SET {c} = NULL WHERE ".format(c=column)
                            + where), params)
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', default='2020-01-01')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--undo', action='store_true')
    ap.add_argument('--repair-daily', action='store_true',
                    help='Null out-of-range values in weather_data_daily. '
                         'Raw quarantine alone does NOT clean it - see repair_daily().')
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.repair_daily:
            print("Repairing weather_data_daily since %s" % args.since)
            n = repair_daily(db, args.since, args.dry_run)
            if args.dry_run:
                db.rollback()
                print("[DRY RUN] %d value(s) would be nulled" % n)
            else:
                db.commit()
                print("nulled %d out-of-range daily value(s)" % n)
            return

        if args.undo:
            n = undo(db)
            db.commit()
            print("released %d row(s) quarantined with reason=%s" % (n, REASON))
            return

        print("Out-of-range census since %s\n" % args.since)
        total, per_source = survey(db, args.since)
        print("\ntotal: %d row(s)\n" % total)
        if per_source:
            print("%-14s %7s  affected date range" % ('source', 'rows'))
            for src, e in sorted(per_source.items(), key=lambda kv: -kv[1]['n']):
                print("%-14s %7d  %s .. %s" % (src, e['n'], e['d0'], e['d1']))

        if args.dry_run:
            print("\n[DRY RUN] nothing written")
            return
        if not total:
            print("nothing to do")
            return

        print("\napplying...")
        n = quarantine(db, args.since)
        db.commit()
        print("\nquarantined %d row(s)" % n)
        print("\nNow re-aggregate the affected dates, per the source table above:")
        print("  python scripts/daily_aggregation.py --start <d0> --end <d1> --source <src>")
        print("  then: python scripts/quarantine_out_of_range.py --repair-daily")
    finally:
        db.close()


if __name__ == '__main__':
    main()
