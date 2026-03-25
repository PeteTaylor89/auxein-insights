"""Add climate_zone_id and forecast point to properties, calendar_feed_token to users.

Grow V1 Revision 2:
- properties.climate_zone_id: FK to climate_zones for regional insights fallback
- properties.forecast_latitude/forecast_longitude: MetOcean weather API forecast point
- users.calendar_feed_token: per-user iCal feed authentication token

Revision ID: r2_forecast_and_feed
Revises: add_properties_and_management
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'r2_forecast_and_feed'
down_revision = 'add_properties_and_management'
branch_labels = None
depends_on = None


def upgrade():
    # Properties: climate zone link + forecast point
    op.add_column('properties', sa.Column('climate_zone_id', sa.Integer(),
                  sa.ForeignKey('climate_zones.id'), nullable=True))
    op.add_column('properties', sa.Column('forecast_latitude', sa.Numeric(10, 7), nullable=True))
    op.add_column('properties', sa.Column('forecast_longitude', sa.Numeric(10, 7), nullable=True))

    op.create_index('ix_properties_climate_zone_id', 'properties', ['climate_zone_id'])

    # Users: iCal feed token
    op.add_column('users', sa.Column('calendar_feed_token', sa.String(64), nullable=True))
    op.create_index('ix_users_calendar_feed_token', 'users', ['calendar_feed_token'], unique=True)


def downgrade():
    op.drop_index('ix_users_calendar_feed_token', table_name='users')
    op.drop_column('users', 'calendar_feed_token')

    op.drop_index('ix_properties_climate_zone_id', table_name='properties')
    op.drop_column('properties', 'forecast_longitude')
    op.drop_column('properties', 'forecast_latitude')
    op.drop_column('properties', 'climate_zone_id')
