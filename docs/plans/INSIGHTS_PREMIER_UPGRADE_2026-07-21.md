# Auxein Insights — Premier Weather & Viticulture Platform

**Planning exercise · 2026-07-21 · status: DRAFT for review**

This is a planning document only. No code has been changed. It sets out (1) an
overall plan, (2) a summary of frontend components to build, and (3) a summary of
the data pipelines — for upgrading Insights from the current table/chart regional
views to a maps-first, spline-interpolated, paid-tier-capable platform with an
embedded AI agent.

---

## 1. Locked decisions (from planning Q&A, 2026-07-21)

| Decision | Choice |
|---|---|
| **Structure** | **Phased, NZ MVP first.** Phase 1 delivers the TPS pipeline + surface store + maps-first NZ regional views + paid single-location tier + AI agent. AU/UK, trade stats, environmental-risk data are later phases. |
| **Surface storage** | **Precomputed raster grids in PostGIS raster.** Point + region queries via `ST_Value` / `ST_Clip` / zonal stats. |
| **AI agent** | **Claude + curated query tools.** Anthropic SDK tool-runner over a fixed set of safe, parameterised tool functions; instructional MD file as the cached system prompt. No raw-SQL exposure. |
| **Paid tier** | **Stripe self-serve subscription.** Standalone from Grow's Xero billing. |

---

## 2. Verified current state (what we build on)

**Interpolation:** none exists. `zone_aggregation.py` is labelled "IDW" but is a
station **mean with ±1.5-SD outlier removal** (no distance weighting, no
coordinates). No scipy/spline/kriging/raster code anywhere. Greenfield.

**Storage:** `weather_data` / `weather_stations` are back-compat **VIEWs** over
`timeseries_observations` / `devices` (rename-only migration). ~7M obs rows,
unpartitioned heap; native yearly partitioning drafted but **unapplied**
(`part_timeseries_struct.py`, `part_timeseries_swap.py`, runbook exists).

**DB:** PostgreSQL 17.9, PostGIS 3.5.1 **installed**; `postgis_raster` 3.5.1
**available but not enabled**. Geometry/geography already used across blocks,
zones, devices.

**Stations:** 145 devices, all NZ (`country_id = 1`), all geolocated. Variables
ingested: `temp` (2.7M), `rainfall` (1.06M), `rh` (979k), `solar_radiation`,
`pressure`, `dewpoint`, `wind_speed`, `wind_direction`. **PET / ET0 is
catalogued but NOT ingested** — no source emits it; it must be computed.

**Data depth:** operational obs only ~1 season deep (2025-08-31 → present).
"History" for a paid single-location product must come from the historical /
climatology tables (`climate_history_monthly`, `climate_zone_season_stats`,
block-level `climate_historical_data` ≈121M rows) and from the **unrun**
NOAA/council backfills — not from the operational heap. **This gates the "full
history" promise.**

**Regional pipeline (daily, 6pm NZT — `run_daily_processing.py`):**
raw `weather_data` → `weather_data_daily` (per station) →
`climate_zone_daily` / `climate_zone_hourly` (zone mean) → `phenology_estimates`
→ `disease_pressure`. Zone→station mapping via recursive CTE on
`climate_zones.parent_zone_id`.

**Phenology:** `phenology_service.py` — per zone × variety GDD accumulation
(vintage Jul 1–Jun 30), stage prediction, vs 1986–2005 baseline. Reads
`climate_zone_daily`. Véraison output currently suppressed pending calibration.

**Disease:** `disease_service_v2.py` — three peer-reviewed hourly models
(UC-Davis PM index, González-Domínguez botrytis, 3-10 Rule + Goidanich DM). Leaf
wetness **estimated** from rain/RH/dewpoint. Reads `climate_zone_hourly`. Reads
phenology stage to modulate botrytis. Both services consume **zone aggregates,
not points** — so today neither can run for an arbitrary location.

