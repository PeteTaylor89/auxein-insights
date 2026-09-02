"""The three site registers agree: /site/active, the report, and attendance.

"Who is on site" was answered by visitors + contractors only until 2026-09-02.
Staff sign-ons (SiteAttendance) are the third register, and the number is read
carefully exactly once — during an evacuation — so a missing person is the
failure that matters.

Runs against the configured database, READ ONLY except for one transaction that
is rolled back. Run with the backend venv:
    backend/venv/Scripts/python.exe backend/scripts/check_site_registers.py
"""
from __future__ import annotations
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(REPO / ".env")

from sqlalchemy import text  # noqa: E402
from db.session import SessionLocal  # noqa: E402
from api.v1 import site as site_api  # noqa: E402
from api.v1 import reports as reports_api  # noqa: E402
from db.models.user import User  # noqa: E402
from db.models.site_attendance import SiteAttendance  # noqa: E402
from schemas.report import SiteAccessSummary, VisitRow  # noqa: E402

ok = True
def check(label, cond, extra=""):
    global ok
    ok = ok and bool(cond)
    print(f"  {'PASS' if cond else 'FAIL'}  {label}{('  ' + str(extra)) if extra else ''}")

print("== the shapes declare staff ==")
check("VisitRow documents the staff kind", "staff" in (VisitRow.model_fields["kind"].description or "")
      or "staff" in Path(REPO / "backend/schemas/report.py").read_text(encoding="utf-8"))
check("SiteAccessSummary has staff_attendances", "staff_attendances" in SiteAccessSummary.model_fields)

db = SessionLocal()
try:
    # Pick an admin whose company can actually reach a property — several
    # companies own none, and an admin of one of those exercises nothing.
    admin_id, prop_id = (db.execute(text("""
        select u.id, p.id
        from users u
        join properties p
          on p.owner_company_id = u.company_id
        where u.user_type = 'company_admin'
        limit 1
    """)).first() or (None, None))
    admin = db.query(User).filter(User.id == admin_id).first() if admin_id else None
    check("found a company_admin whose company owns a property", admin is not None,
          f"user {admin.id} company {admin.company_id} property {prop_id}" if admin else "")
    if admin is None:
        raise SystemExit(1)

    print("== baseline, before anything is written ==")
    active0 = site_api.list_on_site(db=db, current_user=admin)
    check("/site/active reports a users_count", "users_count" in active0, sorted(active0)[:6])
    # The mobile pills derive their counts from `items`, so a server count that
    # disagrees with the array is a pill that contradicts the list under it.
    for t, key in (("visitor", "visitors_count"), ("contractor", "contractors_count"),
                   ("user", "users_count")):
        derived = len([i for i in active0["items"] if i["type"] == t])
        check(f"{key} matches the {t} items", active0[key] == derived,
              f"{active0[key]} vs {derived}")
    check("every item declares a type the UI knows",
          all(i["type"] in ("visitor", "contractor", "user") for i in active0["items"]),
          sorted({i["type"] for i in active0["items"]}))
    check("staff items carry a property name",
          all(i.get("property_name") for i in active0["items"] if i["type"] == "user"),
          [i.get("property_name") for i in active0["items"] if i["type"] == "user"])
    check("counts add up to total",
          active0["visitors_count"] + active0["contractors_count"] + active0["users_count"]
          == active0["total"],
          active0["total"])
    summary0 = reports_api.site_access_summary(None, None, None, db, admin)
    # Relative to whatever is already there. This DB has live sign-ons in it,
    # so an absolute 0 here asserts the tester's habits, not the code.
    base_staff = summary0.staff_attendances
    base_staff_rows = len([v for v in summary0.visits if v.kind == "staff"])
    base_never_out = summary0.never_signed_out
    base_rows = db.execute(text("select count(*) from site_attendance")).scalar()
    print(f"    baseline: {base_staff} staff attendances, {base_rows} rows in the table")

    print("== an open attendance shows up in BOTH, then rolls back ==")
    conn = db.connection()
    tx = conn.begin_nested()

    check("the property is in the admin's visible scope", prop_id is not None, prop_id)

    if prop_id:
        row = SiteAttendance(
            company_id=admin.company_id,
            user_id=admin.id,
            property_id=prop_id,
            signed_in_at=datetime.now(timezone.utc) - timedelta(minutes=42),
        )
        db.add(row)
        db.flush()

        active1 = site_api.list_on_site(db=db, current_user=admin)
        check("/site/active users_count went up", active1["users_count"] == active0["users_count"] + 1,
              active1["users_count"])
        check("/site/active total went up", active1["total"] == active0["total"] + 1)
        mine = [i for i in active1["items"] if i["type"] == "user" and i["id"] == row.id]
        check("the staff item is present exactly once", len(mine) == 1, len(mine))
        if mine:
            it = mine[0]
            check("it carries a name", bool(it["name"]), it["name"])
            check("it carries the property", it["property_id"] == prop_id, it["property_name"])
            check("duration is computed", it["duration_mins"] is not None
                  and 40 <= it["duration_mins"] <= 45, it["duration_mins"])
            check("no purpose is invented for staff", it["purpose"] is None)

        summary1 = reports_api.site_access_summary(None, None, None, db, admin)
        check("report counts one more attendance",
              summary1.staff_attendances == base_staff + 1,
              f"{base_staff} -> {summary1.staff_attendances}")
        staff_rows = [v for v in summary1.visits if v.kind == "staff"]
        check("one more staff VisitRow is emitted",
              len(staff_rows) == base_staff_rows + 1,
              f"{base_staff_rows} -> {len(staff_rows)}")
        mine_rows = [v for v in staff_rows if v.id == row.id]
        check("and it is the one just written", len(mine_rows) == 1)
        if mine_rows:
            v = mine_rows[0]
            check("staff row is NOT counted as inducted/uninducted", v.inducted is None)
            check("staff row has no equipment state", v.equipment_cleaned is None)
        check("still open counts toward never_signed_out",
              summary1.never_signed_out == base_never_out + 1,
              f"{base_never_out} -> {summary1.never_signed_out}")
        check("uninducted count did NOT move (staff are not guests)",
              summary1.not_inducted == summary0.not_inducted)
        check("equipment count did NOT move",
              summary1.equipment_not_cleaned == summary0.equipment_not_cleaned)

    tx.rollback()

    print("== nothing persisted ==")
    left = db.execute(text("select count(*) from site_attendance")).scalar()
    check("the probe row did not persist", left == base_rows, f"{base_rows} -> {left}")
finally:
    db.close()

print()
print("ALL PASS" if ok else "FAILURES ABOVE")
sys.exit(0 if ok else 1)
