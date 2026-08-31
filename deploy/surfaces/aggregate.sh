#!/usr/bin/env bash
# The six-hourly rollup — daily aggregation, its sanity check, and disease
# pressure at every Pro site. What `daily-aggregation.yml` ran on GitHub Actions
# until 2026-08-31.
#
# Three steps, and the ORDER IS LOAD-BEARING. It is carried over verbatim from
# the workflow, where the reasoning was written down:
#
#   1. the rollup
#   2. `check_daily_climate` — the rollup's only alarm. A rollup that COMPLETED
#      is not a rollup that produced usable statistics, and the degenerate
#      signature (a Hilltop Interval without a Method returning a spot value) is
#      invisible to an exit code.
#   3. `populate_site_disease` LAST. Step 2 is deliberately non-fatal, but a
#      step ordered after a hard failure does not run at all — putting disease
#      before the check would trade the rollup's only alarm for it.
#
# Disease sits in THIS job rather than the 18:00 one because it reads
# `weather_data` hourly, not `weather_data_daily`. It depends on nothing the
# rollup produces and everything on the hourly ingest, so six-hourly is the
# cadence that matches its input; the 18:00 pipeline would make a grower wait a
# day for a wetness event.
#
# `35 */6 * * *` was a CADENCE, not a wall-clock time, so this job never needed
# the daylight-saving twin the 18:00 and 03:00 jobs did. It moves for the other
# reason: GitHub's scheduler is not a scheduler. Its runs on 2026-08-30 started
# at 05:43, 12:10, 16:56 and 21:27 UTC against a `:35` cron — drifting by up to
# 55 minutes, on the job whose whole purpose is a settled six-hour window.
set -euo pipefail
cd "${AUXEIN_SURFACE_HOME:-/app}/backend"

LOOKBACK="${LOOKBACK_DAYS:-3}"
nz() { TZ=Pacific/Auckland date "$@"; }

echo "[aggregate] lookback=${LOOKBACK}d (NZ now $(nz +'%F %T'))"

# Rollup only. The hourly, zone, phenology and disease stages belong to the
# 18:00 job and would race it from here.
echo "[aggregate] daily aggregation"
python scripts/run_daily_processing.py \
  --lookback-days "$LOOKBACK" \
  --skip-hourly --skip-zone --skip-phenology --skip-disease

# Non-fatal, exactly as `continue-on-error: true` made it on GitHub. This is a
# WARNING channel: a degenerate source should be shouted about, not used to
# abort a run whose rollup already succeeded.
echo "[aggregate] sanity check"
python scripts/check_daily_climate.py \
  --since "$(date -u -d '14 days ago' +%F)" || \
  echo "[aggregate] WARNING: check_daily_climate reported a problem (non-fatal)"

# The window ENDS YESTERDAY on a job that runs four times a day. The models
# score whole LOCAL days, and every one is driven through a count of wet hours,
# so a day only half over reads as a dry one. Freshness within the day is not
# worth a systematic under-call. Three days is the ingest's revision tail and
# the upsert is idempotent, so the overlap repairs a missed run.
#
# `--require-rows` turns "found nothing" into a non-zero exit. The designed-in
# failure mode of this platform is a silent no-op reporting success.
echo "[aggregate] disease pressure at Pro sites"
python scripts/populate_site_disease.py --days 3 --apply --require-rows

echo "[aggregate] done"
