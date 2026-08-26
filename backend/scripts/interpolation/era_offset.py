"""A per-cell offset field reconciling the DB era to the CLIFLO archive.

The published 1986-2023 archive is fitted from CLIFLO; everything from 2024 is
fitted from the DB. Same estimator, different observations, and the two disagree
by a measured amount. Left uncorrected the join reads as climate: a season GDD10
map for 2024 lands ~70 GDD below the same season fitted on CLIFLO, which is 8
percent, at a point in the record where a grower is looking for exactly that
kind of shift.

## Why the correction has to be a FIELD and not a number

The obvious fix -- add the network-mean provenance offset of -0.27 degC to the
DB era -- is wrong, and measurably so. Over 2023 Sep-Dec the DB minus CLIFLO
difference is **+0.42 degC at Blenheim, -0.32 at Hastings and -1.09 at
Gibbston**. The sign flips. A scalar would half-fix Central Otago while breaking
Marlborough.

## Why it has to act on the SURFACE and not on the stations

The tempting alternative is to find the bad stations and drop them. That was
tried: `station_offset_audit.py` flags five, and excluding the two in Central
Otago closes only a quarter of the error there. The decisive observation is
Alexandra -- its station reads -0.14 degC against its own co-located CLIFLO
twin, so it is not biased, yet the fitted surface above it is still 76 GDD10
low. A correct station inside the fit with a wrong surface over it means the
error lives in the interpolation, not in the observations. The DB has no
thermometer above 488 m within 150 km of there, so the smoother pulls a
continental interior toward the coastal regime, and no amount of station
hygiene changes that.

A per-cell field is the only form that can absorb an error which is a property
of network GEOMETRY -- it is large where the DB is thin and near zero where the
two networks agree.

## What makes this legitimate rather than a fudge

The difference between two surfaces for the SAME month contains no weather --
both are estimates of the same truth, so the residual is network and provenance
only. And it is stable: the network-aggregate offset moves 0.058-0.120 degC
across 2020-2023. So a mean over a multi-year training window is estimating a
real, persistent quantity.

**The assumption that can break it is stationarity of the DB network.** The
offset is a property of where the stations are, and the DB network grew from
~125 fitting stations in 2020 to ~205 by 2026. A field trained on a sparse
network and applied to a dense one over-corrects. `--validate` exists to measure
exactly that, and it is why the default training window stops before the test
year rather than using everything.

    # build from 2020-2022, then score the held-out year
    python backend/scripts/interpolation/era_offset.py build \
        --db <db-root> --archive <archive-root> --train 2020-01:2022-12
    python backend/scripts/interpolation/era_offset.py validate \
        --db <db-root> --archive <archive-root> --test 2023-01:2023-12
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation.raster import (  # noqa: E402
    DEFAULT_MAX_Z_ERROR, NODATA, _configure_proj, write_cog,
)

from scripts.interpolation.runrecord import (             # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

log = logging.getLogger("era_offset")

# Hashed into every run record. This script derives a field by DIFFERENCING
# two surfaces; there is no spline in it, so its estimator is itself plus the
# raster IO that decides how a value is read and written back.
CODE_MODULES = ("era_offset.py", "raster.py")

VARIABLE = "temp_mean"
STAT = "mean"
# Bands the correction applies to, and the ones it must NOT touch.
#
# `sd` is a DISPERSION: adding a constant to every day of a month leaves the
# within-month spread untouched, so offsetting it would invent variance that is
# not there. `argmin_day`/`argmax_day` are day-of-month indices, not degrees --
# a uniform shift cannot move WHICH day was coldest.
OFFSET_BANDS = ("mean", "median", "min", "max")
COPY_BANDS = ("sd", "argmin_day", "argmax_day")
MAX_Z_ERROR = 0.001          # degC; two orders below the ~0.3 degC signal


class SourceGeometry:
    """`write_cog` touches only width/height/transform; lift them off the source.

    Same shim as `gdd_season.SourceGeometry` and for the same reason: nothing
    here builds a grid, the values arrive already shaped as a raster, so the
    geometry must come from the file rather than from a lat/lon scatter.
    """

    def __init__(self, ds):
        self.width, self.height, self.transform = ds.width, ds.height, ds.transform


def months(span: str) -> Iterator[tuple[int, int]]:
    """`2020-01:2022-12` -> every (year, month) inclusive."""
    a, b = span.split(":")
    y0, m0 = (int(x) for x in a.split("-"))
    y1, m1 = (int(x) for x in b.split("-"))
    y, m = y0, m0
    while (y, m) <= (y1, m1):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def key(year: int, month: int, res_m: int = 500, variable: str = VARIABLE,
        stat: str = STAT) -> str:
    return (f"surfaces/v2/{variable}/monthly/{year}/"
            f"{variable}_monthly_{year}{month:02d}_{res_m}m_{stat}.tif")


def read(roots, year: int, month: int, variable: str = VARIABLE,
         stat: str = STAT):
    """First root holding this month wins.

    The overlap spans two trees on each side -- the CLIFLO archive stops at
    2023-12 and the 2024 extension is fitted separately from the per-station
    extract; the DB side is split the same way at the same date. Searching a
    list beats staging a merged tree, which would mean copying ~230 MB of
    rasters to express an ordering.
    """
    _configure_proj()
    import rasterio
    if isinstance(roots, Path):
        roots = [roots]
    for root in roots:
        p = root / key(year, month, variable=variable, stat=stat)
        if p.exists():
            break
    else:
        raise FileNotFoundError(f"{key(year, month, variable=variable, stat=stat)}"
                                " in none of " + ", ".join(str(r) for r in roots))
    with rasterio.open(p) as ds:
        arr = ds.read(1).astype(np.float64)
        nodata = ds.nodata if ds.nodata is not None else float(NODATA)
        return arr, nodata, SourceGeometry(ds)


def _stack(db, archive, span: str, variable: str = VARIABLE):
    """Per-cell DB-minus-archive differences for every month in `span`.

    Returns (diffs (n_months, n_land), land mask, geometry, labels).
    """
    diffs, labels, land, geom = [], [], None, None
    for y, m in months(span):
        d, dn, geom = read(db, y, m, variable)
        a, an, _ = read(archive, y, m, variable)
        valid = (d != dn) & (a != an) & np.isfinite(d) & np.isfinite(a)
        if land is None:
            land = valid
        elif int(valid.sum()) != int(land.sum()):
            # Both eras are projected through the same grid basis, so the land
            # mask is a property of the grid and must not move. If it does, the
            # two trees disagree about the domain and averaging across them
            # would silently mix two footprints.
            raise RuntimeError(
                f"{y}-{m:02d}: {int(valid.sum()):,} valid cells against "
                f"{int(land.sum()):,} in the first month - the land mask moved")
        diffs.append((d - a)[land])
        labels.append(f"{y}-{m:02d}")
    if not diffs:
        raise RuntimeError(f"no months in {span}")
    return np.array(diffs), land, geom, labels


def _describe(v: np.ndarray) -> dict:
    q = np.percentile(v, [1, 5, 50, 95, 99])
    return {"mean": float(v.mean()), "p1": float(q[0]), "p5": float(q[1]),
            "p50": float(q[2]), "p95": float(q[3]), "p99": float(q[4]),
            "min": float(v.min()), "max": float(v.max()),
            "rmse": float(np.sqrt((v ** 2).mean())),
            "mae": float(np.abs(v).mean())}


def build(db, archive, span: str, out: Path, seasonal: bool = False,
          variable: str = VARIABLE) -> dict:
    """Write the offset field(s) and a manifest describing the training set."""
    diffs, land, geom, labels = _stack(db, archive, span, variable)
    log.info("training on %d months, %s..%s, %d land cells",
             len(labels), labels[0], labels[-1], int(land.sum()))

    out.mkdir(parents=True, exist_ok=True)
    fields: dict[str, np.ndarray] = {}
    if seasonal:
        # One field per calendar month. Absorbs a seasonal component -- winter
        # inversions in basins are exactly where the two networks diverge most
        # -- at the cost of 12x fewer samples per estimate.
        for cal in range(1, 13):
            sel = [i for i, l in enumerate(labels) if int(l[5:7]) == cal]
            if not sel:
                continue
            fields[f"m{cal:02d}"] = diffs[sel].mean(axis=0)
    else:
        fields["annual"] = diffs.mean(axis=0)

    stats = {}
    for name, vec in fields.items():
        grid = np.full(land.shape, float(NODATA), dtype=np.float32)
        grid[land] = vec.astype(np.float32)
        write_cog(out / f"offset_{variable}_{name}.tif", grid, geom,
                  nodata=float(NODATA), max_z_error=MAX_Z_ERROR,
                  tags={"variable": f"{variable}_era_offset", "unit": "C",
                        "train_span": span, "n_months": len(labels),
                        "field": name,
                        "method": "per-cell mean of (DB surface - CLIFLO surface)",
                        # SUBTRACT, not add. The field is DB minus archive, so
                        # `db - (db - archive)` is what lands on the archive
                        # scale. Gibbston's field is negative (the DB reads
                        # ~1.1 degC cold there) and the correction must WARM it;
                        # adding would double the error instead of removing it.
                        # `apply_field` and `run_history.py --era-offset` both
                        # subtract. This tag said ADD until 2026-08-23.
                        "sign": "SUBTRACT from a DB-era surface to express it "
                                "on the CLIFLO archive scale"})
        stats[name] = _describe(vec)
        log.info("%-7s mean %+.3f  p5 %+.3f  p50 %+.3f  p95 %+.3f  "
                 "min %+.3f  max %+.3f", name, stats[name]["mean"],
                 stats[name]["p5"], stats[name]["p50"], stats[name]["p95"],
                 stats[name]["min"], stats[name]["max"])

    manifest = {"variable": variable, "unit": "C", "train_span": span,
                "n_months": len(labels), "months": labels,
                "mode": "seasonal" if seasonal else "annual",
                "n_land_cells": int(land.sum()), "fields": stats,
                "sign": "SUBTRACT from a DB-era surface"}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def load_fields(out: Path, variable: str = VARIABLE) -> tuple[dict, np.ndarray]:
    _configure_proj()
    import rasterio
    fields, land = {}, None
    for p in sorted(out.glob(f"offset_{variable}_*.tif")):
        with rasterio.open(p) as ds:
            a = ds.read(1)
            nd = ds.nodata if ds.nodata is not None else float(NODATA)
        m = (a != nd) & np.isfinite(a)
        land = m if land is None else land
        fields[p.stem.rsplit("_", 1)[-1]] = a
    if land is None:
        raise RuntimeError(f"no offset rasters in {out}")
    return fields, land


def validate(db, archive, span: str, out: Path,
             variable: str = VARIABLE) -> dict:
    """Score the held-out window before and after the correction.

    Reports NATIONAL aggregates and per-site values. The national number will
    always look small -- it is a mean over a field whose sign flips -- so the
    per-site rows are the ones that decide whether this works.
    """
    fields, _ = load_fields(out, variable)
    diffs, land, _, labels = _stack(db, archive, span, variable)
    log.info("testing on %d months, %s..%s", len(labels), labels[0], labels[-1])

    corrected = np.empty_like(diffs)
    for i, l in enumerate(labels):
        cal = f"m{int(l[5:7]):02d}"
        f = fields.get(cal, fields.get("annual"))
        if f is None:
            raise RuntimeError(f"no offset field for {l}")
        corrected[i] = diffs[i] - f[land]

    before, after = _describe(diffs.ravel()), _describe(corrected.ravel())
    print(f"\n=== held-out {span}: DB minus CLIFLO, per cell per month ===")
    print(f"{'':10} {'bias':>8} {'RMSE':>8} {'MAE':>8} {'p5':>8} {'p95':>8} "
          f"{'|max|':>8}")
    for lab, s in (("before", before), ("after", after)):
        print(f"{lab:10} {s['mean']:+8.3f} {s['rmse']:8.3f} {s['mae']:8.3f} "
              f"{s['p5']:+8.3f} {s['p95']:+8.3f} "
              f"{max(abs(s['min']), abs(s['max'])):8.3f}")
    red = 100.0 * (1 - after["rmse"] / before["rmse"])
    print(f"\nRMSE reduction: {red:+.1f}%   MAE reduction: "
          f"{100.0 * (1 - after['mae'] / before['mae']):+.1f}%")

    # Per-month, so a seasonal failure cannot hide inside an annual mean.
    print(f"\n{'month':9} {'bias b':>8} {'bias a':>8} {'rmse b':>8} {'rmse a':>8}")
    per_month = []
    for i, l in enumerate(labels):
        b, a = diffs[i], corrected[i]
        per_month.append({
            "month": l, "bias_before": float(b.mean()),
            "bias_after": float(a.mean()),
            "rmse_before": float(np.sqrt((b ** 2).mean())),
            "rmse_after": float(np.sqrt((a ** 2).mean()))})
        print(f"{l:9} {b.mean():+8.3f} {a.mean():+8.3f} "
              f"{np.sqrt((b ** 2).mean()):8.3f} {np.sqrt((a ** 2).mean()):8.3f}")
    # Returned, and written to the run record by `main`. These held-out scores
    # are the ONLY evidence the field works, they can never be recomputed
    # (CLIFLO closed 2024-10), and until now they existed solely as terminal
    # output.
    return {"variable": variable, "test_span": span,
            "n_months": len(labels), "months": labels,
            "before": before, "after": after,
            "rmse_reduction_pct": red,
            "mae_reduction_pct": 100.0 * (1 - after["mae"] / before["mae"]),
            "per_month": per_month}


def apply_field(db, span: str, out: Path, field_dir: Path,
                variable: str = VARIABLE, res_m: int = 500) -> dict:
    """Write era-corrected copies of the monthly rasters, ready to publish.

    The correction has to be BAKED IN rather than applied at serve time.
    `surface_store` streams a COG out of S3 and renders it; there is no hook
    between the two, and adding one would mean every tile request, every
    `/point` lookup and every zone aggregation had to remember to apply it. One
    of them would eventually forget, and the failure would be a quiet half-degree
    rather than an error.

    So the published raster is the corrected raster, and `model_version` records
    that it is corrected. `OFFSET_BANDS` get the shift; `COPY_BANDS` are passed
    through byte-for-byte so the output tree is complete and syncable.

    NODATA is preserved rather than shifted -- a cell with no value must not
    acquire one by being offset.
    """
    _configure_proj()
    import rasterio

    fields, _ = load_fields(field_dir, variable)
    out.mkdir(parents=True, exist_ok=True)
    written, skipped = 0, []

    for y, m in months(span):
        f = fields.get(f"m{m:02d}", fields.get("annual"))
        if f is None:
            raise RuntimeError(f"no offset field for month {m:02d}")
        for band in OFFSET_BANDS + COPY_BANDS:
            k = key(y, m, res_m, variable, band)
            src = None
            for root in ([db] if isinstance(db, Path) else db):
                if (root / k).exists():
                    src = root / k
                    break
            if src is None:
                skipped.append(k)
                continue
            if band in COPY_BANDS:
                # Byte copy, not a re-encode. `argmin_day`/`argmax_day` are day
                # indices and running them back through a lossy LERC write would
                # perturb integers for no reason.
                (out / k).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, out / k)
                written += 1
                continue
            with rasterio.open(src) as ds:
                arr = ds.read(1)
                nd = ds.nodata if ds.nodata is not None else float(NODATA)
                geom = SourceGeometry(ds)
                tags = ds.tags()
            if band in OFFSET_BANDS:
                # BOTH sides must be valid. The two rasters come off the same
                # grid so their land masks should agree exactly, but if they ever
                # did not, subtracting the field's -9999 sentinel would write a
                # plausible-looking raster full of nonsense rather than fail.
                good = ((arr != nd) & np.isfinite(arr)
                        & (f != float(NODATA)) & np.isfinite(f))
                orphan = int((((arr != nd) & np.isfinite(arr)) & ~good).sum())
                if orphan:
                    raise RuntimeError(
                        f"{k}: {orphan:,} cells have a value but no offset - "
                        "the field and the surface disagree about the land mask")
                arr = arr.astype(np.float32)
                arr[good] = arr[good] - f[good].astype(np.float32)
                tags = {**tags, "era_offset_applied": "true",
                        "era_offset_field": field_dir.name,
                        "era_offset_sign": "published = fitted - offset"}
            (out / k).parent.mkdir(parents=True, exist_ok=True)
            # DEFAULT_MAX_Z_ERROR is a dict keyed by variable, not a scalar.
            # Passing the dict makes GDAL reject the creation option with a
            # CPLE_NotSupported warning and silently fall back to its own
            # default, so the raster still writes -- with the wrong compression.
            write_cog(out / k, arr, geom, nodata=float(nd),
                      max_z_error=DEFAULT_MAX_Z_ERROR[variable], tags=tags)
            written += 1

    log.info("%s: wrote %d corrected rasters over %s", variable, written, span)
    if skipped:
        log.warning("%d source rasters absent, e.g. %s", len(skipped), skipped[:3])
    return {"variable": variable, "span": span, "written": written,
            "skipped": skipped, "field": field_dir.name}


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("action", choices=["build", "validate", "apply"])
    ap.add_argument("--variable", default=VARIABLE,
                    choices=["temp_mean", "temp_min", "temp_max"])
    ap.add_argument("--span", default=None,
                    help="apply only: months to correct, YYYY-MM:YYYY-MM")
    ap.add_argument("--db", type=Path, required=True, action="append",
                    help="bucket root of the DB-era surfaces; repeatable, "
                         "first root holding a month wins")
    ap.add_argument("--archive", type=Path, action="append",
                    help="bucket root of CLIFLO surfaces; repeatable. "
                         "Not needed for apply")
    ap.add_argument("--train", default="2020-01:2022-12")
    ap.add_argument("--test", default="2023-01:2023-12")
    ap.add_argument("--out", type=Path, required=True,
                    help="build: where the offset rasters are written. "
                         "validate: where to read them from. "
                         "apply: the corrected bucket tree to write")
    ap.add_argument("--field", type=Path, default=None,
                    help="apply only: the offset field dir to read")
    ap.add_argument("--seasonal", action="store_true",
                    help="one field per calendar month instead of one overall")
    a = ap.parse_args(argv)

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s",
                        datefmt="%H:%M:%S")
    # Argument errors before the record, so a refused invocation leaves none.
    if a.action == "apply":
        if not a.span:
            raise SystemExit("apply needs --span YYYY-MM:YYYY-MM")
        if not a.field:
            raise SystemExit("apply needs --field (the offset field dir)")

    # The record lives with whatever `--out` addresses: the field directory for
    # build and validate, the corrected tree for apply. Opened in `main` rather
    # than inside each action because it spans the dispatch; a caller importing
    # `build()` directly gets no record, which is why the CLI is the supported
    # entry point.
    span = {"build": a.train, "validate": a.test}.get(a.action, a.span)
    record = RunRecord(a.out)
    record.open({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "engine": "era_offset", "action": a.action, "argv": sys.argv,
        "parameters": {
            "variable": a.variable, "span": span, "seasonal": a.seasonal,
            "out": str(a.out), "field": str(a.field) if a.field else None,
            "train": a.train, "test": a.test,
            "max_z_error": MAX_Z_ERROR,
            "offset_bands": list(OFFSET_BANDS), "copy_bands": list(COPY_BANDS)},
        # A derived field has no station network; its inputs are two sets of
        # SURFACES, and which roots they came from is the whole provenance.
        "sources": {"db_roots": [str(p) for p in a.db],
                    "archive_roots": [str(p) for p in (a.archive or [])]},
        "code": {"digest": _code_digest(CODE_MODULES), "git": _git_revision()},
        "environment": _environment()})

    if a.action == "build":
        outcome = build(a.db, a.archive, a.train, a.out, seasonal=a.seasonal,
                        variable=a.variable)
        copy = RunRecord.DEFAULT_COPY
    elif a.action == "validate":
        outcome = validate(a.db, a.archive, a.test, a.out, variable=a.variable)
        # Its own file as well as the run.json copy: a held-out score table is
        # read on its own far more often than a whole run record is.
        (record.dir / "validation.json").write_text(
            json.dumps(outcome, indent=2))
        # `manifest.json` here belongs to the FIELD being validated, not to this
        # run, and copying it in would make the record look like it built one.
        copy = ()
    else:
        outcome = apply_field(a.db, a.span, a.out, a.field, variable=a.variable)
        copy = ()                       # apply writes rasters, no manifest
    record.close(outcome, copy=copy)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
