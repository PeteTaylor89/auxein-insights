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
cd "$(dirname "$0")"                      # -> ingestion/
LOG=/opt/auxein/logs; mkdir -p "$LOG"

# --- non-secret config ---
export ENV=staging
export AWS_REGION=ap-southeast-2
export RDS_SECRET_NAME='rds!db-49a041ba-9fc8-4df2-8fa6-ae50b09498ca'
export RDS_DATABASE=auxein_db
export RDS_ENDPOINT=auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com
export RDS_PORT=5432
export VITE_API_URL=https://api.auxein.co.nz/api/v1
export PYTHONIOENCODING=utf-8

# --- secrets from SSM (instance IAM role decrypts) ---
export SECRET_KEY=$(aws ssm get-parameter --name /auxein/ingest/SECRET_KEY --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")
export HARVEST_API_KEY=$(aws ssm get-parameter --name /auxein/ingest/HARVEST_API_KEY --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")

PY=/opt/auxein/.venv/bin/python
SOURCES="${*:-harvest ecan mdc gw hbrc tdc gdc}"   # optional args = specific source(s)

for s in $SOURCES; do
  ( timeout 40m "$PY" run_ingestion.py --source "$s" --period incremental \
      >> "$LOG/ingest_${s}.log" 2>&1 ) &
  while [ "$(jobs -rp | wc -l)" -ge 3 ]; do wait -n; done   # cap at 3 concurrent
done
wait
echo "$(date -u +%FT%TZ) run_all done ($SOURCES)" >> "$LOG/run_all.log"
