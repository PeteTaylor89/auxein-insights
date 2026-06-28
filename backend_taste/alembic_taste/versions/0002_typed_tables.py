"""replace generic records store with typed per-entity tables

Revision ID: 0002_typed_tables
Revises: 0001_init_taste
Create Date: 2026-06-28

The generic taste.records relay is dropped (it never held committed data) and
replaced by one real table per entity, created from the SQLAlchemy models so the
schema can't drift from the code.
"""
from alembic import op

from db.base import Base
from db.models import ENTITY_MODELS

revision = "0002_typed_tables"
down_revision = "0001_init_taste"
branch_labels = None
depends_on = None

# De-duplicated model tables, in dependency-friendly order.
_TABLES = list(dict.fromkeys(m.__table__ for m in ENTITY_MODELS.values()))


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS taste")
    op.execute("DROP TABLE IF EXISTS taste.records")
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=_TABLES)
