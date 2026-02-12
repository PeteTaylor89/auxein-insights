"""Add site_banners table

Revision ID: add_site_banners
Revises: add_notifications
Create Date: 2026-02-12

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'add_site_banners'
down_revision: str = 'add_notifications'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE bannertype AS ENUM ('update', 'coming_soon');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS site_banners (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            banner_type bannertype NOT NULL DEFAULT 'update',
            is_active BOOLEAN NOT NULL DEFAULT true,
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_site_banners_id ON site_banners (id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_banners_is_active ON site_banners (is_active);")


def downgrade():
    op.execute("DROP TABLE IF EXISTS site_banners;")
    op.execute("DROP TYPE IF EXISTS bannertype;")
