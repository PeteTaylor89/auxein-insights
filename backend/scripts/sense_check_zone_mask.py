"""Sense-check the climate zone mask by sampling real surfaces through it.

    python backend/scripts/sense_check_zone_mask.py --mask scratchpad/zone_mask.npz

Two questions, and the second is the one that matters:

1. **Are the numbers plausible?** Growing-season means, GDD, frost and rainfall
   per zone, against what is actually known about New Zealand viticulture.
   Northland warm, Central Otago cold and frosty, Marlborough dry.

2. **Does block-intersecting actually change the answer?** The same statistic is
   computed a second way — an unweighted mean over every cell inside the zone
   POLYGON — which is what `SURFACE_CONTRACT_V2` §5.2 originally specified. If
   the two agree everywhere, D-C bought nothing and the mask is overhead. If they
   diverge in the zones with mountains in them, the mask is doing its job.

Season is Sep-Apr, labelled by the ending (vintage) year.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np                                                  # noqa: E402
from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402

BUCKET_ROOT = "scratchpad/climate_history/bucket/surfaces/v2"
SEASON_MONTHS = [(9, -1), (10, -1), (11, -1), (12, -1),
                 (1, 0), (2, 0), (3, 0), (4, 0)]     # (month, year offset)
GDD_BASE = 10.0
DAYS_IN = {1: 31, 2: 28.25, 3: 31, 4: 30, 9: 30, 10: 31, 11: 30, 12: 31}


def surface_path(variable: str, statistic: str, year: int, month: int) -> str:
    return os.path.join(
        BUCKET_ROOT, variable, "monthly", str(year),
        f"{variable}_monthly_{year}{month:02d}_500m_{statistic}.tif")


def read_cells(path: str, rows: np.ndarray, cols: np.ndarray):
    """Values at the mask cells, with nodata as NaN."""
    import rasterio
    with rasterio.open(path) as ds:
        arr = ds.read(1)
        nodata = ds.nodata
    vals = arr[rows, cols].astype(np.float64)
    if nodata is not None:
        vals[vals == nodata] = np.nan
    return vals


def gdd_normal(mu: np.ndarray, sd: np.ndarray, n_days: float,
               base: float = GDD_BASE) -> np.ndarray:
    """Monthly GDD from the mean and SD of daily means.

    n*[(mu-B)*Phi(z) + sigma*phi(z)], z=(mu-B)/sigma. Naive max(0, mu-B)
    under-counts by ~20% at cool sites because daily temperatures vary either
    side of the base; this is the same formula the history backfill uses and it
    must never be replaced with the naive one.
    """
    sd = np.where(sd > 1e-6, sd, 1e-6)
    z = (mu - base) / sd
    phi = np.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)
    Phi = 0.5 * (1.0 + np.vectorize(math.erf)(z / math.sqrt(2)))
    return n_days * ((mu - base) * Phi + sd * phi)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mask", default="scratchpad/zone_mask.npz")
    ap.add_argument("--from-season", type=int, default=2014)
    ap.add_argument("--to-season", type=int, default=2023)
    args = ap.parse_args()

    m = np.load(args.mask, allow_pickle=True)
    zone_meta = json.loads(str(m["zone_meta"]))
    zid_all, row_all, col_all = m["zone_id"], m["row"], m["col"]
    ha_all = m["planted_ha"]

    seasons = list(range(args.from_season, args.to_season + 1))
    print(f"mask {len(zid_all):,} cells | seasons {seasons[0]}-{seasons[-1]} "
          f"(Sep-Apr, {len(seasons)} seasons)\n")

    # Cells inside each zone POLYGON, for the area-weighted control.
    db = SessionLocal()
    poly_cells: dict[int, tuple[np.ndarray, np.ndarray]] = {}
    # DISTINCT blocks per zone. Summing the mask's per-cell `block_count` would
    # count a block once per cell it touches, which roughly triples Marlborough.
    distinct_blocks = dict(db.execute(text("""
        SELECT z.id, count(DISTINCT b.id)
          FROM climate_zones z
          LEFT JOIN vineyard_blocks b
            ON b.geometry IS NOT NULL AND b.company_id IS NULL
           AND ST_Intersects(b.geometry, z.geometry)
         WHERE z.geometry IS NOT NULL
         GROUP BY z.id
    """)).fetchall())
    try:
        import rasterio
        from rasterio.features import rasterize
        from shapely import wkb
        from shapely.geometry import mapping

        ref = surface_path("temp_mean", "mean", 2020, 1)
        with rasterio.open(ref) as ds:
            transform, width, height = ds.transform, ds.width, ds.height

        for zid in sorted({int(z) for z in zid_all}):
            g = db.execute(text("SELECT ST_AsBinary(geometry) AS g "
                                "FROM climate_zones WHERE id=:i"),
                           {"i": zid}).scalar()
            geom = wkb.loads(bytes(g))
            burned = rasterize([(mapping(geom), 1)], out_shape=(height, width),
                               transform=transform, fill=0, dtype="uint8")
            r, c = np.nonzero(burned)
            poly_cells[zid] = (r, c)
    finally:
        db.close()

    # Accumulate season sums per zone across all mask cells at once.
    zones = sorted({int(z) for z in zid_all},
                   key=lambda z: zone_meta[str(z)]["name"])
    acc = {z: {"tmean": [], "gdd": [], "frost": [], "rain": [],
               "poly_tmean": []} for z in zones}

    for season in seasons:
        t_sum = np.zeros(len(row_all))
        t_days = 0.0
        gdd = np.zeros(len(row_all))
        frost = np.zeros(len(row_all))
        rain = np.zeros(len(row_all))
        poly_t = {z: 0.0 for z in zones}

        for month, offset in SEASON_MONTHS:
            year = season + offset
            n = DAYS_IN[month]
            mu = read_cells(surface_path("temp_mean", "mean", year, month),
                            row_all, col_all)
            sd = read_cells(surface_path("temp_mean", "sd", year, month),
                            row_all, col_all)
            t_sum += mu * n
            t_days += n
            gdd += gdd_normal(mu, sd, n)
            frost += read_cells(surface_path("temp_min", "frost_days", year, month),
                                row_all, col_all)
            rain += read_cells(surface_path("rainfall", "sum", year, month),
                               row_all, col_all)

            # Polygon control, unweighted over every cell in the zone.
            with __import__("rasterio").open(
                    surface_path("temp_mean", "mean", year, month)) as ds:
                arr = ds.read(1)
                nod = ds.nodata
            for z in zones:
                r, c = poly_cells[z]
                v = arr[r, c].astype(np.float64)
                if nod is not None:
                    v[v == nod] = np.nan
                poly_t[z] += np.nanmean(v) * n

        tmean = t_sum / t_days
        for z in zones:
            sel = zid_all == z
            w = ha_all[sel]
            for key, vals in (("tmean", tmean[sel]), ("gdd", gdd[sel]),
                              ("frost", frost[sel]), ("rain", rain[sel])):
                good = np.isfinite(vals)
                acc[z][key].append(np.average(vals[good], weights=w[good])
                                   if good.any() else np.nan)
            acc[z]["poly_tmean"].append(poly_t[z] / t_days)

    # --- report -------------------------------------------------------------

    print(f"{'zone':<34}{'lvl':<9}{'blocks':>7}{'cells':>7}{'ha':>8}"
          f"{'tmean':>8}{'GDD':>7}{'frost':>7}{'rain':>7}")
    print("-" * 100)
    rows = []
    for z in zones:
        sel = zid_all == z
        meta = zone_meta[str(z)]
        rows.append((meta["name"], meta["level"], int(distinct_blocks.get(z, 0)),
                     int(sel.sum()), ha_all[sel].sum(),
                     np.nanmean(acc[z]["tmean"]), np.nanmean(acc[z]["gdd"]),
                     np.nanmean(acc[z]["frost"]), np.nanmean(acc[z]["rain"]),
                     np.nanmean(acc[z]["poly_tmean"])))
    for r in sorted(rows, key=lambda x: -x[5]):
        print(f"{r[0]:<34}{r[1]:<9}{r[2]:>7}{r[3]:>7}{r[4]:>8.0f}"
              f"{r[5]:>8.1f}{r[6]:>7.0f}{r[7]:>7.1f}{r[8]:>7.0f}")

    print("\nblock-intersected vs whole-polygon mean (Sep-Apr temp, degC)")
    print(f"{'zone':<34}{'blocks':>9}{'polygon':>9}{'diff':>8}")
    print("-" * 62)
    for r in sorted(rows, key=lambda x: -(x[5] - x[9])):
        print(f"{r[0]:<34}{r[5]:>9.2f}{r[9]:>9.2f}{r[5] - r[9]:>+8.2f}")

    # Spread WITHIN a zone, using the most recent season.
    print("\nwithin-zone spread of season mean temp, most recent season "
          f"({seasons[-1]})")
    print(f"{'zone':<34}{'min':>7}{'mean':>7}{'max':>7}{'range':>7}")
    print("-" * 62)
    t_sum = np.zeros(len(row_all))
    t_days = 0.0
    for month, offset in SEASON_MONTHS:
        n = DAYS_IN[month]
        t_sum += read_cells(surface_path("temp_mean", "mean",
                                         seasons[-1] + offset, month),
                            row_all, col_all) * n
        t_days += n
    tmean = t_sum / t_days
    spread = []
    for z in zones:
        sel = zid_all == z
        v = tmean[sel][np.isfinite(tmean[sel])]
        if v.size:
            spread.append((zone_meta[str(z)]["name"], v.min(),
                           np.average(tmean[sel][np.isfinite(tmean[sel])],
                                      weights=ha_all[sel][np.isfinite(tmean[sel])]),
                           v.max()))
    for name, lo, mu, hi in sorted(spread, key=lambda x: -(x[3] - x[1])):
        print(f"{name:<34}{lo:>7.1f}{mu:>7.1f}{hi:>7.1f}{hi - lo:>7.1f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
