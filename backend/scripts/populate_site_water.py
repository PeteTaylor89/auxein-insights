#!/usr/bin/env python3
"""Reference ET, crop ET and the running water balance at every site.

    python backend/scripts/populate_site_water.py                    # this season
    python backend/scripts/populate_site_water.py --season 2027
    python backend/scripts/populate_site_water.py --site 16

## Whole seasons, never a window

The balance is a running total from 1 September, so it can only be rebuilt from
the start of a season. A `--from/--to` flag would let a caller produce a
cumulative that begins wherever their window happened to open, which is the one
way this table could carry a number that looks right and is not. Seasons in,
seasons out.

## Elevation is filled first, because Penman-Monteith needs it

No site had an elevation: `insights_site_service.resolve_cell` returns the grid
row and column and no height. This fills it from the SAME 500 m DEM the
surfaces are lapse-retrended onto, so a site's elevation agrees with the
temperature it is being given. Between sea level and a 700 m terrace the
psychrometric constant moves about 8%, straight onto the aerodynamic half of
the equation.

## WHERE ET is computed is a client decision; HOW is a network one

WHERE: only sites whose `requested_metrics` include `et`. On the BSI list that
is seven, and it is not `site_type = 'regional'` (eight) — Nelson AWS is
Regional and does not want ET because Appleby supplies it, while Appleby wants
ET and nothing else. A Pro subscriber's own site has no list and gets ET.

HOW: Penman-Monteith wherever the nearest stations carry solar, wind and
humidity inside their refusal distances, Hargreaves-Samani otherwise. Solar is
the binding input — 37 stations nationally — and `eto_method` on each row says
which ran.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from db.session import SessionLocal                                 # noqa: E402
from db.models.insights_site import InsightsSite                    # noqa: E402
from services import site_water as water                            # noqa: E402

GRID = (Path(__file__).resolve().parents[2]
        / "backend" / "models" / "example data" / "VCDN_500m.csv")


def fill_elevation(db, sites) -> int:
    """Give every site its DEM height, from the grid the surfaces are built on.

    Loaded ONLY when something is missing — the grid is 1.4M rows and a nightly
    run should not pay for it to discover there is nothing to do.
    """
    missing = [s for s in sites if s.elevation_m is None
               and s.latitude is not None]
    if not missing:
        return 0

    # THE GRID IS NOT IN EVERY CONTAINER THIS RUNS IN. `VCDN_500m.csv` is 73 MB
    # and gitignored, so it is not in the image; `entrypoint.sh` fetches it from
    # S3 only on the SURFACES path, after the case that execs `pipeline.sh`. So
    # the 18:00 pipeline, where stage 4c calls this, has no grid at all.
    #
    # Every site had an elevation when 4c was wired in, so this costs nothing
    # today — but the first site added afterwards would have brought the whole
    # pipeline down on a FileNotFoundError, from a stage that exists to refine
    # a number. `compute()` already treats a missing elevation as sea level and
    # says so, so the degradation is defined: warn, and leave it to a run that
    # has the grid.
    if not GRID.exists():
        print(f"WARNING {len(missing)} site(s) have no elevation and the 500 m "
              f"grid is not in this container ({GRID}); they will be modelled "
              f"at sea level until a run that has it fills them")
        return 0

    import numpy as np
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts.interpolation.raster import RasterTemplate, grid_from_csv

    grid = grid_from_csv(GRID)
    template = RasterTemplate.build(grid["latitude"].to_numpy(float),
                                    grid["longitude"].to_numpy(float))
    elev = template.to_raster(grid["elevation"].to_numpy(float), nodata=np.nan)

    filled = 0
    for s in missing:
        # THE STORED CELL, not a fresh lookup from lat/lon. Those two disagree
        # for any site that was snapped at import: `import_account_sites.py`
        # moves an off-mask point to the nearest land cell and updates
        # grid_row/grid_col, but leaves latitude/longitude as the client wrote
        # them — their list is the system of record for where they think the
        # site is. Nelson AWS is exactly that case, and a lat/lon lookup lands
        # in the water and returns nodata.
        #
        # Reading the stored cell also guarantees the elevation comes from the
        # same cell the surfaces are sampled at, which is the point.
        row, col = s.grid_row, s.grid_col
        if row is None or col is None:
            continue
        if not (0 <= col < template.width and 0 <= row < template.height):
            continue
        v = elev[row, col]
        if v != v:
            continue
        s.elevation_m = float(v)
        filled += 1
    db.commit()
    return filled


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--site", type=int, help="one site id")
    p.add_argument("--season", type=int, action="append",
                   help="vintage year; repeatable. Default: the current one")
    p.add_argument("--require-rows", action="store_true")
    args = p.parse_args()

    seasons = set(args.season or [])
    if not seasons:
        today = datetime.now(timezone.utc).date()
        seasons = {today.year + 1 if today.month >= 7 else today.year}

    db = SessionLocal()
    try:
        q = db.query(InsightsSite).filter(InsightsSite.status == "ready")
        if args.site:
            q = q.filter(InsightsSite.id == args.site)
        sites = q.order_by(InsightsSite.id).all()
        if not sites:
            print("no ready sites")
            return 1 if args.require_rows else 0

        filled = fill_elevation(db, sites)
        if filled:
            print(f"elevation filled for {filled} site(s) from the 500 m grid")

        # ET IS NOT COMPUTED EVERYWHERE, because it was not asked for
        # everywhere. The client's list ticks it at seven sites and the ticks
        # are not derivable from `site_type` — see `site_water.wants`.
        wanted = [s for s in sites if water.wants(s, water.METRIC_ET)]
        skipped = len(sites) - len(wanted)
        print(f"{len(wanted)} site(s) want ET"
              + (f", {skipped} did not ask for it" if skipped else "")
              + f"; season(s) {sorted(seasons)}")
        total = {"rows": 0, "penman": 0, "hargreaves": 0}
        for site in wanted:
            r = water.compute(db, site.id, site.latitude, site.longitude,
                              site.elevation_m, seasons)
            db.commit()
            for k in total:
                total[k] += r[k]
            if r["rows"]:
                # Which METHOD ran is the number worth printing per site. A run
                # that silently fell back everywhere and a run that used the
                # reference method everywhere produce the same row count.
                print(f"  site {site.id:<5} {(site.label or '-')[:24]:<24} "
                      f"{r['rows']:>4} days  "
                      f"PM {r['penman']:>4}  HS {r['hargreaves']:>4}")

        print(f"\n{total['rows']} day(s) written: "
              f"{total['penman']} Penman-Monteith, "
              f"{total['hargreaves']} Hargreaves-Samani")
        if args.require_rows and total["rows"] == 0:
            print("FAILED: --require-rows was set and nothing was written")
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
