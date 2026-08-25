"""Acceptance suite for the regional dashboard — Phase 3.

    backend/venv/Scripts/python.exe backend/scripts/check_region_dashboard.py

Runs against the real database across EVERY active zone, calls the router
function directly, writes nothing.

Two things are being tested and the second is the important one:

1. The payload is well formed for a zone with full coverage.
2. **It is well formed for every zone, including the ten with partial data.**
   Ten of 23 zones have no live season, eleven have no phenology, two have no
   projection extremes. A dashboard that only works for Marlborough is not
   finished, and the failure mode is a blank panel rather than an exception —
   so the assertions are about `available` + `reason` being coherent, not about
   values being present.
"""
from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from api.v1 import public_climate as PC                             # noqa: E402
from services import insights_region_dashboard as RD                # noqa: E402
from db.session import SessionLocal                                 # noqa: E402


PASS, FAIL = 0, 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}   {detail}")


BLOCKS = ("recent", "season", "phenology", "disease", "history",
          "projections")


def main():
    db = SessionLocal()
    try:
        slugs = [r[0] for r in db.execute(text(
            "SELECT slug FROM climate_zones WHERE is_active ORDER BY display_order"
        )).all()]

        print(f"\n[every active zone builds — {len(slugs)} zones]")
        payloads = {}
        for slug in slugs:
            try:
                payloads[slug] = PC.get_zone_dashboard(slug=slug, user=None, db=db)
            except Exception as e:                                  # noqa: BLE001
                check(f"{slug} builds", False, f"{type(e).__name__}: {e}")
        check(f"all {len(slugs)} zones returned a payload",
              len(payloads) == len(slugs),
              f"{len(payloads)} of {len(slugs)}")

        print("\n[every block is present and coherent on every zone]")
        missing_block, incoherent = [], []
        for slug, p in payloads.items():
            for b in BLOCKS:
                if b not in p:
                    missing_block.append(f"{slug}.{b}")
                    continue
                block = p[b]
                if not isinstance(block, dict) or "available" not in block:
                    missing_block.append(f"{slug}.{b}.available")
                    continue
                # The rule that keeps a blank panel from shipping: if a block is
                # unavailable it MUST explain itself in words a reader can use.
                if not block["available"]:
                    reason = block.get("reason") or block.get("predictions_reason")
                    if not reason:
                        incoherent.append(f"{slug}.{b}")
        check("every block present on every zone", not missing_block,
              f"missing {missing_block[:6]}")
        check("every unavailable block carries a reason", not incoherent,
              f"silent {incoherent[:6]}")

        print("\n[coverage matches the database, block by block]")
        expect = {
            "season": db.execute(text("""
                SELECT count(DISTINCT z.slug) FROM climate_zones z
                  JOIN climate_zone_daily d ON d.zone_id = z.id
                 WHERE z.is_active""")).scalar(),
            # From the SURFACE roll-up, which is what `_history` reads as of
            # 2026-08-24. The old `climate_zone_season_stats` covers 21 zones;
            # the surface archive covers 23, so this number went UP with the
            # source swap.
            "history": db.execute(text("""
                SELECT count(DISTINCT z.slug) FROM climate_zones z
                  JOIN climate_zone_surface_season s ON s.zone_id = z.id
                 WHERE z.is_active""")).scalar(),
            "projections": db.execute(text("""
                SELECT count(DISTINCT z.slug) FROM climate_zones z
                  JOIN climate_projections c ON c.zone_id = z.id
                 WHERE z.is_active""")).scalar(),
        }
        # The suite calls the endpoint anonymously, so history and projections
        # come back locked. Availability is checked against a SIGNED-IN build:
        # both moved from Pro to a free account on 2026-08-25.
        signed_in = {slug: RD.build(db, slug, registered=True) for slug in slugs}
        got_history = sum(1 for p in signed_in.values()
                          if p["history"]["available"])
        got_proj = sum(1 for p in signed_in.values()
                       if p["projections"]["available"])
        check(f"history available on {expect['history']} zones",
              got_history == expect["history"], f"got {got_history}")
        check(f"projections available on {expect['projections']} zones",
              got_proj == expect["projections"], f"got {got_proj}")

        n_phen = sum(1 for p in payloads.values() if p["phenology"]["available"])
        n_dis = sum(1 for p in payloads.values() if p["disease"]["available"])
        print(f"        (phenology {n_phen}, disease {n_dis}, "
              f"season blocks unavailable pre-season by design)")

        print("\n[the season block — three states, and the pre-season one is live today]")
        any_p = next(iter(payloads.values()))
        check("vintage is the Sep-Apr season labelled by its end year",
              any_p["vintage"] == RD.pro.current_vintage(date.today()))
        states = {p["season"]["state"] for p in payloads.values()}
        check("every zone reports a season state", None not in states and states,
              f"states={states}")
        for slug, p in payloads.items():
            if p["season"]["state"] == "not_started":
                check("a not_started season says when it starts, not 'no data'",
                      p["season"].get("days_until") is not None
                      and "starts" in (p["season"].get("reason") or ""),
                      f"{slug}: {p['season'].get('reason')}")
                break

        print("\n[MID-SEASON — the graph path, which today cannot reach]")
        # 24 August is pre-season: vintage 2027 starts 1 September, so every
        # zone reports `not_started` and the curve is never built. That would
        # leave the single most important block on the page untested for a third
        # of every year, including the day it ships. `climate_zone_daily` starts
        # 2025-09, so the 2026 season (Sep 2025 - Apr 2026) is a real record to
        # drive it with.
        MID = date(2026, 3, 1)
        mid_payloads = {}
        for slug in slugs:
            try:
                mid_payloads[slug] = RD.build(db, slug, today=MID)
            except Exception as e:                                  # noqa: BLE001
                check(f"{slug} builds mid-season", False, f"{type(e).__name__}: {e}")
        check("all zones build mid-season too",
              len(mid_payloads) == len(slugs), f"{len(mid_payloads)}")

        mid_live = [(s_, p) for s_, p in mid_payloads.items()
                    if p["season"]["available"]]
        check("mid-season, the live curve is actually available somewhere",
              len(mid_live) > 0, "no zone produced a season curve")
        print(f"        ({len(mid_live)} of {len(slugs)} zones have a 2026 curve)")

        if mid_live:
            slug, p = mid_live[0]
            se = p["season"]
            check("state is in_progress on 1 March", se["state"] == "in_progress",
                  se["state"])
            check("the series is non-empty", len(se["series"]) > 0)
            check("the series is ordered by date",
                  all(a["date"] <= b["date"]
                      for a, b in zip(se["series"], se["series"][1:])))
            check("cumulative GDD never decreases",
                  all(a["gdd10_cumulative"] <= b["gdd10_cumulative"]
                      for a, b in zip(se["series"], se["series"][1:])))
            check("cumulative rain never decreases",
                  all(a["rain_cumulative"] <= b["rain_cumulative"]
                      for a, b in zip(se["series"], se["series"][1:])))
            check("the normal curve spans the whole season, not just to today",
                  len(se["normal_curve"]) > len(se["series"]),
                  f"normal {len(se['normal_curve'])} vs series {len(se['series'])}")
            check("the totals table is present", se["totals"] is not None)
            # No frost row here either. The live side counts days the ZONE MEAN
            # went below zero — a count-of-mean, not a mean-of-count — so for a
            # big zone it reads 0.0 whatever happened, and the normal it is
            # compared against is the lapse-biased surface count.
            check("the current-season totals carry no frost row",
                  not any("frost" in m["metric"]
                          for m in se["totals"].get("metrics", [])),
                  f"{[m['metric'] for m in se['totals'].get('metrics', [])]}")

            # THE trap. `climate_zone_daily.gdd_cumulative` is base ZERO —
            # Marlborough reads ~4,591 against a Sep-Apr gdd10 near 1,370.
            last = se["series"][-1]
            raw = db.execute(text("""
                SELECT gdd_cumulative FROM climate_zone_daily
                 WHERE zone_id = (SELECT id FROM climate_zones WHERE slug = :s)
                   AND date = :d"""), {"s": slug, "d": last["date"]}).scalar()
            check("cumulative GDD is base 10, NOT the table's base-0 column",
                  raw is not None and float(raw) > last["gdd10_cumulative"] * 1.5,
                  f"{slug}: ours {last['gdd10_cumulative']} vs base-0 {raw}")
            print(f"        ({slug}: gdd10 {last['gdd10_cumulative']} "
                  f"vs the table's base-0 {raw})")

            check("the season-to-date gdd10 is physically plausible",
                  50 < last["gdd10_cumulative"] < 2500,
                  f"{last['gdd10_cumulative']}")
            aligned = [pt for pt in se["series"] if pt["gdd10_normal"] is not None]
            check("the normal is aligned onto the series points",
                  len(aligned) > len(se["series"]) * 0.9,
                  f"{len(aligned)} of {len(se['series'])}")

        print("\n[the base-10 GDD trap]")
        # climate_zone_daily.gdd_cumulative is base ZERO. If the curve were read
        # from it, a Sep-Apr figure would land near 4,500 instead of ~1,400.
        live = [(s, p) for s, p in payloads.items() if p["season"]["available"]]
        if live:
            slug, p = live[0]
            last = p["season"]["series"][-1]
            raw = db.execute(text("""
                SELECT gdd_cumulative FROM climate_zone_daily
                 WHERE zone_id = (SELECT id FROM climate_zones WHERE slug = :s)
                   AND date = :d"""), {"s": slug, "d": last["date"]}).scalar()
            check("cumulative GDD is base 10, not the table's base-0 column",
                  raw is None or abs(float(raw) - last["gdd10_cumulative"]) > 1.0,
                  f"{slug}: ours {last['gdd10_cumulative']} vs table {raw}")
        else:
            print("        (no zone is mid-season today — pre-season, "
                  "so the live curve cannot be exercised)")

        print("\n[the 28 February hole in the daily climatology]")
        curve_zone = db.execute(text("""
            SELECT zone_id FROM climate_zone_daily_baseline
             WHERE day_of_vintage = 242 LIMIT 1""")).scalar()
        check("day 243 really is absent from the table for that zone",
              db.execute(text("""
                  SELECT count(*) FROM climate_zone_daily_baseline
                   WHERE zone_id = :z AND day_of_vintage = 243"""),
                  {"z": curve_zone}).scalar() == 0)
        curve = RD._baseline_curve(db, curve_zone)
        check("the built curve fills day 243", 243 in curve)
        check("day 243 is marked interpolated, not passed off as measured",
              curve.get(243, {}).get("interpolated") is True)
        # A flat spot is the defect being prevented: the cumulative must rise.
        if 242 in curve and 244 in curve:
            check("the cumulative curve does not flat-spot across 28 February",
                  curve[244]["gdd10_cumulative"] > curve[242]["gdd10_cumulative"],
                  f"242={curve[242]['gdd10_cumulative']} "
                  f"244={curve[244]['gdd10_cumulative']}")
        check("the curve is monotonic — a cumulative that falls is a bug",
              all(curve[a]["gdd10_cumulative"] <= curve[b]["gdd10_cumulative"]
                  for a, b in zip(sorted(curve), sorted(curve)[1:])))

        print("\n[history — now the SURFACE roll-up, not the 2023 table]")
        hist = [p["history"] for p in signed_in.values()
                if p["history"]["available"]]
        # The whole point of 2026-08-24: this block used to read
        # `climate_zone_season_stats` and stop at 2023 while the surfaces
        # underneath were current to 2026-07. It must now track the archive.
        archive_last = db.execute(text(
            "SELECT max(vintage_year) FROM climate_zone_surface_season")).scalar()
        check(f"history reaches the archive's last vintage ({archive_last})",
              all(h["span"]["last"] == archive_last for h in hist),
              f"{ {h['span']['last'] for h in hist} }")
        check("history is NOT stuck at 2023 any more",
              all(h["span"]["last"] > 2023 for h in hist))
        stats_last = db.execute(text(
            "SELECT max(vintage_year) FROM climate_zone_season_stats")).scalar()
        check("and it is ahead of the old season_stats table",
              archive_last > stats_last,
              f"archive {archive_last} vs season_stats {stats_last}")
        # The span is reported from the data. Hardcoding the ceiling into the
        # note is what went stale last time.
        check("the note names the real span, whatever it is",
              all(str(h["span"]["last"]) in (h.get("note") or "") for h in hist))
        check("history declares the surface source",
              all("surface" in (h.get("source") or "").lower() for h in hist))
        check("history reports the PAGE's baseline, not the stored 1987-2006",
              all(h["baseline"] == f"{RD.BASELINE_LO}-{RD.BASELINE_HI}"
                  for h in hist))
        check("history carries a per-decade trend",
              all(any(m.get("trend_per_decade") is not None for m in h["metrics"])
                  for h in hist))
        check("GDD and rain joined the summary",
              all({"gdd10", "rain"} <= {m["key"] for m in h["metrics"]}
                  for h in hist),
              f"{[sorted(m['key'] for m in h['metrics']) for h in hist[:1]]}")
        # Dropped 2026-08-24: total growing-season frost correlates 0.970 with
        # spring frost, so the two read as the same row on an overview.
        check("total frost nights is NOT shown beside spring frost",
              all("frost_days" not in {m["key"] for m in h["metrics"]}
                  for h in hist))
        check("spring frost is gone too — same field, same bias",
              all("spring_frost" not in {m["key"] for m in h["metrics"]}
                  for h in hist))
        check("no frost metric of any kind remains on the overview",
              all(not any("frost" in m["key"] for m in h["metrics"])
                  for h in hist),
              f"{[sorted(m['key'] for m in h['metrics']) for h in hist[:1]]}")

        print("\n[projections — now the 500 m MfE surfaces, per planted cell]")
        projs = [p["projections"] for p in signed_in.values()
                 if p["projections"]["available"]]
        n_zones = db.execute(text(
            "SELECT count(DISTINCT zone_id) FROM climate_zone_projection")).scalar()
        check(f"projections available on all {n_zones} aggregated zones",
              len(projs) == n_zones, f"got {len(projs)}")
        check("a scenario and period are chosen and reported",
              all(pr["showing"]["ssp"] and pr["showing"]["period"] for pr in projs))
        check("all three SSPs are offered",
              all(len(pr["scenarios"]) == 3 for pr in projs))
        check("warming levels are offered alongside calendar periods",
              all(any(x.startswith("wl") for x in pr["periods"]) for pr in projs))

        check("every projection carries a temperature headline",
              all(any(h["key"] == "tmean" and h["delta"] is not None
                      for h in pr["headlines"]) for pr in projs))
        check("warming is positive in every region — a negative delta is a bug",
              all(h["delta"] > 0 for pr in projs for h in pr["headlines"]
                  if h["key"] == "tmean"))
        check("frost falls in every region",
              all(h["delta"] < 0 for pr in projs for h in pr["headlines"]
                  if h["key"] == "frost_days"))
        check("GDD rises in every region",
              all(h["delta"] > 0 for pr in projs for h in pr["headlines"]
                  if h["key"] == "gdd10"))

        # The baseline must be OURS and must match the rest of the page — that
        # is the only reason a projection can sit beside the history at all.
        check("the projection baseline matches the page baseline",
              all(pr["baseline"] == f"{RD.BASELINE_LO}-{RD.BASELINE_HI}"
                  for pr in projs))
        check("every headline carries a real baseline and projected value",
              all(h["baseline"] is not None and h["projected"] is not None
                  for pr in projs for h in pr["headlines"]))
        check("delta equals projected minus baseline",
              all(abs((h["projected"] - h["baseline"]) - h["delta"]) < 0.01
                  for pr in projs for h in pr["headlines"]))

        # SEPAPR where published, ANN otherwise, and the payload says which.
        check("gdd10 uses the growing season, not the calendar year",
              all(h["season"] == "SEPAPR" for pr in projs
                  for h in pr["headlines"] if h["key"] == "gdd10"))
        check("any annual fallback is named in the note",
              all(("ANNUAL" in pr["note"])
                  == any(not h["seasonal"] for h in pr["headlines"])
                  for pr in projs))
        check("the CC BY attribution travels with the data",
              all("Ministry for the Environment" in (pr.get("attribution") or "")
                  for pr in projs))

        print("\n[the open tier — what an anonymous visitor gets]")
        free = payloads[slugs[0]]
        check("the payload names its tier", free.get("tier") == "anonymous",
              free.get("tier"))
        for b in RD.OPEN_BLOCKS:
            check(f"{b} is served without an account",
                  b in free and not free[b].get("locked"))
        for b in RD.REGISTERED_BLOCKS:
            check(f"{b} is locked", free[b].get("locked") is True)
            # THE PROMPT MUST ASK FOR THE RIGHT THING. These moved off Pro on
            # 2026-08-25, and a stub still saying `tier: 'pro'` would send
            # someone to a pricing page for what a free sign-up opens.
            check(f"{b} asks for registration, not Pro",
                  free[b].get("tier") == "registration", free[b].get("tier"))
            # Withheld SERVER-SIDE, not hidden in CSS: the numbers must not be
            # in the payload at all.
            for leak in ("metrics", "series", "headlines", "span"):
                check(f"{b} leaks no {leak}", leak not in free[b])
            check(f"{b} still says what it is", bool(free[b].get("detail")))

        member = signed_in[slugs[0]]
        check("a signed-in caller gets history and projections",
              member.get("tier") == "registered"
              and not member["history"].get("locked")
              and not member["projections"].get("locked"))

        print("\n[the models' holding line]")
        # Phenology and disease no longer say "not modelled for this region
        # yet". From 2026-09-01 the daily surfaces cover every zone, so an
        # unavailable model means the season has not started - which is a fact
        # about the calendar, not about the region. Both blocks must say the
        # SAME thing, or the page reads as two separate gaps in coverage.
        holds = set()
        for slug, pay in signed_in.items():
            for key in ("phenology", "disease"):
                blk = pay[key]
                if blk.get("available"):
                    continue
                check(f"{slug}/{key} does not claim a coverage gap",
                      "not modelled" not in (blk.get("reason") or ""),
                      blk.get("reason"))
                holds.add(blk.get("reason"))
        check("every holding line is identical", len(holds) <= 1, str(holds))

        print("\n[recent conditions — the free anchor]")
        rec = [p["recent"] for p in payloads.values() if p["recent"]["available"]]
        check("recent conditions available somewhere", len(rec) > 0,
              f"{len(rec)} of {len(payloads)}")
        if rec:
            r = rec[0]
            check("it is a ten-day window", r["window_days"] == 10,
                  r["window_days"])
            check("no more days than the window", r["days_present"] <= 10)
            check("every point carries temp and rain keys",
                  all({"temp_min", "temp_mean", "temp_max", "rain"} <= set(p)
                      for p in r["series"]))
            check("station count travels per day",
                  all("stations" in p for p in r["series"]))
            check("it declares it is measured, not modelled",
                  "station" in r.get("source", ""))

        print("\n[the GDD spread band]")
        mid_seasoned = [p for p in mid_payloads.values()
                        if p["season"]["available"]]
        if mid_seasoned:
            sp = mid_seasoned[0]["season"].get("gdd10_spread") or []
            check("the season carries a spread band", len(sp) > 0)
            check("one anchor per season month", len(sp) == 8, len(sp))
            check("the band widens through the season",
                  all(a["sd"] <= b["sd"] for a, b in zip(sp, sp[1:])),
                  f"{[x['sd'] for x in sp]}")
            check("every anchor states how many seasons stand behind it",
                  all(x["n_years"] >= 5 for x in sp))

        print("\n[disease is a ten-day window now]")
        dis = [p["disease"] for p in payloads.values() if p["disease"]["available"]]
        check("disease window is 10 days",
              all(d["window_days"] == 10 for d in dis),
              f"{ {d['window_days'] for d in dis} }")

        print("\n[the gate, over HTTP with a real token]")
        # THIS IS THE CHECK THAT WAS MISSING, and its absence is why the suite
        # stayed green while the page was broken for every signed-in user.
        #
        # Everything above calls `RD.build(..., registered=)` directly, which
        # tests the BUILDER and assumes the request ever arrives carrying an
        # identity. It did not: `regionDashboardService` used a bare `fetch`
        # with no Authorization header, so the server saw anonymous from
        # everyone and both blocks showed a sign-in prompt to people who were
        # already signed in — Pro subscribers included.
        #
        # A gate is only as good as the weakest layer between the token and the
        # payload, so this exercises the whole route: mint a token, send it,
        # read the tier back off the response.
        try:
            from fastapi.testclient import TestClient
            from main import app
            from core.public_security import create_access_token
            from db.models.public_user import PublicUser

            client = TestClient(app)
            url = f"/api/v1/public/public_climate/zones/{slugs[0]}/dashboard"

            anon_http = client.get(url).json()
            check("HTTP, no token: tier is anonymous and both blocks locked",
                  anon_http.get("tier") == "anonymous"
                  and anon_http["history"].get("locked") is True
                  and anon_http["projections"].get("locked") is True,
                  str(anon_http.get("tier")))

            member = db.query(PublicUser).filter(
                PublicUser.is_active.is_(True),
                PublicUser.is_verified.is_(True)).first()
            if member is None:
                check("HTTP, with a token: a verified account exists to test with",
                      False, "no active verified public user in the database")
            else:
                # `user_id`, NOT `sub` — `get_current_public_user` reads
                # `payload["user_id"]` and a token keyed on `sub` resolves to
                # None while looking perfectly valid.
                token = create_access_token({"user_id": member.id,
                                             "email": member.email})
                auth_http = client.get(
                    url, headers={"Authorization": f"Bearer {token}"}).json()
                check("HTTP, with a token: tier flips to registered",
                      auth_http.get("tier") == "registered",
                      f'{auth_http.get("tier")} (user {member.id}, '
                      f'{member.subscription_tier})')
                check("HTTP, with a token: history and projections unlock",
                      not auth_http["history"].get("locked")
                      and not auth_http["projections"].get("locked"),
                      f'history.locked={auth_http["history"].get("locked")} '
                      f'projections.locked={auth_http["projections"].get("locked")}')
        except ImportError as exc:
            check("HTTP gate check could run", False, f"import failed: {exc}")

        print("\n[404 behaviour]")
        try:
            PC.get_zone_dashboard(slug="not-a-region", user=None, db=db)
            check("unknown slug 404s", False, "no raise")
        except Exception as e:                                      # noqa: BLE001
            check("unknown slug 404s", getattr(e, "status_code", None) == 404,
                  f"got {e}")

    finally:
        db.close()

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
