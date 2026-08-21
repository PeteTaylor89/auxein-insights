"""Acceptance suite for the Pro site daily baseline curve.

Runs against the real database. Read-only — it creates nothing and deletes
nothing.

    backend/venv/Scripts/python.exe backend/scripts/check_site_baseline.py

The load-bearing check is §2. `climate_zone_daily_baseline` stores
`gdd_base10_avg` computed directly from the twenty years of daily records, so at
ZERO offset the normal-integral estimator must reproduce it. If it does not, the
estimator is wrong and every rescaled GDD figure downstream is wrong with it.
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

from db.models.insights_site import InsightsSite                    # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from services import insights_site_baseline as B                    # noqa: E402

PASS, FAIL = [], []


def check(label: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(label)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")


def close(a, b, tol) -> bool:
    return a is not None and b is not None and abs(a - b) <= tol


def main() -> int:
    db = SessionLocal()
    try:
        # --- 1. the date mapping ---------------------------------------------
        print("\n1. day_of_vintage mapping")
        check("1 Sep -> 63", B.day_of_vintage(date(2026, 9, 1)) == 63,
              f"got {B.day_of_vintage(date(2026, 9, 1))}")
        check("30 Apr -> 304", B.day_of_vintage(date(2027, 4, 30)) == 304,
              f"got {B.day_of_vintage(date(2027, 4, 30))}")
        check("28 Feb -> 243", B.day_of_vintage(date(2027, 2, 28)) == 243,
              f"got {B.day_of_vintage(date(2027, 2, 28))}")
        check("1 Mar -> 244", B.day_of_vintage(date(2027, 3, 1)) == 244,
              f"got {B.day_of_vintage(date(2027, 3, 1))}")
        # The leap day has no slot of its own; it must land on 28 Feb rather
        # than push March onto February's climatology.
        check("29 Feb -> 243, not 244", B.day_of_vintage(date(2028, 2, 29)) == 243,
              f"got {B.day_of_vintage(date(2028, 2, 29))}")
        check("a leap vintage still ends on 304",
              B.day_of_vintage(date(2028, 4, 30)) == 304)
        check("season is 242 days", len(B.season_days(2027)) == 242,
              f"got {len(B.season_days(2027))}")
        check("a leap season is 243 days", len(B.season_days(2028)) == 243,
              f"got {len(B.season_days(2028))}")

        # --- 2. the estimator, at zero offset --------------------------------
        print("\n2. normal-integral GDD reproduces the stored daily GDD10")
        zone_id = db.execute(text("""
            SELECT zone_id FROM climate_zone_daily_baseline
             GROUP BY zone_id ORDER BY zone_id LIMIT 1
        """)).scalar()
        curve = B.zone_curve(db, zone_id)
        check("a zone curve loads", bool(curve), f"zone {zone_id}, {len(curve)} days")

        worst, worst_dov, total_est, total_stored = 0.0, None, 0.0, 0.0
        for dov, row in curve.items():
            if row["tmean_sd"] is None or row["gdd_base10_avg"] is None:
                continue
            est = B.expected_excess(row["tmean_avg"], row["tmean_sd"], B.GDD_BASE)
            total_est += est
            total_stored += row["gdd_base10_avg"]
            diff = abs(est - row["gdd_base10_avg"])
            if diff > worst:
                worst, worst_dov = diff, dov
        check("worst single-day GDD error < 0.35", worst < 0.35,
              f"worst {worst:.3f} on day {worst_dov}")
        rel = abs(total_est - total_stored) / total_stored if total_stored else 1
        check("annual GDD total within 3%", rel < 0.03,
              f"integral {total_est:.0f} vs stored {total_stored:.0f} ({rel:.2%})")

        # --- 3. the missing February day --------------------------------------
        print("\n3. day 243 (28 February)")
        raw = db.execute(text("""
            SELECT count(*) FROM climate_zone_daily_baseline
             WHERE zone_id = :z AND day_of_vintage = :d
        """), {"z": zone_id, "d": B.MISSING_DOV}).scalar()
        check("absent in the source table", raw == 0, f"rows {raw}")
        check("filled in the loaded curve", B.MISSING_DOV in curve)
        check("flagged as interpolated",
              bool(curve.get(B.MISSING_DOV, {}).get("interpolated")))
        if B.MISSING_DOV in curve:
            mid = (curve[242]["tmean_avg"] + curve[244]["tmean_avg"]) / 2
            check("interpolated tmean is the midpoint",
                  close(curve[B.MISSING_DOV]["tmean_avg"], mid, 1e-9))

        # --- 4. a real site ---------------------------------------------------
        print("\n4. the rescaled curve for a live site")
        site = (db.query(InsightsSite)
                  .filter(InsightsSite.status == "ready",
                          InsightsSite.zone_id.isnot(None))
                  .order_by(InsightsSite.id).first())
        if not site:
            check("a ready site exists", False, "none found - remaining checks skipped")
            return report()

        built = B.build(db, site, 2027)
        check("a curve is built", built is not None,
              f"site {site.id} {site.label!r} zone {site.zone_id}")
        if built is None:
            return report()

        available = [d for d in built["days"] if d.get("available")]
        check("every day of the season is present",
              len(built["days"]) == 242, f"got {len(built['days'])}")
        check("no day is a gap", len(available) == 242,
              f"{242 - len(available)} gaps")
        check("no month left unadjusted",
              not built["meta"]["unadjusted_months"],
              str(built["meta"]["unadjusted_months"]))
        check("cumulative GDD is monotonic",
              all(a["gdd10_cumulative"] <= b["gdd10_cumulative"]
                  for a, b in zip(available, available[1:])))

        # --- 5. the rescale integrates back to the site's own normal ----------
        print("\n5. the rescale returns the site's monthly level")
        site_level = B.site_month_normal(db, site.id)
        by_month: dict[int, list[dict]] = {}
        for day in available:
            by_month.setdefault(int(day["date"][5:7]), []).append(day)

        worst_t, worst_r, worst_tm, worst_rm = 0.0, 0.0, None, None
        for month, days in by_month.items():
            want = site_level.get(month)
            if not want:
                continue
            got_t = sum(d["tmean"] for d in days) / len(days)
            got_r = sum(d["rain"] for d in days)
            if abs(got_t - want["tmean"]) > worst_t:
                worst_t, worst_tm = abs(got_t - want["tmean"]), month
            if abs(got_r - want["rain"]) > worst_r:
                worst_r, worst_rm = abs(got_r - want["rain"]), month
        # Not exactly zero: February is 27 source days plus one interpolated, so
        # the rescaled month integrates over 28 while the offset was computed on
        # 27. The residual is bounded by one day's departure from the mean.
        check("monthly tmean returns to within 0.15 C", worst_t < 0.15,
              f"worst {worst_t:.3f} C in month {worst_tm}")
        check("monthly rain returns to within 3 mm", worst_r < 3.0,
              f"worst {worst_r:.2f} mm in month {worst_rm}")

        # --- 6. the season total is the site's, not the zone's ----------------
        print("\n6. season totals sit on the site, not its region")
        zone_season_gdd = db.execute(text("""
            SELECT sum(gdd_base10_avg) FROM climate_zone_daily_baseline
             WHERE zone_id = :z AND day_of_vintage BETWEEN 63 AND 304
        """), {"z": site.zone_id}).scalar()
        archived = db.execute(text("""
            SELECT avg(value) FROM insights_site_season
             WHERE site_id = :s AND metric = 'gdd10'
               AND vintage_year BETWEEN :lo AND :hi
        """), {"s": site.id, "lo": B.BASELINE_LO, "hi": B.BASELINE_HI}).scalar()
        built_gdd = built["season_totals"]["gdd10"]
        print(f"      zone curve {float(zone_season_gdd):.1f} | "
              f"rescaled {built_gdd:.1f} | site archive {float(archived):.1f}")
        # The archive integrates MONTHLY mean and sd; this integrates DAILY mean
        # and interannual sd. Two estimators of the same quantity, so they are
        # compared for agreement, not equality.
        check("within 8% of the site's own archived season GDD10",
              abs(built_gdd - float(archived)) / float(archived) < 0.08,
              f"{abs(built_gdd - float(archived)) / float(archived):.2%}")
        check("closer to the site than to the zone",
              abs(built_gdd - float(archived))
              < abs(built_gdd - float(zone_season_gdd)))

        # --- 7. cumulatives to a day -----------------------------------------
        print("\n7. totals_to")
        mid = B.totals_to(built, date(2026, 12, 31))
        check("day 122 of the season on 31 Dec", mid["day_of_season"] == 122,
              f"got {mid['day_of_season']}")
        check("mid-season GDD is below the season total",
              mid["gdd10"] < built["season_totals"]["gdd10"])
        before = B.totals_to(built, date(2026, 8, 31))
        check("the day before the season opens has nothing",
              before["day_of_season"] == 0)
        end = B.totals_to(built, date(2027, 4, 30))
        check("the last day equals the season total",
              close(end["gdd10"], built["season_totals"]["gdd10"], 1e-9))

        # --- 8. a zone with no baseline ---------------------------------------
        print("\n8. a zone with no daily baseline")
        orphan = db.execute(text("""
            SELECT id FROM climate_zones
             WHERE id NOT IN (SELECT DISTINCT zone_id FROM climate_zone_daily_baseline)
             LIMIT 1
        """)).scalar()
        if orphan:
            check("its curve is empty, not another zone's",
                  B.zone_curve(db, orphan) == {}, f"zone {orphan}")
        else:
            check("every zone has a baseline", True, "no orphan to test")

        return report()
    finally:
        db.close()


def report() -> int:
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    for f in FAIL:
        print(f"  FAILED: {f}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
