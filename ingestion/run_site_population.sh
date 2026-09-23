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

# Config and SSM secrets, shared with deploy_site_population.sh's import check.
. ingestion/site_population_env.sh

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

# Sites in the queue BEFORE the populator runs — the ones this run may finish.
QUEUED_SQL="SELECT id FROM insights_site WHERE status = 'populating' ORDER BY requested_at"
site_ids() {   # $1 = SQL returning one id column
  "$PY" - "$1" <<'PY'
import os, sys, psycopg2
cn = psycopg2.connect(
    host=os.environ["RDS_ENDPOINT"], port=os.environ.get("RDS_PORT", "5432"),
    user=os.environ["RDS_USER"], password=os.environ["RDS_PASSWORD"],
    dbname=os.environ["RDS_DATABASE"], connect_timeout=20)
cur = cn.cursor()
cur.execute(sys.argv[1])
print(" ".join(str(r[0]) for r in cur.fetchall()))
cn.close()
PY
}
queued=$(site_ids "$QUEUED_SQL" 2>>"$LOG/site_population.log")

"$PY" scripts/populate_insights_sites.py >> "$LOG/site_population.log" 2>&1
rc=$?

# THE POPULATOR DOES NOT CHAIN. It fills the monthly archive and flips the site
# to 'ready', and a site it finishes has NO daily series and NO water balance:
# the nightly jobs only extend the last day or two, they never backfill. So a
# new site read 'ready' with empty daily charts until somebody ran the other two
# scripts by hand. Both are run here, per site, for every site this run
# finished. 2026-02-15 is where the daily surface archive starts (the budburst
# backfill), so this is the whole daily record, not a guess at a window.
DAILY_FROM=2026-02-15
DAILY_TO=$(date -d yesterday +%F)
# Phenology too, or the site track stays blank until the 18:00 NZ pipeline
# (stage 4b) next runs — which is what Testing Property showed on 2026-09-22.
# It reads the daily series just written, so it runs after it, and from
# 1 September because that is where the season's accumulation starts. It ends
# at yesterday because it needs a daily record for the day it estimates.
if [ "$(date +%-m)" -ge 9 ]; then PHEN_FROM="$(date +%Y)-09-01"; else PHEN_FROM="$(( $(date +%Y) - 1 ))-09-01"; fi
for sid in $queued; do
  now=$(site_ids "SELECT id FROM insights_site WHERE id = $sid AND status = 'ready'" 2>>"$LOG/site_population.log")
  [ -n "$now" ] || continue
  echo "$(date -Is) site $sid ready; daily $DAILY_FROM..$DAILY_TO and water" >> "$LOG/site_population.log"
  "$PY" scripts/populate_site_daily.py --site "$sid" --from "$DAILY_FROM" --to "$DAILY_TO" >> "$LOG/site_population.log" 2>&1 \
    || { echo "SITE-ALERT site=$sid daily backfill failed" >> "$LOG/site_population.log"; rc=1; }
  "$PY" scripts/populate_site_phenology.py --site "$sid" --from "$PHEN_FROM" --to "$DAILY_TO" >> "$LOG/site_population.log" 2>&1 \
    || { echo "SITE-ALERT site=$sid phenology failed" >> "$LOG/site_population.log"; rc=1; }
  "$PY" scripts/populate_site_water.py --site "$sid" >> "$LOG/site_population.log" 2>&1 \
    || { echo "SITE-ALERT site=$sid water balance failed" >> "$LOG/site_population.log"; rc=1; }
done

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
# Copied from the workflow this replaces, NOT paraphrased. The first draft of
# this file said `insights_sites` (the table is `insights_site`, singular),
# `updated_at` (it is `requested_at`) and `status IN ('queued','populating')`
# (there is no `queued`), so the alert raised on every run while the populator
# beside it worked — an alerting path that is itself broken is worse than none,
# because the log fills with a traceback that has nothing to do with any site.
#
# 30 minutes is well past the ~90 second job and past any plausible queue delay,
# so anything still populating is genuinely stuck rather than merely slow.
cur.execute("""
    SELECT id, public_user_id, status, status_detail,
           date_trunc('second', now() - requested_at) AS waiting
      FROM insights_site
     WHERE status = 'failed'
        OR (status = 'populating'
            AND requested_at < now() - interval '30 minutes')
     ORDER BY requested_at
""")
rows = cur.fetchall()
cn.close()
for sid, uid, status, detail, waiting in rows:
    print(f"SITE-ALERT site={sid} user={uid} {status} for {waiting}: {detail or '-'}")
print(f"site population check: {len(rows)} stuck or failed site(s)")
PY

echo "$(date -Is) populate_insights_sites exit=$rc" >> "$LOG/site_population.log"
exit $rc
