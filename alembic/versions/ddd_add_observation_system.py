"""Add observation templates/runs/spots and reference items (idempotent, drops legacy)

Revision ID: ddd_add_observation_system
Revises: ccc_add_task_assets
Create Date: 2025-09-12 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry

revision = "ddd_add_observation_system"
down_revision = "ccc_add_task_assets"
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB


def _table_exists(conn, name: str) -> bool:
    insp = sa.inspect(conn)
    return insp.has_table(name)


def _index_exists(conn, name: str) -> bool:
    return conn.execute(sa.text("SELECT to_regclass(:n) IS NOT NULL AS e"), {"n": name}).scalar()


def _constraint_exists(conn, name: str) -> bool:
    return conn.execute(
        sa.text("SELECT 1 FROM pg_constraint WHERE conname = :n"), {"n": name}
    ).first() is not None


def upgrade():
    conn = op.get_bind()

    # Enable PostGIS (safe if already installed)
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # 0) Retire legacy table (as requested)
    op.execute("DROP TABLE IF EXISTS observations CASCADE")

    # 1) reference_items
    if not _table_exists(conn, "reference_items"):
        op.create_table(
            "reference_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True),
            sa.Column("category", sa.String(length=30), nullable=False),
            sa.Column("key", sa.String(length=80), nullable=False),
            sa.Column("label", sa.String(length=160), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("aliases", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("icon_file_id", sa.String(length=36), nullable=True),
            sa.Column("photo_file_ids", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("source_url", sa.String(length=500), nullable=True),
            sa.Column("license", sa.String(length=200), nullable=True),
            sa.Column("attribution", sa.Text(), nullable=True),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("reference_items.id", ondelete="SET NULL"), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
    # composite unique index (allow org overrides on system keys)
    if not _index_exists(conn, "ix_reference_items_company_category_key"):
        op.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_reference_items_company_category_key "
            "ON reference_items (company_id, category, key)"
        )
    # NOTE: we intentionally omit separate single-column indexes that caused the duplicate error.

    # 2) observation_templates
    if not _table_exists(conn, "observation_templates"):
        op.create_table(
            "observation_templates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("type", sa.String(length=50), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("fields_json", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("defaults_json", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("validations_json", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
    if not _index_exists(conn, "ix_observation_templates_type"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_templates_type "
            "ON observation_templates (type)"
        )

    # 3) observation_plans
    if not _table_exists(conn, "observation_plans"):
        op.create_table(
            "observation_plans",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("observation_templates.id"), nullable=False),
            sa.Column("template_version", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("instructions", sa.Text(), nullable=True),
            sa.Column("due_start_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("due_end_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("rrule", sa.Text(), nullable=True),
            sa.Column("priority", sa.String(length=20), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'scheduled'")),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
    if not _index_exists(conn, "ix_observation_plans_company_due"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_plans_company_due "
            "ON observation_plans (company_id, due_start_at)"
        )
    if not _index_exists(conn, "ix_observation_plans_company_status"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_plans_company_status "
            "ON observation_plans (company_id, status)"
        )

    # 3a) observation_plan_targets
    if not _table_exists(conn, "observation_plan_targets"):
        op.create_table(
            "observation_plan_targets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("plan_id", sa.Integer(), sa.ForeignKey("observation_plans.id", ondelete="CASCADE"), nullable=False),
            sa.Column("block_id", sa.Integer(), sa.ForeignKey("vineyard_blocks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("row_labels", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id"), nullable=True),
            sa.Column("sample_size", sa.Integer(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_plan_targets_plan "
            "ON observation_plan_targets (plan_id)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_plan_targets_block "
            "ON observation_plan_targets (block_id)"
        )

    # 3b) observation_plan_assignees
    if not _table_exists(conn, "observation_plan_assignees"):
        op.create_table(
            "observation_plan_assignees",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("plan_id", sa.Integer(), sa.ForeignKey("observation_plans.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        )
    if not _index_exists(conn, "ix_observation_plan_assignees_plan"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_plan_assignees_plan "
            "ON observation_plan_assignees (plan_id)"
        )
    if not _index_exists(conn, "ix_observation_plan_assignees_user"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_plan_assignees_user "
            "ON observation_plan_assignees (user_id)"
        )
    if not _constraint_exists(conn, "uq_observation_plan_assignee"):
        op.execute(
            "ALTER TABLE observation_plan_assignees "
            "ADD CONSTRAINT uq_observation_plan_assignee UNIQUE (plan_id, user_id)"
        )

    # 4) observation_runs
    if not _table_exists(conn, "observation_runs"):
        op.create_table(
            "observation_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("plan_id", sa.Integer(), sa.ForeignKey("observation_plans.id"), nullable=True),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("observation_templates.id"), nullable=False),
            sa.Column("template_version", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("observed_at_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("observed_at_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column("photo_file_ids", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("document_file_ids", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("tags", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("summary_json", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
    if not _index_exists(conn, "ix_observation_runs_company_start"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_runs_company_start "
            "ON observation_runs (company_id, observed_at_start)"
        )
    if not _index_exists(conn, "ix_observation_runs_company_template"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_runs_company_template "
            "ON observation_runs (company_id, template_id)"
        )

    # 5) observation_spots (with PostGIS geometry)
    if not _table_exists(conn, "observation_spots"):
        op.create_table(
            "observation_spots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("run_id", sa.Integer(), sa.ForeignKey("observation_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("block_id", sa.Integer(), sa.ForeignKey("vineyard_blocks.id", ondelete="CASCADE"), nullable=True),
            sa.Column("row_id", sa.Integer(), sa.ForeignKey("vineyard_rows.id"), nullable=True),
            sa.Column("gps", Geometry(geometry_type="POINT", srid=4326), nullable=True),
            sa.Column("data_json", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("photo_file_ids", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("document_file_ids", JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
    if not _index_exists(conn, "ix_observation_spots_company_time"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_spots_company_time "
            "ON observation_spots (company_id, observed_at)"
        )
    if not _index_exists(conn, "ix_observation_spots_company_block_time"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_spots_company_block_time "
            "ON observation_spots (company_id, block_id, observed_at)"
        )
    if not _index_exists(conn, "ix_observation_spots_gps_gist"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_spots_gps_gist "
            "ON observation_spots USING GIST (gps)"
        )

    # 6) observation_task_links
    if not _table_exists(conn, "observation_task_links"):
        op.create_table(
            "observation_task_links",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("observation_run_id", sa.Integer(), sa.ForeignKey("observation_runs.id", ondelete="CASCADE"), nullable=True),
            sa.Column("observation_spot_id", sa.Integer(), sa.ForeignKey("observation_spots.id", ondelete="CASCADE"), nullable=True),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("link_reason", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not _index_exists(conn, "ix_observation_task_links_task"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_task_links_task "
            "ON observation_task_links (task_id)"
        )
    if not _index_exists(conn, "ix_observation_task_links_run"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_task_links_run "
            "ON observation_task_links (observation_run_id)"
        )
    if not _index_exists(conn, "ix_observation_task_links_spot"):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_observation_task_links_spot "
            "ON observation_task_links (observation_spot_id)"
        )


def downgrade():
    # reverse order
    for name in [
        "observation_task_links",
        "observation_spots",
        "observation_runs",
        "observation_plan_assignees",
        "observation_plan_targets",
        "observation_plans",
        "observation_templates",
        "reference_items",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {name} CASCADE")
