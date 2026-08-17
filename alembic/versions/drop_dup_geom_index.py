"""Drop the duplicate GiST index on map_features.geometry

Revision ID: drop_dup_geom_index
Revises: drop_blockchain_tables
Create Date: 2026-08-17

`add_map_features` created `ix_map_features_geometry` explicitly, on the
assumption that geoalchemy2 does not build one when a table is created through
alembic rather than metadata.create_all(). That assumption was wrong — it does,
as `idx_map_features_geometry`. Prod ended up with two identical GiST indexes on
the same column, which is pure write overhead and disk for no read benefit.

Keeps geoalchemy2's `idx_` index (it is the one the model layer will recreate on
any future create_all) and drops the hand-written `ix_` one.

Uses IF EXISTS so this is safe on a database built before the duplicate existed.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'drop_dup_geom_index'
down_revision: Union[str, None] = 'drop_blockchain_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute('DROP INDEX IF EXISTS ix_map_features_geometry')


def downgrade():
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_map_features_geometry '
        'ON map_features USING gist (geometry)'
    )
