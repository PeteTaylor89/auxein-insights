# Auxein Platform — Three-Workstream Planning (WORKING DOC)

**Status: WORKING / EDITABLE · started 2026-08-02**

This is a scratch-and-answer document, not a plan. Pete edits freely — answer
inline under the `> **A:**` markers, strike or rewrite anything, add ideas
anywhere. Claude turns this into the proper phased plan(s) once the answers
firm up.

Three workstreams:
1. **Complete the data ingest pipeline** — every station we can lawfully access.
2. **Processing + interpolation models** → sampleable GeoTIFFs → regional and
   point insights.
3. **Complete rebuild of the Insights frontend.**

---

## 0. Re-baseline first — the existing Premier plan is materially stale

`INSIGHTS_PREMIER_UPGRADE_2026-07-21.md` is a good document and most of its
architecture still stands. But its §2 "Verified current state" was written
before the last two weeks of ingestion work, and several of its assumptions have
since changed in ways that **change the answers**, not just the wording:

| §2 / §8 claim (2026-07-21) | Reality 2026-08-02 | Why it changes the plan |
|---|---|---|
| "145 devices" | **456 stations, 427 active** | ~3× station density. Directly changes the defensible grid resolution and which regions are sparse. |
| "operational obs only ~1 season deep (2025-08-31 →)" | Deep history to **2020** across HBRC/MDC/GDC/TDC/NRC; Southland 365d (API cap) | The "history gates the paid promise" risk is largely retired. Changes Phase-0 blocking scope. |
| "timeseries partitioning drafted but **unapplied**" | **Applied** (yearly partitions live) | Phase-0 item done. `timeseries_observations_old` (1.72 GB) still pending Stage-6 drop. |
| "fix B4.1 before any backfill" | **Fixed and live** since `ab2b50c` | Phase-0 item done. |
| "PET/ET0 catalogued but NOT ingested — no source emits it" | **HBRC now emits PET** (~18 stations reporting `evapotranspiration`) | We have a real ET0 signal to validate a computed FAO-56 field against. Genuinely useful — measured PET is rare. |
| "postgis_raster available but not enabled" | Still not enabled — but see Q2.1, we may not want it at all | The GeoTIFF framing below may supersede the in-DB raster design entirely. |
| Station elevation | **Zero nulls platform-wide** (LINZ 8m DEM via Open Topo Data) | The TPS elevation covariate has clean inputs at every station already. |

**Implication:** don't treat the Premier doc as the baseline. Workstream 2's plan
should be re-derived from current state, reusing that doc's architecture where
it still holds (it mostly does).

---

## 1. Workstream 1 — Complete the ingest

### Where we actually are
Live hourly on the AWS Sydney box, 9 sources: `harvest ecan mdc gw hbrc tdc gdc
southland nrc`. 427 active stations. Deep history to 2020 for the Hilltop
councils. All elevations populated.

### What's left, by category

**A. Started but incomplete**
- **ECan** — only **4 rainfall sites** wired via `config/ecan_sites.py`. The full
  Canterbury catalog is unexplored. Canterbury is a major wine region; this is
  the biggest single gap.
- **ORC (Otago)** — deferred. Live data moved to **AQUARIUS** (`envdata.orc.govt.nz/AQWebPortal`),
  a third API shape we have no client for. Old Hilltop frozen at 2024-11.
  Central Otago wine sites are *already covered via Harvest*, so the incremental
  value is rainfall density.
- **NRC multi-depth soil** — deferred pending a data-model decision (we store a
  single `soil_temp` / `soil_moisture_vwc`; NRC has 8 soil-moisture depths and
  4 soil-temp depths).

**B. Never touched — councils with confirmed or likely endpoints**
- **Horizons (Manawatū-Whanganui)** — Hilltop confirmed at agency level, never
  probed for climate. Relevant to emerging regions.
- **Waikato, Bay of Plenty, Taranaki, Auckland, West Coast** — no probe run.
  NZ norm is Hilltop or AQUARIUS.
