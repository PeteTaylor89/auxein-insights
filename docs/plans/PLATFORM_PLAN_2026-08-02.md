# Auxein Platform Plan — Ingest · Surfaces · Insights Rebuild

**Created 2026-08-02 · target: live before season start, end August 2026**
Derived from `PLATFORM_PLAN_2026-08-02_WORKING.md` (Q&A) and the on-prem models
at `backend/models/` + `docs/models/`.

---

## 1. Locked decisions

| # | Decision | Source |
|---|---|---|
| D1 | Ingest scope is **weather/climate only**. Wider environmental estate (hydrology, groundwater, WQ) is a later programme. | Q1.1 |
| D2 | **Truly national** coverage from day 1 — required for expansion beyond viticulture into all primary industry. | Q1.2 |
| D3 | **No NIWA** — licence terms unacceptable. | Q1.1 |
| D4 | Add **West Coast**; **expand Greater Wellington**. | Q1.1 |
| D5 | **Build an AQUARIUS connector** (ORC, probably Auckland). Not for NIWA. | Q1.4 |
| D6 | Treat all council data as **open**; Pete chases licences in parallel. | Q1.5 |
| D7 | Done = **all councils with endpoints**, density sufficient for interpolation. Expect **~1,000 stations**. | Q1.6 |
| D8 | Surfaces stored as **COG on S3**. | Q2.1 |
| D9 | **500 m** for flagship regions, **1-2 km** elsewhere. National grids already exist: `VCDN_500m.csv` (1,438,684 cells), `VCDN_5km.csv` (11,491 cells). | Q2.3 |
| D10 | Surface variables: **temp, precip, PET, RH** (+ pressure if density allows). Solar/wind/soil stay **station-level points on the map**. | Q2.4 |
| D11 | Hourly + daily **station-level** aggregation feeds both interpolation and map presentation. | Q2.5 |
| D12 | Interpolation method = **Pete's TPS** (lapse detrend → 2D thin-plate → clip to observed range → lapse retrend), smoothing by 5-fold CV, **spatial-declustering holdout**. | Q2.6/2.7, `Spline_Temp_V1.7.py` |
| D13 | Surfaces become the **single source of truth**; `zone_aggregation` / `climate_zone_daily` are **retired**, not run in parallel. | Q2.10 |
| D14 | Frontend: **rebuild public-facing only**; keep admin/CMS. Free + paid gating. | Q3.1 |
| D15 | **Stay React + Vite**; keep Mapbox; SEO content goes to the existing Next.js marketing site. | Q3.2 + §7.7 working doc |
| D16 | Charts → **ECharts**. | Q3.3 |
| D17 | Reuse **Grow theme tokens**. | Q3.4 |
| D18 | **End-August scope = full free product + single-site paid product with AI agent.** Free and paid are the same product with entitlement gating. | AskUserQuestion |
| D19 | **Import** the on-prem 1986-2024 gridded archive (format confirmed compatible). | AskUserQuestion |
| D20 | Same repo. Instance sizing to be tested on AWS. AWS budget ceiling ~**$600/mo**. | Q2.9, Q4.4 |

### Explicitly deferred (not in the end-August build)
- **iOS/Android Insights app** (Q3.1) — needs its own cycle after the web ships.
- **Hourly surfaces** — see A1; the historical data to backfill them does not exist, and they are the largest compute line. Disease models keep running on station-level hourly aggregates for now.
- Wider environmental data, AU/UK expansion, trade statistics, environmental-risk layers.

### Stated assumptions (flagged, not blocking — correct me if wrong)
- **A1 — Hourly surfaces are not backfillable.** The 2020-2025 council backfills ran at *daily* interval; 30-min raw only exists from ~2025-08-31. Daily surfaces cover 2020→now; any future hourly surface series starts Aug 2025.
- **A2 — PET is computed, not measured-only.** ~18 HBRC stations measure PET — far too few for a national field. We compute per station (FAO-56 where solar+wind exist, Hargreaves elsewhere), interpolate the computed field, and use the 18 measured stations as an *independent accuracy check*. This is a credibility asset, not a compromise.
- **A3 — Orographic precipitation is new work.** `Spline_Precip_V1.py` has no elevation handling today. Approach: precip-elevation regression per region, or climatology-ratio interpolation. Settled by bake-off in Week 1, not by argument.

