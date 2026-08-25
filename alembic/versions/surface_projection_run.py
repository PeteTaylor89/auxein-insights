"""Index table for MfE 2024 projection surfaces.

Revision ID: surface_projection_run
Revises: country_industry_dim
Create Date: 2026-08-24

## Why a separate table rather than a `projection` granularity on `surface_run`

`surface_run` is shaped end to end around a FITTED OBSERVATIONAL surface. It
requires `valid_at` (a real instant), and it carries `n_stations_fit`,
`n_stations_test`, `relevance_km`, `smoothing`, `edf`, `cv_rmse` — the
provenance of a spline fit against a station network.

A projection has none of that. It is not fitted, it has no stations, it has no
cross-validated error, and it is not keyed by a date at all: it is keyed by
(scenario, period, season). Adding it to `surface_run` would mean generalising
`ck_surface_run_granularity` a third time (it has already gone `records` ->
`season`), adding three nullable columns that every existing row would leave
NULL, and inventing a `valid_at` for a row that does not have one.

**The decisive argument is collision.** `surface_store.resolve` orders
`model_version DESC` and takes the first row. A projection sharing a variable,
statistic and `valid_at` with a real surface would win that lookup and a
grower would be shown a 2050 scenario as though it were measured weather. Today
`mfe2024-ccam-mmm-v1` happens to sort below `tps-...` lexically, but that is an
accident of the letters m and t, not a design. A separate table makes the
collision impossible by construction rather than by luck — the same reasoning
that keeps the `records` granularity from letting a 3-year maximum win
"all time".

## What a projection row is NOT allowed to imply

There is deliberately no `cv_rmse` column. The uncertainty of a projection is
the CMIP6 model spread, which the multi-model mean does not carry and which we
have not computed; leaving the column out stops anyone rendering our spline's
cross-validation error beside a 2090 number as if it applied.

`country_id` follows `surface_run`'s pattern from `country_industry_dim` — NOT
NULL with a New Zealand server default, and leading the unique index — so an
Australian projection is a distinct object rather than a duplicate on the day
that work starts.
"""
from alembic import op
import sqlalchemy as sa


revision = 'surface_projection_run'
down_revision = 'country_industry_dim'
branch_labels = None
depends_on = None


SCENARIOS = ('ssp126', 'ssp245', 'ssp370')
# ANN plus the four standard seasons, and SEPAPR for our own Sep-Apr growing
# season, which is the window gdd10 is defined on and which MfE does not
# publish directly.
SEASONS = ('ANN', 'DJF', 'MAM', 'JJA', 'SON', 'SEPAPR')
PERIODS = ('fp2021-2040', 'fp2041-2060', 'fp2080-2099', 'wl1.5', 'wl2', 'wl3')
RULES = ('additive', 'multiplicative', 'ratio', 'season_resolved')


def _quoted(values):
    return ", ".join(f"'{v}'" for v in values)


def upgrade():
    conn = op.get_bind()
    nz_id = conn.execute(
        sa.text("SELECT id FROM countries WHERE iso2 = 'NZ'")).scalar()
    if nz_id is None:
        raise RuntimeError(
            "no NZ row in `countries`; country_industry_dim must run first")

    op.create_table(
        'surface_projection_run',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('country_id', sa.Integer(), nullable=False,
                  server_default=str(nz_id)),

        sa.Column('variable', sa.Text(), nullable=False),
        sa.Column('statistic', sa.Text(), nullable=False),

        # What the projection is OF. These replace `valid_at` entirely.
        sa.Column('scenario', sa.Text(), nullable=False),
        sa.Column('period', sa.Text(), nullable=False),
        sa.Column('season', sa.Text(), nullable=False),

        # The baseline the change was expressed against, carried on every row
        # rather than assumed. A row whose baseline is not the Pro page's
        # 1986-2005 cannot be composed with a site's own normal, and the only
        # way to know is to read it here.
        sa.Column('baseline', sa.Text(), nullable=False),

        sa.Column('resolution_m', sa.Integer(), nullable=False),
        sa.Column('model_version', sa.Text(), nullable=False),
        # How our normal and their change were combined. Additive for
        # temperature and day counts, multiplicative for rainfall (whose change
        # field is a PERCENTAGE), season_resolved for gdd10.
        sa.Column('rule', sa.Text(), nullable=False),
        sa.Column('unit', sa.Text(), nullable=False),

        sa.Column('s3_key', sa.Text(), nullable=False),
        sa.Column('source', sa.Text(), nullable=True),

        # Enough summary to answer "how big is this change" without opening the
        # raster, and to make a bad publish obvious in a query.
        sa.Column('baseline_median', sa.Float(precision=53), nullable=True),
        sa.Column('projected_median', sa.Float(precision=53), nullable=True),
        sa.Column('delta_median', sa.Float(precision=53), nullable=True),
        sa.Column('delta_p5', sa.Float(precision=53), nullable=True),
        sa.Column('delta_p95', sa.Float(precision=53), nullable=True),

        sa.Column('status', sa.Text(), nullable=False, server_default='ok'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['country_id'], ['countries.id'],
                                name='fk_surface_projection_run_country'),
        sa.CheckConstraint(f"scenario IN ({_quoted(SCENARIOS)})",
                           name='ck_surface_projection_run_scenario'),
        sa.CheckConstraint(f"season IN ({_quoted(SEASONS)})",
                           name='ck_surface_projection_run_season'),
        sa.CheckConstraint(f"period IN ({_quoted(PERIODS)})",
                           name='ck_surface_projection_run_period'),
        sa.CheckConstraint(f"rule IN ({_quoted(RULES)})",
                           name='ck_surface_projection_run_rule'),
        sa.CheckConstraint("status IN ('ok', 'degraded', 'failed')",
                           name='ck_surface_projection_run_status'),
        # `wl3` is published for ssp370 only. Enforcing it stops a mislabelled
        # publish creating an ssp126 warming-level-3 row that does not exist in
        # the source data.
        sa.CheckConstraint("period <> 'wl3' OR scenario = 'ssp370'",
                           name='ck_surface_projection_run_wl3'),
    )

    op.create_index(
        'uq_surface_projection_run', 'surface_projection_run',
        ['country_id', 'variable', 'statistic', 'scenario', 'period',
         'season', 'resolution_m', 'model_version'],
        unique=True)
    # The lookup the Pro page and the Atlas will actually make: one variable,
    # one scenario, one period, across seasons.
    op.create_index(
        'ix_surface_projection_run_lookup', 'surface_projection_run',
        ['variable', 'scenario', 'period', 'season'])


def downgrade():
    op.drop_index('ix_surface_projection_run_lookup',
                  table_name='surface_projection_run')
    op.drop_index('uq_surface_projection_run',
                  table_name='surface_projection_run')
    op.drop_table('surface_projection_run')
