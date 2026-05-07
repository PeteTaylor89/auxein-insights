"""Add asset_calibration_schedules (forward-looking calibration tickets).

Each row is a pending calibration that needs to happen by `due_date`. When the
calibration is performed (POST /calibrations with schedule_id), the schedule is
marked completed and a new pending row is auto-spawned (asset interval on pass,
7-day recheck on fail). Partial unique index enforces "at most one pending per
(asset, calibration_type)" so the unified feed never shows duplicates.

Includes a backfill: every active asset with requires_calibration=True gets one
pending schedule, due_date = latest calibration event's next_due_date if any
else today.

Prod safety:
  - Old code paths continue to work — POST /calibrations without `schedule_id`
    creates a free-standing event row exactly as before.
  - Backfill is idempotent (NOT EXISTS guard).

Revision ID: add_calibration_schedules
Revises: seed_harvest_default_cred
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_calibration_schedules'
down_revision = 'seed_harvest_default_cred'
branch_labels = None
depends_on = None


def upgrade():
    # 1. New table for forward-looking calibration tickets.
    op.create_table(
        'asset_calibration_schedules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),

        sa.Column('calibration_type', sa.String(50), nullable=False),
        sa.Column('parameter_name', sa.String(100)),
        sa.Column('unit_of_measure', sa.String(20)),
        sa.Column('target_value', sa.Numeric(12, 4)),
        sa.Column('tolerance_min', sa.Numeric(12, 4)),
        sa.Column('tolerance_max', sa.Numeric(12, 4)),

        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),

        sa.Column('completed_calibration_id', sa.Integer(), sa.ForeignKey('asset_calibrations.id'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),

        sa.Column('notes', sa.Text()),

        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
    )

    op.create_index('ix_asset_calibration_schedules_asset_id', 'asset_calibration_schedules', ['asset_id'])
    op.create_index('ix_asset_calibration_schedules_company_id', 'asset_calibration_schedules', ['company_id'])
    op.create_index('ix_asset_calibration_schedules_due_date', 'asset_calibration_schedules', ['due_date'])

    # Partial unique: at most one pending schedule per (asset, calibration_type).
    op.create_index(
        'ix_asset_calibration_schedules_pending_unique',
        'asset_calibration_schedules',
        ['asset_id', 'calibration_type'],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    # 2. Backlink from event rows to the schedule they resolved (nullable for legacy).
    op.add_column(
        'asset_calibrations',
        sa.Column('schedule_id', sa.Integer(), sa.ForeignKey('asset_calibration_schedules.id'), nullable=True),
    )
    op.create_index('ix_asset_calibrations_schedule_id', 'asset_calibrations', ['schedule_id'])

    # 3. Backfill — for every active asset that requires calibration and doesn't already
    # have a pending schedule, insert one. Due date derives from the latest event's
    # next_due_date if any, else today.
    op.execute("""
        INSERT INTO asset_calibration_schedules (
            asset_id, company_id, calibration_type, parameter_name, unit_of_measure,
            target_value, tolerance_min, tolerance_max, due_date, status, notes, created_at
        )
        SELECT
            a.id,
            a.company_id,
            COALESCE(latest.calibration_type, 'general')                 AS calibration_type,
            latest.parameter_name,
            latest.unit_of_measure,
            latest.target_value,
            latest.tolerance_min,
            latest.tolerance_max,
            COALESCE(latest.next_due_date, CURRENT_DATE)                 AS due_date,
            'pending',
            'Backfilled from latest calibration event'                   AS notes,
            NOW()
        FROM assets a
        LEFT JOIN LATERAL (
            SELECT calibration_type, parameter_name, unit_of_measure,
                   target_value, tolerance_min, tolerance_max, next_due_date
            FROM asset_calibrations c
            WHERE c.asset_id = a.id
            ORDER BY c.calibration_date DESC, c.id DESC
            LIMIT 1
        ) latest ON TRUE
        WHERE a.requires_calibration = TRUE
          AND a.is_active = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM asset_calibration_schedules s
            WHERE s.asset_id = a.id
              AND s.calibration_type = COALESCE(latest.calibration_type, 'general')
              AND s.status = 'pending'
          );
    """)


def downgrade():
    op.drop_index('ix_asset_calibrations_schedule_id', table_name='asset_calibrations')
    op.drop_column('asset_calibrations', 'schedule_id')

    op.drop_index('ix_asset_calibration_schedules_pending_unique', table_name='asset_calibration_schedules')
    op.drop_index('ix_asset_calibration_schedules_due_date', table_name='asset_calibration_schedules')
    op.drop_index('ix_asset_calibration_schedules_company_id', table_name='asset_calibration_schedules')
    op.drop_index('ix_asset_calibration_schedules_asset_id', table_name='asset_calibration_schedules')
    op.drop_table('asset_calibration_schedules')
