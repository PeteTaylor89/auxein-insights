# Climate zone mask, seasonal histories, and zone polygons on the Atlas

**Date:** 2026-08-17
**Status:** in build. Implements D-C from `INSIGHTS_SITE_MAP_2026-08-13.md` and
unblocks `/region`, which `SURFACE_CONTRACT_V2.md` §8.2 currently returns 501 for.

Projections are **placeholders only** in this piece — Pete is preparing the data
files separately.

---

## 0. The shape of it

Build the **mask once**, then every future surface is sampled through it:

```
vineyard blocks  ∩  climate zone     →  cells of the 500 m grid, weighted by planted area
        (once, stored)                        ↓
                              monthly zone stats   (23 zones × 456 months × ~15 bands)
                                                   ↓
                              seasonal roll-up     (Sep–Apr, GDD + the other metrics)
                                                   ↓
                              API → zone polygons on the Atlas → overview → /regions/:slug
```

The mask is the reusable artefact. A new variable, a re-run, or the projections
surfaces all sample through the same cell list, so zone numbers stay comparable
across everything we ever publish.

---

## 1. Verified starting state (measured 2026-08-17, not assumed)

| fact | value |
|---|---|
| `vineyard_blocks` with geometry | **8,781** — all `ST_Polygon`, SRID 4326 |
| of those, `company_id IS NULL` | **8,692**, totalling **42,991 ha** |
| Grow customer blocks | **89** across 6 companies |
| `climate_zones` with geometry | **23** — 10 `region`, 13 `sub_zone`, 13 nested |
| zones with at least one block | **23 of 23** |
| surface grid | WGS84, 0.0045°, 2667 × 2856, origin (166.47, -34.43), nodata -9999 |

**42,991 ha matches NZ's national planted area**, so `vineyard_blocks` with a
null `company_id` is the national vineyard register, not customer data. Every
zone is populated — the mask is viable nationally, which was the main risk.

### The finding that drives the design: blocks are SMALLER than cells

Average reference block is **4.95 ha**. A 500 m grid cell at -41° is
501 m × 378 m = **18.9 ha** — the cell is geographic, so it narrows with
longitude. So a typical block covers about a quarter of one cell.

**Therefore the mask cannot be a binary rasterisation.** "Cell centre inside a
block" would discard most blocks outright; "any touch" would count a 25 m corner
clip the same as a fully planted cell. The mask stores **planted hectares per
cell**, and zone statistics are the weighted mean over those cells. That is also
the literal reading of D-C: intersect blocks with the zone, then let the blocks
choose and weight the cells.

---

## 2. Decisions taken in this build

**D1. The mask uses reference blocks only (`company_id IS NULL`).** Customer
block geometry never enters a public statistic. It costs nothing — 89 blocks of
8,781, and the register already covers those vineyards — and it removes the
question of whether a public number leaks a customer's planting.

**D2. Zone masks overlap, and that is correct.** Marlborough contains Lower
Wairau, Awatere and Upper Wairau. A parent zone's mask is the union of its
children plus anything unassigned. Rows are **not a partition — never sum across
zones.** Same caveat as the per-region CV work.

**D3. min/max are over masked CELLS, not blocks.** D-C asked for "the coolest
vineyard, not the coldest ridge nobody plants on". Because only planted cells are
in the mask, the coldest masked cell *is* a cell containing vineyard, so the
intent is satisfied without carrying a per-block × per-month table (8,692 × 456 ×
15 would be ~59 M rows to answer a question nobody asked at block resolution).
The response says which it is.

**D4. Season = Sep–Apr, labelled by the ENDING year**, matching the existing
`climate_zone_season_stats.vintage_year`. 1986-01..2023-12 monthly coverage gives
**37 complete seasons, 1986/87 → 2022/23**.

**D5. Precomputed into tables, not sampled on request.** The archive is fixed;
23 zones × 456 months is ~115 k rows and answers instantly. Sampling COGs per
request would put a multi-second S3 read behind a map click.

**D6. New tables, alongside the old ones.** `climate_zone_season_stats` (777
rows) stays untouched and frozen — D-B says the DB path lives until each article
widget type is migrated. The surface-backed tables are additive.

### Left open (do not need answering to build phases 1–3)

- **Baseline period**: the frontend uses 1986-2005, `SeasonExtremesBaseline` says
  1987-2006. Absolute stats are unaffected; every *anomaly* figure depends on it.
  Resolve before publishing anomalies.
- **Zone display on the map**: 23 overlapping polygons cannot all show at once.
  Likely regions at low zoom, sub-zones on zoom-in. Phase 4.
- Whether `/region`'s `weighting=area` is ever implemented, or `blocks` is the
  only weighting we serve.

---

## 3. Phases

### Phase 1 — the mask (this phase)
`alembic/versions/zone_cell_mask.py` + `backend/scripts/build_zone_mask.py`.

`climate_zone_cell_mask(zone_id, row, col, planted_ha, block_count, grid_key)`.

Per zone: clip reference blocks to the zone polygon, rasterise at a 10 × 10
sub-cell grid inside the zone's bounding window, aggregate sub-cells to
fractional cover, convert to hectares using each row's true cell area.

`grid_key` fingerprints the raster geometry (size + transform). Any consumer
asserts it matches the surface it is reading, so a future grid change fails loudly
instead of silently sampling the wrong cells.

