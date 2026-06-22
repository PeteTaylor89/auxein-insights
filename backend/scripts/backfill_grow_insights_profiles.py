"""Backfill / migrate Insights projection rows for Grow users (Phase 2).

Provisions a linked public_users row for chosen Grow users via
ensure_insights_profile (link -> adopt-by-email -> create). Idempotent: re-runs
skip already-linked users and never duplicate an existing email.

Eligibility mirrors the get_insights_user gate: active, non-deleted,
non-contractor. Use the filters / interactive prompt to skip test accounts.

Per-user action shown before migrating:
  linked  already has a projection row (no-op)
  adopt   matches an existing self-signup row by email -> links it; their
          existing Insights PASSWORD IS KEPT (Grow password is never copied)
  create  fresh password-less projection (SSO-only; can't password-login)

Run after `alembic upgrade head` (grow_insights_link):

    cd backend
    # Preview everyone, no writes:
    python scripts/backfill_grow_insights_profiles.py --dry-run
    # Interactive — choose per user (default):
    python scripts/backfill_grow_insights_profiles.py
    # Migrate everyone non-interactively:
    python scripts/backfill_grow_insights_profiles.py --all
    # Only specific users / skip test accounts:
    python scripts/backfill_grow_insights_profiles.py --ids 12,15,18
    python scripts/backfill_grow_insights_profiles.py --emails a@x.co,b@y.co
    python scripts/backfill_grow_insights_profiles.py --exclude-domain example.com
"""
import sys, os, argparse
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from db.session import SessionLocal
from db.models.user import User
from services.insights_profile import ensure_insights_profile, preview_insights_action


def parse_args():
    p = argparse.ArgumentParser(description="Migrate Grow users into Insights.")
    p.add_argument("--dry-run", action="store_true",
                   help="List candidates and the action each would get; write nothing.")
    p.add_argument("--all", action="store_true",
                   help="Migrate every candidate without prompting.")
    p.add_argument("--ids", help="Comma-separated Grow user ids to include (others skipped).")
    p.add_argument("--emails", help="Comma-separated emails to include (others skipped).")
    p.add_argument("--exclude-emails", help="Comma-separated emails to skip.")
    p.add_argument("--exclude-domain", help="Skip users whose email domain matches (e.g. example.com).")
    p.add_argument("--domain", help="Include only users whose email domain matches.")
    return p.parse_args()


def csv_set(val, lower=False):
    if not val:
        return None
    items = [x.strip() for x in val.split(",") if x.strip()]
    return {x.lower() for x in items} if lower else set(items)


def matches_filters(u, args, include_ids, include_emails, exclude_emails):
    email = (u.email or "").lower()
    domain = email.split("@")[-1] if "@" in email else ""
    if include_ids is not None and str(u.id) not in include_ids:
        return False
    if include_emails is not None and email not in include_emails:
        return False
    if exclude_emails is not None and email in exclude_emails:
        return False
    if args.domain and domain != args.domain.lower():
        return False
    if args.exclude_domain and domain == args.exclude_domain.lower():
        return False
    return True


def main():
    args = parse_args()
    include_ids = csv_set(args.ids)
    include_emails = csv_set(args.emails, lower=True)
    exclude_emails = csv_set(args.exclude_emails, lower=True)

    db = SessionLocal()
    try:
        candidates = [
            u for u in db.query(User).filter(
                User.user_type != "contractor",
                User.is_active == True,    # noqa: E712
                User.deleted_at == None,   # noqa: E711
            ).order_by(User.id).all()
            if matches_filters(u, args, include_ids, include_emails, exclude_emails)
        ]

        if not candidates:
            print("No Grow users matched the filters.")
            return

        print(f"{len(candidates)} candidate Grow user(s):\n")
        actions = {}
        for u in candidates:
            action, existing = preview_insights_action(db, u)
            actions[u.id] = action
            print(f"  [{action:>6}] id={u.id:<5} {u.email:<40} "
                  f"{(u.first_name or '') + ' ' + (u.last_name or '')}".rstrip())

        if args.dry_run:
            counts = {a: sum(1 for v in actions.values() if v == a) for a in ("linked", "adopt", "create")}
            print(f"\nDry run — no writes. Would: {counts['create']} create, "
                  f"{counts['adopt']} adopt, {counts['linked']} already-linked.")
            return

        created = adopted = linked = skipped = 0
        yes_to_all = args.all

        for u in candidates:
            action = actions[u.id]
            if action == "linked":
                linked += 1
                continue  # nothing to do

            if not yes_to_all:
                note = " (keeps existing Insights password)" if action == "adopt" else ""
                ans = input(
                    f"Migrate id={u.id} {u.email} [{action}{note}]? "
                    f"[y]es / [n]o / [a]ll / [q]uit: "
                ).strip().lower()
                if ans in ("q", "quit"):
                    print("Quitting; committed migrations are kept.")
                    break
                if ans in ("a", "all"):
                    yes_to_all = True
                elif ans not in ("y", "yes"):
                    skipped += 1
                    continue

            ensure_insights_profile(db, u)
            db.commit()  # per-user: resumable, never loses prior progress
            if action == "create":
                created += 1
            else:
                adopted += 1
            print(f"  migrated id={u.id} ({action})")

        print(
            f"\nDone: {created} created, {adopted} adopted-by-email, "
            f"{linked} already-linked (no-op), {skipped} skipped."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