**Frontend (`packages/insights`):** React/Vite SPA, react-router v7. Charts =
**Chart.js**; map = **Mapbox GL v3** (`components/RegionalMap/`), four public
GeoJSON layers (blocks/regions/GIs/climate-zones). Auth = custom `PublicUser`
JWT + one-way Grow→Insights SSO. **No paid/subscription concept exists** — only
demo (Waipara-locked) → free-account → `is_admin`. Grow-side "3-source
phenology" panel is mock, awaiting a backend that produces local-station and
field-observation phenology (neither exists yet).

**Reusable spray code?** `spray_coverage.py` is GPS-track application
*verification* (did we physically cover the block?), **not** weather-based spray
*timing*. The disease API already has empty `spray_recommendation` /
`risk_factors` seams to populate — that is the hook for weather-based spray
decisions; the engine itself is greenfield.

---

## 3. Target architecture

```
                 INGEST (NZ councils + Harvest + NOAA; later BoM/SILO, Met Office)
                        │  raw point observations → timeseries_observations (partitioned)
                        ▼
             DERIVE per-station daily/hourly  +  COMPUTE PET (FAO-56 / Hargreaves)
                        │
                        ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  INTERPOLATION ENGINE  (Python, scheduled)                          │
   │  elevation-aware Thin-Plate Spline per variable per timestep        │
   │  + generalized cross-validation error surface                       │
   └──────┬─────────────────────────┬──────────────────────┬────────────┘
          │ gridded rasters          │ eval model at exact  │ per-surface
          │                          │ lat/longs (§4.9)     │ CV/holdout stats (§4.9)
          ▼                          ▼                      ▼
   ┌───────────────────────────┐  ┌───────────────────┐  ┌────────────────────┐
   │ SURFACE STORE (raster)    │  │ POINT-SAMPLE STORE│  │ VALIDATION STATS   │
   │ climate_surface           │  │ surface_point_    │  │ surface_validation │
   │ (variable, valid_at,      │  │ sample: model     │  │ RMSE/MAE/ME/R²/n   │
   │  resolution, rast, sd)    │  │ eval'd at exact   │  │ per surface        │
   │ tiled+GIST, partitioned   │  │ lat/longs (+resid)│  │ (queryable)        │
   └───┬───────────┬───────┬───┘  └───────────────────┘  └────────────────────┘
       │ ST_Clip   │ ST_   │ raster       ▲ parallel to the grid, not ST_Value:
       │ +zonal    │ Value │ → tiles      exact-coordinate model evaluation for
       ▼           ▼       ▼              external validation & requested points
  REGIONAL VIEWS  POINT-QUERY  RASTER TILE SERVICE
  (all NZ zones)  SERVICE      (map overlays)
                  (any lon/lat)
       │               │
       ├──────────────►│  PHENOLOGY (GDD)  &  DISEASE (PM/Bot/DM)  run per zone OR per point
       │               │
       ▼               ▼
  Insights maps-first frontend  ──────────  AI AGENT (Claude + curated tools)
  (public regional + paid single-location dashboard)
```

Design principle: **surfaces become the single source of truth.** Regional
views, phenology, disease, and point queries all read the same interpolated
surfaces, so a region value and a point value inside that region are always
consistent — and any point in NZ can be served, which is what unlocks the paid
single-location product.

---

## 4. Data pipelines — summary

### 4.1 Interpolation engine (the core new capability)

**Method: elevation-aware (partial) thin-plate spline**, mirroring the approach
NIWA uses for NZ climate surfaces (VCSN / ANUSPLIN-style trivariate smoothing
spline). Pure 2D TPS ignores NZ's extreme orographic gradients and will smear
temperature across ranges. Fit:

- **Temperature (Tmin, Tmax, Tmean), RH:** `value ~ TPS(lon, lat) + β·elevation`
  — elevation as a covariate, sampled from a DEM. TPS via `scipy.interpolate`
  (RBF thin-plate kernel) or `pyKrige`/custom; evaluate onto the grid, then add
  back the elevation term at each grid cell's DEM height. DEM sourced from LINZ
  (we hold `LINZ_API_KEY`) — a one-off national 1 km DEM raster.
- **Precipitation:** hardest — non-negative, skewed, sharp gradients. Do **not**
  TPS raw mm. Interpolate on a variance-stabilising transform (`log1p` or
  `sqrt`) or, better, interpolate the **ratio to monthly climatology** and
  multiply back by a climatological precip surface. Fallback IDW for
  sparse-station days.
