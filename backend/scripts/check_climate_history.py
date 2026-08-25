"""Acceptance suite for the public climate-history endpoints.

    backend/venv/Scripts/python.exe backend/scripts/check_climate_history.py

Runs against the real database, calls the router functions directly, writes
nothing.

Guards the 2026-08-24 repoint: `/zones/{slug}/history` and
`/zones/{slug}/seasons` moved off `climate_history_monthly` and
`climate_zone_season_stats` — both frozen at 2023 — onto the surface-derived
view and roll-up.

Three things broke on the way here and each has a check:

1. The endpoints silently served a **three-season-stale** record while the
   surfaces underneath were current.
2. **Vintage 2024 was hardcoded as excluded.** It was excluded when the archive
   stopped mid-season; the season has been complete for a while and the
   constant was hiding it.
3. **Frost, spring frost, hot days and extreme rainfall vanished** for every
   season after 2023, because the extremes still came from the frozen table
   while everything else on the row came from the current one — so the row
   rendered, just with four holes in it.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from api.v1 import public_climate as PC                             # noqa: E402
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


def main():
    db = SessionLocal()
    try:
        archive_last = db.execute(text(
            "SELECT max(year) FROM climate_zone_surface_monthly")).scalar()
        stale_last = db.execute(text(
            "SELECT max(year) FROM climate_history_monthly")).scalar()

        slugs = [r[0] for r in db.execute(text(
            "SELECT slug FROM climate_zones WHERE is_active ORDER BY display_order"
        )).all()]

        print(f"\n[monthly history tracks the archive, not the {stale_last} table]")
        h = PC.get_zone_history(slug="marlborough", start_year=None,
                                end_year=None, vintage_year=None, months=None,
                                db=db)
        years = sorted({d.year for d in h.data})
        check(f"history reaches {archive_last}", years[-1] == archive_last,
              f"got {years[-1]}")
        check("and is ahead of the old table", years[-1] > stale_last,
              f"{years[-1]} vs {stale_last}")
        check("history still starts in 1986", years[0] == 1986, f"got {years[0]}")
        check("no year is missing in between",
              years == list(range(years[0], years[-1] + 1)))

        print("\n[the fields the explorer draws are all present]")
        row = h.data[-1]
        # The MONTHLY frost band is untouched — it is raw data, and the
        # removal was of the SEASON-level metric the page displayed.
        for name in ("tmean", "tmin", "tmax", "gdd", "rain", "rx1day",
                     "frost_days"):
            v = getattr(row, name)
            check(f"{name} has a value", v is not None and v.mean is not None)
        check("error bands have an sd to draw from",
              row.tmean.sd is not None and row.gdd.sd is not None)
        # The one deliberate loss. Nothing renders it; a stale value would be
        # worse than an absent one.
        check("solar is absent, not stale", row.solar.mean is None)

        print("\n[vintage 2024 is offered again]")
        check("2024 is no longer in EXCLUDED_VINTAGE_YEARS",
              2024 not in PC.EXCLUDED_VINTAGE_YEARS,
              f"{PC.EXCLUDED_VINTAGE_YEARS}")
        # 1986 must STAY excluded: it needs Sep-Dec 1985, which predates the
        # archive. That one is impossible, not merely unpublished.
        check("1986 is still excluded — it cannot exist",
              1986 in PC.EXCLUDED_VINTAGE_YEARS)
        months_2024 = db.execute(text("""
            SELECT count(DISTINCT (year, month)) FROM climate_history_monthly_surface
             WHERE vintage_year = 2024 AND month IN (9,10,11,12,1,2,3,4)
        """)).scalar()
        check("and vintage 2024 really has all eight months",
              months_2024 == 8, f"got {months_2024}")

        print("\n[seasons, across every zone]")
        # The first vintage whose CALENDAR year is not yet complete. Derived,
        # not hardcoded — hardcoding a year here is what went stale last time.
        #
        # `frost_days_annual` is still BUILT and still correct; it is simply no
        # longer served, so these checks guard the builder rather than the API.
        partial_from = (db.execute(text("""
            SELECT max(vintage_year) FROM climate_zone_surface_season
             WHERE metric = 'frost_days_annual'
        """)).scalar() or 0) + 1
        print(f"        (annual frost complete through {partial_from - 1}; "
              f"{partial_from}+ awaits its December)")
        missing_extremes = []
        no_2024 = []
        short = []
        for slug in slugs:
            s = PC.get_zone_seasons(slug=slug, start_vintage=None,
                                    end_vintage=None, limit=None, db=db)
            vintages = {x.vintage_year for x in s.seasons}
            if not vintages:
                short.append(slug)
                continue
            if 2024 not in vintages:
                no_2024.append(slug)
            if max(vintages) <= 2023:
                short.append(slug)
            # A season row with a GDD total and empty extremes is the failure
            # being guarded against. TOTAL frost is no longer among them — it
            # was removed on 2026-08-24 (see below) — so spring frost, hot days
            # and heaviest rainfall are the three that must always be present.
            for x in s.seasons:
                e = x.extremes
                if e is None:
                    missing_extremes.append(f"{slug}/{x.vintage_year}")
                    break
                if (e.hot_days30.mean is None or e.r99p.mean is None):
                    missing_extremes.append(f"{slug}/{x.vintage_year}")
                    break

        check("every zone offers vintage 2024", not no_2024,
              f"missing on {no_2024[:5]}")
        check("no zone stops at 2023 any more", not short,
              f"still short: {short[:5]}")
        check("hot days and heaviest rainfall on every season",
              not missing_extremes, f"holes at {missing_extremes[:5]}")

        # TOTAL frost days were removed from the served payload on 2026-08-24.
        # Thresholding a lapse-retrended Tmin field at 0 degC loads frost onto
        # high ground and erases it from valley floors: measured in July 2025,
        # Red Hills at 1328 m observed 1 frost night and its own pixel says 20,
        # while Flaxbourne at 39 m observed 6 and its pixel says 0. Marlborough
        # lost 95% of its frost; Central Otago, whose Tmin sits well below zero,
        # was accurate to 5%. A metric that is right in one region and absent in
        # another is worse than no metric.
        #
        # Spring frost is KEPT because it is what growers act on, but it comes
        # off the same field and carries the same bias — it is simply smaller.
        sample = PC.get_zone_seasons(slug=slugs[0], start_vintage=None,
                                     end_vintage=None, limit=1, db=db)
        # EVERY frost field is gone as of 2026-08-24 — total, spring, and the
        # last-spring-frost date. Spring survived one round on the grounds that
        # growers act on it, then went too: it comes off the same lapse-retrended
        # Tmin field and its small numbers hide the error rather than avoid it.
        for field in ("frost_days", "early_frost", "last_frost_doy",
                      "last_frost_date"):
            check(f"season extremes no longer carry {field}",
                  not hasattr(sample.seasons[0].extremes, field))
            check(f"baseline extremes no longer carry {field}",
                  not hasattr(sample.baseline_extremes, field))
        check("hot days and heaviest rainfall survive",
              hasattr(sample.seasons[0].extremes, "hot_days30")
              and hasattr(sample.seasons[0].extremes, "r99p"))

        # Prove the exception is a partial calendar year and not a silent gap.
        annual_span = db.execute(text("""
            SELECT min(vintage_year), max(vintage_year), count(DISTINCT zone_id)
              FROM climate_zone_surface_season WHERE metric='frost_days_annual'
        """)).first()
        check("annual frost covers every zone",
              annual_span[2] == len(slugs), f"{annual_span[2]} of {len(slugs)}")
        check("annual frost is continuous to its last complete year",
              annual_span[0] == 1987, f"starts {annual_span[0]}")
        months_partial = db.execute(text("""
            SELECT count(DISTINCT month) FROM climate_zone_surface_monthly
             WHERE variable='temp_min' AND statistic='frost_days' AND year = :y
        """), {"y": partial_from}).scalar()
        check(f"and {partial_from} is genuinely incomplete, not dropped",
              months_partial < 12, f"{months_partial} months present")

        print("\n[extremes come from the surfaces]")
        s = PC.get_zone_seasons(slug="marlborough", start_vintage=None,
                                end_vintage=None, limit=None, db=db)
        newest = s.seasons[0]
        check("the newest season is post-2023", newest.vintage_year > 2023,
              f"got {newest.vintage_year}")
        check("its extremes declare the surface source",
              newest.extremes.source == "surface", newest.extremes.source)


    finally:
        db.close()

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
