#!/usr/bin/env python3
"""Daily live surfaces — one raster per variable per day, fitted from the DB.

The forward engine. `run_history.py` fits days and then REDUCES them to monthly
bands; this keeps the days. Same estimator, same basis, same era correction —
the only difference is what gets written.

    surfaces/v2/<variable>/daily/<YYYY>/<MM>/<variable>_daily_<YYYYMMDD>_500m.tif

`statistic` is NULL for a daily surface (contract §1.2) and `valid_at` is
midnight UTC.

## One basis for the three temperatures

`GridBasis` costs ~8 s and ~1.4 GB for the temperature network and ~27 s and
~4.6 GB for rainfall, against ~0.3 s to fit a day. Rebuilding it per variable is
therefore ~90% of the run. `fastgrid`'s union-column property makes sharing
exact: the basis is built over the UNION of the three temperature variables'
stations, and any station not reporting on a given day simply gets a zero
coefficient. Verified in `fastgrid_check.py` to 3.2e-11 degC.

Rainfall keeps its own basis. A single union basis over temperature AND rainfall
would be ~900 stations x 1,429,944 cells x 4 B = **5.2 GB**, against a box that
has already OOM-killed a 9.16 GB rainfall run, and it would buy nothing —
rainfall is fitted once either way.

## float32, deliberately

Measured: temp_mean 2022-02 gives cv_rmse 1.119 at float32 and float64 alike,
because the basis dtype affects the grid projection and not the station-space
fit. float64 rainfall is 9.16 GB and gets OOM-killed on this hardware.

## Two model_versions in one day, and that is correct

Temperature is era-corrected and published as `tps-2.0.0-ridge-db-adj`; rainfall
is published UNCORRECTED as `tps-2.0.0-ridge-db`. That is not an oversight —
the DB carries ~838 rain gauges against CLIFLO's ~343, so correcting rainfall
toward CLIFLO would be correcting toward the worse network. It matches what is
already published for 2024-2026, so a chart crossing today's date does not step.

**Consumers must pin per variable.** `insights_site_daily` reads
`SURFACE_LIVE_MODEL_VERSION`, and a single pin cannot cover both.

## Schedule

D+2, not D+1. ECAN_AIR lands ~24.8 h behind wall clock and is 10 thermometers in
the largest temperature deficit region in the country; a D+1 fit would omit them
systematically. `daily_aggregation` also keeps revising `weather_data_daily` for
~3 days, which is why a weekly `--refit D-9..D-3` pass exists: without it the
surface and the DB disagree permanently.

## Every run leaves an immutable record

`<out>/_runs/<run_id>/` — `run.json` (parameters, code digest, git revision,
environment, outcome), `stations.csv` (both networks, per-variable day counts,
relevance-screen rejects), and copies of `manifest.json` and
`validation_stats.csv`. `<out>/manifest.json` itself stays a WORKING COPY that
`index_daily.py` reads and the next run replaces — the record is the sidecar
that does not get replaced.

This matters more here than in the backfill. The daily job and the weekly refit
both overwrite that one flat manifest, so without records a refit erases the
evidence of the run it is correcting. Held-out error per region over time is
also the only ongoing validation series that exists now CLIFLO is closed, and it
can only be assembled from runs that were recorded as they happened.

**The publish step must include `_runs/`** (it does — see the sync in
`deploy/surfaces/entrypoint.sh`). The task filesystem is discarded, so a record
that stays local is a record that never existed.

Usage:
    python run_live.py --date 2026-08-22
    python run_live.py --start 2026-08-01 --end 2026-08-22
    python run_live.py --refit                      # D-9 .. D-3
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Optional

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.interpolation import tps                                # noqa: E402
from scripts.interpolation.fastgrid import GridBasis, estimate_bytes  # noqa: E402
from scripts.interpolation.raster import (                            # noqa: E402
    RasterTemplate, grid_from_csv, write_cog, DEFAULT_MAX_Z_ERROR)
from scripts.interpolation import run_history as RH                   # noqa: E402
from scripts.interpolation.runrecord import (                         # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

log = logging.getLogger("run_live")

REPO = Path(__file__).resolve().parents[3]
DEFAULT_INPUTS = REPO / "scratchpad" / "live_surfaces" / "inputs_daily"
DEFAULT_OUT = REPO / "scratchpad" / "live_surfaces" / "daily_live"
DEFAULT_GRID = REPO / "backend" / "models" / "example data" / "VCDN_500m.csv"
DEFAULT_ERA_ROOT = REPO / "scratchpad" / "live_surfaces" / "era_fields"

TEMP_VARIABLES = ("temp_mean", "temp_min", "temp_max")
ALL_VARIABLES = TEMP_VARIABLES + ("rainfall",)

# Matches what is already published for the 2024-2026 live era. See the module
# docstring for why rainfall differs rather than being an oversight.
MODEL_VERSION = {"temp_mean": "tps-2.0.0-ridge-db-adj",
                 "temp_min": "tps-2.0.0-ridge-db-adj",
                 "temp_max": "tps-2.0.0-ridge-db-adj",
                 "rainfall": "tps-2.0.0-ridge-db"}

CONTRACT_VERSION = "v2"
MIN_STATIONS = 4

# Cold-side rejection floor per variable. Cold-air pooling hits the daily
# MINIMUM hardest, is damped in the mean, and barely touches the daily maximum,
# so the licence to be colder than your neighbours shrinks accordingly.
COLD_FLOOR = {"temp_min": 15.0, "temp_mean": 12.0, "temp_max": 8.0}

# Share of a station's fittable days that must trip before it is called broken
# rather than distinctive. Real microclimates trip occasionally; a failed sensor
# trips almost always. Winton ran 31/69 station-days against Hyde Rock's 2/46.
PERSISTENT_TRIP_RATE = 0.20

# Hashed into every run record. Deliberately NOT `RH.CODE_MODULES`: this engine
# keeps the days instead of reducing them, so `monthly.py` is not part of its
# estimator and `run_live.py` is. `run_history` stays in the list because the
# inputs loader, the climatology reader and the era-offset loader all live
# there.
CODE_MODULES = ("run_live.py", "run_history.py", "tps.py", "fastgrid.py",
                "raster.py", "precip.py", "consolidate_db.py")


def daily_key(variable: str, d: date, res_m: int) -> str:
    """Contract §1.1. The only place the daily layout is written down.

    Fanned out by year AND month: a year of four variables is ~1,460 objects in
    one prefix otherwise, and S3 listing degrades long before that matters for
    monthly, which is why monthly stops at the year.
    """
    return (f"surfaces/v2/{variable}/daily/{d.year}/{d.month:02d}/"
            f"{variable}_daily_{d:%Y%m%d}_{res_m}m.tif")


def _nz_today() -> date:
    """Today in NZ, not UTC.

    `datetime.now(timezone.utc).date()` is YESTERDAY for the whole NZ morning,
    so a D-2 window computed from it silently fits D-3 for half of every day.
    Already burned this platform once on `date.today()` in production.
    """
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Pacific/Auckland")).date()


def parse_window(args) -> list[date]:
    if args.refit:
        today = _nz_today()
        lo = today - timedelta(days=args.refit_from)
        hi = today - timedelta(days=args.refit_to)
    elif args.date:
        lo = hi = date.fromisoformat(args.date)
    else:
        if not (args.start and args.end):
            raise SystemExit("give --date, or --start and --end, or --refit")
        lo = date.fromisoformat(args.start)
        hi = date.fromisoformat(args.end)
    if hi < lo:
        raise SystemExit(f"end {hi} is before start {lo}")
    return [lo + timedelta(days=i) for i in range((hi - lo).days + 1)]


class Group:
    """A set of variables that can share one grid basis.

    The station table is the UNION across the group's variables, so a station
    reporting temp_min but not temp_max is a column that exists in the basis and
    takes a zero coefficient on the days it has no value.
    """

    def __init__(self, variables: tuple[str, ...], inputs: Path):
        self.variables = variables
        self.data = {}
        frames = []
        for v in variables:
            values, stations, dates = RH.load_inputs(inputs, v)
            self.data[v] = {"values": values, "stations": stations,
                            "dates": {d: i for i, d in enumerate(dates)}}
            frames.append(stations)
            log.info("[%s] %d days x %d stations, %s..%s", v, len(dates),
                     len(stations), dates[0], dates[-1])

        union = (pd.concat(frames, ignore_index=True)
                 .drop_duplicates(subset="station_id")
                 .sort_values("station_id")
                 .reset_index(drop=True))
        self.stations = union
        log.info("[%s] union network: %d stations",
                 "+".join(variables), len(union))

    def screen(self, grid) -> None:
        kept, rejected = tps.screen_relevance(
            self.stations, grid[["latitude", "longitude"]].to_numpy(float))
        # Retained for the run record. Which stations the screen REJECTED is
        # part of the description of the network, and a drop that leaves no
        # trace is the failure mode `screen_relevance` was built to avoid.
        self.rejected = rejected
        if len(rejected):
            log.warning("relevance screen dropped %d stations: %s",
                        len(rejected),
                        ", ".join(str(s) for s in
                                  rejected["station_id"].tolist()[:5]))
            self.stations = kept.reset_index(drop=True)

    def build_basis(self, grid, dtype):
        need = estimate_bytes(len(grid), len(self.stations), dtype)
        log.info("[%s] basis %.2f GB (%s)", "+".join(self.variables),
                 need / 1e9, np.dtype(dtype).name)
        t0 = time.perf_counter()
        self.basis = GridBasis.build(grid, self.stations, dtype=dtype)
        self.origin = (self.basis.lat0, self.basis.lon0)
        log.info("[%s] basis built in %.1f s", "+".join(self.variables),
                 time.perf_counter() - t0)

    def day_frame(self, variable: str, d: date):
        """Station rows reporting `variable` on `d`, or None."""
        rec = self.data[variable]
        i = rec["dates"].get(d)
        if i is None:
            return None
        row = rec["values"][i]
        ok = np.isfinite(row)
        if ok.sum() < MIN_STATIONS:
            return None
        s = rec["stations"]
        return pd.DataFrame({
            "station_id": s["station_id"].to_numpy()[ok],
            "latitude": s["latitude"].to_numpy(float)[ok],
            "longitude": s["longitude"].to_numpy(float)[ok],
            "elevation": s["elevation"].to_numpy(float)[ok],
            "value": row[ok].astype(float)})


def write_station_snapshot(path: Path, groups: list, days: list[date]) -> None:
    """One row per station per basis group, with per-variable day counts.

    Two differences from the history backfill's snapshot, both deliberate.
    There is a `group` column because this engine fits TWO networks — the
    temperature union and rainfall — and they are screened separately. And
    there are no first/last report dates: a live window is 1 to 9 days, so a
    date range over it carries nothing the day count does not.
    """
    frames = []
    for group in groups:
        label = "+".join(group.variables)
        df = group.stations.copy()
        df.insert(0, "group", label)
        df["in_fit"] = True
        for v in group.variables:
            rec = group.data[v]
            idx = [rec["dates"][d] for d in days if d in rec["dates"]]
            counts = (np.isfinite(rec["values"][idx, :]).sum(axis=0) if idx
                      else np.zeros(len(rec["stations"]), dtype=int))
            by_id = pd.Series(counts, index=rec["stations"]["station_id"].to_numpy())
            by_id = by_id[~by_id.index.duplicated()]
            df["n_days_" + v] = df["station_id"].map(by_id).fillna(0).astype(int)
        rejected = getattr(group, "rejected", None)
        if rejected is not None and len(rejected):
            rej = rejected.copy()
            rej.insert(0, "group", label)
            rej["in_fit"] = False
            df = pd.concat([df, rej], ignore_index=True, sort=False)
        frames.append(df)
    pd.concat(frames, ignore_index=True, sort=False).to_csv(path, index=False)


def run(days: list[date], variables: tuple[str, ...], inputs: Path, out: Path,
        grid_csv: Path, dtype, era_root: Optional[Path],
        precip_method: str, mar_smooth_km: float,
        require_days: Optional[int] = None, dry_run: bool = False,
        screen_outliers: bool = True,
        outlier_z: float = tps.DEFAULT_OUTLIER_Z,
        outlier_min_abs: float = tps.DEFAULT_OUTLIER_MIN_ABS) -> dict:
    grid = grid_from_csv(grid_csv)
    template = RasterTemplate.build(grid["latitude"].to_numpy(float),
                                    grid["longitude"].to_numpy(float))
    res = template.resolution_m
    log.info("raster %d x %d @ ~%d m, %d land cells", template.height,
             template.width, res, len(template.flat_index))

    temps = tuple(v for v in variables if v in TEMP_VARIABLES)
    groups = []
    if temps:
        groups.append(Group(temps, inputs))
    if "rainfall" in variables:
        groups.append(Group(("rainfall",), inputs))

    written, stats_rows, skipped, rejections = [], [], [], []
    manifest_flags: list = []
    era_meta: dict = {}

    # Screen every group BEFORE opening the record and before any basis exists.
    # The screen is a distance computation; a basis is 1.4-4.6 GB and ~90% of
    # the run, so the network is knowable long before it is paid for and the
    # record should not wait on it.
    for group in groups:
        group.screen(grid)

    # A dry run publishes nothing, so there is no artefact whose provenance
    # needs recording and no record is opened.
    record = None
    if not dry_run:
        code = _code_digest(CODE_MODULES)
        record = RunRecord(out)
        record.open({
            "started_at": datetime.now(timezone.utc).isoformat(),
            "engine": "run_live",
            "argv": sys.argv,
            "parameters": {
                "days": [d.isoformat() for d in days],
                "variables": list(variables),
                "inputs": str(inputs), "out": str(out), "grid": str(grid_csv),
                "dtype": np.dtype(dtype).name,
                "model_versions": {v: MODEL_VERSION[v] for v in variables},
                "contract_version": CONTRACT_VERSION,
                "resolution_m": int(res),
                "n_cells": int(len(template.flat_index)),
                "relevance_km": tps.DEFAULT_RELEVANCE_KM,
                "min_stations": MIN_STATIONS,
                "max_z_error": {v: DEFAULT_MAX_Z_ERROR.get(v) for v in variables},
                "lapse_rate": {v: RH.LAPSE[v] for v in variables
                               if v in RH.LAPSE},
                "era_offset_root": str(era_root) if era_root else None,
                "precip_method": precip_method,
                "mar_smooth_km": mar_smooth_km,
                "require_days": require_days,
                "outlier_screen": {
                    "enabled": screen_outliers, "z_cutoff": outlier_z,
                    "min_abs": outlier_min_abs, "cold_floor": COLD_FLOOR,
                    "persistent_trip_rate": PERSISTENT_TRIP_RATE}},
            "code": {"digest": code, "git": _git_revision()},
            "environment": _environment(),
            "network": {
                "groups": [{"variables": list(g.variables),
                            "n_in_fit": int(len(g.stations)),
                            "n_rejected": int(len(getattr(g, "rejected", [])))}
                           for g in groups],
                "snapshot": "stations.csv"},
            "window": {"first_day": days[0].isoformat(),
                       "last_day": days[-1].isoformat(), "n_days": len(days)}})
        write_station_snapshot(record.dir / "stations.csv", groups, days)

    for group in groups:
        group.build_basis(grid, dtype)
        is_rain = group.variables == ("rainfall",)

        mar_station = mar_grid = None
        is_ratio = is_rain and precip_method == RH.PRECIP_METHOD_RATIO_LENZ
        if is_ratio:
            # Asymmetric by design: the station denominator is UNSMOOTHED and
            # only the grid multiplier is low-passed. Smoothing both costs 4.7%
            # of the national rainfall level and the bake-off cannot see it,
            # because it scores at stations where the shift cancels.
            lat = group.stations["latitude"].to_numpy(float)
            lon = group.stations["longitude"].to_numpy(float)
            clim = RH.open_climatology(0.0)
            try:
                mar_station = RH.load_mar(lat, lon, "station", clim)
            finally:
                clim.close()
            clim = RH.open_climatology(mar_smooth_km)
            try:
                mar_grid = RH.load_mar(grid["latitude"].to_numpy(float),
                                       grid["longitude"].to_numpy(float),
                                       "grid", clim)
            finally:
                clim.close()

        for variable in group.variables:
            era = None
            if era_root is not None and variable != "rainfall":
                field_dir = era_root / variable
                if not field_dir.is_dir():
                    raise SystemExit(
                        f"--era-offset-root given but {field_dir} is missing. "
                        "Fetch it first:  aws s3 sync "
                        f"s3://auxein-climate-surfaces/_fields/era_offset/"
                        f"{variable}/ {field_dir}/")
                era = RH.EraOffset.load(field_dir, variable, template)
                era_meta[variable] = era.meta
            elif era_root is not None:
                log.info("[rainfall] era offset deliberately NOT applied")

            lapse = RH.LAPSE[variable]
            unit = RH.UNITS[variable]
            mv = MODEL_VERSION[variable]
            if era is None and variable != "rainfall":
                log.warning(
                    "[%s] NO era offset — publishing as %s would be "
                    "indistinguishable from the corrected era already in "
                    "surface_run", variable, mv)

            for d in days:
                df = group.day_frame(variable, d)
                if df is None:
                    skipped.append({"variable": variable, "date": d.isoformat(),
                                    "reason": "no data or fewer than "
                                              f"{MIN_STATIONS} stations"})
                    log.warning("[%s] %s skipped — insufficient stations",
                                variable, d)
                    continue

                # Screen against the NETWORK before fitting. Temperature only —
                # convective rain is genuinely cellular, so neighbour
                # disagreement is signal there, not error.
                if screen_outliers and variable != "rainfall":
                    df, dropped = tps.screen_outliers(
                        df, "value", z_cutoff=outlier_z,
                        min_abs=outlier_min_abs,
                        min_abs_cold=COLD_FLOOR.get(variable),
                        lapse_rate=lapse)
                    for _, r in dropped.iterrows():
                        log.warning(
                            "[%s] %s REJECTED station %s: %.2f vs neighbour "
                            "median %.2f (residual %+.2f, z %+.1f, n=%d)",
                            variable, d, r["station_id"], r["value"],
                            r["neighbour_median"], r["residual"],
                            r["robust_z"], r["n_neighbours"])
                        rejections.append({
                            "variable": variable, "date": d.isoformat(),
                            "station_id": int(r["station_id"]),
                            "value": float(r["value"]),
                            "neighbour_median": float(r["neighbour_median"]),
                            "residual": float(r["residual"]),
                            "robust_z": float(r["robust_z"]),
                            "n_neighbours": int(r["n_neighbours"])})
                    if len(df) < MIN_STATIONS:
                        skipped.append({"variable": variable,
                                        "date": d.isoformat(),
                                        "reason": "outlier screen left fewer "
                                                  f"than {MIN_STATIONS}"})
                        continue

                vals = df["value"].to_numpy()
                if is_ratio:
                    idx = group.basis.index_of(df["station_id"].tolist())
                    vals = vals / mar_station[idx]
                    df = df.assign(value=vals)

                try:
                    fit = tps.fit_surface(df, "value", lapse_rate=lapse,
                                          engine="ridge", origin=group.origin)
                except Exception as exc:                        # noqa: BLE001
                    skipped.append({"variable": variable,
                                    "date": d.isoformat(), "reason": str(exc)})
                    log.error("[%s] %s fit failed: %s", variable, d, exc)
                    continue

                cols = group.basis.index_of(
                    fit.fit_stations["station_id"].tolist())
                coeff = group.basis.coefficient_vector(cols, fit.model.c,
                                                       fit.model.d)
                block = group.basis.project(coeff[:, None], lapse_rate=lapse)
                if is_ratio:
                    block *= mar_grid[:, None]
                if variable == "rainfall":
                    # A smoothing spline overshoots negative around dry cells
                    # bordering wet ones, and a negative daily total would
                    # corrupt every downstream sum.
                    np.maximum(block, 0.0, out=block)
                if era is not None:
                    # Correct the DAY, so anything counted from it later
                    # (frost, days over 25) is counted against corrected
                    # temperatures rather than being unpublishable.
                    block -= era.for_month(d.month)[:, None]

                surface = block[:, 0].astype(np.float32, copy=False)
                del block

                key = daily_key(variable, d, res)
                tags = {
                    "variable": variable, "granularity": "daily",
                    "statistic": "", "valid_at": d.isoformat(),
                    "resolution_m": res, "model_version": mv,
                    "engine": "ridge", "contract_version": CONTRACT_VERSION,
                    "lapse_rate_c_per_100m": lapse,
                    "n_stations_fit": fit.n_fit, "n_stations_test": fit.n_test,
                    "cv_rmse": round(float(fit.cv_rmse), 4),
                    "cv_units": "ratio" if is_ratio else unit,
                    "projection_origin":
                        f"{group.basis.lat0:.5f},{group.basis.lon0:.5f}",
                    **({"precip_method": precip_method,
                        "mar_smooth_km": mar_smooth_km,
                        "climatology": "LENZ/NZEnvDS total annual "
                                       "precipitation v1.0 (Landcare "
                                       "Research, CC BY 4.0)"}
                       if is_ratio else {}),
                    **(era.tags() if era else {})}

                if not dry_run:
                    write_cog(out / key,
                              template.to_raster(surface), template,
                              max_z_error=DEFAULT_MAX_Z_ERROR.get(variable,
                                                                  0.01),
                              tags=tags)

                written.append({"variable": variable, "date": d.isoformat(),
                                "key": key, "model_version": mv,
                                "resolution_m": res,
                                "n_stations_fit": int(fit.n_fit),
                                "n_stations_test": int(fit.n_test),
                                "cv_rmse": float(fit.cv_rmse),
                                "cv_units": "ratio" if is_ratio else unit,
                                "median": float(np.median(surface)),
                                "min": float(surface.min()),
                                "max": float(surface.max()),
                                "era_offset_applied": era is not None})
                stats_rows.append({
                    "variable": variable, "valid_on": d.isoformat(),
                    "resolution_m": res, "model_version": mv,
                    "n_fit": fit.n_fit, "n_test": fit.n_test,
                    "cv_rmse": fit.cv_rmse, "rmse": fit.rmse,
                    "t_rmse": fit.t_rmse, "edf": fit.edf,
                    "lam": fit.smoothing,
                    "cv_units": "ratio" if is_ratio else unit})
                log.info("[%s] %s  n=%3d  cv_rmse %.3f  median %.2f",
                         variable, d, fit.n_fit, fit.cv_rmse,
                         np.median(surface))

        # Free the basis before the next group builds its own — two at once is
        # 6 GB on a box that has already OOM-killed one run.
        del group.basis

    # PERSISTENCE, not magnitude, separates a broken sensor from a real
    # microclimate. The exclusion rule this platform arrived at the hard way is
    # "non-stationary AND locally dominant, never high-bias": a frost hollow, an
    # inversion-top station at 1,622 m and a coastal site all disagree with
    # their neighbours by 8-10 degC, and all three do it EVERY winter, so no
    # magnitude test can tell them from a fault. A station tripping on most of
    # its days is a different animal — and it is a SOURCE problem. This screen
    # protects the surface; the station keeps poisoning `weather_data_daily`,
    # `climate_zone_daily`, disease and phenology until it is quarantined.
    if rejections:
        grouped: dict = {}
        for r in rejections:
            grouped.setdefault(r["station_id"], []).append(r)
        n_slots = len(days) * len([v for v in variables if v != "rainfall"])
        log.warning("outlier screen rejected %d station-days across %d "
                    "station(s)", len(rejections), len(grouped))
        for sid, rs in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
            rate = len(rs) / n_slots if n_slots else 0.0
            resid = [r["residual"] for r in rs]
            persistent = rate >= PERSISTENT_TRIP_RATE
            manifest_flags.append({
                "station_id": sid, "n_rejected": len(rs),
                "trip_rate": round(rate, 3),
                "residual_min": min(resid), "residual_max": max(resid),
                "variables": sorted({r["variable"] for r in rs}),
                "persistent": persistent})
            log.log(logging.ERROR if persistent else logging.WARNING,
                    "  station %s: %d/%d station-days (%.0f%%), residual "
                    "%+.2f..%+.2f%s", sid, len(rs), n_slots, 100 * rate,
                    min(resid), max(resid),
                    "  <-- PERSISTENT, candidate for source quarantine"
                    if persistent else "")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "days": [d.isoformat() for d in days],
        "variables": list(variables),
        "resolution_m": res,
        "model_versions": {v: MODEL_VERSION[v] for v in variables},
        "n_written": len(written), "n_skipped": len(skipped),
        "outlier_screen": {
            "enabled": screen_outliers, "z_cutoff": outlier_z,
            "min_abs": outlier_min_abs, "n_rejected": len(rejections),
            "by_station": manifest_flags,
            "rejections": rejections},
        "skipped": skipped, "surfaces": written,
    }
    if not dry_run:
        out.mkdir(parents=True, exist_ok=True)
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
        pd.DataFrame(stats_rows).to_csv(out / "validation_stats.csv",
                                        index=False)

    expected = len(days) * len(variables)
    log.info("\n%d surfaces written, %d skipped (expected up to %d)",
             len(written), len(skipped), expected)

    # Assert on a COUNT, not an exit code. A silent no-op reporting success is
    # this platform's failure mode #1: `run_ingestion` once printed "Found 0
    # active Harvest stations" and exited 0 for a whole fleet backfill.
    shortfall = None
    if require_days is not None:
        want = require_days * len(variables)
        if len(written) < want:
            shortfall = (f"wrote {len(written)} surfaces, required at least "
                         f"{want} ({require_days} days x {len(variables)} "
                         f"variables)")
    elif not written:
        shortfall = "wrote nothing — refusing to report success"

    # Closed BEFORE the raise. A run that published surfaces and then failed its
    # own gate is evidence — those surfaces are in the bucket and indexed — but
    # it is not `complete`, and stamping it complete would be exactly the silent
    # success the gate exists to prevent.
    if record is not None:
        stats = pd.DataFrame(stats_rows)
        record.close({
            "n_written": len(written), "n_skipped": len(skipped),
            "n_expected": expected,
            "outlier_rejections": len(rejections),
            "persistent_stations": [f["station_id"] for f in manifest_flags
                                    if f["persistent"]],
            "cv_rmse": {} if stats.empty else {
                v: {"median": float(g["cv_rmse"].median()),
                    "max": float(g["cv_rmse"].max()), "n": int(len(g))}
                for v, g in stats.groupby("variable")},
            "era_offset": era_meta or None,
            "shortfall": shortfall},
            status="incomplete" if shortfall else "complete")
    if shortfall:
        raise SystemExit(shortfall)

    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", help="single day, YYYY-MM-DD")
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--refit", action="store_true",
                    help="weekly catch-up window, D-9 .. D-3")
    ap.add_argument("--refit-from", type=int, default=9)
    ap.add_argument("--refit-to", type=int, default=3)
    ap.add_argument("--variables", default=",".join(ALL_VARIABLES))
    ap.add_argument("--inputs", type=Path, default=DEFAULT_INPUTS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--grid", type=Path, default=DEFAULT_GRID)
    ap.add_argument("--dtype", choices=["float32", "float64"],
                    default="float32")
    ap.add_argument("--era-offset-root", type=Path, default=DEFAULT_ERA_ROOT,
                    help="dir holding <variable>/offset_*.tif; --no-era-offset "
                         "to disable")
    ap.add_argument("--no-era-offset", action="store_true")
    ap.add_argument("--precip-method", default=RH.PRECIP_METHOD_RATIO_LENZ)
    ap.add_argument("--mar-smooth-km", type=float, default=RH.DEFAULT_SMOOTH_KM)
    ap.add_argument("--require-days", type=int, default=None)
    ap.add_argument("--no-outlier-screen", action="store_true",
                    help="fit without the neighbour screen (diagnostics only)")
    ap.add_argument("--outlier-z", type=float, default=tps.DEFAULT_OUTLIER_Z)
    ap.add_argument("--outlier-min-abs", type=float,
                    default=tps.DEFAULT_OUTLIER_MIN_ABS)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    days = parse_window(args)
    variables = tuple(v.strip() for v in args.variables.split(",") if v.strip())
    unknown = [v for v in variables if v not in ALL_VARIABLES]
    if unknown:
        raise SystemExit(f"unknown variable(s): {unknown}")

    log.info("days %s .. %s (%d), variables %s",
             days[0], days[-1], len(days), ", ".join(variables))

    run(days, variables, args.inputs, args.out, args.grid,
        np.dtype(args.dtype),
        None if args.no_era_offset else args.era_offset_root,
        args.precip_method, args.mar_smooth_km,
        require_days=args.require_days, dry_run=args.dry_run,
        screen_outliers=not args.no_outlier_screen,
        outlier_z=args.outlier_z, outlier_min_abs=args.outlier_min_abs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
