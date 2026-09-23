#!/usr/bin/env bash
# One-time setup on auxein-ingest for the Pro site population cron.
#
#   ssh into i-04224f070f54386a0, then:
#     cd <repo>/ingestion && ./deploy_site_population.sh
#
# It is separate from `deploy.sh` because it builds a SECOND virtualenv. The
# ingestion venv at /opt/auxein/.venv carries `ingestion/requirements.txt`,
# which has no rasterio, no SQLAlchemy models and no pydantic-settings.
# `populate_insights_sites.py` goes through `services/insights_site_service`,
# which reads published COGs out of the private surfaces bucket — a different
# dependency set entirely, and mixing them would mean an ingestion deploy could
# move a library the surface reader depends on.
#
# PREREQUISITE ALREADY DONE (2026-08-31): the instance role `auxein-ingest-ec2`
# had NO S3 permissions of any kind. Policy `auxein-ingest-surfaces-read` now
# grants GetObject on `auxein-climate-surfaces/surfaces/*`. Without it every
# extraction returns null for every cell and the sites populate EMPTY rather
# than failing, which is the worse of the two outcomes.
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
VENV=/opt/auxein/.venv-app

# NOT bare `python3`. On this box (Amazon Linux 2023) that is 3.9, and the
# surfaces pins cannot install on it: rasterio 1.5.0 needs >=3.12, scipy 1.18
# >=3.11. A 3.9 venv fails at pip install, and this script was never finished
# on 2026-08-31, so site population sat dead from then until 2026-09-22.
# 3.13 is what the Fargate image runs (deploy/surfaces/Dockerfile) and what the
# archive was produced on. `sudo dnf install -y python3.13` if it is missing.
PYTHON="${PYTHON:-python3.13}"
"$PYTHON" -c 'import sys; assert sys.version_info >= (3, 12), sys.version' \
  || { echo "== $PYTHON missing or older than 3.12 (sudo dnf install -y python3.13)"; exit 1; }

echo "== repo:  $REPO"
echo "== venv:  $VENV ($("$PYTHON" --version))"

"$PYTHON" -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip wheel

# The surfaces image's pinned set, which is the one validated to run this code
# path — rasterio decides the LERC encoding every published COG is written in,
# so the reader must match the writer.
"$VENV/bin/pip" install --no-cache-dir -r "$REPO/deploy/surfaces/requirements.txt"

echo "== import check (nothing is executed; the __main__ guard does not fire)"
# With the job's own environment: config.py refuses to import without
# SECRET_KEY and the RDS settings, and a check that cannot import proves nothing.
. "$REPO/ingestion/site_population_env.sh"
cd "$REPO/backend"
"$VENV/bin/python" - <<'PY'
import runpy
for n in ("populate_insights_sites", "populate_site_daily", "populate_site_phenology", "populate_site_water"):
    runpy.run_path(f"scripts/{n}.py", run_name="deploy_check")
    print("IMPORT-OK", n)
PY

chmod +x "$REPO/ingestion/run_site_population.sh"
mkdir -p /opt/auxein/logs

# INSTALLED, not printed. This script used to end by printing the line for a
# manual `crontab -e`, and that manual step is exactly what never happened.
# Idempotent: an existing site-population line is replaced, never duplicated —
# two pollers on one queue double-extract without failing. `bash` in front, as
# run_all.sh has it, so a checkout that loses the exec bit still runs.
CRON_LINE="*/5 * * * * bash $REPO/ingestion/run_site_population.sh"
( crontab -l 2>/dev/null | grep -v 'run_site_population.sh' ; echo "$CRON_LINE" ) | crontab -
echo "== crontab now:"
crontab -l

cat <<EOF

Every five minutes, matching what GitHub was ASKED for and, unlike GitHub,
what it will actually do. The wrapper takes an flock, so an overrun skips
rather than piles up.

== Verify, in this order:
  1. bash $REPO/ingestion/run_site_population.sh     # run it by hand once
  2. tail -n 40 /opt/auxein/logs/site_population.log # exit=0, no SITE-ALERT
  3. wait 5 minutes, tail again                      # cron fired
  4. add a site in the UI and time it                # end to end

== Only after 4 passes: disable the GitHub workflow.
The schedule block in .github/workflows/insights-site-population.yml is
already removed, but the workflow must also be disabled in the Actions UI so
an uncommented schedule cannot resurrect it. Two pollers on one queue would
double-extract without failing, which is exactly the kind of thing that runs
for months unnoticed here.
EOF