- **NIWA** — national AQUARIUS portal. Would need the same AQUARIUS client as ORC.

**C. National/other**
- **NOAA NCEI** (GHCNh / GHCN-Daily) — scoped in `NOAA_NCEI_INGESTION_SCOPE.md`,
  B0+B1+B3 built, **backfills never run**. Credential-free, gives deep
  climatology baseline.

### Questions

**Q1.1 — Scope: weather only, or the wider environmental estate?**
Today we ingest weather/climate only (temp, rainfall, rh, wind, solar, soil,
pressure, PET). The councils also expose **river flow/level, groundwater, and
water quality** — MDC alone has ~4,400 sites including vineyard and irrigation
bores. Is workstream 1 "finish the weather network", or "become the
environmental data platform"? These are very different sizes of job, and only
the first feeds workstream 2's climate surfaces.
> **A:**
finish the weather network, a later scope will include wider environmental data. But we need to finish something, quickly. 
Add to the prod and scope, west coast, and expand wellington RC.
We are not going to touch NIWA as they have completly unreasonable licence terms. 

**Q1.2 — National uniformity vs viticulture focus.**
This one couples hard to workstream 2. A national interpolated surface is only
as good as its station coverage *everywhere you let someone sample*. If we sell
point queries for any NZ location, we need reasonable coverage in Waikato, BoP,
Taranaki and the West Coast too — regions with no wine interest. Do we (a) go
truly national, (b) go national but accept published confidence bounds that are
poor outside wine regions, or (c) restrict the product to defined regions?
> **A:**
True national, this will be expensive on compute, but for expansion into all primary industry - this has to be from day 1. 

**Q1.3 — Backfill depth.**
Current floor is **2020-01-01** (your earlier practical call). Several sources
go far deeper: MDC rainfall to **1917**, GDC to **1946**, TDC to **1961**, HBRC
to 1973. Deep history matters for two specific things: climatology-scaled
precipitation interpolation, and any "vs long-term normal" claim. Do we go
deeper now, later, or rely on NOAA/NIWA climatology for the long baseline?
> **A:**
I have on my local server data back to 1986 for wine regions interpolated already at daily resolution, and station depth back to 1900 in some cases - there are 1000's of stations data stored locally, BUT these hard stop at 2024. Hench the new network and the overlap. The old stations are what created the climate histories. 

**Q1.4 — AQUARIUS client: build or skip?**
Unlocks ORC + NIWA (and likely others). It's a genuine new connector, not a
config change. Worth it, or is Harvest + council coverage enough for Otago?
> **A:**
Build - but not for NIWA, Auckland used Aquarius too i think. 

**Q1.5 — Licensing appetite.**
ES, NRC and ORC are cleared. For the untouched councils, are you willing to
chase written commercial permission where required, or should we build only
what's openly licensed (HBRC is explicitly CC-BY 4.0) and treat the rest as
blocked?
> **A:**
Treat all as open, and I'll in parellel chase all licences and terms. 

**Q1.6 — "Done" definition.**
What makes workstream 1 complete? A station count, national coverage density
(e.g. no NZ point >25 km from a station), every council with an endpoint, or
something else? This determines when we stop.
> **A:**
All councils with endpoints, good densite accross all variables allowing interpolation models to be built. I'd imagine we will hit about 1000 stations. 

---

## 2. Workstream 2 — Processing, interpolation, GeoTIFFs

### The one big architectural question
Your framing — *"creating geotiffs that can be sampled"* — is **different from
the Premier plan**, which specified PostGIS raster (`climate_surface` table,
`ST_Value` / `ST_Clip` in-database). GeoTIFF/COG-on-S3 and PostGIS-raster-in-DB
are genuinely different architectures with different costs, and this decision
cascades into everything else in this workstream. Worth settling first.

