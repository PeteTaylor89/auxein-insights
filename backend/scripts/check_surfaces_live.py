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
        # The invariant is that every tile of a layer shares one domain, not that
        # the domain holds any particular value — pinning the number here meant
        # retuning a ramp failed a test that was not about ramps. Assert the
        # property instead: the header agrees with the declared domain, and a
        # different tile of the same layer reports the same one.
        expected = S.store.domain_for("temp_mean", "mean")
        other = S._real_tile(db, "temp_mean", "monthly", "2020-01", 5, 30, 20,
                             None, None, None, None)
        check("tile domain is fixed, not stretched per tile",
              tile.headers["X-Surface-Domain"] == f"{expected[0]},{expected[1]}"
              and other.headers["X-Surface-Domain"] == tile.headers["X-Surface-Domain"],
              f'{tile.headers["X-Surface-Domain"]} vs {other.headers["X-Surface-Domain"]}')

        # A shared ramp across the three temperature layers is only honest if the
        # domain is shared too; otherwise the same red means 17 C on one layer
        # and 26 C on another.
        temp_domains = {v: S.store.domain_for(v, "mean")
                        for v in ("temp_mean", "temp_min", "temp_max")}
        check("all three temperature layers share one scale",
              len(set(temp_domains.values())) == 1, temp_domains)

        # Measured over the whole archive: rainfall/max reaches 806.7 mm and
        # p99.9 is 319.9. A ceiling below p99.9 flattens every heavy-rain event.
        rain_lo, rain_hi, _ = S.store.domain_for("rainfall", "max")
        check("the wettest-day ceiling clears the measured p99.9",
              rain_lo == 0.0 and rain_hi >= 319.9, (rain_lo, rain_hi))
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

        print("\n/region + /zones")
        from sqlalchemy import text as _text
        zid = db.execute(_text(
            "SELECT id FROM climate_zones WHERE slug = 'marlborough'")).scalar()

        reg = S.region_stats(variables="temp_mean,rainfall", start="2022-09",
                             end="2023-04", zone_id=zid, bbox=None,
                             granularity="monthly", weighting="blocks", db=db)
        check("region serves a vineyard-weighted series",
              reg.meta["weighting"] == "blocks"
              and len(reg.series) == 2
              and len(reg.series[0].points) == 8,
              f'{reg.meta["weighting"]}, {len(reg.series[0].points)} points')
        # The whole point of the mask: a Marlborough value must reflect the
        # planted valley, not the Sounds and the inland ranges. The polygon mean
        # for this zone is 11.3 degC.
        summer = [p.mean for p in reg.series[0].points if p.valid_at.month == 1]
        check("Marlborough summer is planted-valley warm, not polygon-cold",
              summer and 15.0 <= summer[0] <= 22.0, summer)
        check("region declares the spread basis and extent",
              reg.meta["spread_basis"] == "cells"
              and "planted" in reg.meta["extent"])
        check("area weighting is refused, not silently substituted",
              status_of(S.region_stats, variables="temp_mean", start="2023-01",
                        end="2023-01", zone_id=zid, bbox=None,
                        granularity="monthly", weighting="area", db=db) == 422)
        check("daily granularity is refused for regions",
              status_of(S.region_stats, variables="temp_mean", start="2023-01",
                        end="2023-01", zone_id=zid, bbox=None,
                        granularity="daily", weighting="blocks", db=db) == 422)
        check("an unknown zone 404s",
              status_of(S.region_stats, variables="temp_mean", start="2023-01",
                        end="2023-01", zone_id=999999, bbox=None,
                        granularity="monthly", weighting="blocks", db=db) == 404)

        fc = S.zone_layer(level="region", simplify=0.004, metric="gdd10", db=db)
        check("zone layer returns the ten regions with geometry",
              len(fc["features"]) == 10, len(fc["features"]))
        check("every zone feature carries a headline and a region URL",
              all(f["properties"]["headline"] is not None
                  and f["properties"]["url"].startswith("/regions/")
                  for f in fc["features"]))
        # Zones nest, so a consumer that sums them double-counts. The payload has
        # to say so rather than leave it to documentation nobody reads.
        check("the zone layer warns that zones overlap",
              "overlaps" in fc["meta"])
        check("sub-zones are a separate request, not mixed in",
              len(S.zone_layer(level="sub_zone", simplify=0.004,
                               metric="gdd10", db=db)["features"]) == 13)
        check("an unknown level 422s",
              status_of(S.zone_layer, level="province", simplify=0.004,
                        metric="gdd10", db=db) == 422)

        season = S._real_zone_season(db, "marlborough", "gdd10,rain")
        check("zone season covers every vintage in the archive",
              len(season.series[0].points) == 37,
              len(season.series[0].points))
        check("an unknown zone slug 404s",
              status_of(S.zone_season, slug="not-a-zone", metrics=None,
                        db=db) == 404)
    finally:
        db.close()

    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
