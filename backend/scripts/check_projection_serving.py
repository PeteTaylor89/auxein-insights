#!/usr/bin/env python3
"""Verify what the projection API will actually SERVE.

`check_projections.py` verifies the publish: the index and the bucket agreeing,
the physics having the right sign, the matrix being complete. This one verifies
the read path that sits on top of it, which is a different set of ways to be
wrong:

  * a WITHHELD layer reachable through any of the three code paths. Frost was
    withdrawn from the product on 2026-08-24 and the projection inherits the
    same broken normal — the exclusion has to hold at the catalogue, at the
    step list AND at resolve, because a client only has to find one of them.
  * a servable layer with no MEASURED display domain, which would either 500 or
    (worse, if anyone ever adds a fallback) render at an invented scale.
  * an axis the API advertises that has no surface behind it. The
    (scenario, period) matrix is NOT full — only ssp370 reaches +3 C — so a
    client rendering the axes as a cross product would offer chips that 404.
  * a tile that does not actually come back as a PNG from S3.

Same shape as its sibling: every assertion prints, N/N is reported so a partial
pass cannot read as success, and the exit code is non-zero on any failure.

RUN FROM THE ROOT VENV (`../venv/Scripts/python.exe`). It needs rasterio for the
tile render, which `backend/venv` does not have; see project_fastgrid_basis.

Usage:
    ../venv/Scripts/python.exe scripts/check_projection_serving.py
    ../venv/Scripts/python.exe scripts/check_projection_serving.py --skip-tiles
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logger = logging.getLogger(__name__)

# A z=5 tile that covers most of New Zealand, so a blank render is obvious in
# the byte count rather than merely being a valid empty PNG.
TILE = (5, 31, 19)
PNG_MAGIC = b"\x89PNG"


class Checker:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def check(self, label: str, ok: bool, detail: str = "") -> bool:
        if ok:
            self.passed += 1
            logger.info("  PASS  %s%s", label, f"  ({detail})" if detail else "")
        else:
            self.failed += 1
            logger.error("  FAIL  %s%s", label, f"  ({detail})" if detail else "")
        return ok


def session():
    """Its own engine — the root venv has no boto3, so `db.session` is out of
    reach. Same reasoning as scan_projection_domains.py."""
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    host = os.getenv("RDS_ENDPOINT")
    if not host:
        raise SystemExit("RDS_ENDPOINT is not set; is .env present at the repo root?")
    url = (f"postgresql://{os.environ['RDS_USER']}:{os.environ['RDS_PASSWORD']}"
           f"@{host}:{os.getenv('RDS_PORT', '5432')}/{os.environ['RDS_DATABASE']}")
    return sessionmaker(bind=create_engine(url))()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-tiles", action="store_true",
                    help="index and domain checks only, no S3 reads")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    from sqlalchemy import text
    from services import projection_store as P

    c = Checker()
    db = session()
    try:
        published = db.execute(text("""
            SELECT DISTINCT variable, statistic, season, scenario, period
            FROM surface_projection_run WHERE status = 'ok'
        """)).mappings().all()
        c.check("index is populated", len(published) > 0, f"{len(published)} rows")

        layers = P.layers(db)
        served = {(layer["variable"], layer["statistic"]) for layer in layers}

        # --- the withheld layers ------------------------------------------
        logger.info("\n== withheld layers ==")
        for variable, statistic in sorted(P.WITHHELD):
            in_index = any(r["variable"] == variable and r["statistic"] == statistic
                           for r in published)
            c.check(f"{variable}/{statistic} is published but withheld",
                    in_index, "not in the index at all" if not in_index else "")
            c.check(f"{variable}/{statistic} absent from the catalogue",
                    (variable, statistic) not in served)
            c.check(f"{variable}/{statistic} has no steps",
                    P.steps(db, variable, statistic) == [])
            row = next((r for r in published
                        if r["variable"] == variable and r["statistic"] == statistic),
                       None)
            if row is not None:
                try:
                    P.resolve(db, variable, statistic, row["scenario"],
                              row["period"], row["season"])
                    c.check(f"{variable}/{statistic} resolve refuses", False,
                            "RESOLVED — a withdrawn metric is reachable")
                except P.ProjectionNotFound:
                    c.check(f"{variable}/{statistic} resolve refuses", True)

        # --- every served layer can actually be drawn ----------------------
        logger.info("\n== display domains ==")
        for variable, statistic in sorted(served):
            seasons = sorted({r["season"] for r in published
                              if r["variable"] == variable
                              and r["statistic"] == statistic})
            for s in seasons:
                try:
                    lo, hi, ramp = P.domain_for(variable, statistic, s)
                    ok = hi > lo and ramp in __import__(
                        "services.surface_store", fromlist=["RAMPS"]).RAMPS
                    c.check(f"{variable}/{statistic} {s} domain",
                            ok, f"{lo}..{hi} {ramp}")
                except P.ProjectionNotFound as exc:
                    c.check(f"{variable}/{statistic} {s} domain", False, str(exc))

        # --- the axes the API advertises exist -----------------------------
        logger.info("\n== advertised axes ==")
        for variable, statistic in sorted(served):
            steps = P.steps(db, variable, statistic)
            combos = {(st["scenario"], st["period"]) for st in steps}
            scenarios = {st["scenario"] for st in steps}
            periods = {st["period"] for st in steps}
            full = len(scenarios) * len(periods)
            # NOT an equality check. The matrix being ragged is the expected
            # state; what must hold is that every advertised value appears in at
            # least one real combination, and that the client is given the
            # combinations rather than being left to multiply the axes.
            c.check(f"{variable}/{statistic} matrix is ragged, as expected",
                    len(combos) <= full,
                    f"{len(combos)} of {full} pairs")
            orphan_sc = scenarios - {sc for sc, _ in combos}
            orphan_pe = periods - {pe for _, pe in combos}
            c.check(f"{variable}/{statistic} no orphan axis value",
                    not orphan_sc and not orphan_pe,
                    f"scenarios={sorted(orphan_sc)} periods={sorted(orphan_pe)}")
            # Every label the API will attach has to exist, or a chip renders as
            # a raw enum value like 'fp2041-2060'.
            unlabelled = ([sc for sc in scenarios if sc not in P.SCENARIO_LABELS]
                          + [pe for pe in periods if pe not in P.PERIOD_LABELS]
                          + [st["season"] for st in steps
                             if st["season"] not in P.SEASON_LABELS])
            c.check(f"{variable}/{statistic} every axis value is labelled",
                    not unlabelled, f"unlabelled: {sorted(set(unlabelled))}")

        # --- the baseline ---------------------------------------------------
        logger.info("")
        logger.info("== baseline (1986-2005) ==")
        for variable, statistic in sorted(served):
            b = P.baselines(db, variable, statistic)
            seasons = sorted({r["season"] for r in published
                              if r["variable"] == variable
                              and r["statistic"] == statistic})
            c.check(f"{variable}/{statistic} baseline covers every season",
                    set(b) == set(seasons),
                    f"have {sorted(b)} want {seasons}")
            # OUR surface, OUR credit. A baseline carrying MfE's CC BY 4.0
            # string would attribute our own archive to someone else.
            wrong = [k for k, v in b.items()
                     if "Ministry for the Environment" in (v.get("source") or "")]
            c.check(f"{variable}/{statistic} baseline is not credited to MfE",
                    not wrong, f"MfE-credited seasons: {wrong}")
            versions = {v["model_version"] for v in b.values()}
            c.check(f"{variable}/{statistic} baseline is our own engine",
                    versions and not any(v.startswith(P.MODEL_VERSION_PREFIX)
                                         for v in versions),
                    str(versions))
            # The whole point of the flip: one scale, both sides.
            for season, row in b.items():
                try:
                    lo, hi, _ = P.domain_for(variable, statistic, season)
                    med = row["baseline_median"]
                    c.check(f"{variable}/{statistic} {season} baseline is on "
                            f"the projection's scale",
                            med is not None and lo <= med <= hi,
                            f"median {med} in {lo}..{hi}")
                except P.ProjectionNotFound as exc:
                    c.check(f"{variable}/{statistic} {season} baseline domain",
                            False, str(exc))

        for variable, statistic in sorted(P.WITHHELD):
            c.check(f"{variable}/{statistic} baseline is withheld too",
                    P.baselines(db, variable, statistic) == {})

        # --- a real tile, per served layer ---------------------------------
        if not args.skip_tiles:
            logger.info("\n== tiles ==")
            from services import surface_store as store
            z, x, y = TILE
            for variable, statistic in sorted(served):
                steps = P.steps(db, variable, statistic)
                if not steps:
                    c.check(f"{variable}/{statistic} tile", False, "no steps")
                    continue
                st = steps[0]
                # BOTH SIDES OF THE FLIP, through the same resolve and the same
                # renderer. The baseline is addressed by the 'baseline' sentinel
                # in scenario and period, which is the whole reason it needed no
                # second endpoint — and the reason this can be one loop.
                for label, sc, pe in (
                    ("projection", st["scenario"], st["period"]),
                    ("baseline", P.BASELINE_SENTINEL, P.BASELINE_SENTINEL),
                ):
                    try:
                        row = P.resolve(db, variable, statistic, sc, pe,
                                        st["season"])
                        lo, hi, ramp = P.domain_for(variable, statistic,
                                                    st["season"])
                        png = store.render_tile(row["s3_key"], z, x, y,
                                                ramp, lo, hi)
                        c.check(f"{variable}/{statistic} {label} tile renders",
                                png[:4] == PNG_MAGIC and len(png) > 1000
                                and row["kind"] == label,
                                f'{len(png)} bytes, kind={row["kind"]}')
                    except Exception as exc:                       # noqa: BLE001
                        c.check(f"{variable}/{statistic} {label} tile renders",
                                False, str(exc))
    finally:
        db.close()

    total = c.passed + c.failed
    logger.info("\n%d/%d checks passed", c.passed, total)
    return 1 if c.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
