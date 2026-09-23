# Rainfall surface refit — 1-22 September 2026

Written 2026-09-23. Step 2 of the fabricated-rainfall repair. Steps 1 and 3 are done;
the background is in `project_fabricated_rainfall_zeros` and the sections below.

## Why

`weather_data_daily` held rainfall values of exactly 0.00 mm with no observations behind
them, and `consolidate_db.py` has no record-count filter, so every fit inside the window
took them in as real gauges. Two separate faults, both now cleared from the database but
still baked into the published surfaces:

1. **8,949 fabricated zeros** at 46 gaugeless stations, written by the pre-B4.1
   aggregator and kept by the `COALESCE(EXCLUDED, existing)` upsert against every later
   NULL. Cleared 2026-09-22. Window 2025-09-01..2026-06-20.
2. **Five stuck-at-zero gauges** reading 0.00 mm through September while neighbours read
   29-125 mm. Quarantined 2026-09-22/23. These are the ones inside this refit window.

Measured effect of (1), modelled site rainfall divided by its own paired gauge:

| site | 15 Feb - 20 Jun | 21 Jun - 20 Sep |
|---|---|---|
| Waipara West | **0.50** | 0.78 |
| Cromwell | **0.58** | 1.43 |
| Marlborough Research Station | **0.58** | 1.04 |
| Martinborough (control, no fake stations nearby) | 1.16 | 1.04 |

**This refit covers fault 2 only.** Its five gauges are in Manawatu, Ruapehu/Taihape and
the Hauraki Plains, so **no BSI site and no wine zone is materially affected** — this is
about the national surface being correct, not a client-visible repair. Fault 1's window is
out of scope here; see *Not in scope*.

## Scope

The 22 published daily surfaces for **2026-09-01 .. 2026-09-22**.

The job fits all four variables together, so temperature is refitted and republished as
well. That is harmless — S3 objects overwrite, `index_daily` upserts — and it picks up any
QC decision taken in the same window.

## Preconditions

1. **The two scheduled runs after the 09-23 image rebuild have been checked.** The image
   was `39d0486` until 09-23 and is now `63b88e2`; the first runs on it are the first
   unattended runs of the new stuck-gauge QC check.
   * 18:00 UTC (06:00 NZ) pipeline writes 09-23 with `bacchus_index` on all 22 zones.
   * 06:30 NZ surfaces run reports `stuck_rain_continues` for the five gauges and nothing
     else, and does not abort on `--max-reject-rate`.
2. **Both detectors report nothing**, so the fit reads clean inputs:

       backend/venv/Scripts/python.exe backend/scripts/clear_fabricated_rainfall.py
       backend/venv/Scripts/python.exe backend/scripts/quarantine_stuck_rainfall.py --survey

## The run

A one-off Fargate task on the EXISTING `auxein-surfaces` task definition. `START`/`END`
override `MODE` in `deploy/surfaces/entrypoint.sh`.

    MSYS_NO_PATHCONV=1 aws ecs run-task --cluster auxein-jobs \
      --task-definition auxein-surfaces --launch-type FARGATE --count 1 \
      --region ap-southeast-2 \
      --network-configuration "awsvpcConfiguration={subnets=[subnet-0317587a16a8b5e59],securityGroups=[sg-0d19d5d32bde42638],assignPublicIp=ENABLED}" \
      --overrides '{"containerOverrides":[{"name":"surfaces","environment":[{"name":"START","value":"2026-09-01"},{"name":"END","value":"2026-09-22"}]}]}'

* **Do NOT register a new revision of the task-definition family.** The schedules target
  the family without a revision and would run yours instead of theirs. An ECS override
  replaces `command`, not `entryPoint`, so env overrides are the supported route.
* **Run it away from 06:30 and 15:00 NZ.** The window includes 09-22, which the daily job
  also fits, and two tasks publishing the same day at once is the overlap worth avoiding.
* 22 days should be one pass. The Feb-Jun backfill ran 136 days in five chunks of ~27.

## What that job already does

QC over the 14 days before `START`, stations staged from `START - 120 days` (below 30 days
in the staged window `consolidate_db` drops every station), fit, publish to S3 with the
immutable `_runs/` record, `index_daily`, then `populate_site_daily --from/--to` over
exactly the fitted window.

## Downstream, NOT covered by that job

The 06:00 NZ pipeline carries `--lookback-days 3`, so the other 19 days need an explicit
pass once the refit has published:

    backend/venv/Scripts/python.exe backend/scripts/aggregate_zone_daily_surface.py \
        --start 2026-09-01 --end 2026-09-22 --apply
    backend/venv/Scripts/python.exe backend/scripts/populate_site_water.py

`aggregate_zone_daily_surface` re-derives `gdd_cumulative` across the whole vintage rather
than carrying it forward, so it repairs every later day instead of leaving a step.

## Verification

* `surface_run` holds 22 `rainfall`/`daily` rows for the window, created today, with
  `n_stations_fit` in the usual 750-780 band.
* September rainfall over a Manawatu cell RISES — that is the fabricated zeros coming out.
  `SYNOP_93404` (0.3 km from MANGAONE_AT_MILSON_LINE) read 124.8 mm for September while the
  stuck gauge read 0.00, so that neighbourhood is where the change should show.
* BSI site ratios stay where they are (Waipara 0.98, Gisborne 0.99, Appleby 0.93), which
  confirms nothing moved where it should not.

## Risks and rollback

* **There is no clean rollback.** S3 objects overwrite in place. The `_runs/` record and the
  index rows are the audit trail; recovery means refitting, not restoring.
* Temperature surfaces for the same days are republished. Expected, but it moves their
  published timestamps.
* A refit that trips `--max-reject-rate` aborts without acting, so the failure mode is a
  surface that does not update rather than one that is wrong.

## Not in scope

* **Fault 1's published surfaces.** Daily 2026-02-15..06-20 (~126 days) and monthly
  2025-09..2026-06. The monthlies cannot be rebuilt by reducing dailies before 02-15,
  because none were published then; those months need a direct monthly refit.
* **The prevention.** `consolidate_db.py` still has no record-count filter on rainfall, so
  a value with nothing behind it can still reach a fit. The database is clean today and
  `daily_qc.check_stuck_rain` now guards the ongoing case, but the staging query itself is
  still unguarded.
