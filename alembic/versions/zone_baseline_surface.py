"""A 1986-2005 daily zone baseline levelled to the surface archive.

Revision ID: zone_baseline_surface
Revises: zone_hourly_wind
Create Date: 2026-08-27

## Why a second table rather than a column or an overwrite

`climate_zone_daily_baseline` holds **NIWA BCSD downscaled model output**, not
observations. Measured against our own surface archive over the SAME 1986-2005
window and the same zones, the spring level differs by a median 0.27 degC and up
to 1.29 degC — small numbers that COMPOUND through a growing-degree-day
accumulation. Re-accumulated, a surface-derived crossing date measured against
that baseline shifts by three days or more in **14 of 22 zones** and by
**21 days in Ngaruroro**, which would publish as a fortnight-early flowering on
day one.

It is NOT overwritten, for two reasons:

  * **The projections are deltas off the BCSD baseline.** Replacing it in place
    would silently re-base every SSP scenario against a different reference.
  * A `source` discriminator on the existing table would double every row for
    any reader that forgot to filter, and there are six of them today. A
    separate table cannot be read by accident.

## What this is, honestly

**Surface level, BCSD shape.** There are no daily rasters before 2026 — the
archive is monthly — so a literally daily surface climatology cannot exist. The
day-to-day structure therefore still comes from BCSD; only the monthly LEVEL is
replaced, per calendar month, additively for temperature and by ratio for
rainfall. That is the identical construction `services/insights_site_baseline.py`
already uses to rescale a zone curve to a site, one level down.

It fixes the defect that was measured, which is a level offset. It does not
claim the within-month shape is observed.

`tmean_sd` and its siblings are carried across UNCHANGED and deliberately: they
are the spread of a day-of-vintage ACROSS the twenty baseline years, which is
what the GDD normal-integral needs. `climate_zone_surface_monthly.sd` is a
different quantity entirely and is not a substitute.

`gdd_base0_avg` / `gdd_base10_avg` are **re-integrated from the shifted mean and
that sd, never rescaled** — shifting a GDD climatology by a temperature offset
is not linear, because a degree gained in midsummer is a full degree-day and a
degree gained in the shoulders is a fraction of one.
"""
from alembic import op
import sqlalchemy as sa


revision = 'zone_baseline_surface'
down_revision = 'zone_hourly_wind'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'climate_zone_daily_baseline_surface',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('zone_id', sa.Integer(), nullable=False),
        sa.Column('day_of_vintage', sa.Integer(), nullable=False),

        sa.Column('tmean_avg', sa.Numeric(), nullable=True),
        sa.Column('tmean_sd', sa.Numeric(), nullable=True),
        sa.Column('tmin_avg', sa.Numeric(), nullable=True),
        sa.Column('tmin_sd', sa.Numeric(), nullable=True),
        sa.Column('tmax_avg', sa.Numeric(), nullable=True),
        sa.Column('tmax_sd', sa.Numeric(), nullable=True),
        sa.Column('gdd_base0_avg', sa.Numeric(), nullable=True),
        sa.Column('gdd_base0_sd', sa.Numeric(), nullable=True),
        sa.Column('gdd_base10_avg', sa.Numeric(), nullable=True),
        sa.Column('gdd_base10_sd', sa.Numeric(), nullable=True),
        sa.Column('gdd_base0_cumulative_avg', sa.Numeric(), nullable=True),
        sa.Column('gdd_base0_cumulative_sd', sa.Numeric(), nullable=True),
        sa.Column('rain_avg', sa.Numeric(), nullable=True),
        sa.Column('rain_sd', sa.Numeric(), nullable=True),
        sa.Column('solar_avg', sa.Numeric(), nullable=True),
        sa.Column('solar_sd', sa.Numeric(), nullable=True),

        # Provenance, on every row rather than in a docstring. The offset that
        # was applied to this day's month is the whole difference between this
        # table and the one it was derived from, so it must be legible without
        # re-deriving it.
        sa.Column('tmean_offset', sa.Numeric(), nullable=True),
        sa.Column('rain_ratio', sa.Numeric(), nullable=True),
        # True where the source day was itself interpolated. Day 243 —
        # 28 February — is absent from every zone in the BCSD table.
        sa.Column('interpolated', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),
        sa.Column('source_model_version', sa.Text(), nullable=True),
        sa.Column('built_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),

        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('uq_baseline_surface_zone_doy',
                    'climate_zone_daily_baseline_surface',
                    ['zone_id', 'day_of_vintage'], unique=True)


def downgrade():
    op.drop_index('uq_baseline_surface_zone_doy',
                  table_name='climate_zone_daily_baseline_surface')
    op.drop_table('climate_zone_daily_baseline_surface')
