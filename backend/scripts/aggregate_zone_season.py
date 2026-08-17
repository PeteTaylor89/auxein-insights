"""Phase 3 — roll the monthly zone statistics up into growing seasons.

    python backend/scripts/aggregate_zone_season.py --dry-run
    python backend/scripts/aggregate_zone_season.py --baseline 1987-2006

Season is Sep-Apr labelled by the ending (vintage) year. The archive gives 37
complete seasons, 1987..2023.

## Two passes, because three metrics cannot be built from monthly zone rows

**Pass A — from `climate_zone_surface_monthly`.** Anything that is a sum or a
day-weighted mean over months rolls up exactly, because every month shares the
same per-cell weights: a sum of weighted means IS the weighted mean of sums.
GDD, frost days, rainfall totals and the temperature means all come from here at
no raster cost.

**Pass B — per cell, straight off the surfaces.** Three metrics need per-cell
logic ACROSS months and are NOT recoverable from Pass A:

- `rx1day` — the season's largest daily fall. `max` of the monthly zone means is
  not the zone mean of per-cell maxima; the first flattens the wettest cell of
  each month into an average before taking the max, which understates it.
- `r99p` — needs each cell's own baseline threshold and then that cell's own
  exceedances pooled across months.
- `last_spring_frost_doy` — a date, and the latest frost across Sep-Nov for a
  cell cannot be reconstructed from three monthly zone averages.

## r99p, and why the top-5 bands are enough

`wet_topN` holds each month's five largest daily falls. A 20-season baseline
pools 20 x 8 x 5 = 800 values, while the 99th percentile of ~1,900 baseline wet
days sits around the 20th largest — comfortably inside what we kept. A single
season then contributes at most a handful of days above that threshold, well
inside its own 40 pooled values. Daily percentiles were never stored and there
is no other path to this metric.

## Known limitation, stated rather than hidden

`max_dry_spell` is the maximum of the monthly bands, so a dry spell spanning a
month boundary is truncated at the join. The dailies are gone, so this cannot be
fixed from the published archive — only by re-running the history. It is stored
as `max_dry_spell_within_month` so the name cannot be mistaken for the real
season maximum.
"""
from __future__ import annotations

import argparse
import calendar
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np                                                  # noqa: E402
from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402

BUCKET_ROOT = os.getenv(
    "SURFACE_MIRROR", "scratchpad/climate_history/bucket/surfaces/v2")

# (month, year offset from the vintage year). Sep-Dec fall in the previous
# calendar year.
SEASON_MONTHS = [(9, -1), (10, -1), (11, -1), (12, -1),
                 (1, 0), (2, 0), (3, 0), (4, 0)]
SPRING_MONTHS = [(9, -1), (10, -1), (11, -1)]

FIRST_VINTAGE, LAST_VINTAGE = 1987, 2023
DEFAULT_BASELINE = "1986-2005"

# Pass A: metric -> (variable, statistic, how). "sum" adds the months; "wmean"
# takes the day-weighted mean across months.
FROM_MONTHLY = {
    "gdd10":            ("temp_mean", "gdd10",          "sum",   "GDD"),
    "tmean":            ("temp_mean", "mean",           "wmean", "C"),
    "tmin":             ("temp_min",  "mean",           "wmean", "C"),
    "tmax":             ("temp_max",  "mean",           "wmean", "C"),
    "frost_days":       ("temp_min",  "frost_days",     "sum",   "days"),
    "hot_days_25":      ("temp_max",  "days_over_25",   "sum",   "days"),
    "hot_days_30":      ("temp_max",  "days_over_30",   "sum",   "days"),
    "rain":             ("rainfall",  "sum",            "sum",   "mm"),
    "wet_days":         ("rainfall",  "wet_days",       "sum",   "days"),
    "rain_days_over_10mm": ("rainfall", "days_over_10mm", "sum", "days"),
    "rain_days_over_25mm": ("rainfall", "days_over_25mm", "sum", "days"),
    "max_dry_spell_within_month": ("rainfall", "max_dry_spell", "max", "days"),
}
# Frost in September-November only — the frosts that hit budburst.
SPRING_FROST_METRIC = "early_frost_days"


