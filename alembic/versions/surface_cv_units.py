"""Add cv_units to the surface index tables.

`surface_index_tables` was written before the rainfall variable ran, and it
assumed every `cv_rmse` was in the variable's own unit. That is not true.

Rainfall is fitted in RATIO space — the spline fits rainfall/MAR against the
LENZ mean-annual-rainfall climatology (`ratio_lenz`, the production method), so
its cv_rmse is **dimensionless** and sits around 0.0025. Temperature cv_rmse is
degrees Celsius and sits around 1.2-1.9. Loading both into one unmarked `cv_rmse`
column invites the single worst misreading available here: a confidence badge
rendering rainfall accuracy as "+/- 0.0025 mm", which is off by orders of
magnitude and reads as spectacular precision rather than as a different unit.

Deriving the unit from the variable name in application code was the
alternative, and it is worse: anything reading these tables directly — a
notebook, a BI tool, the next person's SQL — gets no warning at all. The unit
belongs next to the number.

Values are 'C', 'mm', 'ratio', matching the `cv_units` column that
`run_history.py` already emits into `validation_stats.csv` and the `cv_units`
key already present in the rainfall manifest. Nullable, because the column is
additive over tables that are currently empty and a future variable may not
have run its CV yet.

Revision ID: surface_cv_units
Revises: ingestion_log_idx
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'surface_cv_units'
down_revision = 'ingestion_log_idx'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('surface_run',
                  sa.Column('cv_units', sa.Text(), nullable=True))
    op.add_column('surface_validation_stats',
                  sa.Column('cv_units', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('surface_validation_stats', 'cv_units')
    op.drop_column('surface_run', 'cv_units')
