
"""rename metadata to area_metadata

Revision ID: 20250703_003
Revises: 20250703_002  # Previous geometry migration
Create Date: 2025-07-03 11:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = '20250703_003'
down_revision = '20250703_002'  # Replace with your actual previous revision
branch_labels = None
depends_on = None

def upgrade():
    op.execute('ALTER TABLE spatial_areas RENAME COLUMN metadata TO area_metadata')

def downgrade():
    op.execute('ALTER TABLE spatial_areas RENAME COLUMN area_metadata TO metadata')