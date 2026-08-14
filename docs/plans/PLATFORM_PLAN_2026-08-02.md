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
- ~~**A3 — Orographic precipitation is new work.**~~ **SETTLED 2026-08-04 by bake-off, and the answer was not the expected one.** Climatology-ratio interpolation (Tait et al. 2006) was built and measured against the live network: with a *perfect* climatology it is worth −21% MAE, but with ours it is **+8% worse than no covariate at all**. Our mean-annual-rainfall field has median error 14.4% and p90 43.9%, and past ~40% error the ratio method detonates (+70%). **Shipped `sqrt` instead** — a variance-stabilising transform, free −7% and false-wet 6.8% → 3.8%, no new data required. Orography therefore remains uncorrected; the ratio is waiting on a real climatology (NIWA 1991-2020 normals, LENZ, or extending our own record back via CliFlo/GHCN). Do not retry it before then.

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
6. ~~**Engine**: migrate `scipy.interpolate.Rbf` → `RBFInterpolator`.~~
   **SUPERSEDED 2026-08-04 — do not do this.** The engine is now our own ridge
   + GCV bordered solve (`ridge`, the default), which makes the swap moot: there
   is no scipy call left to modernise on the production path. `RBFInterpolator`
   would also have been a like-for-like swap that fixed none of the real
   problems — see `INTERPOLATION_BENCHMARK_2026-08-04.md` §7. `legacy` retains
   the deprecated `Rbf` deliberately, because it is the parity target.
7. Fix the two bugs noted in the working doc §7.5 (stale `rmse` in SNR on retry; possible `NameError` on `new_rmse`). **Done.**

### 4.2 What survived the benchmark, and what did not

*(Rewritten 2026-08-04/05. This section originally read "Keep exactly as-is" —
the instruction not to redesign science that was already validated. That was
right about the elevation handling and wrong about almost everything else, and
measurement is what settled it. Full reasoning:
`INTERPOLATION_BENCHMARK_2026-08-04.md`.)*

**Kept, and confirmed by measurement:**
- Lapse-rate detrend/retrend at 0.6 °C/100 m (not elevation-as-covariate).
  Tested against a naive trivariate fit, which was **worse on all 15 dates**
  (1.47 vs 1.27 °C). The original author's choice was correct.
- **Spatial-declustering holdout.** Still solves the MDC near-colocated station
  problem. But it is a fit-stabilisation device first and a test set only
  opportunistically — `n_test` is 0–13, and zero for 1986.

**Replaced:**
- Smoothing by 5-fold CV over `logspace(-4, 0, 7)` → **λ by minimising GCV**, as
  ANUSPLIN does, with a guarded fallback at γ = 1.2 when the first choice spends
  >80% of available dof. The old search was a no-op: it picked the floor of the
  grid on 15/15 dates, because scipy *subtracts* `smooth` from the kernel
  diagonal rather than adding a ridge.
- `np.clip` to observed min/max → **no clip**. It was load-bearing only because
  the unregularised fit overshot; a properly penalised one does not need it.
- Adaptive escalation → **disabled under `ridge`** (still live under `legacy`,
  which depends on it for parity). It gated on the in-sample residual, so it
  "improved" by deleting real stations until the spline could interpolate the
  remainder — on 1991 it dropped 11 observations and drove the residual from
  0.913 to 0.002 °C with no out-of-sample gain.

**Added 2026-08-05** — a station **relevance screen** (drop stations >800 km
from the target grid) and an **antimeridian wrap** in the projection. Both are
correctness, not accuracy: together worth <0.1% MAE. The wrap matters because
without it any station across the antimeridian — the Chathams, for instance — is
silently erased from the fit. Contract v2 §4.2.

Net: **`cv_rmse` median 1.324 → 1.106 °C, better on 15 of 15 dates**, and ~3×
faster because one eigendecomposition replaces 35 spline fits.

