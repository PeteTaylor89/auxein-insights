"""Add lifecycle status to vineyard_blocks.

New nullable-add → smart backfill → NOT NULL with default 'producing'.

Status values (Python-side enum at `db/models/block.BlockStatus`):
  - developing
  - pre_production
  - producing      (default for new rows + backfill fallback)
  - mothballed
  - retired
  - replanting

Backfill heuristic for existing rows:
  - removed_date IS NOT NULL                              → retired
  - planted_date IS NULL                                  → developing
  - planted_date > CURRENT_DATE - INTERVAL '3 years'      → pre_production
  - else                                                  → producing

`mothballed` and `replanting` are user-initiated transitions — no
heuristic backfill for them.

Column is plain VARCHAR(20) with Python-side enum enforcement, matching
the convention used by `tasks.task_category`. No Postgres ENUM type is
created — see `project_sqlalchemy_enum_vs_db.md` for rationale.

Revision ID: add_block_status
Revises: drop_asset_mgmt_category
Create Date: 2026-05-22
"""
from alembic import op


revision = 'add_block_status'
down_revision = 'drop_asset_mgmt_category'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add nullable column so we can backfill before enforcing NOT NULL
    op.execute(
        "ALTER TABLE vineyard_blocks "
        "ADD COLUMN IF NOT EXISTS status VARCHAR(20);"
    )

    # 2. Smart backfill
    op.execute(
        """
        UPDATE vineyard_blocks
        SET status = CASE
            WHEN removed_date IS NOT NULL THEN 'retired'
            WHEN planted_date IS NULL THEN 'developing'
            WHEN planted_date > CURRENT_DATE - INTERVAL '3 years' THEN 'pre_production'
            ELSE 'producing'
        END
        WHERE status IS NULL;
        """
    )

    # 3. Enforce NOT NULL + set server default for future inserts
    op.execute(
        "ALTER TABLE vineyard_blocks "
        "ALTER COLUMN status SET NOT NULL;"
    )
    op.execute(
        "ALTER TABLE vineyard_blocks "
        "ALTER COLUMN status SET DEFAULT 'producing';"
    )

    # 4. Index for filtering (insights/reporting will gate on this)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_vineyard_blocks_status "
        "ON vineyard_blocks (status);"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_vineyard_blocks_status;")
    op.execute("ALTER TABLE vineyard_blocks DROP COLUMN IF EXISTS status;")
