"""sat_scene.processed_at: the marker the daily satellite job skips on

Revision ID: sat_scene_processed
Revises: satellite_areas
Create Date: 2026-09-23

A `sat_scene` row has to exist before any `area_index_obs` row can reference
it, so its existence cannot double as "done": a per-area backfill (a new
on-demand area, a block whose outline changed) inserts scene rows while reading
only a handful of areas. Treating those rows as processed would make the daily
job skip the scene for every other area, silently.

`processed_at` is therefore set only by a FULL-SET run - one that read the
scene against every active area at the time - and the daily job skips on it.
Scenes a subset run touched keep `processed_at` NULL and are still read by the
next full-set run.

NULL-able column with no default: a metadata-only change on Postgres 11+, no
table rewrite.
"""
from alembic import op
import sqlalchemy as sa


revision = "sat_scene_processed"
down_revision = "satellite_areas"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sat_scene", sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("sat_scene", "processed_at")
