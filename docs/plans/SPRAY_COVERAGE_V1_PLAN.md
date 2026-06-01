# Spray Coverage Heatmap — V1 Plan

Status: **Phases 1–3 BUILT 2026-06-01, both migrations applied (`alembic upgrade head` → `add_spray_coverage`, `add_task_source_task_id`). UNTESTED end-to-end against field data.** Hero feature for v1 release. Lives in Pro web **Insights → "Spray Program"**.

Review note (2026-06-01): a refactor left `compute_spray_coverage` referencing `smin`/`smax` (removed when the swath builder was extracted) — fixed to read from the `speed_band` param. Remaining TODO: wire the maps-v2 `GpsTracksPanel` "Spray Heatmap" placeholder to the same layer; verify any report that sums product/labour excludes `tasks.source_task_id IS NOT NULL`.

## Goal
Render a per-block raster heatmap of spray **application rate (L/ha)** computed from the sprayer GPS track, the asset's calibrated flow rate (L/s), and swath width (m). Surface over/under-application, overlaps, and gaps. Handle a single GPS outing that covers multiple blocks by detecting the extra blocks and (on confirmation) cloning completed tasks for them.

## Verified data foundation (2026-06-01)
- `task_gps_tracks`: per-point `speed` (km/h), `heading`, `accuracy` (m), `segment_id` (breaks on pause/resume), timestamp. Per **task**, per **user**. (`backend/db/models/task_gps_track.py`)
- `task_gps_summaries`: MULTILINESTRING `track_geometry` + convex-hull `coverage_geometry` clipped to block; built by `backend/services/gps_processing.py` (pyproj + PostGIS), invoked on task stop in `backend/api/v1/tasks.py`.
- `Task.block_id`: single FK, **nullable** (a task is block-limited; can be null). (`backend/db/models/task.py:57`)
- `TaskAsset` junction: `role`, actual usage, **`calibration_id`** → `AssetCalibration`. (`backend/db/models/asset.py:585`)
- `Asset.swath_width_m` Numeric(6,2). Flow rate = `AssetCalibration.measured_value` + `unit_of_measure` ("L/s"). Snapshot at compute time (calibration changes over time).
- `vineyard_blocks.geometry` PostGIS polygon, company/property scoped; `property_service.get_visible_property_ids()` gates visibility.
- Render stack: maps-v2 uses `geojson` + fill/line/symbol only. `Insights.jsx` is pill-based (`INSIGHT_CARDS`). Existing disabled "Spray Heatmap" placeholder in `GpsTracksPanel.jsx`.

## Core calculation
`rate (L/ha) = flow (L/s) × 36000 / (swath_m × speed_kmh)`. Rate ∝ 1/speed → slow/headland/overlap = over-application; fast/skip = under. Clamp at a min spray speed; stationary (<0.5 km/h) already excluded.

## Method — footprint accumulation (NOT field interpolation)
1. Filter points to a configurable **speed band** [min,max]; drop poor-accuracy points; group by `segment_id`.
2. Build segments between consecutive in-segment points where the gap ≤ **max-gap** (≈ one swath); mean speed → rate.
3. Reproject to metric CRS (NZTM EPSG:2193); **buffer each segment by `swath/2`** → a band of width = swath (absorbs GPS error), attribute its rate.
4. **Rasterize to a 1–2 m grid, accumulating overlaps** (sum rate where bands overlap → double-spray shows hot).
5. **Clip to block boundary** (`ST_Intersection`). Skipped rows remain transparent no-data — never interpolated across. Optional smoothing kernel ≤ swath only.

## Decisions (locked 2026-06-01)
- **Multi-block: detect + confirm.** Speed-band + coverage threshold detect candidate blocks; operator/manager confirms before any cloning.
- **Render: GeoJSON grid (`fill`)**, ~2 m cells colored by L/ha interpolate expression. Interactive hover. (Mapbox `heatmap` layer is point-density — wrong physics; not used.)
- **Propagation: full cloned completed tasks** per confirmed extra block — clone product/asset/calibration/operator/time, **apportion consumables by covered area**, **keep labour hours on the origin only**, link via `source_task_id`.

