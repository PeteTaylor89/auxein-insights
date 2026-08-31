#!/usr/bin/env python3
"""Phenology at every site's own cell, for one day.

    # today, every ready site
    python backend/scripts/populate_site_phenology.py --require-rows

    # one site, or a specific day
    python backend/scripts/populate_site_phenology.py --site 16
    python backend/scripts/populate_site_phenology.py --date 2026-11-15

    # rebuild a season after a re-fit changed the dailies underneath it
    python backend/scripts/populate_site_phenology.py --from 2026-09-01 --to 2026-11-15

## Where this belongs in the schedule

Beside the zone phenology stage, in the 18:00 NZ pipeline. It reads
`insights_site_daily`, which the 03:00 surfaces job writes, so it must run after
that and not before — a run at 02:00 would estimate from yesterday's
accumulation and quietly report it as today's.

Wired in as stage 4b, immediately after the ZONE phenology stage. That order is
a data dependency, not tidiness: this stores the region's dates alongside the
site's for comparison, so running before stage 4 would compare today's site
estimate against yesterday's region.

## --require-rows

The usual contract: this platform's designed-in failure mode is a silent no-op
reporting success, so an automated caller asserts on a ROW COUNT rather than on
an exit code. Off by default because finding nothing is CORRECT before
1 September — the accumulation starts then, and every date before it is a
legitimate zero.
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

import pytz                                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402
from db.models.insights_site import InsightsSite                    # noqa: E402
from services import site_phenology as svc                          # noqa: E402

NZ = pytz.timezone("Pacific/Auckland")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--site", type=int, help="one site id")
    p.add_argument("--date", help="a single day (default: today, NZ)")
    p.add_argument("--from", dest="start", help="first day of a range")
    p.add_argument("--to", dest="end", help="last day of a range")
    p.add_argument("--require-rows", action="store_true",
                   help="exit non-zero if nothing was written")
    # The pipeline passes this to every stage. Without it here a dry run of
    # `run_daily_processing.py` would report itself as touching nothing while
    # this stage wrote for real — the one failure a dry run exists to prevent.
    p.add_argument("--dry-run", action="store_true",
                   help="estimate and report, write nothing")
    return p.parse_args()


def window(args) -> list[date]:
    if args.start or args.end:
        if not (args.start and args.end):
            raise SystemExit("--from and --to go together")
        lo, hi = date.fromisoformat(args.start), date.fromisoformat(args.end)
        if hi < lo:
            raise SystemExit("--to is before --from")
        return [lo + timedelta(days=i) for i in range((hi - lo).days + 1)]
    # NZ, never UTC. `date.today()` on a UTC server is YESTERDAY for the whole
    # NZ morning, so an unqualified "today" would estimate the wrong day for
    # most of the working day.
    return [date.fromisoformat(args.date) if args.date
            else NZ.localize(__import__("datetime").datetime.now()).date()]


def main() -> int:
    args = parse_args()
    days = window(args)

    db = SessionLocal()
    try:
        q = db.query(InsightsSite).filter(InsightsSite.status == "ready")
        if args.site:
            q = q.filter(InsightsSite.id == args.site)
        sites = q.order_by(InsightsSite.id).all()
        if not sites:
            print("no ready sites")
            return 1 if args.require_rows else 0

        print(f"{len(sites)} site(s) over {len(days)} day(s): "
              f"{days[0]} .. {days[-1]}"
              + ("   DRY RUN - nothing will be written" if args.dry_run else ""))
        total, no_data = 0, []
        for site in sites:
            written = 0
            reason = None
            for day in days:
                if args.dry_run:
                    rows = svc.estimate(db, site, day)
                    written += len(rows)
                    reason = reason or (None if rows else
                                        f"no daily record at this site for {day}")
                    continue
                r = svc.populate(db, site, day)
                written += r["rows"]
                reason = reason or r["reason"]
            total += written
            if written == 0:
                no_data.append(site.id)
            print(f"  site {site.id:<5} {(site.label or '-')[:24]:<24} "
                  f"{written:>5} row(s)"
                  + (f"   {reason}" if written == 0 and reason else ""))

        verb = "estimated" if args.dry_run else "written"
        print(f"\n{total} row(s) {verb} across {len(sites)} site(s)")
        if no_data:
            # Before 1 September this is the correct answer for every site, so
            # it is reported rather than treated as a failure on its own.
            print(f"{len(no_data)} site(s) produced nothing: {no_data[:12]}"
                  + (" ..." if len(no_data) > 12 else ""))
        if args.dry_run:
            db.rollback()
        if args.require_rows and total == 0:
            print("FAILED: --require-rows was set and nothing was written")
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
