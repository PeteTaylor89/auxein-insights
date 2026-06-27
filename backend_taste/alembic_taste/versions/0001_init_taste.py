"""init taste schema + generic records store

Revision ID: 0001_init_taste
Revises:
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_init_taste"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS taste")
    op.create_table(
        "records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("entity", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
        schema="taste",
    )
    op.create_index("ix_taste_records_user_entity", "records", ["user_id", "entity"], schema="taste")
    op.create_index("ix_taste_records_user_updated", "records", ["user_id", "updated_at"], schema="taste")


def downgrade() -> None:
    op.drop_index("ix_taste_records_user_updated", table_name="records", schema="taste")
    op.drop_index("ix_taste_records_user_entity", table_name="records", schema="taste")
    op.drop_table("records", schema="taste")
    op.execute("DROP SCHEMA IF EXISTS taste CASCADE")
