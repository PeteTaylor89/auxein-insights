"""add weather data tables v2

Revision ID: d655c05d9e8a
Revises: task_management
Create Date: 2026-01-12 19:04:45.871336

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2


# revision identifiers, used by Alembic.
revision: str = 'd655c05d9e8a'
down_revision: Union[str, None] = 'task_management'
branch_labels = None
depends_on = None


def upgrade():
    # Create weather_stations table
    # DEBUG: Let's see what database we're actually connected to
    conn = op.get_bind()
    
    # Get database connection info
    result = conn.execute(sa.text("SELECT current_database(), current_user, inet_server_addr(), inet_server_port()"))
    db_info = result.fetchone()
    print(f"\n{'='*60}")
    print(f"CONNECTED TO:")
    print(f"  Database: {db_info[0]}")
    print(f"  User: {db_info[1]}")
    print(f"  Host: {db_info[2]}")
    print(f"  Port: {db_info[3]}")
    print(f"{'='*60}\n")
    
    # Check if weather_stations table exists
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'weather_stations'
        )
    """))
    table_exists = result.scalar()
    print(f"weather_stations table exists: {table_exists}")
    
    # Check if index exists
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = 'idx_weather_stations_location'
        )
    """))
    index_exists = result.scalar()
    print(f"idx_weather_stations_location exists: {index_exists}\n")
    
    # If index exists but table doesn't, drop the orphaned index
    if index_exists and not table_exists:
        print("⚠️  Found orphaned index! Dropping it...")
        conn.execute(sa.text("DROP INDEX IF EXISTS idx_weather_stations_location CASCADE"))
        conn.commit()
        
    op.create_table(
        'weather_stations',
        sa.Column('station_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('station_code', sa.String(length=100), nullable=False),
        sa.Column('station_name', sa.String(length=255), nullable=True),
        sa.Column('data_source', sa.String(length=50), nullable=False),
        sa.Column('source_id', sa.String(length=200), nullable=True),
        sa.Column('latitude', sa.Numeric(precision=10, scale=8), nullable=True),
        sa.Column('longitude', sa.Numeric(precision=11, scale=8), nullable=True),
        sa.Column('elevation', sa.Integer(), nullable=True),
        sa.Column('location', geoalchemy2.types.Geography(
            geometry_type='POINT', 
            srid=4326, 
            from_text='ST_GeogFromText', 
            name='geography',
            spatial_index=False  # ADD THIS LINE - disable auto-index creation
        ), nullable=True),
        sa.Column('region', sa.String(length=100), nullable=True),
        sa.Column('notes', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=True),
        sa.PrimaryKeyConstraint('station_id'),
        sa.UniqueConstraint('station_code')
    )
    
    # Create indexes for weather_stations
    op.create_index('idx_weather_stations_source', 'weather_stations', ['data_source', 'is_active'])
    op.create_index('idx_weather_stations_region', 'weather_stations', ['region'])
    
    # NOW create the GIST index explicitly
    op.create_index('idx_weather_stations_location', 'weather_stations', ['location'], 
                    postgresql_using='gist')
    
    op.create_table(
        'weather_data',
        sa.Column('station_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('variable', sa.String(length=50), nullable=False),
        sa.Column('value', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('unit', sa.String(length=20), nullable=True),
        sa.Column('quality', sa.String(length=20), nullable=True, server_default='GOOD'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=True),
        sa.PrimaryKeyConstraint('station_id', 'timestamp', 'variable')
    )
    
    op.create_index(
        'idx_weather_data_station_time', 
        'weather_data', 
        ['station_id', sa.text('timestamp DESC')],
        postgresql_ops={'timestamp': 'DESC'}
    )
    op.create_index(
        'idx_weather_data_variable', 
        'weather_data',
        ['variable', sa.text('timestamp DESC')],
        postgresql_ops={'timestamp': 'DESC'}
    )
    
   
    op.create_table(
        'ingestion_log',
        sa.Column('log_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('data_source', sa.String(length=50), nullable=False),
        sa.Column('station_id', sa.Integer(), nullable=True),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('records_processed', sa.Integer(), nullable=True),
        sa.Column('records_inserted', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('error_msg', sa.String(), nullable=True),
        sa.Column('logged_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=True),
        sa.PrimaryKeyConstraint('log_id')
    )
    
    op.execute(sa.text("""
        CREATE VIEW station_latest_data AS
        SELECT 
            ws.station_code,
            ws.station_name,
            ws.data_source,
            ws.latitude,
            ws.longitude,
            ws.region,
            wd.variable,
            wd.value,
            wd.unit,
            wd.timestamp,
            wd.quality
        FROM weather_stations ws
        JOIN LATERAL (
            SELECT variable, value, unit, timestamp, quality
            FROM weather_data
            WHERE station_id = ws.station_id
            AND timestamp > NOW() - INTERVAL '7 days'
            ORDER BY timestamp DESC
            LIMIT 100
        ) wd ON true
        WHERE ws.is_active = true;
    """))


def downgrade():
    op.execute(sa.text("DROP VIEW IF EXISTS station_latest_data"))
    op.drop_table('ingestion_log')
    op.drop_table('weather_data')
    op.drop_table('weather_stations')
