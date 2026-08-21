"""Pull every Pro site's own cell out of the daily surfaces.

Two jobs in one script, because they differ only by window:

    # after the engine's daily run writes day D
    python backend/scripts/populate_site_daily.py --days 1 --require-surfaces

    # the weekly sweep, after the engine re-fits D-9..D-3
    python backend/scripts/populate_site_daily.py --refit-window --require-surfaces

    # backfill a season, or one site
    python backend/scripts/populate_site_daily.py --from 2026-09-01 --to 2027-04-30
    python backend/scripts/populate_site_daily.py --site 16 --days 30

## Why the re-fit sweep is not optional

`daily_aggregation.py` keeps revising `weather_data_daily` for about three days
after the fact, so the engine re-fits D-9 through D-3 weekly
(`docs/plans/LIVE_SURFACE_ENGINE_2026-08-20.md` §2). Those re-fits change values
this table has already stored. Without the sweep, every Pro site keeps the first
and worst estimate of every day forever, and the page silently disagrees with
the surface it claims to be reading.

## --require-surfaces, and why it is not the default

The engine's first designed-in failure mode is *a silent no-op reports success*:
`run_ingestion` once printed "Found 0 active Harvest stations" and exited 0 for a
whole fleet backfill. So a scheduled run asserts on a ROW COUNT, not an exit
code, and `--require-surfaces` is what turns "I found nothing" into a non-zero
exit.

It is off by default because right now finding nothing is CORRECT: no daily
surface has been indexed yet — `surface_run` holds monthly, season and records
rows only. Every scheduled invocation must pass the flag; a human exploring
should not have to.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from db.models.insights_site import InsightsSite                    # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from services import insights_site_service as svc                   # noqa: E402

# The engine re-fits D-9 through D-3. Stated here as the span it is, so that if
# the engine's window moves this is the one line to change.
REFIT_FROM_DAYS, REFIT_TO_DAYS = 9, 3


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--from", dest="start", help="first day, YYYY-MM-DD")
    ap.add_argument("--to", dest="end", help="last day, YYYY-MM-DD")
    ap.add_argument("--days", type=int,
                    help="the last N days ending yesterday")
    ap.add_argument("--refit-window", action="store_true",
                    help=f"D-{REFIT_FROM_DAYS}..D-{REFIT_TO_DAYS}, "
                         "the engine's weekly re-fit span")
    ap.add_argument("--site", type=int, help="one site id, else every ready site")
    ap.add_argument("--require-surfaces", action="store_true",
                    help="exit non-zero if the window holds no daily surface. "
                         "Every scheduled run must pass this.")
    return ap.parse_args()


def window(args: argparse.Namespace) -> tuple[date, date]:
    # Yesterday, not today: the engine runs at D+2 and a partial today would be
    # written as a complete day and then never revisited, because the re-fit
    # sweep only reaches back to D-3.
    yesterday = date.today() - timedelta(days=1)
    if args.refit_window:
        return (yesterday - timedelta(days=REFIT_FROM_DAYS - 1),
                yesterday - timedelta(days=REFIT_TO_DAYS - 1))
    if args.days:
        return yesterday - timedelta(days=args.days - 1), yesterday
    if args.start and args.end:
        return date.fromisoformat(args.start), date.fromisoformat(args.end)
    raise SystemExit("give --days, --refit-window, or both --from and --to")


def main() -> int:
    args = parse_args()
    start, end = window(args)
    if end < start:
        raise SystemExit(f"empty window: {start} to {end}")

    db = SessionLocal()
    try:
        surfaces = svc.daily_surfaces(db, start, end)
        days_covered = len({r["valid_at"] for r in surfaces})
        print(f"window {start} .. {end}")
        print(f"  {len(surfaces)} daily surface objects over {days_covered} days")

        if not surfaces:
            # Said plainly, and it is a failure only when the caller asserts it
            # should not happen. See the module docstring.
            print("  no daily surfaces are indexed for this window")
            if args.require_surfaces:
                print("FAILED: --require-surfaces was set and nothing was found")
                return 1
            print("  nothing to do (pass --require-surfaces in a scheduled run)")
            return 0

        q = db.query(InsightsSite).filter(InsightsSite.status == "ready")
        if args.site:
            q = q.filter(InsightsSite.id == args.site)
        sites = q.order_by(InsightsSite.id).all()
        if not sites:
            print("  no ready sites")
            return 1 if args.require_surfaces else 0

        total_written, total_valued, failures = 0, 0, []
        for site in sites:
            result = svc.populate_daily(db, site, start, end)
            total_written += result["written"]
            total_valued += result.get("days_with_value", 0)
            flag = ""
            if result["written"] and not result.get("days_with_value"):
                # Surfaces exist and this cell read NULL on every one of them.
                # That is a land-mask or grid-index problem at this site, not a
                # missing-data problem in the window, and it needs saying
                # separately or it hides inside a healthy-looking total.
                flag = "  ALL NULL - check the site's cell"
                failures.append(site.id)
            print(f"  site {site.id:<5} {site.label or '-':<24} "
                  f"{result['written']:>4} days written, "
                  f"{result.get('days_with_value', 0):>4} with a value{flag}")
            if result["reason"]:
                print(f"        {result['reason']}")

        print(f"\n{total_written} rows written across {len(sites)} sites, "
              f"{total_valued} carrying a value")

        # Assert on the COUNT, never on having reached the end. This is the
        # check that would have caught the Harvest fleet backfill that printed
        # a tick against zero records.
        if args.require_surfaces and total_valued == 0:
            print("FAILED: daily surfaces exist but no site read a value from them")
            return 1
        if failures:
            print(f"FAILED: sites with no value anywhere in the window: {failures}")
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
