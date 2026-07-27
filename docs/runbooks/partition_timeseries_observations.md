# Runbook — partition `timeseries_observations` (native, low-lock)

**Goal:** convert the live observations heap `timeseries_observations` (behind the
`weather_data` passthrough view) into a **yearly RANGE-partitioned** table, with
minimal locking on a shared production RDS, *before* the deep HBRC backfill lands
~100M rows in it.

**Why native partitioning, not TimescaleDB:** AWS RDS only runs Timescale's
Apache-2 edition — no compression, no continuous aggregates, no retention policies.
On RDS, Timescale gives only the chunking that native declarative partitioning
already gives, at the cost of an extension + `shared_preload_libraries` reboot +
vendor coupling. The continuous-aggregate role is already filled by
`weather_data_daily`. Reserve Timescale for a possible future Timescale Cloud move
(where compression would matter for the 100M-row archive).

**Mechanism (version-controlled):**
- `alembic/versions/part_timeseries_struct.py` — creates empty `timeseries_observations_part` + yearly partitions 1986–2031 + DEFAULT + indexes (BRIN on `timestamp`, `(station_id,timestamp DESC)`, `(variable,timestamp DESC)`). Safe to auto-run; touches nothing live.
- `alembic/versions/part_timeseries_swap.py` — **guarded** atomic swap. RAISES if the partitioned copy has fewer rows than live, so it cannot swap a partial table in on a routine deploy.

> **Do NOT apply both migrations in the same routine deploy.** Apply `struct`, run
> the copy (Stages 2–3), then apply `swap` in the maintenance window. If they run
> together before the copy, the `swap` guard aborts and fails the deploy loudly
> (safe — nothing changes, transaction rolls back).

---

## Stage 0 — Prerequisites / confirm before touching prod

```sql
SELECT version();                                   -- confirm RDS PG version (partitioning is fine on 11+, great on 13+)
SELECT count(*) AS live_rows FROM timeseries_observations;
SELECT pg_size_pretty(pg_total_relation_size('timeseries_observations')) AS live_size;
SELECT min("timestamp"), max("timestamp") FROM timeseries_observations;  -- confirm data is within 1986..2031
-- Identify the actual slow queries partitioning must help (so we can verify pruning later):
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE query ILIKE '%weather_data%' OR query ILIKE '%timeseries_observations%'
ORDER BY mean_exec_time DESC LIMIT 20;
```
Take a fresh RDS snapshot. Note `max(timestamp)` — if any rows predate 1986 or
exceed 2031 they land in the DEFAULT partition (fine, but note it).

## Stage 1 — Create the partitioned structure (no lock on live)

```
alembic upgrade part_timeseries_struct
```
Creates `timeseries_observations_part` empty. The live table is untouched; app keeps
reading/writing `weather_data` normally.

## Stage 2 — Batched copy (off-peak, no long lock)

Copy year-by-year. `INSERT … SELECT` reads the live table with only ACCESS SHARE
(does not block app reads/writes). `ON CONFLICT DO NOTHING` makes every batch
idempotent and re-runnable (so the Stage 3 catch-up is trivial).

```sql
-- Repeat per year Y from 1986 to current year. Run a few at a time, off-peak.
INSERT INTO timeseries_observations_part
SELECT * FROM timeseries_observations
WHERE "timestamp" >= 'Y-01-01 00:00:00+00' AND "timestamp" < '(Y+1)-01-01 00:00:00+00'
ON CONFLICT (station_id, "timestamp", variable) DO NOTHING;
```
After each year, sanity-check counts match:
```sql
SELECT (SELECT count(*) FROM timeseries_observations
        WHERE "timestamp" >= 'Y-01-01+00' AND "timestamp" < '(Y+1)-01-01+00') AS live_y,
       (SELECT count(*) FROM timeseries_observations_p{Y}) AS part_y;
```

## Stage 3 — Pause ingestion + final catch-up

Only the current-year partition still receives writes (ingestion writes recent
data). Pause writes, then re-copy the current year so counts converge.

1. Pause the GitHub Actions ingestion crons: disable `weather-ingestion.yml`,
   `synop-live.yml`, `daily-processing.yml` (Actions tab → workflow → Disable),
   or comment out their `schedule:` blocks. Confirm no run is in flight.
2. Re-copy the current year (idempotent):
   ```sql
   INSERT INTO timeseries_observations_part
   SELECT * FROM timeseries_observations
   WHERE "timestamp" >= '{CURRENT_YEAR}-01-01+00'
   ON CONFLICT (station_id, "timestamp", variable) DO NOTHING;
   ```
3. Confirm totals match: `SELECT count(*) FROM timeseries_observations;` vs
   `SELECT count(*) FROM timeseries_observations_part;` (part ≥ live required by the guard).

## Stage 4 — Atomic swap (sub-second hard lock)

```
alembic upgrade part_timeseries_swap
```
Guarded + atomic: drops the `weather_data` view, renames live → `timeseries_observations_old`,
renames `_part` → `timeseries_observations`, recreates the view. Only lock is a
brief ACCESS EXCLUSIVE during the renames.

## Stage 5 — Verify, then resume ingestion

```sql
-- Partition pruning working? Should scan a single yearly partition, not all.
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM weather_data
WHERE station_id = <id> AND "timestamp" >= now() - interval '7 days';

-- Row count parity vs the snapshot from Stage 0.
SELECT count(*) FROM timeseries_observations;
```
- Run an ingestion **dry-run** (`python ingestion/run_ingestion.py --source hbrc --dry-run`) and a real incremental to confirm writes route through the view into the right partition.
- Smoke-test Insights + Grow weather surfaces.
- Re-enable the three ingestion workflows.

## Stage 6 — Cleanup (after a soak period, e.g. 1–2 days)

```sql
DROP TABLE timeseries_observations_old;    -- releases the old heap's space
```
Optionally `ALTER INDEX … RENAME` the `ix_tsobs_part_*` indexes back to tidy names.

## Rollback

- **Before Stage 4:** nothing to undo — just `DROP TABLE timeseries_observations_part CASCADE;` (or `alembic downgrade part_timeseries_struct`'s predecessor).
- **After Stage 4, before Stage 6:** `alembic downgrade part_timeseries_struct` reverses the swap (renames `_old` back to live). The old heap is intact until Stage 6.
- **After Stage 6:** old heap is gone — restore from the Stage 0 snapshot if needed.

## Forward maintenance

Yearly partitions are pre-created through 2031. Before then, add a nightly/annual
step to ensure the next year's partition exists (or adopt `pg_partman` + `pg_cron`
for automation — that path needs a one-time `shared_preload_libraries` reboot).
Watch `timeseries_observations_pdefault` — any rows there mean a partition is missing.
