# Daily climate operations — state and plan

**Date:** 2026-08-24 · **Status:** engine built and verified; nothing scheduled
**Supersedes the scheduling half of** `LIVE_SURFACE_ENGINE_2026-08-20.md`, which
was the proposal this implements.

Everything below has been run against production and verified. None of it has
ever executed on a scheduler, and none of it is committed.

---

## 1. The pipeline, in the order that matters

```
sources ──hourly:05──► timeseries_observations          (EC2 ingest box)
                            │
                            ▼ daily_aggregation          every 6 h, 3-day lookback
                       weather_data_daily                HOUR-WEIGHTED mean
                            │
                            ▼ daily_qc  ◄── step 1b      check + clean + enforce
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
   climate_zone_hourly  climate_zone_daily  consolidate_db → run_live
             │              │                      │
             ▼              ▼                      ▼
     disease_pressure  phenology_estimates    COGs → S3 + surface_run(daily)
                                                    │
                                          Atlas · Pro sites · regions
```

The order is not a convenience. Each stage is the only guard the ones after it
have, and QC sits where it does specifically because a fit-time screen protects
only the surface — the same bad value otherwise flows into `climate_zone_daily`,
disease and phenology, none of which have any equivalent check.

**Only the hourly branch bypasses the daily table.** That is why the `temp_mean`
sampling bug reached GDD and phenology but never touched disease pressure, and
why the RH fault reached disease but not the surface.

---

## 2. Schedule

Cadences in NZ time. "Where" is where each runs **today**.

| job | cadence | where | state |
|---|---|---|---|
| Council ingest (`run_all.sh`) | hourly :05 | EC2 `t3.micro` | live |
| SYNOP live | every 3 h :10 | GitHub Actions | to move |
| Rollup + QC | every 6 h :35 | GitHub Actions | to move |
| Full daily processing | 18:00 | GitHub Actions | to move |
| **Daily surfaces** | **03:00, fitting D−2** | — | **never run** |
| **Surface re-fit** | **Sun 04:00, D−9…D−3** | — | **never run** |
| Pro site population | every 5 min | GitHub Actions | to move |

**Why D+2.** ECAN_AIR lands ~24.8 h behind wall clock and is ten thermometers in
the largest temperature-deficit region in the country; a D+1 fit would omit them
systematically rather than occasionally.

**Why the weekly re-fit is not padding.** `daily_aggregation` runs every 6 h with
a 3-day lookback, so `weather_data_daily` keeps being revised for about three
days. A surface fitted once at D+2 would disagree with the database permanently,
and nothing downstream could see the disagreement.

---

## 3. Moving off GitHub Actions to AWS

Decided 2026-08-24. Files in `deploy/surfaces/`. **Nothing applied.**

| option | fit | cost | verdict |
|---|---|---|---|
| **Fargate + EventBridge Scheduler** | 8 GB for ~20 min/day, per-second billing, native time zones | **~$2/mo** | **surfaces** |
| **Existing EC2 box, extra cron** | already the pattern; fine for the light jobs | **$0** | **everything else** |
| Upsize EC2 to t3.large | one moving part, carries everything | ~$75/mo | 35× the cost |
| Elastic Beanstalk worker | platform pins Python 3.11, caps rasterio at 1.4.4 | ~$20/mo | fights the platform |
| Lambda | 15-minute ceiling; the fit exceeds it | — | ruled out |

The split is about memory. The rainfall grid basis alone is **4.6 GB** — 789
stations × 1,429,944 cells × 4 bytes — against a `t3.micro`'s 1 GB. Everything
else in the pipeline is small enough to sit beside the existing cron for nothing.

**The quiet win is time zones.** EventBridge Scheduler resolves
`Pacific/Auckland` itself, so 03:00 means 03:00 all year. Every UTC-only
scheduler — GitHub cron, `crontab`, EventBridge Rules — needs a pair of entries
per job plus a guard inside the job to discard whichever fired on the wrong side
of daylight saving.

### What will bite

- **RDS reachability.** `auxein-db` is `PubliclyAccessible` in
  `vpc-03a13bd8504825dd9`, so a task in `subnet-0317587a16a8b5e59` with a public
  IP reaches it without a NAT gateway. But the task gets a **random** IP each
  run, so the RDS security group must admit the task's **security group**, not an
  address.
- **The ingest box's Elastic IP is not available.** `15.134.113.92` is what
  councils allowlist; it stays attached to that instance.
- **No Docker on the workstation**, hence CodeBuild rather than a local build.
- **Three IAM roles**, and execution ≠ task: one pulls the image and reads SSM at
  launch, one is what the code uses against S3, one lets Scheduler call
  `ecs:RunTask`.

---

## 4. Four layers of defence

Each catches something the others structurally cannot. All four exist because
something got through.

1. **At ingest** — physical range and sentinel rejection. Catches −6,999 °C.
   Cannot catch 29.3 °C in a Southland winter.
2. **Daily QC** — internal consistency, extreme range, flatline, and a network
   comparison. Rejected 0.29 % of station-days on first run.
3. **At fit** — neighbour screen, distance-scaled, lapse-reduced, asymmetric.
   Protects the surface from what QC deliberately leaves in place.
4. **At publish** — day counts, object counts, row counts. A run that produced
   nothing fails rather than reporting success.

**The rule that took longest to learn:** exclude on *non-stationarity and local
dominance*, never on the size of a bias. Removing the eight highest-bias stations
once made the national surface measurably worse; removing a single
seasonally-broken isolated station fixed everything. A frost hollow, an
inversion-top station at 1,622 m and a coastal site all disagree with their
neighbours by 8–10 °C — and all three do it every winter.

---

## 5. Cutover to production, 2026-09-01

1. Run the job once by hand and read the log.
2. Split `SURFACE_LIVE_MODEL_VERSION` per variable — temps `-db-adj`, rainfall
   `-db`. **Must ship with the first surface a consumer reads.**
3. `index_daily.py --purge 2026-08-01 2026-08-31 --purge-objects`.
4. Disable `.github/workflows/daily-surfaces.yml` in the same change.
5. Apply the AWS deployment.

---

## 6. Open beyond the cutover

- **Zone assignment** — 105 of 932 stations carry a `zone_id`, and that caps the
  regional product harder than code does. Worksheet at
  `zone_assignment_worksheet.py`. Highest-value fix: **zone 13, 11,531 planted
  hectares, zero humidity**, with three clean temp+RH stations unassigned within
  4 km.
- **Workstream B** — sample the daily surfaces at `climate_zone_cell_mask` for
  regional and sub-regional daily and running statistics. Not started.
- **Phenology from the surface, with a range** — sample GDD across the mask so
  thresholds give an early/late window rather than one false date. Changes every
  estimate, because phenology reads the station average today.
- **67-site Pro client** — daily extraction is cheap; `extract_monthly` is a full
  rebuild at 7,296 objects per site per run and needs an incremental mode first.
- **Four rollback tables** left in prod from today's backfills; drop when
  satisfied.
