"""Create performance indexes for contractor tables

Revision ID: migrate_images_to_files
Revises: 007_contractor_indexes

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'migrate_images_to_files'
down_revision = '007_contractor_indexes'
branch_labels = None
depends_on = None

def upgrade():
    # Create new files table
    op.create_table('files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=255), nullable=False),
        sa.Column('file_name', sa.String(length=100), nullable=False),
        sa.Column('mime_type', sa.String(length=50), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('ix_files_id', 'files', ['id'])
    op.create_index('ix_files_entity', 'files', ['entity_type', 'entity_id'])
    
    # Migrate existing data from images table if it exists
    # Check if images table exists first
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    if 'images' in inspector.get_table_names():
        # Migrate data from images to files
        op.execute("""
            INSERT INTO files (entity_type, entity_id, file_path, file_name, mime_type, file_size, uploaded_at)
            SELECT 'observation', observation_id, file_path, file_name, mime_type, file_size, uploaded_at
            FROM images
        """)
        
        print("Migrated existing image records to files table")

def downgrade():
    # Recreate images table
    op.create_table('images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('observation_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=255), nullable=False),
        sa.Column('file_name', sa.String(length=100), nullable=False),
        sa.Column('mime_type', sa.String(length=50), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['observation_id'], ['observations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('ix_images_id', 'images', ['id'])
    
    # Migrate observation files back to images table
    op.execute("""
        INSERT INTO images (observation_id, file_path, file_name, mime_type, file_size, uploaded_at)
        SELECT entity_id, file_path, file_name, mime_type, file_size, uploaded_at
        FROM files 
        WHERE entity_type = 'observation'
    """)
    
    # Drop files table
    op.drop_index('ix_files_entity', table_name='files')
    op.drop_index('ix_files_id', table_name='files')
    op.drop_table('files')