| | **COG on S3** | **PostGIS raster in DB** |
|---|---|---|
| Point sample | `rasterio` range-read, or a tiler | `ST_Value` — one SQL join |
| Zonal stats for a region | read + mask in Python | `ST_Clip` + `ST_SummaryStats`, in-DB |
| Map tiles | serve COG directly / pre-render | needs an export step |
| Storage cost | cheap (S3) | expensive (RDS) |
| Backup/restore | independent of DB | bloats DB dumps |
| Portability / external sharing | trivially shareable, standard format | locked in DB |
| Joins to station/zone tables | app-level | native SQL |

My instinct: **COG on S3 as the store of record, with a thin index table in
Postgres** (one row per surface: variable, valid_at, resolution, S3 key, model
version, validation stats). Best of both — cheap storage, standard format,
still one SQL query to find the right raster. But this depends on your answers
below.

**Q2.1 — COG-on-S3, PostGIS raster, or the hybrid index above?**
> **A:**
COG on S3

**Q2.2 — Temporal scope of surface generation.**
Forward-only from go-live, or backfill surfaces across the full 2020+ history?
Rough order of magnitude: NZ at 1 km ≈ 1,500 × 1,100 cells. Daily × 4 variables
× 6.5 years ≈ **38,000 rasters**. That is very manageable as COGs on S3
(~tens of GB), and painful in RDS. Also: do we need a value *and* an
uncertainty surface per variable (doubles it)?
> **A:**
backfill to the 2020 history- large amount of work here. Then forward only. Lets investigate hourly also for the disease services?

