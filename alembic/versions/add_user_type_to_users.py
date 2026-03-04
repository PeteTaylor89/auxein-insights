"""Add user_type column to users table

Introduces the 5-tier user type system (auxein_admin, company_admin,
company_manager, company_user, contractor). Backfills from existing
role column. The old role column is NOT dropped — it stays for
backward compatibility until Step 12.

Revision ID: add_user_type_to_users
Revises: add_unsubscribe_token
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'add_user_type_to_users'
down_revision: str = 'add_unsubscribe_token'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add user_type column (nullable initially for backfill)
    op.add_column('users', sa.Column('user_type', sa.String(20), nullable=True))

    # Backfill from existing role values
    op.execute("""
        UPDATE users SET user_type = CASE
            WHEN role IN ('admin', 'owner') THEN 'company_admin'
            WHEN role = 'manager' THEN 'company_manager'
            WHEN role IN ('user', 'viewer') THEN 'company_user'
            ELSE 'company_user'
        END
    """)

    # Override for Auxein system admin
    op.execute("""
        UPDATE users SET user_type = 'auxein_admin'
        WHERE email = 'pete.taylor@auxein.co.nz'
    """)

    # Make non-nullable after backfill
    op.alter_column('users', 'user_type', nullable=False, server_default='company_user')

    # Add index for permission lookups
    op.create_index('ix_users_user_type', 'users', ['user_type'])


def downgrade() -> None:
    op.drop_index('ix_users_user_type', table_name='users')
    op.drop_column('users', 'user_type')
