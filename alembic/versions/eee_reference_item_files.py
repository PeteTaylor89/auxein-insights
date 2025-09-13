"""Add reference_item_files join table

Revision ID: eee_reference_item_files
Revises: ddd_add_observation_system
Create Date: 2025-09-13
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "eee_reference_item_files"
down_revision = "ddd_add_observation_system"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "reference_item_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reference_item_id", sa.Integer(), sa.ForeignKey("reference_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("file_id", sa.String(length=36), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("reference_item_id", "file_id", name="uq_reference_item_file_once"),
    )
    # allow only one primary image per reference item
    op.create_index(
        "uq_reference_item_primary_once",
        "reference_item_files",
        ["reference_item_id"],
        unique=True,
        postgresql_where=sa.text("is_primary = TRUE"),
    )
    op.create_index("ix_reference_item_files_item", "reference_item_files", ["reference_item_id"])
    op.create_index("ix_reference_item_files_file", "reference_item_files", ["file_id"])

def downgrade():
    op.drop_index("ix_reference_item_files_file", table_name="reference_item_files")
    op.drop_index("ix_reference_item_files_item", table_name="reference_item_files")
    op.drop_index("uq_reference_item_primary_once", table_name="reference_item_files")
    op.drop_table("reference_item_files")
