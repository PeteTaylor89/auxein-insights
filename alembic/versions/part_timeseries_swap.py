"""Swap the partitioned replica in for timeseries_observations (GUARDED).

Phase 4.5, final step. Run this ONLY after the runbook's batched copy + final
catch-up have populated `timeseries_observations_part`, with ingestion paused so
row counts are stable (docs/runbooks/partition_timeseries_observations.md).

It is deliberately SEPARATE from `part_timeseries_struct` and GUARDED so a routine
deploy cannot silently swap an empty/partial table in for the live one: the guard
counts both tables and RAISES if the partitioned copy has fewer rows than live.

The swap itself is one atomic transaction (Alembic wraps upgrade()): drop the
`weather_data` view, rename live -> `_old`, rename `_part` -> live, recreate the
view. The only hard lock is a sub-second ACCESS EXCLUSIVE during the renames.
The old table is kept as `timeseries_observations_old` for rollback until the
runbook's cleanup stage drops it.

Revision ID: part_timeseries_swap
Revises: part_timeseries_struct
Create Date: 2026-07-21
"""
from alembic import op


revision = 'part_timeseries_swap'
down_revision = 'part_timeseries_struct'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # GUARD: abort unless the partitioned copy is fully populated. Prevents an
    # accidental swap on a normal deploy before the copy runbook has been run.
    op.execute("""
        DO $$
        DECLARE
            live_ct BIGINT;
            part_ct BIGINT;
        BEGIN
            IF to_regclass('public.timeseries_observations_part') IS NULL THEN
                RAISE EXCEPTION 'timeseries_observations_part missing — apply part_timeseries_struct and run the copy runbook first';
            END IF;
            SELECT count(*) INTO live_ct FROM timeseries_observations;
            SELECT count(*) INTO part_ct FROM timeseries_observations_part;
            IF part_ct < live_ct THEN
                RAISE EXCEPTION USING MESSAGE =
                  'Refusing to swap: partitioned copy has ' || part_ct::text ||
                  ' rows but live has ' || live_ct::text ||
                  ' — finish the batched copy + final catch-up (ingestion paused) first';
            END IF;
        END $$;
    """)

    # Atomic swap. weather_data is a passthrough view; recreate it to point at the
    # new physical table so every caller keeps working unchanged.
    op.execute("DROP VIEW IF EXISTS weather_data;")
    op.execute("ALTER TABLE timeseries_observations RENAME TO timeseries_observations_old;")
    op.execute("ALTER TABLE timeseries_observations_part RENAME TO timeseries_observations;")
    op.execute("CREATE VIEW weather_data AS SELECT * FROM timeseries_observations;")


def downgrade() -> None:
    # Reverse the swap. Requires timeseries_observations_old to still exist
    # (i.e. before the runbook cleanup stage drops it).
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('public.timeseries_observations_old') IS NULL THEN
                RAISE EXCEPTION 'timeseries_observations_old missing — cannot reverse swap (old heap already dropped)';
            END IF;
        END $$;
    """)
    op.execute("DROP VIEW IF EXISTS weather_data;")
    op.execute("ALTER TABLE timeseries_observations RENAME TO timeseries_observations_part;")
    op.execute("ALTER TABLE timeseries_observations_old RENAME TO timeseries_observations;")
    op.execute("CREATE VIEW weather_data AS SELECT * FROM timeseries_observations;")
