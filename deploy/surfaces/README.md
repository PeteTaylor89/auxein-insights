# Daily surfaces on AWS

Moves the daily climate surface engine off GitHub Actions and onto AWS, as
**EventBridge Scheduler → ECS Fargate**.

Nothing here has been applied. The files are the deployment; the commands below
create it.

---

## Why Fargate and not the box we already have

The ingest EC2 box (`i-04224f070f54386a0`) already runs `run_all.sh` on cron and
is the natural home for a scheduled job — but it is a **t3.micro with 1 GB of
RAM**, and the rainfall grid basis alone is **4.6 GB** (789 stations ×
1,429,944 cells × 4 B at float32; float64 has already been OOM-killed at
9.16 GB). Carrying this job there means paying for 8 GB around the clock to run
it for twenty minutes a day.

| option | fit | cost | verdict |
|---|---|---|---|
| **Fargate + EventBridge Scheduler** | 8 GB for ~20 min/day, billed per second | **~$2/month** | recommended |
| Upsize ingest box to t3.large | works, one moving part, reuses existing cron | ~$75/month | simplest, 35× the cost |
| Elastic Beanstalk worker tier | platform pins Python 3.11, caps rasterio at 1.4.4 | ~$20+/month | fights the platform for no gain |
| Lambda | 15-minute ceiling; the job exceeds it | — | ruled out |

There is a third consideration beyond cost. **EventBridge Scheduler resolves
time zones natively** (`ScheduleExpressionTimezone`), so `03:00 Pacific/Auckland`
means 03:00 in Auckland all year. Every other option on this list is UTC-only
and needs the two-cron daylight-saving hack the GitHub workflow carried, where
each pair fires twice a year at the wrong hour and one firing has to be thrown
away by a guard inside the job.

---

## What runs

`entrypoint.sh`, in this order, and the order is the point:

1. **Fetch assets from S3** — the 500 m grid (73 MB, gitignored), the LENZ
   rainfall climatology (49 MB, untracked) and the three era-offset fields.
   None of them are in a git checkout. Presence is asserted: a missing era field
   would otherwise publish an *uncorrected* surface under a corrected era's
   `model_version`, a step of up to ~1.5 °C in the middle of the record with
   nothing downstream able to see it.
2. **`daily_qc.py --apply`** — before the fit, so a rejected value never reaches
   the spline *or* `climate_zone_daily`, disease and phenology. Also re-applies
   standing quarantine windows to late-arriving observations.
   **Over the last 14 days, not the whole 120-day stage window.** `--apply`
   quarantines observations and re-aggregates the days they belong to, and this
   is the only job that runs a wide window — so a backlog accumulates while it
   is not running. Measured 2026-08-30: 21 rejects across 120 days, **zero**
   across the recent 14. Applying the backlog re-aggregates April and May
   without recomputing the zone rollups, disease or phenology built on them, so
   it is a deliberate act: `QC_FULL_WINDOW=true`.
3. **`consolidate_db.py`** — stage 120 days (stations need ≥30 to qualify), fit
   the target window. This one *does* use the full window: it is station
   selection, not value correction.
4. **`run_live.py`** — fit, era-correct, write COGs. Asserts on a day count.
5. **`aws s3 sync`** — publish. Never `--delete`.
6. **`index_daily.py`** — index into `surface_run`.
7. **`populate_site_daily.py --require-surfaces`** — extract each Pro site's own
   cell for the days just fitted. After the index, because it reads
   `surface_run` rather than the manifest, and inside this job because it
   depends on this job's output. The window is passed explicitly rather than
   derived: the script computes its own from `date.today()`, which in a UTC
   container is the previous NZ day.

`MODE=daily` fits D-2. `MODE=refit` re-fits D-9…D-3 weekly, because
`daily_aggregation` keeps revising `weather_data_daily` for about three days
and a once-only fit would disagree with the DB permanently.

### Environment switches

