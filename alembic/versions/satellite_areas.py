"""Satellite area statistics: monitored areas, access grants, jobs, scenes, per-area index rows

Revision ID: satellite_areas
Revises: vineyard_blocks_srid
Create Date: 2026-09-23

Phase 1 of the satellite indices plan. Eight new tables, additive only; nothing
is backfilled here. The Phase 0 spike (`scratchpad/satellite_spike/results.md`)
fixed several choices baked into this DDL, and those are recorded below.

## One engine, any outline: `monitored_area`

A vineyard block is one KIND of area. A high country paddock, a whole station
or a drawn outline is another. The ingest job reads Sentinel-2 over
`monitored_area.geometry` and never needs to know which it is. `land_use` picks
the science settings (season window, masks) instead.

The geometry is a **snapshot** in 4326 MultiPolygon, even for areas that point
at `vineyard_blocks` - a block edit must not silently rewrite the history
computed from the old outline. `geom_hash` is stamped on every observation row,
so the job can tell when a block's outline has changed and its history needs
rebuilding.

`block_id` is unique: there is ONE area per vineyard block, register or Grow.
That is what makes the next section work.

## Ownership lives in `area_grant`, not on the area

Processing belongs to the outline; access belongs to whoever is paying. A Pro
user who picks a register block gets a grant on the EXISTING area - and with it
nine years of history, instantly, with no new processing. A partner and a Pro
user watching the same block cost one read per scene, not two.

An area with no live grant is either a register block (it still feeds zone
figures) or should be paused. Customer blocks are processed only while
entitled; that rule is enforced by the job, which only picks up areas with
`status = 'active'`.

Exactly one owner column per grant, as in `insights_site.ck_insights_site_one_owner`.

## Observations: no zeros, no imagery

`area_index_obs` is one row per (area, scene). The writer skips scenes where
nothing inside the area was clear, so the row count stays near the number of
usable reads (Phase 0: ~50-100 a year per area before date de-duplication).
Every index column is NULLable and NULL means "not measured"; a zero would be a
reading. Only NDVI, NDMI and NDRE have columns - Phase 0 moved SAVI and NIRv to
v2, and adding columns later is cheaper than carrying dead ones.

`sat_scene.boa_offset` records the offset actually applied. Planetary Computer
has reprocessed pre-2022 scenes to baseline 05.x, so the offset follows each
scene's processing baseline and never its date; storing it makes that auditable.

## Composites, baselines, zones

Phase 0 found single reads too noisy to publish (NDVI sigma ~0.05), so the
customer-facing grain is `area_index_composite`: monthly everywhere, 16-day only
where cadence supports it. `area_index_baseline` is keyed by source so an S2
baseline (2017+) and a Landsat one (1984+, high country) can sit side by side.
`zone_index_monthly` is the planted-weighted zone rollup over register blocks.
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision = "satellite_areas"
down_revision = "vineyard_blocks_srid"
branch_labels = None
depends_on = None

INDEX_NAMES = "('ndvi','ndmi','ndre')"


def _ts(name, **kw):
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.text("now()"), **kw)


def upgrade():
    op.create_table(
        "monitored_area",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("land_use", sa.Text(), nullable=False, server_default="vineyard"),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("block_id", sa.Integer(),
                  sa.ForeignKey("vineyard_blocks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_id", sa.BigInteger(),
                  sa.ForeignKey("monitored_area.id", ondelete="CASCADE"), nullable=True),
        sa.Column("geometry", Geometry("MULTIPOLYGON", srid=4326, spatial_index=False),
                  nullable=False),
        sa.Column("geom_hash", sa.Text(), nullable=False),
        sa.Column("area_ha", sa.Numeric(12, 4), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("history_from", sa.Date(), nullable=True),
        sa.Column("history_complete", sa.Boolean(), nullable=False, server_default=sa.false()),
        _ts("created_at", nullable=False),
        _ts("updated_at", nullable=False),
        sa.CheckConstraint("kind IN ('vineyard_block','paddock','property')",
                           name="ck_monitored_area_kind"),
        sa.CheckConstraint("land_use IN ('vineyard','pasture','tussock','crop','orchard','other')",
                           name="ck_monitored_area_land_use"),
        sa.CheckConstraint("source IN ('register','grow','drawn','linz_parcel','upload')",
                           name="ck_monitored_area_source"),
        sa.CheckConstraint("status IN ('active','paused','archived')",
                           name="ck_monitored_area_status"),
        sa.CheckConstraint("area_ha > 0", name="ck_monitored_area_area_positive"),
        sa.CheckConstraint("ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry)",
                           name="ck_monitored_area_geometry_valid"),
    )
    op.create_index("ix_monitored_area_geometry", "monitored_area", ["geometry"],
                    postgresql_using="gist")
    op.create_index("uq_monitored_area_block", "monitored_area", ["block_id"], unique=True,
                    postgresql_where=sa.text("block_id IS NOT NULL"))
    op.create_index("ix_monitored_area_parent", "monitored_area", ["parent_id"])
    op.create_index("ix_monitored_area_status", "monitored_area", ["status"])

    op.create_table(
        "area_grant",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("area_id", sa.BigInteger(),
                  sa.ForeignKey("monitored_area.id", ondelete="CASCADE"), nullable=False),
        sa.Column("public_user_id", sa.Integer(),
                  sa.ForeignKey("public_users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("insights_account_id", sa.BigInteger(),
                  sa.ForeignKey("insights_account.id", ondelete="CASCADE"), nullable=True),
        sa.Column("partner_client_id", sa.Integer(),
                  sa.ForeignKey("partner_client.id", ondelete="CASCADE"), nullable=True),
        sa.Column("company_id", sa.Integer(),
                  sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("external_ref", sa.Text(), nullable=True),
        _ts("created_at", nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(public_user_id, insights_account_id, partner_client_id, company_id) = 1",
            name="ck_area_grant_one_owner"),
    )
    op.create_index("ix_area_grant_area", "area_grant", ["area_id"])
    for col in ("public_user_id", "insights_account_id", "partner_client_id", "company_id"):
        short = col.replace("_id", "")
        op.create_index(f"uq_area_grant_{short}", "area_grant", [col, "area_id"], unique=True,
                        postgresql_where=sa.text(f"{col} IS NOT NULL AND revoked_at IS NULL"))

    op.create_table(
        "area_job",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("area_id", sa.BigInteger(),
                  sa.ForeignKey("monitored_area.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="queued"),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("priority", sa.SmallInteger(), nullable=False, server_default="100"),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("requested_by_grant_id", sa.BigInteger(),
                  sa.ForeignKey("area_grant.id", ondelete="SET NULL"), nullable=True),
        sa.Column("locked_by", sa.Text(), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        _ts("created_at", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('initial','backfill','refresh','rebuild')",
                           name="ck_area_job_kind"),
        sa.CheckConstraint("status IN ('queued','running','done','failed')",
                           name="ck_area_job_status"),
    )
    # Worker claim order: SELECT ... WHERE status='queued' ORDER BY priority, created_at
    # FOR UPDATE SKIP LOCKED.
    op.create_index("ix_area_job_queue", "area_job", ["priority", "created_at"],
                    postgresql_where=sa.text("status = 'queued'"))
    op.create_index("uq_area_job_active", "area_job", ["area_id", "kind"], unique=True,
                    postgresql_where=sa.text("status IN ('queued','running')"))

    op.create_table(
        "sat_scene",
        sa.Column("item_id", sa.Text(), primary_key=True),
        sa.Column("collection", sa.Text(), nullable=False, server_default="sentinel-2-l2a"),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("mgrs_tile", sa.Text(), nullable=True),
        sa.Column("relative_orbit", sa.SmallInteger(), nullable=True),
        sa.Column("platform", sa.Text(), nullable=True),
        sa.Column("processing_baseline", sa.Text(), nullable=True),
        sa.Column("boa_offset", sa.SmallInteger(), nullable=False),
        sa.Column("epsg", sa.Integer(), nullable=True),
        sa.Column("cloud_cover", sa.REAL(), nullable=True),
        _ts("first_seen_at", nullable=False),
    )
    op.create_index("ix_sat_scene_tile_time", "sat_scene", ["mgrs_tile", "acquired_at"])

    stat_cols = [sa.Column(f"{ix}_{s}", sa.REAL(), nullable=True)
                 for ix in ("ndvi", "ndmi", "ndre") for s in ("mean", "p10", "p50", "p90", "sd")]
    op.create_table(
        "area_index_obs",
        sa.Column("area_id", sa.BigInteger(),
                  sa.ForeignKey("monitored_area.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("item_id", sa.Text(),
                  sa.ForeignKey("sat_scene.item_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("obs_date", sa.Date(), nullable=False),
        sa.Column("geom_hash", sa.Text(), nullable=False),
        sa.Column("n_total_10", sa.Integer(), nullable=False),
        sa.Column("n_valid_10", sa.Integer(), nullable=False),
        sa.Column("n_total_20", sa.Integer(), nullable=False),
        sa.Column("n_valid_20", sa.Integer(), nullable=False),
        *stat_cols,
        sa.Column("n_cloud", sa.Integer(), nullable=True),
        sa.Column("n_shadow", sa.Integer(), nullable=True),
        sa.Column("n_cirrus", sa.Integer(), nullable=True),
        sa.Column("n_snow", sa.Integer(), nullable=True),
        _ts("created_at", nullable=False),
        sa.CheckConstraint("n_valid_10 <= n_total_10 AND n_valid_20 <= n_total_20",
                           name="ck_area_index_obs_counts"),
    )
    op.create_index("ix_area_index_obs_area_date", "area_index_obs", ["area_id", "obs_date"])

    op.create_table(
        "area_index_composite",
        sa.Column("area_id", sa.BigInteger(),
                  sa.ForeignKey("monitored_area.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("index_name", sa.Text(), primary_key=True),
        sa.Column("period", sa.Text(), primary_key=True),
        sa.Column("period_start", sa.Date(), primary_key=True),
        sa.Column("median", sa.REAL(), nullable=True),
        sa.Column("p10", sa.REAL(), nullable=True),
        sa.Column("p90", sa.REAL(), nullable=True),
        sa.Column("n_obs", sa.SmallInteger(), nullable=False),
        sa.Column("n_valid_px", sa.Integer(), nullable=True),
        sa.Column("anomaly", sa.REAL(), nullable=True),
        sa.Column("percentile", sa.REAL(), nullable=True),
        sa.Column("baseline_source", sa.Text(), nullable=True),
        sa.Column("baseline_years", sa.SmallInteger(), nullable=True),
        _ts("updated_at", nullable=False),
        sa.CheckConstraint(f"index_name IN {INDEX_NAMES}", name="ck_area_index_composite_index"),
        sa.CheckConstraint("period IN ('month','16d')", name="ck_area_index_composite_period"),
        sa.CheckConstraint("percentile IS NULL OR percentile BETWEEN 0 AND 100",
                           name="ck_area_index_composite_percentile"),
    )

    op.create_table(
        "area_index_baseline",
        sa.Column("area_id", sa.BigInteger(),
                  sa.ForeignKey("monitored_area.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("index_name", sa.Text(), primary_key=True),
        sa.Column("source", sa.Text(), primary_key=True),
        sa.Column("bin_kind", sa.Text(), primary_key=True),
        sa.Column("bin", sa.SmallInteger(), primary_key=True),
        sa.Column("mean", sa.REAL(), nullable=True),
        sa.Column("sd", sa.REAL(), nullable=True),
        sa.Column("p10", sa.REAL(), nullable=True),
        sa.Column("p50", sa.REAL(), nullable=True),
        sa.Column("p90", sa.REAL(), nullable=True),
        sa.Column("n_years", sa.SmallInteger(), nullable=False),
        sa.Column("first_year", sa.SmallInteger(), nullable=True),
        sa.Column("last_year", sa.SmallInteger(), nullable=True),
        _ts("updated_at", nullable=False),
        sa.CheckConstraint(f"index_name IN {INDEX_NAMES}", name="ck_area_index_baseline_index"),
        sa.CheckConstraint("source IN ('s2','landsat')", name="ck_area_index_baseline_source"),
        sa.CheckConstraint("bin_kind IN ('month','doy16')", name="ck_area_index_baseline_bin_kind"),
    )

    op.create_table(
        "zone_index_monthly",
        sa.Column("zone_id", sa.Integer(),
                  sa.ForeignKey("climate_zones.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("index_name", sa.Text(), primary_key=True),
        sa.Column("year", sa.SmallInteger(), primary_key=True),
        sa.Column("month", sa.SmallInteger(), primary_key=True),
        sa.Column("mean", sa.REAL(), nullable=True),
        sa.Column("p10", sa.REAL(), nullable=True),
        sa.Column("p90", sa.REAL(), nullable=True),
        sa.Column("anomaly", sa.REAL(), nullable=True),
        sa.Column("n_areas", sa.Integer(), nullable=False),
        sa.Column("n_obs", sa.Integer(), nullable=False),
        sa.Column("planted_ha", sa.REAL(), nullable=True),
        sa.Column("coverage", sa.REAL(), nullable=True),
        _ts("updated_at", nullable=False),
        sa.CheckConstraint(f"index_name IN {INDEX_NAMES}", name="ck_zone_index_monthly_index"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="ck_zone_index_monthly_month"),
        sa.CheckConstraint("coverage IS NULL OR coverage BETWEEN 0 AND 1",
                           name="ck_zone_index_monthly_coverage"),
    )


def downgrade():
    for t in ("zone_index_monthly", "area_index_baseline", "area_index_composite",
              "area_index_obs", "sat_scene", "area_job", "area_grant", "monitored_area"):
        op.drop_table(t)
