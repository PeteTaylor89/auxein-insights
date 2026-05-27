"""Add reset_token + reset_token_expires to contractors.

Mirrors the User columns that drive /forgot-password + /reset-password.
Without these, `/reset-password` 500s on every call because
`auth.py:541` evaluates `Contractor.reset_token == token` at filter-build
time and raises AttributeError before any query runs.

Adding the columns also gives contractors a real password-recovery path
(they currently have no way back into the app if they forget their
password — change-password only works while authenticated).

Revision ID: add_contractor_reset_token
Revises: add_risk_spatial_fks
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_contractor_reset_token'
down_revision = 'add_risk_spatial_fks'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'contractors',
        sa.Column('reset_token', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'contractors',
        sa.Column('reset_token_expires', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column('contractors', 'reset_token_expires')
    op.drop_column('contractors', 'reset_token')
