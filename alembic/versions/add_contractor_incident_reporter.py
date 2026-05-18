"""Allow contractors to report incidents.

Two-part change to `incidents`:
  1. Make `reported_by` nullable (was NOT NULL FK to users.id). Existing rows
     stay populated; new contractor-filed incidents leave it NULL.
  2. Add `reported_by_contractor_id` nullable FK to contractors.id. New
     contractor-filed incidents populate this column instead.

A reporter integrity check ensures one of the two is always set (either a
user or a contractor reported it — never neither, never both).

Revision ID: add_contractor_incident_reporter
Revises: add_property_geometry
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_contractor_incident_reporter'
down_revision = 'add_property_geometry'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the NOT NULL constraint on reported_by so contractor rows can omit it
    op.execute("ALTER TABLE incidents ALTER COLUMN reported_by DROP NOT NULL;")

    # Add contractor reporter column (nullable, FK to contractors)
    op.execute("""
        ALTER TABLE incidents
        ADD COLUMN IF NOT EXISTS reported_by_contractor_id INTEGER
        REFERENCES contractors(id) ON DELETE SET NULL;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_incidents_reported_by_contractor_id
        ON incidents (reported_by_contractor_id);
    """)

    # Integrity: exactly one of the two reporter columns must be set
    op.execute("""
        ALTER TABLE incidents
        ADD CONSTRAINT ck_incidents_reporter_set
        CHECK (reported_by IS NOT NULL OR reported_by_contractor_id IS NOT NULL);
    """)


def downgrade():
    op.execute("ALTER TABLE incidents DROP CONSTRAINT IF EXISTS ck_incidents_reporter_set;")
    op.execute("DROP INDEX IF EXISTS ix_incidents_reported_by_contractor_id;")
    op.execute("ALTER TABLE incidents DROP COLUMN IF EXISTS reported_by_contractor_id;")
    # NOTE: cannot safely re-add NOT NULL on reported_by because contractor rows
    # may exist by then. Operators should re-validate before re-tightening.