---

## 2. Critical path

```
WS1 ingest ──────────────┐
  (coverage feeds fit)   ├──> WS2 surfaces ──> WS3 frontend ──> paid tier + agent
WS2 grid/COG infra ──────┘        │
                                  └──> S3 surface contract published EARLY
                                       so WS3 can build against it in parallel
```

**The single most important sequencing move:** publish the S3 surface layout +
point-sampling API contract in Week 1, before any surfaces exist. WS3 then
builds against a stub and the two workstreams genuinely parallelise. Without
this the frontend waits on the pipeline and the timeline fails.

| Week | WS1 Ingest | WS2 Surfaces | WS3 Frontend |
|---|---|---|---|
| **1** (Aug 3-9) | Probe Horizons, Waikato, BoP, Taranaki, Auckland, West Coast; expand GW + ECan | **Publish S3+API contract.** Port TPS: DB-in → COG-out. Precip bake-off (A3). Grid tables. | Scaffold, design system, SurfaceMap against stubbed tiles |
| **2** (Aug 10-16) | Seed + elevation-fill + backfill new councils. AQUARIUS spike → ORC | Daily national backfill run 2020→now. Validation stats. Point-sample API live. | Map explorer, region views, station points |
| **3** (Aug 17-23) | Finish stragglers; reconcile to ~1,000 stations | Import 1986-2024 archive as COGs. Rewire phenology/disease to surfaces. | LocationDashboard, Stripe + entitlements |
| **4** (Aug 24-31) | Monitoring + freshness dashboard | Ongoing daily job on cron; tune | AI agent panel + tools; polish; deploy |

**Cut-lines if we slip, in order:** (1) AI agent → post-season; (2) the
1986-2024 import → post-season; (3) paid tier → free-only launch; (4) drop
non-flagship 500 m down to 1-2 km everywhere.

---

## 3. Workstream 1 — Complete the ingest

**Target: ~1,000 active stations, national, weather variables only.**

### 3.1 Remaining sources
| Source | Platform | Action |
|---|---|---|
| ECan (Canterbury) | Azure APIM / open portal / Hilltop | **Biggest gap** — only 4 rainfall sites wired. Discover full catalog, expand `ECAN_SITES`, seed, backfill. |
| Greater Wellington | Hilltop | Expand from 4 stations — full climate probe. |
| West Coast | probe for Hilltop/AQUARIUS | New. |
| Horizons | Hilltop (confirmed at agency level) | Probe climate collections, seed. |
| Waikato, Bay of Plenty, Taranaki | unprobed | Probe → seed → backfill. |
| Auckland | likely AQUARIUS | After the AQUARIUS connector lands. |
| ORC (Otago) | AQUARIUS | Connector + seed. Rainfall density is the value; Central Otago wine sites already covered via Harvest. |
| NRC multi-depth soil | Hilltop | Data-model decision: we store single `soil_temp`/`soil_moisture_vwc`; NRC has 8+4 depths. Defer or extend schema. |
| NOAA NCEI | built, never run | Run backfills for the deep climatology baseline. |

### 3.2 Method (proven, repeat it)
`probe_hilltop.py` → `seed_<council>_from_probe.py` → `fill_elevation_from_dem.py`
→ `backfill_driver.py --source X --start 01/01/2020`. Then wire into **all three**
places: `run_all.sh` SOURCES, `run_ingestion.py` choices/dispatch, and the
workflow matrix. Seeding alone does not make a source run — that mistake cost us
Southland and NRC once already.

