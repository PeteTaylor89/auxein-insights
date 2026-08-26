"""Immutable run records — the evidence a run leaves behind.

Shared by every script that writes a product into a bucket tree:
`run_history.py`, `run_live.py`, `era_offset.py`, `projections.py` and
`gdd_season.py`. It lives in its own module because four of those five are not
fitters, and importing `run_history` — and with it tps, fastgrid, precip and
monthly — merely to record a run is the wrong dependency.

Each engine passes its own `CODE_MODULES`; see `_code_digest`.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger("runrecord")

REPO = Path(__file__).resolve().parents[3]


# ---------------------------------------------------------------------------
# Immutable run records
#
# The checkpoint above protects a run from being KILLED. This protects it from
# being OVERWRITTEN, which is the other way a run's evidence has been lost.
#
# `out/<variable>/` is a WORKING COPY and stays one: re-running a variable
# replaces its COGs, its `manifest.json` and its `validation_stats.csv` in
# place. That is correct for publishing — `stage_publish.py` and
# `index_surfaces.py` read exactly those paths and must keep finding the current
# product there — but it means every re-fit destroyed the fit statistics of the
# run before it. Cross-run comparisons have only ever worked by accident, when a
# scratch directory happened to survive.
#
# So every invocation ALSO writes an immutable record beside the working copy:
#
#     out/<variable>/_runs/<run_id>/run.json              params, code, outcome
#                                   stations.csv          the fit network
#                                   manifest.json         copied on completion
#                                   validation_stats.csv  copied on completion
#
# Nothing ever writes into another run's directory, and creation is deliberately
# NOT `exist_ok` — see `RunRecord.open`. A run that dies leaves its record at
# `status: "running"`, which is itself the evidence that it did not finish; only
# the owning run rewrites its own `run.json`, once, to stamp completion.
#
# A run's NETWORK is its main independent variable and its CODE is the other,
# so both are captured BEFORE the first month is fitted rather than at the end,
# where a kill would take them with it.
RUNS_DIRNAME = "_runs"

def _code_digest(modules: tuple) -> dict:
    """SHA-256 per estimator module, plus one combined digest over all of them.

    `modules` is a parameter because the forward engine shares this machinery
    but not this module list — `run_live.py` fits days and never reduces them,
    so `monthly.py` is not in its estimator and `run_live.py` itself is.
    """
    here = Path(__file__).resolve().parent
    per, combined = {}, hashlib.sha256()
    for name in modules:
        try:
            raw = (here / name).read_bytes()
        except OSError:
            per[name] = None
            continue
        # Normalise line endings before hashing. Git is configured to rewrite
        # LF to CRLF in this tree on checkout, and a line-ending flip is not a
        # change to the estimator — without this the digest would cry wolf on
        # every fresh clone.
        digest = hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()
        per[name] = digest
        combined.update(name.encode() + b"|" + digest.encode() + b"|")
    return {"modules": per, "combined": combined.hexdigest()}


def _git_revision() -> dict:
    """Best-effort commit context. Never fails a run — git may not be present."""
    def _git(*args) -> str | None:
        try:
            r = subprocess.run(("git",) + args, cwd=str(REPO), timeout=15,
                               capture_output=True, text=True)
        except (OSError, subprocess.SubprocessError):
            return None
        return r.stdout.strip() if r.returncode == 0 else None

    head = _git("rev-parse", "HEAD")
    if head is None:
        return {"head": None, "branch": None, "interpolation_dirty": None}
    dirty = _git("status", "--porcelain", "--", "backend/scripts/interpolation")
    return {"head": head, "branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
            "interpolation_dirty": None if dirty is None else bool(dirty)}


def _environment() -> dict:
    import scipy

    return {"python": sys.version.split()[0], "numpy": np.__version__,
            "pandas": pd.__version__, "scipy": scipy.__version__,
            "platform": platform.platform(), "host": platform.node()}


def latest_record(root: Path) -> dict | None:
    """The most recently STARTED run record under `root`, if any.

    `root` is the directory that holds `manifest.json` — `<out>/<variable>` for
    the history backfill, `<out>` for the flat daily engine.
    """
    d = root / RUNS_DIRNAME
    if not d.is_dir():
        return None
    best = None
    for js in sorted(d.glob("*/run.json")):
        try:
            rec = json.loads(js.read_text())
        except (OSError, ValueError):        # a run killed mid-write; skip it
            continue
        if best is None or rec.get("started_at", "") > best.get("started_at", ""):
            best = rec
    return best


def warn_if_code_changed(previous: dict | None, current: dict) -> None:
    """Loud warning when a RESUME crosses an edit to the estimator.

    The resume fingerprint already refuses to weld two different lapse rates,
    dtypes, precip methods or offset fields into one archive. It cannot see a
    code change, and a repo-wide hard-fail would make `--resume` unusable —
    which matters, because `--resume` exists precisely because these runs get
    killed. So this is evidence plus an alarm, not a block: the operator decides
    whether the edit touched the numbers.
    """
    if not previous:
        return
    old = (previous.get("code") or {}).get("digest") or {}
    if not old.get("combined") or old["combined"] == current["combined"]:
        return
    old_mods = old.get("modules") or {}
    changed = [n for n, h in current["modules"].items() if old_mods.get(n) != h]
    log.warning("CODE CHANGED SINCE THE LAST RUN — %s differ from run %s. No "
                "fingerprint can see this. If any of them changed the "
                "estimator, start clean rather than continuing: welding two "
                "models into one product is invisible in the output.",
                ", ".join(changed) or "module set", previous.get("run_id"))


def station_frame(stations: pd.DataFrame, values: np.ndarray, day_idx: list,
                  dates: list, rejected) -> pd.DataFrame:
    """The fit network AND which days each station actually reported.

    The `.npz` inputs carry this today but get overwritten, and the staged input
    directories (`inputs`, `inputs2`, `inputs3`, `inputs4`, `inputs_final`) are
    already ambiguous about which run used which. A run's network is the main
    thing that changes between runs, so it is recorded WITH the run.

    Station `source` is not in the `.npz` and is deliberately not invented here;
    it belongs in `consolidate_history`'s output before it can be recorded.
    """
    sub = values if len(day_idx) == len(dates) else values[day_idx, :]
    ok = np.isfinite(sub)
    window = [dates[i] for i in day_idx]
    first, last = [], []
    for j in range(ok.shape[1]):
        w = np.flatnonzero(ok[:, j])
        first.append(window[w[0]].isoformat() if len(w) else "")
        last.append(window[w[-1]].isoformat() if len(w) else "")

    df = stations.copy()
    df["n_days_reporting"] = ok.sum(axis=0).astype(int)
    df["first_report"] = first
    df["last_report"] = last
    df["in_fit"] = True
    if rejected is not None and len(rejected):
        # Kept, not dropped: which stations the relevance screen REJECTED is
        # part of the description of the network, and a silent drop is the exact
        # failure mode `screen_relevance` was built to avoid.
        rej = rejected.copy()
        rej["in_fit"] = False
        df = pd.concat([df, rej], ignore_index=True, sort=False)
    return df


def write_station_snapshot(path: Path, stations: pd.DataFrame, values: np.ndarray,
                           day_idx: list, dates: list, rejected) -> None:
    station_frame(stations, values, day_idx, dates,
                  rejected).to_csv(path, index=False)


class RunRecord:
    """One invocation's evidence directory. Opened before fitting, closed after."""

    def __init__(self, root: Path):
        # `root` is the directory holding `manifest.json` and
        # `validation_stats.csv` — the working copy this record snapshots.
        self.root = root
        self.run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.dir = self.root / RUNS_DIRNAME / self.run_id
        self._t0 = time.perf_counter()

    def open(self, payload: dict) -> None:
        # NOT exist_ok. Two invocations whose run ids collide are two processes
        # writing one variable's output directory within the same second, and
        # that has happened here: two writers shared one `state.json`, one
        # `records.npz` and one `validation_stats.csv`, producing 914 duplicate
        # stats rows and a silently corrupt records layer that needed a full
        # --restart. Failing here turns that accident into a diagnosis.
        self.dir.mkdir(parents=True)
        self._write({"run_id": self.run_id, "status": "running", **payload})
        log.info("run record %s", self.dir)

    #: Files copied out of the working copy on close, if they exist.
    DEFAULT_COPY = ("manifest.json", "validation_stats.csv")

    def close(self, outcome: dict, status: str = "complete",
              copy: tuple = DEFAULT_COPY) -> None:
        """Copy the run's own outputs in, then stamp the record closed.

        `status` is a parameter because a run can write real artefacts and then
        fail its own completeness gate. That run is evidence — it produced
        published output — but it is not `complete`, and calling it complete
        would be the silent-success failure the gate exists to prevent.

        `copy` is a parameter because not every writer produces the same pair.
        `projections.py` writes `manifest_gdd10.json` from one subcommand and
        `manifest.json` from the other into the SAME directory, so a fixed list
        would have each run recording the other's manifest; `era_offset apply`
        writes no manifest at all.
        """
        for name in copy:
            src = self.root / name
            if src.exists():
                shutil.copy2(src, self.dir / name)
            else:
                # Never silent. A name that is not at the record root is a
                # caller mistake — usually the file is written into a nested
                # directory — and the failure mode is a record that looks
                # complete while holding none of the evidence it names.
                log.warning("run record %s: nothing to copy at %s",
                            self.run_id, src)
        payload = json.loads((self.dir / "run.json").read_text())
        payload.update(status=status, outcome=outcome,
                       finished_at=datetime.now(timezone.utc).isoformat(),
                       elapsed_s=round(time.perf_counter() - self._t0, 1))
        self._write(payload)

    def _write(self, payload: dict) -> None:
        tmp = self.dir / "run.json.tmp"
        tmp.write_text(json.dumps(payload, indent=2, default=str))
        os.replace(tmp, self.dir / "run.json")