### 4.3 Storage contract (publish in Week 1)
```
s3://<bucket>/surfaces/v2/{variable}/{granularity}/{YYYY}/{MM}/
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
| ~~Orographic precip unsolved (A3)~~ **Bake-off run; the fallback is what ships.** | Climatology-ratio measured and rejected — our climatology is not good enough and makes it *worse* (A3). Shipping `sqrt` with no orographic correction and honest confidence bounds, exactly as the fallback anticipated. Residual risk is now **heavy rain: 27.9 mm MAE with −16.5 mm bias** — we under-predict extremes, on precisely the days customers look up. Must be disclosed wherever storm rainfall is presented. |
| AQUARIUS connector overruns | Time-boxed spike; ORC/Auckland drop to post-season without blocking. |
| Backfill compute overruns budget | One-off spike on a rented instance, then scale down. Measure on one month before committing to 2020→now. |
| Surface quality poor in sparse regions | The validation layer *makes this visible* rather than hiding it — publish confidence and let it drive where stations get added. |
| ~1,000 stations, manual monitoring | Freshness/anomaly monitoring in WS1 §3.3. |

---

## 7. Progress

### Done 2026-08-02
- `--source` filter on `daily_aggregation.py`; Southland + NRC daily-aggregate backfills complete.
- **Surface contract published** — `SURFACE_CONTRACT_V1.md`. WS3 is unblocked and can build against a stub. *(Superseded 2026-08-04 by `SURFACE_CONTRACT_V2.md` when the interpolation engine changed — §5 response shapes are unchanged, so any stub built against v1 still holds.)*
- **TPS model ported and parity-verified** — `backend/scripts/interpolation/tps.py`, exact reproduction of the on-prem model across all 15 golden dates (2.16e-9 °C). Regression suite in `parity_check.py`.
- **Accuracy methodology settled** — shuffled 10-fold + production clip; confidence banded by distance-to-nearest-station. See working doc §8.

### Done 2026-08-03 — WS1 ingest gap closed for NOAA / ECan / GW

**Active stations 427 → 607.** The pre-2025 network, which is what the 2020→now
surface backfill actually fits against, roughly doubled:

| Pre-2025 stations | Before | After |
|---|---:|---:|
| temperature | 62 | **115** |
| rainfall | 257 | **439** |
| RH | ~60 | **111** |
| pressure | — | 59 |
| solar radiation | — | 28 |

For scale, the 1986-2024 archive was built on a ~175-190 station network across
all variables. Rainfall now comfortably exceeds it; temperature is close.

- **NOAA crosswalk + backfill.** Only 7 of 54 SYNOP devices carried a
  `ghcnd_id`, which is why the GHCN-Daily backfill had only ever reached 6
  stations. New `scripts/crosswalk_ghcnd.py` matches the NCEI inventory on
  geography (**never** on the WMO column — it files Hokitika under 93781 and
  Kaitaia under 93119) and only onto *active* devices, because the retired
  ICAO-era duplicates sit metres from their live replacements. 13 mapped.
  - GHCN-**Daily** has only **15 NZ stations** — a hard ceiling, worth ~24.5k
    day-rows.
  - GHCN-**hourly** is the real prize: 46 crosswalked stations with verified
    full-year coverage back to 2020 (temp/RH/pressure/wind; precipitation
    empty). **14.5 M records** backfilled to 2020-01-01. This is what took the
    pre-2025 temperature network from 62 to 115.
- **ECan 4 → 102 stations, history to 2005** — deeper than any other council.
  ECan is not a Hilltop agency; its open portal's method 51 (`Sites=NORTH|SOUTH`)
  is the only site-enumerating endpoint. Rainfall only — **there is no
  temperature/climate collection**. New `probe_ecan.py` + `seed_ecan_from_probe.py`.
  - **Granularity switches with the window**: ≤`1_Month` is hourly, ≥`3_Months`
    is a midnight-stamped daily total. Both land in `rainfall`, so backfill now
    keeps only rows older than the station's earliest existing observation —
    otherwise the daily aggregation counts that rain twice.
  - `ecan.py` looked each station up in the 4-site `ECAN_SITES` config and
    skipped it if absent, so seeding alone would have left 98 stations inert.
    Now driven from `notes`, and switched to `bulk_upsert_observations`.
  - Dropped one epoch-zero sentinel (1899-12-30) that poisoned `MIN(timestamp)`;
    guard added.
  - 6 catalogue sites have no coordinates in the feed and are not seeded.
- **GW 4 → 86 stations, history to 2020.** 95 probed across the Climate and
  Rainfall collections; 86 live. 80 rainfall, 13 soil temp, 12 air temp, 10 RH,
  8 pressure/wind, 5 solar. 86/86 backfilled, zero failures.
  - GW publishes the same quantity under many names (sensor heights, a "(Lawa)"
    standardised series, "(Validated Data)" duplicates, and derived roll-ups).
    `seed_gw_from_probe.py` picks **exactly one series per variable per site**;
    listing two heights would race on the same `(station, timestamp, variable)`.
  - `gw.py` never exposed `--station`, which `backfill_driver.py` passes for
    every station — so GW backfills through the driver had been dying on an
    unrecognised-argument error before fetching anything. Fixed.

**Still open from this batch:** daily aggregation. `daily_aggregation.py` runs
one query per (station, day) — 115k RDS round-trips for SYNOP (~6 h), ~775k for
ECan (~13 h), with HBRC/MDC/GDC/TDC deep aggregation still to come on top. This
is the same round-trip footgun as the ingestion `executemany` issue, one layer
up, and it now gates the surface backfill. Make it set-based
(`GROUP BY station_id, date`) before running the rest.

### Done 2026-08-04 — the interpolator was benchmarked against NIWA, and rebuilt

Full reasoning and every measured number:
`docs/plans/INTERPOLATION_BENCHMARK_2026-08-04.md`.

- **Ridge + GCV engine built and made the default.** `cv_rmse` median **1.324 →
  1.106 °C, better on 15/15 dates**, effective dof at 47% of n (ANUSPLIN's
  guidance is below ~50%), ~3× faster. `engine="legacy"` still reproduces the
  on-prem model to 1.9e-9 °C and `parity_check.py` asserts it.
- **Contract minted at v2** — `SURFACE_CONTRACT_V2.md`. `smoothing` and `rmse`
  keep their names but change meaning, which forces a bump. **§5 response shapes
  did not move**, so stubs built against v1 still hold. The route deliberately
  stays `/api/v1/surfaces`; the contract version now lives in the S3 prefix and
  `meta.contract_version`.
- **Precip bake-off run (A3).** Ratio method rejected on measurement, `sqrt`
  shipped — see §1 A3.
- **Two negative results recorded so they are not re-derived**: naive trivariate
  is worse on all 15 dates; fixed GCV γ > 1 is worse on median, and only the
  *conditional* guard helps.

### Done 2026-08-05 — offshore stations, and a latent projection bug

- **Tested excluding the offshore island stations. The hypothesis was wrong** —
  excluding them is *worse*. Campbell and the Auckland Islands are worth **9.5%
  MAE in the southern band**; they are the only stations south of the mainland
  and turn the southern coast from an extrapolation edge into interior. Keep
  them. Expect the benefit to shrink as Otago/Southland are seeded, which is a
  good outcome that will look like a regression.
- **Found and fixed an antimeridian bug in `project_km`** — no longitude
  wrapping, so Raoul Island projected to −29,371 km instead of +756 km. Effect
  today is nil (such a station is *erased*, not corrupted, because the spline's
  polynomial term absorbs it), but **the Chathams would have been silently
  discarded the same way**. Fix verified bit-for-bit identical on all 531
  mainland stations; parity re-run and passing.
- **Added an explicit relevance rule** — `tps.screen_relevance`, 800 km from the
  target grid, recorded on `surface_run` and the raster rather than dropped
  silently. Contract v2 §4.2, added as an **additive** amendment (§8.1): no v3,
  and §5 untouched.

**All interpolator re-measurement is now deferred until the remaining councils
are seeded and backfilled** (Pete's call). Every accuracy figure above comes
from a 146–195 station historical fixture (temperature) or a 534-station network
missing Waikato, Bay of Plenty, Taranaki, Horizons and Otago entirely
(rainfall). Density is the dominant lever — the benchmark's own recommendation
14 expects it to beat every algorithmic change combined — so the numbers get
one clean re-measure rather than being chased as the network moves.

### Next
1. **Set-based `daily_aggregation.py`** — gates everything below.
2. **Deep daily aggregation** for HBRC/MDC/GDC/TDC (raw to 2020, aggregates only
   to 2025-09), plus ECan/GW/SYNOP once the rewrite lands.
3. **COG writer** — grid + values → Cloud-Optimized GeoTIFF per the contract.
4. **DB-backed input** — replace the CSV fixture path with station aggregates from Postgres; run one real month on the 1 km grid to get a true backfill compute figure.
5. ~~**Precip orographic bake-off** (assumption A3).~~ **Done 2026-08-04** — ratio rejected, `sqrt` shipped. The residual quality risk is heavy-rain under-prediction, not orography per se.
6. **Remaining council probes** — Horizons, Waikato, BoP, Taranaki, Auckland. Mechanical, low risk, no dependency on the above. *(West Coast appears seeded: the 2026-08-04 rainfall extract carries 50 West Coast stations. Verify before treating it as complete.)* **This is now also the gate on re-measuring the interpolator** — see the 2026-08-05 progress note.
7. Create the `auxein-climate-surfaces` bucket and upload `VCDN_500m.csv` to `grids/` (73 MB, deliberately not in git).
8. **One clean interpolator re-measure once 6 lands** — in order: `precip_bakeoff.py` (watch the `ratio` vs `ratio_true` gap close, which is the climatology-error tax and nothing else); then the whole benchmark doc on the live network rather than the historical fixture; then the distance-banded confidence table that `/point` is contracted to return.

### Decisions still owed
- Should smoothing *selection* shuffle its folds? Better selection vs bit-parity with the imported archive. **Narrowed:** under `ridge` there is no fold-based selection left — λ comes from GCV — so this now applies only to `legacy`, i.e. only to the 1986-2024 import.
- A1 hourly, A2 PET — proceeding on stated assumptions until contradicted. ~~A3 orographic precip~~ **settled by measurement 2026-08-04** (§1).
- **Timing check before the re-measure:** `screen_climatology` requires ≥365 days of record, so newly seeded stations improve daily surfaces immediately but enter the mean-annual-rainfall field only once backfilled that deep. Confirm backfill depth before assuming the ratio re-test is meaningful straight away.
