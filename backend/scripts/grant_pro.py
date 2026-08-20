"""Grant, inspect or revoke an Insights Pro subscription.

There is no billing integration. Nothing in the product writes
`subscription_tier='pro'` — payment is arranged outside the platform and the
entitlement is switched on by an operator. `PATCH /api/v1/admin/users/{id}` is
the same action through the admin UI; this script exists because that endpoint
is not deployed yet, and because granting the first Pro account is a chicken-
and-egg problem when the admin screen itself is behind an account.

    python backend/scripts/grant_pro.py --list
    python backend/scripts/grant_pro.py pete@auxein.co.nz --quota 1
    python backend/scripts/grant_pro.py pete@auxein.co.nz --expires 2027-06-30
    python backend/scripts/grant_pro.py pete@auxein.co.nz --revoke

## Two switches, not one

`subscription_tier` decides whether somebody is Pro at all. `pro_site_quota`
decides how many saved sites they may place, and it defaults to **0** — a point
subscription is priced separately from Pro and stacks. So `--quota` is not
optional flavour: without it a new Pro subscriber opens /my-site, sees the
placement map, and is correctly refused with a 402. That is the single most
likely thing to look like a bug while testing.

## Grow users are not touched

A row with `origin='grow'` is a password-less projection of a Grow user and is
already Pro by relationship (`core.entitlements` treats tier 'grow' as Pro).
Writing 'pro' over it would claim an Insights subscription that was never sold
and would be re-written by the next SSO handshake. The script refuses. Their
quota can still be set, because a Grow customer buying a point IS a real sale.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def connect():
    from dotenv import load_dotenv
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    import psycopg2
    host = os.getenv("RDS_ENDPOINT")
    if not host:
        raise SystemExit("RDS_ENDPOINT is not set; cannot reach the database")
    return psycopg2.connect(
        host=host, port=os.getenv("RDS_PORT", "5432"),
        user=os.environ["RDS_USER"], password=os.environ["RDS_PASSWORD"],
        dbname=os.environ["RDS_DATABASE"], connect_timeout=20)


ROW = ("id, email, subscription_tier, origin, pro_site_quota, "
       "pro_started_at, pro_expires_at, is_active, is_verified")


def show(rows) -> None:
    if not rows:
        print("  (none)")
        return
    print(f"  {'id':>5}  {'email':<38} {'tier':<6} {'origin':<7} "
          f"{'quota':>5}  {'expires':<12} state")
    for r in rows:
        (uid, email, tier, origin, quota, started, expires,
         active, verified) = r
        exp = expires.date().isoformat() if expires else "open-ended"
        # An expired 'pro' is NOT Pro, and that is exactly the row an operator
        # will otherwise misread — so say it here rather than leaving it to be
        # inferred from a date.
        lapsed = (tier == "pro" and expires is not None
                  and expires <= datetime.now(timezone.utc))
        state = []
        if not active:
            state.append("INACTIVE")
        if not verified:
            state.append("unverified")
        if lapsed:
            state.append("LAPSED")
        entitled = (tier == "grow") or (tier == "pro" and not lapsed)
        state.append("pro" if entitled else "not pro")
        print(f"  {uid:>5}  {email:<38} {tier:<6} {origin:<7} {quota:>5}  "
              f"{exp:<12} {', '.join(state)}")


def main(argv: Optional[list] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("email", nargs="?", help="the subscriber's email address")
    p.add_argument("--quota", type=int,
                   help="saved sites allowed (0-10). Defaults to 0, which "
                        "means Pro with no site")
    p.add_argument("--expires", help="YYYY-MM-DD; omit for open-ended")
    p.add_argument("--revoke", action="store_true",
                   help="back to free. Keeps pro_started_at and the quota, so "
                        "the history and a re-grant both survive")
    p.add_argument("--list", action="store_true", dest="list_all",
                   help="show every non-free account and exit")
    args = p.parse_args(argv)

    cn = connect()
    cn.autocommit = False
    cur = cn.cursor()

    if args.list_all or not args.email:
        cur.execute(f"""SELECT {ROW} FROM public_users
                         WHERE subscription_tier <> 'free'
                            OR pro_site_quota > 0
                         ORDER BY subscription_tier, email""")
        print("\nAccounts that are not plain free:")
        show(cur.fetchall())
        if not args.email:
            print("\nPass an email address to grant or revoke.")
        return 0

    email = args.email.strip().lower()
    cur.execute(f"SELECT {ROW} FROM public_users WHERE lower(email) = %s",
                (email,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"no Insights account for {email!r}. They have to "
                         f"register first — Pro is granted to an account, not "
                         f"instead of one.")

    print("\nBefore:")
    show([row])
    origin = row[3]

    sets, params = [], []

    if args.revoke:
        if origin == "grow":
            raise SystemExit(
                "this is a Grow user's Insights profile; their Pro follows the "
                "Grow relationship. Revoke it in Grow, not here.")
        sets.append("subscription_tier = 'free'")
    elif origin == "grow":
        print("\n  note: origin='grow' — already Pro by relationship, tier left "
              "alone. Only the quota is settable here.")
    else:
        sets.append("subscription_tier = 'pro'")
        # First grant stamps the start; a re-grant after a lapse keeps the
        # original, because that is when they became a customer.
        sets.append("pro_started_at = COALESCE(pro_started_at, now())")

    if args.expires:
        try:
            when = datetime.strptime(args.expires, "%Y-%m-%d").replace(
                tzinfo=timezone.utc)
        except ValueError:
            raise SystemExit("--expires must be YYYY-MM-DD")
        if when <= datetime.now(timezone.utc):
            raise SystemExit(f"{args.expires} is in the past; that grants "
                             f"nothing. Use --revoke to end a subscription.")
        sets.append("pro_expires_at = %s")
        params.append(when)

    if args.quota is not None:
        if not 0 <= args.quota <= 10:
            raise SystemExit("--quota must be between 0 and 10")
        sets.append("pro_site_quota = %s")
        params.append(args.quota)

    if not sets:
        print("\nNothing to change.")
        return 0

    params.append(email)
    cur.execute(f"UPDATE public_users SET {', '.join(sets)} "
                f"WHERE lower(email) = %s", params)

    cur.execute(f"SELECT {ROW} FROM public_users WHERE lower(email) = %s",
                (email,))
    print("\nAfter:")
    show(cur.fetchall())
    cn.commit()

    if not args.revoke and args.quota in (None, 0):
        print("\n  WARNING: quota is 0, so /my-site will refuse to place a "
              "site with a 402. Re-run with --quota 1 unless that is "
              "deliberate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
