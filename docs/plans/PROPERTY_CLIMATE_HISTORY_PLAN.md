# Property Climate History — Build Plan

**Created:** 2026-05-30
**Status:** Scoped, awaiting build
**Related:** Grow Insights → Climate History (zone-grouped) — see `packages/web/src/components/climate/RegionalClimateHistory.jsx`

## Goal

A per-property, user-triggered ("Calculate my climate history") aggregation that rolls up
**all of a property's blocks' daily climate data** into a **property-specific** monthly climate
history, rendered with the same `SeasonExplorer` UI as the regional (zone-level) view — plus a
few extra viticulture metrics the block data supports.

## Source data (already in DB)

- **`climate_historical_data`** — daily per block: `temperature_mean/min/max`, `rainfall_amount`,
  `solar_radiation`; keyed by `vineyard_block_id` + `date`. ~8,800 blocks × daily × 1986–2023
  (~120M rows). Indexed on `vineyard_block_id` and `date`.
- **`VineyardBlock.property_id`** — the rollup key. `VineyardBlock.centroid_latitude` — needed for Huglin.
- **`ClimateCalculations`** (`backend/services/climate_calculations.py`) — canonical conventions to reuse:
  - GDD (base 10): `max(0, (Tmax+Tmin)/2 − 10)`
  - Huglin daily: `((Tmean−10)+(Tmax−10))/2 × K`, only when `Tmean > 10`; K from latitude band
    (`< −40 → 1.05`, `< −35 → 1.04`, `< −30 → 1.03`, else `1.02`)
  - Frost day: `Tmin ≤ 0`. Hot day: `Tmax ≥ 30`.
  - Vintage (Southern Hemisphere): Sep `Y` → Apr `Y+1` = vintage `Y+1`. So `vintage_year = year+1 if month ≥ 9 else year`.

## Decisions (confirmed 2026-05-30)

- **Compute mode:** synchronous request + frontend spinner (typical property < 1s). Guard for oversized properties.
- **SD semantics:** spatial SD **across the property's blocks** per month (matches the zone model's
  "spatial mean + spatial SD"). Single-block property → SD = 0. For the daily baseline, SD is across the
  combined **(season × block)** population at each day-of-vintage (captures interannual + spatial spread).
- **Metrics:** regional set (GDD, rain, tmean, tmax, tmin, solar) **plus extras** (Huglin index,
  frost days, hot days).
- **Daily baseline + season tracker (added 2026-05-30):** also build a **property daily baseline series**
  (1986–2005 inclusive) so we can render a **property-scoped season tracker** — current-season accumulation
  vs the property's own baseline curve, advancing daily. Mirror the existing zone pattern
  (`climate_zone_daily_baseline`) for structure and convention.

## Aggregation math

Per property, one Postgres `GROUP BY (vineyard_block_id, year, month)` over only that property's
blocks (filter `vineyard_block_id = ANY(:block_ids)`), computing **per block-month**:

| Metric | Daily reduction → block-month |
|---|---|
| tmean / tmin / tmax | `AVG(daily)` |
| gdd | `SUM(GREATEST(0,(tmax+tmin)/2 − 10))` |
| huglin_raw | `SUM(CASE WHEN tmean>10 THEN ((tmean−10)+(tmax−10))/2 ELSE 0 END)` (× K(block) in Python) |
| rain | `SUM(rainfall_amount)` |
| solar | `SUM(solar_radiation)` |
| frost_days | `SUM(CASE WHEN tmin ≤ 0 THEN 1 ELSE 0 END)` |
| hot_days | `SUM(CASE WHEN tmax ≥ 30 THEN 1 ELSE 0 END)` |
| days | `COUNT(*)` (drop block-months below the min-days threshold) |

Then **fold blocks → property** per (year, month): `*_mean = mean across blocks`,
`*_sd = SD across blocks` (population SD; single block → 0). Huglin block value = `K(block) × huglin_raw`
applied before the fold. Derive `vintage_year`; persist.

**Baseline (1986–2005):** average each property monthly value across those vintages → 12 monthly rows
+ a season baseline (gdd_total, rain_total, tmean_avg, huglin_total, frost/hot totals).

