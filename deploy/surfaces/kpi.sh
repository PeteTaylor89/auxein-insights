#!/usr/bin/env bash
# JOB=kpi — take the monthly platform KPI snapshot.
#
# Runs 02:00 NZ on the 2nd. A snapshot dated the 1st of month M carries the
# figures for month M-1, the month that has just ended — see
# KPI_DASHBOARD_SCOPE_2026-09-15.md. So the 2nd is late enough that the month
# is over and every event that belongs to it has landed, and early enough that
# the dashboard is not stale for long.
#
# ## WHY THE MONTH IS COMPUTED IN NZ TIME
#
# The container runs UTC. At 02:00 NZ on the 2nd the UTC date is still the 1st,
# so the UTC month and the NZ month agree and the script's own default would be
# right. That is true today and stays true for any NZ offset, but it is true by
# a twelve-hour margin rather than by design, and the margin is invisible in the
# code. The month is therefore derived explicitly from Pacific/Auckland and
# passed in, so a schedule edit — moving the run later in the day, or to the
# 1st — cannot silently write the wrong month.
#
# ## --skip-manual IS LOAD-BEARING
#
# Stations, newsletter percentage and live sub-regions are hand-tracked, and a
# manual row is the historical truth: the columns behind them are mutable, so
# recomputing an old month does not reproduce what was measured at the time.
# The backfill skips manual rows by default for that reason; passing the flag
# here states it rather than relying on it. A standing job must never overwrite
# a hand-kept figure.

set -euo pipefail

MONTH="$(TZ=Pacific/Auckland date +%Y-%m)"

echo "[kpi] snapshot month ${MONTH} (covers the month just ended)"

python backend/scripts/backfill_kpi_snapshots.py \
  --apply \
  --skip-manual \
  --from "$MONTH" \
  --to "$MONTH"

echo "[kpi] done — ${MONTH}-01 snapshot written"
