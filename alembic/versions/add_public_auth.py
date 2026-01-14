"""add weather data tables v2

Revision ID: add_public_auth
Revises: d655c05d9e8a
Create Date: 2026-01-12 19:04:45.871336

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2


# revision identifiers, used by Alembic.
revision: str = 'add_public_auth'
down_revision: Union[str, None] = 'd655c05d9e8a'
branch_labels = None
depends_on = None

def upgrade():
    """Create public_users table with marketing and segmentation"""
    op.create_table(
        'public_users',
        # ============================================
        # BASIC USER INFO
        # ============================================
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('first_name', sa.String(length=50), nullable=True),
        sa.Column('last_name', sa.String(length=50), nullable=True),
        
        # ============================================
        # USER SEGMENTATION
        # ============================================
        sa.Column('user_type', sa.String(length=50), nullable=True),
        sa.Column('company_name', sa.String(length=200), nullable=True),
        sa.Column('job_title', sa.String(length=100), nullable=True),
        sa.Column('region_of_interest', sa.String(length=100), nullable=True),
        
        # ============================================
        # MARKETING PREFERENCES
        # ============================================
        sa.Column('newsletter_opt_in', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('marketing_opt_in', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('research_opt_in', sa.Boolean(), nullable=False, server_default='false'),
        
        # ============================================
        # ACCOUNT STATUS
        # ============================================
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        
        # ============================================
        # EMAIL VERIFICATION
        # ============================================
        sa.Column('verification_token', sa.String(length=255), nullable=True),
        sa.Column('verification_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        
        # ============================================
        # PASSWORD RESET
        # ============================================
        sa.Column('reset_token', sa.String(length=255), nullable=True),
        sa.Column('reset_token_expires', sa.DateTime(timezone=True), nullable=True),
        
        # ============================================
        # SECURITY TRACKING
        # ============================================
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.Column('login_count', sa.Integer(), nullable=False, server_default='0'),
        
        # ============================================
        # ENGAGEMENT TRACKING
        # ============================================
        sa.Column('first_map_view', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_active', sa.DateTime(timezone=True), nullable=True),
        
        # ============================================
        # NOTES
        # ============================================
        sa.Column('notes', sa.Text(), nullable=True),
        
        # ============================================
        # TIMESTAMPS
        # ============================================
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        
        # ============================================
        # CONSTRAINTS
        # ============================================
        sa.PrimaryKeyConstraint('id')
    )
    
    # ============================================
    # INDEXES
    # ============================================
    
    # Primary indexes
    op.create_index('ix_public_users_id', 'public_users', ['id'], unique=False)
    op.create_index('ix_public_users_email', 'public_users', ['email'], unique=True)
    
    # Token indexes for faster lookups
    op.create_index('ix_public_users_verification_token', 'public_users', ['verification_token'], unique=False)
    op.create_index('ix_public_users_reset_token', 'public_users', ['reset_token'], unique=False)
    
    # Marketing/segmentation indexes for analytics queries
    op.create_index('ix_public_users_user_type', 'public_users', ['user_type'], unique=False)
    op.create_index('ix_public_users_region_of_interest', 'public_users', ['region_of_interest'], unique=False)
    op.create_index('ix_public_users_newsletter_opt_in', 'public_users', ['newsletter_opt_in'], unique=False)
    op.create_index('ix_public_users_marketing_opt_in', 'public_users', ['marketing_opt_in'], unique=False)
    
    # Engagement indexes for analytics
    op.create_index('ix_public_users_last_active', 'public_users', ['last_active'], unique=False)
    op.create_index('ix_public_users_created_at', 'public_users', ['created_at'], unique=False)
    
    # Account status indexes for filtering
    op.create_index('ix_public_users_is_verified', 'public_users', ['is_verified'], unique=False)
    op.create_index('ix_public_users_is_active', 'public_users', ['is_active'], unique=False)

def downgrade():
    """Drop public_users table and all indexes"""
    # Drop indexes first
    op.drop_index('ix_public_users_is_active', table_name='public_users')
    op.drop_index('ix_public_users_is_verified', table_name='public_users')
    op.drop_index('ix_public_users_created_at', table_name='public_users')
    op.drop_index('ix_public_users_last_active', table_name='public_users')
    op.drop_index('ix_public_users_marketing_opt_in', table_name='public_users')
    op.drop_index('ix_public_users_newsletter_opt_in', table_name='public_users')
    op.drop_index('ix_public_users_region_of_interest', table_name='public_users')
    op.drop_index('ix_public_users_user_type', table_name='public_users')
    op.drop_index('ix_public_users_reset_token', table_name='public_users')
    op.drop_index('ix_public_users_verification_token', table_name='public_users')
    op.drop_index('ix_public_users_email', table_name='public_users')
    op.drop_index('ix_public_users_id', table_name='public_users')
    
    # Drop table
    op.drop_table('public_users')