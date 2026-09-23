#!/usr/bin/env bash
# JOB=satellite — Sentinel-2 index statistics for every active monitored area.
#
# SAT_MODE=daily     (default, the 21:00 NZ schedule)
#   1. seed_monitored_areas   register blocks -> monitored_area, outline changes
#   2. satellite_ingest daily scenes from the last 10 days not yet read
#   3. satellite_ingest areas history for up to 200 areas that lack it
#
# SAT_MODE=backfill  (one-off, by hand: `aws ecs run-task` with env overrides)
#   satellite_ingest backfill from SAT_FROM (default 2017-01-01). Set
#   SAT_SHARD=i/N on N parallel tasks, then run ONE unsharded backfill: it skips
#   everything the shards stamped, retries their failures and marks history
#   complete. Run the daily seed first so every register block has an area.
#
# ## WHY 21:00 NZ
#
# Sentinel-2 crosses New Zealand at about 10:30-11:30 local time, and Planetary
# Computer typically publishes a scene some hours later. 21:00 picks up the same
# day's pass on most days. The 10-day lookback covers the rest: anything that
# lands late is read the next night, and a scene is skipped only once it has
# been read against every area (`sat_scene.processed_at`).
#
# ## WHY THE SEED RUNS HERE AND NOT IN BACKFILL
#
# N backfill shards seeding at once would race on the one-area-per-block unique
# index. Seeding once a night from this job is enough: a register block added
# today gets its history from step 3 tomorrow night.
#
# ## WHY STEP 3 IS CAPPED
#
# Until the archive backfill has run, every register area lacks history. The
# cap turns step 3 into a no-op in that state instead of a nine-year read of
# 8,700 areas inside a nightly job.

set -euo pipefail
cd "${AUXEIN_SURFACE_HOME:-/app}"

MODE="${SAT_MODE:-daily}"
echo "[satellite] mode=${MODE}"

case "$MODE" in
  daily)
    python backend/scripts/seed_monitored_areas.py --apply
    python backend/scripts/satellite_ingest.py --mode daily --apply --require-items
    python backend/scripts/satellite_ingest.py --mode areas --incomplete \
      --max-areas "${SAT_INCOMPLETE_MAX:-200}" --apply
    ;;
  backfill)
    python backend/scripts/satellite_ingest.py --mode backfill \
      --from "${SAT_FROM:-2017-01-01}" \
      ${SAT_SHARD:+--shard "$SAT_SHARD"} \
      --workers "${SAT_WORKERS:-12}" --apply
    ;;
  *) echo "[satellite] FATAL: unknown SAT_MODE=${MODE}" >&2; exit 2 ;;
esac

echo "[satellite] done"
