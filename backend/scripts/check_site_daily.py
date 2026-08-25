"""Acceptance suite for the Pro site daily record.

    backend/venv/Scripts/python.exe backend/scripts/check_site_daily.py

No daily surface has been indexed yet — `surface_run` holds monthly, season and
records rows only — so the extraction cannot be exercised against real objects.
It is exercised against SYNTHETIC ones instead: this suite inserts daily
`surface_run` rows and a throwaway site inside a transaction, stubs the one
function that touches S3, runs the real extraction over them, and **rolls the
whole thing back**. Nothing is committed and nothing is left behind.

That covers every part of the path that can be wrong today: the `statistic IS
NULL` filter, era pinning, the variable-to-column mapping, NULL versus zero, the
upsert, and the cascade.
"""
from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv                                      # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("AWS_REGION", "ap-southeast-2")

from sqlalchemy import text                                         # noqa: E402

from db.models.insights_site import InsightsSite                    # noqa: E402
from db.session import SessionLocal                                 # noqa: E402
from services import insights_site_service as svc                   # noqa: E402

PASS, FAIL = [], []

D1 = date(2026, 9, 1)
D2 = date(2026, 9, 2)
ARCHIVE_V = "tps-2.0.0-ridge"
LIVE_V = "tps-2.0.0-ridge-db"


