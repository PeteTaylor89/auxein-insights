"""Seed harvest/default ingestion credential and backfill existing Harvest devices.

Phase B1 of DATA_INGESTION_PLATFORM_PLAN.md.

Creates the canonical 'harvest/default' credential row pointing at the existing
HARVEST_API_KEY env var (back-compat fallback), then sets every active Harvest
device's `api_credential_ref` to 'harvest/default' so the post-deploy ingestion
code path is uniform: every Harvest device resolves through the credential
registry, no special-case env var lookup in the ingestion class.

Prod safety:
  - Old code (still deployed at migration time) does not read
    `api_credential_ref`, so the UPDATE is invisible to running ingestion.
  - The new credential row's env_var_fallback='HARVEST_API_KEY' means the
    resolver returns the same value the old code reads directly. Behaviour is
    byte-identical post-deploy.
  - Idempotent: ON CONFLICT DO NOTHING on the seed; UPDATE filters NULL refs
    only so re-running this migration after Phase B1.5 (where some devices
    may have moved to dedicated keys) won't clobber them.

Revision ID: seed_harvest_default_cred
Revises: link_south_coast_to_marl
Create Date: 2026-04-22
"""
from alembic import op


revision = 'seed_harvest_default_cred'
down_revision = 'link_south_coast_to_marl'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Seed the default Harvest credential row.
    # env_var_fallback path is what the resolver follows when secret_arn is NULL.
    op.execute("""
        INSERT INTO ingestion_credentials
            (provider, name, env_var_fallback, is_active, notes)
        VALUES
            ('HARVEST', 'default', 'HARVEST_API_KEY', true,
             'Default Auxein-owned Harvest API key (Phase B1).
              Resolves via HARVEST_API_KEY env var until rotated to AWS Secrets Manager.')
        ON CONFLICT (provider, name) DO NOTHING;
    """)

    # 2. Backfill every active Harvest device that doesn't already have a ref.
    #    Devices with non-NULL refs (e.g. site-specific keys added in Phase B1.5)
    #    are left untouched.
    op.execute("""
        UPDATE devices
        SET api_credential_ref = 'harvest/default'
        WHERE data_source = 'HARVEST'
          AND api_credential_ref IS NULL;
    """)


def downgrade():
    # Restore null refs first, then drop the credential row.
    op.execute("""
        UPDATE devices
        SET api_credential_ref = NULL
        WHERE data_source = 'HARVEST'
          AND api_credential_ref = 'harvest/default';
    """)
    op.execute("""
        DELETE FROM ingestion_credentials
        WHERE provider = 'HARVEST' AND name = 'default';
    """)
