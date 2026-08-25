#!/usr/bin/env python3
"""Verify the published projection surfaces end to end.

Same shape as `check_surfaces_live.py`: every assertion prints, the script
exits non-zero on any failure, and the count is reported as N/N so a partial
pass cannot read as success.

Checks the things that would actually be wrong in a way nothing else notices:
the index and the bucket agreeing, the physics having the right sign, the
matrix being complete rather than merely non-empty, and — the one that matters
most — a projection row NOT being reachable through the observational lookup.

Usage:
    python scripts/check_projections.py
    python scripts/check_projections.py --skip-s3     # index-only, no network
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger(__name__)

BUCKET = "auxein-climate-surfaces"
MODEL_VERSION = "mfe2024-ccam-mmm-v1"
EXPECTED_TOTAL = 576

# THE TABLE HOLDS TWO KINDS OF ROW since 2026-08-25: these 576 projections and
# 36 rows of our own 1986-2005 baseline, told apart by `kind`. This script
# verifies the PROJECTION publish, so every count and every enumeration below
# is scoped to projections — otherwise "576 rows" reads 612, "one
# model_version" finds two, and "16 scenario/period combos" finds 17 because
# the baseline sentinel is a seventeenth pair.
#
# The baseline has its own verification in `check_projection_serving.py`.
PROJECTION_ONLY = "kind = 'projection'"

# (variable, statistic) -> (n_seasons, expected_rows)
EXPECTED = {
    ("temp_mean", "mean"): (5, 80),
    ("temp_min", "mean"): (5, 80),
    ("temp_max", "mean"): (5, 80),
    ("rainfall", "sum"): (5, 80),
    ("temp_min", "frost_days"): (5, 80),
    ("temp_max", "days_over_25"): (5, 80),
    ("temp_max", "days_over_30"): (5, 80),
    ("gdd10", "cumulative"): (1, 16),
}

# Direction the MEDIAN must move under warming. Individual cells may disagree
# (MfE's own field has noise on near-zero summer frost); the national median
# must not.
DIRECTION = {
    ("temp_mean", "mean"): +1, ("temp_min", "mean"): +1,
    ("temp_max", "mean"): +1,
    ("temp_min", "frost_days"): -1,
    ("temp_max", "days_over_25"): +1, ("temp_max", "days_over_30"): +1,
    ("gdd10", "cumulative"): +1,
}


class Checker:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def check(self, label: str, ok: bool, detail: str = "") -> bool:
        if ok:
            self.passed += 1
            logger.info("  PASS  %s%s", label, f"  ({detail})" if detail else "")
        else:
            self.failed += 1
            logger.error("  FAIL  %s%s", label, f"  ({detail})" if detail else "")
        return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-s3", action="store_true")
    ap.add_argument("--s3-sample", type=int, default=12,
                    help="how many objects to HEAD (0 = all 576)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from sqlalchemy import text
    from db.session import SessionLocal

    c = Checker()
    db = SessionLocal()
    try:
        logger.info("\n== index ==")
        n = db.execute(text(
            f"SELECT count(*) FROM surface_projection_run "
            f"WHERE {PROJECTION_ONLY}")).scalar()
        c.check("row count", n == EXPECTED_TOTAL, f"{n} of {EXPECTED_TOTAL}")

        c.check("one model_version",
                [r[0] for r in db.execute(text(
                    f"SELECT DISTINCT model_version FROM surface_projection_run "
                    f"WHERE {PROJECTION_ONLY}"
                ))] == [MODEL_VERSION])

        c.check("one baseline, 1986-2005",
                [r[0] for r in db.execute(text(
                    f"SELECT DISTINCT baseline FROM surface_projection_run "
                    f"WHERE {PROJECTION_ONLY}"
                ))] == ["1986-2005"])

        # The baseline rows are the OTHER kind, and they must not have leaked
        # into the projection model_version. Cheap, and it is the one way the
        # sentinel scheme could go wrong silently.
        c.check("baseline rows carry our engine, not MfE's",
                db.execute(text(
                    "SELECT count(*) FROM surface_projection_run "
                    "WHERE kind = 'baseline' AND model_version = :m"),
                    {"m": MODEL_VERSION}).scalar() == 0)

        logger.info("\n== matrix completeness ==")
        for (variable, statistic), (n_seasons, want) in EXPECTED.items():
            got = db.execute(text(
                f"SELECT count(*) FROM surface_projection_run "
                f"WHERE {PROJECTION_ONLY} AND variable = :v AND statistic = :s"),
                {"v": variable, "s": statistic}).scalar()
            seasons = db.execute(text(
                f"SELECT count(DISTINCT season) FROM surface_projection_run "
                f"WHERE {PROJECTION_ONLY} AND variable = :v AND statistic = :s"),
                {"v": variable, "s": statistic}).scalar()
            c.check(f"{variable}/{statistic} rows", got == want,
                    f"{got} of {want}")
            c.check(f"{variable}/{statistic} seasons", seasons == n_seasons,
                    f"{seasons} of {n_seasons}")

        logger.info("\n== scenario/period rules ==")
        bad_wl3 = db.execute(text(
            "SELECT count(*) FROM surface_projection_run "
            "WHERE period = 'wl3' AND scenario <> 'ssp370'")).scalar()
        c.check("wl3 is ssp370 only", bad_wl3 == 0, f"{bad_wl3} violations")

        combos = db.execute(text(
            f"SELECT count(DISTINCT (scenario, period)) "
            f"FROM surface_projection_run WHERE {PROJECTION_ONLY}")).scalar()
        c.check("16 scenario/period combos", combos == 16, f"{combos}")

        logger.info("\n== physical direction (national median) ==")
        for (variable, statistic), want in DIRECTION.items():
            wrong = db.execute(text(
                "SELECT count(*) FROM surface_projection_run "
                "WHERE variable = :v AND statistic = :s "
                "AND sign(delta_median) = :bad"),
                {"v": variable, "s": statistic, "bad": -want}).scalar()
            c.check(f"{variable}/{statistic} median moves "
                    f"{'up' if want > 0 else 'down'}",
                    wrong == 0, f"{wrong} rows against")

        # Rainfall is genuinely two-signed, so it gets a range check instead of
        # a direction one: a percentage composition that had been applied as mm
        # would leave the median essentially unchanged.
        rf = db.execute(text(
            "SELECT min(delta_median), max(delta_median) "
            "FROM surface_projection_run WHERE variable = 'rainfall'")
        ).fetchone()
        c.check("rainfall delta is a real signal, not a mm no-op",
                abs(rf[0]) > 1.0 or abs(rf[1]) > 1.0,
                f"delta_median range {rf[0]:.2f} .. {rf[1]:.2f} mm")

        logger.info("\n== monotonicity with forcing ==")
        # ssp370 warms more than ssp126 at the same period, in every season.
        rows = db.execute(text(
            "SELECT a.season, a.delta_median, b.delta_median "
            "FROM surface_projection_run a JOIN surface_projection_run b "
            "  ON a.variable = b.variable AND a.statistic = b.statistic "
            " AND a.season = b.season AND a.period = b.period "
            "WHERE a.variable = 'temp_mean' AND a.scenario = 'ssp126' "
            "  AND b.scenario = 'ssp370' AND a.period = 'fp2080-2099'"
        )).fetchall()
        c.check("ssp370 warms more than ssp126 at 2080-2099",
                bool(rows) and all(b > a for _, a, b in rows),
                f"{len(rows)} seasons compared")

        logger.info("\n== no collision with the observational record ==")
        # The whole reason for a separate table. `surface_run` must not contain
        # this model_version, and nothing in the projection table may claim an
        # observational granularity.
        leaked = db.execute(text(
            "SELECT count(*) FROM surface_run WHERE model_version = :m"),
            {"m": MODEL_VERSION}).scalar()
        c.check("no projection rows in surface_run", leaked == 0,
                f"{leaked} found")

        overlap = db.execute(text(
            "SELECT count(*) FROM surface_projection_run p "
            "JOIN surface_run r ON r.s3_key = p.s3_key")).scalar()
        c.check("no shared s3_key with surface_run", overlap == 0,
                f"{overlap} shared")

        if not args.skip_s3:
            logger.info("\n== objects in the bucket ==")
            import boto3
            from botocore.exceptions import ClientError
            s3 = boto3.client("s3")

            q = (f"SELECT s3_key FROM surface_projection_run "
                 f"WHERE {PROJECTION_ONLY} ORDER BY s3_key")
            keys = [r[0] for r in db.execute(text(q))]
            if args.s3_sample:
                step = max(1, len(keys) // args.s3_sample)
                sample = keys[::step][:args.s3_sample]
            else:
                sample = keys

            missing = []
            for key in sample:
                try:
                    s3.head_object(Bucket=BUCKET, Key=key)
                except ClientError:
                    missing.append(key)
            c.check("indexed objects exist in S3", not missing,
                    f"{len(sample) - len(missing)} of {len(sample)} checked"
                    + (f", missing {missing[:2]}" if missing else ""))

            # Read one raster properly: geometry, land-cell count and the fact
            # that the sea is NoData rather than a number.
            from scripts.interpolation import raster as R
            R._configure_proj()
            import rasterio
            import numpy as np

            key = ("surfaces/v2/temp_min/projection/ssp245/fp2041-2060/"
                   "temp_min_projection_ssp245_fp2041-2060_ANN_500m_"
                   "frost_days.tif")
            with rasterio.open(f"s3://{BUCKET}/{key}") as ds:
                arr = ds.read(1)
                nodata = ds.nodata
                shape = ds.shape
            valid = arr[arr != nodata]
            c.check("raster geometry", shape == (2856, 2667), str(shape))
            c.check("land cell count", valid.size == 1_429_944,
                    f"{valid.size:,}")
            c.check("frost days are non-negative", float(valid.min()) >= 0.0,
                    f"min {valid.min():.3f}")
            c.check("frost median below the 1986-2005 normal of 40.6",
                    float(np.median(valid)) < 40.6,
                    f"median {np.median(valid):.2f}")
    finally:
        db.close()

    total = c.passed + c.failed
    logger.info("\n%d/%d checks passed", c.passed, total)
    return 1 if c.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
