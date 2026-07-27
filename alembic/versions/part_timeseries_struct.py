"""Create the partitioned replica of timeseries_observations (structure only).

Phase 4.5 of the ingestion expansion — pre-backfill restructure so the deep
HBRC backfill (~100M rows) lands in a time-partitioned table instead of a single
unpartitioned heap. Native declarative partitioning (no TimescaleDB — RDS only
offers the Apache-2 edition, which cannot compress or do continuous aggregates,
so Timescale-on-RDS buys only the chunking that native partitioning already gives).

WHAT THIS MIGRATION DOES (safe to auto-run on deploy):
  - Creates an EMPTY partitioned table `timeseries_observations_part`, RANGE
    partitioned by `timestamp`, with a faithful copy of the live table's columns,
    defaults, primary key and indexes.
  - Pre-creates YEARLY partitions 1986..2031 + a DEFAULT catch-all.
  - Touches NOTHING on the live `timeseries_observations` / `weather_data` view.
    No data is copied and no swap happens here — that is the operator-run runbook
    (docs/runbooks/partition_timeseries_observations.md) + the guarded swap
    migration `part_timeseries_swap`.

Partition granularity: YEARLY. 46 partitions (1986-2031), growing 1/yr — low
planner overhead. Queries that filter on `timestamp` prune to a single year, then
the per-partition (station_id, timestamp DESC) index scans to the row. Revisit
monthly for hot recent years only if dashboard latency demands finer pruning.

Revision ID: part_timeseries_struct
Revises: catalog_windgust_watertemp
Create Date: 2026-07-21
"""
from alembic import op


revision = 'part_timeseries_struct'
down_revision = 'catalog_windgust_watertemp'
branch_labels = None
depends_on = None

FIRST_YEAR = 1986
LAST_YEAR = 2031  # backfill floor is 1986; pre-create a few yrs ahead of "now"


def upgrade() -> None:
    # Partitioned parent — column set MUST match timeseries_observations exactly
    # (station_id, timestamp, variable PK trio + value/unit/quality/created_at +
    # provenance source/quality_flags/quality_rank). The PK includes `timestamp`,
    # which declarative partitioning requires.
    op.execute("""
        CREATE TABLE IF NOT EXISTS timeseries_observations_part (
            station_id     INTEGER      NOT NULL,
            "timestamp"    TIMESTAMPTZ  NOT NULL,
            variable       VARCHAR(50)  NOT NULL,
            value          NUMERIC(10,4),
            unit           VARCHAR(20),
            quality        VARCHAR(20)  DEFAULT 'GOOD',
            created_at     TIMESTAMPTZ  DEFAULT NOW(),
            source         VARCHAR(20),
            quality_flags  JSONB,
            quality_rank   SMALLINT     NOT NULL DEFAULT 3,
            PRIMARY KEY (station_id, "timestamp", variable)
        ) PARTITION BY RANGE ("timestamp");
    """)

    # Yearly partitions [Jan 1 of Y, Jan 1 of Y+1). UTC bounds — timestamps are
    # stored tz-aware; range bounds compare on the same instant regardless of TZ.
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        op.execute(f"""
            CREATE TABLE IF NOT EXISTS timeseries_observations_p{year}
            PARTITION OF timeseries_observations_part
            FOR VALUES FROM ('{year}-01-01 00:00:00+00') TO ('{year + 1}-01-01 00:00:00+00');
        """)

    # DEFAULT catch-all: an out-of-range timestamp INSERTs here instead of failing.
    # Monitor it — any rows landing here mean a partition is missing (extend the
    # range before it fills, then detach+redistribute).
    op.execute("""
        CREATE TABLE IF NOT EXISTS timeseries_observations_pdefault
        PARTITION OF timeseries_observations_part DEFAULT;
    """)

    # Indexes on the parent propagate to every partition (PG 11+). Names are new
    # (the live table still owns weather_data_pkey / idx_weather_data_*); they get
    # tidied when the old table is dropped post-swap.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_tsobs_part_station_time
            ON timeseries_observations_part (station_id, "timestamp" DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_tsobs_part_variable_time
            ON timeseries_observations_part (variable, "timestamp" DESC);
    """)
    # BRIN on timestamp: tiny, ideal for append-only time-ordered data, cheap
    # min/max range pruning inside each yearly partition.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_tsobs_part_ts_brin
            ON timeseries_observations_part USING BRIN ("timestamp");
    """)


def downgrade() -> None:
    # Drops the replica and all its partitions (partitions cascade with the parent).
    op.execute("DROP TABLE IF EXISTS timeseries_observations_part CASCADE;")
