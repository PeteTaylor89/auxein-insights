"""Per-station bias of the DB network against its co-located CLIFLO twin.

The overlap bias study measured provenance as a NETWORK aggregate: DB minus
CLIFLO is -0.27 degC on tmean, season-stable, 53 of 58 stations inside +/-1.0.
That number is safe to quote nationally and dangerous to rely on regionally,
because it is a mean over a distribution with real tails, and the tails are not
noise -- they are siting artefacts. `MDC_BLENHEIM_OFFICE` (+1.88) is a council
office and `TDC_RICHMOND_ROOF` (+1.06) is a roof; both names say so.

What makes a tail matter is LOCAL SHARE, not size. A +1.9 degC station inside a
dense lowland network is diluted to nothing. The same station where it is one of
two thermometers within 25 km IS the surface. That is what happened at Gibbston:
five of the six DB stations within 80 km are HARVEST, a source carrying a -0.60
degC national offset, and two of those five run -1.2 to -1.3 against their own
CLIFLO twins. The national mean never sees it; the Central Otago fit is made of
it, and the resulting season GDD10 lands 30 percent low.

So this audit exists to turn the aggregate into a per-station control.

## Elevation is corrected, and that is the number to flag on

Pairs are matched to <=5 km and <=100 m, but 100 m is 0.6 degC at the production
lapse rate -- comparable to the whole effect being measured. The `corrected`
column removes it (`raw + lapse * delev / 100`, delev = DB minus CLIFLO
elevation, so a DB station sitting higher has its cold reading credited back).
`raw` is kept only so a large gap between the two exposes a bad elevation record
rather than hiding inside the correction.

## AN ANNUAL MEAN CANNOT SEE A SEASONAL FAULT

`WRC_THAMES_HIGH_SCHOOL` is why this exists. Against its CLIFLO neighbour it is
**-1.07 degC in DJF and +1.00 in JJA**, a 2 degC swing with opposite signs -- a
sensor that saturates or loses ventilation in high sun. Its ANNUAL bias is
**+0.44**, comfortably inside any sane threshold, so the first version of this
audit passed it without comment.

Averaging a summer fault against a winter one is not a small loss of resolution;
it is the two halves cancelling to look like a clean station. And the half that
survives averaging is the half that matters least: GDD integrates the warm
season, so a summer-only error lands entirely on the number growers read.

So a pair is flagged on **the worst of annual, DJF and JJA**, and separately on
`swing` (DJF minus JJA) crossing `--swing-threshold`. The `reason` column says
which test fired. A station can now fail on `swing` while passing every mean.

Some swing is expected and is not a fault: the correction uses one fixed lapse
rate, and the real rate is seasonal, so pairs separated in elevation will show a
residual swing on that account alone. That is why the swing threshold is looser
than the bias threshold, and why `delev_signed` is worth reading beside it.

## Two things this does NOT correct, deliberately

**Day-boundary.** CLIFLO is the 24 h ENDING 9am; the .npz inputs are midnight to
midnight. The study settled empirically that this is a DISPERSION term, not a
bias one -- switching M2M to E9 moves tmean bias by +0.006 and tmax by +0.005,
while collapsing MAE by 0.58 and 1.38. So MAE here is inflated and meaningless
for ranking, and BIAS is sound. The exception is **tmin, which carries a real
+0.134 offset from the boundary alone**; subtract that before comparing tmin
figures to the study's E9 numbers.

**Era.** A pair whose CLIFLO twin closed before the DB station opened has no
overlapping day. Those are reported separately as `NO-OVERLAP` with each side's
own mean, and are INDICATIVE ONLY -- the comparison spans different decades, so
a warming trend is folded in. Read the sign, not the magnitude: a modern station
reading colder than the same site decades earlier is wrong by at least the gap.

    python backend/scripts/interpolation/station_offset_audit.py
    python backend/scripts/interpolation/station_offset_audit.py --threshold 0.75
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
DEFAULT_PAIRS = REPO / "scratchpad" / "live_surfaces" / "colocated_pairs.csv"
DEFAULT_DB = REPO / "scratchpad" / "live_surfaces" / "inputs3"
DEFAULT_CL = REPO / "scratchpad" / "climate_history" / "inputs"
VARIABLES = ("temp_mean", "temp_min", "temp_max")

# Matches run_history.py's detrend/retrend. Stated here rather than imported so
# the audit reports the assumption it actually used.
LAPSE_C_PER_100M = 0.6


def _load(path: Path):
    z = np.load(path, allow_pickle=True)
    return (z["station_ids"], np.array([str(d) for d in z["dates"]]), z["values"])


DJF = (12, 1, 2)
JJA = (6, 7, 8)
# Below this many matched days in a season, its mean is noise and is reported as
# NaN rather than flagged. A pair can be dense annually and still be thin in one
# season if the station came online mid-year.
MIN_SEASON_DAYS = 30


def audit(pairs_path: Path, db_dir: Path, cl_dir: Path, threshold: float,
          min_days: int, swing_threshold: float = 1.5) -> list[dict]:
    pairs = list(csv.DictReader(pairs_path.open()))
    out: list[dict] = []

    for var in VARIABLES:
        did, ddt, dv = _load(db_dir / f"{var}.npz")
        aid, adt, av = _load(cl_dir / f"{var}.npz")
        dpos = {int(s): i for i, s in enumerate(did)}
        apos = {int(s): i for i, s in enumerate(aid)}
        dday = {d: i for i, d in enumerate(ddt)}
        aday = {d: i for i, d in enumerate(adt)}
        common = np.intersect1d(ddt, adt)
        di = np.array([dday[d] for d in common])
        ai = np.array([aday[d] for d in common])
        month = np.array([int(d[5:7]) for d in common])

        for p in pairs:
            sid, agent = int(p["station_id"]), int(p["cl_agent"])
            if sid not in dpos or agent not in apos:
                continue
            x = dv[di, dpos[sid]].astype(float)
            y = av[ai, apos[agent]].astype(float)
            ok = np.isfinite(x) & np.isfinite(y)
            # The pairs file stores |DB - CLIFLO|; recover the sign from the
            # two elevations, because which way the pair leans is the whole
            # point of the correction.
            signed = float(p["elev"]) - float(p["cl_elev"])
            corr = LAPSE_C_PER_100M * signed / 100.0

            row = dict(variable=var, station_id=sid, station_code=p["station_code"],
                       source=p["data_source"], km=float(p["km"]),
                       elev=float(p["elev"]), cl_elev=float(p["cl_elev"]),
                       delev_signed=signed, cl_agent=agent)

            if int(ok.sum()) >= min_days:
                d_ = x[ok] - y[ok]
                mo = month[ok]

                def season(months_):
                    v = d_[np.isin(mo, months_)]
                    if v.size < MIN_SEASON_DAYS:
                        return float("nan"), int(v.size)
                    return float(v.mean()) + corr, int(v.size)

                djf, n_djf = season(DJF)
                jja, n_jja = season(JJA)
                swing = (djf - jja) if (djf == djf and jja == jja) else float("nan")
                row.update(status="OK", n=int(ok.sum()),
                           first=str(common[ok][0]), last=str(common[ok][-1]),
                           raw=float(d_.mean()), corrected=float(d_.mean()) + corr,
                           median=float(np.median(d_)), mae=float(np.abs(d_).mean()),
                           sd=float(d_.std()),
                           djf=djf, jja=jja, n_djf=n_djf, n_jja=n_jja, swing=swing)
            else:
                dn = np.isfinite(dv[:, dpos[sid]])
                an = np.isfinite(av[:, apos[agent]])
                if dn.sum() == 0 or an.sum() == 0:
                    continue
                gap = (float(np.nanmean(dv[:, dpos[sid]]))
                       - float(np.nanmean(av[:, apos[agent]])))
                row.update(status="NO-OVERLAP", n=int(ok.sum()),
                           first=f"DB {ddt[dn][0]}", last=f"CL ->{adt[an][-1]}",
                           raw=gap, corrected=gap + corr, median=float("nan"),
                           mae=float("nan"), sd=float("nan"),
                           djf=float("nan"), jja=float("nan"),
                           n_djf=0, n_jja=0, swing=float("nan"))

            # Worst of the three means, then the swing as its own test. NaN
            # seasons drop out rather than counting as zero -- a thin season is
            # unmeasured, not clean.
            reasons = []
            if abs(row["corrected"]) >= threshold:
                reasons.append("annual")
            for name, key in (("djf", "djf"), ("jja", "jja")):
                v = row[key]
                if v == v and abs(v) >= threshold:
                    reasons.append(name)
            if row["swing"] == row["swing"] and abs(row["swing"]) >= swing_threshold:
                reasons.append("swing")
            row["reason"] = "+".join(reasons)
            row["flag"] = bool(reasons)
            out.append(row)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pairs", type=Path, default=DEFAULT_PAIRS)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--cliflo", type=Path, default=DEFAULT_CL)
    ap.add_argument("--threshold", type=float, default=1.0,
                    help="flag when the WORST of |annual|, |DJF| or |JJA| "
                         "elevation-corrected bias reaches this (degC)")
    ap.add_argument("--swing-threshold", type=float, default=1.5,
                    help="flag when |DJF - JJA| reaches this (degC), even if "
                         "every mean passes; catches a season-only fault whose "
                         "halves cancel in the annual figure")
    ap.add_argument("--min-days", type=int, default=200,
                    help="below this many overlapping days a pair is NO-OVERLAP")
    ap.add_argument("--out", type=Path,
                    default=REPO / "scratchpad" / "live_surfaces" / "station_offsets.csv")
    a = ap.parse_args(argv)

    rows = audit(a.pairs, a.db, a.cliflo, a.threshold, a.min_days,
                 a.swing_threshold)
    if not rows:
        print("no pairs resolved", file=sys.stderr)
        return 1

    cols = ["variable", "station_id", "station_code", "source", "cl_agent", "km",
            "elev", "cl_elev", "delev_signed", "status", "n", "first", "last",
            "raw", "corrected", "djf", "jja", "n_djf", "n_jja", "swing",
            "median", "mae", "sd", "flag", "reason"]
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    tm = [r for r in rows if r["variable"] == "temp_mean"]
    ok = [r for r in tm if r["status"] == "OK"]
    print(f"pairs resolved: {len(tm)} on temp_mean "
          f"({len(ok)} with >= {a.min_days} overlapping days, "
          f"{len(tm) - len(ok)} NO-OVERLAP)")
    c = np.array([r["corrected"] for r in ok])
    print(f"temp_mean elevation-corrected bias: mean {c.mean():+.3f}  "
          f"median {np.median(c):+.3f}  sd {c.std():.3f}  "
          f"inside +/-1.0: {int((np.abs(c) < 1.0).sum())}/{len(c)}")
    print(f"\nwrote {a.out}")

    def _f(v, w=7):
        return f"{'':>{w}}" if v != v else f"{v:+{w}.3f}"

    def worst(r):
        return max(abs(r["corrected"]),
                   *(abs(v) for v in (r["djf"], r["jja"]) if v == v),
                   abs(r["swing"]) if r["swing"] == r["swing"] else 0.0)

    print(f"\n=== FLAGGED: worst of annual/DJF/JJA >= {a.threshold}, or "
          f"|swing| >= {a.swing_threshold} (temp_mean) ===")
    print(f"{'station_code':30} {'src':10} {'delev':>6} {'n':>5} "
          f"{'annual':>7} {'DJF':>7} {'JJA':>7} {'swing':>7}  {'reason':12} status")
    flagged = sorted([r for r in tm if r["flag"]], key=lambda r: -worst(r))
    for r in flagged:
        print(f"{r['station_code'][:28]:30} {r['source']:10} "
              f"{r['delev_signed']:+6.0f} {r['n']:5d} "
              f"{_f(r['corrected'])} {_f(r['djf'])} {_f(r['jja'])} {_f(r['swing'])}  "
              f"{r['reason']:12} {r['status']}")
    if not flagged:
        print("  none")

    # Called out separately: these are the ones an annual-only audit misses.
    swing_only = [r for r in flagged if r["reason"] == "swing"]
    if swing_only:
        print(f"\n  {len(swing_only)} of these pass every MEAN and fail only on "
              f"swing - invisible to an annual check:")
        for r in swing_only:
            print(f"    {r['station_code'][:28]:30} annual {_f(r['corrected'])}  "
                  f"DJF {_f(r['djf'])}  JJA {_f(r['jja'])}")

    print("\n=== by source (temp_mean, elevation-corrected, OK pairs only) ===")
    print(f"{'source':12} {'n':>3} {'mean':>8} {'median':>8} {'min':>8} {'max':>8}")
    for src in sorted({r["source"] for r in ok}):
        v = np.array([r["corrected"] for r in ok if r["source"] == src])
        print(f"{src:12} {len(v):3d} {v.mean():+8.3f} {np.median(v):+8.3f} "
              f"{v.min():+8.3f} {v.max():+8.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
