"""Reduce a month of PUBLISHED daily surfaces into the monthly statistics.

    python backend/scripts/reduce_monthly.py --month 2026-08
    python backend/scripts/reduce_monthly.py --month 2026-08 --variable rainfall
    python backend/scripts/reduce_monthly.py --month 2026-08 --dry-run

Writes a local publish tree under `--out` plus a `month.json` describing what it
produced. It publishes NOTHING. `publish_monthly.py` takes that tree, uploads
it, merges the manifest on S3 and reindexes — one irreversible step, separated
so it can be inspected before it runs.

## Why this reduces the dailies instead of re-fitting the month

`run_history.py` built the 1986-2026-07 archive by fitting every day in memory
and reducing the block without ever publishing a daily surface. That was the
only option at the time. Since 2026-07-01 the daily engine publishes every day,
and the daily record is now the better input for three reasons:

* **Self-consistency.** A re-fit is a SECOND fit, and its monthly mean need not
  equal the mean of the daily surfaces we serve for the same days. Reducing what
  is published makes "the monthly product is the reduction of the daily one" a
  property rather than a hope. That matters most where the two are read
  together, which is exactly what the Pro season pages do.
* **It inherits the daily engine's corrections for free.** Station 1019's
  exclusion, station 872's quarantine, the two-pass WRC re-fit and the era
  offset are all already baked into the published rasters. A parallel re-fit
  path would have to reproduce every one of them and would drift the first time
  one changed on only one side.
* **No grid CSV, no station staging, no fit.** Read, stack, reduce. The whole
  class of "the monthly job and the daily job disagreed about the grid" cannot
  arise, because the geometry comes from the rasters themselves.

Verified before this was written: a published daily COG and a published monthly
COG have identical shape (2856 x 2667), transform, nodata and land-cell count
(1,429,944). The round trip through `flat_index` is therefore exact.

## THE DRY-SPELL CARRY IS THE ONE THING THAT CANNOT BE DONE MONTH-AT-A-TIME

`max_dry_spell` counts consecutive dry days, and a spell does not stop at a
month boundary. `monthly_stats` takes `dry_run_carry_in` — an (n_cells,) array,
PER CELL, and the reason it is per-cell is a bug that reached publication: a
national scalar carry once collapsed every cell's spell into one number and
broadcast it back, corrupting every published `max_dry_spell` from 1986-02.

Nothing stores the carry, so this recomputes it by reading a LEAD-IN window of
daily rainfall before the target month and running the reducer over it purely
for its `dry_run_carry_out`. The lead-in is reported in `month.json`, and if the
carry equals the whole lead-in the spell was truncated by the start of the
daily record and the script says so loudly rather than publishing a floor as a
fact.

## What this deliberately does NOT produce

**No records layer.** The live era's all-time keys are byte-identical to the
archive's and `store.resolve` orders `model_version DESC`, so a three-month
record would win a lookup for "all time". The archive owns records; this never
writes them. Same rule `stage_publish.py` applies.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402
from scripts.interpolation import monthly as M                      # noqa: E402
from scripts.interpolation.raster import (DEFAULT_MAX_Z_ERROR,      # noqa: E402
                                          RasterTemplate, write_cog)
from scripts.interpolation.run_history import (CONTRACT_VERSION,    # noqa: E402
                                               INTEGER_BANDS, LAPSE, UNITS)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("reduce-monthly")

BUCKET = os.environ.get("SURFACE_BUCKET", "auxein-climate-surfaces")

# The era each variable is served under. These MUST match what the daily engine
# writes, because the whole point is that the monthly value is the reduction of
# the daily ones — reducing a set of dailies and stamping them with a different
# model_version would publish a month nothing else in the archive agrees with.
#
# Rainfall is uncorrected and temperature is `-adj`, and that asymmetry is
# deliberate: the DB has 838 gauges against CLIFLO's ~343, so correcting
# rainfall toward CLIFLO would be correcting toward the worse network.
LIVE_MODEL = {"temp_mean": "tps-2.0.0-ridge-db-adj",
              "temp_min": "tps-2.0.0-ridge-db-adj",
              "temp_max": "tps-2.0.0-ridge-db-adj",
              "rainfall": "tps-2.0.0-ridge-db"}
VARIABLES = tuple(LIVE_MODEL)

# Days of daily rainfall read BEFORE the target month, purely to establish the
# dry-spell carry. 60 covers any credible New Zealand dry spell; the script
# reports what it actually got and warns when the record could not supply it.
DEFAULT_LEAD_IN_DAYS = 60


def month_bounds(ym: str) -> tuple[date, date]:
    year, month = (int(x) for x in ym.split("-"))
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def daily_rows(db, variable: str, lo: date, hi: date) -> list[dict]:
    """Published daily surfaces for one variable, era-pinned, oldest first.

    `statistic IS NULL` is what makes a row a daily surface rather than one of a
    month's bands, and `uq_surface_run_timestep` is unique on exactly that — so
    the afternoon re-fit REPLACES the morning row rather than adding a second,
    and there is no newest-wins to do here.
    """
    return [dict(r) for r in db.execute(text("""
        SELECT valid_at::date AS d, s3_key, model_version, cv_rmse,
               n_stations_fit, n_stations_test, edf, edf_frac, smoothing,
               cv_units, resolution_m
          FROM surface_run
         WHERE granularity = 'daily' AND statistic IS NULL
           AND variable = :v AND model_version = :mv
           AND valid_at >= :lo AND valid_at <= :hi
           AND status <> 'failed'
         ORDER BY valid_at
    """), {"v": variable, "mv": LIVE_MODEL[variable],
           "lo": lo, "hi": hi}).mappings().all()]


def fetch(keys: list[str], into: Path) -> dict[str, Path]:
    """Pull the rasters down once, concurrently. ~3 MB each."""
    from concurrent.futures import ThreadPoolExecutor

    import boto3

    into.mkdir(parents=True, exist_ok=True)
    s3 = boto3.client("s3")

    def one(key):
        dst = into / key.replace("/", "_")
        if not dst.exists():
            s3.download_file(BUCKET, key, str(dst))
        return key, dst

    with ThreadPoolExecutor(max_workers=8) as ex:
        return dict(ex.map(one, keys))


def read_block(paths: list[Path]) -> tuple[np.ndarray, RasterTemplate]:
    """Stack the land cells of several identically-gridded rasters.

    Returns `(n_cells, n_days)` float32 and the template to write back through.

    THE MASK IS TAKEN FROM THE FIRST RASTER AND THEN ASSERTED ON EVERY OTHER.
    Two days with different land masks would silently misalign the block — cell
    i would be a different place on different days — and the resulting mean
    would be a smooth, plausible, wrong surface. There is no cheap way to notice
    that downstream, so it is checked here.
    """
    import rasterio

    block, template, mask = None, None, None
    for j, p in enumerate(paths):
        with rasterio.open(p) as src:
            arr = src.read(1)
            valid = arr != src.nodata
            if template is None:
                mask = valid
                idx = np.flatnonzero(mask.ravel())
                t = src.transform
                template = RasterTemplate(
                    height=src.height, width=src.width,
                    # `from_origin` puts the outer edge in c/f, which is exactly
                    # what RasterTemplate calls west/north — so this round-trips
                    # without re-deriving anything from a grid file.
                    west=t.c, north=t.f, xres=t.a, yres=-t.e,
                    flat_index=idx)
                block = np.empty((len(idx), len(paths)), dtype=np.float32)
            elif not np.array_equal(valid, mask):
                raise SystemExit(
                    f"{p.name}: land mask differs from the first raster "
                    f"({int(valid.sum()):,} cells vs {int(mask.sum()):,}). "
                    "The block cannot be stacked; these are different grids.")
            block[:, j] = arr.ravel()[template.flat_index]
    return block, template


def dry_carry(db, lo: date, hi: date, workdir: Path) -> tuple[Optional[np.ndarray], dict]:
    """The per-cell dry spell running at `hi`, from the daily rainfall record."""
    rows = daily_rows(db, "rainfall", lo, hi)
    meta = {"lead_in_days": len(rows),
            "lead_in_from": rows[0]["d"].isoformat() if rows else None,
            "lead_in_to": rows[-1]["d"].isoformat() if rows else None}
    if not rows:
        log.warning("no daily rainfall before the target month: max_dry_spell "
                    "starts from zero and is a FLOOR, not a measurement")
        return None, {**meta, "truncated": True}

    files = fetch([r["s3_key"] for r in rows], workdir / "leadin")
    block, _ = read_block([files[r["s3_key"]] for r in rows])
    result = M.monthly_stats(block, "rainfall",
                             [r["d"].day for r in rows], dry_run_carry_in=0)
    carry = result.dry_run_carry_out
    del block

    # A carry equal to the whole window means the spell was cut off by the start
    # of the daily record rather than by rain, so the number that leaves here is
    # a lower bound. Say so; do not publish a floor as a measurement in silence.
    truncated = bool(carry is not None and np.any(carry >= len(rows)))
    if truncated:
        n = int(np.sum(carry >= len(rows)))
        log.warning("dry-spell carry is truncated in %d cell(s): the spell "
                    "reaches the start of the daily record (%s). max_dry_spell "
                    "for those cells is a FLOOR.", n, meta["lead_in_from"])
    log.info("dry-spell carry over %d lead-in day(s): median %.0f, max %.0f",
             len(rows), float(np.median(carry)), float(carry.max()))
    return carry, {**meta, "truncated": truncated}


def reduce_variable(db, variable: str, lo: date, hi: date, out: Path,
                    workdir: Path, lead_in: int, allow_partial: bool,
                    dry_run: bool) -> dict:
    rows = daily_rows(db, variable, lo, hi)
    expected = (hi - lo).days + 1
    if not rows:
        raise SystemExit(f"{variable}: no published daily surfaces in "
                         f"{lo}..{hi} under {LIVE_MODEL[variable]}")
    if len(rows) != expected and not allow_partial:
        have = {r["d"] for r in rows}
        missing = [(lo + timedelta(days=i)).isoformat()
                   for i in range(expected) if lo + timedelta(days=i) not in have]
        raise SystemExit(
            f"{variable}: {len(rows)}/{expected} days published. Missing "
            f"{missing[:8]}{'...' if len(missing) > 8 else ''}. A month reduced "
            "from a partial record understates its sum and its counts; re-run "
            "the daily fit for those days, or pass --allow-partial knowing "
            "that.")

    res = int(rows[0]["resolution_m"])
    log.info("[%s] %d/%d days, %s, %d m", variable, len(rows), expected,
             LIVE_MODEL[variable], res)

    carry, carry_meta = (0, {})
    if variable == "rainfall":
        carry, carry_meta = dry_carry(db, lo - timedelta(days=lead_in),
                                      lo - timedelta(days=1), workdir)
        carry = 0 if carry is None else carry

    files = fetch([r["s3_key"] for r in rows], workdir / variable)
    block, template = read_block([files[r["s3_key"]] for r in rows])
    log.info("[%s] block %s (%.0f MB)", variable, block.shape,
             block.nbytes / 1e6)

    result = M.monthly_stats(block, variable, [r["d"].day for r in rows],
                             dry_run_carry_in=carry)
    del block

    cvs = [float(r["cv_rmse"]) for r in rows if r["cv_rmse"] is not None]
    month_cv = round(float(np.mean(cvs)), 4) if cvs else None
    unit = UNITS[variable]

    entry = {
        "valid_at": f"{lo.year}-{lo.month:02d}",
        "n_days": result.n_days,
        "days_in_month": expected,
        "mean_cv_rmse": month_cv,
        "statistics": list(result.bands),
        "resolution_m": res,
        # NOT in the archive's month entries, and it is the whole point of this
        # engine: this month is a reduction of published daily surfaces, and it
        # names them so the claim is checkable rather than asserted.
        "source": "published-daily",
        "source_keys": [r["s3_key"] for r in rows],
        **({"dry_spell_carry": carry_meta} if carry_meta else {}),
    }

    stats = [{"valid_at": r["d"].isoformat(), "variable": variable,
              "n_fit": r["n_stations_fit"], "n_test": r["n_stations_test"],
              "cv_rmse": r["cv_rmse"], "rmse": None, "t_rmse": None,
              "edf": r["edf"], "edf_fraction": r["edf_frac"],
              "lambda": r["smoothing"], "cv_units": r["cv_units"]}
             for r in rows]

    if dry_run:
        log.info("[%s] DRY RUN: %d band(s) %s", variable,
                 len(result.bands), list(result.bands))
        return {"manifest": entry, "stats": stats, "bytes": 0, "written": []}

    written, total = [], 0
    tags = {"variable": variable, "granularity": "monthly",
            "valid_at": entry["valid_at"], "resolution_m": res,
            "model_version": LIVE_MODEL[variable], "engine": "ridge",
            "contract_version": CONTRACT_VERSION,
            "lapse_rate_c_per_100m": LAPSE.get(variable),
            "n_days": result.n_days, "days_in_month": expected,
            "mean_cv_rmse": month_cv,
            "cv_units": rows[0]["cv_units"],
            "reduced_from": "published daily surfaces"}
    for name, values in result.bands.items():
        path = (out / "surfaces" / CONTRACT_VERSION / variable / "monthly"
                / f"{lo.year}"
                / f"{variable}_monthly_{lo.year}{lo.month:02d}_{res}m_{name}.tif")
        path.parent.mkdir(parents=True, exist_ok=True)
        # The archive's own tolerances, not this file's opinion. A band written
        # at 0.01 mm where every other month is 0.05 is a quiet change to the
        # published product's precision.
        tol = (0.5 if name in INTEGER_BANDS
               else DEFAULT_MAX_Z_ERROR.get(variable, 0.01))
        p = write_cog(path, template.to_raster(values), template,
                      max_z_error=tol,
                      tags={**{k: v for k, v in tags.items() if v is not None},
                            "statistic": name,
                            "unit": "day" if name.endswith("_day")
                            else ("days" if name in INTEGER_BANDS else unit)})
        total += p.stat().st_size
        written.append(str(p.relative_to(out)).replace("\\", "/"))

    log.info("[%s] wrote %d band(s), %.1f MB, cv_rmse %s", variable,
             len(written), total / 1e6, month_cv)
    return {"manifest": entry, "stats": stats, "bytes": total,
            "written": written}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--month", required=True, help="YYYY-MM")
    ap.add_argument("--variable", action="append", choices=VARIABLES,
                    help="repeatable; default all four")
    ap.add_argument("--out", type=Path,
                    default=Path("scratchpad/live_surfaces/monthly_reduce"))
    ap.add_argument("--work", type=Path, default=None,
                    help="where the daily rasters are cached (default: a temp "
                         "dir, removed on exit)")
    ap.add_argument("--lead-in-days", type=int, default=DEFAULT_LEAD_IN_DAYS)
    ap.add_argument("--allow-partial", action="store_true",
                    help="reduce a month with missing days. It understates the "
                         "sum and every count; only for a deliberate backfill.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    lo, hi = month_bounds(args.month)
    variables = args.variable or list(VARIABLES)
    out = args.out / args.month
    db = SessionLocal()

    tmp = None
    if args.work is None:
        tmp = tempfile.TemporaryDirectory(prefix="auxein-monthly-")
        work = Path(tmp.name)
    else:
        work = args.work

    try:
        results = {v: reduce_variable(db, v, lo, hi, out, work,
                                      args.lead_in_days, args.allow_partial,
                                      args.dry_run)
                   for v in variables}
    finally:
        db.close()
        if tmp is not None:
            tmp.cleanup()

    summary = {
        "month": args.month,
        "engine": "reduce-published-daily",
        "contract_version": CONTRACT_VERSION,
        "variables": {v: {"model_version": LIVE_MODEL[v],
                          "manifest": r["manifest"],
                          "stats": r["stats"],
                          "files": r["written"]}
                      for v, r in results.items()},
        "total_bytes": sum(r["bytes"] for r in results.values()),
    }
    if not args.dry_run:
        out.mkdir(parents=True, exist_ok=True)
        (out / "month.json").write_text(json.dumps(summary, indent=2, default=str))
        log.info("wrote %s", out / "month.json")

    log.info("%s: %d variable(s), %.1f MB. NOTHING PUBLISHED — run "
             "publish_monthly.py to upload, merge and index.",
             args.month, len(results), summary["total_bytes"] / 1e6)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
