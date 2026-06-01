"""Add spray_coverages table.

Per-(task, block) spray application-rate coverage: snapshotted inputs (swath,
flow, target), computed stats (sprayed/gap/overlap area, volume, min/avg/max
L/ha, % in tolerance), a GeoJSON grid payload, and a dissolved footprint
polygon. Built by services/spray_coverage.py on spray-task completion and
re-runnable on demand.

Revision ID: add_spray_coverage
Revises: set_assignment_task_cascade
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry


revision = 'add_spray_coverage'
down_revision = 'set_assignment_task_cascade'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'spray_coverages',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('block_id', sa.Integer(), sa.ForeignKey('vineyard_blocks.id'), nullable=False),
        sa.Column('asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=True),
        sa.Column('source_task_id', sa.Integer(), sa.ForeignKey('tasks.id'), nullable=True),

        # Snapshotted inputs
        sa.Column('swath_m', sa.Numeric(6, 2), nullable=True),
        sa.Column('flow_l_s', sa.Numeric(12, 4), nullable=True),
        sa.Column('target_lha', sa.Numeric(12, 4), nullable=True),
        sa.Column('tolerance_min_lha', sa.Numeric(12, 4), nullable=True),
        sa.Column('tolerance_max_lha', sa.Numeric(12, 4), nullable=True),
        sa.Column('cell_size_m', sa.Numeric(4, 1), nullable=True),
        sa.Column('speed_band_min_kmh', sa.Numeric(6, 2), nullable=True),
        sa.Column('speed_band_max_kmh', sa.Numeric(6, 2), nullable=True),
        sa.Column('max_gap_m', sa.Numeric(6, 1), nullable=True),

        # Stats
        sa.Column('sprayed_area_hectares', sa.Numeric(10, 4), nullable=True),
        sa.Column('block_area_hectares', sa.Numeric(10, 4), nullable=True),
        sa.Column('gap_area_hectares', sa.Numeric(10, 4), nullable=True),
        sa.Column('overlap_area_hectares', sa.Numeric(10, 4), nullable=True),
        sa.Column('computed_volume_l', sa.Numeric(12, 2), nullable=True),
        sa.Column('min_lha', sa.Numeric(12, 2), nullable=True),
        sa.Column('avg_lha', sa.Numeric(12, 2), nullable=True),
        sa.Column('max_lha', sa.Numeric(12, 2), nullable=True),
        sa.Column('pct_within_tolerance', sa.Numeric(5, 2), nullable=True),

        # Payload + geometry
        sa.Column('grid_geojson', postgresql.JSONB(), nullable=True),
        sa.Column('footprint_geometry', Geometry('GEOMETRY', srid=4326), nullable=True),

        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),

        sa.UniqueConstraint('task_id', 'block_id', name='uq_spray_coverage_task_block'),
    )

    op.create_index('ix_spray_coverage_company', 'spray_coverages', ['company_id'])
    op.create_index('ix_spray_coverage_block', 'spray_coverages', ['block_id'])
    op.create_index('ix_spray_coverage_task', 'spray_coverages', ['task_id'])
    op.create_index('ix_spray_coverage_footprint_geom', 'spray_coverages', ['footprint_geometry'], postgresql_using='gist')


def downgrade() -> None:
    op.drop_table('spray_coverages')
