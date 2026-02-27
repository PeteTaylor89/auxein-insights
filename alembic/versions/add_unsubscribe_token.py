"""Add unsubscribe_token to public_users

Persistent token for one-click email unsubscribe (separate from
verification_token which gets cleared after email verification).

Revision ID: add_unsubscribe_token
Revises: add_article_thumbnail
Create Date: 2026-02-27

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'add_unsubscribe_token'
down_revision: str = 'add_article_thumbnail'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('public_users', sa.Column('unsubscribe_token', sa.String(255), nullable=True))
    op.create_index('idx_public_users_unsubscribe_token', 'public_users', ['unsubscribe_token'], unique=True)


def downgrade():
    op.drop_index('idx_public_users_unsubscribe_token', 'public_users')
    op.drop_column('public_users', 'unsubscribe_token')
