# alembic/versions/YYYYMMDD_HHMMSS_add_subscription_table.py
"""Add subscription table and update companies

Revision ID: add_subscription_table
Revises: b83e5ec41c9c
Create Date: 2025-01-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import json

# revision identifiers
revision = 'add_subscription_table'
down_revision = 'b83e5ec41c9c'
branch_labels = None
depends_on = None

def upgrade():
    print("Creating subscriptions table...")
    
    # Create subscriptions table
    op.create_table('subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price_per_ha_monthly', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('price_per_ha_yearly', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('base_price_monthly', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('max_users', sa.Integer(), nullable=False),
        sa.Column('max_storage_gb', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('features', sa.JSON(), nullable=False),
        sa.Column('trial_days', sa.Integer(), nullable=False),
        sa.Column('trial_enabled', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('ix_subscriptions_id', 'subscriptions', ['id'], unique=False)
    op.create_index('ix_subscriptions_name', 'subscriptions', ['name'], unique=True)
    
    print("Inserting subscription data...")
    
    # Insert default subscription tiers
    connection = op.get_bind()
    connection.execute(sa.text("""
        INSERT INTO subscriptions (name, display_name, description, price_per_ha_monthly, price_per_ha_yearly, 
                                 base_price_monthly, currency, max_users, max_storage_gb, features, 
                                 trial_days, trial_enabled, is_active, is_public, sort_order) VALUES 
        ('free', 'Free Starter', 'Perfect for small vineyards getting started with digital vineyard management', 
         0.00, NULL, 0.00, 'USD', 1, 0.5, 
         '{"enabled_features": ["basic_blocks", "basic_observations"], "feature_config": {"basic_blocks": {"max_blocks": 3}, "basic_observations": {"max_per_month": 50}}}',
         0, false, true, true, 1),
        ('professional', 'Professional', 'Comprehensive vineyard management for growing operations', 
         5.00, 50.00, 15.00, 'USD', 5, 5.0,
         '{"enabled_features": ["basic_blocks", "basic_observations", "task_management", "weather_integration", "basic_analytics", "export_data"], "feature_config": {"export_data": {"max_exports_per_month": 20}, "weather_integration": {"forecast_days": 7}, "basic_analytics": {"retention_months": 12}}}',
         14, true, true, true, 2),
        ('business', 'Business', 'Advanced features for established vineyard operations', 
         8.00, 80.00, 40.00, 'USD', 15, 25.0,
         '{"enabled_features": ["basic_blocks", "basic_observations", "task_management", "weather_integration", "advanced_analytics", "export_data", "team_collaboration", "custom_reports", "api_access"], "feature_config": {"export_data": {"max_exports_per_month": 100}, "weather_integration": {"forecast_days": 14}, "advanced_analytics": {"retention_months": 24}, "api_access": {"requests_per_month": 10000}}}',
         30, true, true, true, 3),
        ('enterprise', 'Enterprise', 'Full-featured solution for large vineyard operations and consultants', 
         12.00, 120.00, 100.00, 'USD', -1, -1,
         '{"enabled_features": ["basic_blocks", "basic_observations", "task_management", "weather_integration", "advanced_analytics", "export_data", "team_collaboration", "custom_reports", "api_access", "white_label", "priority_support", "custom_integrations"], "feature_config": {"export_data": {"max_exports_per_month": -1}, "weather_integration": {"forecast_days": 30}, "advanced_analytics": {"retention_months": -1}, "api_access": {"requests_per_month": -1}, "priority_support": {"response_time_hours": 2}}}',
         30, true, true, true, 4)
    """))
    
    print("Adding new columns to companies table...")
    
    # Add new columns to companies table
    op.add_column('companies', sa.Column('total_hectares', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.0'))
    op.add_column('companies', sa.Column('subscription_external_id', sa.String(), nullable=True))
    op.add_column('companies', sa.Column('feature_overrides', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('companies', sa.Column('current_monthly_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('companies', sa.Column('current_yearly_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('companies', sa.Column('subscription_id', sa.Integer(), nullable=True))
    
    print("Creating foreign key...")
    
    # Create foreign key constraint for subscription_id column
    op.create_foreign_key('fk_companies_subscription_id', 'companies', 'subscriptions', ['subscription_id'], ['id'])
    
    print("Migrating subscription data...")
    
    # Update companies to use new subscription system
    # Map old subscription_tier values to new subscription IDs
    connection.execute(sa.text("""
        UPDATE companies 
        SET subscription_id = CASE 
            WHEN subscription_tier = 'free' THEN 1
            WHEN subscription_tier = 'basic' OR subscription_tier = 'professional' THEN 2
            WHEN subscription_tier = 'premium' OR subscription_tier = 'business' THEN 3
            WHEN subscription_tier = 'enterprise' THEN 4
            ELSE 1  -- Default to free
        END
    """))
    
    print("Making subscription_id required...")
    
    # Make subscription_id not nullable after setting values
    op.alter_column('companies', 'subscription_id', nullable=False)
    
    print("Cleaning up old columns...")
    
    # Check what columns actually exist before trying to drop them
    inspector = sa.inspect(connection)
    existing_columns = {col['name'] for col in inspector.get_columns('companies')}
    
    print(f"Current columns: {sorted(existing_columns)}")
    
    # Drop old columns that exist and are now handled by subscription table
    columns_to_remove = ['subscription_tier', 'max_users', 'max_storage_gb', 'max_blocks', 'feature_flags', 'subscription_amount']
    
    for column in columns_to_remove:
        if column in existing_columns:
            op.drop_column('companies', column)
            print(f"Dropped column: {column}")
        else:
            print(f"Column {column} does not exist, skipping")
    
    print("Migration completed successfully!")

def downgrade():
    print("Rolling back subscription migration...")
    
    # Check what columns exist
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_columns = {col['name'] for col in inspector.get_columns('companies')}
    
    # Add back old columns with default values from subscription table
    op.add_column('companies', sa.Column('subscription_tier', sa.String(), nullable=True))
    op.add_column('companies', sa.Column('max_users', sa.Integer(), nullable=True))
    op.add_column('companies', sa.Column('max_storage_gb', sa.Integer(), nullable=True))
    op.add_column('companies', sa.Column('max_blocks', sa.Integer(), nullable=True))
    op.add_column('companies', sa.Column('feature_flags', sa.JSON(), nullable=True))
    op.add_column('companies', sa.Column('subscription_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    
    # Migrate data back from subscription table
    connection.execute(sa.text("""
        UPDATE companies 
        SET subscription_tier = CASE 
            WHEN subscription_id = 1 THEN 'free'
            WHEN subscription_id = 2 THEN 'professional'
            WHEN subscription_id = 3 THEN 'business'
            WHEN subscription_id = 4 THEN 'enterprise'
            ELSE 'free'
        END,
        max_users = COALESCE((SELECT s.max_users FROM subscriptions s WHERE s.id = companies.subscription_id), 1),
        max_storage_gb = COALESCE((SELECT s.max_storage_gb FROM subscriptions s WHERE s.id = companies.subscription_id), 1),
        max_blocks = 10,
        feature_flags = COALESCE((SELECT s.features FROM subscriptions s WHERE s.id = companies.subscription_id), '{}')
    """))
    
    # Set not null constraints after populating data
    op.alter_column('companies', 'subscription_tier', nullable=False)
    op.alter_column('companies', 'max_users', nullable=False)
    op.alter_column('companies', 'max_storage_gb', nullable=False)
    op.alter_column('companies', 'max_blocks', nullable=False)
    op.alter_column('companies', 'feature_flags', nullable=False)
    
    # Drop new columns and constraints
    op.drop_constraint('fk_companies_subscription_id', 'companies', type_='foreignkey')
    
    new_columns = ['subscription_id', 'current_yearly_amount', 'current_monthly_amount', 'feature_overrides', 'subscription_external_id', 'total_hectares']
    for column in new_columns:
        if column in existing_columns:
            op.drop_column('companies', column)
    
    # Drop subscriptions table
    op.drop_index('ix_subscriptions_name', table_name='subscriptions')
    op.drop_index('ix_subscriptions_id', table_name='subscriptions')
    op.drop_table('subscriptions')
    
    print("Rollback completed!")