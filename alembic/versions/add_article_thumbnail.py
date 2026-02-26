"""Add thumbnail_url to articles

Revision ID: add_article_thumbnail
Revises: add_content_platform
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'add_article_thumbnail'
down_revision: str = 'add_content_platform'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('articles', sa.Column('thumbnail_url', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('articles', 'thumbnail_url')
