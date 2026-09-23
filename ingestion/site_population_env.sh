# Environment for the Pro site population job. SOURCED, not run, by both
# `run_site_population.sh` (every 5 minutes) and `deploy_site_population.sh`
# (its import check), so the check sees exactly what cron will see. On
# 2026-09-22 the check ran without this, failed on a missing SECRET_KEY, and
# under `set -e` stopped the deploy before the crontab line went in.

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
