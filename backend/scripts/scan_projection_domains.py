#!/usr/bin/env python3
"""Measure display domains for the published projection surfaces.

Same job, and the same reasoning, as `scan_rainfall_domain.py`: a map's colour
scale is a property of the LAYER, not of the tile in view, and it has to be
measured rather than guessed. This script produces the numbers that go into
`services/projection_store.PROJECTION_DOMAINS`.

## Why the observational domains do not simply transfer

`surface_store.DOMAINS` is measured against the MONTHLY archive. Three of the
projection layers are not monthly:

    temp_mean/temp_min/temp_max  mean   a seasonal or annual MEAN sits in the
                                        same range as a monthly mean, so the
                                        transfer is exact -- and using the same
                                        scale is what makes a projected map
                                        directly comparable with a measured one
    rainfall                     sum    a DJF total is three months and an ANN
                                        total is twelve. The monthly ceiling of
                                        1228 mm would saturate most of the
                                        West Coast on an annual map
    days_over_25 / days_over_30  count  the monthly ceilings are 22 and 12 days.
                                        An annual count of hot days passes both
    frost_days                   count  same problem, and see the note in
                                        projection_store about why it is not
                                        served at all

So this measures every (variable, statistic, season) group and prints the two
that transfer alongside the ones that do not, which is the only way to know the
transfer claim is true rather than merely plausible.

## What it reads, and why not all 576

The ceiling has to cover every scenario and period, and every one of these
fields is monotone in warming except rainfall. Scanning the coldest and the
hottest corners of the matrix brackets the rest:

    floor   ssp126 / fp2021-2040
    ceiling ssp370 / fp2080-2099, ssp370 / wl3

Rainfall is not monotone, so it gets the full scenario set at the far period.
Rasters are read DECIMATED through the COG's overviews -- a display ceiling does
not need every one of 7.6 M cells, and a full-resolution scan of 576 objects
would pull about 1.7 GB from S3 to move a number by a tenth of a millimetre.

Usage:
    python scripts/scan_projection_domains.py
    python scripts/scan_projection_domains.py --decimate 8 --only rainfall
"""
from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger(__name__)

# The corners of the (scenario, period) matrix that bracket everything else.
# Rainfall adds the other two scenarios because a multiplicative change is not
# monotone in warming -- a drier ssp370 can sit below a wetter ssp245.
CORNERS = [("ssp126", "fp2021-2040"),
           ("ssp370", "fp2080-2099"),
           ("ssp370", "wl3")]
RAINFALL_EXTRA = [("ssp245", "fp2080-2099"), ("ssp126", "fp2080-2099")]

# Percentiles that matter. p99.9 is the ceiling rule the rainfall domains were
# set by; p0.1 is only interesting for temperature, where the floor is real.
PCTS = (0.1, 1.0, 50.0, 90.0, 99.0, 99.9)


def _pct_key(p: float) -> str:
    """`p99.9` and `p50`, not `p99.9` and `p50.0` -- the labels are read by eye."""
    return "p" + (f"{p:g}")