### 3.3 New work
- **AQUARIUS connector** — genuinely new client (third API shape after Hilltop
  and the ES bespoke JSON). Time-box a spike in Week 2; if it fights back, ORC
  and Auckland drop to post-season without blocking anything else.
- **Freshness monitoring** — we found the Southland +12h bug and the CODC IAM
  lockout by hand. With ~1,000 stations that does not scale. Build a
  freshness/anomaly check: per-source lag, future-dated rows, stations silent
  >24 h, and a diurnal sanity check. This is cheap and prevents silent rot.

---

## 4. Workstream 2 — Surfaces

### 4.1 Port the model (do not rewrite the science)
`Spline_Temp_V1.7.py` is the reference. Changes required:
1. **Input**: CSV-per-date → query station daily/hourly aggregates from Postgres.
2. **Station metadata**: CLIFLO CSV → `weather_stations` (lat/lon/elevation already clean, zero nulls).
3. **Grid**: load `VCDN_500m` / `VCDN_5km` into a `surface_grid` table (or keep as Parquet on S3 — decide on load time).
4. **Output**: CSV → **COG GeoTIFF** via `rasterio`. New dependency; add GDAL/rasterio to the ingestion env.
5. **Stats**: `statistics_df` CSV → `surface_validation_stats` table.
6. **Engine**: migrate `scipy.interpolate.Rbf` → `RBFInterpolator` (legacy Rbf is deprecated, and much slower/heavier at ~1,000 stations × 1.44 M grid cells). **Validate outputs match the old model before switching.**
7. Fix the two bugs noted in the working doc §7.5 (stale `rmse` in SNR on retry; possible `NameError` on `new_rmse`).

### 4.2 Keep exactly as-is
- Lapse-rate detrend/retrend at 0.6 °C/100 m (not elevation-as-covariate).
- Smoothing selected per date by 5-fold CV over `logspace(-4, 0, 7)`.
- `np.clip` to observed min/max.
- **Spatial-declustering holdout** + adaptive threshold escalation. This also
  solves the MDC near-colocated station problem already logged as a risk.

### 4.3 Storage contract (publish in Week 1)
```
s3://<bucket>/surfaces/v1/{variable}/{granularity}/{YYYY}/{MM}/
    {variable}_{granularity}_{YYYYMMDD}[_{HH}]_{resolution}.tif        # value
    {variable}_{granularity}_{YYYYMMDD}[_{HH}]_{resolution}_sd.tif     # uncertainty
```
Postgres index table `surface_run`: one row per (variable, granularity, valid_at,
resolution, model_version) → S3 key, station counts, and FK to
`surface_validation_stats`. One SQL query finds the right raster; the raster
itself never bloats the DB.

### 4.4 Volumes (measured, not guessed)
| Product | Surfaces | Storage | Compute |
|---|---|---|---|
| Daily 4 vars, 2020→now | ~9,500 | ~14 GB | 8-16 h one-off @16 cores |
| 1986-2024 import (5 km, 5 vars) | ~71,000 | ~3.5 GB | hours (format conversion only) |
| Ongoing daily | 4/day | negligible | minutes/day |

**Storage costs a few dollars a month.** The constraint is a one-off compute
spike — rent a large instance for the backfill, then run small. Comfortably
inside $600/mo.

