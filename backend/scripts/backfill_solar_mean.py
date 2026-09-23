#!/usr/bin/env python3
"""
scripts/backfill_solar_mean.py

Rewrite `weather_data_daily.solar_radiation` as the hour-weighted mean in W/m2.

    python scripts/backfill_solar_mean.py                      # dry run, all years
    python scripts/backfill_solar_mean.py --from 2020-01-01 --to 2026-09-22 --apply

The column stored `SUM(instantaneous W/m2)` for the day until 2026-09-23, which
is not a physical quantity — it scales with how often the station logs. Stored
values ran to 469,526 on a dense logger and to -12,085 on a station whose
night-time pyranometer offsets summed all year. `daily_aggregation` now writes
the hour-weighted mean; this repairs the history it already wrote.

## WHY NOT JUST RE-RUN daily_aggregation

It would rewrite every column for 932 stations over 2,450 days — roughly 2.3M
station-days — to repair one column on 38 stations. Solar is the only thing
wrong, so this touches only solar. Same formula as the production block path in
`daily_aggregation.AGGREGATE_RANGE_SQL`, so a backfilled day and a day the
nightly job writes agree by construction.

## HOUR-WEIGHTED, NOT A PLAIN AVERAGE

The same defect `temp_mean` carried until 2026-08-24, on the same stations.
HARV_GREYSTONE_07 logs 6 readings an hour through the day and 60 an hour at
night, when irradiance is zero, so a plain average of its samples reads 81.7
W/m2 against a true daily mean of 194.8. Average within each NZ-local hour
first, then across hours.

QUARANTINED observations are excluded, exactly as the aggregator excludes them.

## A DAY WITH NO RAW DATA IS LEFT ALONE

If the raw observations behind a stored value are gone, this cannot recompute
it, and nulling it would destroy the only record that the day was measured at
all. Those rows keep their old sum and are REPORTED — they are the rows where
the unit is still wrong afterwards.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402
from sqlalchemy import text                                         # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from db.session import SessionLocal                                 # noqa: E402

SOLAR_VARS = ('solar_radiation', 'solar', 'radiation')
QUARANTINE_QUALITY = 'QUARANTINED'

# Mirrors AGGREGATE_RANGE_SQL: average within each NZ-local hour, then across
# hours. `::date` on the NZ wall-clock gives the same day boundary the
# aggregator buckets by, DST included.
_DAILY_MEAN = """
    WITH hourly AS (
        SELECT station_id,
               (timestamp AT TIME ZONE 'Pacific/Auckland')::date AS obs_date,
               date_trunc('hour', timestamp AT TIME ZONE 'Pacific/Auckland') AS hr,
               avg(value) AS hour_mean
          FROM timeseries_observations
         WHERE variable = ANY(:vars)
           AND value IS NOT NULL
           AND coalesce(quality, '') <> :quarantine
           AND (timestamp AT TIME ZONE 'Pacific/Auckland')::date BETWEEN :lo AND :hi
         GROUP BY 1, 2, 3
    )
    SELECT station_id, obs_date,
           round(avg(hour_mean)::numeric, 2) AS mean_wm2,
           count(*) AS hours
      FROM hourly GROUP BY 1, 2
