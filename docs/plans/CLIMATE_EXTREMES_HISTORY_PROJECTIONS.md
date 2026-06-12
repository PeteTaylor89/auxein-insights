# Climate Extremes — History + Projections + Live Season Fold-in

_Scoped 2026-06-12. Extends `SEASON_AWARENESS_AND_CLIMATE_METRICS.md` Phases 3–4 (previously data-blocked). New source data has landed in `backend/data/Regional_additional_stats/`._

## New metric set (canonical, ETCCDI-style)
- **FD** — frost days (Tmin ≤ 0, full season)
- **Spring frost** — frost days in SON (Sep–Nov)
- **Last frost** — DOY + date of last spring frost
- **TX30 / HotDays30** — days Tmax > 30
- **R99p** — extreme-rainfall intensity (99th-percentile daily rainfall value, mm)
- **Rx1day** — max 1-day rainfall (monthly)

All carry mean + spatial SD (across the zone's model grid cells), matching the existing monthly history convention.

## Source data (`backend/data/Regional_additional_stats/`, 21 zones each)
| Dir | Grain | Key | Columns |
|---|---|---|---|
| `Regional_Seasonal_Stats` | per season (1987–2024) | region, vintage_year | last_frost_doy, last_frost_date, early_frost_mean/sd, frost_days_mean/sd, hot_days30_mean/sd, r99p_mean/sd |
| `Regional_Seasonal_Baseline` | 1 row (1987–2006) | region | last_frost_doy_mean/sd, last_frost_date, early_frost_*, frost_days_*, hot_days30_*, r99p_* |
| `Regional_Seasonal_Rx1day` | per season × month | region, vintage_year, month | rx1day_mean/sd |
| `Regional_Seasonal_Rx1day_Baseline` | per month | region, month | rx1day_mean/sd, baseline_period |
| `Regional_Projections_Extremes` | per SSP × period | Region, SSP, Period | Baseline_/Delta_/Projected_ × {FrostDays, SpringFrost, HotDays30, R99p} |

**Zone resolution** reuses the existing importer pattern: `ClimateZone.name == filename stem` (`upload_climate_history.py:73`). Seed list = `scripts/seed_climate_zones.py` (20 zones). **"South Coast" is a 21st dataset with no zone row → add it or skip.**

## Existing architecture (targets)
- Models `backend/db/models/climate.py`: `ClimateHistoryMonthly` (monthly means+sd), `ClimateBaselineMonthly` (monthly normal), `ClimateProjection` (monthly SSP deltas). Live daily = `climate_zone_daily` (2024+).
- API `backend/api/v1/public_climate.py` (mounted `/api/v1/public/public_climate`): `/zones/{slug}/history`, `/zones/{slug}/seasons`, `/zones/{slug}/baseline`, `/zones/{slug}/projections`. Schemas in `backend/schemas/public_climate.py` (`ClimateValue`, `MonthlyHistory`, `SeasonBaseline`, `SeasonSummary`, `MonthlyProjection`, `SeasonProjectionSummary`).
- Frontend: `SeasonExplorer.jsx` (Overview/Monthly/Compare), `ProjectionsExplorer.jsx`, `services/publicClimateService.js`.

## DEPLOY (2026-06-12)
Migrations `add_climate_extremes` + `add_monthly_frost` applied to prod; all CSV data loaded (21 zones). Backend ships via EB deploy 2026-06-12. **Insights frontend (S3/CloudFront) not rebuilt today** — FE changes are committed but not yet served to users until a `packages/insights` rebuild + deploy.

## BUILD STATUS (2026-06-12) — Phases 3+4+5 BUILT & VERIFIED
**Frontend (Phases 3+4):** `publicClimateService.js` (`EXTREME_METRICS`, `formatMetricValue` extended); `ProjectionsExplorer.jsx` "Projected Extremes" cards (frost/spring/hot/R99p baseline→projected+delta); `SeasonExplorer.jsx` Overview trend adds frost/hot/R99p selectable metrics + LTA baseline, Monthly view adds Rx1day, season cards show frost/hot/R99p chips (+ "obs" badge), metric auto-resets per view; `PublicClimate.css` chip styles. **Build green** (SeasonExplorer 24.9kB, ProjectionsExplorer 9.4kB).
**Phase 5 (live fold-in) BUILT + verified read-only:** `backend/services/season_extremes.py` (`compute_season_extremes`, `season_is_complete`, `upsert_observed_season` — FD Tmin<0, spring SON, last spring frost Sep-Dec, TX30 Tmax>30, R99p 99th-pctile wet-day; SD null; never clobbers modelled) + runner `scripts/compute_completed_season.py --vintage YYYY [--zone] [--force]`. Verified: Waipara vintage 2026 → frost 5 / spring 4 / hot 4 / R99p 40.97 / last 02-Oct, complete. **Write NOT yet run** (offer: `python backend/scripts/compute_completed_season.py --vintage 2026`).
**Remaining/optional:** run the fold-in write; reconcile Phase 2 Current-Season cards to canonical defs (heavy-rain≥25 → R99p, frost ≤0 → <0); user visual review + deploy.

## (earlier) Backend Phases 3+4 — BUILT + DEPLOYED to DB + VERIFIED live
- Data layer: models (`ClimateZoneSeasonStats`, `ClimateZoneSeasonBaseline`, `ClimateProjectionExtremes` + `rx1day_mean/sd` on monthly history & baseline), migration `alembic/versions/add_climate_extremes.py`, importer `backend/scripts/upload_climate_extremes.py`.
- **Migration applied (`add_climate_extremes` is head) + data loaded:** 777 season-stats, 21 season-baselines, 9324 Rx1day (all matched), 252 Rx1day baselines, 189 projection-extremes.
- API: `schemas/public_climate.py` (+`rx1day` on MonthlyHistory/MonthlyBaseline; new `SeasonExtremes`/`SeasonExtremesBaseline`/`ProjectionExtremes`); `api/v1/public_climate.py` builders + wired into history, baseline, seasons, projections endpoints. **Verified vs Waipara:** seasons return per-season frost/hot/r99p/last-frost + baseline extremes; projections return baseline/delta/projected; history+baseline return rx1day.
- **REMAINING:** frontend (`SeasonExplorer.jsx` extremes trends + Rx1day; `ProjectionsExplorer.jsx` frost/hot/R99p; `publicClimateService.js` metric helpers); then **Phase 5** live fold-in (`services/season_extremes.py` + `compute_completed_season.py`).

## Phase 3 — History extremes (import + API + frontend)
**Schema (one migration):**
- New `climate_zone_season_stats` — (zone_id, vintage_year, last_frost_doy, last_frost_date, early_frost_mean/sd, frost_days_mean/sd, hot_days30_mean/sd, r99p_mean/sd, **source** `modelled|observed`, created_at). Unique (zone_id, vintage_year).
- New `climate_zone_season_baseline` — (zone_id, baseline_period, last_frost_doy_mean/sd, last_frost_date, early_frost_mean/sd, frost_days_mean/sd, hot_days30_mean/sd, r99p_mean/sd). Unique (zone_id).
- Add `rx1day_mean`, `rx1day_sd` to `climate_history_monthly` and to `climate_baseline_monthly`.

**Importers (mirror `upload_climate_history.py`):**
- `upload_seasonal_stats.py` → `climate_zone_season_stats` (source='modelled').
- `upload_seasonal_baseline.py` → `climate_zone_season_baseline`.
- `upload_rx1day.py` → updates `climate_history_monthly` (match zone_id+vintage_year+month) and `climate_baseline_monthly` (zone_id+month).

**API:** extend `MonthlyHistory` with `rx1day: ClimateValue`; add `SeasonExtremes` block to the season summary + a baseline extremes block; surface season-stats series via `/zones/{slug}/seasons` (or a new `/zones/{slug}/extremes`).

**Frontend `SeasonExplorer.jsx`:** extreme metrics on season cards + baseline summary; new metric toggles for frost-days / hot-days / R99p trends; Rx1day in the Monthly view alongside Rain.

## Phase 4 — Projection extremes (import + API + frontend)
- New `climate_projection_extremes` — (zone_id, ssp, period, frost_days_baseline/delta/projected, spring_frost_*, hot_days30_*, r99p_*). Unique (zone_id, ssp, period). Same migration as Phase 3.
- Importer `upload_projection_extremes.py` → `climate_projection_extremes`.
- API: add `extremes` to each scenario/period in the projections response (baseline/delta/projected per metric).
- Frontend `ProjectionsExplorer.jsx`: add Frost / Hot days / R99p to the metric selector + summary cards (baseline → projected, with delta).

## Phase 5 — Live completed-season fold-in (self-extending history)
When a season finishes, compute the same stats from the live daily series and append to history — so the record grows each year without new CSVs.
- `services/season_extremes.py`: `compute_season_extremes(db, zone_id, vintage_year)` reads `climate_zone_daily` for that vintage's Sep–Apr window and computes FD, spring frost, last-frost DOY/date, TX30, R99p (season), and monthly Rx1day — **using the exact CSV definitions** (see open questions).
- Idempotent upsert into `climate_zone_season_stats` (**source='observed'**) + monthly Rx1day into `climate_history_monthly`.
- Gating: only when the vintage is complete (latest data ≥ 30 Apr). Runner `scripts/compute_completed_season.py --vintage YYYY [--zone slug]`, optional cron after season end.
- **Provenance:** `source` distinguishes modelled (1987–2024) vs observed (live). Live zone-daily is a single IDW series → **no spatial SD**, so observed rows store value with SD null; UI shows an "observed" badge. Vintage_year aligns across conventions on the Jan–Apr year (e.g. Sep 2025–Apr 2026 = 2026).
- Also reconcile Phase 2 live cards to the canonical set (swap heavy-rain-≥25mm count → R99p; keep Rx1day/max-1-day; spring frost + last frost already present) so Current Season, History, and Projections all speak the same metric language, and Current Season can compare to `climate_zone_season_baseline`.

## Locked definitions (for the Phase 5 live compute — match the model)
1. **R99p** = 99th-percentile daily rainfall **value (mm) over wet days (≥1 mm)** in the season.
2. **FD** = Tmin **< 0°C** (strict). Phase 2 live cards realign from ≤0 to <0.
3. **Last frost** = last **spring** frost, window **Jul–Dec**.
4. **Hot days (TX30)** = Tmax **> 30** (strict).
5. **South Coast** — already a seeded zone (Marlborough sub-zone, live). All 21 CSVs resolve; no action.
- One migration for all new tables/columns (Phases 3+4).
