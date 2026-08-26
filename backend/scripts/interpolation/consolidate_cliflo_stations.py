"""Stage the per-STATION CLIFLO extract into the same .npz contract as the history.

`consolidate_history.py` reads `Z:\\Data\\REGEN SPLINE V1.4\\INPUT DATA`, which is
one CSV per DAY and stops at 2023-12-31. That is why the published archive ends
in 2023 and why the DB era has had no reference to validate against.

There is a second, independent CLIFLO extract on the same drive that nothing was
reading: `Z:\\Data\\Climate_Station_Data\\New_Zealand\\STATION_TEMP_DAILY_CLIFLO`,
one CSV per STATION, 517 of them, running to **2024-10-19**. About 230 stations
report Tmean in every month of 2024 -- the same order as the archive's own 2023
network. So roughly ten months of overlap with the DB era do exist, in a
different tree, in a different shape.

That matters because it is the only way to test whether the `era_offset` field
generalises. The field is trained on 2020-2022 and its risk is that it encodes
network GEOMETRY, which changes as the DB densifies (~125 fitting stations in
2020, ~167 by 2024, ~205 by 2026). Validating on 2023 tests a network of 145.
Validating on 2024 tests 167, in the era the correction is actually applied to.

## The extracts must be proven equivalent before 2024 is trusted

Two different exports of the same underlying observations can still disagree --
different QC generation, different rounding, a different Tmean definition. So
`--verify` reconstructs a year that BOTH trees cover and compares them per
station-day against the archive .npz. Run it before believing anything this
script produces about 2024.

    python backend/scripts/interpolation/consolidate_cliflo_stations.py \\
        --start 2020-01-01 --end 2024-10-19 --out scratchpad/live_surfaces/inputs_cliflo24
    python backend/scripts/interpolation/consolidate_cliflo_stations.py --verify 2023
"""
from __future__ import annotations

import argparse
import csv as _csv
import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.interpolation.consolidate_history import (  # noqa: E402
    load_station_metadata)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
