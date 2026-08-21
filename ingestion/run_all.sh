#!/usr/bin/env bash
# Auxein weather ingestion — hourly wrapper for the AWS (Sydney) box.
# Runs each source with modest parallelism, each capped at 40 min. Config below is
# non-secret; RDS creds come from Secrets Manager (RDS_SECRET_NAME + instance IAM
# role), and the two app secrets come from SSM Parameter Store at runtime.
#
# Usage:
#   ./run_all.sh            # all sources (what cron runs)
#   ./run_all.sh hbrc       # one source (timing / smoke test)
set -uo pipefail
# cron runs with a minimal PATH — make sure aws + coreutils are findable.
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
cd "$(dirname "$0")"                      # -> ingestion/
LOG=/opt/auxein/logs; mkdir -p "$LOG"

# --- non-secret config ---
export ENV=staging
export AWS_REGION=ap-southeast-2
export RDS_DATABASE=auxein_db
export RDS_ENDPOINT=auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com
export RDS_PORT=5432
export VITE_API_URL=https://api.auxein.co.nz/api/v1
export PYTHONIOENCODING=utf-8

# --- secrets from SSM (instance IAM role decrypts). RDS creds via the RDS_USER/
# RDS_PASSWORD env path (what the GitHub cron used); no RDS_SECRET_NAME so config
# skips the Secrets Manager attempt. ---
export SECRET_KEY=$(aws ssm get-parameter --name /auxein/ingest/SECRET_KEY --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")
export HARVEST_API_KEY=$(aws ssm get-parameter --name /auxein/ingest/HARVEST_API_KEY --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")
export RDS_USER=$(aws ssm get-parameter --name /auxein/ingest/RDS_USER --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")
export RDS_PASSWORD=$(aws ssm get-parameter --name /auxein/ingest/RDS_PASSWORD --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")

PY=/opt/auxein/.venv/bin/python
# THIS LIST IS THE SCHEDULE. The box's cron runs this wrapper, so a source missing
# here is simply never ingested — no error, no failed job, just a series that stops.
# `ecan_air` sat in exactly that state from 2026-08-19 to 2026-08-21: it had been
# added to run_ingestion.py and to the (now-fallback) GitHub matrix, but not here,
# and Canterbury's only 12 thermometers went dark for two days while every dashboard
# stayed green. Adding a source means editing all six wiring points, and this is the
# one that decides whether it actually runs.
SOURCES="${*:-harvest ecan ecan_air mdc gw hbrc tdc gdc southland nrc wcrc horizons trc boprc waikato}"   # optional args = specific source(s)

for s in $SOURCES; do
  ( timeout 40m "$PY" run_ingestion.py --source "$s" --period incremental \
      >> "$LOG/ingest_${s}.log" 2>&1 ) &
  while [ "$(jobs -rp | wc -l)" -ge 3 ]; do wait -n; done   # cap at 3 concurrent
done
wait
echo "$(date -u +%FT%TZ) run_all done ($SOURCES)" >> "$LOG/run_all.log"