## Data model additions
- `spray_coverage` (per task+block): `task_id`, `block_id`, `company_id`, `source_task_id` (nullable; set on clones), snapshot `swath_m` + `flow_l_s` + `target_lha` + tolerance, `cell_size_m`, `speed_band_min/max`, `max_gap_m`; stats: `sprayed_area_ha`, `computed_volume_l`, `min/avg/max_lha`, `pct_within_tolerance`, `overlap_area_ha`, `gap_area_ha`; `grid_geojson` (JSONB cache of cells with `rate_lha`,`passes`) or S3 ref; `computed_at`.
- Optional `source_task_id` FK on `tasks` for clone lineage (or hold only on `spray_coverage`).
- Alembic migration (mind 32-char version slug limit; prod RDS at head).

## Phases
**Phase 1 — Coverage engine (backend), single block. ✅ BUILT 2026-06-01 (untested; needs `alembic upgrade head` + EB deploy).** `services/spray_coverage.py` implements the footprint-accumulation method for `task.block_id`. New `spray_coverages` table (`db/models/spray_coverage.py`) + migration `add_spray_coverage` (down_revision `set_assignment_task_cascade`). Gate is implicit: `_resolve_spray_inputs` returns None unless a TaskAsset's asset has `swath_width_m` + a resolvable flow rate, so the completion hook no-ops for non-spray tasks. Flow normalised to L/s (L/s, L/min, L/hr, mL/s). Local AEQD metric projection (centred on block centroid → generalises beyond NZ). Endpoints `GET /tasks/{id}/spray-coverage` (lazy-builds) + `POST .../spray-coverage/recompute`. Hook added in `complete_task` after `process_gps_track`. Defaults: 2 m cells, speed band 2–20 km/h, max-gap = max(2×swath, 6 m), tolerance ±10% of TaskAsset.planned_rate.

**Phase 2 — Insights "Spray Program" UI, single block. ✅ BUILT 2026-06-01 (untested).** List endpoint: decorator `@router.get("/spray-coverages")` on the tasks router (mounted at `/api/tasks`) → served at `/api/tasks/spray-coverages`, property-scoped. IMPORTANT path convention: tasks router prefix is `/api/tasks` and api base is `/api`, so service calls carry a leading `/tasks` and task-scoped routes double it (`/tasks/tasks/{id}/spray-coverage`), matching the GPS endpoints. (404 fixed 2026-06-01 — original service paths omitted the `/tasks` segment.) Shared `sprayCoverageService` (list/get/recompute). `components/spray/SprayProgramPanel.jsx` + `SprayProgram.css`: event list (left) + standalone mapbox (right) rendering the coverage grid as a `fill` layer with a diverging rate ramp (blue under → green target → amber/red over, centred on avg/target), block boundary outline, hover popup (L/ha + passes), stats bar + recompute, legend. Wired into `Insights.jsx` as a "Spray Program" pill (Droplets icon) passing `selectedPropertyId`. STILL TODO: wire the `GpsTracksPanel` placeholder to the same layer (deferred — Insights panel covers the primary UX).

**Phase 3 — Multi-block detect + confirm + propagate. ✅ BUILT 2026-06-01 (untested).** `detect_spray_blocks()` intersects the track-centred swath footprint with company blocks ≠ origin block (thresholds: ≥300 m² AND ≥3%). `GET /tasks/{id}/spray-coverage/candidates` (property-scoped; empty for clones — no GPS). `POST /tasks/{id}/spray-coverage/confirm {block_ids}` clones the origin task as a completed task per block (copies equipment+calibration, `requires_gps_tracking=False`, `source_task_id`=origin), computes that block's coverage from the origin's GPS via `compute_spray_coverage(clone, points_task_id=origin, source_task_id=origin)`, then apportions consumables by sprayed area (informational `actual_quantity` on clone TaskAssets, **no StockMovement** — product deducted once on origin; **labour hours stay on origin**). New `tasks.source_task_id` FK + migration `add_task_source_task_id` (down_revision `add_spray_coverage`) — reports must exclude `source_task_id IS NOT NULL` to avoid double-counting. UI: detect-and-confirm banner in `SprayProgramPanel` (checkboxes, shows already-added, terracotta accent). `compute_spray_coverage` refactored: extracted `_build_swaths`, added `points_task_id`/`source_task_id` params.

**Phase 4 — Polish.** Tolerance bands, overlap/gap surfacing, season "Spray Program" diary (planned vs actual), CSV/PDF export, recompute-on-calibration-correction, async hardening.

## Open risks
- No boom on/off telemetry → transit vs spraying ambiguity (mitigated by speed-band + threshold + confirm). Future: explicit spraying toggle or section telemetry.
- Constant calibrated flow assumed (no live pressure/PTO) — acceptable for v1.
- Single sprayer/operator per task assumed (GPS is per-user).
- Raster compute cost → async, re-runnable.