from scripts.interpolation.runrecord import (             # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

log = logging.getLogger("cliflo_stations")

# Hashed into every run record. A reader over the per-STATION CLIFLO tree.
CODE_MODULES = ("consolidate_cliflo_stations.py", "consolidate_history.py")

SOURCE = Path(r"Z:\Data\Climate_Station_Data\New_Zealand\STATION_TEMP_DAILY_CLIFLO")
ARCHIVE_NPZ = REPO / "scratchpad" / "climate_history" / "inputs"

# fit variable -> column in the per-station CSV
COLUMNS = {"temp_mean": "Tmean(C)", "temp_min": "Tmin(C)", "temp_max": "Tmax(C)"}

# Same physical gate consolidate_db.py applies, and for the same reason: the fit
# must never trust its input. One bad value does not degrade a national spline,
# it destroys that day's, because GCV accommodates the outlier rather than
# rejecting it.
RANGE = (-30.0, 45.0)

# `Freq` distinguishes daily rows from any other cadence the export may carry.
DAILY_FREQ = "D"


def read_station(path: Path, first: date, last: date) -> dict[date, dict[str, float]]:
    out: dict[date, dict[str, float]] = {}
    with open(path, newline="", errors="replace") as fh:
        for row in _csv.DictReader(fh):
            if (row.get("Freq") or DAILY_FREQ).strip() != DAILY_FREQ:
                continue
            raw = (row.get("Date(NZST)") or "").strip()
            if len(raw) != 10:
                continue
            try:
                d = datetime.strptime(raw, "%d/%m/%Y").date()
            except ValueError:
                continue
            if not (first <= d <= last):
                continue
            vals = {}
            for var, col in COLUMNS.items():
                v = (row.get(col) or "-").strip()
                if v in ("-", "", "-9999"):
                    continue
                try:
                    f = float(v)
                except ValueError:
                    continue
                if RANGE[0] <= f <= RANGE[1]:
                    vals[var] = f
            if vals:
                out[d] = vals
    return out


def build(first: date, last: date, out_dir: Path, source: Path = SOURCE) -> dict:
    files = [e for e in os.scandir(source) if e.is_file() and e.name.endswith(".csv")]
    log.info("reading %d station files from %s", len(files), source)

    per_station: dict[int, dict[date, dict[str, float]]] = {}
    for e in files:
        try:
            sid = int(Path(e.name).stem)
        except ValueError:
            log.warning("skipping %s: filename is not an agent number", e.name)
            continue
        rows = read_station(Path(e.path), first, last)
        if rows:
            per_station[sid] = rows

    meta = load_station_metadata("CLIFLO_RAW_Temp_Daily.csv").set_index("station_id")
    known = [s for s in sorted(per_station) if s in meta.index]
    dropped = [s for s in sorted(per_station) if s not in meta.index]
    if dropped:
        log.warning("%d stations have observations but no coordinates, dropped: %s",
                    len(dropped), dropped[:8])

    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    dpos = {d: i for i, d in enumerate(days)}
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = {}

    for var in COLUMNS:
        cols = [s for s in known if any(var in v for v in per_station[s].values())]
        vals = np.full((len(days), len(cols)), np.nan, dtype=np.float32)
        for j, s in enumerate(cols):
            for d, v in per_station[s].items():
                if var in v:
                    vals[dpos[d], j] = v[var]
        sub = meta.loc[cols]
        np.savez_compressed(
            out_dir / f"{var}.npz",
            values=vals,
            station_ids=np.array(cols, dtype=np.int64),
            dates=np.array([d.isoformat() for d in days]),
            latitude=sub["latitude"].to_numpy(float),
            longitude=sub["longitude"].to_numpy(float),
            elevation=sub["elevation"].to_numpy(float),
        )
        n = int(np.isfinite(vals).sum())
        summary[var] = {"stations": len(cols), "observations": n}
        log.info("%-10s %d stations, %d days, %s observations",
                 var, len(cols), len(days), f"{n:,}")
    return summary


def verify(year: int, source: Path = SOURCE,
           archive: Path = ARCHIVE_NPZ) -> int:
    """Compare this extract against the per-DAY spline extract for one year.

    Both trees claim to be CLIFLO daily temperature. If they disagree, nothing
    downstream of the 2024 extension is trustworthy, so this is a gate rather
    than a diagnostic.
    """
    first, last = date(year, 1, 1), date(year, 12, 31)
    tmp = REPO / "scratchpad" / "live_surfaces" / f"_verify_{year}"
    build(first, last, tmp, source)

    rc = 0
    for var in COLUMNS:
        a = np.load(archive / f"{var}.npz", allow_pickle=True)
        b = np.load(tmp / f"{var}.npz", allow_pickle=True)
        adt = np.array([str(x) for x in a["dates"]])
        bdt = np.array([str(x) for x in b["dates"]])
        common_d = np.intersect1d(adt, bdt)
        ai = {s: i for i, s in enumerate(a["station_ids"].astype(int))}
        bi = {s: i for i, s in enumerate(b["station_ids"].astype(int))}
        common_s = sorted(set(ai) & set(bi))
        ad = {d: i for i, d in enumerate(adt)}
        bd = {d: i for i, d in enumerate(bdt)}
        A = a["values"][np.array([ad[d] for d in common_d])][:, [ai[s] for s in common_s]]
        B = b["values"][np.array([bd[d] for d in common_d])][:, [bi[s] for s in common_s]]
        both = np.isfinite(A) & np.isfinite(B)
        diff = (B - A)[both]
        only_a, only_b = int((np.isfinite(A) & ~np.isfinite(B)).sum()), \
                         int((~np.isfinite(A) & np.isfinite(B)).sum())
        worst = float(np.abs(diff).max()) if diff.size else 0.0
        log.info("%-10s %d shared stations, %s shared obs | bias %+.4f  "
                 "max|d| %.3f | only-spline %s  only-station %s",
                 var, len(common_s), f"{int(both.sum()):,}", float(diff.mean()),
                 worst, f"{only_a:,}", f"{only_b:,}")
        if worst > 0.05:
            log.error("%s: the two CLIFLO extracts DISAGREE by up to %.3f degC "
                      "- do not use the 2024 extension", var, worst)
            rc = 2
    return rc


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", type=Path, default=SOURCE)
    ap.add_argument("--start", default="2020-01-01")
    ap.add_argument("--end", default="2024-10-19")
    ap.add_argument("--out", type=Path,
                    default=REPO / "scratchpad" / "live_surfaces" / "inputs_cliflo24")
    ap.add_argument("--verify", type=int, metavar="YEAR",
                    help="compare against the per-day spline extract for YEAR "
                         "and exit non-zero if they disagree")
    a = ap.parse_args(argv)

    # `--verify` is a GATE, not a build: it stages into a temp tree and
    # compares. Nothing is published, so nothing is recorded.
    if a.verify:
        return verify(a.verify, a.source)

    record = RunRecord(a.out)
    record.open({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "engine": "consolidate_cliflo_stations", "argv": sys.argv,
        "parameters": {"source": str(a.source), "out": str(a.out),
                       "start": a.start, "end": a.end},
        # The other CLIFLO tree, and the only one reaching past 2023-12.
        "sources": {"tree": str(a.source), "kind": "one CSV per station"},
        "code": {"digest": _code_digest(CODE_MODULES), "git": _git_revision()},
        "environment": _environment()})
    summary = build(date.fromisoformat(a.start), date.fromisoformat(a.end),
                    a.out, a.source)
    record.close(summary, copy=())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
