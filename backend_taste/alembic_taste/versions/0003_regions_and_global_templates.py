"""add regions reference table; allow global (NULL user_id) builtin templates

Revision ID: 0003_regions_global_templates
Revises: 0002_typed_tables
Create Date: 2026-06-28
"""
from alembic import op

from db.models import Region

revision = "0003_regions_global_templates"
down_revision = "0002_typed_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Builtin CMS templates are global (no owner) -> user_id must be nullable.
    op.alter_column("templates", "user_id", nullable=True, schema="taste")
    Region.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    Region.__table__.drop(bind=op.get_bind(), checkfirst=True)
    op.alter_column("templates", "user_id", nullable=False, schema="taste")
