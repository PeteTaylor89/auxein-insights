#!/usr/bin/env bash
# JOB=monthly — close off a calendar month and publish its surfaces.
#
# Until 2026-09-03 there was NO standing job for this. Every monthly row in
# production was written by the one-off archive build on 21-23 August 2026, and
# every monthly table — surface_run, climate_zone_surface_monthly,
# insights_site_monthly, and the climate_history_monthly_surface view over the
# first of those — sat at 2026-07 while the daily engine ran twice a day.
#
# ## IT REDUCES THE PUBLISHED DAILIES; IT DOES NOT RE-FIT THE MONTH
#
# `run_history.py` built the archive by fitting every day in memory and reducing
# the block without publishing a daily surface. That was the only option before
# the daily engine existed. It now publishes every day, so the monthly product
# is built by reducing what is already served.
#
# Measured on 2026-07, the same month both ways, cell by cell:
#
#     temp_mean  bias -0.0126 degC   MAE 0.0537   max 0.5472
#     temp_min   bias -0.0028        MAE 0.0430   max 0.9600
#     temp_max   bias -0.0154        MAE 0.0495   max 0.5044
#     rainfall   bias -0.140 mm      MAE 0.831    on a 132 mm median
#
# So the engine change is a step of about 0.013 degC — twenty times smaller than
# the 0.27 degC provenance offset the record already discloses, and far inside a
# published cv_rmse of ~1.1. What it buys is that the monthly value IS the
# reduction of the daily ones rather than a second opinion about them, and that
# every correction the daily engine carries (station 1019 excluded, station 872
# quarantined, the era offset, the afternoon WRC re-fit) arrives here for free
# instead of having to be reproduced on a second code path.
#
# ## THE 10th, NOT THE 2nd
#
# The plan that scoped this said "2nd of each month". That is too early and
# would publish a month that then changes underneath the published surface:
#
#   * `daily_aggregation` runs with `--lookback-days 3`, so `weather_data_daily`
#     keeps being revised for about three days.
#   * `auxein-surfaces-refit` re-fits **D-9 .. D-3** every Sunday, so a day is
#     not final until it is more than nine days old AND a Sunday has passed.
#
# On the 10th every day of the previous month is at least D-10 and outside both
# windows. The monthly product is a climatological summary; nothing operational
# reads it, and eight days of latency is worth never publishing a month twice.
set -euo pipefail

cd "${AUXEIN_SURFACE_HOME:-/app}"

# NZ time, never UTC. `date -u` on the 1st of a month is still the previous
# month for the whole NZ morning, and a job that runs on the 10th would be
# unaffected — but the same mistake on a re-run near a boundary would silently
# close the wrong month.
nz() { TZ=Pacific/Auckland date "$@"; }

# The previous calendar month, or an explicit one for a backfill.
MONTH="${MONTH:-$(nz -d "$(nz +%Y-%m-01) -1 day" +%Y-%m)}"
TREE="${MONTHLY_TREE:-scratchpad/live_surfaces/monthly_reduce}"

echo "[monthly] closing $MONTH (NZ now $(nz +'%F %T'))"

# 1. REDUCE. Refuses a month whose daily record has a hole, because a month
#    reduced from 29 of 31 days understates its rainfall sum and every threshold
#    count — quietly, and in a way nothing downstream can detect.
echo "[monthly] reducing published dailies"
python backend/scripts/reduce_monthly.py --month "$MONTH" --out "$TREE"

# 2. PUBLISH. Uploads, merges the month into each variable's manifest-live.json
#    and validation_stats-live.csv on S3, then reindexes from the bucket.
#
#    The manifest merge is the step that cannot be skipped. A variable's whole
#    live era lives at ONE key, and `index_surfaces.py` reads that rather than
#    the rasters — so COGs uploaded without the merge exist in the bucket and
#    are invisible to everything, including a later re-index.
echo "[monthly] publishing"
python backend/scripts/publish_monthly.py --month "$MONTH" --tree "$TREE"

# 3. ZONE ROLL-UP. Samples the new surfaces through the planted-cell mask.
#    `climate_history_monthly_surface` is a VIEW over what this writes, so the
#    public climate-history explorer follows with nothing further to run.
#
#    SURFACE_MIRROR points at the tree step 1 just wrote rather than at a full
#    archive mirror: this job only ever has one month on disk, and the script
#    skips what it cannot find. The "surfaces missing from the mirror" count in
#    its output is therefore the other eleven months and is expected.
echo "[monthly] zone roll-up"
YEAR="${MONTH%%-*}"
SURFACE_MIRROR="$(pwd)/$TREE/$MONTH/surfaces/v2" \
  python backend/scripts/aggregate_zone_monthly.py \
    --from-year "$YEAR" --to-year "$YEAR"

# 4. PRO SITES. Ten cell reads per site for the new month, then the season
#    metrics recomputed from the database. NOT `populate_insights_sites.py`,
#    which re-extracts a site's whole record — that is ~7,700 reads per site and
#    would be half a million every month to add ten values each.
echo "[monthly] Pro site monthlies"
python backend/scripts/extend_site_monthly.py --month "$MONTH"

echo "[monthly] done — $MONTH is closed"
