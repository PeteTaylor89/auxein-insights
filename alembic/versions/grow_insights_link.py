"""Link Grow users into Insights (public_users projection rows).

Grow→Insights one-way SSO (Phase 2). Adds the columns that let a public_users
row be a password-less PROJECTION of a Grow `users` identity rather than an
independent subscriber:

  - grow_user_id : unique FK -> users.id (the canonical link; one projection
                   row per Grow user, no duplicate identities)
  - origin       : 'signup' (self-registered subscriber) | 'grow' (projection)
  - hashed_password -> nullable, so projection rows carry no password and can
                   never password-login via /public/auth/login (guard added in
                   the login endpoint).

Provisioning rule (service ensure_insights_profile): link by grow_user_id ->
else adopt an existing row by email (set grow_user_id, origin='grow') -> else
create. A backfill script seeds projection rows for all existing Grow users.

Revision ID: grow_insights_link
Revises: add_obs_provenance
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa


revision = 'grow_insights_link'
down_revision = 'add_obs_provenance'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'public_users',
        sa.Column(
            'grow_user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    # Unique index — Postgres permits multiple NULLs, so self-signup rows
    # (grow_user_id IS NULL) are unaffected; at most one projection per Grow user.
    op.create_index(
        'uq_public_users_grow_user_id',
        'public_users',
        ['grow_user_id'],
        unique=True,
    )
    op.add_column(
        'public_users',
        sa.Column(
            'origin',
            sa.String(length=20),
            nullable=False,
            server_default='signup',
        ),
    )
    # Projection rows have no password.
    op.alter_column('public_users', 'hashed_password', nullable=True)


def downgrade() -> None:
    op.alter_column('public_users', 'hashed_password', nullable=False)
    op.drop_column('public_users', 'origin')
    op.drop_index('uq_public_users_grow_user_id', table_name='public_users')
    op.drop_column('public_users', 'grow_user_id')
