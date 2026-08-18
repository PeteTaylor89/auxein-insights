"""Acceptance suite for Pro sites — placement rules and the extracted record.

Runs the whole flow against the real archive and the real database, then
removes what it created. It calls the router functions directly, so it needs no
running server, and it passes the entitlement dependency explicitly because
calling a handler directly skips FastAPI's injection.

    backend/venv/Scripts/python.exe backend/scripts/check_insights_sites.py

It creates a throwaway PublicUser and deletes it (and its sites, by cascade) at
the end, including on failure.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from fastapi import HTTPException                                   # noqa: E402
from sqlalchemy import text                                         # noqa: E402

from api.v1 import insights_sites as A                              # noqa: E402
from db.models.insights_site import InsightsSite, MOVES_PER_WINDOW  # noqa: E402
from db.models.public_user import PublicUser                        # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from services import insights_site_service as svc                   # noqa: E402
from scripts.populate_insights_sites import populate                # noqa: E402

# Blenheim, in the middle of Marlborough's planting — dense network, a zone that
# certainly exists, and unambiguously on land.
BLENHEIM = {"latitude": -41.514, "longitude": 173.961}
# Mid Cook Strait: water, and MORE than the nearest-land search radius from any
# coast. The bound is deliberate — beyond a few cells the "nearest land" is no
# longer the site anyone meant — so this point must be refused with no
# suggestion, while a point just offshore gets one.
OPEN_SEA = {"latitude": -41.30, "longitude": 174.40}


def find_near_shore(db):
    """A water cell within one cell of land, derived rather than hardcoded.

    Picking a coastal coordinate by hand is how a test starts asserting the
    coastline rather than the behaviour: a rebuilt land mask moves it and the
    failure looks like a code regression.
    """
    import rasterio
    import numpy as np
    from services import surface_store as store

    key = db.execute(text("""
        SELECT s3_key FROM surface_run
         WHERE variable = 'temp_mean' AND granularity = 'monthly'
           AND statistic = 'mean' AND status <> 'failed'
         ORDER BY valid_at DESC LIMIT 1""")).scalar()
    with store.gdal_env():
        with rasterio.open(store.object_url(key)) as ds:
            r, c = ds.index(BLENHEIM["longitude"], BLENHEIM["latitude"])
            block = ds.read(1, window=((r - 80, r + 80), (c - 20, c + 220)))
            land = (block != ds.nodata) & (block == block)
            # A water cell whose western neighbour is land: the east coast.
            for i in range(land.shape[0]):
                for j in range(1, land.shape[1]):
                    if land[i, j - 1] and not land[i, j]:
                        lon, lat = ds.xy(r - 80 + i, c - 20 + j)
                        return {"latitude": float(lat), "longitude": float(lon)}
    return None

passed = failed = 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}" + (f"  -- {detail}" if detail else ""))


def status_of(fn, **kwargs):
    try:
        fn(**kwargs)
        return 200
    except HTTPException as exc:
        return exc.status_code


def body_of(fn, **kwargs):
    try:
        fn(**kwargs)
        return {}
    except HTTPException as exc:
        return exc.detail if isinstance(exc.detail, dict) else {}


def main() -> int:
    db = SessionLocal()
    user = PublicUser(email=f"sitecheck+{os.getpid()}@auxein.co.nz",
                      subscription_tier="pro", pro_site_quota=1,
                      is_active=True, is_verified=True, origin="signup")
    db.add(user)
    db.commit()
    db.refresh(user)

    try:
        print("\nplacement")
        # A point at sea must be refused AT PLACEMENT. Accepting it would create
        # a site that populates to 456 nulls and then reports itself ready.
        sea = body_of(A.place_site, body=A.PlaceSiteRequest(**OPEN_SEA),
                      db=db, user=user)
        check("a point at sea is refused, not accepted",
              sea.get("code") == "off_land_mask", str(sea)[:120])
        check("mid-strait gets NO suggestion — the search is bounded",
              sea.get("nearest_land") is None, str(sea.get("nearest_land")))

        near = find_near_shore(db)
        check("a near-shore water cell could be derived", near is not None)
        if near:
            shore = body_of(A.place_site, body=A.PlaceSiteRequest(**near),
                            db=db, user=user)
            check("a just-offshore point is refused",
                  shore.get("code") == "off_land_mask", str(shore)[:120])
            # This is the case that matters commercially: a coastal vineyard
            # whose cell centre is water. 25.3% of Northland's planted hectares
            # sit on such cells, so "your point is in the sea" with no way
            # forward would read as the product not working.
            check("but it IS offered the nearest land cell",
                  isinstance(shore.get("nearest_land"), dict)
                  and shore["nearest_land"].get("cells_away", 99) <= 2,
                  str(shore.get("nearest_land")))

        placed = A.place_site(body=A.PlaceSiteRequest(**BLENHEIM), db=db, user=user)
        site_id = placed["site"].id
        check("placement returns immediately as populating",
              placed["site"].status == "populating")
        check("the wait message is served by the API, not invented by the UI",
              "populating" in placed["message"].lower()
              or "building" in placed["message"].lower(), placed["message"])
        check("the point resolves into its wine zone",
              placed["site"].zone_slug is not None, placed["site"].zone_slug)

        # Quota is one; the second placement must fail with a 402 that explains
        # the model rather than a bare "forbidden".
        second = body_of(A.place_site, body=A.PlaceSiteRequest(**BLENHEIM),
                         db=db, user=user)
        check("a second point beyond quota is refused with 402",
              status_of(A.place_site, body=A.PlaceSiteRequest(**BLENHEIM),
                        db=db, user=user) == 402)
        check("the refusal states the per-subscription model",
              "subscription" in str(second.get("message", "")).lower(),
              str(second.get("message"))[:120])
        listing = A.list_sites(db=db, user=user)
        check("quota is advertised before it is hit",
              listing["quota"]["entitled"] == 1
              and listing["quota"]["per_subscription"] == 1
              and listing["quota"]["remaining"] == 0, str(listing["quota"]))

        print("\nreading before it is ready")
        check("season 409s while populating",
              status_of(A.site_season, site_id=site_id, metrics=None,
                        db=db, user=user) == 409)

        print("\npopulation")
        site = db.query(InsightsSite).filter(InsightsSite.id == site_id).first()
        populate(db, site)
        db.refresh(site)
        check("the site reaches ready", site.status == "ready", site.status_detail)

        n_month = db.execute(text(
            "SELECT count(*) FROM insights_site_monthly WHERE site_id = :s"),
            {"s": site_id}).scalar()
        n_null = db.execute(text(
            "SELECT count(*) FROM insights_site_monthly "
            "WHERE site_id = :s AND value IS NULL"), {"s": site_id}).scalar()
        check("the whole archive was extracted", n_month > 5000, n_month)
        check("an on-land cell has no null months", n_null == 0, n_null)

        n_season = db.execute(text(
            "SELECT count(DISTINCT vintage_year) FROM insights_site_season "
            "WHERE site_id = :s"), {"s": site_id}).scalar()
        check("37 vintages of season metrics", n_season == 37, n_season)

        print("\nthe numbers")
        season = A.site_season(site_id=site_id, metrics="gdd10,rain,tmean",
                               db=db, user=user)
        by = {s["metric"]: s for s in season["series"]}
        gdd = [p["value"] for p in by["gdd10"]["points"]]
        check("Marlborough GDD is in a plausible band",
              all(700 < g < 1800 for g in gdd),
              f"{min(gdd):.0f}..{max(gdd):.0f}")
        # The site is INSIDE the zone it is compared against, so it should sit
        # within the zone's planted spread far more often than not. This is the
        # check that would catch a row/col transposition, which is otherwise
        # invisible — the numbers stay plausible, just for the wrong place.
        inside = [p for p in by["gdd10"]["points"]
                  if p["zone_p10"] is not None
                  and p["zone_p10"] <= p["value"] <= p["zone_p90"]]
        check("the site sits inside its zone's planted spread",
              len(inside) >= 0.7 * len(gdd), f"{len(inside)}/{len(gdd)}")
        check("the zone comparator is attached",
              all(p["zone_mean"] is not None for p in by["rain"]["points"]))
        check("r99p is declared omitted rather than silently absent",
              "r99p" in season["meta"]["omitted"])
        check("the site declares it has no spread of its own",
              "single" in season["meta"]["site_spread"])

        monthly = A.site_monthly(site_id=site_id, variable="temp_mean",
                                 statistic="mean", baseline="1991-2020",
                                 db=db, user=user)
        check("456 months of temp_mean", monthly["meta"]["n_months"] == 456,
              monthly["meta"]["n_months"])
        check("one baseline drives both normals",
              "both" in monthly["meta"]["baseline_applies_to"])
        jan = [p for p in monthly["points"] if p["valid_at"].endswith("-01")]
        jul = [p for p in monthly["points"] if p["valid_at"].endswith("-07")]
        check("summer is warmer than winter at the site",
              sum(p["value"] for p in jan) / len(jan)
              > sum(p["value"] for p in jul) / len(jul))
        check("anomalies are computed against the site's own normal",
              all(abs(p["anomaly"] - (p["value"] - p["site_normal"])) < 1e-9
                  for p in monthly["points"][:50] if p["anomaly"] is not None))
        check("a bad baseline 422s",
              status_of(A.site_monthly, site_id=site_id, variable="temp_mean",
                        statistic="mean", baseline="2020-1991",
                        db=db, user=user) == 422)

        print("\nmoves")
        moved = A.update_site(site_id=site_id,
                              body=A.PlaceSiteRequest(latitude=-41.52,
                                                      longitude=173.97),
                              db=db, user=user)
        check("moving re-queues the extraction", moved["repopulating"] is True
              and moved["site"].status == "populating")
        db.refresh(site)
        check("the move is counted", site.moves_used == 1, site.moves_used)

        for i in range(MOVES_PER_WINDOW):
            try:
                A.update_site(site_id=site_id,
                              body=A.PlaceSiteRequest(latitude=-41.50 - i / 100,
                                                      longitude=173.95),
                              db=db, user=user)
            except HTTPException:
                break
        check("the move allowance runs out",
              status_of(A.update_site, site_id=site_id,
                        body=A.PlaceSiteRequest(latitude=-41.40,
                                                longitude=173.90),
                        db=db, user=user) == 429)
        # A rename is not a move, and must stay possible after the allowance is
        # spent — otherwise a typo in a label is permanent for a year.
        check("renaming still works with no moves left",
              status_of(A.update_site, site_id=site_id,
                        body=A.PlaceSiteRequest(label="Home block",
                                                latitude=site.latitude,
                                                longitude=site.longitude),
                        db=db, user=user) == 200)

        # The window is rolling from the first move, so an expired window
        # restores the allowance rather than waiting for a calendar boundary.
        site.move_window_start = datetime.now(timezone.utc) - timedelta(days=366)
        db.commit()
        check("an expired window restores the allowance",
              status_of(A.update_site, site_id=site_id,
                        body=A.PlaceSiteRequest(latitude=-41.49,
                                                longitude=173.94),
                        db=db, user=user) == 200)

        print("\nisolation")
        other = PublicUser(email=f"sitecheck2+{os.getpid()}@auxein.co.nz",
                           subscription_tier="pro", pro_site_quota=1,
                           is_active=True, is_verified=True, origin="signup")
        db.add(other)
        db.commit()
        db.refresh(other)
        # 404, not 403: a 403 confirms the id exists and belongs to someone.
        check("another subscriber's site is invisible, not merely forbidden",
              status_of(A.get_site, site_id=site_id, db=db, user=other) == 404)
        db.delete(other)
        db.commit()

        print("\ncascade")
        A.delete_site(site_id=site_id, db=db, user=user)
        left = db.execute(text(
            "SELECT count(*) FROM insights_site_monthly WHERE site_id = :s"),
            {"s": site_id}).scalar()
        check("deleting a site takes its record with it", left == 0, left)

    finally:
        db.query(InsightsSite).filter(
            InsightsSite.public_user_id == user.id).delete()
        db.delete(user)
        db.commit()
        db.close()

    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
