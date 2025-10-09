"""Add certified_for field to assets

Revision ID: add_certified_for_field
Revises: add_video_file_ids
Create Date: 2025-10-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_certified_for_field'
down_revision = 'add_video_file_ids'  
branch_labels = None
depends_on = None


def upgrade():
    # Add certified_for column to assets table
    op.add_column('assets', 
        sa.Column('certified_for', 
                  postgresql.JSON(astext_type=sa.Text()), 
                  nullable=True,
                  server_default='{}')
    )
    
    # Update existing consumables to have empty certification dict
    op.execute("""
        UPDATE assets 
        SET certified_for = '{}'::json 
        WHERE asset_type = 'consumable' AND certified_for IS NULL
    """)


def downgrade():
    # Remove certified_for column
    op.drop_column('assets', 'certified_for')