"""Run the 1986-2023 climate history backfill and publish monthly statistics.

Reads the consolidated daily station record from `consolidate_history.py`, fits
one surface per day with the production `ridge` engine, reduces each month to
the band set in `monthly.py`, and writes monthly COGs plus an all-time records
layer. **Daily surfaces are never written to disk** — see `monthly.py` for why
the band set is wider than it looks like it needs to be.

Shape of the work, per variable:

    build basis        once     ~11 s      (M x (n+3), 1.7-3.4 GB)
    fit each day       ~110 ms  x 13,878   ~25 min
    project each month one GEMM x 456      ~1 min total
    reduce + write     ~10 COGs x 456

The basis is what makes this tractable: `tps.evaluate_on_grid` would cost 10.7 s
per day instead of 2.8 ms, turning 25 minutes into 41 hours.

    python backend/scripts/interpolation/run_history.py --variable temp_mean
    python backend/scripts/interpolation/run_history.py --variable temp_mean --end 1986-12

The DB-sourced live era additionally takes the era-offset field, which is
subtracted from each DAY on the grid before the monthly reduction — the only
stage at which the threshold counts can be corrected at all:

    python backend/scripts/interpolation/run_history.py --variable temp_min \\
        --era-offset scratchpad/live_surfaces/offset_final_temp_min \\
        --model-version tps-2.0.0-ridge-db-adj

Every invocation leaves an immutable record at
`<out>/<variable>/_runs/<run_id>/` — parameters, code digest, git revision, the
fit network with per-station reporting counts, and (on completion) copies of
`manifest.json` and `validation_stats.csv`. The directory beside it stays a
working copy that the next run overwrites; the records do not overwrite. That
distinction is the whole point: a run's network and its code are its two
independent variables, and re-running a variable used to destroy the evidence
of the run before it.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import platform
import shutil
import subprocess
import sys
import time
from calendar import monthrange
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation import monthly as M                       # noqa: E402
from scripts.interpolation import tps                                # noqa: E402
from scripts.interpolation.consolidate_history import (              # noqa: E402
    apply_elevation_overrides)
from scripts.interpolation.fastgrid import GridBasis, estimate_bytes  # noqa: E402
# precip's own imports are numpy/pandas/tps only — rasterio stays lazy, so this
# does not pull GDAL into a temperature run.
from scripts.interpolation.precip import DEFAULT_SMOOTH_KM             # noqa: E402
from scripts.interpolation.raster import (DEFAULT_MAX_Z_ERROR, NODATA,  # noqa: E402
                                          RasterTemplate, _configure_proj,
                                          grid_from_csv, write_cog)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("history")

REPO = Path(__file__).resolve().parents[3]
DEFAULT_INPUTS = REPO / "scratchpad" / "climate_history" / "inputs"
# Named `bucket` because the tree under it IS the S3 key layout (contract §1.1),
# so publishing is `aws s3 sync <out>/ s3://auxein-climate-surfaces/` with no
# path rewriting.
DEFAULT_OUT = REPO / "scratchpad" / "climate_history" / "bucket"
DEFAULT_GRID = REPO / "backend" / "models" / "example data" / "VCDN_500m.csv"

# Stamped into every manifest entry and every surface_run tag. Overridable with
# --model-version because the live-era (2020->present, DB-sourced) surfaces MUST NOT
# share a model_version with the published 1986-2023 CLIFLO archive: the estimator is
# identical but the observations are not, and the two carry a measured provenance
# offset (tmean -0.27 degC, see the overlap bias study). Sharing the key would make
# the eras indistinguishable in `surface_run` and silently mix them in one chart.
MODEL_VERSION = "tps-2.0.0-ridge"
# Frozen copy of the archive's key. `MODEL_VERSION` is mutable (--model-version),
# so the era-offset guard needs a constant to compare against: an era-corrected
# run stamped with the ARCHIVE's own version would be indistinguishable from the
# archive in `surface_run`, and `store.resolve` would mix the two in one chart.
ARCHIVE_MODEL_VERSION = MODEL_VERSION
CONTRACT_VERSION = "v2"
EPOCH = date(1986, 1, 1)

# Rainfall interpolation method. `ratio_lenz` is Tait et al. (2006) in ratio
# form: divide each station's daily total by its mean annual rainfall, fit the
# spline on that dimensionless ratio, and multiply back by MAR on the grid.
#
# Chosen by the 8-arm bake-off of 2026-08-06 (158 days, 10-fold by station,
# 71,337 held-out station-days per arm): raw 2.600 MAE, sqrt 2.367,
# ratio-with-our-own-climatology 2.545, **ratio_lenz 2.334**. The ceiling with a
# leak-perfect climatology is 2.134, so LENZ closes about two thirds of the
# climatology-error tax. `ratio_sqrt_lenz` scores better on all-day MAE (2.225)
# but worse on WET-day MAE (6.170 vs 5.998) and carries 3.7x the dry bias, so
# for a product where wet days are what matter, plain `ratio_lenz` wins.
#
# The bake-off ran on the 2020-2026 DB network. The method choice transfers to
# the 1986-2023 archive; the exact percentage does not. Publish this run's own
# cross-validation, not the bake-off number.
#
# The raster is CONDITIONED before use — area-averaged onto the surface grid and
# low-passed — because LENZ carries fitting artefacts at 100 m that the ratio
# method would otherwise reprint into every daily surface at full amplitude.
# See `precip.RasterClimatology` for the two measured defects and the trade.
PRECIP_METHOD_RATIO_LENZ = "ratio_lenz"
PRECIP_METHOD_RAW = "raw"
LENZ_MAR = (REPO / "docs" / "models"
            / "lris-nzenvds-total-annual-precipitation-v10-GTiff"
            / "precip_ann_uc.tif")

UNITS = {"temp_mean": "C", "temp_min": "C", "temp_max": "C",
         "rainfall": "mm", "solar_rad": "MJ/m2"}
# Rainfall must NOT be lapse-corrected: the on-prem precip model has no
# elevation handling and the orographic question is unsettled.
#
# temp_min is 0.4, not the inherited 0.6. Two independent estimates converge:
# the cv_rmse sweep optimum is 0.4 (1.859 vs 1.904, -2.4%) and the pairwise
# local lapse over 705 station pairs is 0.432 degC/100 m. Tmin inverts on 26% of
# pairs against 16% for the others, which is exactly why it needs a shallower
# rate. **Do not choose this on the 2.4%** — cv_rmse badly understates it because
# the network is overwhelmingly low-elevation, so CV hardly samples the high
# country. 0.6 -> 0.4 shifts predicted Tmin at 1,000 m by 2 degC, and that is
# what `frost_days` rides on in frost terrain.
#
# temp_mean and temp_max were swept too and need NO re-run: temp_mean's optimum
# is 0.5 (1.150) against 0.6 (1.151), indistinguishable, and temp_max's optimum
# is exactly 0.6. A per-day fitted lapse was measured and is WORSE (+1.6%).
LAPSE = {"temp_mean": 0.6, "temp_min": 0.4, "temp_max": 0.6,
         "rainfall": 0.0, "solar_rad": 0.0}

# Bands whose values are day-of-month or counts, not the variable's unit. LERC's
# tolerance is expressed in band units, so these need a tighter one or they get
# quantised into the wrong integer.
INTEGER_BANDS = {"argmin_day", "argmax_day", "frost_days", "days_over_25",
                 "days_over_30", "wet_days", "days_over_10mm", "days_over_25mm",
                 "max_dry_spell", "all_time_max_day", "all_time_min_day",
                 "first_frost_day", "last_frost_day"}
# `wet_top1..K` are deliberately NOT integer bands: they are rainfall depths in
# mm and take the variable's own LERC tolerance.


def _set_model_version(value: str) -> None:
    """Override the module-level MODEL_VERSION stamped into manifests and tags."""
    global MODEL_VERSION
    if value != MODEL_VERSION:
        log.warning("model_version = %s (default %s)", value, MODEL_VERSION)
    MODEL_VERSION = value


# ---------------------------------------------------------------------------
# Era offset, applied to DAILY values
#
# The DB-sourced era (2024-10 onward) is reconciled to the CLIFLO archive by the
# per-cell seasonal field built in `era_offset.py`. That script can also apply the
# field POST HOC to finished monthly rasters, and that is how the surfaces
# published on 2026-08-21 were corrected — but a post-hoc shift can only touch
# bands that are themselves temperatures.
#
# **You cannot apply a temperature offset to a day COUNT.** `frost_days`,
# `first_frost_day`, `last_frost_day`, `days_over_25` and `days_over_30` are
# counted by thresholding each DAY, and once the month has been reduced to a mean
# the daily values are gone — `run_history.py` streams days through the monthly
# accumulator and never writes a daily raster. So those five bands had to be
# stripped from the live-era manifests, which left frost — a headline product —
# unavailable from 2024-10 on.
#
# Correcting HERE fixes that by construction. The offset is subtracted from every
# day's grid values before `monthly_stats` sees them, so every band is computed
# from corrected temperatures: the counts get the right threshold crossings, and
# `mean`/`median`/`min`/`max` come out identical to the post-hoc path.
#
# Some bands are invariant, and that is a property worth knowing rather than a
# coincidence: the field is constant per cell within a calendar month, so `sd`
# (a dispersion) and `argmin_day`/`argmax_day` (indices) are unchanged by it.
# `era_offset.apply_field` reaches the same conclusion by listing them in
# COPY_BANDS. The two paths therefore have to agree, which is the cross-check.
#
# One measured exception, and it is a tie-break rather than a defect. The block
# is corrected in float64 and then cast to float32 for the reduction, so on a
# cell where two days are the month's extreme to within float32 epsilon, the
# rounding can pick the other one. Measured over 2024-10..2026-07 x 3 variables:
# **exactly one cell of 1,429,944 in about ten of the sixty-six months**, and in
# every case the extreme VALUE is identical to five decimals while only the day
# index moves (e.g. temp_min 2025-11: 16.9655 degC on both day 28 and day 10).
# The month genuinely had two equal warmest nights and either index is equally
# true. Check `argmin_day`/`argmax_day` by asserting the VALUE band agrees, not
# by requiring the index to be bit-identical.
#
# Fit statistics are NOT corrected and must not be. `cv_rmse` and friends measure
# the spline against its own observations in station space; the offset is a grid-
# space reconciliation between two networks and has nothing to say about how well
# the DB network was fitted.
class EraOffset:
    """The per-cell DB->archive correction, as land-cell vectors on THIS grid.

    Sign: the field is `DB surface - archive surface`, so expressing a DB-era
    surface on the archive scale means SUBTRACTING it. Gibbston's field is
    negative (the DB reads ~1.1 degC cold there with no high-country thermometer
    to anchor it) and the correction must warm the cell.
    """

    def __init__(self, fields: dict, meta: dict):
        self.fields = fields          # calendar month 1..12 -> (n_cells,) float32
        self.meta = meta

    @classmethod
    def load(cls, field_dir: Path, variable: str, template: RasterTemplate):
        _configure_proj()
        import rasterio

        tifs = sorted(field_dir.glob(f"offset_{variable}_*.tif"))
        if not tifs:
            raise SystemExit(f"no offset_{variable}_*.tif in {field_dir}")

        want = np.array(template.transform)[:6]
        by_name: dict[str, np.ndarray] = {}
        digest = hashlib.sha256()
        for p in tifs:
            with rasterio.open(p) as ds:
                if (ds.height, ds.width) != (template.height, template.width):
                    raise SystemExit(
                        f"{p.name}: {ds.height}x{ds.width} against the run's "
                        f"{template.height}x{template.width} — the offset field "
                        "was built on a different grid")
                if not np.allclose(np.array(ds.transform)[:6], want, atol=1e-9):
                    raise SystemExit(
                        f"{p.name}: georeferencing differs from the run's grid; "
                        "same shape but a different origin or cell size")
                arr = ds.read(1)
                nd = ds.nodata if ds.nodata is not None else float(NODATA)
            vec = arr.ravel()[template.flat_index]
            # Every land cell the run will fit must have an offset. A missing one
            # would otherwise subtract the -9999 sentinel and write a raster that
            # looks plausible per-band while being nonsense — the same failure
            # `apply_field` guards with its orphan check.
            bad = int((~np.isfinite(vec) | (vec == nd)).sum())
            if bad:
                raise SystemExit(
                    f"{p.name}: {bad:,} of {len(vec):,} land cells have no "
                    "offset — the field and the run disagree about the land mask")
            vec = vec.astype(np.float32)
            name = p.stem.rsplit("_", 1)[-1]
            by_name[name] = vec
            digest.update(name.encode())
            digest.update(vec.tobytes())

        man_path = field_dir / "manifest.json"
        man = json.loads(man_path.read_text()) if man_path.exists() else {}
        if str(man.get("sign", "")).upper().startswith("ADD"):
            # Fields built before 2026-08-23 carry an inverted `sign` string. The
            # rasters are fine — only the wording was wrong — but say so rather
            # than let a reader trust it.
            log.warning("%s/manifest.json says sign=ADD; that text is a known "
                        "error, the field is SUBTRACTED", field_dir.name)

        if "annual" in by_name and len(by_name) == 1:
            fields = {mo: by_name["annual"] for mo in range(1, 13)}
            mode = "annual"
        else:
            fields = {}
            for mo in range(1, 13):
                v = by_name.get(f"m{mo:02d}")
                if v is None:
                    raise SystemExit(
                        f"{field_dir} has no field for calendar month {mo:02d} "
                        f"(found {sorted(by_name)}); a run covering that month "
                        "would silently go uncorrected")
                fields[mo] = v
            mode = "seasonal"

        # Deliberately no absolute path: this dict is copied into the manifest
        # that ships to S3, and a local scratchpad path is meaningless there.
        # `field_dir` plus `sha256` identify the field precisely enough.
        meta = {"field_dir": field_dir.name,
                "mode": mode, "n_fields": len(by_name),
                "train_span": man.get("train_span"),
                "n_train_months": man.get("n_months"),
                "sha256": digest.hexdigest()[:16],
                "sign": "corrected = fitted - offset"}
        log.warning("[%s] ERA OFFSET %s (%s, %d fields, trained %s) — daily "
                    "values are corrected BEFORE the monthly reduction",
                    variable, field_dir.name, mode, len(by_name),
                    man.get("train_span", "unknown"))
        for mo in (1, 7):
            v = fields[mo]
            log.info("[%s]   m%02d  mean %+.3f  p5 %+.3f  p95 %+.3f  min %+.3f  "
                     "max %+.3f", variable, mo, float(v.mean()),
                     float(np.percentile(v, 5)), float(np.percentile(v, 95)),
                     float(v.min()), float(v.max()))
        return cls(fields, meta)

    def for_month(self, mo: int) -> np.ndarray:
        return self.fields[mo]

    def tags(self) -> dict:
        return {"era_offset_applied": "true",
                "era_offset_field": self.meta["field_dir"],
                "era_offset_mode": self.meta["mode"],
                "era_offset_sha256": self.meta["sha256"],
                "era_offset_train_span": str(self.meta.get("train_span")),
                "era_offset_stage": "daily, before the monthly reduction",
                "era_offset_sign": "published = fitted - offset"}


def month_key(d: date) -> tuple:
    return d.year, d.month


def load_inputs(path: Path, variable: str):
    z = np.load(path / f"{variable}.npz", allow_pickle=True)
    dates = [date.fromisoformat(s) for s in z["dates"].tolist()]
    stations = pd.DataFrame({
        "station_id": z["station_ids"], "latitude": z["latitude"],
        "longitude": z["longitude"], "elevation": z["elevation"]})
    # Re-applied here as well as in `consolidate_history`, so an .npz staged
    # before the overrides existed is still corrected without a re-consolidate
    # (which would mean re-reading 13,878 files off `Z:`). Idempotent.
    stations = apply_elevation_overrides(stations)
    return z["values"], stations, dates


def out_path(root: Path, variable: str, y: int, m: int, res: int, stat: str) -> Path:
    return (root / "surfaces" / CONTRACT_VERSION / variable / "monthly" / f"{y}"
            / f"{variable}_monthly_{y}{m:02d}_{res}m_{stat}.tif")


# ---------------------------------------------------------------------------
# Checkpointing
#
# A run is ~77 minutes and everything that is not a monthly COG — the records
# layer, the manifest, and `validation_stats.csv` — is written only at the very
# end. Two runs have now been lost near-complete (1986-91, then 96%), each time
# throwing away the per-day fit statistics for every month that HAD succeeded.
# The monthly COGs survive a kill because they are written as we go; nothing
# else did.
#
# So commit the run's accumulated state after every month. The expensive part
# (fitting ~30 days) is never redone for a month whose COGs are already on disk.
#
# Ordering matters: the month's COGs are written FIRST, then the stats rows are
# appended, then `state.json` is replaced. `state.json` is the commit point — a
# kill anywhere before it leaves a checkpoint that simply redoes that month,
# overwriting its COGs. A kill between the stats append and the commit leaves
# extra rows in the CSV, which is why the committed row COUNT is recorded and
# the CSV is truncated back to it on resume.
# 2 (2026-08-27): `dry_carry` became a PER-CELL array and moved from state.json
# into records.npz. A v1 checkpoint holds the scalar national maximum that made
# `max_dry_spell` wrong, so resuming onto one must refuse rather than continue.
CKPT_VERSION = 2


def _ckpt_paths(out: Path, variable: str):
    d = out / variable / "_checkpoint"
    return d, d / "records.npz", d / "state.json"


def _fingerprint(variable: str, lapse: float, res: int, n_cells: int,
                 origin: tuple, n_stations: int, dtype) -> dict:
    """Everything that must match for a resume to be sound.

    Resuming across a changed lapse rate or a changed grid would silently weld
    two different products into one archive — the kind of defect that is
    invisible in the output and fatal to the series.

    `dtype` is in here for the same reason and it is not hypothetical: the grid
    basis at float32 differs from float64 by ~0.016 degC (measured in
    `fastgrid_check.py`), so a resume that changed it would leave a seam in the
    middle of a variable's history at roughly 1.6 LERC quanta — large enough to
    be real, small enough that nothing downstream would ever flag it.
    """
    return {"ckpt_version": CKPT_VERSION, "variable": variable,
            "lapse": float(lapse), "resolution_m": int(res),
            "n_cells": int(n_cells), "n_stations": int(n_stations),
            "origin": [round(float(origin[0]), 6), round(float(origin[1]), 6)],
            "dtype": np.dtype(dtype).name,
            "model_version": MODEL_VERSION, "contract_version": CONTRACT_VERSION}


def save_checkpoint(out: Path, variable: str, *, records, manifest: list,
                    skipped: list, dry_carry, total_bytes: int, last_key: tuple,
                    n_stats_rows: int, fingerprint: dict) -> None:
    d, npz, js = _ckpt_paths(out, variable)
    d.mkdir(parents=True, exist_ok=True)
    tmp_npz = d / "records.npz.tmp"
    with open(tmp_npz, "wb") as fh:            # explicit handle: np.savez would
        np.savez(fh,                           # otherwise re-append ".npz"
                 max_value=records.max_value, min_value=records.min_value,
                 max_date=records.max_date, min_date=records.min_date,
                 n_months=np.int64(records.n_months),
                 # PER CELL, so it belongs with the other per-cell state rather
                 # than in state.json. A resume that restarted the dry-spell
                 # carry at zero would leave a seam in exactly one band, in the
                 # middle of a history, with nothing downstream to flag it.
                 dry_carry=(np.zeros(0, dtype=np.float32)
                            if dry_carry is None
                            else np.asarray(dry_carry, dtype=np.float32)))
    os.replace(tmp_npz, npz)

    tmp_js = d / "state.json.tmp"
    tmp_js.write_text(json.dumps({
        "fingerprint": fingerprint, "last_key": list(last_key),
        "manifest": manifest, "skipped": skipped,
        # `dry_carry` lives in records.npz now -- it is an (n_cells,) array and
        # was silently truncated to a single int here until 2026-08-27.
        "total_bytes": int(total_bytes), "n_stats_rows": int(n_stats_rows)}))
    os.replace(tmp_js, js)                     # <- commit point


def load_checkpoint(out: Path, variable: str, n_cells: int, expect: dict):
    """Restore accumulated state, or hard-fail if it does not match this run."""
    d, npz, js = _ckpt_paths(out, variable)
    if not js.exists() or not npz.exists():
        raise SystemExit(f"--resume given but no checkpoint at {d}")
    state = json.loads(js.read_text())
    got = state["fingerprint"]
    if got != expect:
        diff = {k: (got.get(k), expect.get(k)) for k in set(got) | set(expect)
                if got.get(k) != expect.get(k)}
        raise SystemExit(
            f"checkpoint does not match this run, refusing to resume: {diff}\n"
            f"(was/now). Re-run with --restart to discard it.")
    rec = M.RecordAccumulator(n_cells)
    z = np.load(npz)
    rec.max_value, rec.min_value = z["max_value"], z["min_value"]
    rec.max_date, rec.min_date = z["max_date"], z["min_date"]
    rec.n_months = int(z["n_months"])
    carry = z["dry_carry"] if "dry_carry" in z.files else np.zeros(0, np.float32)
    state["dry_carry"] = None if carry.size == 0 else carry
    return rec, state


def clear_checkpoint(out: Path, variable: str) -> None:
    d, _, _ = _ckpt_paths(out, variable)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)

# ---------------------------------------------------------------------------
# Immutable run records — see `runrecord.py`. Imported by name because this
# module's own code refers to them unqualified.
# The modules whose contents determine the numbers. Hashing these is deliberate
# in preference to a git revision: nothing in this directory is committed today,
# so a revision hash would report "dirty" and nothing else, and a repo-wide hash
# would change on an unrelated frontend commit. A digest over the estimator's
# own sources is precise, and it sees UNCOMMITTED edits — which is the only
# state this code has ever run in.
CODE_MODULES = ("run_history.py", "tps.py", "fastgrid.py", "raster.py",
                "monthly.py", "precip.py", "consolidate_history.py")

from scripts.interpolation.runrecord import (             # noqa: E402
    RUNS_DIRNAME, RunRecord, _code_digest, _environment, _git_revision,
    latest_record, station_frame, warn_if_code_changed, write_station_snapshot)


def open_climatology(smooth_km: float):
    """Open LENZ and condition it once, for reuse across station and grid reads.

    Conditioning reads all 152M source cells and smooths them, so it must not be
    repeated per call site.
    """
    from scripts.interpolation.precip import DEFAULT_TARGET_RES_M, RasterClimatology

    return RasterClimatology(
        LENZ_MAR, fallback=lambda pts: np.full(len(pts), np.nan),
        smooth_km=smooth_km, target_res_m=DEFAULT_TARGET_RES_M)


def load_mar(lat: np.ndarray, lon: np.ndarray, label: str, clim) -> np.ndarray:
    """Sample LENZ mean annual rainfall (mm/yr) at the given points.

    `RasterClimatology` already walks out to a nearest valid cell for points
    that land just off the coastal mask (LENZ covers 1,429,916 of our 1,429,944
    land cells; the 28 misses are coastal at <=13 m). Anything still invalid
    after that is filled with the median rather than allowed to raise — a
    handful of edge cells must not be able to kill a 90-minute run — but it is
    logged, because a large count would mean the raster is misaligned rather
    than merely clipped.
    """
    mar = clim(np.column_stack([lon, lat]))          # (lon, lat) degrees

    bad = ~np.isfinite(mar) | (mar <= 0)
    if bad.any():
        fill = float(np.median(mar[~bad]))
        pct = 100.0 * bad.sum() / len(mar)
        (log.error if pct > 1.0 else log.warning)(
            "MAR: %d of %d %s points (%.3f%%) had no valid LENZ value; "
            "filled with median %.0f mm", bad.sum(), len(mar), label, pct, fill)
        mar[bad] = fill
    log.info("MAR %s: n=%d  min %.0f  median %.0f  max %.0f mm/yr", label,
             len(mar), mar.min(), np.median(mar), mar.max())
    return mar


def append_stats(csv_path: Path, rows: list) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(csv_path, mode="a", index=False,
                              header=not csv_path.exists())


def truncate_stats(csv_path: Path, n_rows: int) -> None:
    """Drop rows appended after the last commit (see the ordering note above)."""
    if not csv_path.exists():
        return
    df = pd.read_csv(csv_path)
    if len(df) > n_rows:
        log.warning("trimming %d uncommitted stats rows", len(df) - n_rows)
        df.iloc[:n_rows].to_csv(csv_path, index=False)


def write_bands(bands: dict, template: RasterTemplate, paths: dict,
                base_tags: dict, unit: str, workers: int) -> int:
    """Write one COG per band, concurrently (GDAL releases the GIL to compress)."""
    def one(item):
        name, values = item
        tol = 0.5 if name in INTEGER_BANDS else DEFAULT_MAX_Z_ERROR.get(
            base_tags["variable"], 0.01)
        p = write_cog(paths[name], template.to_raster(values), template,
                      max_z_error=tol,
                      tags={**base_tags, "statistic": name,
                            "unit": "day" if name.endswith("_day")
                            else ("days" if name in INTEGER_BANDS else unit)})
        return p.stat().st_size

    with ThreadPoolExecutor(max_workers=workers) as ex:
        return sum(ex.map(one, bands.items()))


def run(variable: str, inputs: Path, out: Path, grid_csv: Path, dtype,
        start: str | None, end: str | None, workers: int, max_months: int | None,
        resume: bool = False, restart: bool = False,
        precip_method: str = PRECIP_METHOD_RATIO_LENZ,
        mar_smooth_km: float = DEFAULT_SMOOTH_KM,
        era_offset_dir: Path | None = None):
    """`mar_smooth_km` low-passes the climatology on the GRID SIDE ONLY.

    The asymmetry is deliberate and was measured on 2026-08-17. Smoothing both
    sides costs 4.7% of the national rainfall level, and 3.56 of those points are
    baked in by construction: the ratio method scales output by
    `grid_MAR / station_MAR`, and smoothing moves those two in opposite
    directions — station MAR **+3.01%**, grid MAR **-0.66%**.

    Station MAR rises because rain gauges preferentially occupy sheltered, locally
    dry sites (valley floors, towns, airfields), so a low-pass pulls each one up
    toward its wetter surroundings. The effect scales with how dry the site is:
    **+4.16%** below 1,000 mm/yr against **+1.40%** above 4,000.

    **The bake-off cannot see this.** It scores at station locations, where the
    same shift appears in numerator and denominator and largely cancels — which
    is why it reported bias *improving* while the national grid mean fell. Any
    future climatology change must be checked against the GRID level too, not
    only against held-out stations.

    So the denominator keeps the gauge's own point climatology (area-averaged,
    unsmoothed) and only the grid multiplier is smoothed. Residual level change
    is then the -0.66% that is genuine peak compression.
    """
    # Cheap era-offset guards first — the field itself cannot be validated until
    # the grid template exists, but these two need nothing and a wrong invocation
    # should not cost a minute of basis build before it is told so.
    if era_offset_dir is not None:
        if variable == "rainfall":
            raise SystemExit(
                "--era-offset is temperature only. Rainfall is deliberately "
                "published UNCORRECTED: the DB has ~838 gauges against CLIFLO's "
                "~343, so correcting toward CLIFLO would be correcting toward "
                "the worse network.")
        if MODEL_VERSION == ARCHIVE_MODEL_VERSION:
            raise SystemExit(
                f"--era-offset with the archive's own model_version "
                f"({ARCHIVE_MODEL_VERSION}). A corrected surface must be "
                "distinguishable from the archive in `surface_run`, or "
                "`store.resolve` will mix the two eras in one chart. Pass "
                "--model-version tps-2.0.0-ridge-db-adj (or another distinct "
                "value).")
        if not era_offset_dir.is_dir():
            raise SystemExit(f"--era-offset {era_offset_dir} is not a directory")

    values, stations, dates = load_inputs(inputs, variable)
    log.info("[%s] %d days x %d stations, %s..%s", variable, len(dates),
             len(stations), dates[0], dates[-1])

    grid = grid_from_csv(grid_csv)
    template = RasterTemplate.build(grid["latitude"].to_numpy(float),
                                    grid["longitude"].to_numpy(float))
    res = template.resolution_m
    log.info("[%s] raster %d x %d @ ~%d m, %d land cells", variable,
             template.height, template.width, res, len(template.flat_index))

    kept, rejected = tps.screen_relevance(
        stations, grid[["latitude", "longitude"]].to_numpy(float))
    if len(rejected):
        log.warning("[%s] relevance screen dropped %d stations", variable, len(rejected))
        keep_cols = np.isin(stations["station_id"].to_numpy(), kept["station_id"].to_numpy())
        values = values[:, keep_cols]
        stations = kept.reset_index(drop=True)

    need = estimate_bytes(len(grid), len(stations), dtype)
    log.info("[%s] basis %.2f GB (%s)", variable, need / 1e9, np.dtype(dtype).name)
    t0 = time.perf_counter()
    basis = GridBasis.build(grid, stations, dtype=dtype)
    origin = (basis.lat0, basis.lon0)
    log.info("[%s] basis built in %.1f s; origin %.5f, %.5f", variable,
             time.perf_counter() - t0, *origin)

    era = None
    if era_offset_dir is not None:
        era = EraOffset.load(era_offset_dir, variable, template)

    lapse = LAPSE[variable]
    unit = UNITS[variable]
    lat = stations["latitude"].to_numpy(float)
    lon = stations["longitude"].to_numpy(float)
    elev = stations["elevation"].to_numpy(float)

    # Rainfall covariate. Sampled once for stations and once for the grid; the
    # fit divides by the former and the projection multiplies back by the
    # latter, so a uniform scale error in LENZ cancels exactly.
    is_ratio = variable == "rainfall" and precip_method == PRECIP_METHOD_RATIO_LENZ
    mar_station = mar_grid = None
    if is_ratio:
        if not LENZ_MAR.exists():
            raise SystemExit(f"ratio_lenz needs the LENZ raster at {LENZ_MAR}")
        log.info("[%s] method=%s, climatology=%s, smooth_km=%g (grid only)",
                 variable, precip_method, LENZ_MAR.name, mar_smooth_km)
        # The low-pass is applied to the GRID multiplier only. The station
        # denominator stays area-averaged but UNSMOOTHED, and that asymmetry is
        # load-bearing — see `mar_smooth_km` in the signature for the measurement.
        clim_station = open_climatology(0.0)
        try:
            mar_station = load_mar(lat, lon, "station", clim_station)
        finally:
            clim_station.close()
        clim_grid = open_climatology(mar_smooth_km)
        try:
            mar_grid = load_mar(grid["latitude"].to_numpy(float),
                                grid["longitude"].to_numpy(float), "grid", clim_grid)
        finally:
            clim_grid.close()
    elif variable == "rainfall":
        log.warning("[%s] method=%s — NO climatology covariate. The bake-off "
                    "measured this arm as the worst of eight.", variable,
                    precip_method)

    # group day indices by calendar month
    months: dict = {}
    for i, d in enumerate(dates):
        months.setdefault(month_key(d), []).append(i)
    keys = sorted(months)
    if start:
        sy, sm = (int(x) for x in start.split("-")); keys = [k for k in keys if k >= (sy, sm)]
    if end:
        ey, em = (int(x) for x in end.split("-")); keys = [k for k in keys if k <= (ey, em)]
    if max_months:
        keys = keys[:max_months]
    # `all_keys` is the full span this invocation is responsible for. `keys` is
    # trimmed by a resume, so the records layer's valid_at range must come from
    # `all_keys` or a resumed run would mislabel it as starting mid-history.
    all_keys = list(keys)
    log.info("[%s] %d months: %s .. %s", variable, len(all_keys), all_keys[0],
             all_keys[-1])

    n_cells = len(template.flat_index)
    stats_csv = out / variable / "validation_stats.csv"
    fingerprint = _fingerprint(variable, lapse, res, n_cells, origin,
                               len(stations), dtype)
    # Same argument as dtype: resuming across a method change would weld
    # ratio_lenz months to raw months inside one variable's history.
    fingerprint["precip_method"] = precip_method if variable == "rainfall" else None
    # The conditioning of the climatology changes every rainfall value, so a
    # resume across a smoothing change would weld two different models together
    # inside one variable's history exactly as a method change would.
    fingerprint["mar_smooth_km"] = mar_smooth_km if is_ratio else None
    # The strongest reason of the lot to be in here. A resume that gained or lost
    # the correction — or picked up a REBUILT field — would leave one variable's
    # history half on the archive scale and half on the DB scale, with a step of
    # up to ~1.5 degC in the middle of it and nothing downstream able to see it.
    # The digest is over the field VALUES, so a retrained field of the same name
    # is caught too.
    fingerprint["era_offset"] = era.meta["sha256"] if era else None
    ckpt_dir, _, ckpt_json = _ckpt_paths(out, variable)

    if restart:
        clear_checkpoint(out, variable)
        if stats_csv.exists():
            stats_csv.unlink()
    elif not resume and ckpt_json.exists():
        raise SystemExit(
            f"an incomplete run is checkpointed at {ckpt_dir}.\n"
            f"  --resume   continue from the last committed month\n"
            f"  --restart  discard it and refit from the beginning")

    records = M.RecordAccumulator(n_cells)
    manifest, skipped = [], []
    # Zero in every cell for the first month of a chain. Scalar 0 would also
    # broadcast correctly, but naming the shape here keeps the per-cell contract
    # visible at the top of the loop.
    dry_carry = np.zeros(n_cells, dtype=np.float32)
    total_bytes = 0
    n_stats_rows = 0
    resumed_after = None

    if resume:
        records, state = load_checkpoint(out, variable, n_cells, fingerprint)
        manifest, skipped = state["manifest"], state["skipped"]
        if state["dry_carry"] is not None:
            dry_carry = state["dry_carry"]
        total_bytes, n_stats_rows = state["total_bytes"], state["n_stats_rows"]
        last_key = tuple(state["last_key"])
        resumed_after = "%04d-%02d" % last_key
        truncate_stats(stats_csv, n_stats_rows)
        keys = [k for k in keys if k > last_key]
        log.warning("[%s] RESUMING after %04d-%02d — %d months done, %d to go",
                    variable, last_key[0], last_key[1], len(manifest), len(keys))
        if not keys:
            log.warning("[%s] every month already done; finalising only", variable)

    # The run's own immutable evidence. Opened HERE — after the resume
    # decision, before a single month is fitted — so that the network and the
    # code survive a kill at 1%, which is exactly when they are hardest to
    # reconstruct afterwards.
    record = RunRecord(out / variable)
    code = _code_digest(CODE_MODULES)
    if resume:
        warn_if_code_changed(latest_record(out / variable), code)
    window_idx = sorted(i for k in all_keys for i in months[k])
    record.open({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "variable": variable,
        "argv": sys.argv,
        "parameters": {
            "inputs": str(inputs), "out": str(out), "grid": str(grid_csv),
            "dtype": np.dtype(dtype).name, "workers": workers,
            "start": start, "end": end, "months": max_months,
            "resume": resume, "restart": restart,
            "model_version": MODEL_VERSION,
            "contract_version": CONTRACT_VERSION,
            "lapse_rate": float(lapse), "resolution_m": int(res),
            "n_cells": int(n_cells),
            "origin": [float(origin[0]), float(origin[1])],
            "relevance_km": tps.DEFAULT_RELEVANCE_KM,
            "max_z_error": DEFAULT_MAX_Z_ERROR.get(variable),
            "precip_method": precip_method if variable == "rainfall" else None,
            "mar_smooth_km": mar_smooth_km if is_ratio else None,
            "era_offset_dir": str(era_offset_dir) if era_offset_dir else None},
        "fingerprint": fingerprint,
        "code": {"digest": code, "git": _git_revision()},
        "environment": _environment(),
        "network": {"n_in_fit": int(len(stations)),
                    "n_rejected": int(len(rejected)),
                    "snapshot": "stations.csv"},
        "window": {"first_month": "%04d-%02d" % all_keys[0],
                   "last_month": "%04d-%02d" % all_keys[-1],
                   "n_months": len(all_keys), "n_days": len(window_idx),
                   "n_months_this_invocation": len(keys),
                   "resumed_after": resumed_after},
        "era_offset": era.meta if era else None})
    write_station_snapshot(record.dir / "stations.csv", stations, values,
                           window_idx, dates, rejected)

    done_offset = len(manifest)
    t_fit = t_proj = t_write = 0.0
    t_run = time.perf_counter()

    for ki, (y, mo) in enumerate(keys):
        month_rows: list = []
        idx = months[(y, mo)]
        coeff_cols, day_numbers = [], []

        t0 = time.perf_counter()
        for i in idx:
            row = values[i]
            ok = np.isfinite(row)
            if ok.sum() < 4:
                skipped.append({"date": dates[i].isoformat(), "n_stations": int(ok.sum()),
                                "reason": "fewer than 4 reporting stations"})
                continue
            vals = row[ok].astype(float)
            if is_ratio:
                vals = vals / mar_station[ok]      # dimensionless, ~O(1/365)
            df = pd.DataFrame({"station_id": stations["station_id"].to_numpy()[ok],
                               "latitude": lat[ok], "longitude": lon[ok],
                               "elevation": elev[ok], "value": vals})
            try:
                fit = tps.fit_surface(df, "value", lapse_rate=lapse, engine="ridge",
                                      origin=origin)
            except Exception as exc:                              # noqa: BLE001
                skipped.append({"date": dates[i].isoformat(),
                                "n_stations": int(ok.sum()), "reason": str(exc)})
                continue
            cols = basis.index_of(fit.fit_stations["station_id"].tolist())
            coeff_cols.append(basis.coefficient_vector(cols, fit.model.c, fit.model.d))
            day_numbers.append(dates[i].day)
            month_rows.append({
                "valid_at": dates[i].isoformat(), "variable": variable,
                "n_fit": fit.n_fit, "n_test": fit.n_test, "cv_rmse": fit.cv_rmse,
                "rmse": fit.rmse, "t_rmse": fit.t_rmse, "edf": fit.edf,
                "edf_fraction": fit.edf_fraction, "lambda": fit.smoothing,
                # Under ratio_lenz the spline is fitted on rainfall/MAR, so every
                # error statistic above is DIMENSIONLESS, not mm. Labelled rather
                # than rescaled: converting needs per-station residuals weighted
                # by each station's own MAR, which `fit_surface` does not expose,
                # and a single scale factor would be a fabricated number.
                "cv_units": "ratio" if is_ratio else unit})
        t_fit += time.perf_counter() - t0

        if not coeff_cols:
            log.warning("[%s] %04d-%02d: no fittable days, skipping month",
                        variable, y, mo)
            continue

        t0 = time.perf_counter()
        block = basis.project(np.column_stack(coeff_cols), lapse_rate=lapse)
        if is_ratio:
            # Back to millimetres BEFORE any statistic is computed. Every band —
            # wet_days, the threshold counts, wet_top1..5, max_dry_spell — is
            # defined on mm, so reducing the ratio field first would silently
            # produce counts against a 1 mm threshold in ratio space.
            block *= mar_grid[:, None]
        if variable == "rainfall":
            # A smoothing spline overshoots into negatives around dry cells
            # bordering wet ones. Rainfall cannot be negative, and a negative
            # would corrupt `sum` and `max_dry_spell` in opposite directions.
            np.maximum(block, 0.0, out=block)
        if era is not None:
            # THE point of this path. Correct every day, then reduce — so the
            # threshold counts (frost_days, days_over_25/30) are counted against
            # corrected temperatures and come out right by construction, instead
            # of being unpublishable because a post-hoc shift cannot move a count.
            #
            # One field per CALENDAR month, so the whole block takes the same
            # vector: a month never spans two fields.
            block -= era.for_month(mo)[:, None]
        t_proj += time.perf_counter() - t0

        result = M.monthly_stats(block.astype(np.float32, copy=False), variable,
                                 day_numbers, dry_run_carry_in=dry_carry)
        if result.dry_run_carry_out is not None:
            dry_carry = result.dry_run_carry_out
        records.update(result, date(y, mo, 1).toordinal(), EPOCH.toordinal())
        del block

        month_cv = float(np.mean([r["cv_rmse"] for r in month_rows]))
        tags = {"variable": variable, "granularity": "monthly",
                "valid_at": f"{y}-{mo:02d}", "resolution_m": res,
                "model_version": MODEL_VERSION, "engine": "ridge",
                "contract_version": CONTRACT_VERSION,
                "lapse_rate_c_per_100m": lapse, "n_days": result.n_days,
                "days_in_month": monthrange(y, mo)[1],
                "mean_cv_rmse": round(month_cv, 4),
                "cv_units": "ratio" if is_ratio else unit,
                "projection_origin": f"{basis.lat0:.5f},{basis.lon0:.5f}",
                **({"precip_method": precip_method,
                    "mar_smooth_km": mar_smooth_km,
                    "climatology": "LENZ/NZEnvDS total annual precipitation v1.0 "
                                   "(Landcare Research, CC BY 4.0)"}
                   if is_ratio else {}),
                **(era.tags() if era else {})}
        paths = {n: out_path(out, variable, y, mo, res, n) for n in result.bands}
        t0 = time.perf_counter()
        total_bytes += write_bands(result.bands, template, paths, tags, unit, workers)
        t_write += time.perf_counter() - t0

        manifest.append({"valid_at": f"{y}-{mo:02d}", "n_days": result.n_days,
                         "days_in_month": monthrange(y, mo)[1],
                         "mean_cv_rmse": round(month_cv, 4),
                         "statistics": list(result.bands),
                         "resolution_m": res})

        # Commit. COGs are already on disk; append this month's fit statistics,
        # then replace state.json. Everything before this line is redone on a
        # resume, so it must all be idempotent — and it is: the COGs overwrite.
        append_stats(stats_csv, month_rows)
        n_stats_rows += len(month_rows)
        save_checkpoint(out, variable, records=records, manifest=manifest,
                        skipped=skipped, dry_carry=dry_carry,
                        total_bytes=total_bytes, last_key=(y, mo),
                        n_stats_rows=n_stats_rows, fingerprint=fingerprint)

        if ki % 12 == 0 or ki == len(keys) - 1:
            done_now = ki + 1
            rate = (time.perf_counter() - t_run) / done_now
            log.info("[%s] %04d-%02d  %d/%d months  %.1f s/month  eta %.0f min  "
                     "cv %.3f", variable, y, mo, done_offset + done_now,
                     len(all_keys), rate, rate * (len(keys) - done_now) / 60,
                     month_cv)

    # ---- records layer ----------------------------------------------------
    rec = records.bands()
    rec_dir = out / "surfaces" / CONTRACT_VERSION / variable / "records"
    rpaths = {n: rec_dir / f"{variable}_records_{res}m_{n}.tif" for n in rec}
    rtags = {"variable": variable, "granularity": "records",
             "valid_at": f"{all_keys[0][0]}-{all_keys[0][1]:02d}/"
                         f"{all_keys[-1][0]}-{all_keys[-1][1]:02d}",
             "resolution_m": res, "model_version": MODEL_VERSION,
             "contract_version": CONTRACT_VERSION,
             "date_epoch": EPOCH.isoformat(),
             "note": "*_day bands are days since date_epoch",
             **(era.tags() if era else {})}
    total_bytes += write_bands(rec, template, rpaths, rtags, unit, workers)

    # `validation_stats.csv` was built up month by month, so read it back rather
    # than rebuilding it from memory — on a resumed run memory only holds the
    # months fitted since the resume.
    stats = pd.read_csv(stats_csv)
    (out / variable / "manifest.json").write_text(json.dumps({
        "variable": variable, "unit": unit, "granularity": "monthly",
        "contract_version": CONTRACT_VERSION, "model_version": MODEL_VERSION,
        "resolution_m": res, "lapse_rate": lapse,
        "cv_units": "ratio" if is_ratio else unit,
        **({"era_offset": {
            **era.meta,
            "stage": "applied to daily grid values before the monthly reduction",
            "why": "a temperature offset cannot be applied to a day count, so "
                   "correcting after the reduction leaves frost_days, "
                   "first_frost_day, last_frost_day, days_over_25 and "
                   "days_over_30 unpublishable for the corrected era",
            "invariant_bands": ["sd", "argmin_day", "argmax_day"],
            "invariant_note": "the field is constant per cell within a calendar "
                              "month, so a dispersion and a day index cannot "
                              "move. The one exception is an exact tie: about "
                              "one cell in 1.4M per month has two days at the "
                              "month's extreme within float32 epsilon, and the "
                              "correction can pick the other one. The extreme "
                              "VALUE is identical; only the index differs",
            "note": "cv_rmse and every other fit statistic are UNCORRECTED by "
                    "design — they measure the spline against its own stations, "
                    "not the reconciliation between two networks"}}
           if era else {}),
        **({"precip_method": precip_method,
            "climatology": {
                "name": "LENZ/NZEnvDS Total annual precipitation v1.0",
                "source": "Landcare Research (LRIS portal)",
                "licence": "CC BY 4.0 - attribution required in the product",
                "conditioning": {
                    "area_averaged_to_m": res,
                    "gaussian_smooth_km": mar_smooth_km,
                    "space": "log",
                    "why": "the source raster carries fitting artefacts at 100 m "
                           "(a caustic at Mt Taranaki, a saturated plateau at "
                           "Fox/Franz Josef) that the ratio method would reprint "
                           "into every daily surface"},
                "note": "covariate only; every value derives from our own gauge "
                        "record. cv_rmse is dimensionless (rainfall/MAR)."}}
           if is_ratio else {}),
        "first": manifest[0]["valid_at"], "last": manifest[-1]["valid_at"],
        "n_months": len(manifest), "n_days_fitted": len(stats),
        "n_days_skipped": len(skipped), "skipped": skipped[:200],
        "statistics": list(rec) + list(M.expected_bands(variable)),
        "cv_rmse": {"median": float(stats["cv_rmse"].median()),
                    "mean": float(stats["cv_rmse"].mean()),
                    "p90": float(stats["cv_rmse"].quantile(0.9)),
                    "max": float(stats["cv_rmse"].max())},
        "months": manifest,
    }, indent=2))

    clear_checkpoint(out, variable)            # only a complete run clears it

    elapsed = time.perf_counter() - t_run
    log.info("[%s] DONE %.1f min — fit %.0f%%, project %.0f%%, write %.0f%%",
             variable, elapsed / 60, 100 * t_fit / elapsed, 100 * t_proj / elapsed,
             100 * t_write / elapsed)
    log.info("[%s] %d months, %d days fitted, %d skipped, %.2f GB",
             variable, len(manifest), len(stats), len(skipped), total_bytes / 1e9)
    log.info("[%s] cv_rmse median %.3f  mean %.3f  p90 %.3f  max %.3f", variable,
             stats["cv_rmse"].median(), stats["cv_rmse"].mean(),
             stats["cv_rmse"].quantile(0.9), stats["cv_rmse"].max())

    # Copies `manifest.json` and `validation_stats.csv` in and stamps the record
    # complete. From here the working copy is free to be overwritten by the next
    # run; this directory is not.
    record.close({
        "n_months": len(manifest), "n_days_fitted": int(len(stats)),
        "n_days_skipped": len(skipped), "bytes": int(total_bytes),
        "cv_units": "ratio" if is_ratio else unit,
        "cv_rmse": {"median": float(stats["cv_rmse"].median()),
                    "mean": float(stats["cv_rmse"].mean()),
                    "p90": float(stats["cv_rmse"].quantile(0.9)),
                    "max": float(stats["cv_rmse"].max())},
        "timings_s": {"fit": round(t_fit, 1), "project": round(t_proj, 1),
                      "write": round(t_write, 1), "total": round(elapsed, 1)}})
    log.info("[%s] run record complete: %s", variable, record.dir)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variable", required=True, choices=sorted(UNITS))
    ap.add_argument("--model-version", default=MODEL_VERSION,
                    help="stamped into manifest + surface_run tags; use a DISTINCT "
                         "value for DB-sourced live-era runs (default: %(default)s)")
    ap.add_argument("--inputs", default=str(DEFAULT_INPUTS))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--grid", default=str(DEFAULT_GRID))
    ap.add_argument("--dtype", choices=["float32", "float64"], default="float64")
    ap.add_argument("--start", help="YYYY-MM inclusive")
    ap.add_argument("--end", help="YYYY-MM inclusive")
    ap.add_argument("--months", type=int, help="cap month count (smoke test)")
    ap.add_argument("--workers", type=int, default=5, help="concurrent COG writes")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--resume", action="store_true",
                   help="continue from the last committed month")
    g.add_argument("--restart", action="store_true",
                   help="discard any checkpoint and refit from the beginning "
                        "(the previous run's immutable record under _runs/ is "
                        "not touched)")
    ap.add_argument("--precip-method",
                    choices=[PRECIP_METHOD_RATIO_LENZ, PRECIP_METHOD_RAW],
                    default=PRECIP_METHOD_RATIO_LENZ,
                    help="rainfall only; ratio_lenz is the bake-off winner")
    ap.add_argument("--mar-smooth-km", type=float, default=DEFAULT_SMOOTH_KM,
                    help="low-pass applied to the LENZ climatology before it is "
                         "used as the covariate; 0 disables it and reprints the "
                         "raster's own fitting artefacts into every surface")
    ap.add_argument("--era-offset", type=Path, default=None, metavar="DIR",
                    help="directory of era_offset.py fields; subtracted from "
                         "DAILY grid values before the monthly reduction, so the "
                         "threshold counts are correct by construction. "
                         "Temperature only, and requires a distinct "
                         "--model-version")
    args = ap.parse_args()

    _set_model_version(args.model_version)
    run(args.variable, Path(args.inputs), Path(args.out), Path(args.grid),
        getattr(np, args.dtype), args.start, args.end, args.workers, args.months,
        resume=args.resume, restart=args.restart,
        precip_method=args.precip_method, mar_smooth_km=args.mar_smooth_km,
        era_offset_dir=args.era_offset)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
