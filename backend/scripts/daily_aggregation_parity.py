#!/usr/bin/env python3
"""
scripts/daily_aggregation_parity.py

Verify the set-based `aggregate_range()` reproduces the per-station-day
`aggregate_station_day()` exactly, before the fast path is used for a backfill.

The two implementations are deliberately kept independent in
daily_aggregation.py (they do not share a record builder), so this comparison
is a real check rather than a tautology.

Read-only — nothing is written to weather_data_daily.

Usage:
    python scripts/daily_aggregation_parity.py --source HBRC --start 2026-07-01 --end 2026-07-07
    python scripts/daily_aggregation_parity.py --source ECAN --start 2020-03-25 --end 2020-04-10
"""

import argparse
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.session import SessionLocal
from daily_aggregation import (
    aggregate_range,
    aggregate_station_day,
    get_active_stations,
)

FIELDS = [
    'temp_min', 'temp_max', 'temp_mean',
    'humidity_min', 'humidity_max', 'humidity_mean',
    'rainfall_mm', 'solar_radiation',
    'gdd_base0', 'gdd_base10',
    'temp_record_count', 'humidity_record_count', 'rainfall_record_count',
]

# Numeric tolerance. Both paths run the same SQL aggregates over the same rows,
# so this should be exact; a non-zero epsilon only guards float/Decimal
# round-tripping in AVG.
EPS = Decimal('1e-9')


def differs(a, b) -> bool:
    if a is None and b is None:
        return False
    if (a is None) != (b is None):
        return True
    if isinstance(a, (int, Decimal, float)) and isinstance(b, (int, Decimal, float)):
        return abs(Decimal(str(a)) - Decimal(str(b))) > EPS
    return a != b


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=str, help='Limit to one data_source')
    p.add_argument('--zone-id', type=int)
    p.add_argument('--start', type=str, required=True)
    p.add_argument('--end', type=str, required=True)
    args = p.parse_args()

    start = datetime.strptime(args.start, '%Y-%m-%d').date()
    end = datetime.strptime(args.end, '%Y-%m-%d').date()

    db = SessionLocal()
    try:
        stations = get_active_stations(db, zone_id=args.zone_id, source=args.source)
        station_ids = [s['station_id'] for s in stations]
        print(f"Stations: {len(station_ids)}   Range: {start} → {end} "
              f"({(end - start).days + 1} days)")
        if not station_ids:
            print("No stations matched — nothing to compare.")
            return 1

        # --- fast path: one query per chunk -----------------------------------
        t0 = datetime.now()
        fast = {(r['station_id'], r['date']): r
                for r in aggregate_range(db, station_ids, start, end)}
        fast_secs = (datetime.now() - t0).total_seconds()

        # --- reference path: one query per (station, day) ----------------------
        t0 = datetime.now()
        slow = {}
        cursor = start
        while cursor <= end:
            for sid in station_ids:
                rec = aggregate_station_day(db, sid, cursor)
                if rec:
                    slow[(sid, cursor)] = rec
            cursor += timedelta(days=1)
        slow_secs = (datetime.now() - t0).total_seconds()

        n_days = (end - start).days + 1
        queries_slow = len(station_ids) * n_days
        queries_fast = (n_days + 30) // 31
        print(f"\nset-based : {len(fast):6} records in {fast_secs:8.2f}s  "
              f"({queries_fast} queries)")
        print(f"per-day   : {len(slow):6} records in {slow_secs:8.2f}s  "
              f"({queries_slow} queries)")
        if fast_secs > 0:
            print(f"speedup   : {slow_secs / fast_secs:.0f}x")

        # --- compare -----------------------------------------------------------
        only_fast = set(fast) - set(slow)
        only_slow = set(slow) - set(fast)
        mismatches = []

        for key in sorted(set(fast) & set(slow)):
            for f in FIELDS:
                a, b = fast[key].get(f), slow[key].get(f)
                if differs(a, b):
                    mismatches.append((key, f, a, b))

        print(f"\nkeys only in set-based : {len(only_fast)}")
        print(f"keys only in per-day   : {len(only_slow)}")
        print(f"field mismatches       : {len(mismatches)}")

        for key in list(only_fast)[:5]:
            print(f"   only fast: {key}")
        for key in list(only_slow)[:5]:
            print(f"   only slow: {key}")
        for key, f, a, b in mismatches[:15]:
            print(f"   {key} {f}: set-based={a!r}  per-day={b!r}")

        ok = not only_fast and not only_slow and not mismatches
        print("\n" + ("PARITY OK" if ok else "PARITY FAILED"))
        return 0 if ok else 1
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(main())
