#!/usr/bin/env bash
# Daily surface engine — the whole job, in the order that matters.
#
# JOB=surfaces  this file (the default)
# JOB=pipeline  the 18:00 NZ chain      -> pipeline.sh
# JOB=aggregate the six-hourly rollup   -> aggregate.sh
#
# MODE=daily  fits D-2 (see below)
# MODE=refit  re-fits D-9 .. D-3
# START/END   explicit window, overrides MODE
set -euo pipefail

# One image, three schedules. The other two jobs moved off GitHub Actions on
# 2026-08-31 and every dependency they need was already pinned here, so they
# dispatch from this entrypoint rather than getting an image of their own —
# a second image is a second thing to rebuild and a second place for the
# interpreter and the library set to drift apart.
#
# `exec`, not a call: the child replaces this shell, so its exit code is the
# task's exit code with nothing in between to swallow it.
case "${JOB:-surfaces}" in
  pipeline)  exec "$(dirname "$0")/pipeline.sh" ;;
  aggregate) exec "$(dirname "$0")/aggregate.sh" ;;
  surfaces)  ;;
  *) echo "[entrypoint] FATAL: unknown JOB=${JOB}" >&2; exit 2 ;;
esac

BUCKET="${SURFACE_BUCKET:-auxein-climate-surfaces}"
MODE="${MODE:-daily}"
cd "${AUXEIN_SURFACE_HOME:-/app}"

# NZ time, never UTC. `date -u` is YESTERDAY for the whole NZ morning, so a D-2
# window computed from it silently fits D-3 half of every day.
nz() { TZ=Pacific/Auckland date "$@"; }

if [[ -n "${START:-}" && -n "${END:-}" ]]; then
  :
elif [[ "$MODE" == "refit" ]]; then
  # `daily_aggregation` runs on a 6-hour cadence with a 3-day lookback, so
  # `weather_data_daily` keeps being revised for about three days. Without this
  # pass the surface and the DB disagree permanently, and invisibly.
  START="$(nz -d '9 days ago' +%F)"; END="$(nz -d '3 days ago' +%F)"
else
  # D+2, not D+1: ECAN_AIR lands ~24.8 h behind wall clock and is 10
  # thermometers in the largest temperature deficit region in the country.
  START="$(nz -d '2 days ago' +%F)"; END="$START"
fi

DAYS=$(( ( $(date -d "$END" +%s) - $(date -d "$START" +%s) ) / 86400 + 1 ))
# consolidate_db drops any station with fewer than 30 days in the staged
# window, so staging only the target day would drop EVERY station.
STAGE_START="$(date -d "$START -120 days" +%F)"

# QC APPLIES OVER THE RECENT TAIL, NOT THE WHOLE STAGE WINDOW.
#
# `daily_qc --apply` quarantines observations and re-aggregates the affected
# days, and this is the only job that runs a wide window. While the equivalent
# GitHub workflow was broken (2026-08-25..30) a backlog of historical findings
# built up unapplied: measured on 2026-08-30, the 120-day window holds 21
# rejects against ZERO in the recent 14 days, almost all `extreme_dtr` in April
# and May.
#
# Pointing QC at $STAGE_START would apply all of them on the first Fargate run
# and re-aggregate those days WITHOUT recomputing the zone rollups, disease or
# phenology built on them. That is a deliberate decision, not a side effect of
# moving a scheduler.
#
# 14 days covers `daily_aggregation`'s 3-day revision tail with wide margin,
# which is all the fit needs. Set QC_FULL_WINDOW=true to run the sweep on
# purpose — the same escape hatch the workflow exposes as a dispatch input.
if [[ "${QC_FULL_WINDOW:-false}" == "true" ]]; then
  QC_START="$STAGE_START"
else
  QC_START="$(date -d "$START -14 days" +%F)"
fi

echo "[surfaces] mode=$MODE window=$START..$END ($DAYS day/s), staging from $STAGE_START, QC from $QC_START"

echo "[surfaces] fetching grid, climatology and era-offset fields"
mkdir -p "backend/models/example data" \
         "docs/models/lris-nzenvds-total-annual-precipitation-v10-GTiff" \
         scratchpad/live_surfaces/era_fields
aws s3 cp "s3://$BUCKET/_assets/grid/VCDN_500m.csv" \
          "backend/models/example data/VCDN_500m.csv" --only-show-errors
