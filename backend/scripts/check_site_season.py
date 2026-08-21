"""Acceptance suite for the current-season panel.

    backend/venv/Scripts/python.exe backend/scripts/check_site_season.py

The calendar logic is exercised against real data. The comparison arithmetic is
exercised against SYNTHETIC daily rows written inside a transaction and rolled
back, because no daily surface has been indexed yet and waiting for one would
leave the load-bearing part of this panel — is the live side compared against
the baseline over the SAME days — untested until the season is already running.
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from db.models.insights_site import InsightsSite                    # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from services import insights_dashboard as D                        # noqa: E402
from services import insights_site_baseline as B                    # noqa: E402

PASS, FAIL = [], []

BASELINE = (1986, 2005)
# Ten days into the 2027 season, with the last two days missing — the shape a
# D+2 engine actually produces.
TODAY = date(2026, 9, 10)
FIRST = date(2026, 9, 1)
N_DAYS = 8


def check(label: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(label)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")


def close(a, b, tol=1e-6) -> bool:
    return a is not None and b is not None and abs(a - b) <= tol


def main() -> int:
    db = SessionLocal()
    try:
        site = (db.query(InsightsSite)
                  .filter(InsightsSite.status == "ready",
                          InsightsSite.zone_id.isnot(None))
                  .order_by(InsightsSite.id).first())
        if not site:
            check("a ready site exists", False)
            return report()

        # --- 1. which season is "current" -------------------------------------
        print("")
        print("1. the calendar")
        cases = [
            (date(2026, 8, 21), 2027, "not_started"),   # between seasons
            (date(2026, 9, 1), 2027, "in_progress"),    # opening day
            (date(2026, 11, 15), 2027, "in_progress"),
            (date(2027, 4, 30), 2027, "in_progress"),   # closing day
            (date(2027, 5, 1), 2028, "not_started"),    # rolls over
            (date(2027, 6, 1), 2028, "not_started"),
        ]
        for when, want_vintage, want_state in cases:
            got = D.current_vintage(when)
            state = D._season_state(got, when)
            check(f"{when} -> {want_vintage} {want_state}",
                  got == want_vintage and state == want_state,
                  f"got {got} {state}")

        payload = D.build(db, site, BASELINE, TODAY)
        check("the previous season is the one before the current",
              payload["season_previous"]["vintage"]
              == payload["season_current"]["vintage"] - 1,
              f"{payload['season_previous']['vintage']} vs "
              f"{payload['season_current']['vintage']}")
        check("the two panels declare different scales",
              payload["season_current"]["scope"] == "site"
              and payload["season_previous"]["scope"] == "region")

        # --- 2. before the season opens ---------------------------------------
        print("")
        print("2. not_started, which is the state it ships in")
        pre = D.build(db, site, BASELINE, date(2026, 8, 21))["season_current"]
        check("no metrics are invented", pre["available"] is False
              and pre["metrics"] == [])
        check("the reason names the start date",
              "2026-09-01" in (pre["reason"] or ""), pre["reason"] or "")
        check("it counts down", pre["starts_in_days"] == 11,
              str(pre["starts_in_days"]))
        check("and still shows what a usual season looks like",
              pre.get("baseline_season_totals", {}).get("gdd10", 0) > 0,
              str(round(pre["baseline_season_totals"]["gdd10"], 1)))

        # --- 3. under way, but nothing extracted ------------------------------
        print("")
        print("3. an operational gap is not worded as a calendar fact")
        empty = D.build(db, site, BASELINE, TODAY)["season_current"]
        check("state is in_progress", empty["state"] == "in_progress")
        check("but it is unavailable, for a DIFFERENT reason",
              empty["available"] is False
              and "no daily surface" in (empty["reason"] or "").lower(),
              empty["reason"] or "")

        # --- 4. the comparison, over synthetic days ---------------------------
        print("")
        print("4. like-for-like comparison (rolled back)")
        rows = []
        for i in range(N_DAYS):
            day = FIRST + timedelta(days=i)
            rows.append({
                "s": site.id, "d": day,
                "tmin": -1.0 if i == 0 else 5.0,      # exactly one frost night
                "tmax": 26.0 if i == 1 else 20.0,     # exactly one day over 25
                "tmean": 14.0,                        # 4.0 GDD every day
                # One day with NO rainfall value. Not zero — absent.
                "rain": None if i == 2 else 2.0,
            })
        db.execute(text("""
            INSERT INTO insights_site_daily
                (site_id, date, temp_min, temp_max, temp_mean, rainfall_mm,
                 model_version)
            VALUES (:s, :d, :tmin, :tmax, :tmean, :rain, 'tps-2.0.0-ridge-db')
        """), rows)

        season = D.build(db, site, BASELINE, TODAY)["season_current"]
        check("the panel is now available", season["available"] is True,
              season.get("reason") or "")
        check("it reports how far the data runs",
              season["data_to"] == (FIRST + timedelta(days=N_DAYS - 1)).isoformat(),
              season.get("data_to") or "")
        check("and how far the season has run",
              season["days_elapsed"] == 10 and season["days_total"] == 242,
              f"{season['days_elapsed']}/{season['days_total']}")

        by = {m["metric"]: m for m in season["metrics"]}
        check("GDD accumulates", close(by["gdd10"]["value"], N_DAYS * 4.0),
              str(by["gdd10"]["value"]))
        check("rainfall skips the absent day, it does not read it as 0",
              by["rain"]["days_used"] == N_DAYS - 1
              and close(by["rain"]["value"], (N_DAYS - 1) * 2.0),
              f"{by['rain']['days_used']} days, {by['rain']['value']}")
        check("frost nights are counted", close(by["frost_days"]["value"], 1.0))
        check("days over 25 are counted", close(by["hot_days_25"]["value"], 1.0))
        check("mean temperature is a MEAN, not a sum",
              close(by["tmean"]["value"], 14.0), str(by["tmean"]["value"]))

        # The load-bearing assertion: the normal is the baseline summed over
        # exactly the days the live side used, not over a whole season and not
        # over the days the live side was missing.
        curve = B.build(db, site, 2027, *BASELINE)
        by_date = {d["date"]: d for d in curve["days"] if d.get("available")}
        used = [(FIRST + timedelta(days=i)).isoformat() for i in range(N_DAYS)]
        want_gdd = sum(by_date[d]["gdd10"] for d in used)
        want_rain = sum(by_date[d]["rain"] for d in used
                        if d != (FIRST + timedelta(days=2)).isoformat())
        want_frost = sum(by_date[d]["frost_probability"] for d in used)
        check("the GDD normal covers exactly the days used",
              close(by["gdd10"]["normal"], want_gdd, 1e-9),
              f"{by['gdd10']['normal']:.4f} vs {want_gdd:.4f}")
        check("the rainfall normal EXCLUDES the day the site had no value",
              close(by["rain"]["normal"], want_rain, 1e-9),
              f"{by['rain']['normal']:.4f} vs {want_rain:.4f}")
        check("the frost normal is a sum of probabilities, not of days",
              close(by["frost_days"]["normal"], want_frost, 1e-9)
              and 0 < by["frost_days"]["normal"] < N_DAYS,
              f"{by['frost_days']['normal']:.4f}")
        check("a season total is NOT used as the normal",
              by["gdd10"]["normal"] < curve["season_totals"]["gdd10"] / 10,
              f"{by['gdd10']['normal']:.1f} vs season "
              f"{curve['season_totals']['gdd10']:.1f}")
        check("the anomaly is value minus normal",
              all(close(m["anomaly"], m["value"] - m["normal"])
                  for m in season["metrics"] if m.get("normal") is not None))

        # --- 5. scope and provenance ------------------------------------------
        print("")
        print("5. what the panel says about itself")
        check("every metric is site-scaled",
              all(m.get("normal_scope") == "site" for m in season["metrics"]
                  if m.get("normal") is not None))
        check("no metric claims a regional comparison",
              all(m.get("regional_comparison") is False
                  for m in season["metrics"] if m.get("normal") is not None))
        check("frost is present here, because this is site-versus-its-own-record",
              by["frost_days"]["normal"] is not None)
        era = season.get("era") or {}
        check("the era offset is stated", len(era.get("terms", [])) == 2)
        kinds = {t["variable"]: t["kind"] for t in era.get("terms", [])}
        check("and tmean and tmin are given DIFFERENT reasons",
              kinds.get("tmean") == "provenance" and kinds.get("tmin") == "network",
              str(kinds))
        check("the era of the data is named",
              era.get("model_versions") == ["tps-2.0.0-ridge-db"],
              str(era.get("model_versions")))

        # --- 6. the projections placeholder -----------------------------------
        print("")
        print("6. projections reserve their shape without inventing numbers")
        proj = payload["projections"]
        check("it is not available", proj["available"] is False)
        check("no projected values are present",
              not any(k in proj for k in ("values", "metrics", "projected")),
              str(sorted(proj))[:90])
        check("the 3x3 vocabulary is server-side",
              len(proj["scenarios"]) == 3 and len(proj["periods"]) == 3,
              f"{len(proj['scenarios'])}x{len(proj['periods'])}")
        check("scenario keys match what the DB stores",
              [s["key"] for s in proj["scenarios"]]
              == ["SSP126", "SSP245", "SSP370"])
        check("period keys match what the DB stores",
              [p["key"] for p in proj["periods"]]
              == ["2021_2040", "2041_2060", "2080_2099"])
        # Whether the REGION has projections is a different question from
        # whether this SITE can be projected. One must not stand in for the
        # other, which is why they are separate fields.
        check("the region's projections are reported separately",
              proj["regional_available"] is True and proj["zone_slug"],
              str(proj["zone_slug"]))
        check("and the reason names surfaces as what is missing",
              "surface" in (proj["reason"] or "").lower(), proj["reason"] or "")

        # --- 7. the regional models -------------------------------------------
        print("")
        print("7. phenology and disease are offered, and badged regional")
        models = payload["models"]
        check("the scale is declared", models["scope"] == "region")
        check("the badge says it is not downscaled",
              "not downscaled" in models["disclaimer"], models["disclaimer"])
        check("the zone slug is there for the explorers to fetch with",
              bool(models["zone_slug"]), str(models["zone_slug"]))
        check("phenology is available for this region",
              models["phenology"]["available"] is True
              and models["phenology"]["variety_count"] > 0,
              f"{models['phenology']['variety_count']} varieties")
        check("disease pressure is available for this region",
              models["disease"]["available"] is True
              and models["disease"]["days"] > 0,
              f"{models['disease']['days']} days")

        # The phenology model counts vintages July-June; this page counts them
        # Sep-Apr. They agree for eight months and diverge in May and June, and
        # the panel has to say which season it is describing rather than inherit
        # the page's heading.
        check("in September the two vintages agree",
              D.build(db, site, BASELINE, date(2026, 9, 15))["models"]
              ["phenology"]["vintage_differs_from_page"] is False)
        june = D.build(db, site, BASELINE, date(2027, 6, 1))["models"]["phenology"]
        check("in June the divergence is FLAGGED, not hidden",
              june["vintage_differs_from_page"] is True
              and june["vintage_year"] != june["page_vintage"],
              f"model {june['vintage_year']} vs page {june['page_vintage']}")

        # THE TWO MODELS ARE CHECKED INDEPENDENTLY, and they have to be: only 10
        # of 23 zones carry both. Five carry exactly one — Northland, Gisborne
        # and Waitaki have phenology and no disease; Gladstone and Bannockburn
        # have disease and no phenology. A single "models available" flag would
        # be wrong for every one of them.
        original_zone = site.zone_id
        split = db.execute(text("""
            SELECT z.id,
                   (SELECT count(*) FROM phenology_estimates p
                     WHERE p.zone_id = z.id) AS phen,
                   (SELECT count(*) FROM disease_pressure d
                     WHERE d.zone_id = z.id) AS dis
              FROM climate_zones z
        """)).mappings().all()
        one_only = [r for r in split if (r["phen"] > 0) != (r["dis"] > 0)]
        if one_only:
            target = one_only[0]
            site.zone_id = target["id"]
            db.flush()
            mixed = D.build(db, site, BASELINE, TODAY)["models"]
            check("a zone with only ONE model reports them separately",
                  mixed["phenology"]["available"] == (target["phen"] > 0)
                  and mixed["disease"]["available"] == (target["dis"] > 0),
                  f"zone {target['id']}: phenology "
                  f"{mixed['phenology']['available']}, disease "
                  f"{mixed['disease']['available']}")
            check("and the missing one carries a reason",
                  bool(mixed["phenology"]["reason"]
                       or mixed["disease"]["reason"]))

        # A site outside every mapped zone. Pro is not wine-only, so this is a
        # legitimate subscriber and not an error.
        site.zone_id = None
        db.flush()
        orphan = D.build(db, site, BASELINE, TODAY)["models"]
        check("a site outside every region gets a reason, not an empty explorer",
              orphan["phenology"]["available"] is False
              and orphan["disease"]["available"] is False
              and "outside every mapped" in orphan["phenology"]["reason"],
              orphan["phenology"]["reason"])
        check("and no zone slug for a component to fetch with",
              orphan["zone_id"] is None)
        site.zone_id = original_zone
        db.flush()

        # --- 8. phenology dates with no basis are WITHHELD ---------------------
        print("")
        print("8. unprojectable phenology dates never reach the client")
        site.zone_id = original_zone
        db.flush()

        # Pre-season. Every 2027 row sits at zero GDD, and the raw model puts
        # flowering in April 2027, veraison in January 2028 and a 22-Brix
        # harvest in June 2028 — 600 days out, stamped "high confidence".
        pre_season, pre_avail, pre_reason = D._phenology_varieties(db, original_zone, 2027)
        check("with zero GDD, no dates are projected", pre_avail is False)
        check("and the reason says why",
              "growing degree days" in (pre_reason or ""), pre_reason or "")
        check("EVERY date is withheld from the payload",
              all(s["date"] is None
                  for v in pre_season for s in v["stages"].values()),
              str([s["date"] for v in pre_season
                   for s in v["stages"].values() if s["date"]])[:80])
        check("and each says it has no basis",
              all(s["status"] == "no_basis"
                  for v in pre_season for s in v["stages"].values()))
        # Stage and accumulation are TRUE and stay. Only the projections go.
        check("the stage and the accumulation survive",
              all(v["stage"] and v["gdd"] is not None for v in pre_season))

        # In-season, the model works and must NOT be over-suppressed.
        in_season, in_avail, _ = D._phenology_varieties(db, original_zone, 2026)
        check("with real accumulation, dates ARE projected", in_avail is True)
        flowering = [v["stages"]["flowering"]["date"] for v in in_season]
        check("flowering lands in spring, not autumn",
              all(d and d[5:7] in ("11", "12", "01") for d in flowering),
              str(sorted(set(d[5:7] for d in flowering if d))))

        # The invariant that catches the whole class of defect: no date shown
        # for a vintage may fall outside that vintage's season.
        start, end = B.season_bounds(2026)
        every = [s["date"] for v in in_season for s in v["stages"].values()
                 if s["date"]]
        check("no projected date escapes its own season",
              all(start.isoformat() <= d <= end.isoformat() for d in every),
              f"{len(every)} dates, {min(every)}..{max(every)}")
        check("a target the season never reaches says so rather than blanking",
              any(s["status"] == "beyond_season"
                  for v in in_season for s in v["stages"].values()))

        targets = models["phenology"]["harvest_targets"]
        check("only two harvest targets are carried",
              [t["sugar_g_l"] for t in targets] == [210, 220], str(targets))
        # GRAMS PER LITRE, not Brix. 210 g/L is ~19.5 Brix; labelling it 21.0
        # Brix overstates ripeness by a point and a half at the pick decision.
        check("and each carries its Brix equivalent, not a decimal of itself",
              all(t["brix"] < t["sugar_g_l"] / 10 for t in targets),
              str([(t["sugar_g_l"], t["brix"]) for t in targets]))
        check("and the dropped targets are nowhere in the payload",
              not any(k.endswith(("_170", "_180", "_190", "_200"))
                      for v in in_season for k in v["stages"]))

        latest = models["disease"]["latest"]
        check("disease carries the three model readings",
              all(latest[k] for k in
                  ("downy_mildew", "powdery_mildew", "botrytis")),
              str([latest["downy_mildew"], latest["powdery_mildew"],
                   latest["botrytis"]]))

        # --- 9. the PUBLIC region endpoint is gated too ------------------------
        print("")
        print("9. the region pages get the same gate, not a second opinion")
        from api.v1 import realtime_climate as RC

        region = RC.get_phenology_estimates(zone_slug="waipara",
                                            varieties=None, db=db)
        stages = [s for v in region.varieties for s in v.stages]
        check("the region endpoint answers", len(stages) > 0, f"{len(stages)} stages")
        check("every stage declares a status",
              all(s.status for s in stages),
              str({s.status for s in stages}))
        # Pre-season today, so the whole response must be withheld. This is the
        # public page — these were the "high confidence" harvest dates in 2028.
        withheld = [s for s in stages if s.status == "no_basis"]
        if withheld:
            check("withheld stages carry NO date",
                  all(s.predicted_date is None for s in withheld),
                  f"{len(withheld)} withheld")
            check("and no days_from_now either",
                  all(s.days_from_now is None for s in withheld))
        rs, re_ = B.season_bounds(region.vintage_year)
        shown = [s for s in stages if s.predicted_date]
        check("no date the region page shows escapes its season",
              all(rs <= s.predicted_date <= re_ for s in shown),
              f"{len(shown)} shown")
        # Whoever built this endpoint already pulled veraison out as unreliable.
        check("the region endpoint still omits veraison, as its author intended",
              not any("raison" in s.stage_name for s in stages))

        return report()
    finally:
        db.rollback()
        db.close()


def report() -> int:
    print("")
    print(f"{len(PASS)} passed, {len(FAIL)} failed")
    for f in FAIL:
        print(f"  FAILED: {f}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
