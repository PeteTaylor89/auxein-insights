# Auxein — Deployment & Operations Workbook

**Prepared by:** Pete Taylor · **Version:** 2.0 · **Version date:** 2026-07-29

> Consolidates and supersedes `Auxein Inisghts Deployment Workflow V1.0.docx` and
> `deployment-doc-versioning-edit.md`. Major changes since v1.0: weather ingestion
> migrated from GitHub Actions (6-hourly) to an **AWS Sydney EC2 box (hourly)**;
> expanded to **8 sources / ~340 stations**; new **probe → seed → backfill**
> station-onboarding workflow; `timeseries_observations` is now **yearly-partitioned**.

---

## 1. Infrastructure

| Component | Production URL / ID | Service |
|---|---|---|
| Frontend — Regional Insights | https://insights.auxein.co.nz | S3 + CloudFront |
| Frontend — Pro / Grow web | (Grow web app) | S3 (`auxein-grow-web`) + CloudFront `E2DU9CGNMPH53L` |
| Marketing site | https://auxein.co.nz | S3 + CloudFront `E104EI45ZHSPLU` |
| Backend API | https://api.auxein.co.nz | Elastic Beanstalk (`auxein-api-prod-lb`) |
| Database | `auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com` | RDS PostgreSQL 17 + PostGIS (**yearly-partitioned** `timeseries_observations`) |
| **Weather ingestion host** | EC2 `i-04224f070f54386a0` @ `54.79.120.8` (ap-southeast-2) | Hourly cron — see §2 & the AWS runbook |
| Region | `ap-southeast-2` (Sydney) | all AWS resources |

Regional Insights S3: `auxein-insights-webapp`, CloudFront `E1LDN7KQ7TOFXN`.

---

## 2. Weather Data Ingestion

The platform ingests live weather from regional council + commercial APIs. **As of v2.0
the 9 council/commercial sources run HOURLY from an AWS EC2 box in Sydney** (not GitHub
Actions). SYNOP and the daily-processing pipeline remain on GitHub Actions.

**Why the move:** GitHub runners are in the US; ~180 ms RTT to NZ council APIs × a fresh
TCP+TLS handshake per request × hundreds of sequential requests pushed a run past the
45-min job cap. From Sydney (~30 ms to NZ) + keep-alive connection reuse, all sources
run in **~90 seconds**.

### 2.1 Sources

| Source | API / Endpoint | Region | Host |
|---|---|---|---|
| Harvest Electronics | Harvest REST API | multi (per-device creds) | AWS box |
| ECAN | Environment Canterbury API | Canterbury | AWS box |
| MDC | Hilltop `hydro.marlborough.govt.nz/data.hts` | Marlborough | AWS box |
| GW | Hilltop `hilltop.gw.govt.nz/Data.hts` | Wellington/Wairarapa | AWS box |
| HBRC | Hilltop `data.hbrc.govt.nz/Envirodata/EMAR.hts` | Hawke's Bay | AWS box |
| TDC | Hilltop `envdata.tasman.govt.nz/data.hts` (+ Nelson CC) | Tasman/Nelson | AWS box |
| GDC | Hilltop `hilltop.gdc.govt.nz/data.hts` | Gisborne | AWS box |
| Southland | bespoke JSON `envdata.es.govt.nz/services/*.ashx` | Southland | AWS box |
| NRC | Hilltop `hilltop.nrc.govt.nz/data.hts` (rainfall only) | Northland | AWS box |
| SYNOP / NOAA | Ogimet + NOAA NCEI | national | GitHub Actions (`synop-live.yml`) |

Approx active stations: HBRC 84, GDC 65, SYNOP 54, SOUTHLAND 53, MDC 47, HARVEST 43,
TDC 43, NRC 41, GW 4, ECAN 4 (~440 total). Station lists are **DB-driven**
(`weather_stations`), so new stations are picked up on the next hourly run without a
code deploy.

**Licensing:** Southland (ES) and NRC both require **written permission for commercial
reuse** — cleared 2026-07-30. HBRC is CC-BY 4.0; TDC has an access agreement (Richmond
Racecourse excluded). MDC / GW / GDC / ECAN are still unverified.

