"""F4 - reports, soft-hide, moderation log, durable rate limits

Revision ID: 0008_moderation
Revises: 0007_wine_catalogue
Create Date: 2026-09-21

F2 made rows shareable and public. This is the other half of that: once someone
else can see your row, there has to be a way to say so, a way to act on it, and
a record of what was done.

Four things:
  - `taste.report`        - a flag raised by a user, on a row or an account;
  - `taste.moderation_log`- append-only, one entry per moderator action;
  - `taste.rate_limit`    - a durable counter, replacing the in-process dicts
                            in api/auth.py that reset on deploy and were
                            per-instance (two instances = two budgets);
  - `hidden_at`/`hidden_reason` on the five shareable entities.

HIDING IS NOT DELETING AND NOT A VISIBILITY CHANGE. The owner keeps seeing their
own row together with the reason, because content that vanishes without
explanation reads as a broken product rather than a decision. `visibility` is
left untouched, so unhiding restores what the owner chose instead of silently
making a public row private.

Suspension needs no new column: `users.status` and `users.token_version` shipped
in 0005 and already take effect on the next request. F4 adds the route and the
log entry, not the mechanism.
"""
from alembic import op
import sqlalchemy as sa

from db.models import ModerationLog, RateLimit, Report

revision = "0008_moderation"
down_revision = "0007_wine_catalogue"
branch_labels = None
depends_on = None

# Exactly the entities that carry `visibility` - the set that can be shared is
# the set that can be hidden.
HIDEABLE_TABLES = ("templates", "events", "wines", "notes", "flights")


def _has_column(bind, table: str, column: str) -> bool:
    return bool(bind.execute(sa.text("""
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'taste' AND table_name = :t AND column_name = :c
    """), {"t": table, "c": column}).first())


def upgrade() -> None:
    bind = op.get_bind()

    Report.__table__.create(bind=bind, checkfirst=True)
    ModerationLog.__table__.create(bind=bind, checkfirst=True)
    RateLimit.__table__.create(bind=bind, checkfirst=True)

    for table in HIDEABLE_TABLES:
        # Guarded for the same reason as 0006 and 0007: migration 0002 builds
        # its tables from the LIVE model classes, so a database migrated from
        # scratch arrives here already holding these columns.
        if not _has_column(bind, table, "hidden_at"):
            op.add_column(table, sa.Column("hidden_at", sa.DateTime(timezone=True)), schema="taste")
            op.add_column(table, sa.Column("hidden_reason", sa.Text()), schema="taste")
        # Partial: hidden rows are the rare case, and this index exists to make
        # "what is currently hidden" cheap without charging every other row for it.
        op.create_index(
            f"ix_{table}_hidden",
            table,
            ["hidden_at"],
            schema="taste",
            postgresql_where=sa.text("hidden_at IS NOT NULL"),
        )

    print("[0008] moderation tables created; no rows hidden")


def downgrade() -> None:
    bind = op.get_bind()
    for table in HIDEABLE_TABLES:
        op.drop_index(f"ix_{table}_hidden", table_name=table, schema="taste")
        if _has_column(bind, table, "hidden_at"):
            op.drop_column(table, "hidden_reason", schema="taste")
            op.drop_column(table, "hidden_at", schema="taste")
    RateLimit.__table__.drop(bind=bind, checkfirst=True)
    ModerationLog.__table__.drop(bind=bind, checkfirst=True)
    Report.__table__.drop(bind=bind, checkfirst=True)
