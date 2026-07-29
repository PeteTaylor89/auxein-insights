#!/usr/bin/env bash
# Daily auto-deploy for the AWS ingestion box: force the checkout to match
# origin/main so the box stays current with what you push.
#
# Uses `reset --hard` (not `pull`) on purpose: nothing edits code on the box, so
# this can never hit a merge or mode conflict (the exact thing that blocked the
# manual pull). Run via:  bash /opt/auxein/ingestion/deploy.sh
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"   # cron has a minimal PATH
cd /opt/auxein || exit 1
mkdir -p /opt/auxein/logs
git fetch origin main --quiet
git reset --hard origin/main --quiet
echo "$(date -u +%FT%TZ) deployed $(git rev-parse --short HEAD)" >> /opt/auxein/logs/deploy.log
