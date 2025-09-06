
# alembic/versions/xxx_add_file_management.py
"""Add file management system

Revision ID: xxx_add_file_management
Revises: 20250904_223831_timesheets_init
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'xxx_add_file_management'
down_revision = '20250904_223831_timesheets_init'  # Replace with your latest revision
branch_labels = None
depends_on = None

def upgrade():
    # Create files table
    op.create_table('files',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=False),
        sa.Column('stored_filename', sa.String(255), nullable=False),
        sa.Column('file_path', sa.String(500), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('file_category', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('is_public', sa.Boolean(), default=False),
        sa.Column('requires_approval', sa.Boolean(), default=False),
        sa.Column('upload_status', sa.String(20), default='uploaded'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )
    
    # Create indexes for files table
    op.create_index('ix_files_id', 'files', ['id'])
    op.create_index('ix_files_entity_type', 'files', ['entity_type'])
    op.create_index('ix_files_entity_id', 'files', ['entity_id'])
    op.create_index('ix_files_company_id', 'files', ['company_id'])
    op.create_index('ix_files_entity_lookup', 'files', ['entity_type', 'entity_id'])

def downgrade():
    op.drop_index('ix_files_entity_lookup', 'files')
    op.drop_index('ix_files_company_id', 'files')
    op.drop_index('ix_files_entity_id', 'files')
    op.drop_index('ix_files_entity_type', 'files')
    op.drop_index('ix_files_id', 'files')
    op.drop_table('files')
