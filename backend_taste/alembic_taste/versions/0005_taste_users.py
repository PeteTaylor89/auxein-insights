"""F1 - Taste's own user table + revocable sessions; re-key rows off public_users

Revision ID: 0005_taste_users
Revises: 0004_vocab
Create Date: 2026-09-21

Taste stops borrowing Insights' identity here.

Until now `core/auth.py` decoded the Insights `public_access` JWT with the SHARED
SECRET_KEY and returned `public_users.id` as a loose int. That made three things
true that the platform plan cannot live with: Taste had no user row to hang a
handle, avatar, role or suspension off; an Insights token was automatically a
Taste token; and a Taste session could not be revoked.

This migration gives Taste its own `users` table in its own id space, moves every
existing row onto it, and records where each account came from in
`external_auth_id` - the seam BUILD_SPEC story 7.1 asked for. Insights is reached
from here on through an external bridge API, not a shared secret and not a
cross-schema read.

ONE-TIME CROSS-SCHEMA READ, deliberately: the backfill copies email and
`hashed_password` out of `public.public_users` so existing people keep their
password (both services hash with passlib bcrypt, so the digest is portable
verbatim). It is guarded by `to_regclass` and degrades to a placeholder row on a
database that has no `public_users` - a local dev DB, or Taste running somewhere
Insights does not. After this migration nothing in `backend_taste` reads that
table again.

SIZE OF THE MOVE, measured on prod 2026-09-21 before writing this:
  templates 3 - wines 68 - notes 68 - flights 12 - vocab 35 - events 0 - photos 0
  ONE distinct user_id (10). 186 rows, one account, all Pete's.
This is the cheapest moment this split will ever be.
"""
from alembic import op
import sqlalchemy as sa

from db.models import RefreshToken, User

revision = "0005_taste_users"
down_revision = "0004_vocab"
branch_labels = None
depends_on = None

# Every table whose `user_id` points at an Insights `public_users.id` today.
# `templates` is in the list but its NULL rows (global builtins) must survive
# untouched - see the WHERE clause in _rekey.
OWNED_TABLES = ("templates", "events", "wines", "notes", "flights", "photos", "vocab")

EXTERNAL_SOURCE = "insights"


def _distinct_external_ids(bind) -> list:
    ids = set()
    for table in OWNED_TABLES:
        rows = bind.execute(
            sa.text("SELECT DISTINCT user_id FROM taste.%s WHERE user_id IS NOT NULL" % table)
        ).fetchall()
        ids.update(r[0] for r in rows)
    return sorted(ids)


def _rekey(bind, direction: str) -> None:
    """Move every owned row from one id space to the other.

    Written as a single UPDATE ... FROM per table, NOT a loop of per-user
    UPDATEs. With a loop, a mapping like {1 -> 2, 2 -> 1} rewrites some rows
    twice and silently hands one user another's data. A single statement
    evaluates the join against the pre-update snapshot and touches each row at
    most once, which makes the remap correct for any mapping, not just the
    one-user case that happens to be in prod today.
    """
    if direction == "forward":
        join = "u.external_auth_id", "u.id"
    else:
        join = "u.id", "u.external_auth_id"

    for table in OWNED_TABLES:
        bind.execute(sa.text("""
            UPDATE taste.{table} AS t
               SET user_id = {new}
              FROM taste.users AS u
             WHERE t.user_id = {old}
               AND t.user_id IS NOT NULL
        """.format(table=table, old=join[0], new=join[1])))


def _rekey_photo_keys(bind, direction: str) -> None:
    """Follow the re-key into the S3 key prefix.

    `api/photos.py` builds every object key as `taste/<user_id>/<note_id>/<id>.ext`
    and then GATES ACCESS with `s3_key.startswith("taste/<user_id>/")` on both
    confirm and view. So a user_id that changes without the keys changing locks
    the owner out of their own photographs with a 403 — the identity split would
    take the photo library with it.

    Prod carries ZERO photo rows today (measured 2026-09-21), so this is a no-op
    there. It is written anyway because the first environment where it is not a
    no-op will be a staging restore, and a silent 403 is a bad way to find out.

    This rewrites the DATABASE. It cannot move the S3 objects, so it prints the
    copy that has to happen alongside it.
    """
    if direction == "forward":
        old_id, new_id = "u.external_auth_id", "u.id"
    else:
        old_id, new_id = "u.id", "u.external_auth_id"

    pairs = bind.execute(sa.text("""
        SELECT DISTINCT {old} AS old_id, {new} AS new_id
          FROM taste.users u
          JOIN taste.photos p ON p.s3_key LIKE 'taste/' || {old} || '/%'
         WHERE u.external_auth_id IS NOT NULL
    """.format(old=old_id, new=new_id))).fetchall()

    if not pairs:
        return

    for old_val, new_val in pairs:
        n = bind.execute(sa.text("""
            UPDATE taste.photos
               SET s3_key = 'taste/' || :new || '/' || substring(s3_key from :cut)
             WHERE s3_key LIKE 'taste/' || :old || '/%'
        """), {"new": new_val, "old": old_val,
               "cut": len("taste/%s/" % old_val) + 1}).rowcount
        print("[0005] rewrote %s photo key(s) taste/%s/ -> taste/%s/" % (n, old_val, new_val))
        print("[0005] ACTION REQUIRED — the S3 objects have NOT moved. Run:")
        print("[0005]   aws s3 cp --recursive s3://$UPLOADS_S3_BUCKET/taste/%s/ "
              "s3://$UPLOADS_S3_BUCKET/taste/%s/" % (old_val, new_val))


