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


def _months_between(first: str, last: str) -> int:
    """Inclusive month count between two ISO dates, for continuity assertions."""
    fy, fm = int(first[:4]), int(first[5:7])
    ly, lm = int(last[:4]), int(last[5:7])
    return (ly - fy) * 12 + (lm - fm) + 1


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
        # DERIVED, not hardcoded. The record now grows: the CLIFLO archive was
        # extended to 2024-09 and the era-corrected DB runs on from 2024-10, so
        # any literal end date is stale the next time a month is published. What
        # must hold is that it STARTS in 1986 and has NO INTERIOR GAP -- an
        # unbroken 1986..present is the actual product claim.
        expected_months = _months_between(av.first, av.last)
        check("temp_mean monthly starts at the beginning of the archive",
              av.first == "1986-01-01", f"{av.first}..{av.last}")
        check("the monthly record is continuous, no gaps",
              av.meta["count"] == expected_months and av.gaps == [],
              f"count={av.meta['count']} of {expected_months} gaps={len(av.gaps)}")
        check("it reaches at least the CLIFLO extension",
              av.last >= "2024-09-01", av.last)
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

        # THREE TIERS (2026-08-25). Anonymous gets the newest step, a free
        # account opens the archive, Pro opens the daily cadence. All three are
        # checked, because the failures are asymmetric: over-gating quietly
        # costs organic traffic, under-gating gives the product away.
        anon = S.available(variable="temp_mean", granularity="monthly",
                           statistic=None, db=db, user=ANON)
        check("anonymous gets exactly one step",
              len(anon.meta["steps"]) == 1 and anon.meta["count"] == 1,
              f'{anon.meta["count"]} steps')
        newest = av.last[:7]
        check("that step is the NEWEST month, not the oldest",
              anon.meta["steps"][0]["valid_at"] == newest,
              f'{anon.meta["steps"][0]["valid_at"]} (newest {newest})')
        check("the anonymous window collapses onto that month",
              anon.first == anon.last == av.last,
              f"{anon.first}..{anon.last}")
        # A one-step list has no interior, so shipping the archive's gaps would
        # describe holes in a record this caller cannot see.
        check("no gaps are described to an anonymous caller",
              anon.gaps == [], str(anon.gaps))
        check("the archive's true span is still advertised",
              anon.meta["access"]["scope"] == "latest_step"
              and anon.meta["access"]["requires"] == "registration"
              and anon.meta["access"]["archive_first"] == "1986-01-01"
              and anon.meta["access"]["archive_count"] == av.meta["count"],
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
        # And the other half: a FREE ACCOUNT opens the whole archive. Without
        # this the anonymous assertions above would pass just as well against a
        # gate that withheld the archive from everyone.
        check("a free account opens the whole monthly archive",
              av.meta["count"] > 1
              and av.meta["access"]["scope"] == "full"
              and av.meta["access"]["cadence"] == "monthly",
              f'{av.meta["count"]} steps, {av.meta["access"]["scope"]}')

        # DAILY is the paid cadence. A registered-but-not-Pro caller is the case
        # that matters — an anonymous refusal could be an accident of not being
        # signed in, this one can only be the rule.
        daily_free = S.available(variable="temp_mean", granularity="daily",
                                 statistic=None, db=db, user=FREE)
        check("daily is withheld from a free account",
              daily_free.meta["steps"] == [] and daily_free.meta["count"] == 0,
              f'{daily_free.meta["count"]} steps')
        check("the withheld daily window is not left populated",
              daily_free.first is None and daily_free.last is None,
              f"{daily_free.first}..{daily_free.last}")
        check("daily says what it requires, and what is still free",
              daily_free.meta["access"]["scope"] == "none"
              and daily_free.meta["access"]["requires"] == "pro"
              and bool(daily_free.meta["access"].get("unlock")),
              str(daily_free.meta["access"]))
        # CADENCE IS CHECKED BEFORE DATE. A signed-out caller asking for daily
        # must be refused as PRO, not handed one free step as though daily were
        # just another archive.
        daily_anon = S.available(variable="temp_mean", granularity="daily",
                                 statistic=None, db=db, user=ANON)
        check("daily is refused to anonymous as PRO, not trimmed to one step",
              daily_anon.meta["steps"] == []
              and daily_anon.meta["access"]["requires"] == "pro",
              str(daily_anon.meta["access"]))

        # THE OTHER HALF, and it is the half that makes the first half mean
        # anything. "Free gets no daily steps" passes just as happily when no
        # daily surface has ever been published, which is the failure this
        # platform keeps rediscovering — `run_ingestion` once printed "Found 0
        # active Harvest stations" and exited 0 for a whole fleet backfill. So
        # Pro must be shown a NON-EMPTY list from the same call.
        daily_pro = S.available(variable="temp_mean", granularity="daily",
                                statistic=None, db=db, user=PRO)
        check("daily is a real gate, not an empty archive",
              len(daily_pro.meta["steps"]) > 0,
              f'pro sees {daily_pro.meta["count"]} days, '
              f'free sees {daily_free.meta["count"]}')
        check("Pro's daily span matches what free was told it is missing",
              daily_pro.first == daily_free.meta["access"]["daily_first"]
              and daily_pro.last == daily_free.meta["access"]["daily_last"],
              f'{daily_pro.first}..{daily_pro.last}')

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

        # DAILY IS SERVED NOW. This asserted a 422 until 2026-08-27, which was
        # true when it was written and stale from the day `run_live.py` first
        # published a daily surface. A day with no surface still comes back as a
        # null point with a reason — the 422 was about the CADENCE not existing,
        # and it does.
        check("daily granularity is served, not refused",
              status_of(S.point_sample, _user=PRO, **BL, variables="temp_mean",
                        start="2020-01-01", end="2020-01-05",
                        granularity="daily", statistic=None, db=db) == 200)
        check("an unsupported granularity still 422s",
              status_of(S.point_sample, _user=PRO, **BL, variables="temp_mean",
                        start="2020-01-01", end="2020-01-05",
                        granularity="fortnightly", statistic=None, db=db) == 422)
        check("an unknown variable 422s",
              status_of(S.point_sample, _user=PRO, **BL, variables="nope",
                        start="2020-01", end="2020-01",
                        granularity="monthly", statistic=None, db=db) == 422)
        check("a reversed range 422s",
              status_of(S.point_sample, _user=PRO, **BL, variables="temp_mean",
                        start="2020-06", end="2020-01",
                        granularity="monthly", statistic=None, db=db) == 422)

        # --- /probe -------------------------------------------------------
        # FREE AT THE CADENCE YOU CAN ALREADY SEE. The whole point of this
        # section is that the probe and the catalogue cannot disagree about who
        # may see what: every assertion here pairs a probe with the step list
        # `/available` handed the same caller.
        print("\n/probe")
        from fastapi import Response as _Response

        steps = av.meta["steps"]
        newest = steps[-1]["valid_at"]
        archive = steps[0]["valid_at"]

        def probe(user, **kw):
            kw.setdefault("variable", "temp_mean")
            kw.setdefault("granularity", "monthly")
            kw.setdefault("statistic", None)
            kw.setdefault("lon", BL["lon"])
            kw.setdefault("lat", BL["lat"])
            return S.probe(response=_Response(), db=db, user=user, **kw)

        def probe_status(user, **kw) -> int:
            try:
                probe(user, **kw)
                return 200
            except HTTPException as exc:
                return exc.status_code

        anon_av = S.available(variable="temp_mean", granularity="monthly",
                              statistic=None, db=db, user=ANON)
        check("anonymous sees exactly one step",
              len(anon_av.meta["steps"]) == 1, str(len(anon_av.meta["steps"])))
        check("and it is the same newest step a member sees",
              anon_av.meta["steps"][-1]["valid_at"] == newest)

        pb = probe(ANON, valid_at=newest)
        check("anonymous probes the newest step and gets a value",
              pb.value is not None, f"{pb.value} {pb.unit}")
        check("the probe is in degrees, at 500 m",
              pb.unit == "C" and pb.resolution_m == 500,
              f"{pb.unit} {pb.resolution_m}")
        check("Blenheim's value is physically plausible",
              pb.value is not None and 0.0 < pb.value < 25.0, str(pb.value))
        # The confidence block is the Pro line. It must not be reachable here at
        # all — not empty, ABSENT — or the split is decorative.
        check("the probe carries NO confidence block",
              not hasattr(pb, "confidence"))
        check("meta names the tier it answered as",
              pb.meta.get("tier") == "anonymous", str(pb.meta.get("tier")))

        # The archive is behind sign-in, and the refusal has to say so rather
        # than reporting the month as missing.
        check("anonymous is refused the archive with a 401",
              probe_status(ANON, valid_at=archive) == 401)
        try:
            probe(ANON, valid_at=archive)
            detail = ""
        except HTTPException as exc:
            detail = str(exc.detail)
        check("and the 401 carries the catalogue's own offer",
              detail == (anon_av.meta["access"] or {}).get("unlock"), detail)
        check("a member probes the same archive month",
              probe(FREE, valid_at=archive).value is not None)

        # THE CADENCE GATE, checked before the date one. This holds whether or
        # not any daily surface exists, because the withholding happens in
        # `_gate_steps` before the steps are looked at.
        check("daily is 401 for anonymous",
              probe_status(ANON, granularity="daily",
                           valid_at="2026-08-01") == 401)
        check("daily is 402 for a signed-in free account",
              probe_status(FREE, granularity="daily",
                           valid_at="2026-08-01") == 402)
        daily_av = S.available(variable="temp_mean", granularity="daily",
                               statistic=None, db=db, user=PRO)
        daily_steps = daily_av.meta["steps"]
        if daily_steps:
            dpb = probe(PRO, granularity="daily",
                        valid_at=daily_steps[-1]["valid_at"])
            check("Pro probes the newest daily surface",
                  dpb.value is not None,
                  f'{daily_steps[-1]["valid_at"]} = {dpb.value}')
        else:
            check("Pro probes the newest daily surface", False,
                  "no daily steps indexed — the daily engine has published none")

        # A month that does not exist is 404 for EVERYONE. Reporting it as 401
        # would tell a visitor the archive has a hole where it does not.
        check("a nonexistent month is 404, not a gate",
              probe_status(FREE, valid_at="1900-01") == 404)
        check("and 404 for anonymous too, not 401",
              probe_status(ANON, valid_at="1900-01") == 404)

        # A client holding a full date for a monthly layer must land on the
        # month that contains it. `stampFor` on the client and `_normalise_stamp`
        # here have to agree or the popup quotes a month the map is not showing.
        check("a full date resolves to the month containing it",
              probe(FREE, valid_at=f"{archive[:7]}-17").value
              == probe(FREE, valid_at=archive).value)

        # THE TWO READ PATHS MUST AGREE. If the probe and /point ever return
        # different numbers for one cell, one of them is reading a different
        # surface and the free one is the one a visitor will quote.
        parity = S.point_sample(_user=PRO, **BL, variables="temp_mean",
                                start=newest, end=newest, granularity="monthly",
                                statistic=None, db=db).series[0].points[0].value
        check("probe and /point agree to the millidegree",
              parity is not None and abs(parity - probe(PRO, valid_at=newest).value) < 1e-6,
              f"{parity} vs {probe(PRO, valid_at=newest).value}")

        sea = probe(FREE, lon=168.0, lat=-41.0, valid_at=newest)
        check("a probe at sea is null, not zero",
              sea.value is None and "land mask" in (sea.reason or ""),
              f"{sea.value} / {sea.reason}")
        check("an unknown variable 422s",
              probe_status(FREE, variable="nope", valid_at=newest) == 422)
        check("an unparseable date 422s",
              probe_status(FREE, valid_at="not-a-date") == 422)

        rain = probe(FREE, variable="rainfall", statistic="sum", valid_at=newest)
        check("rainfall probes in millimetres",
              rain.unit == "mm" and (rain.value is None or rain.value >= 0),
              f"{rain.value} {rain.unit}")

        # THE UNIT IS THE BAND'S, NOT THE VARIABLE'S. `temp_min/frost_days` is a
        # count of days measured off a degree layer and `rainfall/wet_days` a
        # count off a millimetre one; both read the variable's unit until
        # 2026-08-27 and reached the popup as '12.4 C' and '9.0 mm'.
        frost = probe(FREE, variable="temp_min", statistic="frost_days",
                      valid_at=newest)
        check("a frost COUNT is in days, not degrees",
              frost.unit == "days", f"{frost.value} {frost.unit}")
        wet = probe(FREE, variable="rainfall", statistic="wet_days",
                    valid_at=newest)
        check("a wet-day COUNT is in days, not millimetres",
              wet.unit == "days", f"{wet.value} {wet.unit}")
        # A day-of-month index is not a count of days. Adding two of them is
        # meaningless, so they must not share a unit with something you can add.
        check("a day-of-month index says so",
              probe(FREE, variable="temp_min", statistic="argmin_day",
                    valid_at=newest).unit == "day of month")
        # And the value bands are untouched by the fix.
        check("a mean temperature is still in degrees",
              probe(FREE, variable="temp_min", statistic="mean",
                    valid_at=newest).unit == "C")
        check("a ranked wet-day DEPTH is still millimetres",
              probe(FREE, variable="rainfall", statistic="wet_top1",
                    valid_at=newest).unit == "mm")
        check("a season accumulation is still degree days",
              S.store.unit_for("gdd10", "cumulative") == "GDD")

        # The same unit has to reach the catalogue and the series, or the legend
        # and the popup disagree about one number on one screen.
        check("/available reports the band's unit too",
              S.available(variable="temp_min", granularity="monthly",
                          statistic="frost_days", db=db,
                          user=FREE).meta["unit"] == "days")
        check("/point reports the band's unit too",
              S.point_sample(_user=PRO, **BL, variables="temp_min",
                             start=newest, end=newest, granularity="monthly",
                             statistic="frost_days", db=db).series[0].unit
              == "days")

        # EXHAUSTIVE, so a band added to the archive cannot inherit a unit by
        # accident. Every statistic that is genuinely in the variable's own unit
        # is named here; anything else must be declared in STATISTIC_UNITS.
        VALUE_BANDS = {
            "mean", "median", "min", "max", "sd", "sum", "cumulative",
            "all_time_max", "all_time_min",
            "wet_top1", "wet_top2", "wet_top3", "wet_top4", "wet_top5",
        }
        from sqlalchemy import text as _t
        published_stats = [r[0] for r in db.execute(_t(
            "SELECT DISTINCT statistic FROM surface_run "
            "WHERE status <> 'failed' AND statistic IS NOT NULL"
        )).all()]
        undecided = sorted(st for st in published_stats
                           if st not in VALUE_BANDS
                           and st not in S.store.STATISTIC_UNITS)
        check("every published band has a decided unit",
              not undecided, f"undecided: {undecided}")

        # --- /projections/probe -------------------------------------------
        print("\n/projections/probe")
        players = S.projections.layers(db)
        if not players:
            check("a projection layer is published", False, "catalogue is empty")
        else:
            layer = players[0]
            psteps = S.projections.steps(db, layer["variable"], layer["statistic"])
            st = psteps[0] if psteps else None
            if st is None:
                check("the layer has a step", False, str(layer))
            else:
                def pprobe(user):
                    return S.projection_probe(
                        response=_Response(), lon=BL["lon"], lat=BL["lat"],
                        variable=layer["variable"], statistic=layer["statistic"],
                        scenario=st["scenario"], period=st["period"],
                        season=st["season"], db=db, user=user)

                try:
                    pprobe(ANON)
                    check("projections stay behind sign-in", False, "anonymous got a value")
                except HTTPException as exc:
                    check("projections stay behind sign-in", exc.status_code == 401,
                          str(exc.status_code))
                pp = pprobe(FREE)
                check("a member probes a projection",
                      pp.value is not None, f"{pp.value} {pp.unit}")
                # THE UNIT COMES OFF THE ROW. A projected rainfall CHANGE field
                # is a percentage while the measured layer is millimetres, and
                # labelling one with the other's unit is the trap this checks.
                row_unit = S.projections.resolve(
                    db, layer["variable"], layer["statistic"], st["scenario"],
                    st["period"], st["season"])["unit"]
                check("the projection unit is the row's, not the variable's",
                      pp.unit == row_unit, f"{pp.unit} vs {row_unit}")
                # The vocabulary is the TABLE's, not the UI's: the column
                # holds 'projection' / 'baseline' while the client's mode is
                # called Projected. Echoing the row verbatim keeps the popup
                # attributable to a row rather than to a label.
                check("the probe says which side of the flip it quoted",
                      pp.meta.get("kind") in (S.projections.KIND_PROJECTION,
                                              S.projections.KIND_BASELINE),
                      str(pp.meta.get("kind")))

            # Frost is withdrawn. It must not be reachable through the probe
            # either — the exclusion lives in projection_store.resolve, and this
            # asserts the probe inherits it rather than restating it.
            for wvar, wstat in sorted(S.projections.WITHHELD):
                try:
                    S.projection_probe(
                        response=_Response(), lon=BL["lon"], lat=BL["lat"],
                        variable=wvar, statistic=wstat, scenario="ssp245",
                        period="2040-2059", season="ANN", db=db, user=FREE)
                    check(f"{wvar}/{wstat} is unreachable by probe", False,
                          "RESOLVED — a withdrawn metric is reachable")
                except HTTPException as exc:
                    check(f"{wvar}/{wstat} is unreachable by probe",
                          exc.status_code == 404, str(exc.status_code))

        # --- withheld bands, and the invariant that will police the fix ----
        print("\nwithheld bands")
        MDS = ("rainfall", "max_dry_spell")

        # THE PRODUCER REGRESSION, and it needs no database. A cell that
        # receives 10 mm every single day for six consecutive months must report
        # a longest dry spell of ZERO. It reported 150 days until 2026-08-27,
        # because the carry between months was the national maximum broadcast
        # into every cell instead of each cell's own trailing run.
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import numpy as _np
        from interpolation import monthly as _M
        soaked = _np.full((2, 30), 10.0, dtype=_np.float32)
        soaked[0] = 0.0                        # one permanently dry cell beside it
        _carry = 0
        for _ in range(6):
            _r = _M.monthly_stats(soaked, "rainfall", list(range(1, 31)),
                                  dry_run_carry_in=_carry)
            _carry = _r.dry_run_carry_out
        check("a cell that rains every day reports no dry spell",
              _r.bands["max_dry_spell"][1] == 0.0,
              f'{_r.bands["max_dry_spell"][1]} days after six wet months')
        check("and the dry cell beside it still accumulates",
              _r.bands["max_dry_spell"][0] == 180.0,
              str(_r.bands["max_dry_spell"][0]))
        check("the carry between months is per cell, not a national scalar",
              getattr(_r.dry_run_carry_out, "shape", None) == (2,),
              str(type(_r.dry_run_carry_out)))

        if MDS in S.store.WITHHELD_STATISTICS:
            # HOLDING LINE. The producer is fixed; the published archive is not.
            check("rainfall/max_dry_spell is absent from the vocabulary",
                  "max_dry_spell" not in S.store.statistics_for(
                      db, "rainfall", "monthly"))
            check("its catalogue is empty, not merely short",
                  S.available(variable="rainfall", granularity="monthly",
                              statistic="max_dry_spell", db=db,
                              user=PRO).meta["count"] == 0)
            check("a probe of it 404s",
                  probe_status(PRO, variable="rainfall",
                               statistic="max_dry_spell", valid_at=newest) == 404)
            check("a tile of it 404s",
                  status_of(S.tile, variable="rainfall", granularity="monthly",
                            valid_at=newest, z=5, x=31, y=19, ramp=None,
                            vmin=None, vmax=None, statistic="max_dry_spell",
                            db=db) == 404)
            print("        (withheld pending a rainfall republish. Delete the "
                  "entry in surface_store.WITHHELD_STATISTICS and the archive "
                  "invariant below starts running.)")
        else:
            # The withhold has been lifted, so the archive is claimed to be
            # republished. THIS is the check that would have caught the original
            # defect: the national MINIMUM of a dry-spell field is the wettest
            # cell in the country, and it cannot exceed the length of the month.
            # It read 68 days for June 2020 and 42 for June 2026.
            import rasterio
            from calendar import monthrange as _mr
            for stamp in ("1986-06", "2010-06", "2020-06", "2026-06"):
                try:
                    row = S.store.resolve(db, "rainfall", "monthly",
                                          "max_dry_spell", stamp)
                except Exception as exc:                           # noqa: BLE001
                    check(f"{stamp} dry-spell floor", False, str(exc))
                    continue
                with S.store.gdal_env():
                    with rasterio.open(S.store.object_url(row["s3_key"])) as ds:
                        arr = ds.read(1, out_shape=(1, ds.height // 8,
                                                    ds.width // 8))
                        nod = ds.nodata
                a = arr.astype("float64")
                good = _np.isfinite(a) if nod is None else (a != nod) & _np.isfinite(a)
                v = a[good]
                days = _mr(int(stamp[:4]), int(stamp[5:7]))[1]
                check(f"{stamp}: the wettest cell's dry spell fits in the month",
                      v.size > 0 and v.min() <= days,
                      f"floor {v.min():.0f} days vs {days} in the month")

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
        # Compared against what is actually PUBLISHED, not a constant. This was
        # `== 37`, which was true at first publication and silently became a
        # false failure the moment the 2024-2026 vintages landed and the zone
        # roll-up followed them to 40 — the sibling check below had already been
        # taught to expect growth, this one had not. A magic number here asserts
        # the calendar rather than the invariant.
        from sqlalchemy import text as _t
        published_vintages = db.execute(_t(
            "SELECT count(DISTINCT date_part('year', period_start)) "
            "FROM surface_run WHERE variable = 'gdd10' AND granularity = 'season'"
        )).scalar()
        n_points = len(season.series[0].points)
        check("zone season covers every vintage in the archive",
              n_points == published_vintages and n_points >= 37,
              f"{n_points} zone vintages vs {published_vintages} published")
        check("an unknown zone slug 404s",
              status_of(S.zone_season, slug="not-a-zone", metrics=None,
                        db=db) == 404)

        print("\nGDD season surfaces")
        gav = S.available(variable="gdd10", granularity="season",
                          statistic=None, db=db, user=FREE)
        # Eight accumulation months per season, and the season count grows as
        # vintages are published -- 37 at first publication, 40 after the
        # 2024-2026 vintages. Assert the SHAPE and that it never shrinks.
        check("eight accumulation months per season, and never fewer seasons",
              gav.meta["count"] % 8 == 0 and gav.meta["count"] >= 296,
              f'{gav.meta["count"]} = {gav.meta["count"] / 8:.0f} seasons x 8')
        check("the default statistic is the running series, not the total",
              gav.meta["statistic"] == "cumulative", gav.meta["statistic"])
        # Sep-Apr then a jump to the next September. Emitting calendar gaps
        # would report May-August as a hole in all 37 seasons; winter is not
        # missing data, it is not part of a growing season.
        check("no gaps are claimed across the winter", gav.gaps == [],
              str(gav.gaps)[:80])
        seasons = [st["season"] for st in gav.meta["steps"]]
        check("each step names the vintage it accumulates into",
              seasons[0] == 1987 and seasons[-1] >= 2024
              and seasons == sorted(seasons),
              f"{seasons[0]}..{seasons[-1]}")
        check("the unit is degree days, not degrees",
              gav.meta["unit"] == "GDD", gav.meta["unit"])
        # cv_units is degC because GDD inherits temp_mean's fits and was never
        # cross-validated itself. The unit mismatch is what makes the client
        # suppress it rather than print degree-days as degrees.
        check("inherited confidence is in degC so the client suppresses it",
              gav.meta["steps"][-1]["cv_units"] == "C",
              gav.meta["steps"][-1]["cv_units"])
        # One total per season, so exactly an eighth of the cumulative steps.
        check("season totals are separately addressable",
              S.available(variable="gdd10", granularity="season",
                          statistic="sum", db=db,
                          user=FREE).meta["count"] == gav.meta["count"] // 8,
              f'{gav.meta["count"] // 8} seasons')

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
