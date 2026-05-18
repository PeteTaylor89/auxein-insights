"""Allow contractors to self-check-in/out without a host user.

Three-part change to `contractor_movements`:
  1. Drop NOT NULL on `checked_in_by` and `logged_by`. Existing rows stay
     populated; new contractor self-logged rows leave them NULL.
  2. Add nullable contractor FK companions:
       - checked_in_by_contractor_id    -> contractors.id
       - checked_out_by_contractor_id   -> contractors.id (checked_out_by is
         already nullable; this just adds a parallel pointer)
       - logged_by_contractor_id        -> contractors.id
  3. CHECK constraints so we never have a row with neither user nor contractor
     filled in for the two NOT-NULL-formerly columns.

This mirrors `add_contractor_incident_reporter` (2026-05-18) — same pattern.

NOTE: revision slug kept <= 32 chars so it fits the default
`alembic_version.version_num VARCHAR(32)` column. The upgrade body is
fully idempotent (all ADD/DROP statements use IF [NOT] EXISTS, ALTER
COLUMN DROP NOT NULL is a no-op when already dropped, and CHECK
constraints are gated on pg_constraint) so a partial prior run is safe.

Revision ID: add_movement_self_checkin
Revises: add_contractor_incident_reporter
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_movement_self_checkin'
down_revision = 'add_contractor_incident_reporter'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Drop NOT NULL on the two user-FK columns (idempotent in Postgres)
    op.execute("ALTER TABLE contractor_movements ALTER COLUMN checked_in_by DROP NOT NULL;")
    op.execute("ALTER TABLE contractor_movements ALTER COLUMN logged_by DROP NOT NULL;")

    # 2. Add contractor-side companions
    op.execute("""
        ALTER TABLE contractor_movements
        ADD COLUMN IF NOT EXISTS checked_in_by_contractor_id INTEGER
        REFERENCES contractors(id) ON DELETE SET NULL;
    """)
    op.execute("""
        ALTER TABLE contractor_movements
        ADD COLUMN IF NOT EXISTS checked_out_by_contractor_id INTEGER
        REFERENCES contractors(id) ON DELETE SET NULL;
    """)
    op.execute("""
        ALTER TABLE contractor_movements
        ADD COLUMN IF NOT EXISTS logged_by_contractor_id INTEGER
        REFERENCES contractors(id) ON DELETE SET NULL;
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_contractor_movements_checked_in_by_contractor_id
        ON contractor_movements (checked_in_by_contractor_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_contractor_movements_checked_out_by_contractor_id
        ON contractor_movements (checked_out_by_contractor_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_contractor_movements_logged_by_contractor_id
        ON contractor_movements (logged_by_contractor_id);
    """)

    # 3. Integrity: at least one of the (user, contractor) pair must be set.
    # Wrapped in DO blocks so re-runs are safe (Postgres has no
    # ADD CONSTRAINT IF NOT EXISTS).
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_contractor_movements_checked_in_actor_set'
            ) THEN
                ALTER TABLE contractor_movements
                ADD CONSTRAINT ck_contractor_movements_checked_in_actor_set
                CHECK (checked_in_by IS NOT NULL OR checked_in_by_contractor_id IS NOT NULL);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_contractor_movements_logged_by_actor_set'
            ) THEN
                ALTER TABLE contractor_movements
                ADD CONSTRAINT ck_contractor_movements_logged_by_actor_set
                CHECK (logged_by IS NOT NULL OR logged_by_contractor_id IS NOT NULL);
            END IF;
        END $$;
    """)


def downgrade():
    op.execute("ALTER TABLE contractor_movements DROP CONSTRAINT IF EXISTS ck_contractor_movements_logged_by_actor_set;")
    op.execute("ALTER TABLE contractor_movements DROP CONSTRAINT IF EXISTS ck_contractor_movements_checked_in_actor_set;")
    op.execute("DROP INDEX IF EXISTS ix_contractor_movements_logged_by_contractor_id;")
    op.execute("DROP INDEX IF EXISTS ix_contractor_movements_checked_out_by_contractor_id;")
    op.execute("DROP INDEX IF EXISTS ix_contractor_movements_checked_in_by_contractor_id;")
    op.execute("ALTER TABLE contractor_movements DROP COLUMN IF EXISTS logged_by_contractor_id;")
    op.execute("ALTER TABLE contractor_movements DROP COLUMN IF EXISTS checked_out_by_contractor_id;")
    op.execute("ALTER TABLE contractor_movements DROP COLUMN IF EXISTS checked_in_by_contractor_id;")
    # NOTE: cannot safely re-add NOT NULL on checked_in_by / logged_by because
    # contractor self-logged rows may exist by then. Operators should re-validate
    # before re-tightening.
