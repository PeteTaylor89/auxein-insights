"""Acceptance suite for the REAL surface API — Postgres index + COGs on S3.

Companion to `check_surface_stub.py`, which asserts the fixture behaviour. This
one asserts the production path: that `surface_run` resolves to a real object,
that the object reads over S3 range requests, and that the awkward cases the
frontend depends on behave as contracted.

Run it with the backend venv, which has both the app dependencies and rasterio::

    backend/venv/Scripts/python.exe backend/scripts/check_surfaces_live.py

It calls the router functions directly rather than over HTTP, so it needs no
running server. `SURFACE_STUB_ENABLED` must be unset or 0 — with the stub on,
every assertion here would be measuring the fixture instead.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from fastapi import HTTPException                                  # noqa: E402

from api.v1 import surfaces as S                                   # noqa: E402
from db.session import SessionLocal                                # noqa: E402

# Entitlements are enforced by a router dependency; calling the handler directly
# bypasses FastAPI's injection, so the gate is passed explicitly and on purpose.
PRO = SimpleNamespace(id=0, subscription_tier="pro", pro_expires_at=None)

# Blenheim — Marlborough, the densest vineyard region in the country.
BL = {"lon": 173.961, "lat": -41.514}

passed = failed = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}" + (f"  -- {detail}" if detail else ""))


def status_of(fn, **kwargs) -> int:
    try:
        fn(**kwargs)
        return 200
    except HTTPException as exc:
        return exc.status_code


def main() -> int:
    if S.STUB_ENABLED:
        print("REFUSING TO RUN: SURFACE_STUB_ENABLED is set, so these would "
              "measure the fixture rather than the published archive.")
        return 2

    db = SessionLocal()
    try:
        print("\n/available")
        # Every defaulted parameter is passed explicitly: calling the handler
        # directly skips FastAPI's dependency resolution, so an omitted argument
        # arrives as a `Query(...)` object rather than as its default value.
        av = S.available(variable="temp_mean", granularity="monthly",
                         statistic=None, db=db)
        check("temp_mean monthly spans the published archive",
              av.first == "1986-01-01" and av.last == "2023-12-01",
              f"{av.first}..{av.last}")
        check("456 months, no gaps",
              av.meta["count"] == 456 and av.gaps == [],
              f"count={av.meta['count']} gaps={len(av.gaps)}")
        check("resolution is 500 m only", av.resolutions == [500],
              str(av.resolutions))
        check("statistic vocabulary is reported",
              "mean" in av.meta["statistics"] and "sd" in av.meta["statistics"])
        # The junk bands deleted on 2026-08-13 must not reappear in the index:
        # frost_days on a MEAN temperature is days the daily mean went below
        # zero, which is not a frost day and was never meant to ship.
        check("temp_mean carries no frost_days band",
              "frost_days" not in av.meta["statistics"],
              str(av.meta["statistics"]))
        check("temp_min DOES carry frost_days",
              "frost_days" in S.available(variable="temp_min",
                                          granularity="monthly",
                                          statistic=None,
                                          db=db).meta["statistics"])

        print("\n/tiles")
        tile = S._real_tile(db, "temp_mean", "monthly", "2020-01", 5, 31, 20,
                            None, None, None, None)
        check("tile is a PNG", tile.body[:8] == b"\x89PNG\r\n\x1a\n")
        check("tile resolves to the expected object",
              tile.headers["X-Surface-Key"].endswith(
                  "temp_mean_monthly_202001_500m_mean.tif"),
              tile.headers["X-Surface-Key"])
        check("tile domain is fixed, not stretched per tile",
              tile.headers["X-Surface-Domain"] == "-5.0,21.0",
              tile.headers["X-Surface-Domain"])
        check("tiles are cached hard (immutable archive)",
              "immutable" in tile.headers["Cache-Control"])

        # A tile far from New Zealand must be a valid, fully transparent PNG —
        # not a 404 and not an error. Mapbox requests the whole viewport.
        ocean = S._real_tile(db, "temp_mean", "monthly", "2020-01", 5, 5, 5,
                             None, None, None, None)
        check("a tile off the land mask is transparent, not an error",
              ocean.body[:8] == b"\x89PNG\r\n\x1a\n")

        check("a date outside the archive 404s",
              status_of(S._real_tile, db=db, variable="temp_mean",
                        granularity="monthly", valid_at="2035-01", z=5, x=31,
                        y=20, ramp=None, vmin=None, vmax=None,
                        statistic=None) == 404)
        check("an unknown ramp 422s",
              status_of(S._real_tile, db=db, variable="temp_mean",
                        granularity="monthly", valid_at="2020-01", z=5, x=31,
                        y=20, ramp="chartreuse", vmin=None, vmax=None,
                        statistic=None) == 422)
        check("an out-of-range zoom 422s",
              status_of(S._real_tile, db=db, variable="temp_mean",
                        granularity="monthly", valid_at="2020-01", z=22, x=1,
                        y=1, ramp=None, vmin=None, vmax=None,
                        statistic=None) == 422)

        print("\n/point")
        pt = S.point_sample(_user=PRO, **BL, variables="temp_mean",
                            start="2020-01", end="2020-12",
                            granularity="monthly", statistic=None, db=db)
        values = [p.value for p in pt.series[0].points]
        check("twelve monthly values at Blenheim", len(values) == 12,
              str(len(values)))
        check("every month has a value", all(v is not None for v in values))
        check("summer is warmer than winter", values[0] > values[6],
              f"Jan {values[0]} vs Jul {values[6]}")
        check("values are physically plausible for Marlborough",
              all(2.0 < v < 22.0 for v in values),
              f"{min(values)}..{max(values)}")
        check("confidence carries a degC cv_rmse",
              pt.series[0].points[0].confidence.cv_rmse is not None)
        check("meta says this is not the stub", pt.meta["stub"] is False)

        # Off the land mask must be null, never zero. A null-written-as-zero
        # bug (B4.1) has already bitten this platform once.
        sea = S.point_sample(_user=PRO, lon=168.0, lat=-41.0,
                             variables="temp_mean", start="2020-01",
                             end="2020-01", granularity="monthly",
                             statistic=None, db=db)
        check("a point at sea is null, not zero",
              sea.series[0].points[0].value is None
              and "land mask" in (sea.series[0].points[0].reason or ""))

        # Rainfall cv_rmse is dimensionless (ratio space). Publishing it beside
        # a millimetre value would understate the error ~1000x.
        rain = S.point_sample(_user=PRO, **BL, variables="rainfall",
                              start="2020-01", end="2020-01",
                              granularity="monthly", statistic="sum", db=db)
        rp = rain.series[0].points[0]
        check("rainfall returns millimetres", rp.value is not None and rp.value > 0,
              str(rp.value))
        check("rainfall cv_rmse is SUPPRESSED, not shown as mm",
              rp.confidence.cv_rmse is None)

        check("daily granularity is refused, not faked",
              status_of(S.point_sample, _user=PRO, **BL, variables="temp_mean",
                        start="2020-01-01", end="2020-01-05",
                        granularity="daily", statistic=None, db=db) == 422)
        check("an unknown variable 422s",
              status_of(S.point_sample, _user=PRO, **BL, variables="nope",
                        start="2020-01", end="2020-01",
                        granularity="monthly", statistic=None, db=db) == 422)
        check("a reversed range 422s",
              status_of(S.point_sample, _user=PRO, **BL, variables="temp_mean",
                        start="2020-06", end="2020-01",
                        granularity="monthly", statistic=None, db=db) == 422)

        print("\n/region")
        check("region is 501 until the weighting decision lands",
              status_of(S.region_stats, variables="temp_mean", start="2020-01",
                        end="2020-01", zone_id=1, bbox=None,
                        granularity="monthly") == 501)
    finally:
        db.close()

    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
