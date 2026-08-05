"""Add a free-text notes field to vineyard_blocks.

From the Greystone beta feedback (docs/grow/Auxein_Grow_Beta_Feedback.docx,
Manage section): growers want somewhere to capture block detail that doesn't fit
the structured columns — access quirks, historical context, "the pump shed end
floods in spring". Deliberately unstructured; anything that earns a report or a
filter should graduate to its own column instead of living in here.

TEXT rather than VARCHAR(n) — there's no natural length ceiling on a note, and
Postgres stores both identically.

Revision ID: block_notes_col
Revises: part_timeseries_swap
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa


revision = 'block_notes_col'
down_revision = 'part_timeseries_swap'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'vineyard_blocks',
        sa.Column('notes', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('vineyard_blocks', 'notes')
