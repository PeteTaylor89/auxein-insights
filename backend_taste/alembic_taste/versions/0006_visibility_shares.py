"""F2 - per-row visibility + a polymorphic grant table

Revision ID: 0006_visibility_shares
Revises: 0005_taste_users
Create Date: 2026-09-21

Today `api/crud.py` filters every row by `user_id`, and that filter is the ENTIRE
authorisation model of this service. It cannot express a public map layer, a note
shared with a study group, or a layer forked from someone else's work. Maps,
content and social all need it replaced, so it gets replaced once, here, rather
than three times badly.

Two mechanisms, not one, because neither derives from the other:
  - `visibility` is the row's own default reach (private / link / group / public);
  - `taste.shares` is a named exception on top of it (this user may edit; that
    group may comment).
A layer can be public AND have two named editors.

WHAT THIS MIGRATION DOES NOT DO: it does not rewrite `make_crud_router`. The
columns land first and default to `private`, which is exactly today's behaviour,
so this migration is a no-op for every existing row and can ship ahead of the
code that reads it.

THE ONE BEHAVIOUR CHANGE is to builtin templates. A builtin has been marked by
`user_id IS NULL` and special-cased with `owner_optional=True` in the CRUD
factory. That is a private visibility model wearing a disguise, so the backfill
restates it in the general one: builtins become `visibility='public'`. The
`owner_optional` branch stays in the code for now and is removed when
`resolve_access()` lands - deleting it here would break the live API mid-migration.
"""
from alembic import op
import sqlalchemy as sa

from db.models import Share

revision = "0006_visibility_shares"
down_revision = "0005_taste_users"
branch_labels = None
depends_on = None

# Entities that get their own reach. `photos` is deliberately NOT here: a photo
# is visible exactly when its note is, and a second source of truth for that is a
# leak waiting for the two to disagree. `vocab` is a user's private word list and
# `regions` is global reference data - neither is shareable.
SHAREABLE_TABLES = ("templates", "events", "wines", "notes", "flights")

# Spelled out rather than interpolated from a tuple: this string is a CHECK
# constraint that outlives the migration, and it should read as the SQL it is.
VISIBILITY_CHECK = "visibility IN ('private', 'link', 'group', 'public')"


def _has_column(bind, table: str, column: str) -> bool:
    return bool(bind.execute(sa.text("""
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'taste' AND table_name = :t AND column_name = :c
    """), {"t": table, "c": column}).first())


def upgrade() -> None:
    bind = op.get_bind()

    # The add_columns are guarded because migration 0002 builds its tables from
    # the LIVE model classes (`Model.__table__.create`), which is this repo's
    # house style. The moment VisibilityMixin was added to those models, 0002
    # started creating the two columns itself — so a database migrated from
    # scratch arrives here already holding them, while prod (whose tables were
    # created before the mixin existed) does not. Both must reach the same
    # place. This is the standing cost of migrations that import live models;
    # it is not specific to this phase.
    for table in SHAREABLE_TABLES:
        if not _has_column(bind, table, "visibility"):
            op.add_column(
                table,
                sa.Column("visibility", sa.String(10), nullable=False,
                          server_default="private"),
                schema="taste",
            )
        if not _has_column(bind, table, "share_slug"):
            op.add_column(
                table,
                sa.Column("share_slug", sa.String(32), nullable=True),
                schema="taste",
            )
        # VARCHAR + CHECK rather than a Postgres ENUM: this list will grow, and
        # adding a value to a native enum is a migration that takes a lock.
        op.create_check_constraint(
            "ck_%s_visibility" % table,
            table,
            VISIBILITY_CHECK,
            schema="taste",
        )
        # Unique so a slug can never address two rows, and partial so the
        # thousands of private rows carrying NULL cost nothing to index.
        op.create_index(
            "uq_%s_share_slug" % table,
            table,
            ["share_slug"],
            unique=True,
            schema="taste",
            postgresql_where=sa.text("share_slug IS NOT NULL"),
        )
        # The public read path: "fetch the row this slug names". Without the
        # visibility predicate a revoked share would still resolve.
        op.create_index(
            "ix_%s_visibility" % table,
            table,
            ["visibility"],
            schema="taste",
            postgresql_where=sa.text("visibility <> 'private'"),
        )

    Share.__table__.create(bind=bind, checkfirst=True)

    # Restate the builtin-template special case in the general model.
    n = bind.execute(sa.text("""
        UPDATE taste.templates SET visibility = 'public' WHERE user_id IS NULL
    """)).rowcount
    print("[0006] %s builtin template(s) marked public" % n)


def downgrade() -> None:
    bind = op.get_bind()
    Share.__table__.drop(bind=bind, checkfirst=True)
    for table in SHAREABLE_TABLES:
        op.drop_index("ix_%s_visibility" % table, table_name=table, schema="taste")
        op.drop_index("uq_%s_share_slug" % table, table_name=table, schema="taste")
        op.drop_constraint("ck_%s_visibility" % table, table, schema="taste", type_="check")
        op.drop_column(table, "share_slug", schema="taste")
        op.drop_column(table, "visibility", schema="taste")
