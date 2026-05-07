# Mobile Map Screen — Plan

**Created:** 2026-05-08
**Status:** Spec only — code blocked on EAS dev build (Mapbox native module won't render in Expo Go)
**Owner area:** `packages/mobile/`
**Related:** `docs/plans/MOBILE_POLISH_PLAN.md` (GPS.2, GPS.5, dev-build decisions), `docs/asbuilt/MOBILE_BUILD_PIPELINE.md`

---

## Summary

A property-level satellite map for field workers — see blocks, assets, your live position, and the live track of an in-progress GPS task. Folds the deferred GPS.2 spray-track view in as a layer rather than a separate screen.

## Why now

- Mapbox plugin + tokens already wired in `app.config.js` + EAS env (sk + pk across dev/preview/prod) — `@rnmapbox/maps@10.1.31` already in `package.json`
- Backend GeoJSON endpoints **all already exist** (verified 2026-05-08) — pure frontend job
- Visitor sign-in/out shipped 2026-05-07 + 2026-05-08 → Map is the last big v0.1 mobile gap
- Play Console submission needs a polished v0.1 — Map is the differentiator vs. spreadsheet workflows

---

## Backend — mostly shipped, one small new endpoint

### Already shipped (verified 2026-05-08)

| Endpoint | Returns | Use |
|---|---|---|
| `GET /api/v1/blocks/geojson?property_id=X&limit=1000` | FeatureCollection of block polygons. Properties: `id`, `block_name`, `variety`, `area`, `property_id` | Block layer + task-count anchor |
| `GET /api/v1/blocks/{id}` | Single block with `geometry_geojson` + full block details | Block detail bottom-sheet |
| `GET /api/v1/assets/geojson?category=X` | FeatureCollection of assets with `location_point` or `location_geometry`. Properties: `id`, `name`, `asset_number`, `category`, `subcategory`, `status`, `location_label`. Already property-scoped via `build_asset_scope_filter` | Asset pin layer |
| `GET /api/v1/tasks/{task_id}/gps/track/geojson` | GeoJSON LineString of the recorded GPS track for a task | Live track polyline overlay |
| `GET /api/v1/tasks/{task_id}/gps/coverage/geojson` | GeoJSON polygon of swept-area coverage | Optional spray-coverage layer (later) |
| `GET /api/v1/tasks/{task_id}/gps/summary` | Distance, area covered, active minutes — already used on TaskDetail | Stats card overlay (optional) |
| `GET /api/v1/tasks?status_filter=...&block_id=...` | Task list (already used by TasksScreen) | Task counts per block (group client-side) |
| `GET /api/v1/properties` | Property list (no bounds field — derive from blocks) | Initial camera fit |

### New endpoint required (small, ~30 lines)

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /api/v1/risk-management/risks/geojson?property_id=X&status=active` | FeatureCollection of risks with non-null `location` (POINT) or `area` (POLYGON). Properties: `id`, `risk_title`, `risk_category`, `risk_type`, `inherent_risk_level` (Low/Medium/High/Critical), `residual_risk_level`, `status`, `owner_id` | Mirror the assets-geojson pattern. Property-scoped via existing `get_visible_property_ids`. `site_risks` table already has `location` + `area` columns (`Geometry POINT/POLYGON, srid=4326`). Source: `backend/api/v1/risk_management.py` |

**No backend work for tasks-on-map.** Tasks have no direct geometry column — only `block_id` + `location_notes`. They're surfaced via block aggregation (see Tasks layer below).

---

## Placement decision

**Recommendation: 5th bottom tab "Map"**, replacing nothing. Tab order: Home / Tasks / Map / Observe / Assets / Profile (6 tabs). Justification:

- Field workers need the map during work, not via a 2-tap drill-down from Home
- Onside / VitiCanopy / Wineglass all surface map at top-level
- Visitors lives off Home (already shipped) so we didn't burn this slot on it

**Alternative** if 6 tabs feels too dense: replace Observe with Map and move Observe under Home FAB (Observe is already initiated from Home → "Log → Observation" anyway). Decide during build review based on visual density.

---

## Layers (v0)

| # | Layer | Source | Style |
|---|---|---|---|
| 1 | Satellite base | Mapbox `mapbox://styles/mapbox/satellite-streets-v12` | Default |
| 2 | Block polygons | `/blocks/geojson?property_id=X` | Variety-coloured fill at 30% opacity, white 1.5px stroke; tap → bottom-sheet |
| 3 | Task badges (block-anchored) | `tasksService.listTasks({ limit: 500 })`, group by `block_id`, render at `centroid_longitude` / `centroid_latitude` from the blocks GeoJSON properties — **same data path as web `useTasksLayer`** | Symbol + count label at block centroid. Two icon variants (matching web): **active** (any task in `in_progress` / `ready` / `scheduled`) vs **inactive** (only completed/cancelled). Tap → block sheet with the grouped task list. |
| 4 | Asset pins | `/assets/geojson` | Category icon (Feather: `truck` for vehicle, `tool` for equipment, `droplet` for chemical, `package` for other) inside coloured circle; tap → AssetDetail |
| 5 | Risk markers | `/risk-management/risks/geojson?property_id=X&status=active` (NEW) | Pin shape coloured by `inherent_risk_level`: Low=green, Medium=amber, High=orange, Critical=red. POLYGON risks render as a stroked outline at 20% fill of the same colour + a centroid pin. Tap → risk bottom-sheet (title, category, level, owner, "View details") |
| 6 | User location | `expo-location` foreground | Pulsing blue dot |
| 7 | Live GPS track | `/tasks/{id}/gps/track/geojson` (poll every 5s when task is active) | Bright blue 4px line, sharp joints; only visible when an active GPS-tracking task is in progress |

### Tasks layer — mirror web `useTasksLayer` exactly

Tasks are associated with a block via `block_id`, so they're rendered as **block-grouped markers at the block centroid** — same approach the web map uses (`packages/web/src/pages/maps-v2/hooks/useTasksLayer.js`). No new backend, no geometry column on tasks.

Web pattern to mirror:

```js
// 1. Fetch all tasks (web uses limit:500, no status filter — keeps inactive blocks visible too)
const tasks = await tasksService.listTasks({ limit: 500 });

// 2. Group by block_id
const tasksByBlock = {};
tasks.forEach(t => {
  if (t.block_id) (tasksByBlock[t.block_id] ??= []).push(t);
});

// 3. Build point features at block centroids — pulled straight from blocks GeoJSON properties
//    (verified 2026-05-08: GET /blocks/geojson already returns centroid_longitude + centroid_latitude per feature)
const features = blocksGeojson.features
  .filter(b => tasksByBlock[b.properties.id])
  .map(b => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [b.properties.centroid_longitude, b.properties.centroid_latitude] },
    properties: {
      block_id: b.properties.id,
      block_name: b.properties.block_name,
      task_count: tasksByBlock[b.properties.id].length,
      has_active: tasksByBlock[b.properties.id].some(t => ['in_progress', 'ready', 'scheduled'].includes(t.status)),
    },
  }));
```

Mobile differences from web:
- Symbol layer renders the count label inside / beside the icon (web uses Mapbox `text-field` expression — same works on mobile)
- Tap on icon dispatches to the **block bottom-sheet** (mobile pattern), not a popup (web pattern)
- The block sheet shows the grouped task list — tap a task → existing TaskDetail screen

Out of scope for v0 — same as web:
- Per-task pins (tasks have no geometry column; would require a model change)
- Showing GPS coverage polygon on top of the badge (web has it as a separate "Show track" toggle in the side panel; mobile defers to the live-track polyline behaviour in MAP.8)

## Interactions (v0)

- **Initial camera**: fit bounds of all visible block polygons for the selected property; fallback to user location; fallback to NZ centroid
- **Property switcher**: same property pill from Home, top-left of map
- **Layer toggle button**: top-right, opens a sheet with checkboxes (Blocks / Assets / Track). Persisted in AsyncStorage
- **Tap block**: bottom-sheet — name, variety, area (ha), active task count + 3-row preview of open tasks ("Spray Botrytis · today", "Bud rub · in 2 days", ...), "View all tasks" → navigates to filtered Tasks list with `blockId` param
- **Tap task badge**: same as tapping the underlying block (badge is just a visual cue)
- **Tap asset pin**: bottom-sheet (or direct nav) → existing `AssetDetail` screen
- **Tap risk pin**: bottom-sheet — title, category, inherent + residual level chips (coloured), owner, location notes, "View risk" CTA (deep-links into web for now, or a future mobile RiskDetailScreen)
- **Tap user location button** (FAB-style, bottom-right): re-centre on user, zoom to 17
- **Active task banner** (top of map, if any task has `gps_tracking_active=true`): "Recording: <task name>" → tap goes to TaskDetail. Polyline auto-shows for that task
- **Long-press** on map: deferred to v0.1.1 (would let user drop a pin → "Create incident here" / "Create asset here")

---

## Out of scope for v0

| Item | Why deferred | Where it'll go |
|---|---|---|
| Offline tile cache | Tiles are big; PostGIS data caches separately. Field workers usually have signal at the homestead before heading out — pre-warm via screen visit | OFF.4 |
| Block boundary drawing | Web has it via `BlockManagement.jsx` — mobile doesn't need v0; field workers walk a perimeter via GPS instead | v0.2 |
| ~~Hazard / risk pin layer~~ | **Now in v0** — see MAP.5 | — |
| Incident pins | `incidents` table also has geometry — same pattern as risks but separate layer for clarity. Hold for v0.1.1 unless requested | v0.1.1 |
| Vineyard rows overlay | `vineyard_rows` table exists with geometry but is only populated for some blocks. Niche use case (spray task lane planning) | v0.2 |
| Multi-property view | v0 scopes to selected property to keep tile-load + render bounded | v0.1.1 |
| Long-press pin actions | Needs new "create at coordinate" flows — bigger than the map itself | v0.1.1 |
| Drawing / measurement tools | Wineglass-style area-measure. Useful but not core | v0.2 |

---

## Files to create

### Backend

```
backend/api/v1/risk_management.py                    — add GET /risks/geojson handler (mirror assets pattern)
```

### Mobile

```
packages/mobile/src/screens/MapScreen.js             — main screen, tab entry
packages/mobile/src/components/MapBlockSheet.js      — bottom-sheet for tapped block (with task list)
packages/mobile/src/components/MapRiskSheet.js       — bottom-sheet for tapped risk
packages/mobile/src/hooks/useBlockGeojson.js         — fetch + cache /blocks/geojson
packages/mobile/src/hooks/useAssetGeojson.js         — fetch + cache /assets/geojson
packages/mobile/src/hooks/useRiskGeojson.js          — fetch + cache /risks/geojson
packages/mobile/src/hooks/useTasksByBlock.js         — fetch open tasks, group by block_id, expose centroid badges
packages/mobile/src/hooks/useActiveGpsTask.js        — poll for any task with gps_tracking_active=true
```

## Files to edit

```
packages/mobile/src/navigation/AppNavigator.js       — add Map tab + stack
packages/mobile/src/api/services.js                  — add blocksService.getGeojson, assetService.getGeojson, riskService.getGeojson, tasksService.getGpsTrackGeojson
packages/mobile/src/screens/AssetsScreen.js          — optional "View on map" button on each asset
packages/mobile/src/screens/TaskDetailScreen.js      — optional "View on map" CTA when task has block_id or active GPS
```

---

## Build sequence (when dev build is ready)

| # | Phase | Effort | Deliverable |
|---|---|---|---|
| MAP.1 | Boot + base | S | MapScreen renders, satellite base, user-location dot, recenter button. No data layers. Verify Mapbox token loads from EAS env. |
| MAP.2 | Block layer | M | `/blocks/geojson` fetched + rendered as fill+stroke. Tap → log block id. Camera fits bounds on first load. |
| MAP.3 | Block detail sheet + tasks | M | Tapping a block opens bottom-sheet with name/variety/area + open-task list (3 preview rows + "View all"). Uses `useTasksByBlock`. |
| MAP.4 | Asset pins | M | `/assets/geojson` fetched, rendered as category-coloured circles with Feather icons. Tap → AssetDetail nav. |
| MAP.5 | Risk markers | M | **Backend**: add `GET /risk-management/risks/geojson`. **Mobile**: render POINT risks as level-coloured pins, POLYGON risks as stroked outlines + centroid pin. Tap → risk bottom-sheet. |
| MAP.6 | Task badges on blocks | S | Mirror web `useTasksLayer`: fetch tasks (limit 500), group by `block_id`, render symbol+count at block centroid. Active vs inactive icon variant. Tap → block sheet. Reference: `packages/web/src/pages/maps-v2/hooks/useTasksLayer.js`. |
| MAP.7 | Layer toggle | S | Top-right button opens layer sheet (Blocks / Tasks / Assets / Risks / Track), AsyncStorage-persisted. |
| MAP.8 | Live GPS overlay | M | When a task is GPS-tracking, banner appears at top + polyline overlays. Polls `/gps/track/geojson` every 5s. Stops polling when task no longer active. |
| MAP.9 | Polish + acceptance | S | Layer load skeletons, error toasts, OfflineBanner integration, performance check on 100+ blocks + 50+ risks + 50+ assets. |

Total: ~4-5 dev days against a working dev build (was 3-4 before risks + tasks were folded in).

---

## Dependencies / decisions

### Resolved
- ✅ Map library: **`@rnmapbox/maps`** (already installed, plugin wired). Reasons: richer satellite imagery than RN-maps, offline tile cache available later, supports custom layers cleanly.
- ✅ Tokens: in EAS env (`MAPBOX_PUBLIC_TOKEN` sensitive, `MAPBOX_DOWNLOAD_TOKEN` secret) per `MOBILE_BUILD_PIPELINE.md`.
- ✅ Backend GeoJSON endpoints all exist.

### Open
- **Tab placement**: 5th tab "Map" (recommended) vs. replace Observe. Decide during build kick-off.
- **Mapbox style**: `satellite-streets-v12` recommended (satellite + street labels for orientation). Alternatives: pure satellite, or a custom Auxein-branded style. Use default for v0, build a custom style later if needed.
- **Block fill colour scheme**: by variety (consistent w/ web `BlockManagement.jsx`?) or by status (planted/fallow/etc.)? Default to variety for v0 — matches what users see on web.
- **Live track refresh interval**: 5s (this plan) or driven by `gps.points` push from the local hook? Local push is faster + zero-network — preferred if `useGpsTracking` exposes the buffer cleanly. Decide in MAP.6.

---

## Acceptance (end of MAP.9)

1. Open Map tab → satellite tiles load → camera fits to selected property's blocks
2. Block polygons visible with variety colours; tap one → bottom-sheet shows name/variety/area + open task list
3. Task count badges appear on blocks when zoomed in (z14+); olive for open, red if any overdue
4. Asset pins visible; tap one → AssetDetail opens
5. Risk pins visible, colour-coded by inherent level (green/amber/orange/red); polygon-shaped risks render as outlined areas; tap → risk sheet
6. User dot pulses at current location; recenter button works
7. Start a GPS task → switch to Map → live polyline draws as you move
8. Layer toggle hides/shows Blocks / Tasks / Assets / Risks / Track independently — survives app restart
9. Switch property → all layers refetch and map re-fits to new property's blocks
10. Offline: show cached layers + offline banner; user dot still works (no network needed)
11. Performance: 100 blocks + 50 assets + 50 risks renders without jank on a mid-tier Android