### Phase 2 — monthly zone stats (BUILT 2026-08-17)
`climate_zone_surface_monthly(zone_id, variable, statistic, year, month, ...)`:
weighted mean, min, max, p10, p90, n_cells, planted_ha, grid_key, model_version.
Migration `zone_surface_monthly`; script
`backend/scripts/aggregate_zone_monthly.py`.

Reads are **windowed per zone**, not full-raster. Each zone's mask has a fixed
bounding box, so a 256-cell zone reads a small window of a tiled COG instead of
decompressing 2667 x 2856 to use a few hundred cells — ~8,600 times over.

Percentiles are **weighted by planted hectares**, so a cell holding 18 ha counts
for more than one holding 0.2. The spread describes growers, not the map.

**`gdd10` is stored as a derived statistic**, computed per cell from that month's
`mean` and `sd` before aggregation. GDD is convex in the mean, so
`GDD(zone mean) != mean of GDD(cell)`, and the gap is a systematic under-count at
cool sites, not noise. Deriving it here makes the seasonal roll-up a plain sum.

**Deliberately not aggregated: `first_frost_day` / `last_frost_day` /
`argmin_day` / `argmax_day`.** They are days-of-month with 0 meaning "never", so
a weighted mean across cells returns something that looks like a date and is not
one — averaging "no frost" against "the 28th". Phase 3 reads those bands
directly.

### Phase 3 — seasonal roll-up (BUILT 2026-08-17)
`climate_zone_surface_season(zone_id, vintage_year, metric, mean, min, max, p10,
p90, unit, coverage, n_cells, planted_ha, baseline, grid_key)`. Migration
`zone_surface_season`; script `backend/scripts/aggregate_zone_season.py`.
**Narrow, not wide** — a new metric is a new row, not a migration.

37 seasons, vintages 1987–2023. **Two passes:**

**Pass A, from the monthly table.** Sums and day-weighted means roll up *exactly*
because every month shares the same per-cell weights — a sum of weighted means is
the weighted mean of sums. Covers gdd10, tmean/tmin/tmax, frost_days,
early_frost_days (SON), hot_days_25/30, rain, wet_days, the rain-day counts.

**Pass B, per cell off the surfaces.** Three metrics are *not* recoverable from
Pass A and needed their own pass:
- `rx1day` — `max` of monthly zone means flattens each month's wettest cell into
  an average before taking the max, which understates the season maximum.
- `r99p` — needs each cell's own baseline threshold and its own exceedances.
- `last_spring_frost_doy` — a date; the latest Sep–Nov frost for a cell cannot be
  rebuilt from three monthly zone averages.

**`coverage` is first-class.** A cell with no spring frost has no last-frost
date, and must not be averaged in as zero — so the metric reports the share of
planted cells it applies to, and a zone with no frost at all emits **no row**
rather than a fake one.

**r99p's baseline is a parameter, recorded per row.** The frontend uses 1986-2005
and `SeasonExtremesBaseline` says 1987-2006; rather than block the roll-up, the
run records which baseline produced the number. Default 1986-2005. The top-5
`wet_topN` bands are sufficient: a 20-season baseline pools 800 values while the
99th percentile of ~1,900 wet days sits near the 20th largest.

**Known limitation, named in the data:** the metric is
`max_dry_spell_within_month`, because a dry spell crossing a month boundary is
truncated at the join. The dailies were never written, so this cannot be fixed
without re-running the history.

### Phase 4 — API and map (BUILT 2026-08-17, untested in a browser)

**Backend** (`backend/api/v1/surfaces.py`):
- `GET /region` — the 501 is retired. `weighting=blocks` only (`area` → 422 so a
  caller wanting the old definition is told, not silently given the new one);
  `granularity=monthly` only; reads the precomputed table, samples nothing.
- `GET /zones` — GeoJSON polygon layer, one headline number per zone plus its
  1987–2016 baseline, so the map can say "warmer than usual" without a second
  request. `level` filter, because zones nest.
- `GET /zones/{slug}/season` — Sep–Apr history by vintage year.
Both new routes are **open**, like `/tiles` and `/available`.

**Frontend**: `ZoneOverviewCard` (click → four headline stats vs baseline, the
across-vineyard range, then a CTA to `/regions/:slug`), zone fill/line layers on
`SurfaceMap` with hover feature-state, a "Wine regions" toggle, and a disabled
**"Projections · soon"** chip.

**The touch bridge is in.** MapboxDraw suppresses tap→click, so `map.on('click')`
is dead on touch — the zone would be unselectable on exactly the devices this is
tested on first. `touchstart`/`touchend` with an 8 px drag guard bridges it.

**Contract §8.3 written.** `/region` now serves a value, so §8.2's "no consumer
has ever read this field" argument is spent. It stays v2 — but only because the
semantics are written down in the same release that first answers the route, and
§8.3 says explicitly that anything further mints v3.

Acceptance: `check_surfaces_live.py` **41/41** (was 29).

### Phase 4 — original scope note
`/region` implemented with `weighting=blocks` (retires the 501, and with it the
§8.2 reasoning that kept the contract at v2 — see below). Zone polygons as a
GeoJSON overlay on the Atlas; click → overview card → `/regions/:slug`.
Projections placeholder layer.

**Contract note:** §8.2 says the v2-no-bump reasoning "expires the moment
`/region` ships a value". Phase 4 is that moment. The weighting change must be
written into the contract as part of Phase 4, not after.
