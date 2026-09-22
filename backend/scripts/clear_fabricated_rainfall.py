#!/usr/bin/env python3
"""
scripts/clear_fabricated_rainfall.py

Clear daily rainfall values that no observation ever produced.

    python scripts/clear_fabricated_rainfall.py                 # dry run
    python scripts/clear_fabricated_rainfall.py --apply --keys out.csv

Found 2026-09-22 while chasing blank rainfall cells on the Measured tab.
MDC_BLENHEIM_BOWLING has no rain gauge at all (its raw feed is temperature,
humidity and wind only), yet `weather_data_daily` held 0.00 mm for every day from
2025-09-01 to 2026-06-20 with `rainfall_record_count = 0`. The same shape turned up
at 8,943 rows in HARVEST, GW, MDC, TDC, HORIZONS and HBRC.

WHERE THEY CAME FROM
--------------------
Before the B4.1 guard (247d886, 2026-06-22), the daily aggregator wrote
`COALESCE(SUM(rain), 0)`, which turned "no rain variable" into "no rain". The
aggregator writes NULL now, but `rainfall_mm` is not in
`TEMP_AUTHORITATIVE_COLUMNS`, so the upsert's `COALESCE(EXCLUDED, existing)` keeps
the stored 0 against every later NULL. Re-aggregating reports success and changes
nothing — the collision described in quarantine_stuck_rainfall.py. So the rows are
cleared directly.

WHAT IS NOT TOUCHED
-------------------
SYNOP_GTS rows. GHCN-Daily PRCP (ingestion/sources/noaa.py) is a legitimate SECOND
writer of `rainfall_mm` for SYNOP devices only, and it writes no record count, so
its rows look exactly like this fault. Half of them are non-zero. They are real.

Only EXACT zeros are cleared. A non-zero value with no records behind it did not
come from this bug, and is left for someone to explain.

`--keys` writes every cleared (station_id, date) first. Every value was 0.00, so
that file is the whole undo.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402
from sqlalchemy import text                                         # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from db.session import SessionLocal                                 # noqa: E402

# The one source with a second rainfall writer. See the docstring.
SECOND_WRITER_SOURCES = ('SYNOP_GTS',)

_MATCH = """
      FROM weather_data_daily d
      JOIN weather_stations w ON w.station_id = d.station_id
     WHERE d.rainfall_mm = 0
       AND coalesce(d.rainfall_record_count, 0) = 0
       AND w.data_source <> ALL(:keep)
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="write. Without it nothing is written.")
    ap.add_argument("--keys", type=Path,
                    help="CSV of every (station_id, date) cleared. Required with --apply.")
    args = ap.parse_args()
    if args.apply and not args.keys:
        ap.error("--apply needs --keys, so the clear can be undone")

    params = {"keep": list(SECOND_WRITER_SOURCES)}
    db = SessionLocal()
    try:
        summary = db.execute(text(f"""
            SELECT w.data_source, count(DISTINCT d.station_id) AS stations,
                   count(*) AS rows, min(d.date) AS lo, max(d.date) AS hi
            {_MATCH}
             GROUP BY 1 ORDER BY 3 DESC
        """), params).mappings().all()
        total = sum(r["rows"] for r in summary)
        print(f"{total} fabricated rainfall zero(s)")
        for r in summary:
            print(f"  {r['data_source']:<10} {r['stations']:>3} station(s) "
                  f"{r['rows']:>6} row(s)  {r['lo']} .. {r['hi']}")
        if not args.apply:
            print("\nDRY RUN — nothing written.")
            return 0
        if not total:
            return 0

        keys = db.execute(text(f"""
            SELECT d.station_id, w.station_code, d.date {_MATCH}
             ORDER BY 1, 3
        """), params).all()
        args.keys.parent.mkdir(parents=True, exist_ok=True)
        with args.keys.open("w", newline="") as fh:
            wr = csv.writer(fh)
            wr.writerow(["station_id", "station_code", "date", "rainfall_mm"])
            for k in keys:
                wr.writerow([k[0], k[1], k[2].isoformat(), "0.00"])
        print(f"\nwrote {len(keys)} key(s) to {args.keys}")

        n = db.execute(text("""
            UPDATE weather_data_daily d
               SET rainfall_mm = NULL, rainfall_record_count = 0
              FROM weather_stations w
             WHERE w.station_id = d.station_id
               AND d.rainfall_mm = 0
               AND coalesce(d.rainfall_record_count, 0) = 0
               AND w.data_source <> ALL(:keep)
        """), params).rowcount
        if n != len(keys):
            db.rollback()
            print(f"REFUSING: matched {len(keys)} key(s) but the update hit {n}; "
                  "rolled back")
            return 1
        db.commit()
        print(f"APPLIED: {n} row(s) cleared.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
