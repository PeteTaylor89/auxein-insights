"""Add audience column to site_banners.

Adds a `banneraudience` enum (`insights`, `grow`, `both`) and the `audience`
column on `site_banners`, defaulting to `insights` so all existing banners
remain Insights-only. New banners can target Grow or both products.

Prod safety:
  - Column NOT NULL with server default 'insights' — existing rows get the
    default at migration time, no backfill required.
  - Insights public endpoint will be updated in the same release to filter
    `audience IN ('insights','both')`. Until that ships, the new column is
    transparent to the existing query.

Revision ID: add_banner_audience
Revises: add_files_s3_key
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_banner_audience'
down_revision = 'add_files_s3_key'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE banneraudience AS ENUM ('insights', 'grow', 'both');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    op.execute("""
        ALTER TABLE site_banners
        ADD COLUMN IF NOT EXISTS audience banneraudience NOT NULL DEFAULT 'insights';
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_site_banners_audience ON site_banners (audience);")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_site_banners_audience;")
    op.execute("ALTER TABLE site_banners DROP COLUMN IF EXISTS audience;")
    op.execute("DROP TYPE IF EXISTS banneraudience;")
