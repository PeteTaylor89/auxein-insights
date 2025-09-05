
"""timesheets init

Revision ID: 20250904_223831_timesheets_init
Revises: 20250901_drop_files
Create Date: 2025-09-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250904_223831_timesheets_init'
down_revision = '20250901_drop_files' 
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'timesheet_days',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('work_date', sa.Date(), nullable=False, index=True),
        sa.Column('status', sa.Enum('draft', 'submitted', 'approved', 'rejected', name='timesheetstatus'), nullable=False, server_default='draft'),
        sa.Column('day_hours', sa.Numeric(5, 2), nullable=True),
        sa.Column('entry_hours', sa.Numeric(5, 2), nullable=False, server_default='0.00'),
        sa.Column('uncoded_hours', sa.Numeric(5, 2), nullable=False, server_default='0.00'),
        sa.Column('effective_total_hours', sa.Numeric(5, 2), nullable=False, server_default='0.00'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('company_id', 'user_id', 'work_date', name='uq_timesheet_day_user_date'),
        sa.CheckConstraint('effective_total_hours >= 0', name='ck_tsd_effective_nonneg'),
        sa.CheckConstraint('uncoded_hours >= 0', name='ck_tsd_uncoded_nonneg'),
        sa.CheckConstraint('entry_hours >= 0', name='ck_tsd_entry_nonneg'),
        sa.CheckConstraint('entry_hours <= 24.00', name='ck_tsd_entry_le_24'),
        sa.CheckConstraint('(day_hours IS NULL) OR (day_hours >= 0)', name='ck_tsd_day_nonneg'),
        sa.CheckConstraint('(day_hours IS NULL) OR (day_hours <= 24.00)', name='ck_tsd_day_le_24'),
        sa.CheckConstraint('effective_total_hours <= 24.00', name='ck_tsd_effective_le_24'),
    )

    op.create_table(
        'time_entries',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('timesheet_day_id', sa.Integer(), sa.ForeignKey('timesheet_days.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('hours', sa.Numeric(5, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('hours >= 0', name='ck_te_hours_nonneg'),
        sa.CheckConstraint('hours <= 24.00', name='ck_te_hours_le_24'),
    )


def downgrade():
    op.drop_table('time_entries')
    op.drop_table('timesheet_days')
    op.execute("DROP TYPE IF EXISTS timesheetstatus")
