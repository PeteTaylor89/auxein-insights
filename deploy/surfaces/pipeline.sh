#!/usr/bin/env bash
# The 18:00 NZ daily pipeline — QC, hourly rollup, zone rollup, phenology,
# disease. What `daily-processing.yml` ran on GitHub Actions until 2026-08-31.
#
# It is the same `run_daily_processing.py` the workflow invoked. Everything that
# was WRAPPED around it there is gone, and that is the point of the move:
#
#   * The two-cron DST pair and the "Resolve schedule" guard. GitHub's cron is
#     UTC only, so 18:00 NZ needed one entry for NZST and one for NZDT plus an
#     in-job guard to discard whichever was wrong. That machinery took the
#     pipeline dark for three days in August 2026 — both halves discarded
#     themselves, the workflow went green, and zone rollups, phenology and
#     disease simply stopped. EventBridge Scheduler resolves `Pacific/Auckland`
#     natively from ONE entry, so the guard has nothing left to get wrong.
#   * `pip install -r requirements.txt` on every run. The image is pinned.
#   * The scheduler's lateness. GitHub started this job 24-106 minutes late as a
#     rule and, measured on 2026-08-30, at 10:08 and 11:28 UTC against a 06:00
#     UTC cron — four hours.
#
# LOOKBACK IS NOT OPTIONAL. Stages 2-5 only gained `--lookback-days` on
# 2026-08-28; before that the zone branch advanced exactly one day per run and a
# skipped run left a permanent hole. A scheduler that can miss a day — every
# scheduler — needs the replay, so it is passed here rather than left to the
# script's default.
set -euo pipefail
cd "${AUXEIN_SURFACE_HOME:-/app}"

# NZ time, never UTC. `date -u` is YESTERDAY for the whole NZ morning, so a
# window computed from it silently processes the wrong day.
nz() { TZ=Pacific/Auckland date "$@"; }

LOOKBACK="${LOOKBACK_DAYS:-3}"
TARGET="${TARGET_DATE:-$(nz -d '1 day ago' +%F)}"

echo "[pipeline] target=$TARGET lookback=${LOOKBACK}d (NZ now $(nz +'%F %T'))"

cd backend
python scripts/run_daily_processing.py \
  --date "$TARGET" \
  --lookback-days "$LOOKBACK"

echo "[pipeline] done"