- Entry point: `ingestion/run_ingestion.py --source <s> --period incremental`
- Sources: `ingestion/sources/{harvest,ecan,mdc,gw,hbrc,tdc,gdc,southland,nrc}.py`
- Shared HTTP helper: `ingestion/sources/http_util.py` (**hard per-request timeout** +
  keep-alive `requests.Session` — a hung council request can no longer wedge a run).
- Incremental look-back is **clamped to 30 days** (a stale/gappy station can't trigger a
  runaway multi-year fetch — that's a backfill job, see §3).

### 2.2 The AWS ingestion box

Full provisioning + setup steps: **`docs/runbooks/aws-ingestion-migration.md`**. Summary:

- EC2 `t3.micro` in `ap-southeast-2`, IAM instance profile `auxein-ingest-ec2`
  (reads Secrets Manager + SSM), SG `sg-034c47350a16e6df5`.
- Repo at `/opt/auxein` (read-only GitHub **deploy key**), venv `/opt/auxein/.venv`,
  logs `/opt/auxein/logs`.
- Secrets in **SSM SecureString** `/auxein/ingest/{SECRET_KEY,HARVEST_API_KEY,RDS_USER,RDS_PASSWORD}`.
- **Wrapper** `ingestion/run_all.sh` runs the 9 sources ≤3 in parallel, each `timeout 40m`.
  Invoke via **`bash run_all.sh`** (never `chmod +x` — avoids git mode-conflicts on pull).
- **Cron** (`crontab -l`):
  ```
  5 * * * * bash /opt/auxein/ingestion/run_all.sh          # hourly ingest (UTC)
  30 16 * * * bash /opt/auxein/ingestion/deploy.sh          # daily auto-deploy (~4:30am NZ)
  ```
- **Auto-deploy:** `ingestion/deploy.sh` does `git fetch origin main && git reset --hard
  origin/main` (never conflicts). Push to `main` → the box matches it next deploy tick,
  or run `bash /opt/auxein/ingestion/deploy.sh` to update immediately.
- The GitHub `weather-ingestion.yml` is kept **disabled** as an instant fallback.

**Operate the box:**
```bash
ssh -i ~/.ssh/auxein-ingest.pem ec2-user@54.79.120.8
bash /opt/auxein/ingestion/run_all.sh hbrc     # run one source manually
tail -n 20 /opt/auxein/logs/ingest_hbrc.log    # per-source log
cat /opt/auxein/logs/run_all.log               # each hourly tick
cat /opt/auxein/logs/deploy.log                # each deploy
```
Health from anywhere (SQL): `SELECT data_source, max(created_at) FROM timeseries_observations o JOIN weather_stations w ON w.station_id=o.station_id GROUP BY 1;` — every source should be fresh within the last hour.

---

## 3. Adding New Stations / Councils

The v2.0 onboarding flow is **probe → seed → elevation → backfill**, using generators and
a hang-proof driver. It supersedes the old hand-written config + `setup_*_stations.py`
approach. Zone assignment is **no longer required** for new stations (the interpolation
model supersedes in-zone aggregation).

### 3.1 Probe the source (never hand-type stations)

```bash
python ingestion/scripts/probe_hilltop.py --agency <hbrc|mdc|gw|tdc|gdc|nrc|orc> \
  --collection "<Collection>" --out <src>_<coll>.json
python ingestion/scripts/probe_hilltop.py --report <src>_<coll>.json   # live/dead + variables
```
Dumps land in **`ingestion/scripts/probes/`** (gitignored — they are large regenerable
artefacts, not source) and the seeders read from there. A bare `--out`/`--report`
filename resolves into that dir; pass an absolute path to override. Southland is not
Hilltop — `seed_southland_stations.py` probes the ES portal directly and needs no dump.
The probe filters QA/derived series, splits live vs dead against a cutoff, and emits
coords. Encodes the Hilltop gotchas (%20 not +, User-Agent, `DataSource/To` liveness,
`Location=LatLong`, gzip sniffing).

### 3.2 Extend the source's `measurement_map`

In `ingestion/sources/<src>.py`, map each API measurement name → `(canonical_var, unit, scale)`.
All canonical codes must exist in `measurement_catalog`. Notes:
- Wind in km/h → m/s via `scale = 1/3.6`; the map's canonical unit is authoritative
  (ignore the XML `<Units>`).
- De-dup variant names so one station never carries two names for one variable
  (see `tdc.py` for the pattern).

### 3.3 Seed via the generator

Copy `ingestion/scripts/seed_<mdc|gdc|tdc>_from_probe.py`. It reads the probe JSON(s),
filters live + weather-relevant (anchor filter), **reuses existing station codes by API
site name** (UPSERT, no duplicates), preserves out-of-band elevation, and leaves `zone_id`
unset. Respect council access agreements (exclude restricted sites, e.g. TDC's Richmond
Racecourse).
```bash
python ingestion/scripts/seed_<src>_from_probe.py --dry-run   # verify N/N existing matched, 0 dup
python ingestion/scripts/seed_<src>_from_probe.py
```

### 3.4 Fill elevation from the LINZ 8m DEM

```bash
python ingestion/scripts/fill_elevation_from_dem.py --source <SRC>
```
Uses Open Topo Data `nzdem8m` (the LINZ 8m DEM), keyless, 100 points/request; Open-Meteo
fallback for out-of-coverage points.

### 3.5 Backfill history with the hang-proof driver

```bash
export PYTHONIOENCODING=utf-8   # Windows: $env:PYTHONIOENCODING="utf-8"
python ingestion/scripts/backfill_driver.py --source <src> --start 01/01/2020 \
  --interval "1 day" --per-station-timeout 1200 --skip-existing-before 2021-01-01
```
Runs **each station as its own subprocess** with a hard timeout, so one hung/flaky station
can't wedge the run. `--skip-existing-before` makes it resumable; `--only CODE` targets a
single station. History floor is 2020-01-01 (deeper later). Note some council servers are
flaky for deep rainfall (e.g. GDC) — the driver logs the failures and moves on.

Sources come in two **backfill styles** (`SOURCE_MODULE` in the driver):

- **`range`** — the Hilltop councils. Arbitrary history via `--start` / `--interval`.
- **`days`** — Environment Southland. Its API only accepts a look-back window anchored
  to now and **caps at 365 days**, so `--start` is meaningless; use `--days`:
  ```bash
  python ingestion/scripts/backfill_driver.py --source southland --days 365 \
    --per-station-timeout 900 --skip-existing-before 2026-07-25
  ```

> **Insert throughput.** Passing a list of dicts to `session.execute(text(...), records)`
> gets you a psycopg2 **executemany — one round-trip per row**. Against RDS in Sydney that
> is ~30-60 ms each, so one 365-day hourly series (~8,800 rows) takes 5-9 min and blows the
> per-station timeout. Use `sources/db_util.py::bulk_upsert_observations`
> (psycopg2 `execute_values`, pages of 1,000) instead — seconds, not minutes.
>
> Converted: `hbrc` `mdc` `gw` `tdc` `gdc` `southland` `nrc` (all smoke-tested 2026-07-31).
> `noaa` and `synop` were already batched. **Still on the slow path: `harvest.py` and
> `ecan.py`.** `harvest` is a clean drop-in. `ecan` is NOT — its `ON CONFLICT` updates
> `unit` and does not touch `created_at`, so it needs a helper variant or a deliberate
> decision to adopt the standard semantics. Any NEW source should use the helper from day one.

### 3.6 Wire the hourly run

Add the source to the `--source` choices in `run_ingestion.py`, to the box's
`run_all.sh` `SOURCES` list, and to the `weather-ingestion.yml` matrix + dispatch choices
(the GH workflow is the disabled fallback — keep it in sync or the fallback silently drops
the source). Push; the box auto-deploys. **Seeding alone is not enough** — a source absent
from `run_all.sh` never runs, however many stations it has.

### 3.7 Verify

- `weather_stations` has the rows (`is_active = true`).
- The hourly run inserts fresh data (`ingestion_log` SUCCESS; `created_at` recent).
- The daily-processing pipeline (§6) populates derived tables → data on
  https://insights.auxein.co.nz.

### 3.8 Data completeness audit (SQL)

Run these against the ingestion DB to verify coverage — after a backfill, after
onboarding a source, or as a periodic health check. They join
`timeseries_observations` (the `weather_data` view works too) to
`weather_stations`.

**A. Per-source rollup — the 10,000-ft view:**

```sql
SELECT
  w.data_source,
  count(*)                                                     AS stations,
  count(*) FILTER (WHERE w.is_active)                          AS active,
  count(*) FILTER (WHERE w.elevation IS NOT NULL)             AS with_elev,
  count(DISTINCT o.station_id)                                AS with_data,
  count(DISTINCT o.station_id)
        FILTER (WHERE o.timestamp < '2025-01-01+00')         AS deep_hist,   -- has pre-2025 history
  min(o.timestamp)::date                                     AS earliest,
  max(o.timestamp)                                           AS latest,      -- freshness
  count(o.station_id)                                        AS total_obs
FROM weather_stations w
LEFT JOIN timeseries_observations o ON o.station_id = w.station_id
GROUP BY w.data_source
ORDER BY w.data_source;
```

**B. Per-station completeness + status:**

```sql
WITH s AS (
  SELECT
    w.data_source, w.station_code, w.is_active,
    (w.elevation IS NOT NULL)                                            AS has_elev,
    jsonb_array_length(COALESCE(w.notes->'measurements','[]'::jsonb))     AS meas_cfg,
    count(DISTINCT o.variable)                                           AS vars_present,
    min(o.timestamp)::date                                             AS first_obs,
    max(o.timestamp)::date                                            AS last_obs,
    (now() - max(o.timestamp))                                         AS since_last,
    count(o.station_id)                                               AS total_obs,
    count(o.station_id) FILTER (WHERE o.timestamp < '2025-01-01+00')  AS pre2025_obs
  FROM weather_stations w
  LEFT JOIN timeseries_observations o ON o.station_id = w.station_id
  GROUP BY w.station_id, w.data_source, w.station_code, w.is_active, w.elevation, w.notes
)
SELECT *,
  CASE
    WHEN total_obs = 0                                    THEN 'NO DATA'
    WHEN pre2025_obs = 0                                  THEN 'RECENT ONLY'   -- new/truncated, no deep history
    WHEN is_active AND since_last > interval '2 days'     THEN 'STALE'         -- cron not refreshing it
    ELSE 'OK'
  END AS status
FROM s
ORDER BY data_source, station_code;
```

**C. Problems only — what to investigate:**

```sql
WITH s AS (
  SELECT
    w.data_source, w.station_code, w.is_active,
    max(o.timestamp)::date AS last_obs,
    count(o.station_id) AS total_obs,
    count(o.station_id) FILTER (WHERE o.timestamp < '2025-01-01+00') AS pre2025_obs,
    (now() - max(o.timestamp)) AS since_last
  FROM weather_stations w
  LEFT JOIN timeseries_observations o ON o.station_id = w.station_id
  WHERE w.is_active                                    -- only stations we expect data from
  GROUP BY w.station_id, w.data_source, w.station_code, w.is_active
)
SELECT data_source, station_code, last_obs, total_obs, pre2025_obs, since_last,
  CASE WHEN total_obs = 0 THEN 'NO DATA'
       WHEN pre2025_obs = 0 THEN 'RECENT ONLY'
       WHEN since_last > interval '2 days' THEN 'STALE'
  END AS problem
FROM s
WHERE total_obs = 0 OR pre2025_obs = 0 OR since_last > interval '2 days'
ORDER BY data_source, station_code;
```

**Reading the status flag:**

| Status | Meaning |
|---|---|
| `OK` | Has data, has deep 2020-24 history, currently fresh — complete. |
| `NO DATA` | Active but never returned anything (e.g. GDC rainfall bores the flaky server won't serve). |
| `RECENT ONLY` | Has data but no pre-2025 (newer station, or a truncated source record). |
| `STALE` | Active but the hourly cron hasn't refreshed it in >2 days — check that source's log. |

**Tuning knobs:** the `2 days` staleness threshold (tighten to `2 hours` once the
AWS cron has settled — it refreshes everything hourly); and the `2025-01-01`
"deep history" cutoff.

---

## 4. Local Development

```bash
cd backend
npm run dev:web        # backend + web
```
Regional Insights: `cd packages/insights && npm run dev` (port 5174). Grow web:
`packages/web` (5173). Marketing: `packages/auxein-marketing` (3000).

---

## 5. Git + Deploy Workflow

```bash
# 1. Feature branch
git checkout main && git pull origin main
git checkout -b feature/my-feature

# 2. Make changes, test locally

# 3. Merge to main
git add . && git commit -m "feat: description"
git checkout main && git pull origin main
git merge feature/my-feature && git push origin main
git branch -d feature/my-feature && git push origin --delete feature/my-feature
```

**4. Deploy backend (if changed):**
```bash
cd backend
eb deploy auxein-api-prod-lb
eb health auxein-api-prod-lb
```
> EB deploys from the working **directory**, not git HEAD — commit/sync first.

**5. Deploy Regional Insights frontend (if changed):**
```bash
cd packages/insights && npm run build
aws s3 sync dist/ s3://auxein-insights-webapp/ --delete
aws cloudfront create-invalidation --distribution-id E1LDN7KQ7TOFXN --paths "/*"
```

**6. Deploy Pro / Grow web frontend (if changed):**
```bash
cd packages/web && npm run build
aws s3 sync dist/ s3://auxein-grow-web/ --delete --profile eb-cli
aws cloudfront create-invalidation --distribution-id E2DU9CGNMPH53L --paths "/*" --profile eb-cli
```

**7. Ingestion code** deploys itself — the AWS box `git reset --hard`s to `main` daily
(§2.2), or run `bash /opt/auxein/ingestion/deploy.sh` on the box to update now.

**8. Verify:** `curl https://api.auxein.co.nz/api/health`

---

## 6. Automated Pipelines

| Job | Where | Schedule | Runs |
|---|---|---|---|
| **Weather ingestion** (7 council/commercial sources) | **AWS EC2 (Sydney) cron** | hourly at `:05` UTC | `run_all.sh` → `run_ingestion.py --source <s> --period incremental` |
| Auto-deploy | AWS EC2 cron | daily `16:30` UTC | `deploy.sh` (git reset --hard main) |
| SYNOP live | GitHub Actions `synop-live.yml` | 3-hourly | Ogimet bootstrap + NOAA promote |
| Daily processing | GitHub Actions `daily-processing.yml` | daily 6pm NZT | `run_daily_processing.py` |
| ~~Weather ingestion (GitHub)~~ | GitHub `weather-ingestion.yml` | **DISABLED** | kept as fallback only |

**Daily processing pipeline order** (raw → derived tables that feed the dashboard):
`daily_aggregation.py` (→ `weather_data_daily`) → `hourly_aggregation.py` (→ `climate_zone_hourly`)
→ `zone_aggregation.py` (→ `climate_zone_daily`) → `phenology_service.py` → `disease_service_v2.py`.

```bash
python scripts/run_daily_processing.py --date 2026-07-29           # one date
python scripts/run_daily_processing.py --date 2026-07-29 --zone-id 10   # scope to a zone
```
Backfill-processing a range (from `backend/`):
```bash
python scripts/daily_aggregation.py --start 2025-10-01 --end 2026-07-29
python scripts/hourly_aggregation.py --start-date 2025-10-01 --end-date 2026-07-29
python scripts/zone_aggregation.py --start 2025-10-01 --end 2026-07-29
python scripts/phenology_service.py --start 2025-10-01 --end 2026-07-29
python scripts/disease_service_v2.py --start 2025-10-01 --end 2026-07-29
```
> **B4.1 guard:** `daily_aggregation.py` never coalesces NULL rainfall to 0 and never
> overwrites a non-NULL value with NULL — so backdating can't zero out authoritative
> rainfall. Keep it.

---

## 7. Rollback

**Backend (Elastic Beanstalk):**
```bash
aws elasticbeanstalk describe-application-versions --application-name auxein-api \
  --max-records 5 --query 'ApplicationVersions[*].VersionLabel' --output table
aws elasticbeanstalk update-environment --application-name auxein-api \
  --environment-name auxein-api-prod-lb --version-label <version-label>
```

**Ingestion:** re-enable `weather-ingestion.yml` in GitHub and stop the box's cron
(`crontab -r`) — both write the same RDS, no data migration either way. To roll the box
code back, `git reset --hard <sha>` in `/opt/auxein`.

**DB partition swap rollback:** see `docs/runbooks/partition_timeseries_observations.md`.

---

## 8. Troubleshooting

```bash
eb logs auxein-api-prod-lb          # backend logs
eb health auxein-api-prod-lb        # backend health
curl https://api.auxein.co.nz/api/health
```
```sql
SELECT * FROM ingestion_log ORDER BY end_time DESC LIMIT 20;   -- ingestion failures
```
**Ingestion box:**
- No fresh data → SSH in, check `crond` (`systemctl status crond`), `cat /opt/auxein/logs/run_all.log`, per-source `ingest_*.log`.
- `aws: command not found` under cron → PATH (already hardened in `run_all.sh`).
- A council hangs → the hard request timeout + `timeout 40m` per source contain it; check that source's log for retries.
- Deep rainfall gaps (esp. GDC) → the council server won't reliably serve deep rainfall; accepted gap, recent rainfall still flows.

---

## 9. Environment Files

**Regional Insights** — `packages/insights/.env` (local) / `.env.production`:
```
VITE_MAPBOX_TOKEN=pk.eyJ1Ijo...
VITE_API_URL=https://api.auxein.co.nz/api/v1   # prod
```
**Backend Procfile** — `backend/Procfile` (do not modify without local testing):
```
web: gunicorn -w 2 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000
```
**Ingestion box** — no `.env`; config is in `run_all.sh`, secrets in SSM (§2.2). RDS creds
via the `RDS_USER`/`RDS_PASSWORD` env path (config's Secrets-Manager path is not used here).

---

## 10. Commit Message Convention

`feat:` new feature · `fix:` bug fix · `docs:` docs only · `refactor:` non-behavioural
· `chore:` maintenance. No `"` quotes in commit titles/bodies (paraphrase or use backticks).

---

## 11. Marketing Site (auxein.co.nz)

Next.js 14 (static export) + S3 + CloudFront.
```bash
cd packages/auxein-marketing
../../node_modules/.bin/next build
aws s3 sync out/ s3://auxein-marketing-site/ --delete
aws cloudfront create-invalidation --distribution-id E104EI45ZHSPLU --paths "/*"
```
Local: `../../node_modules/.bin/next dev` → http://localhost:3000

---

## 12. Mobile Apps (Auxein Grow)

React Native + Expo SDK 54 (managed) + EAS Build. Source: `packages/mobile`.
Distribution: Google Play (Android, `nz.co.auxein.grow`) and App Store Connect / TestFlight
(iOS, bundle `nz.co.auxein.grow`). Build credentials (keystore/certs) managed by EAS.
Play Console service account → Secrets Manager `auxein/grow/play-console-service-account`.

### 12.1 Versioning

Two independent numbers, set **locally** in `packages/mobile/app.json` and tracked in git
(`appVersionSource: "local"` in `eas.json`):
- **`expo.version`** — marketing semver (MAJOR.MINOR.PATCH), shown on the store listing.
  Bumped **deliberately per release**, not per build.
- **`ios.buildNumber`** (string) and **`android.versionCode`** (integer) — the per-upload
  build counter. Kept in **lockstep** (same integer), incremented on **every** build, never reused.

Local (not remote) because the build number lives in the repo, pinned to the commit that
produced the build — no invisible EAS server counter to drift out of sync with the stores
(that drift caused the `build number N already used` rejection).

**Bump before every build** (from `packages/mobile`):

| Command | Effect |
|---|---|
| `npm run bump:build` | +1 build number only (same release) — most common |
| `npm run bump:patch` | +1 build AND 0.1.1 → 0.1.2 (bugfix release) |
| `npm run bump:minor` | +1 build AND 0.1.1 → 0.2.0 (feature release) |
| `npm run bump:major` | +1 build AND → 1.0.0 |
| `npm run version:show` | print current numbers, change nothing |
| `npm run bump:build -- --build N` | force a specific build integer (clear a store clash) |

Script: `packages/mobile/scripts/bump-build.mjs`.

**Rules**
1. Bump → **commit `app.json`** → then `eas build`. Local versioning reads the **committed**
   git state; an uncommitted bump is silently ignored.
2. Build both platforms together (`eas build --platform all --profile production`) so the
   number stays identical across stores.
3. `android.versionCode` must be **strictly greater** than the highest ever uploaded to Play
   (all tracks); iOS `buildNumber` unique within the version train. The script self-heals
   drift via `max(iOS, Android) + 1`.
4. Never hand-edit build numbers except via the script (or a deliberate one-off to clear a clash).

### 12.2 Production Build

```bash
cd packages/mobile
eas build --platform android --profile production    # .aab for Play
eas build --platform ios --profile production        # .ipa for App Store Connect
eas build --platform all --profile production         # both in parallel
```
~15–25 min each on Expo infra. Track: `eas build:list` / expo.dev. Profiles in `eas.json`:
`development` (dev-client, Metro), `preview` (APK, prod API, no Metro), `production` (store-ready).
> `eas build` reads the **committed** `package.json`/`app.json` — commit first, or use `EAS_NO_VCS=1`.

### 12.3 Development Builds (Hot Reload)

Dev build = binary with `expo-dev-client` baked in, loading JS over the network from local
Metro (Fast Refresh ~1 s). Install once: `npx expo install expo-dev-client` (from `packages/mobile`).

| Change | Reload |
|---|---|
| JS / JSX / TS / styles | Fast Refresh (~1 s, keeps state) |
| Assets (images, fonts) | Metro reload |
| expo-router routes | Hot reload |
| Native packages added/removed | fresh `eas build` |
| `app.json` plugin/permission edits | fresh `eas build` |

```bash
eas build --profile development --platform android   # APK, ~15–20 min
eas build --profile development --platform ios       # .ipa, ad-hoc/internal
npx expo start --dev-client                          # start Metro, scan QR on device
```
Dev + prod share the Android package / iOS bundle → they replace each other on a device
(fine for solo dev; reinstall prod from the store when needed). Phone + laptop on the same
WiFi; Metro port 8081 (Defender may block it).

### 12.4 Release to Internal Testing (manual)

- **Android:** download `.aab` from EAS → Play Console → Auxein Grow → Testing → Internal
  testing → Create release → upload → Save → Review → Start rollout (~15 min to testers).
- **iOS:** `eas submit --platform ios --latest` → processes in App Store Connect (~10–20 min).
  External testers need Apple Beta App Review (~24 h).

### 12.5 Release to Internal Testing (automated — Android)

```bash
aws secretsmanager get-secret-value --secret-id auxein/grow/play-console-service-account \
  --region ap-southeast-2 --query SecretString --output text > /tmp/play-key.json
cd packages/mobile
eas submit --platform android --latest --key /tmp/play-key.json
rm /tmp/play-key.json
```
Never commit the JSON; never store long-term outside Secrets Manager. Key creation is blocked
by the org policy `iam.disableServiceAccountKeyCreation` — rotation needs it temporarily disabled.

### 12.6 Tester Onboarding

- **Android:** Play Console → Internal testing → Testers → add email → send opt-in URL →
  tester accepts + installs from Play Store on the same Google account.
- **iOS:** App Store Connect → Users and Access → invite with App Manager role → TestFlight
  → Internal Testing → add to group → tester installs TestFlight + accepts.

### 12.7 Required Play Console Forms (before rollout)

Privacy policy URL (`auxein.co.nz/privacy`); Data safety (declare location + background
location); Content rating; Target audience (18+); App access (test creds for reviewers);
Ads declaration; Store listing (descriptions, icon 512×512, feature graphic 1024×500, ≥2
phone screenshots).

### 12.8 Troubleshooting

| Symptom | Check |
|---|---|
| EAS build fails on `npm ci` peer deps | `packages/mobile/.npmrc` has `legacy-peer-deps=true`; `@vineyard/shared` peers accept React 19 |
| Item not found in Play Store for tester | wait 15 min; tester email matches phone's Play account |
| TestFlight stuck "Processing" | wait 20 min; if >1 h check export-compliance prompts |
| API calls fail from device | `extra.apiUrl` in `app.json` matches deployed backend + `/api` suffix |
| Background location not recording | Android 11+ needs "Allow all the time" in system settings |
| Dev client won't connect to Metro | same WiFi; firewall not blocking 8081; re-scan QR |
| Hot reload stops mid-session | press `r` in Metro; else restart `npx expo start --dev-client --clear` |
| Dev build crashes on launch (no Metro) | expected — start Metro before opening the dev client |
| `expo-dev-client not found` at build | `npx expo install expo-dev-client` + commit lockfile |

---

## 13. Claude Code

Auxein's preference is that code is written by human coders with AI assistance. For complex
integrations a **read-only** Claude Code session in Bash may be used to understand patterns
and integration points. Take all care. From the project root, **branch first**, then:
```bash
export CLAUDE_CODE_GIT_BASH_PATH="A:\\Auxein App\\Git\\usr\\bin\\bash.exe"
claude
```

---

## Related runbooks
- `docs/runbooks/aws-ingestion-migration.md` — the ingestion EC2 box (provisioning + setup).
- `docs/runbooks/partition_timeseries_observations.md` — the partitioned observations table.
- `docs/plans/INGESTION_EXPANSION_2026-07-16.md` — council expansion findings + status.