def upgrade() -> None:
    bind = op.get_bind()

    User.__table__.create(bind=bind, checkfirst=True)
    RefreshToken.__table__.create(bind=bind, checkfirst=True)

    external_ids = _distinct_external_ids(bind)
    if not external_ids:
        print("[0005] no existing taste rows - nothing to backfill or re-key")
        return

    has_public_users = bind.execute(
        sa.text("SELECT to_regclass('public.public_users') IS NOT NULL")
    ).scalar()

    for ext_id in external_ids:
        row = None
        if has_public_users:
            row = bind.execute(sa.text("""
                SELECT email, hashed_password, is_verified, verified_at, created_at
                  FROM public.public_users WHERE id = :id
            """), {"id": ext_id}).mappings().first()

        if row is not None:
            email = (row["email"] or "").strip().lower()
            # A Grow-projection row in public_users carries no password (origin
            # 'grow'). Copying NULL through is correct: that account cannot
            # password-login here either, and must set one or come in over the
            # bridge. What must NOT happen is inventing a password for it.
            params = {
                "email": email,
                "pw": row["hashed_password"],
                "verified": bool(row["is_verified"]),
                "verified_at": row["verified_at"],
                "created_at": row["created_at"],
                "ext": ext_id,
                "src": EXTERNAL_SOURCE,
            }
        else:
            # No Insights table in reach. Park the account behind a reserved
            # domain rather than guess an address: .invalid can never be
            # registered or receive mail (RFC 2606), so a placeholder can never
            # quietly become a route into someone's account.
            print("[0005] WARNING: public_users unavailable - placeholder row for external id %s. "
                  "Set the real email and password before this account is used." % ext_id)
            params = {
                "email": "user-%s@taste.invalid" % ext_id,
                "pw": None,
                "verified": False,
                "verified_at": None,
                "created_at": None,
                "ext": ext_id,
                "src": EXTERNAL_SOURCE,
            }

        bind.execute(sa.text("""
            INSERT INTO taste.users
                (email, hashed_password, is_verified, verified_at, created_at,
                 external_auth_id, external_auth_source, role, status, token_version, login_count)
            VALUES
                (:email, :pw, :verified, :verified_at, COALESCE(:created_at, now()),
                 :ext, :src, 'user', 'active', 1, 0)
            ON CONFLICT (email) DO UPDATE
               SET external_auth_id = EXCLUDED.external_auth_id,
                   external_auth_source = EXCLUDED.external_auth_source
        """), params)

    _rekey(bind, "forward")
    _rekey_photo_keys(bind, "forward")

    moved = bind.execute(sa.text("SELECT count(*) FROM taste.users")).scalar()
    print("[0005] %s taste user(s) created; rows re-keyed off public_users" % moved)


def downgrade() -> None:
    bind = op.get_bind()
    # Put the external ids back before the mapping is destroyed. A user created
    # natively in Taste has no external_auth_id, so its rows cannot be mapped
    # back - the join simply skips them, which is the honest outcome: those rows
    # never had a public_users owner to return to.
    orphans = bind.execute(sa.text("""
        SELECT count(*) FROM taste.users WHERE external_auth_id IS NULL
    """)).scalar()
    if orphans:
        print("[0005] WARNING: %s user(s) have no external_auth_id; their rows keep "
              "taste-local user_ids after downgrade" % orphans)
    _rekey_photo_keys(bind, "back")
    _rekey(bind, "back")
    RefreshToken.__table__.drop(bind=bind, checkfirst=True)
    User.__table__.drop(bind=bind, checkfirst=True)
