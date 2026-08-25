#!/usr/bin/env python3
"""Write the published gdd10 Sep-Apr normal as a baseline COG.

`normals.py` builds the 1986-2005 normal for every band it can reduce out of
the monthly archive — 35 rasters covering temperature, rainfall and the day
counts. gdd10 is the one it cannot: GDD is a SEASONAL accumulation with no
monthly surfaces behind it, so its normal comes from a different place.

`projections.gdd10_normal()` already computes exactly the right thing — the mean
of the April `cumulative` raster over complete vintages 1987..2005, which is the
level the published gdd10 projections were composed onto — but it does so IN
MEMORY during the projection build and never writes it out. That left gdd10 as
the one projection layer with no baseline surface to display beside it.

This script writes that array to disk in the same layout, with the same tags and
the same manifest shape as `normals.py`, so `index_normals.py` treats it as one
more normal and nothing downstream needs a special case.

**It calls `gdd10_normal()` rather than reimplementing it.** A second
mean-of-vintages here would be a second gdd10 baseline, subtly different from
the one every projection number is stated against — which is precisely the trap
`projections.py` documents at the top of its GDD section.

Run from the ROOT venv (rasterio). Usage:
    ../venv/Scripts/python.exe scripts/interpolation/gdd_normal.py
    ../venv/Scripts/python.exe scripts/interpolation/gdd_normal.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.interpolation.runrecord import (             # noqa: E402
    RunRecord, _code_digest, _environment, _git_revision)

logger = logging.getLogger(__name__)

# gdd10 is Sep-Apr, which is our own growing season and not one of MfE's four.
# The season code matches what the projection rows already carry.
SEASON = "SEPAPR"
VARIABLE = "gdd10"
STATISTIC = "cumulative"
# Eight months, Sep..Apr. Recorded for parity with the other manifests, whose
# consumers read it to know a period is complete.
MONTHS_PER_PERIOD = 8

# What the other 35 normals carry in their tags, verified by reading them back.
# `normals.py` holds this as a default argument rather than a constant, so it is
# repeated rather than imported — and a mismatch here would put two different
# model_versions on one baseline set.
MODEL_VERSION = "tps-2.0.0-ridge"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path,
                    default=Path("scratchpad/projections/normals"))
    ap.add_argument("--gdd-root", type=Path, default=None,
                    help="published gdd10 season surfaces "
                         "(default: projections.DEFAULT_GDD_ROOT)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    # gdd10 is the one normal `normals.py` cannot build — GDD is a seasonal
    # accumulation with no monthly surfaces behind it — so it is recorded here
    # with the same machinery rather than left as the odd one out.
    CODE_MODULES = ("gdd_normal.py", "normals.py", "projections.py",
                    "gdd_season.py", "raster.py")

    from scripts.interpolation import normals as N
    from scripts.interpolation import projections as P
    from scripts.interpolation import raster as R

    baseline = N.DEFAULT_BASELINE
    label = f"{baseline[0]}-{baseline[1]}"
    gdd_root = args.gdd_root or P.DEFAULT_GDD_ROOT

    record = None
    if not args.dry_run:
        record = RunRecord(args.out)
        record.open({
            "started_at": datetime.now(timezone.utc).isoformat(),
            "engine": "gdd_normal", "argv": sys.argv,
            "parameters": {"out": str(args.out), "baseline": list(baseline),
                           "variable": VARIABLE, "statistic": STATISTIC,
                           "season": SEASON,
                           "months_per_period": MONTHS_PER_PERIOD},
            "sources": {"gdd_root": str(gdd_root),
                        "derived_from": "published gdd10 season cumulative "
                                        "(April)"},
            "code": {"digest": _code_digest(CODE_MODULES),
                     "git": _git_revision()},
            "environment": _environment()})

    values, land, template = P.gdd10_normal(gdd_root, baseline)

    vals = values[land]
    # Vintages 1987..2005 — 19, not 20, because vintage V spans Sep(V-1)..Apr(V)
    # and 1986 would need September 1985. The same off-by-one that made DJF 19,
    # and the same one that understated frost in all 23 zones once already.
    years_used = list(range(baseline[0] + 1, baseline[1] + 1))

    out_dir = args.out / VARIABLE / "normal" / label
    name = f"{VARIABLE}_normal_{label}_{SEASON}_500m_{STATISTIC}.tif"
    path = out_dir / name

    logger.info("%s/%s %s  n=%d  med %.1f  [%.1f .. %.1f]",
                VARIABLE, STATISTIC, SEASON, len(years_used),
                float(np.median(vals)), float(np.min(vals)), float(np.max(vals)))

    if args.dry_run:
        logger.info("dry run — would write %s", path)
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    R.write_cog(
        path, values, template,
        max_z_error=R.DEFAULT_MAX_Z_ERROR.get(VARIABLE, 0.01),
        tags={
            "variable": VARIABLE, "statistic": STATISTIC,
            "granularity": "normal", "period": SEASON,
            "baseline": label, "resolution_m": template.resolution_m,
            # OUR engine, not MfE's. A baseline is a reduction of our own
            # published archive and must never inherit the projection's
            # model_version or its attribution.
            "model_version": MODEL_VERSION,
            "reduction": "extensive",
            "n_periods": len(years_used),
            "years_used": ",".join(str(y) for y in years_used),
            "months_per_period": MONTHS_PER_PERIOD,
            "derived_from": "published gdd10 season cumulative (April)",
        },
    )

    manifest = {
        "variable": VARIABLE, "statistic": STATISTIC,
        "granularity": "normal", "baseline": label,
        "reduction": "extensive",
        "model_version": MODEL_VERSION,
        "resolution_m": template.resolution_m,
        "land_cells": int(land.sum()),
        "archive_root": str(gdd_root),
        "periods": [{
            "period": SEASON,
            "path": str(path.relative_to(args.out)),
            "n_periods": len(years_used),
            "years_used": years_used,
            "years_dropped": {},
            "mean": float(np.mean(vals)),
            "p5": float(np.percentile(vals, 5)),
            "median": float(np.percentile(vals, 50)),
            "p95": float(np.percentile(vals, 95)),
            "min": float(np.min(vals)), "max": float(np.max(vals)),
        }],
    }
    man_path = out_dir / f"manifest_{STATISTIC}.json"
    man_path.write_text(json.dumps(manifest, indent=2))
    logger.info("wrote %s", path)
    logger.info("wrote %s", man_path)
    if record is not None:
        record.close({"variable": VARIABLE, "statistic": STATISTIC,
                      "n_periods": len(years_used), "years_used": years_used,
                      "land_cells": int(land.sum()),
                      "median": float(np.percentile(vals, 50)),
                      "min": float(np.min(vals)), "max": float(np.max(vals))},
                     # Nothing copied: the manifest lands in
                     # `<out>/gdd10/normal/<baseline>/`, not at the record root,
                     # and the record sits at the shared normals root so it is a
                     # sibling of `normals.py`'s. Its contents are summarised
                     # into the outcome above instead.
                     copy=())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