def check(label: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(label)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")


def seed_surface(db, variable, day, key, version=LIVE_V, statistic=None,
                 granularity="daily", created=None):
    db.execute(text("""
        INSERT INTO surface_run
            (variable, granularity, statistic, valid_at, resolution_m,
             model_version, s3_key, status, created_at)
        VALUES (:v, :g, :s, :d, 500, :mv, :k, 'ok', :c)
    """), {"v": variable, "g": granularity, "s": statistic, "d": day,
           "mv": version, "k": key,
           "c": created or datetime.now(timezone.utc)})


def main() -> int:
    db = SessionLocal()
    try:
        # --- 1. the world as it actually is today -----------------------------
        print("")
        print("1. against the real index")
        recent = date.today() - timedelta(days=1)
        live = svc.daily_surfaces(db, recent - timedelta(days=30), recent)

        # These two used to assert that NO daily surface existed — true when
        # they were written, and false as of 2026-08-24: the live pipeline began
        # publishing dailies on 2026-08-01. Asserting an absence is only ever
        # right until someone fills it, so both now assert the BEHAVIOUR that
        # was actually being protected — that an empty window is reported rather
        # than raised — and work whether or not surfaces are there.
        n_daily = db.execute(text(
            "SELECT count(*) FROM surface_run WHERE granularity = 'daily'"
        )).scalar()
        print(f"        ({n_daily} daily surfaces indexed; "
              f"{len(live)} in the last 30 days)")
        check("daily_surfaces returns a list either way, never raises",
              isinstance(live, list))

        site = (db.query(InsightsSite)
                  .filter(InsightsSite.status == "ready").order_by(InsightsSite.id)
                  .first())
        if site:
            # A window that is genuinely empty: before the archive begins, so
            # this stays a test of the empty path however far the live record
            # extends.
            empty = svc.populate_daily(db, site, date(1980, 1, 1),
                                       date(1980, 1, 8))
            check("an empty window is a stated condition, not a failure",
                  empty["written"] == 0 and empty["reason"] is not None,
                  empty["reason"] or "")

            got = svc.populate_daily(db, site, recent - timedelta(days=7), recent)
            check("a real window either writes rows or says why",
                  got["written"] > 0 or got.get("reason"),
                  f"wrote {got['written']}, reason {got.get('reason')!r}")
            if got["written"]:
                print(f"        (live window wrote {got['written']} days — the "
                      f"Pro daily panel has data for the first time)")

        # --- 2. synthetic surfaces, rolled back at the end --------------------
        print("")
        print("2. extraction over synthetic surfaces (rolled back)")
        owner = db.execute(text(
            "SELECT id FROM public_users ORDER BY id LIMIT 1")).scalar()
        temp_site_id = db.execute(text("""
            INSERT INTO insights_site
                (public_user_id, slot_index, label, latitude, longitude,
                 grid_row, grid_col, status)
            VALUES (:u, 99, 'check_site_daily throwaway', -41.5, 173.9,
                    100, 200, 'ready')
            RETURNING id
        """), {"u": owner}).scalar()
        temp_site = db.query(InsightsSite).filter(
            InsightsSite.id == temp_site_id).first()

        for variable in ("temp_min", "temp_max", "temp_mean", "rainfall"):
            seed_surface(db, variable, D1, f"synthetic/{variable}/{D1}.tif")
        # Day 2 deliberately has no rainfall surface — a real gap, and it must
        # come back NULL rather than 0.
        for variable in ("temp_min", "temp_max", "temp_mean"):
            seed_surface(db, variable, D2, f"synthetic/{variable}/{D2}.tif")
        # A monthly row on the same day and variable. It must NOT be picked up:
        # it carries a statistic and is an aggregate, not a value.
        seed_surface(db, "temp_mean", D1, "synthetic/monthly.tif",
                     statistic="mean", granularity="monthly")

        found = svc.daily_surfaces(db, D1, D2)
        check("the daily filter finds exactly the daily objects",
              len(found) == 7, f"{len(found)} found")
        check("a monthly object on the same day is not swept in",
              all(r["s3_key"] != "synthetic/monthly.tif" for r in found))

        # Stub the only function that touches S3. The value is keyed by variable
        # so the variable-to-column mapping is provable rather than assumed.
        values = {"temp_min": 2.5, "temp_max": 18.0,
                  "temp_mean": 10.25, "rainfall": 7.5}
        original = svc._read_cell
        svc._read_cell = lambda rec, r, c: values[rec["variable"]]
        try:
            rows = svc.extract_daily(db, temp_site, D1, D2)
            check("one row per day", len(rows) == 2, f"{len(rows)} rows")
            by_day = {r["date"]: r for r in rows}
            one = by_day.get(D1, {})
            check("each variable lands in its own column",
                  one.get("temp_min") == 2.5 and one.get("temp_max") == 18.0
                  and one.get("temp_mean") == 10.25
                  and one.get("rainfall_mm") == 7.5)
            two = by_day.get(D2, {})
            check("a day with no rainfall surface reads NULL, not 0",
                  two.get("rainfall_mm") is None
                  and two.get("temp_mean") == 10.25)
            check("the era is recorded on the row",
                  one.get("model_version") == LIVE_V)

            written = svc.upsert_daily(db, rows)
            check("both days are written", written == 2)
            stored = db.execute(text("""
                SELECT count(*) FROM insights_site_daily WHERE site_id = :s
            """), {"s": temp_site_id}).scalar()
            check("and land in the table", stored == 2, f"{stored} rows")

            # --- 3. the re-fit ------------------------------------------------
            print("")
            print("3. a weekly re-fit corrects rather than duplicates")
            # A re-fit CANNOT add a second row: uq_surface_run_timestep is
            # unique on (variable, granularity, valid_at, resolution_m,
            # model_version) where the statistic is NULL. It replaces what the
            # existing row points at. So the re-fit is simulated the way it
            # really happens — one index row, different content behind it.
            db.execute(text("""
                UPDATE surface_run SET s3_key = 'synthetic/refit.tif'
                 WHERE granularity = 'daily' AND variable = 'temp_mean'
                   AND valid_at = :d AND model_version = :mv
            """), {"d": D1, "mv": LIVE_V})
            refound = svc.daily_surfaces(db, D1, D1)
            mean_rows = [r for r in refound if r["variable"] == "temp_mean"]
            check("a re-fit day still yields exactly ONE object",
                  len(mean_rows) == 1
                  and mean_rows[0]["s3_key"] == "synthetic/refit.tif",
                  str([r["s3_key"] for r in mean_rows]))

            svc._read_cell = lambda rec, r, c: (
                99.0 if rec["s3_key"] == "synthetic/refit.tif"
                else values[rec["variable"]])
            svc.upsert_daily(db, svc.extract_daily(db, temp_site, D1, D1))
            after = db.execute(text("""
                SELECT count(*) AS n,
                       max(temp_mean) FILTER (WHERE date = :d) AS mean
                  FROM insights_site_daily WHERE site_id = :s
            """), {"s": temp_site_id, "d": D1}).mappings().first()
            check("the row count does not grow", after["n"] == 2, f"{after['n']}")
            check("and the value is CORRECTED to the re-fit",
                  after["mean"] == 99.0, str(after["mean"]))

            # --- 4. era separation --------------------------------------------
            print("")
            print("4. the archive era is not mixed into a live season")
            # The ONLY way a day carries two objects for one variable is two
            # model versions. Reading whichever was written last would report
            # the measured provenance offset (tmean -0.27 C) as weather.
            seed_surface(db, "temp_min", D1, "synthetic/archive.tif",
                         version=ARCHIVE_V,
                         created=datetime.now(timezone.utc) + timedelta(hours=2))
            pinned = svc.daily_surfaces(db, D1, D1)
            check("a NEWER archive-era object is ignored while the era is pinned",
                  all(r["model_version"] == LIVE_V for r in pinned),
                  str(sorted({r["model_version"] for r in pinned})))
            check("and the live object is still the one returned",
                  any(r["s3_key"] == "synthetic/refit.tif" for r in pinned))

            unpinned = svc.daily_surfaces(db, D1, D1, model_version=None)
            tmin = [r for r in unpinned if r["variable"] == "temp_min"]
            check("lifting the pin takes the newest across eras, for diagnostics",
                  len(tmin) == 1 and tmin[0]["model_version"] == ARCHIVE_V,
                  str([(r["model_version"], r["s3_key"]) for r in tmin]))

            svc.upsert_daily(db, svc.extract_daily(db, temp_site, D1, D1))
            mv = db.execute(text("""
                SELECT model_version FROM insights_site_daily
                 WHERE site_id = :s AND date = :d
            """), {"s": temp_site_id, "d": D1}).scalar()
            check("the stored row names exactly one era", mv == LIVE_V, str(mv))

            # --- 5. cascade ---------------------------------------------------
            print("")
            print("5. cascade")
            db.execute(text("DELETE FROM insights_site WHERE id = :s"),
                       {"s": temp_site_id})
            left = db.execute(text("""
                SELECT count(*) FROM insights_site_daily WHERE site_id = :s
            """), {"s": temp_site_id}).scalar()
            check("deleting a site takes its daily record with it", left == 0,
                  f"{left} left")
        finally:
            svc._read_cell = original

        return report()
    finally:
        # Nothing this suite did survives. The synthetic surface_run rows in
        # particular MUST NOT: a fake daily object left in the index would be
        # read by the real extraction on the next run.
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
