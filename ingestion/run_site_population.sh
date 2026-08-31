#!/usr/bin/env bash
# Pro site population — the queue poll that came off GitHub Actions 2026-08-31.
#
# A customer adds a site and waits for it to fill. On GitHub this ran `*/5`,
# which is that scheduler's finest granularity, and the honest description of
# what it bought was in the workflow itself: scheduled runs are best-effort,
# routinely delayed under load, occasionally by more than ten minutes, and can
# be dropped entirely. Extraction takes ~90 seconds, so the wait a paying
# customer saw was dominated by queue latency nobody controlled. Every source in
# `run_all.sh` starts at :05:07 to the second on this box.
#
# WHY THIS BOX AND NOT FARGATE. 288 container starts a day to poll a queue is
# the wrong shape and the wrong price; a cron line is both. It does mean this
# job needs a venv the ingestion one does not — see `deploy_site_population.sh`.
#
# WHY IT IS A SEPARATE WRAPPER FROM `run_all.sh`. That file's header says it:
# THE LIST IN IT IS THE SCHEDULE. Adding a non-ingestion job to that loop would
# put a customer-facing queue poll behind a 40-minute-capped council fetch, and
# a hung council would stall site population for the whole hour.
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
cd "$(dirname "$0")/.."                   # -> repo root; backend/ is below it
LOG=/opt/auxein/logs; mkdir -p "$LOG"

# --- non-secret config, mirroring run_all.sh ---
export ENV=staging
export AWS_REGION=ap-southeast-2
export RDS_DATABASE=auxein_db
export RDS_ENDPOINT=auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com
export RDS_PORT=5432
export PYTHONIOENCODING=utf-8

# Extraction is ~7,700 single-cell reads and the process sleeps on the network
# ~96% of the time, so this is a latency knob, not a CPU one. GitHub used 12 on
# a 2-core 7 GB runner; this box is a 1 GB t3.micro that is also running hourly
# ingestion, so it is halved. Raise it only after watching free memory during a
# real extraction.
export INSIGHTS_SITE_WORKERS="${INSIGHTS_SITE_WORKERS:-6}"

export SECRET_KEY=$(aws ssm get-parameter --name /auxein/ingest/SECRET_KEY --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")
export RDS_USER=$(aws ssm get-parameter --name /auxein/ingest/RDS_USER --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")
export RDS_PASSWORD=$(aws ssm get-parameter --name /auxein/ingest/RDS_PASSWORD --with-decryption --query Parameter.Value --output text --region "$AWS_REGION")

PY=/opt/auxein/.venv-app/bin/python

# A LOCK, because the cron interval is shorter than the job. Extraction is ~90 s
# and the poll is every 5 minutes, so they do not normally overlap — but a slow
# S3 or a large site turns "normally" into a pile-up on a 1 GB box, and the
# populator claims rows without a transactional lease. `flock -n` makes a second
# copy exit immediately instead of racing the first.
exec 9>/opt/auxein/site_population.lock
if ! flock -n 9; then
  echo "$(date -Is) previous run still going, skipping" >> "$LOG/site_population.log"
  exit 0
fi

cd backend
"$PY" scripts/populate_insights_sites.py >> "$LOG/site_population.log" 2>&1
rc=$?

# The populator marks a site 'failed' with a customer-readable detail and leaves
# the previous rows in place, which is honest to the customer and INVISIBLE to
# us — there is no admin screen for stuck sites and no email. On GitHub the
# stuck-site check turned the workflow red, and that red square was the only
# alerting this feature had. A cron has no red square, so the check writes to
# the log with a greppable marker instead. Wire it to the job health panel when
# `insights_site` gets a check there.
"$PY" - <<'PY' >> "$LOG/site_population.log" 2>&1
import os, psycopg2
cn = psycopg2.connect(
    host=os.environ["RDS_ENDPOINT"], port=os.environ.get("RDS_PORT", "5432"),
    user=os.environ["RDS_USER"], password=os.environ["RDS_PASSWORD"],
    dbname=os.environ["RDS_DATABASE"], connect_timeout=20)
cur = cn.cursor()
# 30 minutes is well past the ~90 second job and past any plausible queue delay,
# so anything still waiting is genuinely stuck rather than merely queued.
cur.execute("""
    SELECT id, status, updated_at
      FROM insights_sites
     WHERE status = 'failed'
        OR (status IN ('queued', 'populating')
            AND updated_at < now() - interval '30 minutes')
     ORDER BY updated_at
""")
rows = cur.fetchall()
for sid, status, at in rows:
    print(f"SITE-ALERT site={sid} status={status} since={at}")
print(f"site population check: {len(rows)} stuck or failed site(s)")
cn.close()
PY

echo "$(date -Is) populate_insights_sites exit=$rc" >> "$LOG/site_population.log"
exit $rc
