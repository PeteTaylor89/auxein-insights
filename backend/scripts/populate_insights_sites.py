"""Populate Pro sites — the background job behind "your site is populating".

A subscriber places a point and the API returns immediately with
`status='populating'`. This job does the work: it reads that cell out of every
monthly surface in the archive, derives the season metrics, and flips the site
to `ready`.

Run it as a cron. It picks up whatever is queued::

    python backend/scripts/populate_insights_sites.py
    python backend/scripts/populate_insights_sites.py --site 42 --force

## Why this is a job and not a request

~7,700 single-cell reads across the archive. Each touches one 512 px COG block,
so it is tens of KB over the wire rather than a 30 MB raster, but it is still
minutes rather than milliseconds. Doing it inline would hold a worker for the
whole placement — and this platform has already taken both workers down once by
parking the event loop on network I/O.

## Failure leaves the site FAILED, with a reason, and keeps the old rows

`status_detail` carries something the subscriber can read. The previous
population is not deleted first: a re-population that dies half way through
would otherwise leave a paying customer with a blank page and no way back. New
rows overwrite by primary key; stale rows from a wider previous extraction are
cleaned only once the new one has fully succeeded.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402
from db.models.insights_site import InsightsSite                    # noqa: E402
from services import insights_site_service as svc                   # noqa: E402

log = logging.getLogger("populate_insights_sites")


def populate(db, site: InsightsSite) -> int:
    started = datetime.now(timezone.utc)
    log.info("site %s (user %s, slot %s) at %.4f,%.4f -> cell %s,%s",
             site.id, site.public_user_id, site.slot_index,
             site.latitude, site.longitude, site.grid_row, site.grid_col)

    rows = svc.extract_monthly(db, site)
    if not rows:
        raise RuntimeError("no surfaces were readable for this cell")

    # Pivot for the season pass: {(variable, statistic): {(year, month): value}}
    monthly: dict = {}
    for _sid, variable, statistic, year, month, value in rows:
        monthly.setdefault((variable, statistic), {})[(year, month)] = value

    non_null = sum(1 for r in rows if r[5] is not None)
    if non_null == 0:
        # Every read came back nodata. The placement check should have caught
        # this, so it means the cell moved or the archive changed underneath.
        raise RuntimeError("every sample was nodata — the cell is off the "
                           "land mask")

    gdd = svc.derive_gdd10(monthly)
    # Ask the archive how far it reaches rather than inheriting a constant
    # that was true in August and wrong in September.
    season = svc.derive_season(monthly, gdd, last=svc.last_vintage(db))

    from psycopg2.extras import execute_values
    raw = db.connection().connection
    with raw.cursor() as cur:
        execute_values(cur, """
            INSERT INTO insights_site_monthly
                (site_id, variable, statistic, year, month, value)
            VALUES %s
            ON CONFLICT (site_id, variable, statistic, year, month)
            DO UPDATE SET value = EXCLUDED.value
        """, rows, page_size=5000)

        execute_values(cur, """
            INSERT INTO insights_site_season
                (site_id, vintage_year, metric, value, unit, baseline)
            VALUES %s
            ON CONFLICT (site_id, vintage_year, metric)
            DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit,
                          baseline = EXCLUDED.baseline
        """, [(site.id, v, m, val, unit, base)
              for _sid, v, m, val, unit, base in season], page_size=5000)

        # Only now that the new extraction is complete: drop anything the
        # previous one wrote that this one did not. Doing this first would
        # blank the site for the length of the run.
        #
        # Two parallel arrays with explicit casts rather than a row-tuple
        # `= ANY(...)`: Postgres cannot hash a record against an array whose
        # element type it has not been told, and the failure ("could not
        # identify a hash function for type unknown") happens at execution, not
        # at parse, so it only shows up on a real re-population.
        cur.execute("""
            DELETE FROM insights_site_season s
             WHERE s.site_id = %s
               AND NOT EXISTS (
                   SELECT 1
                     FROM unnest(%s::int[], %s::text[]) AS t(vintage, metric)
                    WHERE t.vintage = s.vintage_year AND t.metric = s.metric)
        """, (site.id,
              [int(v) for _s, v, m, _val, _u, _b in season],
              [str(m) for _s, v, m, _val, _u, _b in season]))

    site.status = "ready"
    site.status_detail = None
    site.populated_at = datetime.now(timezone.utc)
    db.commit()

    took = (datetime.now(timezone.utc) - started).total_seconds()
    log.info("site %s ready: %d monthly rows (%d with a value), %d season rows,"
             " %.0fs", site.id, len(rows), non_null, len(season), took)
    return len(rows)


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--site", type=int, default=None,
                   help="populate one site by id")
    p.add_argument("--force", action="store_true",
                   help="populate even if the site is already ready")
    p.add_argument("--limit", type=int, default=10,
                   help="max queued sites per run (default 10)")
    args = p.parse_args(argv)

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    db = SessionLocal()
    try:
        q = db.query(InsightsSite)
        if args.site:
            sites = q.filter(InsightsSite.id == args.site).all()
            if sites and sites[0].status == "ready" and not args.force:
                log.info("site %s is already ready; pass --force to redo it",
                         args.site)
                return 0
        else:
            sites = (q.filter(InsightsSite.status == "populating")
                      .order_by(InsightsSite.requested_at)
                      .limit(args.limit).all())

        if not sites:
            log.info("nothing queued")
            return 0

        failures = 0
        for site in sites:
            try:
                populate(db, site)
            except Exception as exc:                                # noqa: BLE001
                db.rollback()
                failures += 1
                log.exception("site %s failed", site.id)
                site.status = "failed"
                # Read by a paying customer, so it says what happened rather
                # than "an error occurred".
                site.status_detail = str(exc)[:500]
                db.commit()
        return 1 if failures else 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