aws s3 cp "s3://$BUCKET/_assets/lenz/precip_ann_uc.tif" \
          "docs/models/lris-nzenvds-total-annual-precipitation-v10-GTiff/precip_ann_uc.tif" \
          --only-show-errors
for v in temp_mean temp_min temp_max; do
  aws s3 sync "s3://$BUCKET/_fields/era_offset/$v/" \
              "scratchpad/live_surfaces/era_fields/$v/" --only-show-errors
done

# Assert on PRESENCE, not on the exit code of a sync that copied nothing. A
# missing era field would otherwise pass quietly and publish an UNCORRECTED
# surface under a corrected era's model_version — a step of up to ~1.5 degC in
# the middle of the record with nothing to flag it.
test -s "backend/models/example data/VCDN_500m.csv"
test -s "docs/models/lris-nzenvds-total-annual-precipitation-v10-GTiff/precip_ann_uc.tif"
for v in temp_mean temp_min temp_max; do
  n=$(ls scratchpad/live_surfaces/era_fields/$v/*.tif 2>/dev/null | wc -l)
  [ "$n" -eq 12 ] || { echo "[surfaces] FATAL: era field $v has $n/12 rasters"; exit 1; }
done

# QC BEFORE the fit. A fit-time screen protects only the surface; this also
# keeps the bad value out of climate_zone_daily, disease and phenology, and
# re-applies standing quarantine windows to late-arriving observations.
echo "[surfaces] QC"
python backend/scripts/daily_qc.py --start "$QC_START" --end "$END" --apply

echo "[surfaces] staging station inputs"
python backend/scripts/interpolation/consolidate_db.py \
  --variables temp_mean,temp_min,temp_max,rainfall \
  --start "$STAGE_START" --end "$END" \
  --out scratchpad/live_surfaces/inputs_daily

echo "[surfaces] fitting"
python backend/scripts/interpolation/run_live.py \
  --start "$START" --end "$END" \
  --inputs scratchpad/live_surfaces/inputs_daily \
  --out scratchpad/live_surfaces/daily_live \
  --era-offset-root scratchpad/live_surfaces/era_fields \
  --require-days "$DAYS"

echo "[surfaces] publishing"
# No --delete, ever. The bucket holds 29k+ archive objects and this tree
# contains only the days just fitted.
# `_runs/` carries this run's immutable record (parameters, code digest,
# station set, validation stats). It MUST be published: the Fargate task's
# filesystem is discarded, so a record that stays local never existed.
aws s3 sync scratchpad/live_surfaces/daily_live/ "s3://$BUCKET/" \
  --exclude "*" --include "surfaces/*" --include "_runs/*" --only-show-errors

echo "[surfaces] indexing"
python backend/scripts/index_daily.py \
  --manifest scratchpad/live_surfaces/daily_live/manifest.json

# AFTER indexing, because this reads `surface_run` rather than the manifest —
# an unindexed surface is invisible to it.
#
# It runs inside this job rather than on its own schedule for two reasons: it
# depends on this job's output, so a separate schedule would race it; and every
# separate schedule is another thing that can silently not fire.
#
# THE WINDOW IS PASSED EXPLICITLY. `populate_site_daily` computes its own from
# `date.today()`, which in a UTC container is the previous NZ day — it happens
# to line up with D-2 today, but only by coincidence of the offset, and it would
# not survive a change to this schedule. `--from/--to` covers exactly the days
# just fitted and tracks the daily and refit modes for free.
#
# `--require-surfaces` turns "found nothing" into a non-zero exit. The
# designed-in failure mode of this pipeline is a silent no-op reporting success,
# so a scheduled run asserts on a row count rather than an exit code.
echo "[surfaces] populating Pro site dailies"
python backend/scripts/populate_site_daily.py \
  --from "$START" --to "$END" \
  --require-surfaces

python - <<'PY'
import json, pathlib
m = json.loads(pathlib.Path(
    "scratchpad/live_surfaces/daily_live/manifest.json").read_text())
scr = m.get("outlier_screen", {})
for f in scr.get("by_station", []):
    tag = "PERSISTENT " if f["persistent"] else ""
    print(f"[surfaces] {tag}station {f['station_id']} rejected "
          f"{f['n_rejected']} station-day(s) ({100*f['trip_rate']:.0f}%), "
          f"residual {f['residual_min']:+.2f}..{f['residual_max']:+.2f}")
print(f"[surfaces] wrote {m['n_written']} surfaces, {m['n_skipped']} skipped")
PY
echo "[surfaces] done"
