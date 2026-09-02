"""Index observation_spots.run_id — the FK a run delete has to walk.

`observation_spots.run_id` is a foreign key with `ON DELETE CASCADE` and, until
now, **no index**. Postgres does not create one for a foreign key; it only
indexes the primary key side. So every delete of an `observation_run` made the
database sequentially scan `observation_spots` to find the children to cascade,
once per deleted row.

This is the same shape as the block-delete finding: deleting a `vineyard_block`
sequentially scanned 22 GB of `climate_historical_data` for exactly this reason.
Observation spots are nowhere near that size today — 48 rows in the whole
database when this was written — which is precisely why it is worth fixing now,
while the index builds instantly and nobody is waiting on it.

It is not only the delete. `list_runs` batch-loads spot counts with
`WHERE run_id IN (...)` on every load of the observation management page, and
`GET /observation-runs/{id}/spots` filters the same column.

CONCURRENTLY is deliberately NOT used: it cannot run inside a transaction, which
is where Alembic puts a migration, and at this table size a plain CREATE INDEX
takes a lock for a few milliseconds.
"""
from alembic import op

revision = 'obs_spot_run_index'
down_revision = 'site_variety'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        'ix_observation_spots_run',
        'observation_spots',
        ['run_id'],
        unique=False,
    )


def downgrade():
    op.drop_index('ix_observation_spots_run', table_name='observation_spots')
