"""Extend every Pro site's monthly record by one newly published month.

    python backend/scripts/extend_site_monthly.py --month 2026-08
    python backend/scripts/extend_site_monthly.py --month 2026-08 --site 42
    python backend/scripts/extend_site_monthly.py --month 2026-08 --dry-run

## Why this is not `populate_insights_sites.py`

That script re-extracts a site's WHOLE record — ~7,700 single-cell reads across
every month in the archive — because it exists to answer "a subscriber just
placed a point". Running it monthly across sixty-eight sites would be half a
million cell reads to add ten values each, every month, forever.

This reads only the new month: ten bands, one month, per site. The season rows
are then recomputed from the DATABASE rather than from that window, so they are
identical to what a full repopulation would have produced — a season derived
from one month of data would be nonsense, and the delete-not-in-set at the end
of `populate` would then remove every season it did not see.

## The season rows usually do not move, and that is expected

The product's season is Sep-Apr. A month from May to August belongs to no
season, so extending into one changes `insights_site_monthly` and leaves
`insights_site_season` untouched. The recompute still runs: it is cheap, it is
read-only when nothing changed, and skipping it on a calendar rule is how a
September month silently fails to open a vintage.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from db.models.insights_site import InsightsSite                    # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from services import insights_site_service as svc                   # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("extend-site-monthly")


def extend(db, site: InsightsSite, year: int, month: int,
           dry_run: bool) -> tuple[int, int]:
    rows = svc.extract_monthly(db, site, year=year, month=month)
    got = sum(1 for r in rows if r[5] is not None)
    if not rows:
        log.warning("site %-4s %-28s no surfaces readable for %04d-%02d",
                    site.id, (site.label or "")[:28], year, month)
        return 0, 0

    if dry_run:
        return len(rows), 0

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

    # The season pass reads the WHOLE record back out of the database. Cheap —
    # it is one indexed table read, no S3 — and it means the season metrics are
    # bit-identical to a full repopulation rather than an approximation of one.
    full = {}
    for variable, statistic, y, m, value in db.execute(text("""
        SELECT variable, statistic, year, month, value
          FROM insights_site_monthly
         WHERE site_id = :sid AND value IS NOT NULL
    """), {"sid": site.id}).all():
        full.setdefault((variable, statistic), {})[(y, m)] = value

    gdd = svc.derive_gdd10(full)
    season = svc.derive_season(full, gdd, last=svc.last_vintage(db))
    with raw.cursor() as cur:
        execute_values(cur, """
            INSERT INTO insights_site_season
                (site_id, vintage_year, metric, value, unit, baseline)
            VALUES %s
            ON CONFLICT (site_id, vintage_year, metric)
            DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit,
                          baseline = EXCLUDED.baseline
        """, [(site.id, v, mt, val, unit, base)
              for _sid, v, mt, val, unit, base in season], page_size=5000)
    db.commit()
    return len(rows), len(season)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--month", required=True, help="YYYY-MM")
    ap.add_argument("--site", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    year, month = (int(x) for x in args.month.split("-"))

    db = SessionLocal()
    q = db.query(InsightsSite).filter(InsightsSite.status == "ready")
    if args.site:
        q = q.filter(InsightsSite.id == args.site)
    sites = q.order_by(InsightsSite.id).all()
    log.info("%d ready site(s), month %s%s", len(sites), args.month,
             "  [DRY RUN]" if args.dry_run else "")

    total_rows, empty = 0, []
    for site in sites:
        try:
            n, n_season = extend(db, site, year, month, args.dry_run)
        except Exception:                                            # noqa: BLE001
            # One unreadable cell must not cost the other sixty-seven sites
            # their month. The site keeps whatever it already had.
            log.exception("site %s failed", site.id)
            db.rollback()
            empty.append(site.id)
            continue
        if n == 0:
            empty.append(site.id)
        total_rows += n

    log.info("%d monthly row(s) written across %d site(s)%s", total_rows,
             len(sites) - len(empty),
             f"; {len(empty)} with nothing: {empty}" if empty else "")
    db.close()
    return 1 if empty and not args.dry_run else 0


if __name__ == "__main__":
    raise SystemExit(main())
