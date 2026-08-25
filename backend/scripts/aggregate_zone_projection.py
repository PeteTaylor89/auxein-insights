"""Sample every projection surface through the zone mask.

    backend/venv/Scripts/python.exe backend/scripts/aggregate_zone_projection.py --dry-run
    backend/venv/Scripts/python.exe backend/scripts/aggregate_zone_projection.py

Fills `climate_zone_projection`: for each zone, scenario, period, season and
band, the projected surface aggregated over that zone's planted cells and
weighted by planted hectares — the same treatment `aggregate_zone_monthly.py`
gives the historical archive, and deliberately the same code shape.

`SURFACE_MIRROR` must point at the bucket mirror. It defaults to a RELATIVE
path, which resolves to nothing when this is run from `backend/` and reports
every surface as missing rather than failing — the same trap the monthly job
has. Pass it absolutely.

## What the rasters hold

The **projected absolute**, not the delta. MfE publishes change fields; the
publish step composed them onto our own 1986-2005 normals, so a cell holds
"what this place looks like under this scenario". The rasters are on our exact
grid (2667 x 2856, 1,429,944 land cells), which is why the existing zone mask
applies unchanged and no reprojection is needed.

## The delta is computed against OUR baseline, and it has to be

`delta = projected - baseline`, where the baseline is this zone's own
1986-2005 normal out of the archive — not MfE's, and not a number carried on
the raster. That is not a shortcut: the surfaces were built as
`our_normal + MfE_change`, so subtracting our normal is what recovers the change
MfE actually published. Using anything else would double-count the composition.

`surface_projection_run.baseline_median` exists but is NATIONAL. A national
median is the wrong baseline for Central Otago and this never reads it.

## Seasons

`SEPAPR` is the growing season and is what the product wants. The rest — ANN and
the four meteorological seasons — are aggregated too, because they are already
published and skipping them would mean re-running this to get them. The client
picks; this stores everything.

## Warming levels are included

`wl1.5`, `wl2`, `wl3` sit alongside the `fp*` periods. They are more honest than
a calendar period and harder to explain, so nothing shows them yet — but they
cost nothing to aggregate now and would cost a re-run later.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np                                                  # noqa: E402

from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402

BUCKET_ROOT = os.getenv(
    "SURFACE_MIRROR", "scratchpad/climate_history/bucket/surfaces/v2")

# Which archive metric supplies the 1986-2005 baseline for each projected band.
# `season` says which table to read it from: SEPAPR bands compare against the
# seasonal roll-up, everything else against the monthly one reduced the same way
# the projection's own season covers.
#
# A band with no archive equivalent is aggregated anyway and simply carries a
# NULL baseline and NULL delta — better than omitting the projection.
BASELINE_METRIC = {
    ("gdd10", "cumulative"): "gdd10",
    ("rainfall", "sum"): "rain",
    ("temp_mean", "mean"): "tmean",
    ("temp_min", "mean"): "tmin",
    ("temp_max", "mean"): "tmax",
    ("temp_min", "frost_days"): "frost_days",
    ("temp_max", "days_over_25"): "hot_days_25",
    ("temp_max", "days_over_30"): "hot_days_30",
}

BASELINE_LO, BASELINE_HI = 1986, 2005


def weighted_percentile(values: np.ndarray, weights: np.ndarray,
                        q: float) -> float:
    """Percentile over planted area, not over cells.

    Same estimator as the monthly job: a cell holding 18 ha of vineyard should
    count for more than one holding 0.2, or the spread describes the map rather
    than the growers on it.
    """
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = np.cumsum(w)
    if cum[-1] <= 0:
        return float("nan")
    return float(np.interp(q * cum[-1], cum, v))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--scenario", action="append",
                    help="restrict to one scenario (repeatable)")
    ap.add_argument("--season", action="append",
                    help="restrict to one season, e.g. SEPAPR (repeatable)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    import rasterio
    from rasterio.windows import Window

    # PostGIS sets a machine-level PROJ_LIB with an older proj.db, and CRS
    # lookups then fail as a GDAL log line rather than an exception.
    from scripts.interpolation.raster import _configure_proj
    _configure_proj()

    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT m.zone_id, m.row, m.col, m.planted_ha, m.grid_key
              FROM climate_zone_cell_mask m
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
                "row0": int(rr.min()), "row1": int(rr.max()) + 1,
                "col0": int(cc.min()), "col1": int(cc.max()) + 1,
                "rows": rr, "cols": cc,
                "w": np.array([r.planted_ha for r in recs], dtype=np.float64),
            }
        print(f"{len(rows):,} mask cells over {len(per_zone)} zones")
        print(f"grid {grid_key}\n")

        # --- the 1986-2005 baseline, per zone and metric --------------------
        # SEPAPR bands compare against the SEASONAL roll-up, because that is
        # what a Sep-Apr projection is a projection OF.
        season_base = {}
        for r in db.execute(text("""
            SELECT zone_id, metric, avg(mean) AS m
              FROM climate_zone_surface_season
             WHERE vintage_year BETWEEN :lo AND :hi
             GROUP BY zone_id, metric
        """), {"lo": BASELINE_LO, "hi": BASELINE_HI}).mappings():
            season_base[(r["zone_id"], r["metric"])] = float(r["m"])

        # Annual and meteorological-season bands compare against the monthly
        # archive. A sum band (rain, day counts, GDD) sums over the months; a
        # mean band averages them.
        MONTHS = {
            "ANN": (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
            "DJF": (12, 1, 2), "MAM": (3, 4, 5),
            "JJA": (6, 7, 8), "SON": (9, 10, 11),
        }
        SUMMED = {"gdd10", "rain", "frost_days", "hot_days_25", "hot_days_30"}
        MONTHLY_SRC = {
            "gdd10": ("temp_mean", "gdd10"), "rain": ("rainfall", "sum"),
            "tmean": ("temp_mean", "mean"), "tmin": ("temp_min", "mean"),
            "tmax": ("temp_max", "mean"),
            "frost_days": ("temp_min", "frost_days"),
            "hot_days_25": ("temp_max", "days_over_25"),
            "hot_days_30": ("temp_max", "days_over_30"),
        }
        monthly_base: dict[tuple, float] = {}
        for metric, (var, stat) in MONTHLY_SRC.items():
            for season, months in MONTHS.items():
                agg = "sum" if metric in SUMMED else "avg"
                # Per year first, then across years — summing straight over all
                # baseline rows would give a 20-year total, not a normal.
                for r in db.execute(text(f"""
                    SELECT zone_id, avg(v) AS m FROM (
                      SELECT zone_id, year, {agg}(mean) AS v
                        FROM climate_zone_surface_monthly
                       WHERE variable = :var AND statistic = :stat
                         AND year BETWEEN :lo AND :hi AND month = ANY(:months)
                       GROUP BY zone_id, year) t
                    GROUP BY zone_id
                """), {"var": var, "stat": stat, "lo": BASELINE_LO,
                       "hi": BASELINE_HI,
                       "months": list(months)}).mappings():
                    monthly_base[(r["zone_id"], metric, season)] = float(r["m"])

        # --- what to aggregate ----------------------------------------------
        # `kind = 'projection'` is NOT optional. Since 2026-08-25 this table
        # also holds the 36 rows of our own 1986-2005 baseline, keyed with the
        # 'baseline' sentinel in scenario and period. Without this filter they
        # would be aggregated in AS SCENARIOS — a present-day normal written
        # into `climate_zone_projection` under scenario 'baseline', which no
        # constraint would catch because every column is individually valid.
        q = ("SELECT * FROM surface_projection_run "
             "WHERE status = 'ok' AND kind = 'projection'")
        params: dict = {}
        if args.scenario:
            q += " AND scenario = ANY(:sc)"
            params["sc"] = args.scenario
        if args.season:
            q += " AND season = ANY(:se)"
            params["se"] = args.season
        q += " ORDER BY variable, statistic, scenario, period, season"
        todo = db.execute(text(q), params).mappings().all()
        print(f"{len(todo):,} projection surfaces to aggregate\n")

        out: list[tuple] = []
        missing = 0

        for p in todo:
            path = os.path.join(BUCKET_ROOT, *p["s3_key"].split("/")[2:])
            if not os.path.exists(path):
                missing += 1
                continue

            metric = BASELINE_METRIC.get((p["variable"], p["statistic"]))
            with rasterio.open(path) as ds:
                nodata = ds.nodata
                for zid, z in per_zone.items():
                    win = Window(z["col0"], z["row0"],
                                 z["col1"] - z["col0"], z["row1"] - z["row0"])
                    arr = ds.read(1, window=win)
                    vals = arr[z["rows"] - z["row0"],
                               z["cols"] - z["col0"]].astype(np.float64)
                    if nodata is not None:
                        vals = np.where(vals == nodata, np.nan, vals)
                    good = np.isfinite(vals)
                    if not good.any():
                        continue
                    v, w = vals[good], z["w"][good]
                    projected = float(np.average(v, weights=w))

                    base = None
                    if metric:
                        base = (season_base.get((zid, metric))
                                if p["season"] == "SEPAPR"
                                else monthly_base.get((zid, metric, p["season"])))

                    out.append((
                        zid, p["scenario"], p["period"], p["season"],
                        p["variable"], p["statistic"],
                        base, projected,
                        None if base is None else projected - base,
                        weighted_percentile(v, w, 0.10),
                        weighted_percentile(v, w, 0.90),
                        int(good.sum()), float(w.sum()),
                        p["unit"], p["model_version"], p["rule"], grid_key,
                    ))

        print(f"{len(out):,} rows aggregated"
              + (f", {missing} surfaces missing from the mirror" if missing else ""))

        if args.dry_run:
            print("\ndry run — nothing written")
            return 0

        from psycopg2.extras import execute_values
        conn = db.connection().connection
        cols = ("zone_id, scenario, period, season, variable, statistic, "
                "baseline_mean, projected_mean, delta_mean, p10, p90, "
                "n_cells, planted_ha, unit, model_version, rule, grid_key")
        with conn.cursor() as cur:
            execute_values(cur, f"""
                INSERT INTO climate_zone_projection ({cols}) VALUES %s
                ON CONFLICT (zone_id, scenario, period, season, variable, statistic)
                DO UPDATE SET
                    baseline_mean = EXCLUDED.baseline_mean,
                    projected_mean = EXCLUDED.projected_mean,
                    delta_mean = EXCLUDED.delta_mean,
                    p10 = EXCLUDED.p10, p90 = EXCLUDED.p90,
                    n_cells = EXCLUDED.n_cells,
                    planted_ha = EXCLUDED.planted_ha,
                    unit = EXCLUDED.unit,
                    model_version = EXCLUDED.model_version,
                    rule = EXCLUDED.rule, grid_key = EXCLUDED.grid_key
            """, out, page_size=1000)
        db.commit()
        print("written")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
