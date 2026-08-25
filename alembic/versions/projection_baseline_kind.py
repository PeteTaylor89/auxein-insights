"""Let `surface_projection_run` hold the 1986-2005 BASELINE as well as projections.

Revision ID: projection_baseline_kind
Revises: zone_projection_table
Create Date: 2026-08-25

## What this is for

The projection surfaces are a delta method — `projected = our own 1986-2005
normal + MfE's change field` — and the left-hand side of that has existed as 35
COGs since 2026-08-24 without ever being published or indexed. The Atlas can
therefore state the baseline as a NUMBER (`baseline_median`) but cannot draw it,
which is the one comparison that makes a projection legible: same layer, same
season, same colour scale, flip between them and watch the country change.

## Why here rather than in a table of its own

A normal is keyed by (variable, statistic, season, baseline window). That is
`surface_projection_run`'s key minus (scenario, period), and it is emphatically
NOT `surface_run`'s — that table requires a `valid_at`, and its `season` column
holds a vintage YEAR, not a season code like 'DJF'. The same impedance mismatch
that justified splitting this table off in the first place applies again, so the
baseline lands here, beside the projections it is the reference for.

## The sentinel, and the constraint that makes it safe

`kind` carries the distinction. `scenario` and `period` take the literal
'baseline' rather than becoming nullable, because Postgres treats NULLs as
DISTINCT in a unique index — two baseline rows with NULL scenario and NULL
period would both be accepted, and `uq_surface_projection_run` would silently
stop protecting the one thing it exists to protect.

The biconditional CHECK is the load-bearing part:

    (kind = 'baseline') = (scenario = 'baseline' AND period = 'baseline')

It fails BOTH ways. A baseline row cannot claim a real scenario, and a
projection row cannot carry the sentinel. Without it the sentinel is a
convention, and a convention is exactly what lets a 2090 scenario eventually be
served as a measurement.

## What a baseline row must NOT inherit

**`source`.** Every projection row carries the MfE CC BY 4.0 attribution because
MfE produced the change field. A baseline is OUR surface, reduced from our own
published monthly archive — attributing it to MfE would be wrong in the one
direction a licence notice must never be wrong. `model_version` is
`tps-2.0.0-ridge` for the same reason, not `mfe2024-ccam-mmm-v1`.

`delta_median`, `delta_p5`, `delta_p95` and `projected_median` are all nullable
already and stay NULL: a baseline is not a change from anything.
"""
from alembic import op
import sqlalchemy as sa


revision = 'projection_baseline_kind'
down_revision = 'zone_projection_table'
branch_labels = None
depends_on = None


# The existing enums plus the sentinel. Repeated here rather than imported from
# the creating migration: a migration has to describe the state it produces, and
# reaching into another revision's module makes that state depend on a file that
# may itself be edited later.
SCENARIOS = ('ssp126', 'ssp245', 'ssp370', 'baseline')
PERIODS = ('fp2021-2040', 'fp2041-2060', 'fp2080-2099',
           'wl1.5', 'wl2', 'wl3', 'baseline')
# `none` is the composition rule of a surface that was not composed.
RULES = ('additive', 'multiplicative', 'ratio', 'season_resolved', 'none')

OLD_SCENARIOS = ('ssp126', 'ssp245', 'ssp370')
OLD_PERIODS = ('fp2021-2040', 'fp2041-2060', 'fp2080-2099',
               'wl1.5', 'wl2', 'wl3')
OLD_RULES = ('additive', 'multiplicative', 'ratio', 'season_resolved')


def _quoted(values):
    return ", ".join(f"'{v}'" for v in values)


def upgrade():
    # NOT NULL with a server default, so the 576 existing rows are correctly
    # labelled by the ALTER itself rather than by a follow-up UPDATE that could
    # be interrupted half way.
    op.add_column(
        'surface_projection_run',
        sa.Column('kind', sa.Text(), nullable=False,
                  server_default='projection'))

    op.create_check_constraint(
        'ck_surface_projection_run_kind', 'surface_projection_run',
        "kind IN ('projection', 'baseline')")

    for name, column, values in (
        ('ck_surface_projection_run_scenario', 'scenario', SCENARIOS),
        ('ck_surface_projection_run_period', 'period', PERIODS),
        ('ck_surface_projection_run_rule', 'rule', RULES),
    ):
        op.drop_constraint(name, 'surface_projection_run', type_='check')
        op.create_check_constraint(
            name, 'surface_projection_run',
            f"{column} IN ({_quoted(values)})")

    # The one that matters. See the module note.
    op.create_check_constraint(
        'ck_surface_projection_run_baseline_sentinel', 'surface_projection_run',
        "(kind = 'baseline') = "
        "(scenario = 'baseline' AND period = 'baseline')")

    # A surface that was not composed has no composition rule.
    op.create_check_constraint(
        'ck_surface_projection_run_baseline_rule', 'surface_projection_run',
        "kind <> 'baseline' OR rule = 'none'")

    # `uq_surface_projection_run` already spans scenario and period, so with the
    # sentinels in place it keys baselines on
    # (country, variable, statistic, season, resolution, model_version) exactly
    # as required. It is deliberately left alone.
    #
    # The lookup index is not: `ix_surface_projection_run_lookup` leads with
    # (variable, scenario, period), which a baseline read never supplies in that
    # order. One partial index over the baseline rows only — 31 of them — costs
    # almost nothing and keeps the Atlas's flip off a sequential scan.
    op.create_index(
        'ix_surface_projection_run_baseline', 'surface_projection_run',
        ['variable', 'statistic', 'season'],
        postgresql_where=sa.text("kind = 'baseline'"))


def downgrade():
    op.drop_index('ix_surface_projection_run_baseline',
                  table_name='surface_projection_run')
    # Baseline rows cannot survive the constraints being narrowed again, and
    # leaving them would make the downgrade fail on the CHECK rather than on
    # anything a reader could diagnose.
    op.execute("DELETE FROM surface_projection_run WHERE kind = 'baseline'")

    op.drop_constraint('ck_surface_projection_run_baseline_rule',
                       'surface_projection_run', type_='check')
    op.drop_constraint('ck_surface_projection_run_baseline_sentinel',
                       'surface_projection_run', type_='check')

    for name, column, values in (
        ('ck_surface_projection_run_scenario', 'scenario', OLD_SCENARIOS),
        ('ck_surface_projection_run_period', 'period', OLD_PERIODS),
        ('ck_surface_projection_run_rule', 'rule', OLD_RULES),
    ):
        op.drop_constraint(name, 'surface_projection_run', type_='check')
        op.create_check_constraint(
            name, 'surface_projection_run',
            f"{column} IN ({_quoted(values)})")

    op.drop_constraint('ck_surface_projection_run_kind',
                       'surface_projection_run', type_='check')
    op.drop_column('surface_projection_run', 'kind')
