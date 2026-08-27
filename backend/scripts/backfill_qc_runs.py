#!/usr/bin/env python3
"""Reconstruct `weather_qc_run` rows for QC passes that predate the run table.

`weather_daily_qc` carried a `run_id` from the day it was created, so the passes
that found something are recoverable. The ones that found nothing are not, and
never will be — that is precisely the gap `weather_qc_run` exists to close, and
this script cannot close it retrospectively.

## Why these can honestly be marked `complete`

A `run_id` appears in `weather_daily_qc` only via `persist()`, which sits
downstream of the reject-rate guard and of the `--apply` check in `daily_qc`.
So a run id in the findings table is evidence the pass reached the end of its
work — not an assumption.

## What is left NULL, and why that matters

`n_station_days`, `reject_rate`, `n_quarantined_rows`, `n_cleared_rows`,
`n_late_enforced` and `reaggregated` were never recorded and cannot be derived:
the denominator depended on what the rollup held at the time, and the quarantine
counts depended on rows that have since been rewritten. They stay NULL rather
than being filled with a plausible number.

**A NULL `n_station_days` is therefore the marker of a reconstructed row.** Do
not "improve" this by back-computing a denominator from today's table — it would
make a reconstruction indistinguishable from a measurement, which is the same
class of error as the findings table's original silence.

`checks` is filled from the findings that survive, so a count here is a floor,
not a total: a finding later superseded by the unique key on
(station, date, variable, check) is attributed to whichever run wrote it last.

Usage:
    python backend/scripts/backfill_qc_runs.py            # dry run
    python backend/scripts/backfill_qc_runs.py --apply
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from sqlalchemy import text as sa_text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger("backfill_qc_runs")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="write the rows; without it nothing is changed")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from db.session import SessionLocal
    from scripts.daily_qc import CHECKS

    db = SessionLocal()
    try:
        rows = db.execute(sa_text("""
            SELECT q.run_id,
                   min(q.date)  AS window_start,
                   max(q.date)  AS window_end,
                   min(q.created_at) AS started_at,
                   max(q.created_at) AS finished_at,
                   count(*) AS n_findings,
                   count(*) FILTER (WHERE q.severity = 'reject') AS n_reject,
                   count(*) FILTER (WHERE q.severity = 'flag')   AS n_flag
            FROM weather_daily_qc q
            LEFT JOIN weather_qc_run r ON r.run_id = q.run_id
            WHERE q.run_id IS NOT NULL AND r.run_id IS NULL
            GROUP BY q.run_id
            ORDER BY min(q.created_at)
        """)).mappings().all()

        if not rows:
            logger.info("nothing to reconstruct — every run id already has a row")
            return 0

        logger.info("%d pass(es) to reconstruct:", len(rows))
        for r in rows:
            counts = {c: 0 for c in CHECKS}
            for name, n in db.execute(sa_text("""
                SELECT check_name, count(*) FROM weather_daily_qc
                WHERE run_id = :r GROUP BY check_name
            """), {"r": r["run_id"]}):
                counts[name] = n

            logger.info("  %s  %s..%s  %d finding(s), %d reject",
                        r["run_id"], r["window_start"], r["window_end"],
                        r["n_findings"], r["n_reject"])

            if args.apply:
                db.execute(sa_text("""
                    INSERT INTO weather_qc_run
                        (run_id, started_at, finished_at, status,
                         window_start, window_end, n_findings, n_reject,
                         n_flag, checks)
                    VALUES (:run_id, :started_at, :finished_at, 'complete',
                            :window_start, :window_end, :n_findings, :n_reject,
                            :n_flag, :checks)
                    ON CONFLICT (run_id) DO NOTHING
                """), {**{k: r[k] for k in
                          ("run_id", "started_at", "finished_at",
                           "window_start", "window_end", "n_findings",
                           "n_reject", "n_flag")},
                       "checks": json.dumps(counts)})

        if args.apply:
            db.commit()
            logger.info("reconstructed %d run row(s). n_station_days is NULL on "
                        "every one — that is the marker, not an omission.",
                        len(rows))
        else:
            logger.info("dry run — nothing written. Re-run with --apply.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
