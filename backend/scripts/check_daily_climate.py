#!/usr/bin/env python
"""Sanity-check the daily climate rollup, per source per month.

This exists because a defect ran for six years without tripping anything. Seven
Hilltop councils stored one observation per station-day and the rollup turned it
into temp_min == temp_max == temp_mean on 177,536 station-days. Every row count
looked healthy — the days were all there, the values were all plausible in
isolation, and the arithmetic was never wrong. What was wrong was a distribution,
and nothing was looking at distributions.

Three checks, each keyed to a way the pipeline has actually failed:

  DTR=0        A station-day whose min equals its max. Physically impossible
               outside a frozen sensor. This is the direct signature of the
               2020-2026 Hilltop defect.
  thin days    Station-days with too few temperature observations to characterise
               a day. Catches the same fault one step earlier, and also catches a
               council quietly downgrading its published resolution.
  mean DTR     A source whose mean diurnal range sits far below the NZ norm of
               roughly 7-12 degC is being diluted by degenerate days even if no
               single day is exactly zero.

Usage:
    python backend/scripts/check_daily_climate.py                  # last 90 days
    python backend/scripts/check_daily_climate.py --since 2020-01-01 --by-month
    python backend/scripts/check_daily_climate.py --source MDC,HBRC

Exits 1 if any source breaches a threshold, so it can gate a cron.
"""
import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal

from scripts.daily_aggregation import MIN_TEMP_RECORDS_FOR_DAILY

# A source breaching any of these is reported and fails the run.
MAX_PCT_ZERO_DTR = 1.0    # percent of station-days with temp_max == temp_min
MAX_PCT_THIN = 5.0        # percent of station-days below the observation floor
MIN_MEAN_DTR = 4.0        # degC; NZ sits around 7-12, so 4 is a generous floor

QUERY = """
    SELECT
        ws.data_source,
        {bucket} AS bucket,
        count(*) AS days,
        round(100.0 * count(*) FILTER (
            WHERE d.temp_max IS NOT NULL AND d.temp_max - d.temp_min = 0
        ) / NULLIF(count(*) FILTER (WHERE d.temp_max IS NOT NULL), 0), 2) AS pct_zero_dtr,
        -- Denominator is days the station reported temperature AT ALL. Measured
        -- against every station-day, a rainfall-only network (ECan, NRC, most of
        -- BoP) reads as 100 percent thin and the check becomes noise you learn to
        -- ignore, which is how the original defect survived.
        round(100.0 * count(*) FILTER (
            WHERE d.temp_record_count > 0 AND d.temp_record_count < :floor
        ) / NULLIF(count(*) FILTER (WHERE d.temp_record_count > 0), 0), 2) AS pct_thin,
        round(avg(d.temp_max - d.temp_min)::numeric, 2) AS mean_dtr,
        round(avg(d.temp_record_count) FILTER (
            WHERE d.temp_record_count > 0
        )::numeric, 1) AS avg_recs,
        count(*) FILTER (WHERE d.temp_record_count > 0) AS temp_days
    FROM weather_data_daily d
    JOIN weather_stations ws ON ws.station_id = d.station_id
    WHERE d.date >= :since
      {source_filter}
    GROUP BY 1, 2
    ORDER BY 1, 2
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default=None, help="YYYY-MM-DD (default: 90 days ago)")
    ap.add_argument("--by-month", action="store_true", help="bucket by month, not whole period")
    ap.add_argument("--source", default=None, help="comma-separated data_source filter")
    args = ap.parse_args()

    since = args.since or (date.today() - timedelta(days=90)).isoformat()
    bucket = "to_char(d.date, 'YYYY-MM')" if args.by_month else "'(all)'"
    params = {"since": since, "floor": MIN_TEMP_RECORDS_FOR_DAILY}

    source_filter = ""
    if args.source:
        source_filter = "AND ws.data_source = ANY(:sources)"
        params["sources"] = [s.strip().upper() for s in args.source.split(",")]

    sql = QUERY.format(bucket=bucket, source_filter=source_filter)

    with SessionLocal() as db:
        rows = list(db.execute(text(sql), params))

    print(f"Daily climate sanity - since {since}, temp floor {MIN_TEMP_RECORDS_FOR_DAILY} obs/day\n")
    print(f"  {'source':<11}{'bucket':<10}{'days':>8}{'%DTR=0':>9}{'%thin':>8}"
          f"{'meanDTR':>9}{'avgRecs':>9}  flags")

    failures = []
    for src, bkt, days, pct_zero, pct_thin, mean_dtr, avg_recs, temp_days in rows:
        if not temp_days:
            print(f"  {str(src):<11}{str(bkt):<10}{days:>8}{'-':>9}{'-':>8}"
                  f"{'-':>9}{'-':>9}  (no temperature - rainfall-only source)")
            continue
        flags = []
        if pct_zero is not None and pct_zero > MAX_PCT_ZERO_DTR:
            flags.append(f"DTR=0 {pct_zero}%")
        if pct_thin is not None and pct_thin > MAX_PCT_THIN:
            flags.append(f"thin {pct_thin}%")
        if mean_dtr is not None and mean_dtr < MIN_MEAN_DTR:
            flags.append(f"DTR {mean_dtr}")
        if flags:
            failures.append((src, bkt, flags))
        print(f"  {str(src):<11}{str(bkt):<10}{days:>8}{str(pct_zero):>9}{str(pct_thin):>8}"
              f"{str(mean_dtr):>9}{str(avg_recs):>9}  {'; '.join(flags)}")

    if failures:
        print(f"\nFAIL - {len(failures)} source-bucket(s) breached a threshold.")
        print("A zero diurnal range is not a small error. Check the ingest resolution "
              "for the flagged sources before trusting any daily temperature statistic "
              "or anything derived from one (GDD, frost, phenology, disease pressure).")
        return 1

    print("\nOK - no source breached a threshold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
