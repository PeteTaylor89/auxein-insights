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

import json
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
# A plain signed-in account. `/available` returns a DIFFERENT payload to an
# anonymous caller (the newest month only), and passing nothing would hand the
# handler a `Depends(...)` object — which is not None, so it would read as
# registered and the gate would never be exercised. Pass it explicitly.
FREE = SimpleNamespace(id=1, subscription_tier="free", pro_expires_at=None)
ANON = None

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
                         statistic=None, db=db, user=FREE)
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
                                          db=db, user=FREE).meta["statistics"])
        check("a registered caller is told the scope is full",
              av.meta["access"]["scope"] == "full",
              str(av.meta["access"]))

        # The free rule: anonymous sees the newest month of every layer, and
        # the record behind it needs an account. Enforced server-side, because
        # the scrubber renders whatever steps it is handed.
        anon = S.available(variable="temp_mean", granularity="monthly",
                           statistic=None, db=db, user=ANON)
        check("anonymous gets exactly one step",
              len(anon.meta["steps"]) == 1 and anon.meta["count"] == 1,
              f"{anon.meta['count']} steps")
        check("that step is the NEWEST month, not the oldest",
              anon.meta["steps"][0]["valid_at"] == "2023-12",
              anon.meta["steps"][0]["valid_at"])
        check("the anonymous window collapses onto that month",
              anon.first == anon.last == "2023-12-01",
              f"{anon.first}..{anon.last}")
        # A one-step list has no interior, so shipping the archive's gaps would
        # describe holes in a record this caller cannot see.
        check("no gaps are described to an anonymous caller", anon.gaps == [],
              str(anon.gaps))
        check("the archive's true span is still advertised",
              anon.meta["access"]["scope"] == "latest_month"
              and anon.meta["access"]["archive_first"] == "1986-01-01"
              and anon.meta["access"]["archive_count"] == 456,
              str(anon.meta["access"]))
        # The picture is the pitch: every layer must still be reachable
        # anonymously, or the free tier is one map instead of all of them.
        check("anonymous still sees every statistic on offer",
              anon.meta["statistics"] == av.meta["statistics"],
              str(anon.meta["statistics"]))
        check("anonymous rainfall is gated the same way",
              len(S.available(variable="rainfall", granularity="monthly",
                              statistic="sum", db=db,
                              user=ANON).meta["steps"]) == 1)

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

        # Measured over the whole archive. A ceiling below p99.9 flattens every
        # heavy-rain event, which is what the old 150 mm ceiling did.
        #
        # RE-MEASURED 2026-08-18 after the LENZ-conditioned rainfall COGs
        # replaced the originals: rainfall/max p99.9 319.9 -> 308.8, archive max
        # 806.7 -> 623.1. **This number has to be re-pinned whenever the
        # rainfall archive is rebuilt** — leaving 319.9 here would have failed a
        # correctly-retuned ramp, and raising it to silence the failure would
        # have hidden a real regression. Re-run scan_rainfall_domain.py.
        rain_lo, rain_hi, _ = S.store.domain_for("rainfall", "max")
        check("the wettest-day ceiling clears the measured p99.9",
              rain_lo == 0.0 and rain_hi >= 308.8, (rain_lo, rain_hi))
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

        print("\ncoast clip + labels")
        check("every drawn region is clipped to the coastline",
              all(f["properties"]["clipped"] for f in fc["features"]),
              fc["meta"]["clipped"])
        check("the response names the coastline source",
              "LINZ" in fc["meta"].get("coastline", ""))
        check("every zone carries a label anchor",
              all(f["properties"]["label_lat"] is not None
                  for f in fc["features"]))
        # The anchors are the whole point of storing them: a point chosen by
        # area alone lands in the sea or on the wrong island.
        anchors_on_land = db.execute(_text("""
            SELECT count(*) FROM climate_zones z, nz_land l
             WHERE z.is_active AND z.label_point IS NOT NULL
               AND l.geom && z.label_point
               AND ST_Intersects(l.geom, z.label_point)
        """)).scalar()
        check("every label anchor is on land",
              anchors_on_land >= 23, anchors_on_land)
        # Auckland's largest land part is in the gulf: 51.9 km2 on Waiheke
        # against 49.0 at Kumeu. Ranking parts by area puts the label on the
        # wrong island, and 280 of the zone's 417 registered blocks are inside
        # the Waiheke SUB-ZONE, which has its own label.
        akl = next(f for f in fc["features"] if f["properties"]["slug"] == "auckland")
        check("Auckland is labelled on the mainland, not on Waiheke",
              akl["properties"]["label_lon"] < 174.9,
              akl["properties"]["label_lon"])
        # Clipping has to actually remove sea, or the column is decoration.
        sea = db.execute(_text("""
            SELECT round((100 * (1 - ST_Area(geometry_clipped::geography)
                                   / ST_Area(geometry::geography)))::numeric, 1)
              FROM climate_zones WHERE slug = 'waiheke'
        """)).scalar()
        check("Waiheke's outline lost the water it used to include",
              sea is not None and sea > 30, f"{sea}% removed")
        # Small parts are dropped from the DRAWN outline only; the stored
        # geometry keeps every rock.
        big = S.zone_layer(level="region", simplify=0.001, min_part_km2=0.05,
                           metric="gdd10", db=db)
        allparts = S.zone_layer(level="region", simplify=0.001, min_part_km2=0,
                                metric="gdd10", db=db)
        check("dropping sub-hectare islands shrinks the drawn payload",
              len(json.dumps(big)) < len(json.dumps(allparts)),
              f"{len(json.dumps(big))//1024} KB vs {len(json.dumps(allparts))//1024} KB")
        check("and loses no zone",
              len(big["features"]) == len(allparts["features"]) == 10)

        season = S._real_zone_season(db, "marlborough", "gdd10,rain")
        check("zone season covers every vintage in the archive",
              len(season.series[0].points) == 37,
              len(season.series[0].points))
        check("an unknown zone slug 404s",
              status_of(S.zone_season, slug="not-a-zone", metrics=None,
                        db=db) == 404)

        print("\nGDD season surfaces")
        gav = S.available(variable="gdd10", granularity="season",
                          statistic=None, db=db, user=FREE)
        check("37 seasons x 8 accumulation months",
              gav.meta["count"] == 296, gav.meta["count"])
        check("the default statistic is the running series, not the total",
              gav.meta["statistic"] == "cumulative", gav.meta["statistic"])
        # Sep-Apr then a jump to the next September. Emitting calendar gaps
        # would report May-August as a hole in all 37 seasons; winter is not
        # missing data, it is not part of a growing season.
        check("no gaps are claimed across the winter", gav.gaps == [],
              str(gav.gaps)[:80])
        check("each step names the vintage it accumulates into",
              gav.meta["steps"][0]["season"] == 1987
              and gav.meta["steps"][-1]["season"] == 2023)
        check("the unit is degree days, not degrees",
              gav.meta["unit"] == "GDD", gav.meta["unit"])
        # cv_units is degC because GDD inherits temp_mean's fits and was never
        # cross-validated itself. The unit mismatch is what makes the client
        # suppress it rather than print degree-days as degrees.
        check("inherited confidence is in degC so the client suppresses it",
              gav.meta["steps"][-1]["cv_units"] == "C",
              gav.meta["steps"][-1]["cv_units"])
        check("season totals are separately addressable",
              S.available(variable="gdd10", granularity="season",
                          statistic="sum", db=db,
                          user=FREE).meta["count"] == 37)

        gtile = S._real_tile(db, "gdd10", "season", "2023-04", 5, 31, 20,
                             None, None, None, "cumulative")
        check("a GDD tile renders", gtile.body[:8] == b"\x89PNG\r\n\x1a\n")
        # The April accumulation IS the season total, so both statistics must
        # resolve to ONE object rather than a duplicated raster.
        check("the season total shares the April object",
              S._real_tile(db, "gdd10", "season", "2023-04", 5, 31, 20, None,
                           None, None, "sum").headers["X-Surface-Key"]
              == gtile.headers["X-Surface-Key"])
        check("gdd10 and gdd0 do NOT share a scale",
              S.store.domain_for("gdd10", "sum")
              != S.store.domain_for("gdd0", "sum"))

        acc = S.point_sample(_user=PRO, **BL, variables="gdd10",
                             start="2022-09", end="2023-04",
                             granularity="season", statistic="cumulative",
                             db=db).series[0].points
        vals = [p.value for p in acc if p.value is not None]
        check("the season accumulates over eight months", len(vals) == 8, len(vals))
        # An accumulation can only ever rise. This is the one property a viewer
        # reads straight off the animation, so it is worth asserting.
        check("accumulation is monotone in time",
              all(b >= a for a, b in zip(vals, vals[1:])),
              [round(v) for v in vals])
        check("Blenheim's season total is viticulturally plausible",
              1100 < vals[-1] < 1700, round(vals[-1]))
    finally:
        db.close()

    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
