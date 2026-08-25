#!/usr/bin/env python3
"""MfE 2024 climate projections composed onto our own 1986-2005 normals.

    projected = our normal (500 m, our station network)
                composed with
                MfE change field (5.5 km, CMIP6/CCAM multi-model mean)

Our surface supplies the spatial detail; MfE supplies only the climate signal.
`bp1986-2005` is exactly the baseline the Pro page uses, so the deltas compose
with **no rebasing step and no dependence on MfE's `base` field at all**. The
`bp1995-2014` arm is ignored entirely.

## The composition rule is NOT the same for every variable

Determined by measurement, not by reading the filenames. For a COUNT the annual
change equals the SUM of the four seasonal changes; for an INTENSIVE quantity it
equals their MEAN. Measured on ssp245 fp2041-2060:

    FD    ANN -14.117   sum(seasons) -14.117   mean(seasons)  -3.529   -> count
    TX25  ANN +11.475   sum(seasons) +11.433   mean(seasons)  +2.858   -> count
    T     ANN  +1.301   sum(seasons)  +5.196   mean(seasons)  +1.299   -> intensive
    PR    ANN  -0.357   sum(seasons)  -1.490   mean(seasons)  -0.372   -> intensive

**PR behaves like T, so PR's `change` is a PERCENTAGE, not millimetres.** Its
base is ~1,297 mm/yr; adding -0.357 as mm would be a 0.03% adjustment - a silent
near-no-op publishing "rainfall barely moves" when the model says -3.9%
nationally by 2080-2099 with a -11%..+14% spread. Rainfall therefore composes
MULTIPLICATIVELY.

## Sea is NaN, and that is a trap twice over

`nodata` is UNSET on every MfE raster, so the ocean is NaN. Mask with
`np.isfinite`, never with a sentinel comparison - the same class of bug as
`NaN <> NaN` being FALSE in Postgres, where the test finds nothing and the sea
enters the statistics unnoticed.

The second half is resampling. Bilinear interpolation from a 5.5 km grid whose
sea is NaN pulls NaN inland across every coastal cell, and our 500 m coastline
is 11x finer than theirs. So the MfE field is **nearest-neighbour filled across
the whole rectangle BEFORE resampling**, and our own land mask is applied
afterwards. A coastal cell then takes the nearest valid climate signal, which
for a field this smooth is the right answer rather than a hole.

Resample the DELTA, never the absolute: the delta is smooth at 5.5 km and the
absolute is not.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Iterable, Optional

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.interpolation import raster as R  # noqa: E402
from scripts.interpolation import normals as N  # noqa: E402

from scripts.interpolation.runrecord import (             # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

logger = logging.getLogger(__name__)

MFE_ROOT = Path(r"Z:\Data\NZ_Climate_Projections_MfE_GeoTIFF")
DEFAULT_NORMALS = Path("scratchpad/projections/normals")
DEFAULT_OUT = Path("scratchpad/projections/surfaces")

BASELINE = "bp1986-2005"
BASELINE_LABEL = "1986-2005"

ADDITIVE = "additive"          # ours + delta
MULTIPLICATIVE = "multiplicative"   # ours * (1 + pct/100)
RATIO = "ratio"                # ours * (1 + change/base)

# our (variable, statistic) -> MfE variable, composition rule, floor
#
# `floor` clamps the composed field. A projected count of frost nights cannot be
# negative, and a projected rainfall total cannot be either. Temperature has no
# floor - a projected -5 degC winter minimum in the Southern Alps is real.
MAPPING: dict[tuple[str, str], dict] = {
    ("temp_mean", "mean"): dict(mfe="T", rule=ADDITIVE, floor=None, unit="C"),
    ("temp_min", "mean"): dict(mfe="TN", rule=ADDITIVE, floor=None, unit="C"),
    ("temp_max", "mean"): dict(mfe="TX", rule=ADDITIVE, floor=None, unit="C"),
    ("rainfall", "sum"): dict(mfe="PR", rule=MULTIPLICATIVE, floor=0.0, unit="mm"),
    ("temp_min", "frost_days"): dict(mfe="FD", rule=ADDITIVE, floor=0.0, unit="days"),
    ("temp_max", "days_over_25"): dict(mfe="TX25", rule=ADDITIVE, floor=0.0, unit="days"),
    ("temp_max", "days_over_30"): dict(mfe="TX30", rule=ADDITIVE, floor=0.0, unit="days"),
    # GDD10 is ANN-only in the MfE set while ours is a Sep-Apr season. The
    # obvious route - a fractional ratio against MfE's own ANN base - was
    # MEASURED to overstate the seasonal change by 2.4% in one direction, so
    # gdd10 is built by `build_gdd` instead and is deliberately absent from the
    # `build` loop. The entry stays here to document the rejected rule.
    ("gdd10", "cumulative"): dict(mfe="GDD10", rule=RATIO, floor=0.0, unit="GDD"),
}

SEASONS = ("ANN", "DJF", "MAM", "JJA", "SON")
SCENARIOS = ("ssp126", "ssp245", "ssp370")
PERIODS = ("fp2021-2040", "fp2041-2060", "fp2080-2099", "wl1.5", "wl2", "wl3")


# --- MfE side ---------------------------------------------------------------

def mfe_path(var: str, scenario: str, kind: str, season: str,
             period: Optional[str] = None, root: Path = MFE_ROOT) -> Path:
    """Build a filename from the MfE grammar.

    `base` files carry no period token; `change` files do. Getting that wrong
    produces a path that simply does not exist, which is the failure mode we
    want - a wrong-but-present file would compose silently.
    """
    if kind == "base":
        stem = f"{var}_historical_MMM_CCAM_base_{BASELINE}_{season}_NZ5km"
    elif kind == "change":
        if period is None:
            raise ValueError("a change field needs a period")
        stem = (f"{var}_{scenario}_MMM_CCAM_change_{period}_"
                f"{BASELINE}_{season}_NZ5km")
    else:
        raise ValueError(f"kind must be base or change, got {kind!r}")
    return root / f"{stem}.tif"


def read_mfe(path: Path) -> tuple[np.ndarray, dict]:
    """Read one MfE raster. Sea comes back as NaN and stays NaN."""
    R._configure_proj()
    import rasterio

    with rasterio.open(path) as ds:
        arr = ds.read(1).astype(np.float64)
        profile = {"crs": ds.crs, "transform": ds.transform,
                   "height": ds.height, "width": ds.width,
                   "nodata": ds.nodata, "bounds": ds.bounds}
    if profile["nodata"] is not None:
        arr = np.where(arr == profile["nodata"], np.nan, arr)
    return arr, profile


def fill_nearest(arr: np.ndarray) -> np.ndarray:
    """Extend valid values over the whole rectangle by nearest neighbour.

    Done BEFORE resampling so bilinear interpolation never averages a NaN into
    a coastal cell. On a 243x260 grid this is instant.
    """
    from scipy import ndimage

    valid = np.isfinite(arr)
    if valid.all():
        return arr
    if not valid.any():
        raise ValueError("MfE raster is entirely NaN")
    _, idx = ndimage.distance_transform_edt(~valid, return_indices=True)
    return arr[tuple(idx)]


def to_our_grid(arr: np.ndarray, src_profile: dict,
                template: "R.RasterTemplate") -> np.ndarray:
    """Resample a filled MfE field onto our 500 m template, bilinear."""
    R._configure_proj()
    from rasterio.warp import reproject, Resampling

    dst = np.empty((template.height, template.width), dtype=np.float64)
    reproject(
        source=arr,
        destination=dst,
        src_transform=src_profile["transform"],
        src_crs=src_profile["crs"],
        dst_transform=template.transform,
        dst_crs="EPSG:4326",
        resampling=Resampling.bilinear,
    )
    return dst


def load_field(var: str, scenario: str, kind: str, season: str,
               period: Optional[str], template: "R.RasterTemplate",
               root: Path = MFE_ROOT) -> np.ndarray:
    """MfE field, filled and resampled onto our grid."""
    path = mfe_path(var, scenario, kind, season, period, root=root)
    if not path.exists():
        raise FileNotFoundError(path)
    arr, profile = read_mfe(path)
    return to_our_grid(fill_nearest(arr), profile, template)


# --- our side ---------------------------------------------------------------

def normal_path(variable: str, statistic: str, season: str,
                root: Path = DEFAULT_NORMALS) -> Path:
    return (root / variable / "normal" / BASELINE_LABEL /
            f"{variable}_normal_{BASELINE_LABEL}_{season}_500m_{statistic}.tif")


def read_normal(variable: str, statistic: str, season: str,
                root: Path = DEFAULT_NORMALS
                ) -> tuple[np.ndarray, np.ndarray, "R.RasterTemplate"]:
    path = normal_path(variable, statistic, season, root)
    if not path.exists():
        raise FileNotFoundError(
            f"{path} - build it first with normals.py")
    template, land = N._template_from(path)
    arr, _ = N._read(path)
    return arr.astype(np.float64), land, template


# --- composition ------------------------------------------------------------

def compose(ours: np.ndarray, change: np.ndarray, rule: str,
            base: Optional[np.ndarray] = None,
            floor: Optional[float] = None) -> np.ndarray:
    if rule == ADDITIVE:
        out = ours + change
    elif rule == MULTIPLICATIVE:
        out = ours * (1.0 + change / 100.0)
    elif rule == RATIO:
        if base is None:
            raise ValueError("the ratio rule needs MfE's base field")
        # Guard the denominator: GDD10 base runs down to 0.008 on the highest
        # alpine cells, where a fractional change is meaningless and would
        # explode. Those cells carry essentially no growing degree days in
        # either era, so a zero change is the honest answer.
        with np.errstate(divide="ignore", invalid="ignore"):
            frac = np.where(base > 1.0, change / base, 0.0)
        out = ours * (1.0 + frac)
    else:
        raise ValueError(f"unknown rule {rule!r}")
    if floor is not None:
        out = np.maximum(out, floor)
    return out


# --- measurements -----------------------------------------------------------

def compare_base(root: Path = MFE_ROOT, normals_root: Path = DEFAULT_NORMALS,
                 seasons: Iterable[str] = SEASONS) -> list[dict]:
    """Commensurability: MfE's own 1986-2005 base against ours, cell by cell.

    The single most informative check available before anything composes. It is
    NOT independent validation - both are models over an overlapping station
    record - so it bounds disagreement rather than confirming truth. A large
    gap would mean the delta method is standing on sand.
    """
    rows = []
    for (variable, statistic), spec in MAPPING.items():
        if variable == "gdd10":
            continue  # handled by gdd_check, different season convention
        for season in seasons:
            try:
                ours, land, template = read_normal(variable, statistic, season,
                                                   normals_root)
            except FileNotFoundError as exc:
                logger.warning("skip %s/%s %s: %s", variable, statistic,
                               season, exc)
                continue
            theirs = load_field(spec["mfe"], "historical", "base", season,
                                None, template, root=root)
            d = (ours - theirs)[land]
            o, t = ours[land], theirs[land]
            rows.append({
                "variable": variable, "statistic": statistic,
                "mfe": spec["mfe"], "season": season,
                "ours_median": float(np.median(o)),
                "mfe_median": float(np.median(t)),
                "bias": float(np.mean(d)),
                "median_diff": float(np.median(d)),
                "rmse": float(np.sqrt(np.mean(d ** 2))),
                "p5": float(np.percentile(d, 5)),
                "p95": float(np.percentile(d, 95)),
                "corr": float(np.corrcoef(o, t)[0, 1]),
            })
            r = rows[-1]
            logger.info(
                "%-10s %-13s %-4s  ours %9.3f  mfe %9.3f  bias %+8.3f  "
                "rmse %8.3f  r %.4f",
                variable, statistic, season, r["ours_median"],
                r["mfe_median"], r["bias"], r["rmse"], r["corr"])
    return rows


# --- GDD10: is the fractional change season-invariant? ----------------------
#
# MfE publishes GDD10 as `ANN` only - a calendar-year accumulation - while ours
# is a Sep-Apr season labelled by its end year. The ratio rule assumes the
# FRACTIONAL change is the same for both windows. That is plausible (almost all
# GDD10 accrues inside Sep-Apr) but it is an assumption, and the cost of it
# being wrong is the same shape as the partial-vintage bug. So it is measured.
#
# The measurement uses MfE's own SEASONAL T deltas, which do exist, pushed
# through our own monthly mean+sd climatology and the same normal-CDF GDD
# formula the archive uses. That yields a projected GDD10 for each window
# WITHOUT needing a seasonal GDD10 field from MfE.

MONTH_SEASON = {12: "DJF", 1: "DJF", 2: "DJF",
                3: "MAM", 4: "MAM", 5: "MAM",
                6: "JJA", 7: "JJA", 8: "JJA",
                9: "SON", 10: "SON", 11: "SON"}

# Mean length of each calendar month over 1986-2005. February carries 5 leap
# years in 20, so 28.25 - the same quarter-day the zone season roll-up already
# accounts for.
MONTH_DAYS = {1: 31, 2: 28.25, 3: 31, 4: 30, 5: 31, 6: 30,
              7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}

SEPAPR_MONTHS = (9, 10, 11, 12, 1, 2, 3, 4)


def _monthly_climatology(archive: Path, baseline: tuple[int, int],
                         land: np.ndarray) -> dict[int, tuple[np.ndarray, np.ndarray]]:
    """Per-calendar-month mean and sd of temp_mean over the baseline window."""
    lo, hi = baseline
    out = {}
    for month in range(1, 13):
        mus, sds = [], []
        for year in range(lo, hi + 1):
            pm = N._month_path(archive, "temp_mean", "mean", year, month)
            ps = N._month_path(archive, "temp_mean", "sd", year, month)
            if not (pm.exists() and ps.exists()):
                raise FileNotFoundError(f"{pm} / {ps}")
            mus.append(N._read(pm)[0].astype(np.float64))
            sds.append(N._read(ps)[0].astype(np.float64))
        out[month] = (np.mean(mus, axis=0), np.mean(sds, axis=0))
        logger.info("  climatology month %02d  mu med %.3f  sd med %.3f",
                    month, float(np.median(out[month][0][land])),
                    float(np.median(out[month][1][land])))
    return out


def gdd_check(scenario: str, period: str, *,
              archive: Path = N.DEFAULT_ARCHIVE,
              root: Path = MFE_ROOT,
              normals_root: Path = DEFAULT_NORMALS,
              baseline: tuple[int, int] = N.DEFAULT_BASELINE,
              base_temp: float = 10.0) -> dict:
    from scripts.interpolation.gdd_season import gdd_from_normal

    ref = N._month_path(archive, "temp_mean", "mean", baseline[0], 1)
    template, land = N._template_from(ref)

    logger.info("building monthly mean+sd climatology %d-%d", *baseline)
    clim = _monthly_climatology(archive, baseline, land)

    deltas = {}
    for season in ("DJF", "MAM", "JJA", "SON"):
        deltas[season] = load_field("T", scenario, "change", season, period,
                                    template, root=root)

    base_m, proj_m = {}, {}
    for month in range(1, 13):
        mu, sd = clim[month]
        n = MONTH_DAYS[month]
        base_m[month] = gdd_from_normal(mu, sd, n, base_temp)
        proj_m[month] = gdd_from_normal(mu + deltas[MONTH_SEASON[month]], sd,
                                        n, base_temp)

    base_ann = sum(base_m[m] for m in range(1, 13))
    proj_ann = sum(proj_m[m] for m in range(1, 13))
    base_sep = sum(base_m[m] for m in SEPAPR_MONTHS)
    proj_sep = sum(proj_m[m] for m in SEPAPR_MONTHS)

    # Restrict to cells that actually grow anything. A fractional change on a
    # cell with 3 GDD a year is arithmetic noise, not a viticultural statement,
    # and averaging it in would swamp the result with alpine rock.
    grow = land & (base_ann > 100.0)
    logger.info("cells with base ANN GDD10 > 100: %s of %s",
                f"{int(grow.sum()):,}", f"{int(land.sum()):,}")

    frac_ann = (proj_ann[grow] / base_ann[grow]) - 1.0
    frac_sep = (proj_sep[grow] / base_sep[grow]) - 1.0
    gap = frac_sep - frac_ann
    leak = 1.0 - (base_sep[grow] / base_ann[grow])

    # Independent cross-check: our reconstructed ANNUAL fractional change
    # against MfE's own GDD10 change/base. If these disagree badly, the
    # reconstruction is wrong and the season comparison means nothing.
    mfe_base = load_field("GDD10", "historical", "base", "ANN", None,
                          template, root=root)
    mfe_chg = load_field("GDD10", scenario, "change", "ANN", period,
                         template, root=root)
    ok = grow & (mfe_base > 100.0)
    mfe_frac = (mfe_chg[ok] / mfe_base[ok])
    ours_frac = (proj_ann[ok] / base_ann[ok]) - 1.0

    res = {
        "scenario": scenario, "period": period, "base": base_temp,
        "n_cells": int(grow.sum()),
        "sepapr_share_of_annual_median": float(np.median(1.0 - leak)),
        "mayaug_leak_median": float(np.median(leak)),
        "mayaug_leak_p95": float(np.percentile(leak, 95)),
        "frac_ann_median": float(np.median(frac_ann)),
        "frac_sepapr_median": float(np.median(frac_sep)),
        "gap_median": float(np.median(gap)),
        "gap_p5": float(np.percentile(gap, 5)),
        "gap_p95": float(np.percentile(gap, 95)),
        "gap_absmax": float(np.max(np.abs(gap))),
        "mfe_frac_median": float(np.median(mfe_frac)),
        "ours_frac_median": float(np.median(ours_frac)),
        "reconstruction_gap_median": float(np.median(ours_frac - mfe_frac)),
    }

    logger.info("")
    logger.info("=== GDD10 season-invariance, %s %s ===", scenario, period)
    logger.info("Sep-Apr share of annual GDD10 : %.2f%% (May-Aug leak %.2f%%, "
                "p95 %.2f%%)",
                100 * res["sepapr_share_of_annual_median"],
                100 * res["mayaug_leak_median"], 100 * res["mayaug_leak_p95"])
    logger.info("fractional change  ANNUAL     : %+.3f%%",
                100 * res["frac_ann_median"])
    logger.info("fractional change  SEP-APR    : %+.3f%%",
                100 * res["frac_sepapr_median"])
    logger.info("GAP (sepapr - ann)            : median %+.3f%%  "
                "p5 %+.3f%%  p95 %+.3f%%  |max| %.3f%%",
                100 * res["gap_median"], 100 * res["gap_p5"],
                100 * res["gap_p95"], 100 * res["gap_absmax"])
    logger.info("cross-check vs MfE's own GDD10: ours %+.3f%%  mfe %+.3f%%  "
                "diff %+.3f%%",
                100 * res["ours_frac_median"], 100 * res["mfe_frac_median"],
                100 * res["reconstruction_gap_median"])
    return res


# --- build ------------------------------------------------------------------

# `wl3` exists for ssp370 only. Enumerating the legal pairs beats discovering it
# through 40 FileNotFoundErrors mid-run.
def combos() -> list[tuple[str, str]]:
    out = []
    for scenario in SCENARIOS:
        for period in PERIODS:
            if period == "wl3" and scenario != "ssp370":
                continue
            out.append((scenario, period))
    return out


# Direction each band must move under warming. Used as a GUARD, not as a
# correction: a handful of wrong-sign cells is MfE's own field and we carry it
# faithfully, but a large share means we have the units or the sign inverted -
# which is exactly how an era-offset field once got stamped "ADD" when it had
# to be subtracted.
EXPECT = {
    ("temp_mean", "mean"): +1, ("temp_min", "mean"): +1,
    ("temp_max", "mean"): +1,
    ("temp_min", "frost_days"): -1,
    ("temp_max", "days_over_25"): +1, ("temp_max", "days_over_30"): +1,
    ("rainfall", "sum"): 0,          # genuinely two-signed across the country
    ("gdd10", "cumulative"): +1,
}
MAX_WRONG_SIGN = 0.05

MODEL_VERSION = "mfe2024-ccam-mmm-v1"

# Hashed into every run record. These surfaces are COMPOSED, not fitted: an MfE
# change field is resampled onto our grid and combined with one of our normals.
# So the estimator is the composition rule plus the two readers on either side
# of it, and `normals.py` is in the list because it decides what "ours" means.
CODE_MODULES = ("projections.py", "normals.py", "raster.py", "gdd_season.py")


def projection_key(variable: str, statistic: str, scenario: str, period: str,
                   season: str) -> str:
    return (f"surfaces/v2/{variable}/projection/{scenario}/{period}/"
            f"{variable}_projection_{scenario}_{period}_{season}_500m_"
            f"{statistic}.tif")


def build(*, out_root: Path = DEFAULT_OUT, root: Path = MFE_ROOT,
          normals_root: Path = DEFAULT_NORMALS,
          seasons: Iterable[str] = SEASONS,
          only: Optional[set[tuple[str, str]]] = None,
          scenarios: Optional[Iterable[str]] = None,
          periods: Optional[Iterable[str]] = None) -> dict:
    pairs = [c for c in combos()
             if (scenarios is None or c[0] in scenarios)
             and (periods is None or c[1] in periods)]

    entries = []
    warnings: list[str] = []
    for (variable, statistic), spec in MAPPING.items():
        if only and (variable, statistic) not in only:
            continue
        if variable == "gdd10":
            continue  # composed by build_gdd, which is season-resolved
        for season in seasons:
            ours, land, template = read_normal(variable, statistic, season,
                                               normals_root)
            base = None
            if spec["rule"] == RATIO:
                base = load_field(spec["mfe"], "historical", "base", season,
                                  None, template, root=root)
            for scenario, period in pairs:
                change = load_field(spec["mfe"], scenario, "change", season,
                                    period, template, root=root)
                out = compose(ours, change, spec["rule"], base=base,
                              floor=spec["floor"])

                delta = (out - ours)[land]
                want = EXPECT[(variable, statistic)]
                if want:
                    wrong = float(np.mean(np.sign(delta) == -want))
                    if wrong > MAX_WRONG_SIGN:
                        msg = (f"{variable}/{statistic} {season} {scenario} "
                               f"{period}: {wrong:.1%} of cells move against "
                               f"the expected direction ({want:+d})")
                        warnings.append(msg)
                        logger.warning(msg)
                else:
                    wrong = float("nan")

                key = projection_key(variable, statistic, scenario, period,
                                     season)
                path = out_root / key
                vals = out[land]
                R.write_cog(
                    path, np.where(land, out, R.NODATA).astype(np.float32),
                    template,
                    max_z_error=R.DEFAULT_MAX_Z_ERROR.get(variable, 0.01),
                    tags={
                        "variable": variable, "statistic": statistic,
                        "granularity": "projection",
                        "scenario": scenario, "period": period,
                        "season": season, "baseline": BASELINE_LABEL,
                        "unit": spec["unit"], "rule": spec["rule"],
                        "mfe_variable": spec["mfe"],
                        "model_version": MODEL_VERSION,
                        "source": "MfE 2024 NZ climate projections, CCAM "
                                  "multi-model mean, composed onto Auxein "
                                  "tps-2.0.0-ridge 1986-2005 normals",
                        "resolution_m": template.resolution_m,
                    })
                entries.append({
                    "key": key, "variable": variable, "statistic": statistic,
                    "scenario": scenario, "period": period, "season": season,
                    "rule": spec["rule"], "unit": spec["unit"],
                    "baseline_median": float(np.median(ours[land])),
                    "projected_median": float(np.median(vals)),
                    "delta_median": float(np.median(delta)),
                    "delta_p5": float(np.percentile(delta, 5)),
                    "delta_p95": float(np.percentile(delta, 95)),
                    "wrong_sign_share": wrong,
                })
            logger.info("%-10s %-13s %-4s  %d combos written",
                        variable, statistic, season, len(pairs))

    out_root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "model_version": MODEL_VERSION, "baseline": BASELINE_LABEL,
        "mfe_baseline_arm": BASELINE,
        "n_surfaces": len(entries), "warnings": warnings,
        "surfaces": entries,
    }
    (out_root / "manifest.json").write_text(json.dumps(manifest, indent=2))
    logger.info("wrote %d surfaces, %d warnings -> %s",
                len(entries), len(warnings), out_root / "manifest.json")
    return manifest


# --- GDD10, season-resolved -------------------------------------------------
#
# MEASURED 2026-08-24, and this is why the annual ratio is not used.
#
# Sep-Apr holds 97.57% of the annual GDD10, so "almost all of it accrues in the
# growing season" is true. The FRACTIONAL change is nonetheless not
# season-invariant: on ssp245 fp2041-2060 the annual fraction is +37.86% and the
# Sep-Apr fraction is +35.53%, a gap of -2.44% (p5 -4.37%, p95 -0.24%, |max|
# 5.48%). It is ONE-SIGNED - the annual ratio overstates in over 95% of cells.
#
# The cause is the base-10 threshold. Midsummer means already sit ~15 degC, so
# +1.3 degC adds ~1.3 GDD/day and behaves linearly; in May-August the baseline
# GDD is near zero, so identical warming is an enormous RELATIVE gain. A
# calendar-year ratio carries that winter relative gain into a season that does
# not contain those months.
#
# So the fraction is rebuilt season by season from MfE's own seasonal T deltas,
# pushed through our monthly mean+sd climatology and the archive's normal-CDF
# GDD formula. Reconstructing MfE's ANNUAL figure the same way gives +37.73%
# against their published +38.25% - 0.32% apart, which is what licenses using
# the method for the seasonal window they do not publish.
#
# Only the FRACTION comes from the reconstruction. The LEVEL stays our own
# published gdd10 season normal, so this cannot introduce a second, subtly
# different GDD10 baseline alongside the one the Atlas and Pro page already
# show.

DEFAULT_GDD_ROOT = Path("scratchpad/climate_history/gdd_out/surfaces/v2/gdd10/season")


def gdd10_normal(gdd_root: Path, baseline: tuple[int, int]
                 ) -> tuple[np.ndarray, np.ndarray, "R.RasterTemplate"]:
    """Our published Sep-Apr gdd10 normal over the baseline window.

    The April `cumulative` raster of vintage V is the whole Sep-Apr total, so
    the normal is the mean of those over complete vintages. Vintage V spans
    Sep(V-1)..Apr(V), so a 1986-2005 window yields V = 1987..2005 - 19 seasons,
    the same count SEPAPR reports and for the same reason.
    """
    lo, hi = baseline
    paths = []
    for vintage in range(lo + 1, hi + 1):
        p = (gdd_root / str(vintage) /
             f"gdd10_season_{vintage}_{vintage}04_500m_cumulative.tif")
        if not p.exists():
            raise FileNotFoundError(p)
        paths.append(p)

    template, land = N._template_from(paths[0])
    acc = np.zeros((template.height, template.width), dtype=np.float64)
    for p in paths:
        acc += N._read(p)[0].astype(np.float64)
    acc /= len(paths)
    logger.info("gdd10 normal from %d vintages (%d..%d), median %.1f",
                len(paths), lo + 1, hi, float(np.median(acc[land])))
    return acc, land, template


def build_gdd(*, out_root: Path = DEFAULT_OUT, root: Path = MFE_ROOT,
              archive: Path = N.DEFAULT_ARCHIVE,
              gdd_root: Path = DEFAULT_GDD_ROOT,
              baseline: tuple[int, int] = N.DEFAULT_BASELINE,
              base_temp: float = 10.0,
              scenarios: Optional[Iterable[str]] = None,
              periods: Optional[Iterable[str]] = None) -> dict:
    from scripts.interpolation.gdd_season import gdd_from_normal

    ours, land, template = gdd10_normal(gdd_root, baseline)

    logger.info("building monthly mean+sd climatology %d-%d", *baseline)
    clim = _monthly_climatology(archive, baseline, land)
    base_m = {m: gdd_from_normal(clim[m][0], clim[m][1], MONTH_DAYS[m],
                                 base_temp)
              for m in range(1, 13)}
    base_sep = sum(base_m[m] for m in SEPAPR_MONTHS)

    pairs = [c for c in combos()
             if (scenarios is None or c[0] in scenarios)
             and (periods is None or c[1] in periods)]

    entries, warnings = [], []
    for scenario, period in pairs:
        deltas = {s: load_field("T", scenario, "change", s, period, template,
                                root=root)
                  for s in ("DJF", "MAM", "JJA", "SON")}
        proj_sep = sum(
            gdd_from_normal(clim[m][0] + deltas[MONTH_SEASON[m]], clim[m][1],
                            MONTH_DAYS[m], base_temp)
            for m in SEPAPR_MONTHS)

        # Guard the denominator the same way the ratio rule does: a cell with
        # essentially no growing degree days has no meaningful fractional
        # change, and dividing there manufactures one.
        with np.errstate(divide="ignore", invalid="ignore"):
            frac = np.where(base_sep > 1.0, proj_sep / base_sep - 1.0, 0.0)
        out = np.maximum(ours * (1.0 + frac), 0.0)

        delta = (out - ours)[land]
        wrong = float(np.mean(delta < 0))
        if wrong > MAX_WRONG_SIGN:
            msg = (f"gdd10 {scenario} {period}: {wrong:.1%} of cells cool")
            warnings.append(msg)
            logger.warning(msg)

        key = projection_key("gdd10", "cumulative", scenario, period, "SEPAPR")
        R.write_cog(
            out_root / key,
            np.where(land, out, R.NODATA).astype(np.float32), template,
            max_z_error=0.1,
            tags={
                "variable": "gdd10", "statistic": "cumulative",
                "granularity": "projection", "scenario": scenario,
                "period": period, "season": "SEPAPR",
                "baseline": BASELINE_LABEL, "unit": "GDD",
                "rule": "season_resolved",
                "mfe_variable": "T (seasonal deltas)",
                "model_version": MODEL_VERSION,
                "method": "fraction rebuilt from MfE seasonal T deltas through "
                          "our 1986-2005 monthly mean+sd and the normal-CDF GDD "
                          "formula; level from our own gdd10 season normal. The "
                          "MfE ANN GDD10 ratio was measured to overstate the "
                          "Sep-Apr change by 2.4% and is deliberately not used.",
                "resolution_m": template.resolution_m,
            })
        entries.append({
            "key": key, "variable": "gdd10", "statistic": "cumulative",
            "scenario": scenario, "period": period, "season": "SEPAPR",
            "rule": "season_resolved", "unit": "GDD",
            "baseline_median": float(np.median(ours[land])),
            "projected_median": float(np.median(out[land])),
            "delta_median": float(np.median(delta)),
            "delta_p5": float(np.percentile(delta, 5)),
            "delta_p95": float(np.percentile(delta, 95)),
            "frac_median": float(np.median(frac[land])),
            "wrong_sign_share": wrong,
        })
        logger.info("gdd10 %-7s %-13s  %.0f -> %.0f  (%+.1f GDD, %+.2f%%)",
                    scenario, period, entries[-1]["baseline_median"],
                    entries[-1]["projected_median"],
                    entries[-1]["delta_median"],
                    100 * entries[-1]["frac_median"])

    man = {"model_version": MODEL_VERSION, "baseline": BASELINE_LABEL,
           "variable": "gdd10", "n_surfaces": len(entries),
           "warnings": warnings, "surfaces": entries}
    (out_root / "manifest_gdd10.json").write_text(json.dumps(man, indent=2))
    logger.info("wrote %d gdd10 surfaces", len(entries))
    return man


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    bg = sub.add_parser("build-gdd",
                        help="season-resolved gdd10 projection surfaces")
    bg.add_argument("--out", type=Path, default=DEFAULT_OUT)
    bg.add_argument("--mfe-root", type=Path, default=MFE_ROOT)
    bg.add_argument("--archive", type=Path, default=N.DEFAULT_ARCHIVE)
    bg.add_argument("--gdd-root", type=Path, default=DEFAULT_GDD_ROOT)
    bg.add_argument("--scenarios", default=None)
    bg.add_argument("--periods", default=None)

    b = sub.add_parser("build", help="compose and write projection surfaces")
    b.add_argument("--out", type=Path, default=DEFAULT_OUT)
    b.add_argument("--mfe-root", type=Path, default=MFE_ROOT)
    b.add_argument("--normals", type=Path, default=DEFAULT_NORMALS)
    b.add_argument("--seasons", default=",".join(SEASONS))
    b.add_argument("--scenarios", default=None)
    b.add_argument("--periods", default=None)
    b.add_argument("--variable", default=None,
                   help="limit to one variable/statistic, e.g. temp_min/frost_days")

    g = sub.add_parser("gdd-check",
                       help="measure the GDD10 ratio rule's season assumption")
    g.add_argument("--scenario", default="ssp245", choices=SCENARIOS)
    g.add_argument("--period", default="fp2041-2060", choices=PERIODS)
    g.add_argument("--archive", type=Path, default=N.DEFAULT_ARCHIVE)
    g.add_argument("--mfe-root", type=Path, default=MFE_ROOT)
    g.add_argument("--out", type=Path,
                   default=Path("scratchpad/projections/gdd_season_check.json"))

    c = sub.add_parser("compare", help="MfE base vs our normal, per season")
    c.add_argument("--mfe-root", type=Path, default=MFE_ROOT)
    c.add_argument("--normals", type=Path, default=DEFAULT_NORMALS)
    c.add_argument("--seasons", default=",".join(SEASONS))
    c.add_argument("--out", type=Path,
                   default=Path("scratchpad/projections/commensurability.json"))

    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    # Only the two BUILD commands publish; `gdd-check` and `compare` are
    # diagnostics that already write to an explicit `--out` file of their own
    # and overwrite no product manifest.
    record = None
    if args.cmd in ("build", "build-gdd"):
        record = RunRecord(args.out)
        record.open({
            "started_at": datetime.now(timezone.utc).isoformat(),
            "engine": "projections", "command": args.cmd, "argv": sys.argv,
            "parameters": {
                "out": str(args.out), "model_version": MODEL_VERSION,
                "baseline": BASELINE_LABEL, "mfe_baseline_arm": BASELINE,
                "scenarios": args.scenarios, "periods": args.periods,
                "seasons": getattr(args, "seasons", None),
                "variable": getattr(args, "variable", None),
                "max_wrong_sign": MAX_WRONG_SIGN},
            # No station network — the inputs are the MfE rasters on Z: and our
            # own normals. Which trees they came from IS the provenance, and Z:
            # is a mapped drive whose contents nothing else pins.
            "sources": {
                "mfe_root": str(args.mfe_root),
                "normals_root": str(getattr(args, "normals", None) or ""),
                "archive": str(getattr(args, "archive", None) or ""),
                "gdd_root": str(getattr(args, "gdd_root", None) or "")},
            "code": {"digest": _code_digest(CODE_MODULES),
                     "git": _git_revision()},
            "environment": _environment()})

    if args.cmd == "build-gdd":
        man = build_gdd(
            out_root=args.out, root=args.mfe_root, archive=args.archive,
            gdd_root=args.gdd_root,
            scenarios=(tuple(x.strip() for x in args.scenarios.split(","))
                       if args.scenarios else None),
            periods=(tuple(x.strip() for x in args.periods.split(","))
                     if args.periods else None))
        # Only THIS command's manifest. Both build commands write into the same
        # `--out`, so copying the default pair would have each run archiving the
        # other's manifest alongside its own.
        record.close({"n_surfaces": man["n_surfaces"],
                      "n_warnings": len(man["warnings"]),
                      "warnings": man["warnings"][:50]},
                     copy=("manifest_gdd10.json",))

    if args.cmd == "build":
        only = None
        if args.variable:
            v, _, st = args.variable.partition("/")
            only = {(v, st)}
        man = build(
            out_root=args.out, root=args.mfe_root, normals_root=args.normals,
            seasons=tuple(x.strip() for x in args.seasons.split(",") if x.strip()),
            only=only,
            scenarios=(tuple(x.strip() for x in args.scenarios.split(","))
                       if args.scenarios else None),
            periods=(tuple(x.strip() for x in args.periods.split(","))
                     if args.periods else None))
        record.close({"n_surfaces": man["n_surfaces"],
                      "n_warnings": len(man["warnings"]),
                      "warnings": man["warnings"][:50]},
                     copy=("manifest.json",))

    if args.cmd == "gdd-check":
        res = gdd_check(args.scenario, args.period, archive=args.archive,
                        root=args.mfe_root)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(res, indent=2))
        logger.info("wrote %s", args.out)

    if args.cmd == "compare":
        seasons = tuple(s.strip() for s in args.seasons.split(",") if s.strip())
        rows = compare_base(args.mfe_root, args.normals, seasons)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(rows, indent=2))
        logger.info("wrote %s", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
