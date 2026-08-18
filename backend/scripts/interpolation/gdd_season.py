"""Growing-degree-day surfaces, one running accumulation per season.

Produces two new variables, `gdd10` and `gdd0`, as 500 m national surfaces:

    surfaces/v2/gdd10/season/1987/gdd10_season_1987_198609_500m_cumulative.tif
    ...                       /gdd10_season_1987_198704_500m_cumulative.tif

Eight rasters per season — the running total at the end of each of September,
October, ... April — so the Atlas can animate a season filling up rather than
showing one number per vintage. **The April accumulation IS the season total**;
see `SEASON_TOTAL_SHARES_THE_APRIL_OBJECT` below for how that is indexed.

## The source is MONTHLY, because no daily surface exists

The obvious construction — sum `max(0, T_day - base)` over the season's daily
surfaces — is not available. `run_history.py` streams day blocks into monthly
accumulators and never materialises a daily raster; the archive holds 7,752
monthly objects and zero daily ones. Rebuilding the dailies to make GDD would
mean re-running the whole 1986-2023 history.

So GDD is integrated from the monthly `mean` and `sd` bands, per cell:

    GDD_month = n * [ (mu - B) * Phi(z) + sigma * phi(z) ],   z = (mu - B)/sigma

which is the expected value of `max(0, T - B)` for T ~ Normal(mu, sigma), times
the number of days fitted. This is not an approximation of convenience: it is
the same estimator `aggregate_zone_monthly.gdd_normal` already uses, and that
one was validated against an independent per-cell computation to within 1 GDD
across all 23 climate zones.

**Never substitute `max(0, mu - B)`.** GDD is convex in temperature, so the
naive form under-counts by ~20% at cool sites — a systematic bias concentrated
in exactly the cold-climate regions (Gibbston, Waitaki) where a grower cares
most about the number. It is a bias, not noise, and it does not average out.
Dropping `sd` does the same thing.

## What this inherits and what it does not

`n_days` comes from the monthly manifest, so a month where a day failed to fit
contributes that many days and not the calendar count. The land mask, geometry
and CRS are taken from the source rasters themselves — this script never
constructs a grid, so it cannot disagree with the archive about where land is.

Accuracy does NOT come along. A season GDD is a sum of eight integrals of a
fitted temperature field; its error is not the mean of the constituent
`cv_rmse` values and there is no cross-validation of GDD itself, because GDD
was never fitted. What is recorded is the median `cv_rmse` of the temp_mean
fits underneath, with `cv_units='C'` — which, because these variables' own unit
is `GDD`, makes the API's existing unit guard suppress it rather than print
degree-days as degrees. That guard already exists for rainfall's ratio-space
CV; this is the same mechanism, not a new one.

## Season definition

Sep-Apr, labelled by the ENDING year, matching `climate_zone_surface_season`
and the vintage convention growers use. The archive runs 1986-01..2023-12, so
complete seasons are 1987..2023 — 37 vintages. The four months of the season
ending 2024 that DO exist are deliberately not emitted: a half season in a list
of whole ones is read as a whole one.

Run it after the archive changes, never as part of a fit:

    python -m scripts.interpolation.gdd_season --root <bucket-root>
    python -m scripts.interpolation.gdd_season --root <bucket-root> --stats-only
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.interpolation.raster import (  # noqa: E402
    NODATA, _configure_proj, write_cog,
)

log = logging.getLogger("gdd_season")

SOURCE_VARIABLE = "temp_mean"
CONTRACT_VERSION = "v2"

# Sep(-1) .. Apr, in order. The leading four run in the year before the vintage.
SEASON_MONTHS = ((9, -1), (10, -1), (11, -1), (12, -1),
                 (1, 0), (2, 0), (3, 0), (4, 0))

# LERC tolerance, in GDD. Temperature publishes 0.01 degC against a cv_rmse of
# ~1.15; a season's GDD runs to ~2,000 and the smallest difference anyone reads
# off it is of order 10 GDD, so 0.1 is the same "two orders below the signal"
# choice expressed in this variable's unit.
MAX_Z_ERROR = 0.1

# A `RasterTemplate` is built from a lat/lon grid and carries a land-cell
# scatter index. Nothing here scatters anything — the values arrive already
# shaped as a raster, read from another raster — so the geometry is lifted off
# the source dataset instead. `write_cog` touches only these three attributes.
@dataclass(frozen=True)
class SourceGeometry:
    width: int
    height: int
    transform: object


def gdd_from_normal(mu: np.ndarray, sd: np.ndarray, n_days: float,
                    base: float) -> np.ndarray:
    """Expected accumulated degree-days above `base` over `n_days`.

    E[max(0, T-B)] * n for T ~ N(mu, sigma), evaluated per cell. See the module
    docstring for why the naive `max(0, mu-B)` is not an acceptable stand-in.
    """
    sd = np.where(sd > 1e-6, sd, 1e-6)
    z = (mu - base) / sd
    phi = np.exp(-0.5 * z * z) / math.sqrt(2.0 * math.pi)
    return n_days * ((mu - base) * _ndtr(z) + sd * phi)


# scipy is on the workstation venv but NOT in backend/venv, which is what EB
# installs. `math.erf` is correctly rounded, so this is exact rather than an
# approximation, and it keeps a heavyweight dependency out of the API image.
# Mirrors `scripts/aggregate_zone_monthly._ndtr` deliberately — two copies of
# four lines beats a shared import across two venvs.
_erf = np.vectorize(math.erf, otypes=[np.float64])


def _ndtr(z: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + _erf(z / math.sqrt(2.0)))


# --- layout ------------------------------------------------------------------
# Contract §1.1. As with `index_surfaces.monthly_key`, this is the only place
# the season layout is written down.

def variable_name(base: float) -> str:
    """`gdd10` / `gdd0`. Integer bases only — a `gdd10.5` key is not a path."""
    if float(base) != int(base):
        raise ValueError(f"non-integer GDD base {base!r} has no key form")
    return f"gdd{int(base)}"


def season_key(variable: str, vintage: int, year: int, month: int,
               res_m: int) -> str:
    return (f"surfaces/v2/{variable}/season/{vintage}/"
            f"{variable}_season_{vintage}_{year}{month:02d}_{res_m}m_cumulative.tif")


def monthly_source_key(year: int, month: int, res_m: int, statistic: str) -> str:
    return (f"surfaces/v2/{SOURCE_VARIABLE}/monthly/{year}/"
            f"{SOURCE_VARIABLE}_monthly_{year}{month:02d}_{res_m}m_{statistic}.tif")


def season_span(vintage: int) -> Iterator[tuple[int, int]]:
    """(year, month) for each month of the season ending in `vintage`."""
    for month, offset in SEASON_MONTHS:
        yield vintage + offset, month


# --- the build ----------------------------------------------------------------

def _read_band(root: Path, year: int, month: int, res_m: int, statistic: str):
    # `write_cog` configures PROJ for itself, but this script READS before it
    # ever writes, and a workstation here has a PostGIS 3.5 proj.db that wins
    # over rasterio's bundled copy. Left alone it logs a wall of PROJ warnings
    # per open and can hand back a dataset with no usable CRS.
    _configure_proj()
    import rasterio
    path = root / monthly_source_key(year, month, res_m, statistic)
    if not path.exists():
        raise FileNotFoundError(path)
    with rasterio.open(path) as ds:
        arr = ds.read(1)
        nodata = ds.nodata if ds.nodata is not None else float(NODATA)
        geom = SourceGeometry(width=ds.width, height=ds.height,
                              transform=ds.transform)
    return arr, nodata, geom


def build_season(root: Path, vintage: int, base: float, months_index: dict,
                 res_m: int, *, out_root: Optional[Path] = None,
                 write: bool = True) -> Optional[dict]:
    """Accumulate one season and write its eight cumulative rasters.

    Returns a manifest fragment, or None if the season is not fully covered.
    """
    span = list(season_span(vintage))
    missing = [f"{y}-{m:02d}" for y, m in span if f"{y}-{m:02d}" not in months_index]
    if missing:
        log.warning("vintage %d skipped: archive has no %s",
                    vintage, ", ".join(missing))
        return None

    variable = variable_name(base)
    acc: Optional[np.ndarray] = None
    land: Optional[np.ndarray] = None
    geom: Optional[SourceGeometry] = None
    steps: list[dict] = []
    cvs: list[float] = []

    for year, month in span:
        rec = months_index[f"{year}-{month:02d}"]
        mu, nodata, geom = _read_band(root, year, month, res_m, "mean")
        sd, _, _ = _read_band(root, year, month, res_m, "sd")

        valid = (mu != nodata) & (sd != nodata) & np.isfinite(mu) & np.isfinite(sd)
        if land is None:
            land = valid
            # float64 accumulator: eight monthly terms of ~250 summed in
            # float32 is fine today, but the cost of the wider type is one
            # 60 MB buffer and it removes the question entirely.
            acc = np.zeros(mu.shape, dtype=np.float64)
        elif int(valid.sum()) != int(land.sum()):
            # The land mask is a property of the grid, not of the month. A
            # month that disagrees means the archive is inconsistent, and
            # accumulating across it would silently mix two footprints.
            raise RuntimeError(
                f"{variable} {vintage}: {year}-{month:02d} has "
                f"{int(valid.sum()):,} valid cells against "
                f"{int(land.sum()):,} in September — the land mask moved")

        n_days = float(rec.get("n_days") or rec.get("days_in_month"))
        contrib = gdd_from_normal(mu[land], sd[land], n_days, base)
        # A month can only ADD degree-days. Clamping here rather than at the
        # end keeps every intermediate raster monotone in time, which is the
        # one property a viewer will read off the animation.
        acc[land] += np.maximum(contrib, 0.0)

        if rec.get("mean_cv_rmse") is not None:
            cvs.append(float(rec["mean_cv_rmse"]))

        out = np.full(acc.shape, float(NODATA), dtype=np.float32)
        out[land] = acc[land].astype(np.float32)

        key = season_key(variable, vintage, year, month, res_m)
        if write:
            write_cog(
                (out_root or root) / key, out, geom,
                nodata=float(NODATA),
                max_z_error=MAX_Z_ERROR,
                tags={
                    "variable": variable,
                    "granularity": "season",
                    "statistic": "cumulative",
                    "valid_at": f"{year}-{month:02d}",
                    "season": vintage,
                    "period_start": f"{vintage - 1}-09",
                    "gdd_base_c": base,
                    "resolution_m": res_m,
                    "derived_from": f"{SOURCE_VARIABLE} monthly mean+sd",
                    "method": "normal-integral E[max(0,T-B)]*n_days, "
                              "summed Sep-Apr",
                    "source_cv_rmse_median": (float(np.median(cvs)) if cvs else ""),
                    "source_cv_units": "C",
                },
            )
        steps.append({"valid_at": f"{year}-{month:02d}", "n_days": n_days,
                      "months_elapsed": len(steps) + 1})

    stats = _describe(acc[land])
    log.info("%s %d: season total p50 %.0f p99.5 %.0f max %.0f",
             variable, vintage, stats["p50"], stats["p995"], stats["max"])

    return {
        "season": vintage,
        "period_start": f"{vintage - 1}-09",
        "valid_at": f"{vintage}-04",
        "resolution_m": res_m,
        "steps": steps,
        "source_cv_rmse_median": float(np.median(cvs)) if cvs else None,
        "total": stats,
    }


def _describe(values: np.ndarray) -> dict:
    q = np.percentile(values, [0.5, 50, 99, 99.5])
    return {"p05": float(q[0]), "p50": float(q[1]), "p99": float(q[2]),
            "p995": float(q[3]), "max": float(values.max()),
            "min": float(values.min())}


def build(root: Path, base: float, *, first: int, last: int,
          out_root: Optional[Path] = None, write: bool = True) -> dict:
    variable = variable_name(base)
    source = json.loads((root / SOURCE_VARIABLE / "manifest.json").read_text())
    res_m = int(source["resolution_m"])
    months_index = {m["valid_at"]: m for m in source["months"]}

    seasons: list[dict] = []
    for vintage in range(first, last + 1):
        built = build_season(root, vintage, base, months_index, res_m,
                             out_root=out_root, write=write)
        if built:
            seasons.append(built)

    if not seasons:
        raise RuntimeError(f"{variable}: no complete season in {first}..{last}")

    # Pooled across every season, which is what a fixed display domain has to
    # cover — see the DOMAINS note in services/surface_store.py.
    pooled = {
        "p05": min(s["total"]["p05"] for s in seasons),
        "p50": float(np.median([s["total"]["p50"] for s in seasons])),
        "p995": max(s["total"]["p995"] for s in seasons),
        "max": max(s["total"]["max"] for s in seasons),
    }

    manifest = {
        "variable": variable,
        "unit": "GDD",
        "granularity": "season",
        "contract_version": CONTRACT_VERSION,
        "model_version": source["model_version"],
        "resolution_m": res_m,
        "gdd_base_c": base,
        "season": "Sep-Apr, labelled by the ending (vintage) year",
        "derived_from": SOURCE_VARIABLE,
        "method": ("normal-integral E[max(0,T-B)] * n_days per month, from the "
                   "monthly mean and sd bands; no daily surface exists"),
        # The season total is not a separate object — see
        # SEASON_TOTAL_SHARES_THE_APRIL_OBJECT in index_surfaces.py.
        "statistics": ["cumulative", "sum"],
        "first": f"{seasons[0]['season']}",
        "last": f"{seasons[-1]['season']}",
        "n_seasons": len(seasons),
        "cv_rmse": {
            "note": ("GDD is not fitted and has no cross-validation of its own. "
                     "These are the temp_mean fits underneath, in degC."),
            "median": float(np.median([s["source_cv_rmse_median"] for s in seasons
                                       if s["source_cv_rmse_median"] is not None])),
            "units": "C",
        },
        "distribution": pooled,
        "seasons": seasons,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    if write:
        dest = (out_root or root) / variable
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--root", required=True, type=Path,
                   help="bucket root holding surfaces/v2/ and temp_mean/manifest.json")
    # Writing into --root is convenient but collides with an `aws s3 sync` of
    # the same tree: a sync running while this writes will upload half-finished
    # COGs. A separate staging root keeps the two independent, and its layout
    # is bucket-relative so it syncs with the same command.
    p.add_argument("--out-root", type=Path, default=None,
                   help="where to write (default: --root)")
    p.add_argument("--bases", default="10,0",
                   help="comma-separated GDD bases in degC (default 10,0)")
    p.add_argument("--first", type=int, default=1987, help="first vintage")
    p.add_argument("--last", type=int, default=2023, help="last vintage")
    p.add_argument("--stats-only", action="store_true",
                   help="measure the distribution without writing any raster")
    args = p.parse_args(argv)

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    for raw in args.bases.split(","):
        base = float(raw.strip())
        m = build(args.root, base, first=args.first, last=args.last,
                  out_root=args.out_root, write=not args.stats_only)
        d = m["distribution"]
        print(f"\n{m['variable']}: {m['n_seasons']} seasons "
              f"{m['first']}..{m['last']}")
        print(f"  season total pooled  p0.5 {d['p05']:.0f}  p50 {d['p50']:.0f}  "
              f"p99.5 {d['p995']:.0f}  max {d['max']:.0f}")
        print(f"  -> suggested DOMAIN  (0.0, {math.ceil(d['p995'] / 100) * 100:.1f}, 'heat')")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
