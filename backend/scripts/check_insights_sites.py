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

        frost_series = A.site_season(site_id=site_id,
                                     metrics="frost_days,gdd10",
                                     db=db, user=user)
        fby = {x["metric"]: x for x in frost_series["series"]}
        fs = fby.get("frost_days")
        check("frost is present on the season chart, not omitted",
              fs is not None)
        if fs:
            check("frost is flagged regional-only", fs["regional_only"] is True)
            check("frost carries the regional average",
                  any(p["zone_mean"] is not None for p in fs["points"]))
            check("frost withholds the site's own series",
                  all(p["value"] is None for p in fs["points"]))
            # The band is withheld too. A site drawn inside or outside a spread
            # is the same neighbour claim as a site line.
            check("frost withholds the planted spread",
                  all(p["zone_p10"] is None and p["zone_p90"] is None
                      for p in fs["points"]))
        check("gdd10 is untouched by the frost rule",
              fby["gdd10"]["regional_only"] is False
              and any(p["value"] is not None for p in fby["gdd10"]["points"]))
        check("regional-only metrics are listed apart from omitted ones",
              "frost_days" in frost_series["meta"]["regional_only"]
              and "frost_days" not in frost_series["meta"]["omitted"])

        # An explicit period, not the default, so the parameter is exercised
        # rather than assumed. The DEFAULT is asserted separately below.
        monthly = A.site_monthly(site_id=site_id, variable="temp_mean",
                                 statistic="mean", baseline="1991-2020",
                                 db=db, user=user)
        check("an explicit baseline is honoured",
              monthly["meta"]["baseline"] == "1991-2020",
              monthly["meta"]["baseline"])

        # The whole Pro page is on 1986-2005: the period the SSP deltas are
        # measured from, and the only one with a daily climatology. A default
        # that drifted off it would silently break the projections arithmetic.
        defaulted = A.site_monthly(site_id=site_id, variable="temp_mean",
                                   statistic="mean", db=db, user=user)
        check("the default baseline is 1986-2005",
              defaulted["meta"]["baseline"] == "1986-2005",
              defaulted["meta"]["baseline"])
        check("the dashboard is on the same baseline as the charts",
              A.site_dashboard(site_id=site_id, db=db,
                               user=user)["baseline"] == A.PRO_BASELINE)
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

        print("\ndashboard")
        dash = A.site_dashboard(site_id=site_id, db=db, user=user)
        keys = {t["metric"] for t in dash["tiles"]}
        check("the dashboard tiles cover the headline metrics",
              {"gdd10", "tmean", "rain", "frost_days"} <= keys, sorted(keys))
        gdd = next(t for t in dash["tiles"] if t["metric"] == "gdd10")
        check("each tile carries a normal, a latest and a trend",
              gdd["normal"] is not None and gdd["latest"]["value"] is not None
              and gdd["n_seasons"] >= 30)
        check("the anomaly is the latest against the site's OWN normal",
              abs(gdd["anomaly"] - (gdd["latest"]["value"] - gdd["normal"])) < 1e-9)
        check("the tile knows where the site sits in its region's spread",
              gdd["zone"]["position"] in ("above", "within", "below"),
              gdd["zone"]["position"])
        check("the warmest season is not before the coolest in value",
              gdd["warmest"]["value"] >= gdd["coolest"]["value"])

        # Frost never carries a site-versus-region claim, and the suppression is
        # SERVER side: the payload must not contain the zone block at all, or the
        # next consumer renders what this client hides.
        frost = next(t for t in dash["tiles"] if t["metric"] == "frost_days")
        check("the frost tile keeps the site's own value",
              frost["normal"] is not None and frost["latest"]["value"] is not None)
        check("the frost tile carries NO regional comparison",
              frost["zone"] is None and frost["regional_comparison"] is False,
              str(frost["zone"])[:60])
        check("and says why", "cold-air" in (frost["no_comparison_reason"] or ""))
        check("a non-frost tile still carries one",
              gdd["zone"] is not None and gdd["regional_comparison"] is True)

        last_frost = next((t for t in dash["tiles"]
                           if t["metric"] == "last_spring_frost_doy"), None)
        if last_frost:
            # The one deliberate exception: the DATE is a timing statement the
            # surface supports, so it stays. Only the neighbour comparison goes.
            check("the last spring frost DATE stays at site level",
                  last_frost["latest"]["value"] is not None)
            check("but with no regional comparison",
                  last_frost["zone"] is None)

        # The normal under the tile is averaged over the BASELINE years, not the
        # whole record. Captioning it with the series length claims a period it
        # was never computed over.
        check("the tile's normal is counted over the baseline, not the record",
              0 < gdd["normal_years"] < gdd["n_seasons"],
              f"{gdd['normal_years']} of {gdd['n_seasons']}")
        check("the tile declares its scale", gdd["normal_scope"] == "site")

        # Two season panels now, and the payload must keep them distinct. The
        # previous one is the regional strip that used to be `season_to_date`;
        # the current one is the site's own cell and is asserted in detail by
        # `check_site_season.py`.
        strip = dash["season_previous"]
        current = dash["season_current"]
        moved_zone_id = dash["site"].zone_id
        check("the two seasons are different vintages",
              current["vintage"] == strip["vintage"] + 1,
              f"{current['vintage']} vs {strip['vintage']}")
        check("and declare different scales",
              current["scope"] == "site" and strip["scope"] == "region")
        check("a season strip is offered for a site inside a zone",
              strip is not None and strip.get("available") is True,
              str(strip)[:120])
        if strip and strip.get("available"):
            # The single most dangerous number on the page. `gdd_cumulative` in
            # climate_zone_daily is base ZERO over a July-June year: Marlborough
            # reads about 4,590 there against a Sep-Apr gdd10 near 1,370. If the
            # strip ever shows the stored column instead of recomputing, this is
            # what catches it.
            live_gdd = next(m for m in strip["metrics"] if m["metric"] == "gdd10")
            check("live GDD is recomputed at base 10, not the stored base-0 sum",
                  live_gdd["value"] is not None and live_gdd["value"] < 2500,
                  live_gdd["value"])
            check("the live value is compared only against complete months",
                  len(strip["months_compared"]) >= 1
                  and all(len(m) == 7 for m in strip["months_compared"]))
            check("both sides of the comparison name their own source",
                  all(m["value_source"] != m["normal_source"]
                      for m in strip["metrics"]))
            check("the strip says it is regional, not the site",
                  strip["scope"] == "region")
            check("each metric names the scale of its own normal",
                  all(m["normal_scope"] == "region" for m in strip["metrics"]))

            # A PARTIAL YEAR MUST NOT ENTER THE NORMAL. Vintage 1986 needs
            # September to December 1985, which predates the archive, so it
            # contributes four months to the sum while counting as a whole year
            # in the divisor. That understated every regional normal in all 23
            # zones — 1.3% on rain, 5.0% on frost nights. The normal is
            # recomputed here independently, over complete years only.
            want = db.execute(text("""
                SELECT avg(total), count(*) FROM (
                    SELECT yr, sum(m) AS total FROM (
                        SELECT CASE WHEN month >= 9 THEN year + 1 ELSE year END AS yr,
                               mean AS m
                          FROM climate_zone_surface_monthly
                         WHERE zone_id = :zid AND variable = 'temp_mean'
                           AND statistic = 'gdd10'
                           AND month = ANY(:months) AND mean IS NOT NULL
                    ) t WHERE yr BETWEEN 1986 AND 2005
                     GROUP BY yr HAVING count(*) = :n
                ) whole_years
            """), {"zid": moved_zone_id, "n": len(strip["months_compared"]),
                    "months": [int(m[-2:]) for m in strip["months_compared"]]}
            ).first()
            check("the regional normal averages only COMPLETE baseline years",
                  want[0] is not None
                  and abs(live_gdd["normal"] - float(want[0])) < 0.5,
                  f"{live_gdd['normal']:.1f} vs {float(want[0]):.1f}")
            check("and reports how many years stand behind it",
                  live_gdd["normal_years"] == want[1],
                  f"{live_gdd['normal_years']} vs {want[1]}")

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

        print("\ndispatch on placement")
        # Dispatch is an OPTIMISATION over the scheduled sweep, never the
        # mechanism. Every failure has to be a no-op: a placement that 500s
        # because GitHub was unreachable turns a slow site into a lost sale,
        # which is strictly worse than the wait it was avoiding.
        import inspect as _inspect
        from services import workflow_dispatch as _wd

        saved = {k: os.environ.get(k)
                 for k in ("GITHUB_DISPATCH_TOKEN", "GITHUB_REPO")}
        try:
            os.environ.pop("GITHUB_DISPATCH_TOKEN", None)
            check("with no token configured it declines rather than raising",
                  _wd.populate_site(0) is False)

            os.environ["GITHUB_DISPATCH_TOKEN"] = "not-a-real-token"
            os.environ["GITHUB_REPO"] = "auxein-does-not-exist/nope"
            check("a rejected dispatch is swallowed, not raised",
                  _wd.dispatch("insights-site-population.yml",
                               {"site": 1}) is False)
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

        # `background` must keep a default: FastAPI injects it by annotation,
        # and every direct caller (this suite included) omits it. Losing the
        # default breaks placement everywhere except through HTTP.
        check("placement does not require a BackgroundTasks argument",
              _inspect.signature(A.place_site)
                      .parameters["background"].default is None)

        print("\nPro onboarding (admin grant)")
        # There is NO billing integration and nothing else in the product ever
        # writes subscription_tier='pro'. If this endpoint regresses, the only
        # way to sell a subscription is an UPDATE in psql.
        from api.v1.admin_users import update_user, user_to_list_item
        from schemas.admin import UserUpdateRequest
        from core import entitlements as E

        rookie = PublicUser(email=f"grantcheck+{os.getpid()}@auxein.co.nz",
                            is_active=True, is_verified=True, origin="signup")
        db.add(rookie)
        db.commit()
        db.refresh(rookie)
        try:
            check("a new account is free with no site quota",
                  rookie.subscription_tier == "free"
                  and (rookie.pro_site_quota or 0) == 0
                  and not rookie.is_pro)

            granted = update_user(rookie.id,
                                  UserUpdateRequest(subscription_tier="pro",
                                                    pro_site_quota=1),
                                  db=db, admin=user)
            check("an admin can grant Pro and a site in one call",
                  granted.is_pro and granted.pro_site_quota == 1)
            check("the first grant stamps when they became a customer",
                  granted.pro_started_at is not None)

            # 'grow' describes where the row came from. Setting it by hand would
            # claim an SSO relationship that does not exist, and the next
            # handshake would overwrite it anyway.
            check("'grow' cannot be granted by hand",
                  status_of(update_user, user_id=rookie.id,
                            update_data=UserUpdateRequest(subscription_tier="grow"),
                            db=db, admin=user) == 422)
            check("an absurd quota is refused",
                  status_of(update_user, user_id=rookie.id,
                            update_data=UserUpdateRequest(pro_site_quota=99),
                            db=db, admin=user) == 422)

            past = datetime.now(timezone.utc) - timedelta(days=1)
            lapsed = update_user(rookie.id,
                                 UserUpdateRequest(pro_expires_at=past),
                                 db=db, admin=user)
            check("an expired subscription keeps the tier and loses the entitlement",
                  lapsed.subscription_tier == "pro" and not lapsed.is_pro)
            check("a lapsed subscriber has no site quota however it is stored",
                  E.site_quota(db.query(PublicUser).get(rookie.id)) == 0)

            reopened = update_user(rookie.id,
                                   UserUpdateRequest(clear_pro_expiry=True),
                                   db=db, admin=user)
            check("clearing the expiry restores an open-ended subscription",
                  reopened.is_pro and reopened.pro_expires_at is None)

            grow_row = db.query(PublicUser).filter(
                PublicUser.origin == "grow").first()
            if grow_row is not None:
                check("a Grow projection's tier is not settable here",
                      status_of(update_user, user_id=grow_row.id,
                                update_data=UserUpdateRequest(subscription_tier="free"),
                                db=db, admin=user) == 409)
                item = user_to_list_item(grow_row)
                check("and it still reads as Pro in the admin list",
                      item.is_pro and item.subscription_tier == "grow")
        finally:
            db.delete(db.query(PublicUser).get(rookie.id))
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
