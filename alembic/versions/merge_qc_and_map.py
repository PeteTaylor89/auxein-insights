"""Merge the two heads that branched off `surface_projection_run` on 2026-08-24.

Revision ID: merge_qc_and_map
Revises: weather_daily_qc, history_surface_view
Create Date: 2026-08-24

**No DDL. This revision exists only to collapse two heads back into one.**

Two sessions branched from `surface_projection_run` within a few hours:

    surface_projection_run
    ├── country_map_outline -> history_surface_view   (Insights web)
    └── weather_daily_qc                              (ingest/QC)

Both applied cleanly and their DDL is genuinely independent — a QC audit table
on one side, a country outline plus a reporting view on the other. Nothing
conflicts, and no ordering between them matters.

What is NOT fine is leaving it there. `SELECT version_num FROM alembic_version`
returned TWO rows, which is the failure mode this platform has already been
bitten by: `alembic current` prints something that looks reasonable while
`upgrade head` fails as ambiguous and `revision --autogenerate` refuses to run.
The next person to add a migration hits it, not the people who caused it.

Merging is the standard resolution and it is reversible: downgrading this
revision simply restores the two heads.
"""
from alembic import op  # noqa: F401  (imported for consistency; no DDL here)


revision = 'merge_qc_and_map'
down_revision = ('weather_daily_qc', 'history_surface_view')
branch_labels = None
depends_on = None


def upgrade():
    """Nothing to do — the two branches are already applied."""


def downgrade():
    """Nothing to undo. Downgrading past this restores the two heads."""
