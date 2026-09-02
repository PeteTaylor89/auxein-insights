"""Pay rates, company cost settings and the task cost snapshot.

Revision ID: task_costing_tables
Revises: zone_baseline_surface
Create Date: 2026-08-28

Three tables, all new. Nothing is added to an existing table on purpose:
`settings.DATABASE_URL` resolves to the shared RDS instance for local runs too,
so a new column on `companies` would 500 every ORM query against it locally
between the model change and the migration. New tables cannot do that — only
code that queries them is affected, and there is none until it ships.

## user_pay_rate

Effective-dated rather than a column on `users`, so history does not reprice.
A pay rise in September must not change what June's pruning cost; resolution is
by the task's completion date, never by today's date.

## company_cost_settings

A separate table rather than columns on `companies`, for the reason above, and
because these are settings a company may never fill in — a NULL row is a
clearer "not configured" than four nullable columns on a table that is always
loaded.

`standard_day_hours` is the one that closes a live defect: contractor daily
rates were divided by a hardcoded 8, which overstated a 10-hour summer day by
25%. Until this is set, a daily-rate assignment stays honestly uncosted.

`on_cost_multiplier` matters more than it looks: a bare hourly rate understates
true employment cost by roughly 15-20% once holiday pay, ACC and KiwiSaver are
counted, and a model that ignores it is wrong in a consistent direction.

## task_cost

The snapshot. `rate_sources` is what makes a figure explainable a year later —
without it a disputed number cannot be defended. `is_superseded` lets a
recompute supersede rather than overwrite, so a correction leaves a trail.

Note the standing footgun on `task_id`: an unindexed FK turns a parent delete
into a sequential scan, so it is indexed here rather than left to chance.
"""
from alembic import op
import sqlalchemy as sa

revision = 'task_costing_tables'
down_revision = 'zone_baseline_surface'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_pay_rate',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('hourly_rate', sa.Numeric(10, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='NZD'),
        sa.Column('effective_from', sa.Date(), nullable=False),
        # NULL = still in force. Only one open-ended row per user should exist.
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('hourly_rate >= 0', name='ck_user_pay_rate_non_negative'),
        sa.CheckConstraint(
            'effective_to IS NULL OR effective_to >= effective_from',
            name='ck_user_pay_rate_range',
        ),
    )
    # Resolution always looks up (user, date), so this is the query index.
    op.create_index('ix_user_pay_rate_user_from', 'user_pay_rate', ['user_id', 'effective_from'])
    op.create_index('ix_user_pay_rate_company', 'user_pay_rate', ['company_id'])

    op.create_table(
        'company_cost_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'),
                  nullable=False, unique=True),
        # Fallback for staff with no pay rate on file. NULL means "no fallback" —
        # such a task reports as incomplete rather than costed at zero.
        sa.Column('default_hourly_rate', sa.Numeric(10, 2), nullable=True),
        # Holiday pay + ACC + KiwiSaver, e.g. 1.1800. NULL means not configured,
        # and costing applies 1.0 while saying so.
        sa.Column('on_cost_multiplier', sa.Numeric(5, 4), nullable=True),
        # The company's standard working day, for contractor daily rates.
        sa.Column('standard_day_hours', sa.Numeric(4, 2), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='NZD'),
        # last_price | weighted_average | fifo — decided as weighted_average.
        sa.Column('stock_costing_method', sa.String(20), nullable=False,
                  server_default='weighted_average'),
        # overhead | prorate | general_task — decided as overhead.
        sa.Column('uncoded_hours_policy', sa.String(20), nullable=False,
                  server_default='overhead'),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            'on_cost_multiplier IS NULL OR on_cost_multiplier >= 1',
            name='ck_cost_settings_on_cost',
        ),
        sa.CheckConstraint(
            'standard_day_hours IS NULL OR (standard_day_hours > 0 AND standard_day_hours <= 24)',
            name='ck_cost_settings_day_hours',
        ),
    )

    op.create_table(
        'task_cost',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id'), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('labour_cost_staff', sa.Numeric(12, 2), nullable=True),
        sa.Column('labour_cost_contractor', sa.Numeric(12, 2), nullable=True),
        sa.Column('consumable_cost', sa.Numeric(12, 2), nullable=True),
        # Equipment is Phase 4. NULL, not 0.00 — a silent zero would read as
        # "the machinery was free" rather than "not costed yet".
        sa.Column('asset_cost', sa.Numeric(12, 2), nullable=True),
        sa.Column('total_cost', sa.Numeric(12, 2), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='NZD'),
        sa.Column('staff_hours', sa.Numeric(8, 2), nullable=True),
        sa.Column('contractor_hours', sa.Numeric(8, 2), nullable=True),
        sa.Column('asset_hours', sa.Numeric(8, 2), nullable=True),
        sa.Column('on_cost_multiplier_applied', sa.Numeric(5, 4), nullable=True),
        # Hours worked by someone with no resolvable rate. Non-zero means the
        # total is an UNDERSTATEMENT and every consumer must say so rather than
        # render a confident number.
        sa.Column('unrated_staff_hours', sa.Numeric(8, 2), nullable=False, server_default='0'),
        # {user_pay_rate_ids: [...], stock_movement_ids: [...], assignment_ids: [...]}
        sa.Column('rate_sources', sa.JSON(), nullable=True),
        sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('computed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        # A recompute supersedes rather than overwrites, so a corrected figure
        # keeps the one it replaced.
        sa.Column('is_superseded', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_task_cost_task', 'task_cost', ['task_id'])
    op.create_index('ix_task_cost_company', 'task_cost', ['company_id'])
    # At most one live snapshot per task; superseded rows are unconstrained.
    op.create_index(
        'uq_task_cost_live', 'task_cost', ['task_id'],
        unique=True, postgresql_where=sa.text('is_superseded = false'),
    )


def downgrade():
    op.drop_index('uq_task_cost_live', table_name='task_cost')
    op.drop_index('ix_task_cost_company', table_name='task_cost')
    op.drop_index('ix_task_cost_task', table_name='task_cost')
    op.drop_table('task_cost')
    op.drop_table('company_cost_settings')
    op.drop_index('ix_user_pay_rate_company', table_name='user_pay_rate')
    op.drop_index('ix_user_pay_rate_user_from', table_name='user_pay_rate')
    op.drop_table('user_pay_rate')