"""


def year_bounds(lo: date, hi: date):
    """One transaction per calendar year. A single statement over seven years of
    5-minute loggers is a long lock for no benefit, and a failure halfway would
    roll back years that had already been repaired."""
    for y in range(lo.year, hi.year + 1):
        yield max(lo, date(y, 1, 1)), min(hi, date(y, 12, 31))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="lo", default="2020-01-01")
    ap.add_argument("--to", dest="hi", default=str(date.today()))
    ap.add_argument("--apply", action="store_true",
                    help="write. Without it nothing is written.")
    ap.add_argument("--null-unconvertible", action="store_true",
                    help="also NULL the rows whose raw data is gone AND whose "
                         "stored value cannot be a W/m2 mean")
    args = ap.parse_args()
    lo, hi = date.fromisoformat(args.lo), date.fromisoformat(args.hi)

    db = SessionLocal()
    try:
        total_changed = total_missing = 0
        for y_lo, y_hi in year_bounds(lo, hi):
            params = {"vars": list(SOLAR_VARS), "quarantine": QUARANTINE_QUALITY,
                      "lo": y_lo, "hi": y_hi}
            # Rows that will still hold a sum afterwards, because their raw
            # observations are gone. Counted before the update, while the
            # stored value is still the old one.
            missing = db.execute(text(f"""
                SELECT count(*) FROM weather_data_daily w
                 WHERE w.date BETWEEN :lo AND :hi
                   AND w.solar_radiation IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM ({_DAILY_MEAN}) d
                                    WHERE d.station_id = w.station_id
                                      AND d.obs_date = w.date)
            """), params).scalar()

            if not args.apply:
                stats = db.execute(text(f"""
                    SELECT count(*) AS n,
                           count(*) FILTER (WHERE w.solar_radiation
                                            IS DISTINCT FROM d.mean_wm2) AS changing,
                           min(d.mean_wm2) AS lo_v, max(d.mean_wm2) AS hi_v
                      FROM ({_DAILY_MEAN}) d
                      JOIN weather_data_daily w
                        ON w.station_id = d.station_id AND w.date = d.obs_date
                """), params).mappings().one()
                print(f"  {y_lo.year}  {stats['n']:>6} matched  "
                      f"{stats['changing']:>6} changing  "
                      f"range {stats['lo_v']}..{stats['hi_v']}  "
                      f"{missing:>5} row(s) with no raw data")
                total_changed += stats["changing"] or 0
                total_missing += missing or 0
                continue

            n = db.execute(text(f"""
                UPDATE weather_data_daily w
                   SET solar_radiation = d.mean_wm2
                  FROM ({_DAILY_MEAN}) d
                 WHERE w.station_id = d.station_id AND w.date = d.obs_date
                   AND w.solar_radiation IS DISTINCT FROM d.mean_wm2
            """), params).rowcount
            db.commit()
            print(f"  {y_lo.year}  {n:>6} row(s) rewritten  "
                  f"{missing:>5} left alone (no raw data)")
            total_changed += n
            total_missing += missing or 0

        # The rows the backfill cannot reach: no raw observations left, and a
        # value that cannot be a mean irradiance. They are the only rows still
        # carrying the old unit, and they would poison any max/min/range over
        # the column. 2026-09-23: 32 of them, 25 at WCRC_PIGEON_CREEK_CWS
        # (1,652..5,662) and 7 at HBRC_LAKE_WHAKAKI, every one of those exactly
        # -12,085, which is a repeated sentinel and was never a reading.
        #
        # NULL is what this column already means by "not measured here". A sum
        # whose observations are gone cannot be converted by anything, later or
        # by hand, so keeping it preserves no recoverable information.
        if args.null_unconvertible:
            params = {"vars": list(SOLAR_VARS), "quarantine": QUARANTINE_QUALITY,
                      "lo": lo, "hi": hi}
            sql = f"""
                UPDATE weather_data_daily w SET solar_radiation = NULL
                 WHERE w.date BETWEEN :lo AND :hi
                   AND w.solar_radiation IS NOT NULL
                   AND (w.solar_radiation > 1500 OR w.solar_radiation < -50)
                   AND NOT EXISTS (SELECT 1 FROM ({_DAILY_MEAN}) d
                                    WHERE d.station_id = w.station_id
                                      AND d.obs_date = w.date)
            """
            if args.apply:
                n = db.execute(text(sql), params).rowcount
                db.commit()
                print(f"\nnulled {n} unconvertible row(s)")
            else:
                n = db.execute(text(sql.replace(
                    "UPDATE weather_data_daily w SET solar_radiation = NULL",
                    "SELECT count(*) FROM weather_data_daily w")),
                    params).scalar()
                print(f"\nwould null {n} unconvertible row(s)")

        verb = "would rewrite" if not args.apply else "rewrote"
        # The per-year tally is taken BEFORE any nulling, so say so rather than
        # reporting rows as left alone that this same run has just cleared.
        fate = ("were unreachable from raw data (see the null count above)"
                if args.null_unconvertible
                else "keep a sum because their raw data is gone")
        print(f"\n{verb} {total_changed} row(s); {total_missing} row(s) {fate}")
        if not args.apply:
            print("DRY RUN — nothing written. Re-run with --apply.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
