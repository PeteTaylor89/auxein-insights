"""Add task GPS summaries table

Revision ID: add_task_gps_summaries
Revises: add_asset_location
Create Date: 2026-04-10

"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = 'add_task_gps_summaries'
down_revision = 'add_asset_location'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'task_gps_summaries',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),

        # Geometry
        sa.Column('track_geometry', Geometry('MULTILINESTRING', srid=4326), nullable=True),
        sa.Column('coverage_geometry', Geometry('POLYGON', srid=4326), nullable=True),

        # Distance
        sa.Column('total_distance_meters', sa.Numeric(10, 2), nullable=True),
        sa.Column('total_distance_km', sa.Numeric(8, 3), nullable=True),

        # Duration
        sa.Column('active_duration_minutes', sa.Integer(), nullable=True),
        sa.Column('total_duration_minutes', sa.Integer(), nullable=True),

        # Counts
        sa.Column('total_points', sa.Integer(), nullable=True),
        sa.Column('total_segments', sa.Integer(), nullable=True),

        # Speed
        sa.Column('avg_speed_kmh', sa.Numeric(6, 2), nullable=True),
        sa.Column('max_speed_kmh', sa.Numeric(6, 2), nullable=True),
        sa.Column('time_stationary_minutes', sa.Integer(), nullable=True),
        sa.Column('time_moving_minutes', sa.Integer(), nullable=True),

        # Coverage
        sa.Column('coverage_area_hectares', sa.Numeric(10, 4), nullable=True),
        sa.Column('block_area_hectares', sa.Numeric(10, 4), nullable=True),
        sa.Column('coverage_percentage', sa.Numeric(5, 2), nullable=True),

        # Quality
        sa.Column('avg_accuracy_meters', sa.Numeric(6, 2), nullable=True),
        sa.Column('poor_accuracy_points', sa.Integer(), nullable=True),

        # Relations
        sa.Column('block_id', sa.Integer(), sa.ForeignKey('vineyard_blocks.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index('ix_gps_summary_company', 'task_gps_summaries', ['company_id'])
    op.create_index('ix_gps_summary_track_geom', 'task_gps_summaries', ['track_geometry'], postgresql_using='gist')
    op.create_index('ix_gps_summary_coverage_geom', 'task_gps_summaries', ['coverage_geometry'], postgresql_using='gist')


def downgrade() -> None:
    op.drop_table('task_gps_summaries')
