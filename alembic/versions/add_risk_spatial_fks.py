"""Add block_id + spatial_area_id FKs to site_risks (with PostGIS backfill).

Today site_risks carries `location POINT` and `area POLYGON` but no FK to
the entities the risk actually belongs to. That makes it impossible to
answer "which active risks apply to this block?" without a per-request
PostGIS join — and it means hazard chips on the task surfaces can't be
served by a cheap indexed query.

This migration:
  1. Adds nullable `block_id` + `spatial_area_id` columns
     (ON DELETE SET NULL — risks survive when a block/area is removed).
  2. Creates indexes mirroring the `tasks` table pattern.
  3. Backfills both columns from PostGIS:
       a) Risks with `location` POINT          → ST_Contains(point)
       b) Risks with `area` POLYGON (no point) → ST_Contains(centroid)
     Scoped by company_id so a risk can't accidentally pick up a block
     from a different tenant. property_id (when set) further narrows.

Backfill stays NULL when no containing block/area exists — operators can
attach the FK manually via the risk edit form.

Revision ID: add_risk_spatial_fks
Revises: add_block_status
Create Date: 2026-05-24
"""
from alembic import op


revision = 'add_risk_spatial_fks'
down_revision = 'add_block_status'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add nullable FK columns
    op.execute(
        "ALTER TABLE site_risks "
        "ADD COLUMN IF NOT EXISTS block_id INTEGER "
        "REFERENCES vineyard_blocks(id) ON DELETE SET NULL;"
    )
    op.execute(
        "ALTER TABLE site_risks "
        "ADD COLUMN IF NOT EXISTS spatial_area_id INTEGER "
        "REFERENCES spatial_areas(id) ON DELETE SET NULL;"
    )

    # 2. Indexes — mirror tasks (block_id, status) / (spatial_area_id, status)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_risks_block_id "
        "ON site_risks (block_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_risks_spatial_area_id "
        "ON site_risks (spatial_area_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_risks_block_status "
        "ON site_risks (block_id, status);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_risks_spatial_area_status "
        "ON site_risks (spatial_area_id, status);"
    )

    # 3a. Backfill block_id from POINT location
    op.execute(
        """
        UPDATE site_risks r
        SET block_id = b.id
        FROM vineyard_blocks b
        WHERE r.block_id IS NULL
          AND r.location IS NOT NULL
          AND b.geometry IS NOT NULL
          AND b.company_id = r.company_id
          AND (r.property_id IS NULL OR b.property_id = r.property_id)
          AND ST_Contains(b.geometry, r.location);
        """
    )

    # 3b. Backfill block_id from POLYGON area centroid (only where 3a didn't hit)
    op.execute(
        """
        UPDATE site_risks r
        SET block_id = b.id
        FROM vineyard_blocks b
        WHERE r.block_id IS NULL
          AND r.area IS NOT NULL
          AND b.geometry IS NOT NULL
          AND b.company_id = r.company_id
          AND (r.property_id IS NULL OR b.property_id = r.property_id)
          AND ST_Contains(b.geometry, ST_Centroid(r.area));
        """
    )

    # 3c. Backfill spatial_area_id from POINT location
    op.execute(
        """
        UPDATE site_risks r
        SET spatial_area_id = s.id
        FROM spatial_areas s
        WHERE r.spatial_area_id IS NULL
          AND r.location IS NOT NULL
          AND s.geometry IS NOT NULL
          AND s.company_id = r.company_id
          AND s.is_active = TRUE
          AND ST_Contains(s.geometry, r.location);
        """
    )

    # 3d. Backfill spatial_area_id from POLYGON area centroid (fallback)
    op.execute(
        """
        UPDATE site_risks r
        SET spatial_area_id = s.id
        FROM spatial_areas s
        WHERE r.spatial_area_id IS NULL
          AND r.area IS NOT NULL
          AND s.geometry IS NOT NULL
          AND s.company_id = r.company_id
          AND s.is_active = TRUE
          AND ST_Contains(s.geometry, ST_Centroid(r.area));
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_site_risks_spatial_area_status;")
    op.execute("DROP INDEX IF EXISTS ix_site_risks_block_status;")
    op.execute("DROP INDEX IF EXISTS ix_site_risks_spatial_area_id;")
    op.execute("DROP INDEX IF EXISTS ix_site_risks_block_id;")
    op.execute("ALTER TABLE site_risks DROP COLUMN IF EXISTS spatial_area_id;")
    op.execute("ALTER TABLE site_risks DROP COLUMN IF EXISTS block_id;")
