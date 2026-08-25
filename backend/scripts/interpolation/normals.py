#!/usr/bin/env python3
"""Per-cell climatological normals from the published monthly archive.

The projection overlay is a delta method:

    projected = our own 1986-2005 normal  +  MfE change field

and until now the left-hand side did not exist. `surface_run` carries
`monthly`, `season` and `records`; there is no climatology granularity, so this
script builds one by reducing the published monthly surfaces over a fixed
window.

## Why 1986-2005 needs no era handling

The window sits entirely inside the CLIFLO archive era, so every input is
`tps-2.0.0-ridge` and the era-offset field
([[project_era_offset_field]]) is irrelevant here. A normal that crossed
2024-10 would have to be built from the corrected `-db-adj` surfaces instead,
and mixing the two would put a provenance step of -0.27 degC (tmean) inside a
single climatology. `--start`/`--end` are therefore validated against the
archive era rather than left free.

## COMPLETE SEASONS ONLY

`frost_days` was understated in all 23 zones once already, because a Sep-Apr
season labelled by its END year makes the first vintage a half year and
`sum / count(distinct year)` divides a partial total by a whole count. The same
trap is live here in two places:

  * **DJF spans the year boundary.** DJF(Y) is Dec(Y-1) + Jan(Y) + Feb(Y), so a
    1986-2005 window holds 19 complete DJF seasons, not 20 - DJF(1986) would
    need December 1985, which the archive does not have.
  * **SEPAPR(Y) is Sep(Y-1)..Apr(Y)**, likewise 19.

So a period contributes to the normal only when EVERY one of its months is
present. A year missing one month is dropped whole and counted in the manifest,
never averaged in short. `--min-years` then refuses to write a normal built on
a suspiciously thin sample.

## Intensive vs extensive

The reduction depends on what the band MEANS, and getting it wrong is silent:

  * **intensive** (`mean`, a temperature) - day-weighted mean across the
    period's months, then the plain mean across years. Day weighting matters
    because February is 10% shorter than January and an unweighted mean of
    monthly means is not the mean of the days.
  * **extensive** (`sum`, `frost_days`, `days_over_25`) - total across the
    period's months, then the plain mean across years. A count of frost nights
    adds; it does not average.

Usage:
    python normals.py --variable temp_mean --statistic mean
    python normals.py --variable temp_min  --statistic frost_days
    python normals.py --all
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.interpolation import raster as R  # noqa: E402

from scripts.interpolation.runrecord import (             # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

logger = logging.getLogger(__name__)

# The archive era. 1986-01 is the first month fitted; 2024-09 is the last month
# before the DB era takes over under a different model_version.
ARCHIVE_FIRST_YEAR = 1986
ARCHIVE_LAST_YEAR = 2023

DEFAULT_ARCHIVE = Path("scratchpad/climate_history/bucket/surfaces/v2")
DEFAULT_OUT = Path("scratchpad/projections/normals")

# Hashed into every run record. A normal is a REDUCTION of the monthly archive,
# so the estimator is the reduction rules in this module plus the raster reader.
CODE_MODULES = ("normals.py", "raster.py")
DEFAULT_BASELINE = (1986, 2005)

INTENSIVE = "intensive"
EXTENSIVE = "extensive"

# (variable, statistic) -> reduction kind. Only bands the projection overlay
# actually composes are listed; adding one means deciding its kind, which is
# the point of an explicit table rather than a heuristic on the name.
BANDS: dict[tuple[str, str], str] = {
    ("temp_mean", "mean"): INTENSIVE,
    ("temp_min", "mean"): INTENSIVE,
    ("temp_max", "mean"): INTENSIVE,
    ("rainfall", "sum"): EXTENSIVE,
    ("temp_min", "frost_days"): EXTENSIVE,
    ("temp_max", "days_over_25"): EXTENSIVE,
    ("temp_max", "days_over_30"): EXTENSIVE,
}

# Period -> the (year_offset, month) pairs that make it up. The offset is
# relative to the year the period is LABELLED by, so DJF(1987) reaches back to
# December 1986 with offset -1.
PERIODS: dict[str, tuple[tuple[int, int], ...]] = {
    "ANN": tuple((0, m) for m in range(1, 13)),
    "DJF": ((-1, 12), (0, 1), (0, 2)),
    "MAM": ((0, 3), (0, 4), (0, 5)),
    "JJA": ((0, 6), (0, 7), (0, 8)),
    "SON": ((0, 9), (0, 10), (0, 11)),
    # Our own growing season, for the GDD comparison. Labelled by its END year,
    # matching `gdd10`'s vintage convention.
    "SEPAPR": ((-1, 9), (-1, 10), (-1, 11), (-1, 12),
               (0, 1), (0, 2), (0, 3), (0, 4)),
}


@dataclass
class Reduction:
    """One period's normal plus the provenance needed to trust it."""

    period: str
    values: np.ndarray          # (height, width) float32, NODATA off-land
    years_used: list[int]
    years_dropped: dict[int, list[str]]
    n_months_expected: int