- **PET / ET0:** compute **per station first**, then interpolate the daily PET
  field. FAO-56 Penman-Monteith where solar + wind exist; Hargreaves (temp-only)
  fallback elsewhere. (Compute-then-interpolate is more robust than
  interpolate-inputs-then-compute for daily ET0.)
- **Uncertainty:** store the generalized-cross-validation **standard-error
  surface** alongside each value surface, so region/point outputs can carry
  confidence and sparse-station days are flagged.

**Cadence & resolution (storage-vs-value tradeoff):**

| Product | Grid | Cadence | Retention |
|---|---|---|---|
| **Daily surfaces** (temp, precip, PET, RH) | 1 km NZ | daily | full, in DB |
| **Hourly surfaces** (temp, RH) — frost + disease | 5 km NZ | hourly | rolling 90 days in DB, older → Parquet/S3 |

Full-resolution hourly rasters for all NZ across four variables are prohibitive;
hourly is coarsened and limited to the two variables the disease/frost models
actually need. Everything daily stays at 1 km.

**Schedule:** extend `run_daily_processing.py` — new step *between* per-station
derivation and zone/phenology/disease. New module e.g.
`backend/scripts/interpolation/build_surfaces.py`.

### 4.2 Surface store (PostGIS raster)

- `CREATE EXTENSION postgis_raster;` (verified available on RDS).
- Table `climate_surface`: `variable_code`, `granularity` (daily|hourly),
  `valid_at` (date/timestamptz), `resolution_m`, `rast raster`, `sd_rast raster`
  (uncertainty), `model_version`, `crs`. **Tiled** (e.g. 100×100 px) with a GIST
  index on `ST_ConvexHull(rast)`; range-**partition by (granularity, variable,
  year)** to keep pruning fast (reuse the yearly-partition discipline from the
  timeseries runbook). Cold-archive hourly tiles > N days to S3 Parquet.
- Query patterns: `ST_Value(rast, point)` for point; `ST_Clip(rast, zone_geom)` +
  `ST_SummaryStats` (area-weighted) for a region.

### 4.3 Regional views from surface (replaces current aggregation)

New `regional_stats_from_surface` service: for each `climate_zones` polygon,
zonal-clip the daily surfaces and compute area-weighted mean/min/max + the
existing derived metrics (GDD, frost days, hot days, R99p, Rx1day). This
replaces `zone_aggregation.py`'s station-count-weighted mean with a
**spatially representative** value and produces identical outputs whether you ask
"the region" or "a point in the region". Keep the old tables' schema so the
existing `public_climate` / `realtime_climate` APIs and Insights explorers keep
working during migration.

### 4.4 Point-query service (the paid-tier engine)

`GET /point?lon&lat` → `ST_Value` across all variables/dates → full history +
current + projections + derived metrics for **any** NZ location. This is what the
paid single-location plan sells. Phenology and disease become point-callable by
running the existing models on the point's surface-sampled series.

### 4.5 Phenology / disease rewiring

- **Phenology:** GDD accumulation from the surface (zonal Tmax/Tmin for regional,
  point-sampled for paid). Same thresholds/stages. Now runnable per arbitrary
  point → finally lets the Grow-side 3-source panel get a real "regional model"
  and "local point" source.
- **Disease:** hourly temp/RH (+ estimated leaf wetness) from the hourly surface,
  per zone or per point. Same three models. Populate the currently-empty
  `spray_recommendation` seam (see 4.6).

### 4.6 Spray-decision engine (new; feeds the AI agent)

A weather-based **spray-timing** service (distinct from Grow's GPS coverage
verification): combines current disease pressure + phenology susceptibility +
**forecast** rain / leaf-wetness / wind to output a "spray now / hold / window
opens X" recommendation and a rationale. Forecast source: MetService/BoM/Met
Office or Open-Meteo (decision below). This is the agent's highest-value tool.

### 4.7 Ingest expansion (staged)

