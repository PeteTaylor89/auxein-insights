"""admin projects, note journal, time entries

Adds the outcome side of the planner: projects, their dated note journal, and
manually entered time. Also adds `admin_tasks.project_id`.

Additive throughout — three new tables and one new nullable column. The column
is added with no default and no backfill, so every existing task simply has no
project.

Revision ID: admin_projects
Revises: admin_tasks
"""
from alembic import op
import sqlalchemy as sa


revision = "admin_projects"
down_revision = "admin_tasks"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "admin_projects",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "owner_user_id", sa.Integer(),
            sa.ForeignKey("public_users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("client", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("description", sa.Text(), nullable=True),
        # A theme token name, not a hex value — see the model.
        sa.Column("colour", sa.String(length=20), nullable=True),
        sa.Column("target_hours", sa.Numeric(8, 2), nullable=True),
        sa.Column("started_on", sa.Date(), nullable=True),
        sa.Column("due_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('active','on_hold','done','archived')",
            name="ck_admin_projects_status",
        ),
    )
    op.create_index(
        "ix_admin_projects_owner_status", "admin_projects", ["owner_user_id", "status"]
    )

    op.create_table(
        "admin_project_notes",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "project_id", sa.BigInteger(),
            sa.ForeignKey("admin_projects.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_admin_project_notes_project", "admin_project_notes", ["project_id"])

    op.create_table(
        "admin_time_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "owner_user_id", sa.Integer(),
            sa.ForeignKey("public_users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "project_id", sa.BigInteger(),
            sa.ForeignKey("admin_projects.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "task_id", sa.BigInteger(),
            sa.ForeignKey("admin_tasks.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "project_id IS NOT NULL OR task_id IS NOT NULL", name="ck_admin_time_target"
        ),
        # Upper bound catches hours typed into a minutes field, which would
        # otherwise inflate a project total sixtyfold and look like diligence.
        sa.CheckConstraint("minutes > 0 AND minutes <= 1440", name="ck_admin_time_minutes"),
    )
    op.create_index("ix_admin_time_owner_date", "admin_time_entries", ["owner_user_id", "spent_on"])
    op.create_index("ix_admin_time_project", "admin_time_entries", ["project_id"])
    op.create_index("ix_admin_time_task", "admin_time_entries", ["task_id"])

    op.add_column(
        "admin_tasks",
        sa.Column("project_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_admin_tasks_project", "admin_tasks", "admin_projects",
        ["project_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_admin_tasks_project", "admin_tasks", ["project_id"])


def downgrade():
    op.drop_index("ix_admin_tasks_project", table_name="admin_tasks")
    op.drop_constraint("fk_admin_tasks_project", "admin_tasks", type_="foreignkey")
    op.drop_column("admin_tasks", "project_id")

    op.drop_index("ix_admin_time_task", table_name="admin_time_entries")
    op.drop_index("ix_admin_time_project", table_name="admin_time_entries")
    op.drop_index("ix_admin_time_owner_date", table_name="admin_time_entries")
    op.drop_table("admin_time_entries")

    op.drop_index("ix_admin_project_notes_project", table_name="admin_project_notes")
    op.drop_table("admin_project_notes")

    op.drop_index("ix_admin_projects_owner_status", table_name="admin_projects")
    op.drop_table("admin_projects")
