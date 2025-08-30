"""Add token blacklist table for JWT security only

Revision ID: abc123456789
Revises: 848feb1504bd
Create Date: 2025-06-18 15:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'abc123456789'
down_revision: Union[str, None] = '848feb1504bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Add token blacklist table only."""
    op.create_table('token_blacklist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('jti', sa.String(length=255), nullable=False),
        sa.Column('token_type', sa.String(length=20), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(length=50), nullable=True, default='logout'),
        sa.Column('blacklisted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_token_blacklist_id'), 'token_blacklist', ['id'], unique=False)
    op.create_index(op.f('ix_token_blacklist_jti'), 'token_blacklist', ['jti'], unique=True)

def downgrade() -> None:
    """Remove token blacklist table."""
    op.drop_index(op.f('ix_token_blacklist_jti'), table_name='token_blacklist')
    op.drop_index(op.f('ix_token_blacklist_id'), table_name='token_blacklist')
    op.drop_table('token_blacklist')