"""Drop `asset_management` value from TaskCategory enum.

Asset-related work belongs on the Asset Maintenance model, not as a task
category. This migration remaps any existing rows from `asset_management`
→ `general` on both:

  - tasks.task_category          VARCHAR(50)
  - task_templates.task_category VARCHAR(50)

Both columns are plain VARCHAR in the DB (the original
`add_task_management_system` migration used `sa.String(length=50)` for both,
even though `db/models/task_template.py` declares `Enum(TaskCategory)`).
So there's no Postgres ENUM type to recreate — Python-side enum
enforcement is the only gate, and that change lives in the application code.

Per Pete 2026-05-22: production data is test-only at this stage, so the
remap-to-general is acceptable and preserves the rows.

Downgrade is a no-op: rows previously remapped to `general` are NOT
distinguishable from rows that were always `general`, so we can't restore
them. The Python enum value is re-added at the code level via a revert
of the model/schema change.

Revision ID: drop_asset_mgmt_category
Revises: add_user_profile_fields
Create Date: 2026-05-22
"""
from alembic import op


revision = 'drop_asset_mgmt_category'
down_revision = 'add_user_profile_fields'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "UPDATE tasks SET task_category = 'general' "
        "WHERE task_category = 'asset_management';"
    )
    op.execute(
        "UPDATE task_templates SET task_category = 'general' "
        "WHERE task_category = 'asset_management';"
    )


def downgrade():
    # Cannot restore remapped rows — they're indistinguishable from rows
    # that were always 'general'. No-op.
    pass
