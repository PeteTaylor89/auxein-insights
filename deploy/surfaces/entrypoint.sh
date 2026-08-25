#!/usr/bin/env bash
# Daily surface engine — the whole job, in the order that matters.
#
# MODE=daily  fits D-2 (see below)
# MODE=refit  re-fits D-9 .. D-3
# START/END   explicit window, overrides MODE
set -euo pipefail

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
echo "[surfaces] mode=$MODE window=$START..$END ($DAYS day/s), staging from $STAGE_START"

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
python backend/scripts/daily_qc.py --start "$STAGE_START" --end "$END" --apply

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