- **NZ councils** — already scoped in `INGESTION_EXPANSION_2026-07-16.md`
  (HBRC +15 stations w/ PET & wind; MDC `Climate` collection to 1963; Southland
  bespoke API; Northland). Fix **B4.1** (NULL-rainfall→0 overwrite) *before* any
  backfill. Add PET to the measurement path.
- **Historical backfills** — run NOAA GHCNh/GHCN-Daily + council depth so
  "history" exists (prerequisite for paid history + climatology-scaled precip
  interpolation).
- **Australia** (Phase 5) — BoM + SILO/AGCD gridded baseline; AU GI region seed
  already drafted in the platform plan.
- **UK** (Phase 6) — Met Office DataHub; NH vintage calendar (`vintage_year_for`).

### 4.8 Environmental risk & trade (later phases)

- **Environmental risk by geography** (Phase 7): derived layers off the surfaces
  + external data — frost risk, drought/aridity (PET-P), fire weather, and
  flood/erosion overlays (LINZ/regional hazard layers). Stored as raster or
  zone-level indices.
- **Trade statistics** (Phase 8): export volumes & markets — separate data
  domain, external sources (NZ Winegrowers annual report, Stats NZ / ABS /
  HMRC / Eurostat / UN Comtrade). New `trade_*` tables + dashboard; not tied to
  the surface pipeline.

### 4.9 Validation & point-sampling layer (parallel to the rasters)

A second output path from every interpolation run, independent of the raster
grid. **Distinction that drives the whole design:** a standard paying user
querying their location gets the **raster cell value** (`ST_Value`, snapped to the
grid unit they fall in). This layer instead **evaluates the fitted model function
directly at exact lat/longs** — the continuous TPS/IDW value at the coordinate,
carrying no grid-discretization error — for external validation and for
specifically-requested reference points. The two paths coexist; they are not the
same number.

**Inputs — a point registry:**

- `interpolation_sample_point` — id, `label`, `geom` POINT(4326), `elevation`,
  `purpose` (`validation_holdout` | `cross_val` | `requested` | `reference`),
  optional `source_station_id` (for holdout/known-observation points), optional
  owner/company scoping, `active`. Editable independently of the grid — add a
  research plot or a benchmark vineyard and it starts being sampled next run.

**Pipeline step (added to `build_surfaces.py`, per surface):**

1. Fit the model (already producing the raster + SD surface).
2. **Evaluate the fitted function at every `active` sample point** → append to
   `surface_point_sample` (`surface_run_id`, `point_id`, `variable`, `valid_at`,
   `value`, `sd`, `model_version`). This is the parallel-to-raster deliverable.
3. Where the point has a known observation (holdout station, or a submitted
   ground-truth), compute and store the **residual** (`predicted − observed`).

**Validation stats — queryable per surface:**

- `surface_validation_stats` — one row per surface (natural key: `variable`,
  `granularity`, `valid_at`, `model_version`): `rmse`, `mae`, `me` (mean
  error/bias), `r2`, `n_stations_used`, `n_validation_points`, `loocv_rmse`
  (leave-one-out cross-validation over input stations), `gcv` (spline
  generalized-cross-validation), `max_abs_error`, `min/max_sd`. Two accuracy
  sources feed it: **LOOCV/k-fold over the fit stations** (intrinsic, always
  available) and **holdout residuals** from `validation_holdout` points (needs a
  designated withheld set — a Phase-0 decision).

**A `surface_run` catalog** ties the three stores together: one row per
(variable, granularity, valid_at, model_version) that the raster tiles,
point-samples, and validation-stats rows all FK to — so "give me the RMSE for the
surface behind this pixel" and "give me the exact-model value + its surface's
RMSE at this coordinate" are single joins.

**Uses this unlocks:**

- External validation reports / audits (accuracy per variable, per region, over
  time), and a scientific-credibility story for the premier product.
- Confidence on every point answer — the agent and the LocationDashboard can cite
  the surface's RMSE alongside a value.
- Fulfilling specifically-requested locations (partners, researchers) at
  full model fidelity, decoupled from the raster resolution.
- An admin **validation dashboard** (accuracy trends, worst-performing
  variables/dates/regions → where to add stations).

---

## 5. Frontend components — summary