def surface_path(variable: str, statistic: str, year: int, month: int) -> str:
    return os.path.join(
        BUCKET_ROOT, variable, "monthly", str(year),
        f"{variable}_monthly_{year}{month:02d}_500m_{statistic}.tif")


def weighted_percentile(values: np.ndarray, weights: np.ndarray,
                        q: float) -> float:
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = np.cumsum(w)
    if cum[-1] <= 0:
        return float("nan")
    return float(np.interp(q * cum[-1], cum, v))


def summarise(values: np.ndarray, weights: np.ndarray, n_total: int):
    """Weighted mean plus the spread across planted cells."""
    good = np.isfinite(values)
    if not good.any():
        return None
    v, w = values[good], weights[good]
    if w.sum() <= 0:
        return None
    return {
        "mean": float(np.average(v, weights=w)),
        "min": float(v.min()), "max": float(v.max()),
        "p10": weighted_percentile(v, w, 0.10),
        "p90": weighted_percentile(v, w, 0.90),
        "n_cells": int(good.sum()),
        "planted_ha": float(w.sum()),
        "coverage": float(good.sum()) / n_total if n_total else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default=DEFAULT_BASELINE,
                    help="baseline period for r99p, as FIRST-LAST vintage years")
    ap.add_argument("--from-vintage", type=int, default=FIRST_VINTAGE)
    ap.add_argument("--to-vintage", type=int, default=LAST_VINTAGE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import rasterio
    from rasterio.windows import Window

    base_lo, base_hi = (int(x) for x in args.baseline.split("-"))
    vintages = list(range(args.from_vintage, args.to_vintage + 1))

    db = SessionLocal()
    try:
        mask = db.execute(text("""
            SELECT m.zone_id, m.row, m.col, m.planted_ha, m.grid_key, z.name
              FROM climate_zone_cell_mask m
              JOIN climate_zones z ON z.id = m.zone_id
             ORDER BY m.zone_id
        """)).fetchall()
        if not mask:
            print("mask is empty — run build_zone_mask.py first")
            return 2
        grid_key = mask[0].grid_key

        per_zone: dict[int, dict] = {}
        grouped = defaultdict(list)
        for r in mask:
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
        print(f"{len(mask):,} mask cells over {len(per_zone)} zones")
        print(f"vintages {vintages[0]}-{vintages[-1]}  "
              f"r99p baseline {base_lo}-{base_hi}\n")

        out: list[tuple] = []

        # ---------------- Pass A: roll up the monthly table ------------------
        monthly = defaultdict(dict)
        for r in db.execute(text("""
            SELECT zone_id, variable, statistic, year, month,
                   mean, min, max, p10, p90, n_cells, planted_ha
              FROM climate_zone_surface_monthly
        """)).fetchall():
            monthly[(r.zone_id, r.variable, r.statistic)][(r.year, r.month)] = r

        for metric, (variable, statistic, how, unit) in FROM_MONTHLY.items():
            for zid in per_zone:
                series = monthly.get((zid, variable, statistic), {})
                for vintage in vintages:
                    parts, weights = [], []
                    complete = True
                    for month, offset in SEASON_MONTHS:
                        rec = series.get((vintage + offset, month))
                        if rec is None or rec.mean is None:
                            complete = False
                            break
                        parts.append(rec)
                        weights.append(calendar.monthrange(vintage + offset,
                                                           month)[1])
                    if not complete:
                        continue

                    w = np.array(weights, dtype=np.float64)
                    if how == "sum":
                        agg = {k: float(sum(getattr(p, k) for p in parts))
                               for k in ("mean", "min", "max", "p10", "p90")}
                    elif how == "wmean":
                        agg = {k: float(np.average(
                                   [getattr(p, k) for p in parts], weights=w))
                               for k in ("mean", "min", "max", "p10", "p90")}
                    else:                                    # "max"
                        agg = {k: float(max(getattr(p, k) for p in parts))
                               for k in ("mean", "min", "max", "p10", "p90")}

                    out.append((zid, vintage, metric, agg["mean"], agg["min"],
                                agg["max"], agg["p10"], agg["p90"], unit,
                                None, int(parts[-1].n_cells),
                                float(parts[-1].planted_ha), None, grid_key))

        # Spring frost count reuses the same rows but only Sep-Nov.
        for zid in per_zone:
            series = monthly.get((zid, "temp_min", "frost_days"), {})
            for vintage in vintages:
                parts = [series.get((vintage + off, mth))
                         for mth, off in SPRING_MONTHS]
                if any(p is None or p.mean is None for p in parts):
                    continue
                agg = {k: float(sum(getattr(p, k) for p in parts))
                       for k in ("mean", "min", "max", "p10", "p90")}
                out.append((zid, vintage, SPRING_FROST_METRIC, agg["mean"],
                            agg["min"], agg["max"], agg["p10"], agg["p90"],
                            "days", None, int(parts[-1].n_cells),
                            float(parts[-1].planted_ha), None, grid_key))

        print(f"pass A: {len(out):,} rows from the monthly table")

        # ---------------- Pass B: per-cell across months ---------------------
        def read_band(variable, statistic, year, month):
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

        def season_pooled_falls(vintage: int):
            """Every cell's five largest daily falls per month, pooled."""
            stack = {zid: [] for zid in per_zone}
            for month, offset in SEASON_MONTHS:
                for n in range(1, 6):
                    vals = read_band("rainfall", f"wet_top{n}",
                                     vintage + offset, month)
                    if vals is None:
                        continue
                    for zid in per_zone:
                        stack[zid].append(vals[zid])
            return {zid: (np.vstack(v) if v else None)
                    for zid, v in stack.items()}

        # r99p threshold per cell, from the baseline seasons.
        print(f"pass B: pooling {base_lo}-{base_hi} for the r99p threshold")
        pool = {zid: [] for zid in per_zone}
        for vintage in range(base_lo, base_hi + 1):
            falls = season_pooled_falls(vintage)
            for zid, arr in falls.items():
                if arr is not None:
                    pool[zid].append(arr)
        threshold = {}
        for zid in per_zone:
            if not pool[zid]:
                threshold[zid] = None
                continue
            allf = np.vstack(pool[zid])
            # Wet days only: the bands are 0-padded and sub-1 mm is zeroed.
            thr = np.full(allf.shape[1], np.nan)
            for i in range(allf.shape[1]):
                col = allf[:, i]
                wet = col[np.isfinite(col) & (col > 0)]
                if wet.size >= 20:
                    thr[i] = np.percentile(wet, 99.0)
            threshold[zid] = thr
        pool = None

        for vintage in vintages:
            # rx1day — per-cell max of the monthly maxima.
            rx = {zid: np.full(len(per_zone[zid]["w"]), np.nan)
                  for zid in per_zone}
            for month, offset in SEASON_MONTHS:
                vals = read_band("rainfall", "max", vintage + offset, month)
                if vals is None:
                    continue
                for zid in per_zone:
                    rx[zid] = np.fmax(rx[zid], vals[zid])

            # last spring frost — latest Sep-Nov day, as a day of year.
            last = {zid: np.full(len(per_zone[zid]["w"]), np.nan)
                    for zid in per_zone}
            for month, offset in SPRING_MONTHS:
                vals = read_band("temp_min", "last_frost_day",
                                 vintage + offset, month)
                if vals is None:
                    continue
                year = vintage + offset
                doy_start = (calendar.datetime.date(year, month, 1)
                             .timetuple().tm_yday)
                for zid in per_zone:
                    v = vals[zid]
                    # 0 means no frost that month, so it must never become a
                    # date; only cells with a real frost day are updated.
                    hit = np.isfinite(v) & (v > 0)
                    doy = doy_start + v - 1
                    last[zid] = np.where(hit, np.fmax(
                        np.nan_to_num(last[zid], nan=-1), doy), last[zid])
            for zid in per_zone:
                last[zid] = np.where(last[zid] < 0, np.nan, last[zid])

            falls = season_pooled_falls(vintage)

            for zid, z in per_zone.items():
                n_total = len(z["w"])
                for metric, values, unit in (
                        ("rx1day", rx[zid], "mm"),
                        ("last_spring_frost_doy", last[zid], "doy")):
                    s = summarise(values, z["w"], n_total)
                    if s:
                        out.append((zid, vintage, metric, s["mean"], s["min"],
                                    s["max"], s["p10"], s["p90"], unit,
                                    s["coverage"], s["n_cells"],
                                    s["planted_ha"], None, grid_key))

                thr, arr = threshold[zid], falls[zid]
                if thr is None or arr is None:
                    continue
                over = np.where(np.isfinite(arr) & (arr > thr[None, :]), arr, 0.0)
                r99p = over.sum(axis=0)
                r99p[~np.isfinite(thr)] = np.nan
                s = summarise(r99p, z["w"], n_total)
                if s:
                    out.append((zid, vintage, "r99p", s["mean"], s["min"],
                                s["max"], s["p10"], s["p90"], "mm",
                                s["coverage"], s["n_cells"], s["planted_ha"],
                                args.baseline, grid_key))

            if vintage % 5 == 0 or vintage == vintages[-1]:
                print(f"  {vintage}")

        print(f"\n{len(out):,} rows total")

        if args.dry_run:
            _preview(out, per_zone)
            print("\ndry run — nothing written")
            return 0

        from psycopg2.extras import execute_values
        raw = db.connection().connection
        with raw.cursor() as cur:
            execute_values(cur, """
                INSERT INTO climate_zone_surface_season
                    (zone_id, vintage_year, metric, mean, min, max, p10, p90,
                     unit, coverage, n_cells, planted_ha, baseline, grid_key)
                VALUES %s
                ON CONFLICT (zone_id, vintage_year, metric)
                DO UPDATE SET mean = EXCLUDED.mean, min = EXCLUDED.min,
                              max = EXCLUDED.max, p10 = EXCLUDED.p10,
                              p90 = EXCLUDED.p90, unit = EXCLUDED.unit,
                              coverage = EXCLUDED.coverage,
                              n_cells = EXCLUDED.n_cells,
                              planted_ha = EXCLUDED.planted_ha,
                              baseline = EXCLUDED.baseline,
                              grid_key = EXCLUDED.grid_key
            """, [tuple(None if isinstance(v, float) and not np.isfinite(v)
                        else v for v in row) for row in out], page_size=5000)
        db.commit()
        print("written")
        return 0
    finally:
        db.close()


def _preview(out, per_zone) -> None:
    metrics = sorted({r[2] for r in out})
    print("\nmetrics:", ", ".join(metrics))
    recent = [r for r in out if r[1] == 2023]
    for metric in ("gdd10", "rain", "rx1day", "r99p", "frost_days",
                   "last_spring_frost_doy"):
        rows = sorted([r for r in recent if r[2] == metric],
                      key=lambda x: -(x[3] or 0))[:3]
        if rows:
            print(f"\n  2023 {metric}:")
            for r in rows:
                cov = f"  coverage {r[9]:.0%}" if r[9] is not None else ""
                print(f"    {per_zone[r[0]]['name']:<34}"
                      f"{r[3]:>8.1f} {r[8]}{cov}")


if __name__ == "__main__":
    raise SystemExit(main())
