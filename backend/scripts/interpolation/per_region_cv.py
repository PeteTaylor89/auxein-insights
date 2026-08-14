"""Per-region cross-validated accuracy, instead of one national number.

The published cv_rmse is a single national figure per variable (temp_mean 1.153,
temp_max 1.411, temp_min 1.826, rainfall dimensionless). That number is dominated
by the Southern Alps: it is pessimistic for flat, densely instrumented country
like Marlborough or the Wairarapa, and it is the only figure `ConfidenceBadge`
can currently show. Publishing it region-by-region is the difference between an
honest frost product and a usable one.

Cheap, because the residuals already exist. `tps._cv_rmse_shuffled` computes an
out-of-fold residual per fitted station and (until 2026-08-14) discarded it,
returning only its RMS. This script re-fits a sample of days, keeps those
residuals, and attributes them to regions.

**Fit-only.** No grid basis, no projection, no COGs - which is ~60% of a backfill
run - so this costs single-digit minutes per variable rather than 50-160.

    python backend/scripts/interpolation/per_region_cv.py
    python backend/scripts/interpolation/per_region_cv.py --variables temp_min

Two things it does NOT do, deliberately:
  * It does not re-run the backfill. The published rasters are untouched.
  * It does not claim these are independent-validation numbers. They are
    cross-validation AT STATIONS, so they measure how well we predict where we
    already observe. In a dense flat region that flatters us relative to remote
    terrain inside the same region. Report the station count alongside.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation import tps                                  # noqa: E402
from scripts.interpolation.run_history import (LAPSE, UNITS, DEFAULT_INPUTS,  # noqa: E402
                                               DEFAULT_GRID, LENZ_MAR,
                                               PRECIP_METHOD_RATIO_LENZ,
                                               load_inputs, load_mar)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("perregion")
logging.getLogger("tps").setLevel(logging.ERROR)      # silence per-fit GCV chatter

REPO = Path(__file__).resolve().parents[3]
OUT_DIR = REPO / "scratchpad" / "per_region_cv"


def sample_days(dates: list, per_month: int) -> list:
    """One (or `per_month`) day from every calendar month in the record.

    Sampling by month rather than by a fixed stride keeps seasons balanced -
    a stride of ~38 days would beat against the annual cycle and could
    over-represent one part of the year, which matters a great deal for a
    variable like frost.
    """
    by_month: dict = {}
    for i, d in enumerate(dates):
        by_month.setdefault((d.year, d.month), []).append(i)
    out = []
    for key in sorted(by_month):
        idx = by_month[key]
        step = max(1, len(idx) // (per_month + 1))
        out.extend(idx[step::step][:per_month] or idx[:per_month])
    return sorted(set(out))


def grid_origin(grid_csv: Path) -> tuple:
    """Match production exactly: the origin is the grid centroid (fastgrid.py)."""
    g = pd.read_csv(grid_csv, usecols=lambda c: c.strip().lower() in
                    ("latitude", "longitude", "lat", "lon"))
    g.columns = [c.strip().lower() for c in g.columns]
    lat = g["latitude"] if "latitude" in g else g["lat"]
    lon = g["longitude"] if "longitude" in g else g["lon"]
    return float(lat.mean()), float(lon.mean())


def collect_residuals(variable: str, inputs: Path, origin: tuple,
                      per_month: int) -> pd.DataFrame:
    """Re-fit sampled days and return one row per (station, day) residual."""
    values, stations, dates = load_inputs(inputs, variable)
    lapse = LAPSE[variable]
    is_ratio = variable == "rainfall"

    mar = None
    if is_ratio:
        mar = load_mar(stations["latitude"].to_numpy(float),
                       stations["longitude"].to_numpy(float), "station")

    sid = stations["station_id"].to_numpy()
    lat = stations["latitude"].to_numpy(float)
    lon = stations["longitude"].to_numpy(float)
    elev = stations["elevation"].to_numpy(float)

    days = sample_days(dates, per_month)
    log.info("[%s] %d sampled days over %d stations", variable, len(days), len(sid))

    rows = []
    for k, i in enumerate(days):
        row = values[i]
        ok = np.isfinite(row)
        if ok.sum() < 20:
            continue
        vals = row[ok].astype(float)
        if is_ratio:
            vals = vals / mar[ok]
        df = pd.DataFrame({"station_id": sid[ok], "latitude": lat[ok],
                           "longitude": lon[ok], "elevation": elev[ok],
                           "value": vals})
        try:
            fit = tps.fit_surface(df, "value", lapse_rate=lapse, engine="ridge",
                                  origin=origin)
        except Exception as exc:                                   # noqa: BLE001
            log.warning("[%s] %s skipped: %s", variable, dates[i], exc)
            continue
        r = fit.cv_residuals
        if r is None:
            raise SystemExit("tps.fit_surface did not return cv_residuals - "
                             "the _cv_rmse_shuffled change is missing")
        fs = fit.fit_stations
        keep = np.isfinite(r)
        resid = r[keep]
        st = fs["station_id"].to_numpy()[keep]
        if is_ratio:
            # Ratio residuals are dimensionless. Convert with EACH station's own
            # climatology - a single scale factor would be a fabricated number.
            m = pd.Series(mar, index=sid)
            resid = resid * m.reindex(st).to_numpy()
        rows.append(pd.DataFrame({"station_id": st, "date": dates[i],
                                  "residual": resid}))
        if (k + 1) % 100 == 0:
            log.info("[%s] %d/%d days", variable, k + 1, len(days))

    out = pd.concat(rows, ignore_index=True)
    log.info("[%s] %d station-day residuals from %d days", variable, len(out),
             out.date.nunique())
    return out


ZONE_SHAPEFILES = REPO / "backend" / "data" / "Climate_Zones"


def assign_regions(stations: pd.DataFrame, buffer_km: float = 0.0) -> pd.DataFrame:
    """Map stations to Insights climate zones by point-in-polygon.

    Reads the shapefiles in `backend/data/Climate_Zones/` directly - the same
    source `load_climate_zone_geometry.py` loads into `climate_zones.geometry`,
    which is what the Insights map renders. Reading the files avoids a DB
    dependency and avoids the trap that bit this script's first version: the
    LOCAL database's `climate_zones` is EMPTY and has no geometry column at all,
    so querying it silently suggests zones do not exist. They do; the local DB is
    just behind.

    Why zones rather than `geographical_indications`: GIs are administrative wine
    regions and far too coarse to attribute error. The Marlborough GI is
    12,344 km2 spanning the Sounds and the inland ranges, so scoring against it
    mixes valley-floor vineyards with alpine terrain and produces a figure that
    describes neither. The zone layer splits the same ground into Awatere, Lower
    Wairau, and Upper Wairau and Southern Valleys - which is what a grower means
    by their region.

    Zones may overlap or nest, so membership is many-to-many by design: a station
    counts toward every zone containing it. The rows are NOT a partition and must
    not be summed.

    `buffer_km` optionally widens each zone. Zones are small, so a station just
    outside the boundary is still informative about it; 0 keeps it strict.
    """
    import geopandas as gpd
    from shapely.ops import unary_union

    shp = sorted(ZONE_SHAPEFILES.glob("*.shp"))
    if not shp:
        raise SystemExit(f"no zone shapefiles in {ZONE_SHAPEFILES}")

    pts = gpd.GeoDataFrame(
        stations[["station_id"]].copy(),
        geometry=gpd.points_from_xy(stations["longitude"], stations["latitude"]),
        crs="EPSG:4326")

    rows = []
    for p in shp:
        # engine="pyogrio" is required, not a preference: geopandas here falls
        # back to a fiona whose version does not expose `fiona.path`, and
        # read_file then dies before it opens anything.
        g = gpd.read_file(p, engine="pyogrio")
        if g.crs is None:
            g.set_crs("EPSG:4326", inplace=True)
        g = g.to_crs("EPSG:4326")
        geom = unary_union(g.geometry.values)          # one shapefile == one zone
        if buffer_km > 0:
            # buffer in metres via an equal-area projection, then back
            geom = (gpd.GeoSeries([geom], crs="EPSG:4326").to_crs(2193)
                    .buffer(buffer_km * 1000).to_crs(4326).iloc[0])
        hit = pts[pts.within(geom)]
        for sid in hit["station_id"]:
            rows.append({"station_id": int(sid), "name": p.stem})

    got = pd.DataFrame(rows, columns=["station_id", "name"])
    log.info("zone assignment: %d station-zone memberships over %d stations, "
             "%d zones with at least one station (of %d)", len(got),
             got.station_id.nunique() if len(got) else 0,
             got.name.nunique() if len(got) else 0, len(shp))
    return got


def summarise(resid: pd.DataFrame, members: pd.DataFrame, unit: str) -> pd.DataFrame:
    def stats(g, label, n_st):
        e = g["residual"].to_numpy()
        return {"region": label, "n_stations": n_st, "n_station_days": len(e),
                "rmse": float(np.sqrt(np.mean(e ** 2))),
                "mae": float(np.mean(np.abs(e))),
                "bias": float(np.mean(e)), "unit": unit}

    rows = [stats(resid, "NATIONAL (all stations)", resid.station_id.nunique())]
    j = resid.merge(members, on="station_id", how="inner")
    for name, g in j.groupby("name"):
        if g.station_id.nunique() < 2:
            continue
        rows.append(stats(g, name, g.station_id.nunique()))
    outside = resid[~resid.station_id.isin(members.station_id)]
    if len(outside):
        rows.append(stats(outside, "outside any zone", outside.station_id.nunique()))
    return pd.DataFrame(rows).sort_values("rmse").reset_index(drop=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variables", default="temp_mean,temp_max,temp_min,rainfall")
    ap.add_argument("--inputs", default=str(DEFAULT_INPUTS))
    ap.add_argument("--grid", default=str(DEFAULT_GRID))
    ap.add_argument("--per-month", type=int, default=1,
                    help="days sampled per calendar month (456 months in record)")
    ap.add_argument("--buffer-km", type=float, default=0.0,
                    help="widen each zone; zones are small and only ~10%% of "
                         "stations fall strictly inside one")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    origin = grid_origin(Path(args.grid))
    log.info("projection origin %.5f, %.5f (grid centroid, matches production)", *origin)

    for variable in args.variables.split(","):
        variable = variable.strip()
        unit = "mm" if variable == "rainfall" else UNITS[variable]
        resid = collect_residuals(variable, Path(args.inputs), origin, args.per_month)
        _, stations, _ = load_inputs(Path(args.inputs), variable)
        members = assign_regions(stations, buffer_km=args.buffer_km)
        table = summarise(resid, members, unit)

        resid.to_csv(OUT_DIR / f"{variable}_residuals.csv", index=False)
        table.to_csv(OUT_DIR / f"{variable}_by_region.csv", index=False)

        natl = table.loc[table.region.str.startswith("NATIONAL"), "rmse"].iloc[0]
        print(f"\n=== {variable} ({unit}) — CV RMSE by wine GI ===")
        print(f"{'region':<34}{'stns':>5}{'st-days':>9}{'rmse':>9}{'vs natl':>9}"
              f"{'bias':>9}")
        for r in table.itertuples():
            print(f"{r.region:<34}{r.n_stations:>5}{r.n_station_days:>9}"
                  f"{r.rmse:>9.3f}{100*(r.rmse/natl-1):>+8.0f}%{r.bias:>9.3f}")
    print(f"\nwritten to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