Refactor from chart/table-first to **maps-first**. Keep Mapbox GL (already in
use) and keep Chart.js as *secondary drill-down* only.

**Core map + surface visualisation**
- `SurfaceMap` — the hero. Raster overlay of temp/precip/PET/RH via tiles from
  the raster tile service; variable switcher; **date/time scrubber + play
  (animation)**; opacity control; colour-ramp legend.
- `RasterTileLayer`, `TimeScrubber`, `ColorRampLegend`, `VariableSwitcher`,
  `RasterOpacityControl`, `BasemapToggle`.
- `RegionChoropleth` — zone polygons coloured by the zonal statistic (the
  "regional view", now surface-derived).

**Location / paid experience**
- `LocationPicker` — click map → drop pin → resolve to a point (the paid plan's
  single location); reverse-geocode + nearest-zone label.
- `LocationDashboard` — the premium single-location view: history, projections,
  seasonal fingerprint, phenology timeline, disease-pressure timeline, spray
  window. Map-anchored, cards + small multiples rather than dense tables.
- `PaywallGate`, `PlanBadge`, `UpgradeModal`, `ManageSubscription`.

**AI agent**
- `InsightAgentPanel` — chat UI (streaming), suggested prompts ("How does this
  season compare?", "When's my next spray window?"), tool-call trace, entitlement
  gate. Renders agent-returned mini-charts/maps inline.

**Shared / refactor**
- Retire `RegionStatsModal` table-first layouts in favour of map-anchored panels.
- Reuse existing `PublicClimateContainer` season-gating; feed it surface data.
- `ConfidenceBadge` — surfaces the per-surface RMSE/SD next to any point or
  region value (from `surface_validation_stats`).

**Admin**
- `ValidationDashboard` — accuracy trends (RMSE/MAE/bias/R² over time, by variable
  and region), residual maps, worst-performing surfaces → where to add stations.
- `SamplePointManager` — CRUD for `interpolation_sample_point` (validation
  holdouts, reference/requested locations).
- Otherwise keep existing admin/CMS untouched.

**Public vs paid split**
- Public: national SurfaceMap + RegionChoropleth + existing explorers (all NZ),
  demo-limited where appropriate.
- Paid: LocationPicker + LocationDashboard + InsightAgentPanel + projections +
  point-level phenology/disease/spray.

---

## 6. AI agent design

- **Provider/model:** Anthropic **Claude** via the official SDK **tool-runner**.
  Default `claude-opus-4-8`; `claude-sonnet-5` is the cost-down option for
  high-volume chat, `claude-haiku-4-5` for cheap classify/summarise sub-steps.
- **Instructional MD** = the cached system prompt (frozen prefix → prompt
  caching; keep volatile context out of it). Authoring is user-owned.
- **Curated, read-only tools** (no raw SQL): `get_point_history`,
  `get_current_conditions`, `get_forecast`, `get_gdd_progress`,
  `get_phenology`, `get_disease_pressure`, `get_spray_window`,
  `compare_to_climatology`, `get_regional_overview`. Each is a typed,
  parameterised function hitting the point-query / surface services. Point tools
  return the value **with its surface's confidence** (`surface_validation_stats`
  RMSE/SD, §4.9) so the agent can state how reliable an answer is.
- **Backend:** an endpoint runs the tool loop server-side (Python SDK
  `client.beta.messages.tool_runner`), streams to `InsightAgentPanel`,
  entitlement-gated. Adaptive thinking on; effort `medium`/`high`. Later:
  spray-decision reasoning can escalate to an Outcome/higher effort.
- **Safety:** curated tools only, per-user location scoping, rate limits, and
  cost caps per subscriber.

---

## 7. Paid tier

- **Stripe self-serve**: public signup → card → single-location plan. Standalone
  from Grow/Xero.
- **New tables:** `subscription` (Stripe customer/subscription/status),
  `entitlement` (feature flags), `paid_location` (one point geometry per simple
  plan).
- **Gating:** point-query, projections, agent, point-level phenology/disease/
  spray behind `entitlement`. Stripe webhooks → entitlement state.
- Builds on the existing `PublicUser` auth; no change to Grow's billing.

---

