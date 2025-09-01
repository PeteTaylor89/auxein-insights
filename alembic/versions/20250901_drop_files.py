"""Data migration and cleanup for enhanced observations

Revision ID: 20250901_drop_files
Revises: migrate_images_to_files

"""

revision = "20250901_drop_files"
down_revision = "migrate_images_to_files"

from alembic import op
import sqlalchemy as sa

def upgrade():
    # Drop the composite index if it exists (matches your model)
    # __table_args__ = (Index('ix_files_entity', 'entity_type', 'entity_id'),)
    try:
        op.drop_index('ix_files_entity', table_name='files')
    except Exception:
        # Index might not exist in some envs; ignore
        pass

    # Finally drop the table
    op.drop_table('files')

def downgrade():
    # Recreate the table minimally (align with your original model)
    op.create_table(
        'files',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=255), nullable=False),
        sa.Column('file_name', sa.String(length=100), nullable=False),
        sa.Column('mime_type', sa.String(length=50)),
        sa.Column('file_size', sa.Integer()),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )
    # Recreate the composite index
    op.create_index('ix_files_entity', 'files', ['entity_type', 'entity_id'])