**Q2.3 — Resolution.**
Premier doc proposed 1 km daily / 5 km hourly, but that was at 145 stations;
we now have 427. Mean spacing is still ~15-25 km in most regions, so a 1 km grid
is already interpolating well below station density — that's normal and fine
(elevation covariate carries real signal), but it means resolution is a
*presentation* choice more than an information one. Options: uniform 1 km, or
500 m over flagship regions (Marlborough, Hawke's Bay, Central Otago) and 1 km
elsewhere.
> **A:**
Lets run off 500m in all flagships and 1-2km elsewhere. I can create a single CSV of all sample grid points with lat/long and elevation. 


**Q2.4 — Variables and cadence.**
Premier proposed daily temp/precip/PET/RH at 1 km + hourly temp/RH at 5 km. With
Southland/HBRC now giving solar, wind and soil, we *could* add solar radiation,
wind, soil temp/moisture. Which surfaces actually earn their keep in v1?
> **A:**
Temp/Precip/PET/RH at hourly, and pressure if density allows. Lets leave the other variables at station only and we can present these data as points on the map. 

**Q2.5 — Hourly aggregation layer is still missing.**
There is a `weather_data_daily` rollup but **no hourly one**, despite 30-min raw
feeding it. The disease models need hourly. Build the hourly rollup as part of
this workstream?
> **A:**
there is an hourls agg working at the moment, we will modify and build on it as part of this. essentially the hourly and daily aggregations will be at the station level gettign the data ready for the interpolation models, and/or ready for presentation on the maps. 

**Q2.6 — Precipitation method.**
Still open from the Premier doc: climatology-scaled TPS vs transform-TPS vs IDW
fallback. Genuinely needs a bake-off on held-out stations — I'd propose we just
run that experiment early and let data decide rather than pre-committing.
> **A:**
best scientific method is TPS with max mm bounding and orographic patterns. 

**Q2.7 — Validation holdout.**
LOOCV over all stations (keeps every station in the fit, weaker independence
claim) vs a permanently withheld holdout set (stronger claim, costs accuracy in
sparse regions). With 427 stations, a 5-10% holdout is now much more affordable
than it was at 145.
> **A:**
have a look at the TPS method I've used on on prem models for how we deal with holdout. This is located in /docs/models/

**Q2.8 — PET: computed, measured, or both?**
HBRC now gives us **measured** PET at ~18 stations. That's an unusually good
validation set for a computed FAO-56 field. Do we compute PET everywhere and use
HBRC to validate, or ingest measured where available and compute elsewhere
(risking a discontinuity)?
> **A:**
we should initally rely on measured amounts. unless there is enough density for regional interpolation/modelling. 

**Q2.9 — Where does this run?**
Daily surface generation is real compute (TPS fits per variable per day). The
ingestion box is a `t3.micro`. Options: bigger EC2, ECS Fargate task, AWS Batch,
or on the existing box overnight. Also: is this in the same repo?
> **A:**
Same repo, we will need to test varying sized instances on AWS. 

**Q2.10 — Downstream rewiring.**
Premier plan says surfaces become the single source of truth, and phenology +
disease get rewired to read them (making both point-callable). Confirm that's
still the intent, and that the existing `climate_zone_daily` / `zone_aggregation`
path gets retired rather than run in parallel indefinitely?
> **A:**
correct. 

---

## 3. Workstream 3 — Insights frontend rebuild

### What exists today
`packages/insights` — React 19 / Vite SPA, react-router v7, ~94 source files.
Mapbox GL v3 (`RegionalMap/`), Chart.js, Tiptap rich-text editor, `@turf/turf`,
`lucide-react`. Pages: LandingPage, MapExplorer, ArticlesPage + ArticleDetail,
ResearchPage + ResearchDetail, About, Feedback, StationDetail, WeatherStatus,
WidgetEmbed, plus an admin area (AdminDashboard, UserManagement, BannerManagement,
content editor). Auth is `PublicUser` JWT + one-way Grow→Insights SSO.

So it's not only a data site — there's a **CMS** (articles, research, banners),
an **admin console**, and an **embeddable widget** in there.

**Q3.1 — What does "complete rebuild" actually mean?**
(a) New app from scratch, new repo/package, migrate what's worth keeping;
(b) keep `packages/insights` and rebuild the UI layer in place;
(c) new public site, keep the existing admin/CMS as-is behind it.
The CMS and admin represent a lot of working code that has nothing to do with
the maps-first rethink — I'd want a strong reason to rewrite those.
> **A:**
more B/C - all the public facing will be rebuilt - and there will be a free and paid gating on aspects. We will also build from scratch using /mobile as a template a new insights app for IOS nad Android. 


**Q3.2 — Stack.**
Stay on React + Vite SPA, or move to Next.js? Note the v1.1 SEO decision was
explicitly *"FastAPI catch-all meta tag injection, not a Next.js migration"* —
a rebuild is the natural moment to revisit that, if SEO/content marketing
matters commercially. Also: keep Mapbox GL, or move to MapLibre (no vendor
token, self-hosted tiles)?
> **A:**
keep mapbo, and what is your recommendation on ract + Vite vs Next.js?

**Q3.3 — Charts.**
Chart.js today. Keep, or move to something better suited to time-series and
small multiples (Observable Plot, visx, ECharts)?
> **A:**
move to best in class. 

**Q3.4 — Design direction.**
Reuse Grow's theme tokens (`packages/web/src/styles/theme.css`) for a coherent
family look, or does Insights get its own distinct public-facing brand? Is there
a designer/reference, or is this "Claude proposes and you react"?
> **A:**
Grow's themes, but we will get to the page architecture down the line. 

**Q3.5 — Paid tier in scope for this rebuild?**
Premier plan has Stripe self-serve + entitlements + LocationDashboard +
AI agent panel. Is the rebuild the vehicle for shipping the paid tier, or do we
rebuild the free/public experience first and add commerce after?
> **A:**
Yes, but we will ship the free update while building the paid. 

**Q3.6 — Primary journey.**
What should a first-time visitor do in their first 30 seconds? The answer drives
the whole information architecture. Today it's a landing page into a map
explorer and articles.
> **A:**
Instantly see value, in a demo form if not signed in, strong CTA to buy subscription, perhaps a pop up or featured article. 

**Q3.7 — What must NOT break?**
The embeddable `WidgetEmbed`, the Grow→Insights SSO, existing article/research
URLs (SEO), the admin CMS. Anything else with external dependents?
> **A:**
you will do deeper research on this prior to any build. 
---

## 4. Cross-cutting

**Q4.1 — Sequencing and parallelism.**
There's a real dependency chain: 2 needs 1's coverage to be trustworthy, and 3
needs 2's outputs to have something to show. But they don't have to be strictly
serial — 1 is mostly mechanical (probe → seed → backfill, a pattern we've now
run six times), 2 is the hard novel engineering, 3 is largely independent until
it needs live surfaces. Do you want them staged, or overlapping?
> **A:**
overlapping where we can, muc of the model for 2 has been build and example code is in /docs/models/
and we will have to get hte S3 infrastructure and sampling set up for hte climate surfaces from interpolation so we can work in parellel. 

**Q4.2 — Timeline and commercial driver.**
Is there a date this is pointing at (vintage 2027? a funding/customer
milestone?), or is this "build it properly, no fixed deadline"? This changes how
much we cut.
> **A:**
Has to be ready before season starts at End August

**Q4.3 — Who builds it.**
Just you + Claude, as with the ingestion work? Affects how much I should
optimise for autonomous execution vs reviewable increments.
> **A:**
Just us two. 

**Q4.4 — Budget ceilings.**
Two real cost drivers: surface storage/compute (workstream 2) and Claude API
usage for the agent (workstream 3). Any ceiling I should design against?
> **A:**
keep with in claude token budget, currently AWS is running at $400 per month, I'd imaging witht he new services provisioned this will go to $600ish
---

## 5. Claude's initial read (opinions, argue with these)

1. **Workstream 1 is the least risky and should not be allowed to expand.** The
   probe → seed → elevation-fill → backfill pattern is proven and repeatable.
   The danger is Q1.1 — if "all remaining stations" quietly grows to include
   hydrology and groundwater, this becomes the biggest of the three workstreams
   and delays the other two. I'd scope it tightly to weather.
2. **Workstream 2 is the actual product.** It's the only part that's genuinely
   novel, hard, and defensible. Interpolated surfaces with published, honest
   validation statistics are a real moat; nobody else in NZ viticulture is
   publishing an RMSE next to their numbers.
3. **The GeoTIFF-vs-PostGIS-raster decision (Q2.1) should be made before
   anything else in workstream 2**, because the storage model determines the
   sampling API, the tile pipeline, the cost model, and the schema.
4. **I'd resist rebuilding the CMS/admin.** The maps-first rethink is about the
   public data experience. Rewriting a working Tiptap editor and user-admin
   console spends effort with no customer-visible return.
5. **Do the precipitation bake-off (Q2.6) early and cheaply** — it's the single
   biggest quality risk in the surface pipeline, and one afternoon of
   experimentation on held-out stations answers it better than any amount of
   up-front argument.
6. **A validation/confidence story should be a first-class feature, not a
   Phase-N admin dashboard.** It differentiates the paid product and it's nearly
   free once the surface pipeline computes the statistics anyway.

---

## 6. Parking lot (ideas, no commitment)

- Pete's ideas go here.

---

## 7. ROUND 2 — Claude's read of the answers + the on-prem models (2026-08-02)

### 7.1 Correction: the models are at `backend/models/`, not `docs/models/`
Read in full: `Spline_Temp_V1.7.py` (413 lines), `Spline_Precip_V1.py`,
`Spline_Radiation_V1.py`, `Spline_V1.6.py`, `Spline_Input_Generator.py`,
`Radiation_Correction.py`, plus `example data/` (`VCDN_500m.csv`,
`CLIFLO_RAW_Temp_Daily.csv`, daily input samples 1986-2000).

**This is a much stronger starting position than "greenfield".** The method is
already worked out and validated; what's missing is productionisation, not
science.

### 7.2 The method, as actually implemented (for the record)
1. Per-date CSV of station values → merged with CLIFLO station lat/lon/height.
2. **Elevation handled by lapse-rate detrend/retrend, NOT as a TPS covariate.**
   `Adj_T = T + Height/100 × 0.6`, i.e. reduce every station to sea level at
   0.6 °C/100 m; fit TPS in 2D (lon, lat) only; then on the grid re-apply
   `Adjusted = Interpolated − Elevation/100 × 0.6`. This is simpler and more
   numerically robust than the `TPS(lon,lat) + β·elevation` the Premier doc
   proposed. **Adopt Pete's version.**
3. `scipy.interpolate.Rbf(function='thin_plate', smooth=s)`.
4. Smoothing `s` chosen per date by **5-fold CV** over `np.logspace(-4, 0, 7)`,
   minimising MSE.
5. **Bounding**: `np.clip(interpolated, observed_min, observed_max)` — this is
   the "max mm bounding".
6. **Holdout = spatial declustering, not a random split.** Haversine distance
   matrix → adjacency at 0.5 km → `networkx` connected components → keep one
   station per cluster for the fit, the near-duplicates become an independent
   test set. Elegant: an independent test set for free, with zero loss of
   spatial coverage. Then an **adaptive escalation loop** — if fit RMSE > 0.4,
   re-decluster at 2, 4, 6, 8, 10 km until it passes.
7. Metrics per date: `Mean_MSE`, `RMSE`, `SNR`, `M_Stations`, `T_Stations`,
   `T_RMSE` (independent).
8. Grid = `VCDN_500m.csv`, **1,438,684 land cells at 500 m nationally**.
   Output = CSV per date.

**This answers Q2.7 fully — no separate holdout decision needed.** It also
solves a problem already logged against MDC: the `X at Y` vs `X River at Y`
near-colocated station pairs that would ill-condition a TPS fit are exactly what
the declustering step removes.

### 7.3 Compute + storage, with real numbers
The 500 m national grid is **1.44 M cells** — far more tractable than the naive
bbox estimate. Per surface: ~1.44 M evaluations × ~1,000 stations, plus a 35-fit
CV loop. Call it 30-60 s single-core.

| Product | Surfaces | Compute (16 cores) | COG storage |
|---|---|---|---|
| Daily, 4 vars, 2020→now (2,373 d) | ~9,500 | ~8-16 h one-off | ~14 GB |
| Hourly, 4 vars, 1 yr | ~32,000 | ~1-2 days one-off | ~48 GB |
| Ongoing daily | 4/day | minutes | negligible |
| Ongoing hourly | 96/day | ~1 h/day | ~4 GB/mo |

**Storage is a non-issue** — S3 at ~$0.023/GB puts the whole archive at a few
dollars a month, nowhere near the $600 ceiling. **Compute is a one-off spike**:
rent a big instance for a day or two for the backfill, then run small. This fits
the budget comfortably.

### 7.4 FOUR CONTRADICTIONS to resolve before planning

**C1 — Hourly surfaces cannot be backfilled to 2020. The data doesn't exist.**
Q2.2 says backfill to 2020; Q2.4 says hourly. But the 2020-2025 council
backfills were all run at **daily** interval — 30-min raw only starts
~2025-08-31 (and it was your own earlier call that historical data at daily
resolution is accepted). So: daily surfaces 2020→now ✓, hourly surfaces only
from ~Aug 2025 ✓. Not a blocker, just a scope correction.
> **A:**

**C2 — PET can't be both "measured only" and a national surface.**
Q2.4 wants a PET surface; Q2.8 says rely on measured. Only **~18 HBRC stations**
measure PET — nowhere near enough for a national field. The resolution is
almost certainly: compute PET per station (FAO-56 where solar+wind exist,
Hargreaves temp-only elsewhere), interpolate the computed field, and use the 18
measured stations as an independent accuracy check. That gives national coverage
*and* a credibility story no competitor has.
> **A:**

**C3 — Orographic precipitation is not implemented.**
Q2.6 says "TPS with max mm bounding and orographic patterns". The bounding is
there (`np.clip`), but `Spline_Precip_V1.py` has **no elevation handling at
all** — no lapse detrend, no covariate, no transform. Precip is currently a raw
2D TPS. So orographic precip is genuinely new work, and it's the hardest part of
the surface pipeline. Options: precip-elevation regression per region, or
interpolate the ratio-to-climatology and multiply back by a climatological
precip surface (needs the deep history).
> **A:**

**C4 — The end-of-August timeline does not fit the scope.**
~4 weeks, two of us, for: national ingest to ~1,000 stations including a new
AQUARIUS connector; a productionised interpolation pipeline with a 2020 backfill;
a public frontend rebuild; a paid tier with Stripe; an AI agent; *and* a new
iOS/Android app. That is several months of work. See §7.6 for what I think
actually fits.
> **A:**

### 7.5 Smaller technical notes
- **`scipy.interpolate.Rbf` is legacy/deprecated.** `RBFInterpolator` (with
  `neighbors=k` for local fitting) is the modern replacement and is dramatically
  faster and better-conditioned at our station counts. Worth switching during
  productionisation — but validate that outputs match the old model first.
- Two small bugs in `Spline_Temp_V1.7.py` if it's lifted as-is: the retry loop
  computes SNR from the stale `rmse` rather than `new_rmse` (line ~333), and
  `new_rmse` is referenced at line 384 but only bound inside the loop, so a
  `NameError` is possible when `connected_components` is empty.
- The historical CLIFLO network was **~175-190 stations** nationally for daily
  temp (counted from the 1986-2000 sample files). Our live network is already
  **427 active and heading to ~1,000** — so the new surfaces should be
  materially better than the 1986-2024 on-prem series. Good marketing story.
- The on-prem 1986-2024 interpolated daily archive is a major asset. Decide
  whether to **import those surfaces** (instant deep history) or only use the
  station data behind them. Splicing two eras needs care: a step-change at the
  join would be visible in any trend chart.

### 7.6 What I think actually fits by end of August
Ranked by customer-visible value per unit of risk:

1. **Finish the ingest (workstream 1).** Proven, mechanical, parallelisable.
   AQUARIUS is the only unknown. — *achievable*
2. **Daily national surfaces, backfilled to 2020, as COGs + point sampling.**
   The method already exists; this is porting CSV→DB→COG plus a compute run.
   — *achievable if started now and not gold-plated*
3. **Free/public maps-first frontend on top of those surfaces.**
   — *achievable in reduced form*
4. Hourly surfaces, paid tier + Stripe, AI agent, mobile app. — *not by August*

Proposed cut: **ship 1-3 as the free product before the season**, with the paid
tier as the immediately-following phase. That gets real surfaces in front of
users at season start, which is the actual commercial goal, and it de-risks the
paid tier by letting the surface quality be proven publicly first.
> **A:**

### 7.7 Answer to Q3.2 — React+Vite vs Next.js: **stay on Vite**
1. A Next.js move is a rewrite of routing, data fetching and auth across the
   whole app, admin included — unaffordable against a 4-week deadline.
2. The core product is an authenticated, interactive, map-heavy dashboard. SSR
   buys little; the map does not server-render.
3. SEO pressure is really about articles/research, already handled by the
   FastAPI meta-injection — **and you already have a Next.js marketing site at
   `packages/auxein-marketing/`.** Put SEO-critical content there and let the
   app stay a Vite SPA. That gets both without a migration.
4. Vite builds to static S3+CloudFront. Next.js SSR needs a Node runtime
   (Amplify/Vercel/ECS) — more cost and ops against the $600 ceiling.

---

## 8. ROUND 3 — built + measured, evening of 2026-08-02

### 8.1 Delivered
- **`docs/plans/SURFACE_CONTRACT_V1.md` published** — the frozen WS2/WS3 interface.
- **`backend/scripts/interpolation/tps.py`** — the on-prem model ported to a
  library. **Reproduces the original exactly on all 15 golden dates: worst
  max|diff| 2.16e-9 °C, corr 1.0.**
- **`parity_check.py`** — the golden-file regression suite. Re-run
  `--all` after ANY change to `tps.py`.
- **`cv_experiment.py`** — the fold-structure investigation below.

### 8.2 Q2.7 revisited — the declustering holdout is thinner than I claimed
I said declustering "answers Q2.7 fully". It does not. Across the 15 dates it
yields `n_test` of **0-13** stations (**zero** for 1986). It is a
**fit-stabilisation device** that produces a test set only where redundant
near-colocated stations happen to exist. Real independent accuracy has to come
from cross-validation.

### 8.3 Pete's fold hypothesis — CONFIRMED, and it cost 28%
Measured fold compactness (mean intra-fold distance ÷ network mean):
**0.49 unshuffled vs 1.00 shuffled**. The station table is geographically
ordered, so unshuffled folds excise contiguous *regions* and score the spline on
extrapolating across a hole it never meets in production.

| Fold scheme | Median RMSE | Worst |
|---|---|---|
| unshuffled 5-fold (original) | 1.903 | 3.003 |
| shuffled 5-fold | 1.379 | 1.777 |
| **shuffled 10-fold (adopted)** | **1.338** | 1.653 |
| shuffled 20-fold | 1.336 | 1.689 |
| LOOCV | 1.314 | 1.734 |

**Shuffling is what matters; the removal fraction barely does.** Going 20% → 5%
buys ~3%; LOOCV beats 10-fold by ~2% for n× the cost.

Implementation: **scoring is decoupled from smoothing selection.** Smoothing
still uses the original's unshuffled folds so surfaces stay bit-identical;
only the reported statistic changed. Parity re-verified after the change.

### 8.4 Clipping is load-bearing
My first experiment omitted production's `np.clip` and one date produced a
**176 °C** excursion from a near-singular system, wrecking the averages. Any CV
or diagnostic must replicate the production clip or it measures something we
never serve.

### 8.5 Confidence must be distance-banded
Pooled LOOCV error vs distance-to-nearest-station: 0-5 km **1.10**, 10-20 km
1.20, 20-40 km 1.41, 40-80 km 1.76, >80 km **2.04 with a -0.63 cold bias**
(remote stations skew high-country). One global RMSE misrepresents both ends, so
`/point` returns `distance_to_nearest_station_km` + banded `expected_error`.

### 8.6 Where the old summary numbers came from
The `RMSE` column in `*_Cross_Validation_Summary_*.csv` is the **in-sample fit
residual** — at smoothing ~1e-4 the spline nearly interpolates its own training
points, so it reads ~0.01 °C regardless of surface quality. The **`Mean_MSE`
column is the honest CV number, stored squared**: `sqrt(Mean_MSE)` matches the
measured unshuffled CV on all 15 dates to within **0.0015 °C**.

Medians — `RMSE` col **0.018**, `sqrt(Mean_MSE)` **1.977**, corrected shuffled
10-fold **1.338**. Nothing was wrong in the on-prem pipeline; the honest figure
was always there, squared, in a column that reads like a diagnostic. **Rename to
`cv_mse` / `fit_residual` when productionising.**

### 8.7 Correction — the escalation ladder does fire
I earlier said the `rmse > 0.4` gate "effectively never fires". Wrong: it fired
on **1987 and 1991** (their `SNR` is inconsistent with `mean(y)/RMSE` because the
stale-`rmse` bug leaks the pre-escalation value — 1987: 19.35 = 14.518/0.7512).
Both also have the largest `T_Stations`, exactly as escalation predicts.

I also retract the suggestion to re-gate it on `cv_rmse`. A large in-sample
residual at near-zero smoothing is precisely the right detector for **colocated
stations that disagree**, which is the gate's actual job. Keep it; fix only the
SNR that reports it.

### 8.8 Open, carried to next session
- **Should smoothing *selection* also shuffle?** Likely picks better smoothing,
  but changes surfaces and breaks bit-parity with the imported 1986-2024
  archive. Deliberate call needed.
- C1 (hourly not backfillable), C2 (PET computed vs measured), C3 (orographic
  precip) still unanswered inline above — currently proceeding on the stated
  assumptions in the plan.

---

**Charts (Q3.3):** recommend **ECharts** — best-in-class for dense time series,
canvas-rendered so it stays smooth with long records, strong built-in zoom/brush
and small-multiple support. `visx` if we want total control at higher build
cost; Observable Plot is elegant but weaker on interaction.
