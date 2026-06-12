# Season Awareness + Climate Metrics — Public Insights Climate Explorers

_Scoped 2026-06-12. Target: the 5 climate explorers on insights.auxein.co.nz (public SPA, `packages/insights/`)._

> **Deploy (2026-06-12):** Phases 1–4 + monthly frost + compare modes built and committed; DB migrated + data loaded; backend ships via EB. **Insights frontend not rebuilt today** — FE work is committed, not yet served. Phase 5 fold-in not run (gated ~2027). Details in `CLIMATE_EXTREMES_HISTORY_PROJECTIONS.md`.

## Goal

1. **Season awareness** across the in-season explorers. Growing season = **1 Sept – 30 April** (SH vintage). Winter = **1 May – 31 Aug**.
   - **Phenology** → winter holding page when out of season.
   - **Disease Pressure** → winter holding page when out of season.
   - **Current Season** → in winter, show temperature + rainfall progressions but **no GDD** (we are outside the GDD accumulation window).
2. **New climate metrics** on Current Season now, and on Climate History + Projections once new source data lands:
   - **GDD base-10** (default) with a **base-0** toggle.
   - **Frost**: date of last (spring) frost + early-season frost count (1 Sept – 30 Nov), threshold **Tmin ≤ 0 °C**.
   - **Hot days**: count of days **Tmax > 30 °C**.
   - **1-day extreme rainfall**: **both** the max single-day rainfall (mm) **and** a heavy-rain-day count, threshold **≥ 25 mm/day** (NIWA "heavy rain day"; adjustable).

## Discovery findings (2026-06-12)

**Frontend.** All 5 tabs live in one component: `packages/insights/src/components/climate/PublicClimateContainer.jsx` (`VIEW_ORDER = ['currentseason','phenology','disease','seasons','projections']`). Mounted from `LandingPage.jsx` insight cards (one mount, internal tabs) — so gating in the container covers every entry point. Current Season / Phenology / Disease call `realtimeClimateService.js` → `/public/realtime/*`. History / Projections call `publicClimateService.js` → `/public/public_climate/*`.

**GDD base-10 — no migration needed.**
- Live `climate_zone_daily` stores tmin/tmax/tmean + GDD **base-0 only** (`gdd_daily`, `gdd_cumulative`).
- Daily baseline `climate_zone_daily_baseline` **already has base-10 daily** (`gdd_base10_avg/_sd`) but only a base-0 cumulative.
- → Live base-10 = `max(0, temp_mean − 10)` in the endpoint; baseline base-10 cumulative = running sum of `gdd_base10_avg`. Realtime endpoints (`backend/api/v1/realtime_climate.py`) currently hardcode base-0 — that's the work.

**Frost / hot / extreme-rain — derivable for the live (Current Season) view, not stored.**
- Pattern exists: `backend/api/v1/seasonal_stats.py` already computes `frost_days` (`temp_min <= 0`) and `hot_days` (`temp_max > 30`) on the fly from `climate_zone_daily`.
- Current Season can derive last-frost date, Sept–Nov frost count, hot days, max 1-day rain, heavy-rain-day count straight from `climate_zone_daily`. No new tables.

**History / Projections are data-blocked (the key constraint):**
- `climate_zone_daily` is **2024+ only** (IDW from stations) — no historical daily per zone.
- `climate_history_monthly` (what the History tab reads) is **monthly means** — cannot yield daily-threshold counts.
- `climate_zone_daily_baseline` is a **1986–2005 average** — one representative year, not per-season.
- `climate_historical_data` is daily 1986–2023 but **per vineyard block** (customer Grow data), reached only via `block → property → climate_zone_id`, and is a regional series copied onto blocks. Wrong/fragile source for public zones.
- → Per-season per-zone frost/hot/extreme for **History** (and frost/hot for **Projections**) require a **new per-zone historical source**. **Pete is extending the climate-model CSV outputs to emit these per season; DB models will be modified to fit once the new input structure is presented.** Phases 3 & 4 are **on hold** until then.

