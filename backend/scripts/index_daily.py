#!/usr/bin/env python3
"""Index daily live surfaces into `surface_run`.

Reads the manifest `interpolation/run_live.py` writes and upserts one row per
COG at `granularity='daily'`, `statistic IS NULL`.

Separate from `index_surfaces.py` because that script is built around
`run_history`'s monthly/season/records manifests and their band vocabulary,
while `run_live` already emits exactly the per-day provenance a row needs. This
is a reader for a different manifest, not a second indexing policy.

## The re-fit REPLACES, it does not accumulate

`uq_surface_run_timestep` is unique on
(country_id, variable, granularity, valid_at, resolution_m, model_version)
WHERE `statistic IS NULL`. So the weekly D-9..D-3 pass updates the existing row
in place and the object at `s3_key` is overwritten. That is the intended
behaviour — a day whose data was revised should have ONE surface, not two — but
it has a consequence worth stating: **anything that has already read a daily
value must recompute rather than accumulate.** `insights_site_daily` upserts and
recomputes totals for exactly this reason.

The only way one day legitimately carries two objects for one variable is two
model_versions, i.e. two eras, and reading whichever was written last would
report the provenance offset (tmean -0.27 degC) as weather.

## Test era vs production era

Daily publishing goes live on **2026-09-01**. Everything fitted before that date
is a TEST artefact — produced while the engine, the QC stage and the outlier
screen were still being calibrated, and re-fitted several times from data that
was itself being corrected underneath it. It must not be mistaken for the
record.

`--purge` exists for that clean cut: it removes the daily `surface_run` rows for
a window and prints the S3 keys behind them, deleting the objects only when
`--purge-objects` is passed as well. Nothing reads these yet, so the cut is
cheap now and will not be later.

Usage:
    python scripts/index_daily.py --dry-run
    python scripts/index_daily.py --expect 92
    python scripts/index_daily.py --purge 2026-08-01 2026-08-31 --purge-objects
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger(__name__)

DEFAULT_MANIFEST = Path("scratchpad/live_surfaces/daily_live/manifest.json")

COLUMNS = ("variable", "granularity", "statistic", "valid_at", "resolution_m",
           "model_version", "engine", "s3_key", "n_stations_fit",
           "n_stations_test", "cv_rmse", "cv_units", "status")

# `country_id` leads the index and is supplied by the table's New Zealand server
# default; ON CONFLICT resolves by matching an index, so it must be named in the
# inference clause even though the INSERT does not provide it.
KEYS = ("country_id", "variable", "granularity", "valid_at", "resolution_m",
        "model_version")
PREDICATE = "statistic IS NULL"


def load(manifest_path: Path) -> list[dict]:
    man = json.loads(manifest_path.read_text())
    rows = []
    for s in man["surfaces"]:
        # Contract §2: midnight UTC for a daily surface.
        valid_at = datetime.fromisoformat(s["date"]).replace(
            tzinfo=timezone.utc)
        rows.append({
            "variable": s["variable"], "granularity": "daily",
            "statistic": None, "valid_at": valid_at,
            "resolution_m": s["resolution_m"],
            "model_version": s["model_version"], "engine": "ridge",
            "s3_key": s["key"],
            "n_stations_fit": s["n_stations_fit"],
            "n_stations_test": s["n_stations_test"],
            "cv_rmse": s["cv_rmse"], "cv_units": s["cv_units"],
            "status": "ok",
        })
    return rows


def purge(start: str, end: str, drop_objects: bool) -> int:
    """Remove indexed daily surfaces for a window, and optionally their objects.

    Deliberately two steps. Dropping the index row makes a surface unreachable
    immediately, which is the part that matters; deleting the S3 object is
    irreversible and is therefore opt-in. Order matters too — rows first, so a
    failure half way through leaves objects with no index rather than index rows
    pointing at objects that are gone.
    """
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from sqlalchemy import text
    from db.session import SessionLocal

    db = SessionLocal()
    try:
        keys = [r[0] for r in db.execute(text("""
            SELECT s3_key FROM surface_run
             WHERE granularity = 'daily'
               AND valid_at >= CAST(:s AS date)
               AND valid_at <  CAST(:e AS date) + 1
             ORDER BY s3_key"""), {"s": start, "e": end})]
        if not keys:
            logger.info("nothing indexed in %s .. %s", start, end)
            return 0
        logger.info("%d daily surface(s) indexed in %s .. %s", len(keys),
                    start, end)

        n = db.execute(text("""
            DELETE FROM surface_run
             WHERE granularity = 'daily'
               AND valid_at >= CAST(:s AS date)
               AND valid_at <  CAST(:e AS date) + 1"""),
            {"s": start, "e": end}).rowcount
        db.commit()
        logger.info("deleted %d index row(s)", n)

        if not drop_objects:
            logger.info("objects LEFT IN PLACE (%d). Pass --purge-objects to "
                        "delete them; they are unreachable either way.", len(keys))
            return 0

        import boto3
        s3 = boto3.client("s3")
        bucket = "auxein-climate-surfaces"
        for i in range(0, len(keys), 1000):
            batch = [{"Key": k} for k in keys[i:i + 1000]]
            s3.delete_objects(Bucket=bucket, Delete={"Objects": batch})
        logger.info("deleted %d object(s) from s3://%s", len(keys), bucket)
    finally:
        db.close()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--expect", type=int, default=None,
                    help="fail unless this many rows were upserted")
    ap.add_argument("--purge", nargs=2, metavar=("START", "END"),
                    help="delete daily surface_run rows in [START, END] — used "
                         "for the test/production cut at 2026-09-01")
    ap.add_argument("--purge-objects", action="store_true",
                    help="also delete the S3 objects those rows point at")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    if args.purge:
        return purge(args.purge[0], args.purge[1], args.purge_objects)

    if not args.manifest.exists():
        logger.error("no manifest at %s", args.manifest)
        return 1

    rows = load(args.manifest)
    if not rows:
        logger.error("manifest lists no surfaces")
        return 1
    logger.info("%d daily surfaces to index", len(rows))

    if args.dry_run:
        for r in rows[:3]:
            logger.info("  %s %s %s -> %s", r["variable"], r["valid_at"].date(),
                        r["model_version"], r["s3_key"])
        logger.info("dry run, nothing written")
        return 0

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from sqlalchemy import text
    from db.session import SessionLocal
    from psycopg2.extras import execute_values

    db = SessionLocal()
    try:
        raw = db.connection().connection
        assignments = ", ".join(f"{c} = EXCLUDED.{c}"
                                for c in COLUMNS if c not in set(KEYS))
        sql = (f"INSERT INTO surface_run ({', '.join(COLUMNS)}) VALUES %s "
               f"ON CONFLICT ({', '.join(KEYS)}) WHERE {PREDICATE} "
               f"DO UPDATE SET {assignments}")
        values = [tuple(r.get(c) for c in COLUMNS) for r in rows]
        with raw.cursor() as cur:
            execute_values(cur, sql, values, page_size=500)
        db.commit()

        n = db.execute(text(
            "SELECT count(*) FROM surface_run WHERE granularity = 'daily'"
        )).scalar()
        logger.info("surface_run holds %d daily rows", n)
        for r in db.execute(text(
                "SELECT variable, model_version, count(*), min(valid_at)::date,"
                " max(valid_at)::date FROM surface_run "
                "WHERE granularity = 'daily' GROUP BY 1,2 ORDER BY 1")):
            logger.info("  %-10s %-26s %4d  %s .. %s", *r)

        if args.expect is not None and len(rows) != args.expect:
            logger.error("manifest had %d surfaces, expected %d",
                         len(rows), args.expect)
            return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
