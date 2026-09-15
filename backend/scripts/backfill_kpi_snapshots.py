#!/usr/bin/env python
"""Build the KPI snapshot history: computed months + hand-kept seed rows.

Scoped in docs/plans/KPI_DASHBOARD_SCOPE_2026-09-15.md.

    # see what would happen (default — writes nothing)
    python scripts/backfill_kpi_snapshots.py

    # computed history + the manual seed
    python scripts/backfill_kpi_snapshots.py --apply

    # one month only
    python scripts/backfill_kpi_snapshots.py --apply --from 2026-09 --to 2026-09

DRY RUN IS THE DEFAULT. A bare run in this repo has created duplicate rows
before (the seed-templates incident), so nothing writes without --apply.

MANUAL ROWS WIN. Three metrics were tracked by hand before any of this existed,
and for those months the hand-kept figure is MORE accurate than anything this
script can compute — `is_active`, `is_verified` and `newsletter_opt_in` are all
mutable, so a reconstruction reports today's flags against an old population.
Measured drift on the station series: +11, +10, -16, -11 across May-Aug 2026,
converging to 0 only at the present day. So a computed value never overwrites a
`source: manual` row; it is skipped and reported.
"""
import argparse
import os
import sys
from datetime import datetime, timezone, date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db.session import SessionLocal
from db.models.kpi_snapshot import KpiSnapshot
from services.kpi_metrics import METRICS, compute_all, DEFINITIONS_VERSION


# ── The hand-kept sheet ───────────────────────────────────────────────────────
#
# Columns are month-start snapshots; the row dated 2026-09-01 is the state at
# that instant, i.e. the month that ended 31 August.
#
# The date mapping was CONFIRMED against the database, not assumed: reconstructing
# station counts from created_at gives 145 at 2026-07-01 and 932 active at
# 2026-09-01 — both exact matches — and rules out the series ending 2026-08-01,
# where the database holds ~430.
MANUAL_HISTORY = {
    "data.active_stations": {
        "2026-05-01": 70,
        "2026-06-01": 71,
        "2026-07-01": 145,
        "2026-08-01": 438,
        "2026-09-01": 932,
    },
    "insights.newsletter_pct": {
        "2026-07-01": 85.0,
        "2026-08-01": 86.4,
        "2026-09-01": 86.0,
    },
    # No function computes this — "complete view" was never defined. It moved
    # 39% -> 61% in one month, so a rule IS being applied by hand; capturing it
    # is what would let a metric function take this over.
    "insights.live_subregions": {
        "2026-07-01": 39.0,
        "2026-08-01": 39.0,
        "2026-09-01": 61.0,
    },
}

MANUAL_META = {
    "source": "manual",
    "note": "hand-tracked before automation; more accurate than reconstruction "
            "because the underlying flags are mutable",
    "definitions_version": DEFINITIONS_VERSION,
}


def parse_args():
    p = argparse.ArgumentParser(description="Backfill and seed KPI snapshots.")
    p.add_argument("--apply", action="store_true",
                   help="Actually write. Without this nothing is committed.")
    p.add_argument("--from", dest="from_month", default="2026-03",
                   help="First snapshot month, YYYY-MM (default 2026-03).")
    p.add_argument("--to", dest="to_month", default=None,
                   help="Last snapshot month, YYYY-MM (default: the current month).")
    p.add_argument("--skip-manual", action="store_true",
                   help="Do not load the hand-kept seed rows.")
    p.add_argument("--only", help="Comma-separated metric keys to process.")
    return p.parse_args()


def month_starts(from_month: str, to_month: str):
    y, m = map(int, from_month.split("-"))
    ty, tm = map(int, to_month.split("-"))
    out = []
    while (y, m) <= (ty, tm):
        out.append(datetime(y, m, 1, tzinfo=timezone.utc))
        m += 1
        if m == 13:
            m, y = 1, y + 1
    return out


def existing_manual_keys(db):
    """(snapshot_date, metric_key) pairs already recorded as hand-kept."""
    rows = db.execute(
        select(KpiSnapshot.snapshot_date, KpiSnapshot.metric_key, KpiSnapshot.meta)
    ).all()
    return {
        (r[0], r[1]) for r in rows
        if isinstance(r[2], dict) and r[2].get("source") == "manual"
    }


def upsert(db, snapshot_date, metric_key, value, period_value, meta):
    stmt = pg_insert(KpiSnapshot.__table__).values(
        snapshot_date=snapshot_date,
        metric_key=metric_key,
        value=value,
        period_value=period_value,
        meta=meta,
    ).on_conflict_do_update(
        constraint="uq_kpi_snapshot",
        set_={"value": value, "period_value": period_value, "meta": meta},
    )
    db.execute(stmt)


def main():
    args = parse_args()
    to_month = args.to_month or datetime.now(timezone.utc).strftime("%Y-%m")
    only = {k.strip() for k in args.only.split(",")} if args.only else None

    db = SessionLocal()
    try:
        protected = existing_manual_keys(db)
        written = skipped = 0

        # ── 1. Manual seed first, so it is in `protected` for step 2 ─────────
        if not args.skip_manual:
            print("== manual seed ==")
            for metric_key, series in MANUAL_HISTORY.items():
                if only and metric_key not in only:
                    continue
                for d_str, val in sorted(series.items()):
                    d = date.fromisoformat(d_str)
                    print(f"  {d}  {metric_key:<30} = {val}   [manual]")
                    if args.apply:
                        upsert(db, d, metric_key, val, None, dict(MANUAL_META))
                    protected.add((d, metric_key))
                    written += 1

        # ── 2. Computed months ───────────────────────────────────────────────
        print("\n== computed ==")
        for as_at in month_starts(args.from_month, to_month):
            d = as_at.date()
            results = compute_all(db, as_at)
            line = []
            for m in METRICS:
                if only and m.key not in only:
                    continue
                if (d, m.key) in protected:
                    skipped += 1
                    line.append(f"{m.key}=SKIP(manual)")
                    continue
                r = results[m.key]
                if args.apply:
                    upsert(db, d, m.key, r.value, r.period_value, r.meta)
                written += 1
                line.append(f"{m.key}={r.value}")
            print(f"  {d}  " + "  ".join(line[:6]) + (" ..." if len(line) > 6 else ""))

        if args.apply:
            db.commit()
            print(f"\nCOMMITTED. {written} rows written, {skipped} left as manual.")
        else:
            db.rollback()
            print(f"\nDRY RUN — nothing written. Would write {written} rows, "
                  f"leaving {skipped} manual rows untouched.")
            print("Re-run with --apply to commit.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