**Thresholds / exclusions:** require ≥ `MIN_DAYS_PER_MONTH` (default 20) for a block-month to count;
exclude truncated vintages (no full Sep–Apr span; e.g. 2023/24).

### Daily baseline series (1986–2005)

Computed in the same Calculate pass from the property's blocks' daily rows over the baseline window
(1986-07-01 → 2006-06-30). Mirrors the zone `climate_zone_daily_baseline` so the tracker math is reusable:

- **Day-of-vintage convention = July 1 (day 1) → June 30 (day 366)**, matching the zone daily baseline.
  Cumulative metrics accumulate from July 1; the season tracker adjusts to a Sep-1 start at read time
  (reuse `realtime_climate.get_baseline_gdd_for_day` / `adjust_gdd_to_sep1` logic).
- Per `(season, block)`, compute the daily value and the **running cumulative** (SQL window:
  `SUM(metric) OVER (PARTITION BY block, vintage ORDER BY date)`), then **fold across (season × block)**
  per `day_of_vintage` → `*_avg` (mean) + `*_sd` (SD across the season×block population).
- Metrics: tmean/tmin/tmax daily (avg/sd); GDD base-0 **and** base-10 (daily + cumulative); rain
  (daily + cumulative); solar (daily); plus extras — Huglin (cumulative), frost-day & hot-day cumulative counts.
- ~366 rows per property. Heaviest query in the calc (cumulative window over ~20 seasons × blocks);
  bounded and one-off, but the main reason to keep the oversized-property guard.

**Performance:** a property with ~20 blocks ≈ 20 × ~13,900 days ≈ 280k daily rows aggregated in
Postgres in one pass → a few hundred ms. Optional tuning: composite index on
`climate_historical_data(vineyard_block_id, date)`.

## Storage (new)

**`property_climate_history_monthly`** — mirrors `climate_history_monthly`, keyed by property:
`id, property_id, date, month, year, vintage_year, block_count,
{tmean,tmin,tmax,gdd,huglin,rain,solar,frost_days,hot_days}_{mean,sd}, created_at`.
`UniqueConstraint(property_id, date)`; indexes `(property_id, vintage_year)`, `(property_id, month)`.

**`property_climate_baseline_monthly`** — mirrors `climate_baseline_monthly` + extras:
`id, property_id, month, tmean, tmax, tmin, rain, gdd, huglin, frost_days, hot_days, created_at`.
`UniqueConstraint(property_id, month)`.

**`property_climate_baseline_daily`** — mirrors `climate_zone_daily_baseline`, keyed by property:
`id, property_id, day_of_vintage (1–366), month, day,
tmean_avg/sd, tmin_avg/sd, tmax_avg/sd,
gdd_base0_avg/sd, gdd_base0_cumulative_avg/sd, gdd_base10_avg/sd, gdd_base10_cumulative_avg/sd,
huglin_avg/sd, huglin_cumulative_avg/sd,
rain_avg/sd, rain_cumulative_avg/sd, solar_avg/sd,
frost_cumulative_avg, hot_cumulative_avg, created_at`.
`UniqueConstraint(property_id, day_of_vintage)`; `CheckConstraint(day_of_vintage BETWEEN 1 AND 366)`.

**`properties`** new columns: `climate_history_calculated_at` (timestamptz, null),
`climate_history_block_count` (int, null), `climate_history_season_count` (int, null).

**Migration:** one Alembic revision — slug `add_property_climate_history` (28 chars, within the
VARCHAR(32) limit). Adds 3 tables + 3 property columns. Base `down_revision` on the **current prod head**
(`set_assignment_task_cascade`), verified at build time.

## API (authenticated, property-scoped)

Mounted under the existing properties router. All reuse the existing climate response sub-models
(`SeasonSummary`, `MonthlyHistory`, baseline) so the frontend types stay shared.

- `POST /properties/{id}/climate-history/calculate` → runs aggregation, upserts, stamps property.
  Returns `{calculated_at, block_count, season_count}`. Idempotent (recalculate overwrites).
