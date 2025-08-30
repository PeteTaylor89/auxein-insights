"""rename metadata to sync_metadata

Revision ID: e85fe4556199
Revises: 20241222_001
Create Date: 2025-06-22 11:59:35.216518

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e85fe4556199'
down_revision: Union[str, None] = '20241222_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.alter_column('parcel_sync_logs', 'metadata', new_column_name='sync_metadata')

def downgrade():
    op.alter_column('parcel_sync_logs', 'sync_metadata', new_column_name='metadata')
