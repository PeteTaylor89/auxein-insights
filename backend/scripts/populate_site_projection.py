#!/usr/bin/env python3
"""Pull every Pro site's own cell out of the projection surfaces.

    # every ready site
    python backend/scripts/populate_site_projection.py --require-surfaces

    # one site, after it is placed or moved
    python backend/scripts/populate_site_projection.py --site 16

## This is not a scheduled job, and that is the point

`populate_site_daily.py` runs after every fit because the daily surface changes
every day. The projection surfaces do not change: they are a published set of
612 rasters composed once from the MfE downscaling. A site's projected record
therefore has exactly two triggers, and both are events rather than a clock:

  * the site is PLACED  — it has a cell for the first time
  * the site is MOVED   — `grid_key` changes, and every stored row now
                          describes somebody else's cell

Putting this on a schedule would re-read 612 objects a night to write the same
numbers back. It is wired into placement instead; this script is the backfill
for sites placed before the table existed, and the repair path when a
re-composition of the surfaces changes what is published.

## --require-surfaces

Same contract as the daily populator, for the same reason: this platform's
designed-in failure mode is a silent no-op reporting success. The flag turns
"I found nothing" into a non-zero exit, and a scheduled or automated caller
must pass it. It is off by default so a human exploring an empty database does
not have to.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from db.session import SessionLocal                                 # noqa: E402
from db.models.insights_site import InsightsSite                    # noqa: E402
from services import insights_site_service as svc                   # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--site", type=int,
                   help="one site id; default is every ready site")
    p.add_argument("--require-surfaces", action="store_true",
                   help="exit non-zero if nothing was read. Pass this from "
                        "anything automated.")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        projections, baselines = svc.projection_surfaces(db)
        print(f"{len(projections)} projection surfaces, "
              f"{len(baselines)} baseline surfaces published")
        if not projections:
            print("  nothing to sample")
            if args.require_surfaces:
                print("FAILED: --require-surfaces was set and nothing "
                      "is published")
                return 1
            return 0
        if not baselines:
            # Every delta would be NULL and the table would carry projected
            # absolutes only. That is a legitimate state to store but a
            # terrible one to store SILENTLY, because the page shows change.
            print("  WARNING: no kind='baseline' surfaces — every delta will "
                  "be NULL and the site page has no change to show")

        q = db.query(InsightsSite).filter(InsightsSite.status == "ready")
        if args.site:
            q = q.filter(InsightsSite.id == args.site)
        sites = q.order_by(InsightsSite.id).all()
        if not sites:
            print("no ready sites")
            return 1 if args.require_surfaces else 0

        total, valued, failures = 0, 0, []
        for site in sites:
            r = svc.populate_projections(db, site)
            total += r["written"]
            valued += r["with_delta"]
            flag = ""
            if r["written"] and not r["with_delta"]:
                # The rasters exist and this cell read NULL on all of them,
                # which is a land-mask or grid-index problem at this site
                # rather than a missing-surface problem in the set.
                flag = "  ALL NULL - check the site's cell"
                failures.append(site.id)
            print(f"  site {site.id:<5} {site.label or '-':<24} "
                  f"{r['written']:>4} rows, {r['with_delta']:>4} with a delta{flag}")
            if r["reason"]:
                print(f"        {r['reason']}")

        print(f"\n{total} rows written across {len(sites)} site(s), "
              f"{valued} carrying a delta")

        # Assert on the COUNT, never on having reached the end.
        if args.require_surfaces and valued == 0:
            print("FAILED: surfaces are published but no site read a delta")
            return 1
        if failures:
            print(f"FAILED: sites with no value anywhere: {failures}")
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