- `GET  /properties/{id}/climate-history/seasons`
- `GET  /properties/{id}/climate-history/history?vintage_year=&months=`
- `GET  /properties/{id}/climate-history/baseline`
- `GET  /properties/{id}/climate-history/season-tracker` → the property season tracker: baseline daily
  series (Sep-1-adjusted cumulative + SD band) **plus** the current in-progress season's accumulation
  aligned by day-of-vintage, for GDD / Huglin / rainfall. Mirrors regional `/gdd-progress/{zone}`.
- Status surfaced via the property GET (`climate_history_calculated_at`) — no separate endpoint.

Auth: `get_current_user` + property visibility (`get_visible_property_ids`).

## Frontend

- **Parameterise `SeasonExplorer`** (already ported to `packages/web/src/components/climate/`): accept an
  optional fetcher set `{ getSeasons, getHistory, getBaseline }` + a `metricsExtra` flag. Defaults to the
  zone `publicClimateService` → existing regional behaviour unchanged. Property variant injects the
  property fetchers and enables extras (Huglin chart metric; frost/hot-day stats on season cards).
- **New shared `propertyClimateService`** (in `packages/shared` so mobile can reuse later) hitting the
  authenticated property endpoints via the axios `api` client.
- **Property card states** (the nested card in `RegionalClimateHistory`):
  - *not calculated* → "Calculate my climate history" button + one-line explainer.
  - *calculating* → spinner.
  - *calculated* → expandable property-level `SeasonExplorer` + "Recalculate" + "Last run {date}".
- **Season tracker view** (property-scoped): a "Current Season" panel mirroring the regional
  `CurrentSeasonExplorer` — current accumulation line over the baseline daily band (GDD / Huglin / rain),
  with vs-baseline deltas. Reads `…/season-tracker`. Pending the live-data-source decision below.

## ⚠ Critical open question — current-season live data source

The **baseline daily series is computable now** (historical 1986–2005 block data). The **live current-season
line is not** — `climate_historical_data` is a CSV-imported historical set (1986–2023) with **no ongoing
per-block daily ingestion**. The regional live tracker is fed by **weather stations** (zone-scoped), not blocks.
So the season tracker's "today" line needs a source. Options:

- **(a) Zone realtime as proxy (recommended v1):** current-season daily = the property's climate zone's
  realtime series (weather-station-fed, already built), tracked against the property's *own* block-derived
  baseline. Ships immediately; the baseline is property-specific even if the live line is zonal.
- **(b) Property-local weather station(s):** when the company runs stations on the property (the "Local"
  source in the phenology component), use those. Best fidelity where available; needs station→property wiring.
- **(c) Ongoing per-block modelled daily:** reproduce the historical modelling pipeline live per block.
  Highest fidelity, largest infra — the eventual ideal, out of scope for v1.

**Decision needed before Phase E.** Recommend (a) for v1, (b) where stations exist, (c) later.

## Phase breakdown

- **Phase A — Backend data + calc:** 3 models, migration, `PropertyClimateAggregator` service — monthly
  history + monthly baseline **+ daily baseline** (cumulative window + fold), sanity-check vs one real property.
- **Phase B — Backend API:** `calculate` + `seasons`/`history`/`baseline` endpoints + schemas + property scoping.
- **Phase C — Frontend (history):** parameterise `SeasonExplorer`, `propertyClimateService`, property-card states.
- **Phase D — Extras + polish:** Huglin metric + frost/hot stats UI, recalculate, last-run, empty/error states.
- **Phase E — Season tracker:** `…/season-tracker` endpoint (after the live-data-source decision) + the
  property "Current Season" view. Depends on the ⚠ open question above.

## Open items / verify

- **Current-season live data source** — the ⚠ decision above. Blocks Phase E only; Phases A–D are unaffected.
- Confirm `climate_historical_data` is actually populated in **prod** for the target properties (the
  source-of-truth claim) before wiring the button live.
- Vintage convention split is intentional: **monthly** layer = Sep-1 seasons (matches `ClimateCalculations`
  + zone monthly); **daily** layer = July-1 day-of-vintage (matches `climate_zone_daily_baseline` + realtime
  tracker). The tracker adjusts daily-cumulative to a Sep-1 start at read time.
- Decide `MIN_DAYS_PER_MONTH` (default 20) and whether to surface per-month / per-day data completeness.
- Retire the legacy block-based climate view (`ClimateContainer` + `climateService`) once this lands —
  it's already unrendered.
