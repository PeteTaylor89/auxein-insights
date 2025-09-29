# alembic migration file - add document_file_ids column

"""Add document_file_ids to observation_spots

Revision ID: add_video_file_ids
Revises: [add_block_id_to_runs]
Create Date: 2025-09-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'add_video_file_ids'
down_revision = 'add_block_id_to_runs'
branch_labels = None
depends_on = None

def upgrade():
    # Add document_file_ids column to observation_spots table
    op.add_column('observation_spots', 
        sa.Column('video_file_ids', 
                 postgresql.JSON(astext_type=sa.Text()), 
                 nullable=False, 
                 server_default='[]'
        )
    )

def downgrade():
    # Remove document_file_ids column
    op.drop_column('observation_spots', 'video_file_ids')