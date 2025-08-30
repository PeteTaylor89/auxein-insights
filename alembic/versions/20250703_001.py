"""Safe flexible season management migration - checks existing columns

Revision ID: 20250703_001
Revises: 20250629_005
Create Date: 2025-06-29 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


# revision identifiers, used by Alembic.
revision: str = '20250703_001'
down_revision: Union[str, None] = '20250629_005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade():
    # Add geometry column
    op.add_column('vineyard_rows', 
        sa.Column('geometry', Geometry('LINESTRING', srid=4326), nullable=True)
    )
    
    # Add spatial index
    op.execute('CREATE INDEX idx_vineyard_rows_geom ON vineyard_rows USING GIST (geometry)')
    
    # Add trigger function for auto-calculating row_length
    op.execute('''
        CREATE OR REPLACE FUNCTION calculate_row_length_from_geometry()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.geometry IS NOT NULL THEN
                NEW.row_length = ST_Length(NEW.geometry::geography);
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    ''')
    
    # Create trigger
    op.execute('''
        CREATE TRIGGER trigger_calculate_row_length
            BEFORE INSERT OR UPDATE OF geometry ON vineyard_rows
            FOR EACH ROW
            EXECUTE FUNCTION calculate_row_length_from_geometry();
    ''')

def downgrade():
    op.execute('DROP TRIGGER IF EXISTS trigger_calculate_row_length ON vineyard_rows')
    op.execute('DROP FUNCTION IF EXISTS calculate_row_length_from_geometry()')
    op.execute('DROP INDEX IF EXISTS idx_vineyard_rows_geom')
    op.drop_column('vineyard_rows', 'geometry')