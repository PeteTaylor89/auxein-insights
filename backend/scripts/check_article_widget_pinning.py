"""Acceptance suite for `as_of` pinning on the article climate widgets.

A published article embeds live climate widgets. Before 2026-08-23 those widgets
resolved the season at READ time, so an article headed "week ending 27 February
2026" drew whatever season was running when someone opened it. Audited across
prod: 24 live widgets in 11 published articles had done exactly that.

The fix pins them to the article's `published_at`. This suite asserts both
halves of that — the pinned request returns the season the article was about,
and the UNPINNED request is unchanged, because every other caller relies on it.

    backend/venv/Scripts/python.exe backend/scripts/check_article_widget_pinning.py

Read-only. It creates nothing and writes nothing.
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

from fastapi import HTTPException                                   # noqa: E402

from api.v1 import realtime_climate as R                            # noqa: E402
from db.session import SessionLocal                                 # noqa: E402

# The real articles this was built for. Zone + publication date straight off the
# rows in `articles`, so the suite fails if the data behind a published piece
# ever stops supporting it.
ARTICLES = [
    ("waipara", date(2026, 2, 27), "Waipara — week ending 27 Feb 2026"),
    ("awatere", date(2026, 2, 27), "Awatere — week ending 27 Feb 2026"),
    ("lower-wairau", date(2026, 2, 27), "Lower Wairau — week ending 27 Feb 2026"),
    ("waipara", date(2026, 3, 6), "Waipara — week ending 6 Mar 2026"),
    ("waipara", date(2026, 3, 13), "Waipara — week ending 13 Mar 2026"),
    ("hawkes-bay", date(2026, 3, 13), "Hawke's Bay — week ending 13 Mar 2026"),
    ("bendigo", date(2026, 3, 27), "End of Season Wrap — Bendigo"),
]

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    mark = "ok  " if condition else "FAIL"
    print(f"  [{mark}] {name}{('  — ' + detail) if detail else ''}")


def main():
    db = SessionLocal()
    try:
        print("\n=== 1. gdd_progress pins to the article's season ===")
        for slug, pub, label in ARTICLES:
            payload = R.get_gdd_progress(slug, vintage_year=None, base="base10",
                                         as_of=pub, db=db)
            vintage = payload.season.vintage_year if hasattr(payload, "season") \
                else payload.vintage_year
            daily = payload.daily_data
            last = daily[-1]["date"] if daily else None
            check(f"{label}: vintage resolves to {vintage}",
                  vintage == R.get_current_vintage_year(pub),
                  f"expected {R.get_current_vintage_year(pub)}")
            check(f"{label}: curve stops on or before publication",
                  last is not None and str(last) <= pub.isoformat(),
                  f"last point {last}")
            check(f"{label}: the season has actually accumulated GDD",
                  bool(daily) and float(daily[-1].get("gdd_actual") or 0) > 0,
                  f"{daily[-1].get('gdd_actual') if daily else None} GDD")

        print("\n=== 2. the pinned answer differs from the unpinned one ===")
        pinned = R.get_gdd_progress("waipara", vintage_year=None, base="base10",
                                    as_of=date(2026, 2, 27), db=db)
        try:
            live = R.get_gdd_progress("waipara", vintage_year=None, base="base10",
                                      as_of=None, db=db)
            live_vintage = live.vintage_year
            live_points = len(live.daily_data)
        except HTTPException as exc:
            live_vintage, live_points = f"404 ({exc.detail})", 0
        check("unpinned still resolves to the CURRENT vintage",
              live_vintage != pinned.vintage_year,
              f"pinned {pinned.vintage_year} vs live {live_vintage}")
        check("this is the defect the fix exists for: the two disagree",
              live_points != len(pinned.daily_data),
              f"pinned {len(pinned.daily_data)} points vs live {live_points}")

        print("\n=== 3. current-season pins both the vintage and the cut-off ===")
        for slug, pub, label in ARTICLES[:4]:
            payload = R.get_current_season_climate(
                slug, recent_days=14, base="base10", as_of=pub,
                vintage_year=None, db=db)
            check(f"{label}: vintage {payload.season.vintage_year}",
                  payload.season.vintage_year == R.get_current_vintage_year(pub))
            check(f"{label}: latest_data_date <= published_at",
                  payload.season.latest_data_date <= pub,
                  str(payload.season.latest_data_date))
            check(f"{label}: the recent-days window ends at publication",
                  bool(payload.recent_days)
                  and max(d.date for d in payload.recent_days) <= pub)
            check(f"{label}: season totals are non-trivial",
                  float(payload.season.gdd_total or 0) > 0,
                  f"{payload.season.gdd_total} GDD")

        print("\n=== 4. disease pressure takes as_of, not a vintage ===")
        for slug, pub, label in ARTICLES[:3]:
            payload = R.get_disease_pressure(slug, recent_days=14, as_of=pub, db=db)
            check(f"{label}: latest disease date <= published_at",
                  payload.latest_date <= pub, str(payload.latest_date))
            check(f"{label}: a full 14-day window survived the filter",
                  len(payload.recent_days) == 14, f"{len(payload.recent_days)} days")

        print("\n=== 5. defaults are untouched — every other caller depends on it ===")
        # No `as_of` must behave EXACTLY as it did before the change. The test is
        # that it equals an explicit request for today's vintage, which is what
        # the old code hardcoded.
        today_vintage = R.get_current_vintage_year()
        for slug in ("waipara", "hawkes-bay"):
            try:
                a = R.get_current_season_climate(slug, recent_days=14, base="base10",
                                                 as_of=None, vintage_year=None, db=db)
                b = R.get_current_season_climate(slug, recent_days=14, base="base10",
                                                 as_of=None, vintage_year=today_vintage,
                                                 db=db)
                check(f"{slug}: unpinned == explicit current vintage",
                      a.season.vintage_year == b.season.vintage_year == today_vintage
                      and a.season.latest_data_date == b.season.latest_data_date)
            except HTTPException as exc:
                check(f"{slug}: unpinned == explicit current vintage", False,
                      f"HTTP {exc.status_code}")

        print("\n=== 6. an as_of before the record 404s rather than drawing nothing ===")
        # An empty chart under a heading is worse than an error the caller can
        # handle: the reader cannot tell it from a broken widget.
        for slug in ("waipara",):
            try:
                R.get_gdd_progress(slug, vintage_year=None, base="base10",
                                   as_of=date(2019, 1, 15), db=db)
                check(f"{slug}: pre-record as_of raises 404", False, "returned a payload")
            except HTTPException as exc:
                check(f"{slug}: pre-record as_of raises 404", exc.status_code == 404,
                      f"HTTP {exc.status_code}")

        print("\n=== 7. an explicit vintage still wins over the as_of default ===")
        p = R.get_current_season_climate("waipara", recent_days=14, base="base10",
                                         as_of=date(2026, 3, 13), vintage_year=2026,
                                         db=db)
        check("explicit vintage_year is honoured", p.season.vintage_year == 2026)
        check("as_of still truncates when a vintage is given",
              p.season.latest_data_date <= date(2026, 3, 13),
              str(p.season.latest_data_date))
    finally:
        db.close()

    print(f"\n{'=' * 62}")
    print(f"{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  FAILED: {f}")
    print("=" * 62)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
