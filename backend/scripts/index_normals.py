#!/usr/bin/env python3
"""Index the published 1986-2005 BASELINE surfaces into `surface_projection_run`.

The sibling of `index_projections.py`, reading the manifests `normals.py` and
`gdd_normal.py` write and upserting one row per COG with `kind='baseline'`.

## Why these rows live in the projection table

A normal is keyed by (variable, statistic, season, baseline window) — the
projection key minus (scenario, period) — and decidedly not by anything
`surface_run` understands, which requires a `valid_at` and whose `season` column
holds a vintage YEAR rather than a season code. See the
`projection_baseline_kind` migration for the full argument and for why
`scenario`/`period` take the literal 'baseline' instead of becoming nullable.

## Two things a baseline row must NOT inherit from a projection

**The attribution.** Every projection row carries MfE's CC BY 4.0 string because
MfE produced the change field. A baseline is OUR surface, reduced from our own
published monthly archive, and crediting MfE for it would be wrong in the single
direction a licence notice must never be wrong.

**The model version.** `tps-2.0.0-ridge`, not `mfe2024-ccam-mmm-v1`. It is also
what makes the two sets distinguishable in a query that forgets to filter
`kind`.

`baseline_median` carries the value — that is what a baseline IS — while
`projected_median` and the three delta columns stay NULL. A baseline is not a
change from anything, and a NULL there is the honest answer rather than a zero
that would average into something.

**Asserts on a row count, not an exit code**, for the reason `index_projections`
gives: a silent no-op reporting success is this platform's failure mode #1.

Usage:
    python scripts/index_normals.py --dry-run
    python scripts/index_normals.py --expect 31
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger(__name__)

DEFAULT_ROOT = Path("scratchpad/projections/normals")

# Where the objects live in the bucket. Mirrors the local layout exactly, and
# nests beside `monthly/`, `season/`, `records/`, `daily/` and `projection/`
# under the same variable — so a normal is discoverable by anyone already
# browsing that variable's prefix.
KEY_PREFIX = "surfaces/v2"

# Withheld from the READ path, not from the index — the rows and the objects
# both stay so the layer can be re-served the day the frost engine is fixed.
# `projection_store.WITHHELD` is the single place that decides what is served;
# indexing a row here does not publish it.
WITHHELD_NOTE = ("temp_min/frost_days is indexed but not served — see "
                 "services/projection_store.WITHHELD")

COLUMNS = ("kind", "variable", "statistic", "scenario", "period", "season",
           "baseline", "resolution_m", "model_version", "rule", "unit",
           "s3_key", "source", "baseline_median", "status")

# `country_id` leads the unique index and is NOT in COLUMNS — Postgres resolves
# ON CONFLICT by matching the inference clause against an index, so it must be
# named here while the column itself comes from the table's New Zealand server
# default. Same shape as `index_projections.KEYS`.
KEYS = ("country_id", "variable", "statistic", "scenario", "period", "season",
        "resolution_m", "model_version")

SOURCE = ("Auxein 1986-2005 climatological normal, reduced from the Auxein "
          "tps-2.0.0-ridge 500 m interpolated archive")

# The unit each band is measured in. Read from the layer rather than guessed
# from the name: `days_over_25` is a COUNT and `mean` on the same variable is a
# temperature, and a manifest carries neither.
UNITS = {
    ("temp_mean", "mean"): "C",
    ("temp_min", "mean"): "C",
    ("temp_max", "mean"): "C",
    ("rainfall", "sum"): "mm",
    ("temp_min", "frost_days"): "days",
    ("temp_max", "days_over_25"): "days",
    ("temp_max", "days_over_30"): "days",
    ("gdd10", "cumulative"): "GDD",
}


def load(root: Path) -> list[dict]:
    rows: list[dict] = []
    manifests = sorted(root.glob("*/normal/*/manifest_*.json"))
    if not manifests:
        logger.error("no manifests under %s", root)
        return rows

    for path in manifests:
        man = json.loads(path.read_text())
        variable = man["variable"]
        statistic = man["statistic"]
        baseline = man["baseline"]
        unit = UNITS.get((variable, statistic))
        if unit is None:
            # Refuse rather than invent. A wrong unit is invisible on a map and
            # wrong in every readout that quotes it.
            logger.error("no unit declared for %s/%s — skipping",
                         variable, statistic)
            continue

        for entry in man["periods"]:
            season = entry["period"]
            name = Path(entry["path"]).name
            rows.append({
                "kind": "baseline",
                "variable": variable,
                "statistic": statistic,
                # The sentinels. CHECK-enforced to agree with `kind`.
                "scenario": "baseline",
                "period": "baseline",
                "season": season,
                "baseline": baseline,
                "resolution_m": man.get("resolution_m") or 500,
                "model_version": man["model_version"],
                # A surface that was not composed has no composition rule.
                "rule": "none",
                "unit": unit,
                "s3_key": (f"{KEY_PREFIX}/{variable}/normal/{baseline}/{name}"),
                "source": SOURCE,
                # THE VALUE. Not a delta — the other four summary columns stay
                # NULL because a baseline is not a change from anything.
                "baseline_median": entry.get("median"),
                "status": "ok",
            })
        logger.info("%-10s %-13s %d period(s)",
                    variable, statistic, len(man["periods"]))
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
                    help="fail unless exactly this many BASELINE rows are "
                         "present afterwards")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    rows = load(args.root)
    if not rows:
        logger.error("no normals found under %s", args.root)
        return 1
    logger.info("%d baseline rows to index", len(rows))
    logger.info("%s", WITHHELD_NOTE)

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
            execute_values(cur, sql, values, page_size=200)
        db.commit()

        n = db.execute(text("SELECT count(*) FROM surface_projection_run "
                            "WHERE kind = 'baseline'")).scalar()
        total = db.execute(text("SELECT count(*) FROM surface_projection_run")
                           ).scalar()
        logger.info("surface_projection_run holds %d baseline rows "
                    "of %d total", n, total)
        for r in db.execute(text(
                "SELECT variable, statistic, count(*) "
                "FROM surface_projection_run WHERE kind = 'baseline' "
                "GROUP BY 1,2 ORDER BY 1,2")):
            logger.info("  %-10s %-13s %d", r[0], r[1], r[2])

        if args.expect is not None and n != args.expect:
            logger.error("expected %d baseline rows, found %d", args.expect, n)
            return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
