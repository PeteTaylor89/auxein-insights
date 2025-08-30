"""merge heads

Revision ID: b83e5ec41c9c
Revises: [generated_revision_id], abc123456789
Create Date: 2025-06-18 15:53:07.183664

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b83e5ec41c9c'
down_revision: Union[str, None] = ('[generated_revision_id]', 'abc123456789')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
