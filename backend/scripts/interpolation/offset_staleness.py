"""Watch the era-offset field go stale, using only the DB's own stations.

`era_offset.py` corrects the DB era onto the CLIFLO archive's scale. It is
trained on the 2020-01..2024-09 overlap, and **that overlap can never be
extended: CLIFLO closed in October 2024.** The field is therefore frozen for
good, while the thing it describes is not -- the DB network grew from ~125
fitting stations in 2020 to ~167 in 2024 to ~205 now, and Waikato's 13 landed on
2026-08-21.

That matters because the correction is largely a property of network GEOMETRY:
it is big where the DB is thin and near zero where the two networks agree. As
stations arrive, the true correction shrinks and a frozen field over-corrects.
The drift is already visible -- the February field at Gibbston moved -1.55 degC
trained on 2020-2022 to -1.35 trained on 2020-2024.

The danger is not the size of that drift. It is that with no reference left, the
error grows **silently**. A production pipeline running unattended into 2028 has
nothing telling it the correction has aged.

## The one reference that never runs out is the network itself

Hold a station out of the fit, predict at it, compare. That needs no CLIFLO, no
external data and no new ingest -- `tps.fit_surface` already returns an
out-of-fold residual per fitted station, which is what `per_region_cv.py`
harvests. Run it per region for the field's training window and again for a
recent window, and the CHANGE is the signal.

It cannot measure the era offset directly; nothing can, any more. What it does
measure is local network deficiency, which is the quantity the offset field is a
proxy for. So:

    held-out error in a region FALLS  -> the network there improved
                                      -> the frozen correction is now TOO STRONG

    held-out error RISES              -> stations were lost or degraded
                                      -> the correction is now too weak, and the
                                         surface is worse besides

## `over_correct_est` is a first-order proxy, not a measurement

Reported as `|field| * (1 - rmse_now / rmse_baseline)`: if local deficiency fell
by a fifth, assume the correction it justifies fell by about a fifth too. That
assumes the field scales linearly with held-out error, which is a modelling
assumption and not a fact. **Treat it as a trigger for review, never as a
correction to apply** -- applying it would be inventing a second offset on top
of one we can no longer validate.

    python backend/scripts/interpolation/offset_staleness.py \\
        --inputs scratchpad/live_surfaces/inputs4 \\
        --field scratchpad/live_surfaces/offset_production
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation.per_region_cv import (  # noqa: E402
    assign_regions, collect_residuals, grid_origin)
from scripts.interpolation.run_history import DEFAULT_GRID, load_inputs  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
from scripts.interpolation.runrecord import (             # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

log = logging.getLogger("staleness")

# Hashed into every run record. The monitor scores held-out stations with the
# production fit, so the estimator is in scope alongside the monitor itself.
CODE_MODULES = ("offset_staleness.py", "per_region_cv.py", "tps.py",
                "run_history.py", "fastgrid.py", "raster.py")
logging.getLogger("tps").setLevel(logging.ERROR)

REPO = Path(__file__).resolve().parents[3]
VARIABLE = "temp_mean"

# A region must clear both to be judged: fewer stations than this and the
# held-out RMSE is one or two stations' luck, not a network property.
MIN_STATIONS = 3
MIN_STATION_DAYS = 60


def _window(resid: pd.DataFrame, span: str) -> pd.DataFrame:
    a, b = span.split(":")
    lo = date(int(a[:4]), int(a[5:7]), 1)
    hi_y, hi_m = int(b[:4]), int(b[5:7])
    hi = date(hi_y + (hi_m == 12), 1 if hi_m == 12 else hi_m + 1, 1)
    d = pd.to_datetime(resid["date"])
    return resid[(d >= pd.Timestamp(lo)) & (d < pd.Timestamp(hi))]


def _by_region(resid: pd.DataFrame, members: pd.DataFrame) -> dict:
    out = {}
    j = resid.merge(members, on="station_id", how="inner")
    for name, g in j.groupby("name"):
        out[name] = {"n_stations": int(g.station_id.nunique()),
                     "n_station_days": int(len(g)),
                     "rmse": float(np.sqrt(np.mean(g["residual"].to_numpy() ** 2)))}
    e = resid["residual"].to_numpy()
    out["NATIONAL"] = {"n_stations": int(resid.station_id.nunique()),
                       "n_station_days": int(len(e)),
                       "rmse": float(np.sqrt(np.mean(e ** 2)))}
    return out


def field_magnitude(field_dir: Path, members: pd.DataFrame,
                    stations: pd.DataFrame) -> dict:
    """Mean |offset| at the stations of each region.

    Sampled AT STATIONS rather than over the region's cells on purpose: the
    held-out error it is compared against is also a station-space quantity, and
    mixing a cell-space magnitude with a station-space error would compare two
    different populations.
    """
    from scripts.interpolation.raster import NODATA, _configure_proj
    _configure_proj()
    import rasterio

    tifs = sorted(field_dir.glob(f"offset_{VARIABLE}_*.tif"))
    if not tifs:
        raise SystemExit(f"no offset rasters in {field_dir}")
    per_station: dict[int, list[float]] = {}
    for p in tifs:
        with rasterio.open(p) as ds:
            arr = ds.read(1)
            nd = ds.nodata if ds.nodata is not None else float(NODATA)
            for sid, la, lo in zip(stations["station_id"], stations["latitude"],
                                   stations["longitude"]):
                try:
                    r, c = ds.index(float(lo), float(la))
                    v = float(arr[r, c])
                except Exception:                                   # noqa: BLE001
                    continue
                if v != nd and np.isfinite(v):
                    per_station.setdefault(int(sid), []).append(abs(v))
    mag = {s: float(np.mean(v)) for s, v in per_station.items() if v}
    out = {}
    for name, g in members.groupby("name"):
        vals = [mag[s] for s in g["station_id"] if s in mag]
        if vals:
            out[name] = float(np.mean(vals))
    if mag:
        out["NATIONAL"] = float(np.mean(list(mag.values())))
    return out


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--inputs", type=Path, required=True)
    ap.add_argument("--field", type=Path, required=True,
                    help="offset field dir; its manifest supplies the baseline span")
    ap.add_argument("--baseline", default=None,
                    help="override the field's own train_span")
    ap.add_argument("--current", default=None,
                    help="YYYY-MM:YYYY-MM (default: the 12 months ending at the "
                         "last month present in --inputs)")
    ap.add_argument("--per-month", type=int, default=2)
    ap.add_argument("--grid", type=Path, default=Path(DEFAULT_GRID))
    ap.add_argument("--buffer-km", type=float, default=10.0)
    ap.add_argument("--tolerance", type=float, default=0.15,
                    help="fractional change in held-out RMSE that counts as "
                         "material (default 0.15 = 15%%)")
    ap.add_argument("--out", type=Path,
                    default=REPO / "scratchpad" / "live_surfaces" / "offset_staleness.csv")
    a = ap.parse_args(argv)

    manifest = json.loads((a.field / "manifest.json").read_text())
    baseline = a.baseline or manifest["train_span"]

    values, stations, dates = load_inputs(a.inputs, VARIABLE)
    if a.current:
        current = a.current
    else:
        last = max(dates)
        first = date(last.year - 1, last.month, 1)
        current = f"{first.year}-{first.month:02d}:{last.year}-{last.month:02d}"
    log.info("field %s | baseline %s | current %s", a.field.name, baseline, current)

    # Provision 6 of the paper brief: this series is the ONLY ongoing
    # validation that exists now CLIFLO is closed, and it is only a series if
    # every run is kept. `--out` names one file that each run overwrote.
    record = RunRecord(a.out.parent)
    record.open({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "engine": "offset_staleness", "argv": sys.argv,
        "parameters": {"variable": VARIABLE, "field": str(a.field),
                       "baseline": baseline, "current": current,
                       "per_month": a.per_month, "buffer_km": a.buffer_km,
                       "tolerance": a.tolerance, "out": str(a.out),
                       "min_stations": MIN_STATIONS,
                       "min_station_days": MIN_STATION_DAYS},
        "sources": {"inputs": str(a.inputs), "field": str(a.field),
                    "field_manifest": manifest},
        "code": {"digest": _code_digest(CODE_MODULES), "git": _git_revision()},
        "environment": _environment()})

    origin = grid_origin(a.grid)
    resid = collect_residuals(VARIABLE, a.inputs, origin, a.per_month)
    members = assign_regions(stations, a.buffer_km)

    base = _by_region(_window(resid, baseline), members)
    now = _by_region(_window(resid, current), members)
    mag = field_magnitude(a.field, members, stations)

    rows = []
    for name in sorted(set(base) & set(now)):
        b, n = base[name], now[name]
        if min(b["n_stations"], n["n_stations"]) < MIN_STATIONS:
            continue
        if min(b["n_station_days"], n["n_station_days"]) < MIN_STATION_DAYS:
            continue
        change = (n["rmse"] - b["rmse"]) / b["rmse"]
        m = mag.get(name, float("nan"))
        est = abs(m) * -change if m == m else float("nan")
        if change <= -a.tolerance:
            verdict = "OVER-CORRECTING"
        elif change >= a.tolerance:
            verdict = "network degraded"
        else:
            verdict = "stable"
        rows.append({"region": name,
                     "n_stations_baseline": b["n_stations"],
                     "n_stations_now": n["n_stations"],
                     "rmse_baseline": round(b["rmse"], 4),
                     "rmse_now": round(n["rmse"], 4),
                     "change_pct": round(100 * change, 1),
                     "field_magnitude": round(m, 3) if m == m else "",
                     "over_correct_est": round(est, 3) if est == est else "",
                     "verdict": verdict})

    if not rows:
        # Pre-existing crash: an empty `rows` gave a column-less DataFrame and
        # `sort_values` raised a bare KeyError('change_pct'). This monitor is
        # meant to run on a schedule, so the no-qualifying-region case has to
        # say so and record it, not die opaquely.
        record.close({"field": a.field.name, "baseline": baseline,
                      "current": current, "n_regions": 0, "n_breached": 0,
                      "note": "no region met the station/station-day minimums"},
                     status="incomplete", copy=())
        raise SystemExit(
            f"no region cleared the minimums ({MIN_STATIONS} stations, "
            f"{MIN_STATION_DAYS} station-days) in BOTH windows "
            f"({baseline} vs {current}). Raise --per-month, widen "
            f"--buffer-km, or choose wider windows.")

    df = pd.DataFrame(rows).sort_values("change_pct")
    a.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(a.out, index=False)

    print(f"\n=== offset staleness: {a.field.name} ===")
    print(f"baseline {baseline}   current {current}   "
          f"tolerance +/-{100 * a.tolerance:.0f}%\n")
    print(f"{'region':26} {'stns':>9} {'rmse base':>10} {'rmse now':>9} "
          f"{'change':>8} {'|field|':>8} {'est':>7}  verdict")
    for r in df.to_dict("records"):
        stn = f"{r['n_stations_baseline']}->{r['n_stations_now']}"
        print(f"{r['region'][:24]:26} {stn:>9} {r['rmse_baseline']:>10.3f} "
              f"{r['rmse_now']:>9.3f} {r['change_pct']:>7.1f}% "
              f"{str(r['field_magnitude']):>8} {str(r['over_correct_est']):>7}  "
              f"{r['verdict']}")

    breached = df[df["verdict"] != "stable"]
    # A breach is a successful measurement with an alarming result, not a failed
    # run — so the record closes `complete` and the breach is the OUTCOME. The
    # non-zero exit below is for the scheduler, not for the record.
    record.close({"field": a.field.name, "baseline": baseline,
                  "current": current, "n_regions": int(len(df)),
                  "n_breached": int(len(breached)),
                  "breached": breached["region"].tolist(),
                  "regions": df.to_dict("records")},
                 copy=(a.out.name,))
    print(f"\nwrote {a.out}")
    print(f"run record {record.dir}")
    if len(breached):
        print(f"\n{len(breached)} region(s) breached. The offset field is a "
              f"FROZEN artefact of the 2020-2024 network and cannot be retrained "
              f"- CLIFLO is closed. A breach is a prompt to review the affected "
              f"region, not a number to apply.")
        return 1
    print("\nall regions stable: the field's assumptions still hold.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
