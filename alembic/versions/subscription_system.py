"""empty message

Revision ID: subscription_system
Revises: add_training_system
Create Date: 2025-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'subscription_system'
down_revision = 'add_training_system'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns for future expansion
    op.add_column('subscriptions', sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('subscriptions', sa.Column('minimum_hectares', sa.Numeric(10, 2), nullable=False, server_default='0.0'))
    op.add_column('subscriptions', sa.Column('maximum_hectares', sa.Numeric(10, 2), nullable=False, server_default='-1'))

    # Create the single powerful subscription
    op.execute("""
        INSERT INTO subscriptions (
            name, display_name, description,
            price_per_ha_monthly, price_per_ha_yearly, base_price_monthly,
            currency, max_users, max_storage_gb,
            features, trial_days, trial_enabled,
            is_active, is_public, is_primary, sort_order,
            minimum_hectares, maximum_hectares
        ) VALUES (
            'professional',
            'Professional',
            'Complete vineyard management platform with unlimited users and all features. Pricing based on hectares under vine.',
            15.00,  -- $15 per hectare per month
            150.00, -- $150 per hectare per year (2 months free)
            0.00,   -- No base price
            'USD',
            -1,     -- Unlimited users
            -1,     -- Unlimited storage
            '{
                "enabled_features": [
                    "vineyard_management",
                    "observation_tracking",
                    "task_management",
                    "weather_integration",
                    "harvest_planning",
                    "inventory_management",
                    "compliance_tracking",
                    "reporting_analytics",
                    "mobile_app",
                    "api_access",
                    "bulk_operations",
                    "advanced_filtering",
                    "export_data",
                    "team_collaboration",
                    "file_attachments",
                    "photo_uploads",
                    "gps_tracking",
                    "offline_mode",
                    "custom_fields",
                    "integrations",
                    "visitor_management",
                    "training_modules",
                    "risk_management",
                    "spatial_analysis"
                ],
                "feature_config": {
                    "max_photo_size_mb": 50,
                    "max_attachment_size_mb": 100,
                    "api_rate_limit_per_hour": 10000,
                    "bulk_operation_limit": 1000,
                    "custom_fields_per_entity": 50,
                    "integrations_allowed": -1
                }
            }'::json,
            14,     -- 14 day trial
            true,   -- Trial enabled
            true,   -- Active
            true,   -- Public
            true,   -- Primary subscription
            1,      -- Sort order
            0.0,    -- Minimum hectares
            -1      -- No maximum hectares
        )
        ON CONFLICT (name) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            description = EXCLUDED.description,
            price_per_ha_monthly = EXCLUDED.price_per_ha_monthly,
            price_per_ha_yearly = EXCLUDED.price_per_ha_yearly,
            max_users = EXCLUDED.max_users,
            max_storage_gb = EXCLUDED.max_storage_gb,
            features = EXCLUDED.features,
            is_primary = EXCLUDED.is_primary,
            updated_at = now();
    """)

    # Create a free tier for onboarding/demos (optional)
    op.execute("""
        INSERT INTO subscriptions (
            name, display_name, description,
            price_per_ha_monthly, price_per_ha_yearly, base_price_monthly,
            currency, max_users, max_storage_gb,
            features, trial_days, trial_enabled,
            is_active, is_public, is_primary, sort_order,
            minimum_hectares, maximum_hectares
        ) VALUES (
            'demo',
            'Demo Access',
            'Limited demo access for evaluation purposes. Up to 5 hectares.',
            0.00,   -- Free
            0.00,   -- Free
            0.00,   -- No base price
            'USD',
            3,      -- Limited users
            1.0,    -- 1GB storage
            '{
                "enabled_features": [
                    "vineyard_management",
                    "observation_tracking",
                    "task_management",
                    "mobile_app"
                ],
                "feature_config": {
                    "max_photo_size_mb": 5,
                    "max_attachment_size_mb": 10,
                    "api_rate_limit_per_hour": 100,
                    "bulk_operation_limit": 50
                }
            }'::json,
            30,     -- 30 day trial
            true,   -- Trial enabled
            true,   -- Active
            true,   -- Public
            false,  -- Not primary
            0,      -- Sort order (shows first)
            0.0,    -- Minimum hectares
            5.0     -- Maximum 5 hectares
        )
        ON CONFLICT (name) DO NOTHING;
    """)

    # Update existing companies to use the professional subscription
    op.execute("""
        UPDATE companies 
        SET subscription_id = (
            SELECT id FROM subscriptions WHERE name = 'professional' LIMIT 1
        )
        WHERE subscription_id = 1 OR subscription_id IS NULL;
    """)

    # Recalculate pricing for all companies
    op.execute("""
        UPDATE companies 
        SET current_monthly_amount = (
            SELECT CASE 
                WHEN s.price_per_ha_monthly > 0 THEN 
                    (COALESCE(s.base_price_monthly, 0) + (s.price_per_ha_monthly * COALESCE(companies.total_hectares, 0)))
                ELSE 0
            END
            FROM subscriptions s 
            WHERE s.id = companies.subscription_id
        ),
        current_yearly_amount = (
            SELECT CASE 
                WHEN s.price_per_ha_yearly > 0 THEN 
                    (COALESCE(s.base_price_monthly, 0) * 12 + (s.price_per_ha_yearly * COALESCE(companies.total_hectares, 0)))
                WHEN s.price_per_ha_monthly > 0 THEN
                    (COALESCE(s.base_price_monthly, 0) * 12 + (s.price_per_ha_monthly * 12 * COALESCE(companies.total_hectares, 0)))
                ELSE 0
            END
            FROM subscriptions s 
            WHERE s.id = companies.subscription_id
        );
    """)

def downgrade():
    # Remove added columns
    op.drop_column('subscriptions', 'maximum_hectares')
    op.drop_column('subscriptions', 'minimum_hectares')
    op.drop_column('subscriptions', 'is_primary')
    
    # Remove created subscriptions
    op.execute("DELETE FROM subscriptions WHERE name IN ('professional', 'demo');")