"""add per-user tasting vocabulary table

Revision ID: 0004_vocab
Revises: 0003_regions_global_templates
Create Date: 2026-07-03
"""
from alembic import op

from db.models import Vocab

revision = "0004_vocab"
down_revision = "0003_regions_global_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Vocab.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    Vocab.__table__.drop(bind=op.get_bind(), checkfirst=True)
