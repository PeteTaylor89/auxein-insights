"""Re-classify WorkSafe notifiability for existing incidents.

Runs the authoritative Incident.determine_notifiability() engine
(backend/db/models/incident.py) over every incident and updates
`is_notifiable` / `notifiable_type` where the result has changed.

Historical incidents keep their stored classification until edited, so this
brings older rows in line with the corrected engine (2026-05-30 audit).

Deliberately leaves alone:
  - worksafe_notified / worksafe_notification_date / worksafe_reference
    (these are recorded facts about what a human actually did)
  - investigation_due_date (re-basing it on now() would falsify the clock)

Usage:
    cd backend
    python scripts/backfill_incident_notifiability.py            # dry run (default)
    python scripts/backfill_incident_notifiability.py --apply    # commit changes
"""
import sys
import os
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from db.session import SessionLocal
from db.models.incident import Incident


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit the changes. Without this flag the script is a dry run.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        incidents = db.query(Incident).order_by(Incident.id).all()
        changed = []
        notified_but_now_not = []

        for inc in incidents:
            old = (inc.is_notifiable, inc.notifiable_type)
            inc.determine_notifiability()
            new = (inc.is_notifiable, inc.notifiable_type)
            if old != new:
                changed.append((inc, old, new))
                # Flag rows already notified that no longer classify as
                # notifiable — worth a human glance, not auto-reverted.
                if old[0] and not new[0] and inc.worksafe_notified:
                    notified_but_now_not.append(inc)

        print(f"Scanned {len(incidents)} incident(s); {len(changed)} would change.\n")
        for inc, old, new in changed:
            print(
                f"  {inc.incident_number} (id={inc.id}, sev={inc.severity}, "
                f"type={inc.incident_type}, injury={inc.injury_type}, "
                f"body={inc.body_part_affected})"
            )
            print(f"      is_notifiable: {old[0]} -> {new[0]}")
            print(f"      notifiable_type: {old[1]!r} -> {new[1]!r}")

        if notified_but_now_not:
            print(
                f"\n  NOTE: {len(notified_but_now_not)} incident(s) were already "
                "marked WorkSafe-notified but no longer classify as notifiable. "
                "Left as recomputed; review manually:"
            )
            for inc in notified_but_now_not:
                print(f"      - {inc.incident_number} (id={inc.id})")

        if not changed:
            print("Nothing to do.")
            db.rollback()
            return

        if args.apply:
            db.commit()
            print(f"\nApplied: updated {len(changed)} incident(s).")
        else:
            db.rollback()
            print(
                f"\nDry run — no changes written. Re-run with --apply to commit "
                f"{len(changed)} change(s)."
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