def _month_path(archive: Path, variable: str, statistic: str,
                year: int, month: int) -> Path:
    return (archive / variable / "monthly" / str(year) /
            f"{variable}_monthly_{year}{month:02d}_500m_{statistic}.tif")


def _read(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Return (values, valid_mask) for one archive COG."""
    R._configure_proj()
    import rasterio

    with rasterio.open(path) as ds:
        arr = ds.read(1)
        nodata = ds.nodata
    valid = np.isfinite(arr)
    if nodata is not None:
        # The archive writes -9999.0. Compare rather than trusting NaN: LERC
        # round-trips the sentinel exactly, so it arrives as a real value.
        valid &= arr != np.float32(nodata)
    return arr, valid


def _template_from(path: Path) -> tuple["R.RasterTemplate", np.ndarray]:
    """Rebuild the output geometry and land mask from an archive raster.

    The archive is already on the 500 m template, so the land mask is read off
    a real surface rather than re-derived from the grid CSV. That also means a
    normal cannot silently land on a different footprint from its inputs.
    """
    R._configure_proj()
    import rasterio

    with rasterio.open(path) as ds:
        arr = ds.read(1)
        nodata = ds.nodata
        t = ds.transform
        height, width = ds.height, ds.width

    valid = np.isfinite(arr)
    if nodata is not None:
        valid &= arr != np.float32(nodata)

    template = R.RasterTemplate(
        height=height, width=width,
        west=t.c, north=t.f,
        xres=abs(t.a), yres=abs(t.e),
        flat_index=np.flatnonzero(valid.ravel()),
    )
    return template, valid


def reduce_period(
    archive: Path,
    variable: str,
    statistic: str,
    period: str,
    kind: str,
    baseline: tuple[int, int],
    land: np.ndarray,
) -> Reduction:
    """Reduce one period over the baseline window.

    Years are accumulated ONLY when every month of the period is present, so a
    short year is dropped whole rather than averaged in at partial weight.
    """
    members = PERIODS[period]
    lo, hi = baseline

    total = np.zeros(land.shape, dtype=np.float64)
    n_years = 0
    used: list[int] = []
    dropped: dict[int, list[str]] = {}

    for label_year in range(lo, hi + 1):
        paths = []
        missing = []
        for offset, month in members:
            y = label_year + offset
            p = _month_path(archive, variable, statistic, y, month)
            if p.exists():
                paths.append((y, month, p))
            else:
                missing.append(f"{y}-{month:02d}")
        if missing:
            dropped[label_year] = missing
            continue

        acc = np.zeros(land.shape, dtype=np.float64)
        weight = 0.0
        for y, month, p in paths:
            arr, valid = _read(p)
            if not np.array_equal(valid, land):
                # A month whose land mask differs from the archive's would put
                # NoData inside the normal without changing its shape.
                raise ValueError(f"land mask differs from the reference in {p}")
            w = monthrange(y, month)[1] if kind == INTENSIVE else 1.0
            acc += arr.astype(np.float64) * w
            weight += w

        if kind == INTENSIVE:
            acc /= weight
        total += acc
        n_years += 1
        used.append(label_year)

    if n_years == 0:
        raise ValueError(f"no complete {period} period in {lo}-{hi}")

    normal = total / n_years
    out = np.full(land.shape, R.NODATA, dtype=np.float32)
    out[land] = normal[land].astype(np.float32)

    return Reduction(period=period, values=out, years_used=used,
                     years_dropped=dropped, n_months_expected=len(members))


def build(
    variable: str,
    statistic: str,
    *,
    archive: Path = DEFAULT_ARCHIVE,
    out_root: Path = DEFAULT_OUT,
    baseline: tuple[int, int] = DEFAULT_BASELINE,
    periods: Iterable[str] = ("ANN", "DJF", "MAM", "JJA", "SON"),
    min_years: int = 15,
    model_version: str = "tps-2.0.0-ridge",
) -> dict:
    kind = BANDS.get((variable, statistic))
    if kind is None:
        raise ValueError(
            f"no reduction kind for {variable}/{statistic}; add it to BANDS "
            "deliberately - guessing intensive vs extensive from the name is "
            "how a frost COUNT gets averaged instead of summed")

    lo, hi = baseline
    if lo < ARCHIVE_FIRST_YEAR or hi > ARCHIVE_LAST_YEAR:
        raise ValueError(
            f"baseline {lo}-{hi} leaves the archive era "
            f"{ARCHIVE_FIRST_YEAR}-{ARCHIVE_LAST_YEAR}; a normal spanning two "
            "model_versions would bake the provenance offset into itself")

    ref = _month_path(archive, variable, statistic, lo, 1)
    if not ref.exists():
        raise FileNotFoundError(f"reference month not found: {ref}")
    template, land = _template_from(ref)
    logger.info("grid %dx%d, %s land cells", template.height, template.width,
                f"{int(land.sum()):,}")

    label = f"{lo}-{hi}"
    out_dir = out_root / variable / "normal" / label
    out_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    for period in periods:
        red = reduce_period(archive, variable, statistic, period, kind,
                            baseline, land)
        if len(red.years_used) < min_years:
            raise ValueError(
                f"{variable}/{statistic} {period}: only "
                f"{len(red.years_used)} complete periods, below --min-years "
                f"{min_years}")

        name = f"{variable}_normal_{label}_{period}_500m_{statistic}.tif"
        path = out_dir / name
        vals = red.values[land]
        tags = {
            "variable": variable, "statistic": statistic,
            "granularity": "normal", "period": period,
            "baseline": label, "resolution_m": template.resolution_m,
            "model_version": model_version,
            "reduction": kind,
            "n_periods": len(red.years_used),
            "years_used": ",".join(str(y) for y in red.years_used),
            "months_per_period": red.n_months_expected,
        }
        R.write_cog(
            path, red.values, template,
            max_z_error=R.DEFAULT_MAX_Z_ERROR.get(variable, 0.01),
            tags=tags,
        )
        entries.append({
            "period": period, "path": str(path.relative_to(out_root)),
            "n_periods": len(red.years_used),
            "years_used": red.years_used,
            "years_dropped": {str(k): v for k, v in red.years_dropped.items()},
            "mean": float(np.mean(vals)),
            "p5": float(np.percentile(vals, 5)),
            "median": float(np.percentile(vals, 50)),
            "p95": float(np.percentile(vals, 95)),
            "min": float(np.min(vals)), "max": float(np.max(vals)),
        })
        logger.info("%s %s %-6s n=%2d  med %.3f  [%.3f .. %.3f]",
                    variable, statistic, period, len(red.years_used),
                    entries[-1]["median"], entries[-1]["min"],
                    entries[-1]["max"])

    manifest = {
        "variable": variable, "statistic": statistic,
        "granularity": "normal", "baseline": label,
        "reduction": kind, "model_version": model_version,
        "resolution_m": template.resolution_m,
        "land_cells": int(land.sum()),
        "archive_root": str(archive),
        "periods": entries,
    }
    man_path = out_dir / f"manifest_{statistic}.json"
    man_path.write_text(json.dumps(manifest, indent=2))
    logger.info("wrote %s", man_path)
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variable")
    ap.add_argument("--statistic")
    ap.add_argument("--all", action="store_true",
                    help="build every band in BANDS")
    ap.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--start-year", type=int, default=DEFAULT_BASELINE[0])
    ap.add_argument("--end-year", type=int, default=DEFAULT_BASELINE[1])
    ap.add_argument("--periods", default="ANN,DJF,MAM,JJA,SON",
                    help="comma-separated; SEPAPR is available for the GDD work")
    ap.add_argument("--min-years", type=int, default=15)
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    if not args.all and not (args.variable and args.statistic):
        ap.error("give --variable and --statistic, or --all")

    todo = (sorted(BANDS) if args.all
            else [(args.variable, args.statistic)])
    periods = tuple(p.strip().upper() for p in args.periods.split(",") if p.strip())
    unknown = [p for p in periods if p not in PERIODS]
    if unknown:
        ap.error(f"unknown period(s): {unknown}; known {sorted(PERIODS)}")

    record = RunRecord(args.out)
    record.open({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "engine": "normals", "argv": sys.argv,
        "parameters": {
            "out": str(args.out), "all": args.all,
            "pairs": [f"{v}/{s}" for v, s in todo],
            "baseline": [args.start_year, args.end_year],
            "periods": list(periods), "min_years": args.min_years},
        # A normal is a pure function of the archive it reduces, so naming that
        # archive is the whole provenance. `min_years` belongs beside it: it
        # decides which years were DROPPED, and a normal over 15 years is not
        # the same product as one over 20.
        "sources": {"archive": str(args.archive)},
        "code": {"digest": _code_digest(CODE_MODULES), "git": _git_revision()},
        "environment": _environment()})

    built = {}
    for variable, statistic in todo:
        man = build(variable, statistic, archive=args.archive, out_root=args.out,
                    baseline=(args.start_year, args.end_year), periods=periods,
                    min_years=args.min_years)
        built[f"{variable}/{statistic}"] = {
            "reduction": man["reduction"], "land_cells": man["land_cells"],
            "periods": [{k: p[k] for k in ("period", "median", "min", "max")
                         if k in p} | {"n_years": len(p.get("years_used", []))}
                        for p in man["periods"]]}
    # The manifests live in per-variable subdirectories, so they are summarised
    # into the record rather than copied flat into it.
    record.close(built, copy=())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
