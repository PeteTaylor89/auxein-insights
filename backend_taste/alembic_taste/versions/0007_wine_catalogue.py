"""F3 - canonical wine catalogue: wine_ref + proposals + merge log

Revision ID: 0007_wine_catalogue
Revises: 0006_visibility_shares
Create Date: 2026-09-21

`taste.wines` is a PERSONAL row: two people tasting the same wine create two
unrelated rows, and nothing in the schema knows they mean the same bottle. That
is survivable for a solo notebook and not survivable for maps, content or social,
where a tag, a pin and a group flight all need one row that means one wine.

This adds the shared identity WITHOUT touching the personal one. `taste.wines`
keeps every field it has; it gains a nullable `wine_ref_id`. That is decision D1
("store raw and canonical, never lose either") applied to wine identity, and it
is already how geography works here: the discrete `geo_*` text the user typed,
plus a loose `geo_ref_id` into the server-owned `regions` tree.

THIS MIGRATION MOVES NO DATA. Every existing row keeps working with
`wine_ref_id` NULL, which is an ordinary state and not a broken one. The
catalogue fills in as wines are saved, and existing rows are linked when their
identity is promoted (`backlink` in services/wine_catalogue.py).

SEPARATE, AND NOT DONE HERE: the 27 prod wines with the path jammed into
`geo_country` (pre-07-03 separator bug). That is a data repair with judgement in
it, so it is a reviewable script with a dry run --
`scripts/repair_wine_geo.py`, `--apply` to write -- rather than 27 UPDATEs
buried in a migration.

Measured on prod 2026-09-21 before writing: 68 wines, 68 notes, 0 orphans, 2
duplicate identities, 64 of 64 geo_ref_ids resolving against taste.regions.
"""
from alembic import op
import sqlalchemy as sa

from db.models import WineMergeLog, WineProposal, WineRef

revision = "0007_wine_catalogue"
down_revision = "0006_visibility_shares"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    return bool(bind.execute(sa.text("""
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'taste' AND table_name = :t AND column_name = :c
    """), {"t": table, "c": column}).first())


def upgrade() -> None:
    bind = op.get_bind()

    WineRef.__table__.create(bind=bind, checkfirst=True)
    WineProposal.__table__.create(bind=bind, checkfirst=True)
    WineMergeLog.__table__.create(bind=bind, checkfirst=True)

    # Guarded for the same reason as 0006: migration 0002 builds its tables from
    # the LIVE model classes, so a database migrated from scratch arrives here
    # with the column already present while prod does not.
    if not _has_column(bind, "wines", "wine_ref_id"):
        op.add_column("wines", sa.Column("wine_ref_id", sa.String(), nullable=True), schema="taste")
        op.create_index("ix_wines_wine_ref_id", "wines", ["wine_ref_id"], schema="taste")

    print("[0007] canonical wine catalogue created; no rows moved")


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "wines", "wine_ref_id"):
        op.drop_index("ix_wines_wine_ref_id", table_name="wines", schema="taste")
        op.drop_column("wines", "wine_ref_id", schema="taste")
    WineMergeLog.__table__.drop(bind=bind, checkfirst=True)
    WineProposal.__table__.drop(bind=bind, checkfirst=True)
    WineRef.__table__.drop(bind=bind, checkfirst=True)
