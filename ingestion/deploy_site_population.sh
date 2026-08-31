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

echo "== repo:  $REPO"
echo "== venv:  $VENV"

python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip wheel

# The surfaces image's pinned set, which is the one validated to run this code
# path — rasterio decides the LERC encoding every published COG is written in,
# so the reader must match the writer.
"$VENV/bin/pip" install --no-cache-dir -r "$REPO/deploy/surfaces/requirements.txt"

echo "== import check (nothing is executed; the __main__ guard does not fire)"
cd "$REPO/backend"
"$VENV/bin/python" - <<'PY'
import runpy
for n in ("populate_insights_sites",):
    runpy.run_path(f"scripts/{n}.py", run_name="deploy_check")
    print("IMPORT-OK", n)
PY

chmod +x "$REPO/ingestion/run_site_population.sh"
mkdir -p /opt/auxein/logs

cat <<EOF

== Add this crontab line (crontab -e), then check it against run_all.sh's

  */5 * * * * $REPO/ingestion/run_site_population.sh

Every five minutes, matching what GitHub was ASKED for and, unlike GitHub,
what it will actually do. The wrapper takes an flock, so an overrun skips
rather than piles up.

== Verify, in this order:
  1. $REPO/ingestion/run_site_population.sh          # run it by hand once
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
