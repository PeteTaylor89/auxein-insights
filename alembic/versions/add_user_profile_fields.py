"""Add personal profile fields to users: job_title + emergency contact.

Adds three nullable string columns to `users`:
  - job_title              VARCHAR(100)
  - emergency_contact_name VARCHAR(100)
  - emergency_contact_phone VARCHAR(20)

Existing columns already present on the model and used by this same Profile
edit flow — left untouched:
  - phone (VARCHAR(20))
  - bio (TEXT)
  - avatar_url (VARCHAR(500))

NOTE: revision slug kept <= 28 chars so it fits the default
`alembic_version.version_num VARCHAR(32)` column with headroom for any
future down-revision rename. Body uses ADD COLUMN IF NOT EXISTS so a partial
prior run is safe to re-run.

Revision ID: add_user_profile_fields
Revises: add_movement_self_checkin
Create Date: 2026-05-21
"""
from alembic import op


revision = 'add_user_profile_fields'
down_revision = 'add_movement_self_checkin'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100);")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);")


def downgrade():
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS emergency_contact_phone;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS emergency_contact_name;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS job_title;")
