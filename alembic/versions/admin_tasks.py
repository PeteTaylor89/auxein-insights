"""admin task planner — admin_tasks + admin_task_subtasks

Personal task management for the admin app. Additive: two new tables, nothing
existing is touched, so this is safe to apply ahead of the code that reads it.

`down_revision` is `zone_bacchus_index` because that is what `alembic_version`
actually held when this was written — NOT the newest file in versions/, which
has several unmerged tips. Always read the database for the head.

Revision ID: admin_tasks
Revises: zone_bacchus_index
"""
from alembic import op
import sqlalchemy as sa


# Slug well inside the 32-character limit. A longer one is truncated on write
# and the whole DDL silently rolls back with no error.
revision = "admin_tasks"
down_revision = "zone_bacchus_index"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "admin_tasks",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "owner_user_id", sa.Integer(),
            sa.ForeignKey("public_users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("client", sa.String(length=200), nullable=True),
        sa.Column("urgency", sa.String(length=20), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="todo"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "urgency IN ('low','normal','high','urgent')", name="ck_admin_tasks_urgency"
        ),
        sa.CheckConstraint(
            "status IN ('todo','in_progress','blocked','done')", name="ck_admin_tasks_status"
        ),
    )
    op.create_index("ix_admin_tasks_owner_due", "admin_tasks", ["owner_user_id", "due_date"])
    op.create_index("ix_admin_tasks_owner_status", "admin_tasks", ["owner_user_id", "status"])

    op.create_table(
        "admin_task_subtasks",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id", sa.BigInteger(),
            sa.ForeignKey("admin_tasks.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    # Explicit. Postgres indexes the PK but never the referencing side of an FK,
    # and an unindexed FK here means deleting a task seq-scans every subtask.
    op.create_index("ix_admin_task_subtasks_task", "admin_task_subtasks", ["task_id"])


def downgrade():
    op.drop_index("ix_admin_task_subtasks_task", table_name="admin_task_subtasks")
    op.drop_table("admin_task_subtasks")
    op.drop_index("ix_admin_tasks_owner_status", table_name="admin_tasks")
    op.drop_index("ix_admin_tasks_owner_due", table_name="admin_tasks")
    op.drop_table("admin_tasks")