def scan(decimate: int, only: str | None) -> dict:
    import rasterio
    from services import surface_store as store

    import os

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    import psycopg2
    import psycopg2.extras

    # Raw psycopg2 rather than `db.session.SessionLocal`, and the RDS_* parts
    # rather than a DATABASE_URL. This script has to run from the ROOT venv,
    # which is the only one carrying rasterio, and that venv has no boto3 --
    # importing the app's session module pulls in `core.config`, which does.
    # GDAL reaches S3 through /vsis3 without boto3 anyway. Same connect() shape
    # as fetch_nz_coastline.py, for the same reason.
    # See project_fastgrid_basis: two venvs, neither complete.
    host = os.getenv("RDS_ENDPOINT")
    if not host:
        raise SystemExit("RDS_ENDPOINT is not set; is .env present at the repo root?")
    conn = psycopg2.connect(
        host=host, port=os.getenv("RDS_PORT", "5432"),
        user=os.environ["RDS_USER"], password=os.environ["RDS_PASSWORD"],
        dbname=os.environ["RDS_DATABASE"], connect_timeout=20)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT variable, statistic, scenario, period, season, unit, s3_key
                FROM surface_projection_run
                WHERE status = 'ok'
                ORDER BY variable, statistic, season, scenario, period
            """)
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        logger.error("no rows in surface_projection_run -- nothing to scan")
        return {}

    wanted = []
    for r in rows:
        if only and r["variable"] != only:
            continue
        corners = CORNERS + (RAINFALL_EXTRA if r["variable"] == "rainfall" else [])
        if (r["scenario"], r["period"]) in corners:
            wanted.append(dict(r))

    logger.info("scanning %d of %d objects at 1/%d resolution",
                len(wanted), len(rows), decimate)

    # Values are pooled per GROUP, not per object: the domain is one scale for
    # the whole layer, so the percentile has to be taken over every scenario and
    # period that shares it.
    pooled: dict[tuple, list[np.ndarray]] = defaultdict(list)

    with store.gdal_env():
        for i, r in enumerate(wanted, 1):
            key = (r["variable"], r["statistic"], r["season"])
            try:
                with rasterio.open(store.object_url(r["s3_key"])) as ds:
                    out_h = max(1, ds.height // decimate)
                    out_w = max(1, ds.width // decimate)
                    # `masked=True` so nodata never enters the percentile. A
                    # -9999 fill counted as data drags every floor to nonsense.
                    band = ds.read(1, out_shape=(out_h, out_w), masked=True)
            except Exception as exc:                                # noqa: BLE001
                logger.warning("  [%d/%d] UNREADABLE %s: %s",
                               i, len(wanted), r["s3_key"], exc)
                continue
            values = np.ma.compressed(band).astype(np.float32)
            values = values[np.isfinite(values)]
            if values.size:
                pooled[key].append(values)
            logger.info("  [%d/%d] %s/%s %s %s %s  n=%d",
                        i, len(wanted), r["variable"], r["statistic"],
                        r["season"], r["scenario"], r["period"], values.size)

    out = {}
    for key, chunks in sorted(pooled.items()):
        values = np.concatenate(chunks)
        stats = {_pct_key(p): float(np.percentile(values, p)) for p in PCTS}
        stats["min"] = float(values.min())
        stats["max"] = float(values.max())
        stats["n"] = int(values.size)
        out[key] = stats
    return out


def report(measured: dict) -> None:
    from services import surface_store as store

    logger.info("\n%-12s %-12s %-7s %9s %9s %9s %9s %9s",
                "variable", "statistic", "season", "p0.1", "p50", "p99", "p99.9", "max")
    logger.info("-" * 88)
    for (variable, statistic, season), s in measured.items():
        logger.info("%-12s %-12s %-7s %9.2f %9.2f %9.2f %9.2f %9.2f",
                    variable, statistic, season,
                    s["p0.1"], s["p50"], s["p99"], s["p99.9"], s["max"])

    logger.info("\n== against the observational domain ==")
    logger.info("A layer whose measured p99.9 sits inside the monthly domain "
                "transfers; one that does not needs its own entry.\n")
    logger.info("%-12s %-12s %-7s %18s %10s   %s",
                "variable", "statistic", "season", "monthly domain", "p99.9", "verdict")
    logger.info("-" * 88)
    for (variable, statistic, season), s in measured.items():
        lo, hi, ramp = store.domain_for(variable, statistic)
        transfers = s["p99.9"] <= hi and s["p0.1"] >= lo
        logger.info("%-12s %-12s %-7s %8.1f..%-8.1f %10.2f   %s",
                    variable, statistic, season, lo, hi, s["p99.9"],
                    "transfers" if transfers else "NEEDS ITS OWN")

    logger.info("\n== paste into projection_store.PROJECTION_DOMAINS ==")
    logger.info("# Measured by scripts/scan_projection_domains.py; see that "
                "script for which\n# corners of the scenario/period matrix were "
                "pooled to get these.")
    for (variable, statistic, season), s in measured.items():
        lo, hi, ramp = store.domain_for(variable, statistic)
        if s["p99.9"] <= hi and s["p0.1"] >= lo:
            continue
        # Ceiling CLEARS p99.9 and rounds up to something whose quarter ticks
        # are whole numbers, exactly as the rainfall domains were set.
        ceiling = _round_up_to_quarters(s["p99.9"])
        floor = 0.0 if s["p0.1"] >= 0 else float(int(s["p0.1"]) - 1)
        logger.info('    ("%s", "%s", "%s"): (%.1f, %.1f, "%s"),',
                    variable, statistic, season, floor, ceiling, ramp)


def _round_up_to_quarters(value: float) -> float:
    """Smallest value >= `value` that divides into four whole ticks."""
    if value <= 0:
        return 1.0
    import math
    step = 4 * (10 ** max(0, int(math.log10(value)) - 1))
    return float(math.ceil(value / step) * step)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--decimate", type=int, default=4,
                    help="read 1/N of each raster's resolution (default 4)")
    ap.add_argument("--only", help="restrict to one variable")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    measured = scan(args.decimate, args.only)
    if not measured:
        return 1
    report(measured)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