| Variable | Default | Effect |
|---|---|---|
| `MODE` | `daily` | `daily` fits D-2; `refit` fits D-9…D-3. |
| `START` / `END` | — | Explicit window; overrides `MODE`. |
| `QC_FULL_WINDOW` | `false` | Apply QC across the full 120-day stage window instead of the recent 14 days. **Deliberate act — see step 2.** |
| `SURFACE_BUCKET` | `auxein-climate-surfaces` | |

---

## Deploy

Prerequisites: an ECR repo, a cluster, two IAM roles, a security group, and the
four SSM parameters. The workstation has **no Docker**, so the image is built by
CodeBuild rather than locally.

```bash
ACCOUNT=992914515416
REGION=ap-southeast-2

# 1. Cluster (no capacity providers needed for Fargate)
aws ecs create-cluster --cluster-name auxein-jobs --region $REGION

# 2. Secrets. Reuse whatever the EB environment already holds.
for k in RDS_ENDPOINT RDS_USER RDS_PASSWORD SECRET_KEY; do
  aws ssm put-parameter --name "/auxein/prod/$k" --type SecureString \
      --value "<value>" --overwrite --region $REGION
done

# 3. Image (CodeBuild project pointed at this repo, using buildspec.yml)
aws codebuild start-build --project-name auxein-surfaces-build --region $REGION

# 4. Task definition
aws ecs register-task-definition \
    --cli-input-json file://deploy/surfaces/task-definition.json --region $REGION

# 5. Schedules — see schedules.json for both entries
aws scheduler create-schedule --cli-input-json file://<one-schedule>.json
```

### The two things that will bite

**RDS reachability.** `auxein-db` is `PubliclyAccessible` in
`vpc-03a13bd8504825dd9`, so a task in `subnet-0317587a16a8b5e59` with
`AssignPublicIp: ENABLED` reaches it without a NAT gateway. But the task gets a
*random* public IP each run, so the RDS security group must allow the **task's
security group**, not an IP. Add an inbound rule on `sg-011550f434d067f69` for
the new `auxein-surfaces-sg` on 5432.

Do **not** try to reuse the ingest box's Elastic IP for this. `15.134.113.92` is
what councils allowlist for ingest; it belongs to that instance and must stay
attached to it.

**IAM.** Two roles, and they are not the same thing:
- `auxein-surfaces-execution` — pulls the image and reads the SSM parameters at
  launch. Needs `AmazonECSTaskExecutionRolePolicy` plus `ssm:GetParameters` and
  `kms:Decrypt` on the parameter key.
- `auxein-surfaces-task` — what the *code* uses: `s3:GetObject`/`PutObject`/
  `ListBucket` on `auxein-climate-surfaces`.

A third, `auxein-scheduler-invoke`, lets EventBridge Scheduler call
`ecs:RunTask` and `iam:PassRole` on the two above.

---

## Verifying a run

```bash
aws logs tail /auxein/surfaces --follow --region ap-southeast-2
```

The job asserts on counts, not exit codes — a silent no-op reporting success is
this platform's most-repeated failure. A healthy daily run ends with
`wrote 4 surfaces, 0 skipped` and prints any station the outlier screen
rejected, marking `PERSISTENT` where a station is failing on most of its days.
**A persistent flag is a source problem this job cannot fix** — it protects the
surface, but the station keeps poisoning `weather_data_daily` until it is
quarantined.

To run one off-schedule:

```bash
aws ecs run-task --cluster auxein-jobs --launch-type FARGATE \
  --task-definition auxein-surfaces \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-0317587a16a8b5e59],securityGroups=[<sg>],assignPublicIp=ENABLED}' \
  --overrides '{"containerOverrides":[{"name":"surfaces","environment":[
      {"name":"START","value":"2026-09-01"},{"name":"END","value":"2026-09-01"}]}]}'
```

---

## Cutover

Daily publishing goes live **2026-09-01**; everything fitted before that is a
test artefact. The clean cut is
`index_daily.py --purge 2026-08-01 2026-08-31 --purge-objects`.

Disable `.github/workflows/daily-surfaces.yml` at the same time — leaving both
schedules live means two runs racing on the same S3 keys and the same
`uq_surface_run_timestep` row.
