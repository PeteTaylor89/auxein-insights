"""add primary parcels table

Revision ID: 20241222_001
Revises: add_subscription_table
Create Date: 2025-06-22 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
import geoalchemy2

# revision identifiers
revision = '20241222_001'
down_revision = 'add_subscription_table'  
branch_labels = None
depends_on = None

def upgrade():
    # Get connection to check for existing objects
    conn = op.get_bind()
    
    # ===================================================================
    # CREATE PRIMARY PARCELS TABLE
    # ===================================================================
    
    # Check if table exists
    table_exists = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'primary_parcels'
        );
    """)).scalar()
    
    if not table_exists:
        op.create_table('primary_parcels',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('linz_id', sa.Integer(), nullable=False),
            sa.Column('appellation', sa.Text(), nullable=True),
            sa.Column('affected_surveys', ARRAY(sa.Text()), nullable=True),
            sa.Column('parcel_intent', sa.String(length=100), nullable=True),
            sa.Column('topology_type', sa.String(length=50), nullable=True),
            sa.Column('statutory_actions', ARRAY(sa.Text()), nullable=True),
            sa.Column('land_district', sa.String(length=100), nullable=True),
            sa.Column('titles', ARRAY(sa.Text()), nullable=True),
            sa.Column('survey_area', sa.Numeric(precision=15, scale=4), nullable=True),
            sa.Column('calc_area', sa.Numeric(precision=15, scale=4), nullable=True),
            sa.Column('geometry', geoalchemy2.types.Geometry(
                geometry_type='MULTIPOLYGON', 
                srid=2193, 
                from_text='ST_GeomFromEWKT', 
                name='geometry'
            ), nullable=True),
            sa.Column('geometry_wgs84', geoalchemy2.types.Geometry(
                geometry_type='MULTIPOLYGON', 
                srid=4326, 
                from_text='ST_GeomFromEWKT', 
                name='geometry'
            ), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('last_synced_at', sa.DateTime(), nullable=True),
            sa.Column('sync_batch_id', UUID(as_uuid=True), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.text('true')),
            sa.PrimaryKeyConstraint('id')
        )
        print("✅ Created primary_parcels table")
    else:
        print("⚠️ Table primary_parcels already exists, skipping creation")
    
    # Create indexes for primary_parcels (with existence checks)
    indexes_to_create = [
        ('idx_primary_parcels_geometry', ['geometry'], {'postgresql_using': 'gist'}),
        ('idx_primary_parcels_geometry_wgs84', ['geometry_wgs84'], {'postgresql_using': 'gist'}),
        ('idx_primary_parcels_linz_id', ['linz_id'], {'unique': True}),
        ('idx_primary_parcels_land_district', ['land_district'], {}),
        ('idx_primary_parcels_parcel_intent', ['parcel_intent'], {}),
        ('idx_primary_parcels_sync_batch', ['sync_batch_id'], {}),
        ('idx_primary_parcels_active', ['is_active'], {}),
        ('idx_primary_parcels_updated_at', ['updated_at'], {}),
    ]
    
    for index_name, columns, kwargs in indexes_to_create:
        index_exists = conn.execute(sa.text(f"""
            SELECT EXISTS (
                SELECT FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = '{index_name}' 
                AND n.nspname = 'public'
                AND c.relkind = 'i'
            );
        """)).scalar()
        
        if not index_exists:
            op.create_index(index_name, 'primary_parcels', columns, **kwargs)
            print(f"✅ Created index {index_name}")
        else:
            print(f"⚠️ Index {index_name} already exists, skipping")

    # ===================================================================
    # CREATE PARCEL SYNC LOGS TABLE
    # ===================================================================
    
    table_exists = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'parcel_sync_logs'
        );
    """)).scalar()
    
    if not table_exists:
        op.create_table('parcel_sync_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('batch_id', UUID(as_uuid=True), nullable=False),
            sa.Column('sync_type', sa.String(length=50), nullable=True),
            sa.Column('started_at', sa.DateTime(), nullable=True, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(length=50), nullable=True, server_default=sa.text("'running'")),
            sa.Column('total_records', sa.Integer(), nullable=True),
            sa.Column('processed_records', sa.Integer(), nullable=True, server_default=sa.text('0')),
            sa.Column('created_records', sa.Integer(), nullable=True, server_default=sa.text('0')),
            sa.Column('updated_records', sa.Integer(), nullable=True, server_default=sa.text('0')),
            sa.Column('deleted_records', sa.Integer(), nullable=True, server_default=sa.text('0')),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('triggered_by', sa.Integer(), nullable=True),
            sa.Column('metadata', JSONB(), nullable=True),
            sa.ForeignKeyConstraint(['triggered_by'], ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('batch_id')
        )
        print("✅ Created parcel_sync_logs table")
    else:
        print("⚠️ Table parcel_sync_logs already exists, skipping creation")
    
    # Create indexes for parcel_sync_logs
    sync_indexes = [
        ('idx_parcel_sync_logs_status', ['status']),
        ('idx_parcel_sync_logs_started_at', ['started_at']),
        ('idx_parcel_sync_logs_sync_type', ['sync_type']),
        ('idx_parcel_sync_logs_triggered_by', ['triggered_by']),
    ]
    
    for index_name, columns in sync_indexes:
        index_exists = conn.execute(sa.text(f"""
            SELECT EXISTS (
                SELECT FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = '{index_name}' 
                AND n.nspname = 'public'
                AND c.relkind = 'i'
            );
        """)).scalar()
        
        if not index_exists:
            op.create_index(index_name, 'parcel_sync_logs', columns)
            print(f"✅ Created index {index_name}")
        else:
            print(f"⚠️ Index {index_name} already exists, skipping")

    # ===================================================================
    # CREATE COMPANY LAND OWNERSHIP TABLE
    # ===================================================================
    
    table_exists = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'company_land_ownership'
        );
    """)).scalar()
    
    if not table_exists:
        op.create_table('company_land_ownership',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('land_parcel_id', sa.Integer(), nullable=False),
            sa.Column('ownership_type', sa.String(length=50), nullable=True, server_default=sa.text("'full'")),
            sa.Column('ownership_percentage', sa.Numeric(precision=5, scale=2), nullable=True, server_default=sa.text('100.00')),
            sa.Column('ownership_start_date', sa.Date(), nullable=True),
            sa.Column('ownership_end_date', sa.Date(), nullable=True),
            sa.Column('verified', sa.Boolean(), nullable=True, server_default=sa.text('false')),
            sa.Column('verification_method', sa.String(length=100), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['land_parcel_id'], ['primary_parcels.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('company_id', 'land_parcel_id')
        )
        print("✅ Created company_land_ownership table")
    else:
        print("⚠️ Table company_land_ownership already exists, skipping creation")
    
    # Create indexes for company_land_ownership
    ownership_indexes = [
        ('idx_company_land_ownership_company', ['company_id']),
        ('idx_company_land_ownership_parcel', ['land_parcel_id']),
        ('idx_company_land_ownership_verified', ['verified']),
        ('idx_company_land_ownership_ownership_type', ['ownership_type']),
    ]
    
    for index_name, columns in ownership_indexes:
        index_exists = conn.execute(sa.text(f"""
            SELECT EXISTS (
                SELECT FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = '{index_name}' 
                AND n.nspname = 'public'
                AND c.relkind = 'i'
            );
        """)).scalar()
        
        if not index_exists:
            op.create_index(index_name, 'company_land_ownership', columns)
            print(f"✅ Created index {index_name}")
        else:
            print(f"⚠️ Index {index_name} already exists, skipping")

    print("🎉 Migration completed successfully!")


def downgrade():
    # Drop tables in reverse order (to handle foreign key dependencies)
    
    # Drop company_land_ownership first (has foreign keys to primary_parcels)
    op.execute("DROP INDEX IF EXISTS idx_company_land_ownership_ownership_type")
    op.execute("DROP INDEX IF EXISTS idx_company_land_ownership_verified")
    op.execute("DROP INDEX IF EXISTS idx_company_land_ownership_parcel")
    op.execute("DROP INDEX IF EXISTS idx_company_land_ownership_company")
    op.execute("DROP TABLE IF EXISTS company_land_ownership")
    
    # Drop parcel_sync_logs (no foreign key dependencies)
    op.execute("DROP INDEX IF EXISTS idx_parcel_sync_logs_triggered_by")
    op.execute("DROP INDEX IF EXISTS idx_parcel_sync_logs_sync_type")
    op.execute("DROP INDEX IF EXISTS idx_parcel_sync_logs_started_at")
    op.execute("DROP INDEX IF EXISTS idx_parcel_sync_logs_status")
    op.execute("DROP TABLE IF EXISTS parcel_sync_logs")
    
    # Drop primary_parcels last (other tables reference it)
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_updated_at")
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_active")
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_sync_batch")
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_parcel_intent")
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_land_district")
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_linz_id")
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_geometry_wgs84")
    op.execute("DROP INDEX IF EXISTS idx_primary_parcels_geometry")
    op.execute("DROP TABLE IF EXISTS primary_parcels")
    
    print("🧹 Rollback completed successfully!")