**Footgun.** Vintage conventions differ: daily tables use **July-1** day-of-vintage; monthly history uses **Sept-1**. Convert at any cross-layer boundary.

## Phases

### Phase 1 — Season awareness (frontend only) — BUILD NOW
- `packages/insights/src/utils/season.js`: `isGrowingSeason(date)` (month ≥ 9 || ≤ 4), `nextSeasonStartLabel(date)`, helpers.
- `packages/insights/src/components/climate/WinterHoldingPage.jsx` (+ styles): branded off-season panel, prop-driven per feature, shows reopen date and a pointer to Climate History / Current Season weather.
- `PublicClimateContainer.jsx`: when `activeView` ∈ {phenology, disease} and `!isGrowingSeason()` → render `WinterHoldingPage` instead of the explorer. Pass `inSeason` to `CurrentSeasonExplorer`.
- `CurrentSeasonExplorer.jsx`: accept `inSeason`; in winter hide the GDD summary card, GDD chart tab, and GDD-vs-baseline; default chart to Temperature; keep temp + rainfall.

### Phase 2 — Current Season metrics + chart upgrades — BUILT 2026-06-12 (untested)
Backend `backend/api/v1/realtime_climate.py` + `schemas/realtime_climate.py`:
- `base` param (`base10` default / `base0`) on `/current-season` + `/gdd-progress`. GDD derived from daily `temp_mean` for the live actual; baseline cumulative from `gdd_base10_avg`/`gdd_base0_avg` daily sums (Sept-1 start). No migration. `gdd_base` echoed in both responses. Phenology milestones kept on a base-0 cumulative regardless of display base.
- `SeasonExtremes` on the season summary: last-frost date, frost_days_total, early_frost_count (Sept–Nov), hot_days_count (>30), max_1day_rainfall (+date), heavy_rain_days_count (≥25 mm). Derived from `climate_zone_daily`.
- New `GET /public/realtime/hourly/{slug}?days=10` → reads `climate_zone_hourly` (the disease-model source; per-zone hourly temp/humidity/wetness, anchored on latest available hour). `HourlyClimatePoint`/`HourlyClimateResponse` schemas.

Frontend (`packages/insights/`):
- `services/realtimeClimateService.js`: `base` param threaded; new `getHourlyClimate`.
- `CurrentSeasonExplorer.jsx`: GDD Base-10/Base-0 segmented toggle (re-fetches); frost/hot/extreme cards; **temperature chart restyled** (muted min–max band + emphasised mean line, thin gridlines — replaces the bright/heavy look) with a dashed 0°C reference + frost-night diamond markers; new **Hourly (10d)** chart tab.
- `HourlyTemperatureChart.jsx` (new): hourly temp with 3/7/10-day window + wheel/drag/pinch zoom + pan + reset, via `chartjs-plugin-zoom`.
- **Dependency:** added `chartjs-plugin-zoom` + `hammerjs` to `packages/insights/package.json` — **needs `npm install` before the Hourly tab works.**

### Phase 3 — Climate History metrics — ON HOLD (awaiting new CSV structure)
- Add per-season extreme columns to a zone history table (shape TBD by Pete's new CSV output) + importer + backfill.
- Surface in `SeasonExplorer.jsx`.

### Phase 4 — Projections metrics — ON HOLD (awaiting new CSV structure)
- Frost/hot projections require either model-emitted counts (preferred, via the extended CSVs) or delta-downscaling of the baseline daily series. Surface in `ProjectionsExplorer.jsx`.

## Decisions locked
- Season window: 1 Sept – 30 Apr open; 1 May – 31 Aug holding.
- Frost: Tmin ≤ 0 °C; last **spring** frost (on/after 1 Sept); early count 1 Sept – 30 Nov.
- Hot days: Tmax > 30 °C.
- Extreme rain: max 1-day (mm) **and** heavy-rain-day count ≥ 25 mm/day.
- GDD: default base-10, toggle base-0.

## Workflow notes
- Build phase-by-phase; pause for Pete's review between phases. Pete runs the app/builds. Don't run git.
