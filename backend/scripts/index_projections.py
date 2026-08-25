#!/usr/bin/env python3
"""Index staged projection surfaces into `surface_projection_run`.

Reads the manifests written by `interpolation/projections.py` and upserts one
row per COG. Deliberately separate from `index_surfaces.py`: that script's whole
vocabulary is granularity/statistic/valid_at against a fitted surface, and a
projection shares none of it. See the `surface_projection_run` migration for why
the table is separate.

The upsert converges on re-run — everything outside the unique key is refreshed
— so re-indexing after a rebuild is safe and idempotent.

**Asserts on a row count, not an exit code.** A silent no-op reporting success
is failure mode #1 on this platform: `run_ingestion` once printed "Found 0
active Harvest stations" and exited 0 for an entire fleet backfill. `--expect`
makes that impossible for a scheduled or one-off publish.

Usage:
    python scripts/index_projections.py --dry-run
    python scripts/index_projections.py --expect 576
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger(__name__)

DEFAULT_ROOT = Path("scratchpad/projections/surfaces")
MANIFESTS = ("manifest.json", "manifest_gdd10.json")

COLUMNS = ("variable", "statistic", "scenario", "period", "season",
           "baseline", "resolution_m", "model_version", "rule", "unit",
           "s3_key", "source", "baseline_median", "projected_median",
           "delta_median", "delta_p5", "delta_p95", "status")

# `country_id` leads the unique index and is NOT in COLUMNS — Postgres resolves
# ON CONFLICT by matching the inference clause against an index, so it must be
# named here, while the column itself is supplied by the table's New Zealand
# server default. Same shape as `index_surfaces.RUN_KEYS`.
KEYS = ("country_id", "variable", "statistic", "scenario", "period", "season",
        "resolution_m", "model_version")

# CC BY 4.0 confirmed by Pete 2026-08-24. The licence REQUIRES attribution to
# travel with the work, so it lives in the row the API serves rather than only
# in a doc — this string is what the UI must render wherever a projection is
# shown. The COGs' own tags name MfE as the source but predate this string;
# they pick it up on the next rebuild.
SOURCE = ("MfE 2024 New Zealand climate projections (CMIP6 downscaled with "
          "CCAM, multi-model mean), (c) Ministry for the Environment, "
          "licensed CC BY 4.0; composed onto Auxein tps-2.0.0-ridge "
          "1986-2005 normals")


def load(root: Path) -> list[dict]:
    rows = []
    for name in MANIFESTS:
        path = root / name
        if not path.exists():
            logger.warning("missing manifest %s", path)
            continue
        man = json.loads(path.read_text())
        model_version = man["model_version"]
        baseline = man["baseline"]
        for s in man["surfaces"]:
            rows.append({
                "variable": s["variable"], "statistic": s["statistic"],
                "scenario": s["scenario"], "period": s["period"],
                "season": s["season"], "baseline": baseline,
                "resolution_m": 500, "model_version": model_version,
                "rule": s["rule"], "unit": s["unit"],
                "s3_key": s["key"], "source": SOURCE,
                "baseline_median": s.get("baseline_median"),
                "projected_median": s.get("projected_median"),
                "delta_median": s.get("delta_median"),
                "delta_p5": s.get("delta_p5"),
                "delta_p95": s.get("delta_p95"),
                "status": "ok",
            })
        logger.info("%s: %d surfaces", name, len(man["surfaces"]))
    return rows


def connect():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from db.session import SessionLocal
    return SessionLocal()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--expect", type=int, default=None,
                    help="fail unless exactly this many rows are present after")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    rows = load(args.root)
    if not rows:
        logger.error("no surfaces found under %s", args.root)
        return 1
    logger.info("%d rows to index", len(rows))

    if args.dry_run:
        for r in rows[:3]:
            logger.info("  sample: %s", r["s3_key"])
        logger.info("dry run, nothing written")
        return 0

    from sqlalchemy import text
    from psycopg2.extras import execute_values

    db = connect()
    try:
        raw = db.connection().connection
        assignments = ", ".join(f"{c} = EXCLUDED.{c}"
                                for c in COLUMNS if c not in set(KEYS))
        sql = (f"INSERT INTO surface_projection_run ({', '.join(COLUMNS)}) "
               f"VALUES %s ON CONFLICT ({', '.join(KEYS)}) "
               f"DO UPDATE SET {assignments}")
        values = [tuple(r.get(c) for c in COLUMNS) for r in rows]
        with raw.cursor() as cur:
            execute_values(cur, sql, values, page_size=500)
        db.commit()

        n = db.execute(text("SELECT count(*) FROM surface_projection_run")
                       ).scalar()
        logger.info("surface_projection_run now holds %d rows", n)
        for r in db.execute(text(
                "SELECT variable, statistic, count(*) "
                "FROM surface_projection_run GROUP BY 1,2 ORDER BY 1,2")):
            logger.info("  %-10s %-13s %d", r[0], r[1], r[2])

        if args.expect is not None and n != args.expect:
            logger.error("expected %d rows, found %d", args.expect, n)
            return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