## 8. Phased roadmap (NZ MVP first)

| Phase | Deliverable | Key risk / dependency |
|---|---|---|
| **0 · Prerequisites** | Enable `postgis_raster`; ingest national DEM; add PET computation; apply timeseries partitioning; fix B4.1; **run historical backfills**. | Backfills gate "history"; B4.1 must precede backfill. |
| **1 · Surface pipeline (MVP core)** | TPS engine (daily NZ, 4 vars) + surface store + **validation & point-sample layer (§4.9): `surface_run` catalog, `surface_point_sample`, `surface_validation_stats`** + regional views from surface + point-query service; rewire phenology/disease to surfaces. | Precip interpolation quality; station sparsity in some zones; job runtime; designating a holdout station set. |
| **2 · Maps-first frontend** | SurfaceMap + raster tiles + TimeScrubber + RegionChoropleth + LocationPicker; retire table-first layouts. | Raster tile serving (pre-render PNG/COG to S3+CF vs dynamic tiler). |
| **3 · Paid tier + agent** | Stripe self-serve + entitlements + LocationDashboard + InsightAgentPanel (Claude + curated tools). | Forecast source; cost caps. |
| **4 · Hourly surfaces + spray** | 5 km hourly temp/RH surfaces; weather-based spray-decision engine feeding the agent. | Forecast integration; hourly storage/archive. |
| **5 · Australia** | BoM + SILO/AGCD ingest; AU regions/GIs; NH vintage. | Licensing (BoM commercial terms). |
| **6 · United Kingdom** | Met Office DataHub ingest; UK regions. | Data licensing. |
| **7 · Environmental risk** | Frost/drought/fire-weather/flood layers by geography. | External hazard data sourcing. |
| **8 · Trade statistics** | Export volumes & markets dashboard. | External trade-data sourcing/licensing. |

---

## 9. Open decisions for Pete

1. **Precipitation method** — climatology-scaled TPS vs transform-TPS vs IDW
   fallback. Needs a small accuracy bake-off on held-out stations once backfills
   land.
2. **Raster tile serving** — pre-rendered PNG tiles to S3/CloudFront (simple,
   cheap, matches EB-from-directory deploys) vs a dynamic COG tiler (titiler-style)
   for arbitrary variable/date. Recommend pre-render for MVP.
3. **Forecast provider** — MetService/BoM/Met Office (licensed, authoritative)
   vs Open-Meteo (free, global, quick to integrate) for the spray-decision +
   agent forecast tool. Recommend Open-Meteo for MVP, licensed later.
4. **History depth for paid** — how far back must the single-location history go?
   Determines which backfills are Phase-0 blocking vs deferrable.
5. **Grid resolution** — confirm 1 km daily / 5 km hourly, or tighter (500 m)
   for flagship regions (Marlborough/Central Otago) given station density.
6. **PET definition** — FAO-56 grass ET0 (standard) confirmed as the reference,
   with Hargreaves fallback where wind/solar absent?
7. **Seasonal-widget season start** — code says **1 Sep**; brief referenced
   1 Oct. Confirm before surface-derived metrics reuse it.
8. **Validation holdout set** — which stations (and how many) are permanently
   withheld from the fit to feed independent RMSE, vs. relying on LOOCV over all
   stations. Withholding costs surface accuracy in sparse regions; LOOCV keeps
   every station in the fit but is a weaker independence claim. (Confirm too that
   the sample layer means **continuous-model evaluation** at exact coords, not
   `ST_Value` at stored points — §4.9 assumes the former.)

---

## 10. Notes / footguns to respect

- Alembic migrations at repo-root `alembic/versions/`; 32-char slug limit;
  watch the dual-row `alembic_version` gotcha.
- `Enum(...)` ≠ Postgres ENUM; generic `ARRAY` lacks `.overlap()` (use
  `.op('&&')`).
- EB deploys from the working **directory**, not git HEAD.
- Insights FE is S3+CloudFront — needs an explicit rebuild/deploy after backend
  data changes (has bitten prior climate-extremes work).
- Web = managers/admins only; the paid Insights consumer is a `PublicUser`, a
  separate identity from Grow company users.
```