### 4.5 Historical import (D19)
Format confirmed compatible: `VCSN_gridded_output_<date>.csv` = 11,491 rows on
the regular `VCDN_5km` lat/lon grid with `Interpolated_*` and `Adjusted_*`
columns. Use **`Adjusted_*`** (lapse-corrected to each cell's elevation).
Straight conversion to COG.

**Two joins to handle honestly:**
- **Resolution step**: history is 5 km, new surfaces are 500 m / 1-2 km. Record
  `resolution_m` per surface and never silently mix them in one chart.
- **Variable gap**: history has Tmin/Tmax/Tmean, rain, radiation — **no RH, no
  PET**. Those series simply start at 2020.
- **Era step-change**: different station networks (~175-190 historical vs 427→1,000
  now) and different code. Overlap 2020-2024 exists in both — **quantify the
  offset over that window and publish it** rather than hiding it.

### 4.6 Downstream
Rewire phenology + disease to read surfaces (making both point-callable), then
retire `zone_aggregation.py` / `climate_zone_daily` (D13). Keep the old table
schemas alive briefly so existing APIs don't break mid-migration.

---

## 5. Workstream 3 — Insights rebuild

**Rebuild public-facing only. Keep admin, CMS, Tiptap editor, user management.**

### 5.1 Non-negotiables (research before building — Q3.7)
`WidgetEmbed`, Grow→Insights SSO, existing article/research URLs (SEO). A
dedicated audit pass precedes the build.

### 5.2 Free vs paid
Same product, entitlement-gated (D18). Free: national surface map, regional
views, station points, articles/research. Paid: saved single location with full
history + projections + point-level phenology/disease/spray + AI agent.

### 5.3 Components
- `SurfaceMap` (hero) — COG-backed raster overlay, variable switcher, time
  scrubber + play, opacity, colour-ramp legend.
- `RegionChoropleth` — zones coloured by zonal statistic from the surfaces.
- Station point layer for solar/wind/soil (D10).
- `LocationPicker` + `LocationDashboard` — the paid single-site view.
- `ConfidenceBadge` — RMSE/SD next to every value. **First-class, not an admin
  afterthought** — it's the differentiator.
- `InsightAgentPanel` — Claude + curated read-only tools, streaming, entitlement-gated.
- Stripe self-serve + `PaywallGate` / `UpgradeModal` / `ManageSubscription`.

### 5.4 Landing experience (Q3.6)
Value visible in 30 seconds without signup — live national map in demo form,
strong CTA to subscribe, featured article slot.

---

## 6. Top risks

| Risk | Mitigation |
|---|---|
| **Timeline is aggressive** — full free + paid + agent in ~4 weeks | Cut-lines in §2, in order. Publish the S3 contract Week 1 so WS2/WS3 parallelise. |
| Orographic precip unsolved (A3) | Bake-off Week 1. Fallback: ship precip without orographic correction, flagged with honest confidence bounds. |
| AQUARIUS connector overruns | Time-boxed spike; ORC/Auckland drop to post-season without blocking. |
| Backfill compute overruns budget | One-off spike on a rented instance, then scale down. Measure on one month before committing to 2020→now. |
| Surface quality poor in sparse regions | The validation layer *makes this visible* rather than hiding it — publish confidence and let it drive where stations get added. |
| ~1,000 stations, manual monitoring | Freshness/anomaly monitoring in WS1 §3.3. |

---

## 7. Progress

### Done 2026-08-02
- `--source` filter on `daily_aggregation.py`; Southland + NRC daily-aggregate backfills complete.
- **Surface contract published** — `SURFACE_CONTRACT_V1.md`. WS3 is unblocked and can build against a stub.
- **TPS model ported and parity-verified** — `backend/scripts/interpolation/tps.py`, exact reproduction of the on-prem model across all 15 golden dates (2.16e-9 °C). Regression suite in `parity_check.py`.
- **Accuracy methodology settled** — shuffled 10-fold + production clip; confidence banded by distance-to-nearest-station. See working doc §8.

### Next
1. **COG writer** — grid + values → Cloud-Optimized GeoTIFF per the contract.
2. **DB-backed input** — replace the CSV fixture path with station aggregates from Postgres; run one real month on the 1 km grid to get a true backfill compute figure.
3. **Precip orographic bake-off** (assumption A3) — the largest open quality risk.
4. **Council probes** in parallel — mechanical, low risk, no dependency on the above.
5. Create the `auxein-climate-surfaces` bucket and upload `VCDN_500m.csv` to `grids/` (73 MB, deliberately not in git).

### Decisions still owed
- Should smoothing *selection* shuffle its folds? Better selection vs bit-parity with the imported archive.
- A1 hourly, A2 PET, A3 orographic precip — proceeding on stated assumptions until contradicted.
