"""Satellite area statistics models - `alembic/versions/satellite_areas.py`.

Sentinel-2 index statistics per monitored outline. Postgres holds statistics
only; **nothing here stores pixels** (same rule as `surface.py`). The reasoning
behind the shape - one engine for any outline, ownership in grants, snapshot
geometry with `geom_hash`, NULL never zero - lives in the migration and is not
repeated here.

Not yet imported in `db/models/__init__.py`: nothing outside the satellite job
and its tests uses these models yet, so they are imported directly until the
serving code (Phase 4) needs them registered.
"""

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, REAL, SmallInteger, Text, func,
)

from db.base_class import Base

INDEX_NAMES = ("ndvi", "ndmi", "ndre")
STATS = ("mean", "p10", "p50", "p90", "sd")


class MonitoredArea(Base):
    """One outline the satellite job reads: a vineyard block, paddock or property."""
    __tablename__ = "monitored_area"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    kind = Column(Text, nullable=False)                 # vineyard_block|paddock|property
    land_use = Column(Text, nullable=False, server_default="vineyard")
    source = Column(Text, nullable=False)               # register|grow|drawn|linz_parcel|upload
    block_id = Column(Integer, ForeignKey("vineyard_blocks.id", ondelete="SET NULL"))
    parent_id = Column(BigInteger, ForeignKey("monitored_area.id", ondelete="CASCADE"))
    geometry = Column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=False), nullable=False)
    geom_hash = Column(Text, nullable=False)
    area_ha = Column(Numeric(12, 4), nullable=False)
    status = Column(Text, nullable=False, server_default="active")
    history_from = Column(Date)
    history_complete = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AreaGrant(Base):
    """Who may read an area. Exactly one owner column is set."""
    __tablename__ = "area_grant"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(public_user_id, insights_account_id, partner_client_id, company_id) = 1",
            name="ck_area_grant_one_owner"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    area_id = Column(BigInteger, ForeignKey("monitored_area.id", ondelete="CASCADE"),
                     nullable=False)
    public_user_id = Column(Integer, ForeignKey("public_users.id", ondelete="CASCADE"))
    insights_account_id = Column(BigInteger, ForeignKey("insights_account.id", ondelete="CASCADE"))
    partner_client_id = Column(Integer, ForeignKey("partner_client.id", ondelete="CASCADE"))
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"))
    label = Column(Text)
    external_ref = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    revoked_at = Column(DateTime(timezone=True))


class AreaJob(Base):
    """Queued satellite work for one area; workers claim with FOR UPDATE SKIP LOCKED."""
    __tablename__ = "area_job"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    area_id = Column(BigInteger, ForeignKey("monitored_area.id", ondelete="CASCADE"),
                     nullable=False)
    kind = Column(Text, nullable=False)                 # initial|backfill|refresh|rebuild
    status = Column(Text, nullable=False, server_default="queued")
    date_from = Column(Date)
    date_to = Column(Date)
    priority = Column(SmallInteger, nullable=False, server_default="100")
    attempts = Column(SmallInteger, nullable=False, server_default="0")
    requested_by_grant_id = Column(BigInteger, ForeignKey("area_grant.id", ondelete="SET NULL"))
    locked_by = Column(Text)
    locked_at = Column(DateTime(timezone=True))
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))


class SatScene(Base):
    """A Sentinel-2 L2A item that has been read. `boa_offset` is what was applied."""
    __tablename__ = "sat_scene"

    item_id = Column(Text, primary_key=True)
    collection = Column(Text, nullable=False, server_default="sentinel-2-l2a")
    acquired_at = Column(DateTime(timezone=True), nullable=False)
    mgrs_tile = Column(Text)
    relative_orbit = Column(SmallInteger)
    platform = Column(Text)
    processing_baseline = Column(Text)
    boa_offset = Column(SmallInteger, nullable=False)
    epsg = Column(Integer)
    cloud_cover = Column(REAL)
    first_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Set only by a full-set run (every active area read); the daily job skips on
    # it. A per-area backfill inserts rows but leaves this NULL. See migration
    # sat_scene_processed.
    processed_at = Column(DateTime(timezone=True))


class AreaIndexObs(Base):
    """One area read from one scene. NULL index values mean not measured."""
    __tablename__ = "area_index_obs"

    area_id = Column(BigInteger, ForeignKey("monitored_area.id", ondelete="CASCADE"),
                     primary_key=True)
    item_id = Column(Text, ForeignKey("sat_scene.item_id", ondelete="CASCADE"), primary_key=True)
    obs_date = Column(Date, nullable=False)             # NZ local date of acquisition
    geom_hash = Column(Text, nullable=False)
    n_total_10 = Column(Integer, nullable=False)
    n_valid_10 = Column(Integer, nullable=False)
    n_total_20 = Column(Integer, nullable=False)
    n_valid_20 = Column(Integer, nullable=False)
    n_cloud = Column(Integer)
    n_shadow = Column(Integer)
    n_cirrus = Column(Integer)
    n_snow = Column(Integer)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


# ndvi_mean ... ndre_sd: fifteen identical REAL columns, added in a loop rather
# than spelled out so the model cannot drift from INDEX_NAMES x STATS.
for _ix in INDEX_NAMES:
    for _s in STATS:
        setattr(AreaIndexObs, f"{_ix}_{_s}", Column(f"{_ix}_{_s}", REAL))


class AreaIndexComposite(Base):
    """Customer-facing grain: one index over one period for one area."""
    __tablename__ = "area_index_composite"

    area_id = Column(BigInteger, ForeignKey("monitored_area.id", ondelete="CASCADE"),
                     primary_key=True)
    index_name = Column(Text, primary_key=True)
    period = Column(Text, primary_key=True)             # month|16d
    period_start = Column(Date, primary_key=True)
    median = Column(REAL)
    p10 = Column(REAL)
    p90 = Column(REAL)
    n_obs = Column(SmallInteger, nullable=False)
    n_valid_px = Column(Integer)
    anomaly = Column(REAL)
    percentile = Column(REAL)
    baseline_source = Column(Text)
    baseline_years = Column(SmallInteger)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AreaIndexBaseline(Base):
    """Per-area climatology for one index, by source (s2 2017+, landsat 1984+)."""
    __tablename__ = "area_index_baseline"

    area_id = Column(BigInteger, ForeignKey("monitored_area.id", ondelete="CASCADE"),
                     primary_key=True)
    index_name = Column(Text, primary_key=True)
    source = Column(Text, primary_key=True)             # s2|landsat
    bin_kind = Column(Text, primary_key=True)           # month|doy16
    bin = Column(SmallInteger, primary_key=True)
    mean = Column(REAL)
    sd = Column(REAL)
    p10 = Column(REAL)
    p50 = Column(REAL)
    p90 = Column(REAL)
    n_years = Column(SmallInteger, nullable=False)
    first_year = Column(SmallInteger)
    last_year = Column(SmallInteger)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ZoneIndexMonthly(Base):
    """Planted-weighted monthly zone rollup over register-block areas."""
    __tablename__ = "zone_index_monthly"

    zone_id = Column(Integer, ForeignKey("climate_zones.id", ondelete="CASCADE"),
                     primary_key=True)
    index_name = Column(Text, primary_key=True)
    year = Column(SmallInteger, primary_key=True)
    month = Column(SmallInteger, primary_key=True)
    mean = Column(REAL)
    p10 = Column(REAL)
    p90 = Column(REAL)
    anomaly = Column(REAL)
    n_areas = Column(Integer, nullable=False)
    n_obs = Column(Integer, nullable=False)
    planted_ha = Column(REAL)
    coverage = Column(REAL)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
