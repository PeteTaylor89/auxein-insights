"""Phase 2 — sample every published surface through the zone mask.

    python backend/scripts/aggregate_zone_monthly.py                  # all bands
    python backend/scripts/aggregate_zone_monthly.py --variable rainfall
    python backend/scripts/aggregate_zone_monthly.py --from-year 2020 --dry-run

Fills `climate_zone_surface_monthly`: for each zone, band and month, the surface
aggregated over that zone's planted cells, weighted by planted hectares.

## Windowed reads, not full rasters

Each zone's mask occupies a small, fixed bounding box. Reading the full
2667 x 2856 raster for every (band, month) would be ~5,500 full decompressions to
use a few hundred cells of each. Instead each zone reads only its own window —
the COG is tiled 512 x 512, so this is what the format exists for. The windows are
computed once, up front, and reused for every month.

## GDD is derived here, per cell, and that is not optional

`gdd10` is emitted as a statistic even though no COG holds it. GDD is convex in
the mean, so `GDD(mean of cells) != mean of GDD(cell)`, and the gap is a
systematic under-count at cool sites rather than noise. Evaluating per cell here
means the seasonal roll-up in Phase 3 is a plain sum over months.

## What is deliberately NOT solved here

Three seasonal metrics need per-cell logic ACROSS months and cannot be rebuilt
from these rows: the season's largest daily rainfall (`rx1day`), the pooled
`r99p`, and the last frost date. Aggregating monthly zone values first and
combining second gives a different answer — `max` of zone means is not the zone
mean of per-cell maxima. Phase 3 makes a second, narrow pass for those.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np                                                  # noqa: E402
from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402

BUCKET_ROOT = os.getenv(
    "SURFACE_MIRROR", "scratchpad/climate_history/bucket/surfaces/v2")

# The bands the product reads. Everything else in the archive stays unaggregated
# until something asks for it.
BANDS: dict[str, list[str]] = {
    "temp_mean": ["mean", "sd", "min", "max"],
    "temp_min": ["mean", "frost_days"],
    "temp_max": ["mean", "days_over_25", "days_over_30"],
    "rainfall": ["sum", "max", "wet_days", "days_over_10mm", "days_over_25mm",
                 "max_dry_spell"],
}

# DELIBERATELY EXCLUDED: `first_frost_day` / `last_frost_day` and the `argmin_day`
# / `argmax_day` indices. These are days-of-month with 0 meaning "never", so a
# weighted mean over cells is not a date — averaging "no frost" (0) against "the
# 28th" produces a number that looks like a date and is not one. They also need
# per-cell logic ACROSS months to answer the question anyone actually asks (when
# was the last spring frost), which this table's grain cannot express. Phase 3
# reads those bands straight from the surfaces instead.

GDD_BASE = 10.0


def surface_path(variable: str, statistic: str, year: int, month: int) -> str:
    return os.path.join(
        BUCKET_ROOT, variable, "monthly", str(year),
        f"{variable}_monthly_{year}{month:02d}_500m_{statistic}.tif")


def weighted_percentile(values: np.ndarray, weights: np.ndarray,
                        q: float) -> float:
    """Percentile over planted area, not over cells.

    A cell holding 18 ha of vineyard should count for more than one holding 0.2,
    or the spread describes the map rather than the growers on it.
    """
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = np.cumsum(w)
    if cum[-1] <= 0:
        return float("nan")
    return float(np.interp(q * cum[-1], cum, v))


def gdd_normal(mu: np.ndarray, sd: np.ndarray, n_days: float) -> np.ndarray:
    """Monthly GDD from the mean and SD of daily means.

    n*[(mu-B)*Phi(z) + sigma*phi(z)] with z = (mu-B)/sigma. The naive
    max(0, mu-B) under-counts by ~20% at cool sites, because daily temperatures
    straddle the base and only the excess counts. Never substitute it, and never
    drop `sd`.
    """
    sd = np.where(sd > 1e-6, sd, 1e-6)
    z = (mu - GDD_BASE) / sd
    phi = np.exp(-0.5 * z * z) / math.sqrt(2.0 * math.pi)
    return n_days * ((mu - GDD_BASE) * _ndtr(z) + sd * phi)


# scipy is on the workstation venv but NOT in backend/venv, which is the one EB
# installs — so the standard normal CDF is built from math.erf rather than
# adding a heavyweight dependency to the API's requirements for one call.
# math.erf is correctly rounded, so this is exact, not an approximation.
_erf = np.vectorize(math.erf, otypes=[np.float64])


def _ndtr(z: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + _erf(z / math.sqrt(2.0)))


def days_in_month(year: int, month: int) -> int:
    import calendar
    return calendar.monthrange(year, month)[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variable", action="append",
                    help="restrict to one or more variables")
    ap.add_argument("--from-year", type=int, default=None)
    ap.add_argument("--to-year", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import rasterio
    from rasterio.windows import Window

    db = SessionLocal()
    try:
        # --- the mask, grouped per zone, with a fixed read window each -------
        rows = db.execute(text("""
            SELECT m.zone_id, m.row, m.col, m.planted_ha, m.grid_key, z.name
              FROM climate_zone_cell_mask m
              JOIN climate_zones z ON z.id = m.zone_id
             ORDER BY m.zone_id
        """)).fetchall()
        if not rows:
            print("mask is empty — run build_zone_mask.py first")
            return 2

        grid_keys = {r.grid_key for r in rows}
        if len(grid_keys) != 1:
            print(f"mask spans multiple grids {grid_keys} — refusing to run")
            return 2
        grid_key = grid_keys.pop()

        per_zone: dict[int, dict] = {}
        grouped = defaultdict(list)
        for r in rows:
            grouped[r.zone_id].append(r)
        for zid, recs in grouped.items():
            rr = np.array([r.row for r in recs], dtype=np.int64)
            cc = np.array([r.col for r in recs], dtype=np.int64)
            per_zone[zid] = {
                "name": recs[0].name,
                "row0": int(rr.min()), "row1": int(rr.max()) + 1,
                "col0": int(cc.min()), "col1": int(cc.max()) + 1,
                "rows": rr, "cols": cc,
                "w": np.array([r.planted_ha for r in recs], dtype=np.float64),
            }
        print(f"{len(rows):,} mask cells over {len(per_zone)} zones\n"
              f"grid {grid_key}\n")

        # --- what to aggregate ----------------------------------------------
        variables = args.variable or list(BANDS)
        available = db.execute(text("""
            SELECT DISTINCT variable, statistic,
                   EXTRACT(YEAR FROM valid_at)::int  AS y,
                   EXTRACT(MONTH FROM valid_at)::int AS m,
                   model_version
              FROM surface_run
             WHERE granularity = 'monthly' AND variable = ANY(:vars)
             ORDER BY variable, statistic, y, m
        """), {"vars": variables}).fetchall()

        wanted = {(v, s) for v in variables for s in BANDS.get(v, [])}
        todo = [r for r in available if (r.variable, r.statistic) in wanted]
        if args.from_year:
            todo = [r for r in todo if r.y >= args.from_year]
        if args.to_year:
            todo = [r for r in todo if r.y <= args.to_year]

        # GDD needs mean and sd of the same month, so it rides along with the
        # temp_mean/mean pass rather than being scheduled separately.
        months_for_gdd = sorted({(r.y, r.m, r.model_version) for r in todo
                                 if r.variable == "temp_mean"
                                 and r.statistic == "mean"})
        print(f"{len(todo):,} (band, month) surfaces to aggregate"
              f" + {len(months_for_gdd):,} derived gdd10\n")

        out: list[tuple] = []
        missing = 0
        done = 0

        def aggregate(variable, statistic, year, month, values_by_zone,
                      model_version):
            for zid, vals in values_by_zone.items():
                z = per_zone[zid]
                good = np.isfinite(vals)
                if not good.any():
                    continue
                v, w = vals[good], z["w"][good]
                out.append((
                    zid, variable, statistic, year, month,
                    float(np.average(v, weights=w)),
                    float(v.min()), float(v.max()),
                    weighted_percentile(v, w, 0.10),
                    weighted_percentile(v, w, 0.90),
                    int(good.sum()), float(w.sum()), grid_key, model_version,
                ))

        def read_band(variable, statistic, year, month):
            """Values at every zone's mask cells, via per-zone windowed reads."""
            path = surface_path(variable, statistic, year, month)
            if not os.path.exists(path):
                return None
            result = {}
            with rasterio.open(path) as ds:
                nodata = ds.nodata
                for zid, z in per_zone.items():
                    win = Window(z["col0"], z["row0"],
                                 z["col1"] - z["col0"], z["row1"] - z["row0"])
                    arr = ds.read(1, window=win)
                    vals = arr[z["rows"] - z["row0"],
                               z["cols"] - z["col0"]].astype(np.float64)
                    if nodata is not None:
                        vals[vals == nodata] = np.nan
                    result[zid] = vals
            return result

        for rec in todo:
            vals = read_band(rec.variable, rec.statistic, rec.y, rec.m)
            if vals is None:
                missing += 1
                continue
            aggregate(rec.variable, rec.statistic, rec.y, rec.m, vals,
                      rec.model_version)
            done += 1
            if done % 500 == 0:
                print(f"  {done:,}/{len(todo):,} surfaces")

        # --- derived gdd10 ---------------------------------------------------
        for year, month, model_version in months_for_gdd:
            mu = read_band("temp_mean", "mean", year, month)
            sd = read_band("temp_mean", "sd", year, month)
            if mu is None or sd is None:
                missing += 1
                continue
            gdd = {zid: gdd_normal(mu[zid], sd[zid], days_in_month(year, month))
                   for zid in mu}
            aggregate("temp_mean", "gdd10", year, month, gdd, model_version)

        print(f"\n{len(out):,} rows aggregated"
              + (f", {missing} surfaces missing from the mirror" if missing else ""))

        if args.dry_run:
            _preview(out)
            print("\ndry run — nothing written")
            return 0

        from psycopg2.extras import execute_values
        raw = db.connection().connection
        with raw.cursor() as cur:
            execute_values(cur, """
                INSERT INTO climate_zone_surface_monthly
                    (zone_id, variable, statistic, year, month, mean, min, max,
                     p10, p90, n_cells, planted_ha, grid_key, model_version)
                VALUES %s
                ON CONFLICT (zone_id, variable, statistic, year, month)
                DO UPDATE SET mean = EXCLUDED.mean, min = EXCLUDED.min,
                              max = EXCLUDED.max, p10 = EXCLUDED.p10,
                              p90 = EXCLUDED.p90, n_cells = EXCLUDED.n_cells,
                              planted_ha = EXCLUDED.planted_ha,
                              grid_key = EXCLUDED.grid_key,
                              model_version = EXCLUDED.model_version
            """, out, page_size=5000)
        db.commit()
        print("written")
        return 0
    finally:
        db.close()


def _preview(out: list[tuple]) -> None:
    """A couple of recognisable rows, so a dry run is actually checkable."""
    by = {(r[1], r[2]) for r in out}
    print("\nbands aggregated:", ", ".join(sorted(f"{v}/{s}" for v, s in by)))
    sample = [r for r in out if r[1] == "temp_mean" and r[2] == "gdd10"
              and r[3] == 2023 and r[4] == 1]
    for r in sorted(sample, key=lambda x: -x[5])[:5]:
        print(f"  zone {r[0]:>3}  Jan 2023 gdd10 mean {r[5]:7.1f}"
              f"  p10 {r[8]:7.1f}  p90 {r[9]:7.1f}  cells {r[10]}")


if __name__ == "__main__":
    raise SystemExit(main())
