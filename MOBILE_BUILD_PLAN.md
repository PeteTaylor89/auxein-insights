# Mobile Feature Build Plan — 2026-04-10

## Context
Mobile phases M1–M4 are complete (navigation, task execution, observations, assets read-only). The app has 5 tabs, 10 screens, and its own API layer. No map library installed. GPS is used only for observation spot captures. Tasks can be viewed/started/completed but not created. Assets are read-only.

---

## Phase 1: GPS Tracking + API Foundation — COMPLETE
> Hook + service methods

- `packages/mobile/src/api/services.js` — GPS tracking, task creation, asset creation, GeoJSON, risk endpoints added
- `packages/mobile/src/hooks/useGpsTracking.js` — foreground watcher (5s/5m polling, 15s batch upload, Haversine distance, pause/resume segments). Background tracking deferred to dev build (Expo Go limitation).
- `packages/mobile/app.json` — location permissions added (iOS infoPlist + Android permissions + expo-location plugin)
- `expo-task-manager` installed (ready for background tracking in dev builds)

### Bug Fixes During Build
- **Backend `model_dump()` collisions** — all 5 GPS endpoints (start, bulk, pause, resume, stop) were passing duplicate kwargs (`segment_id`, `device_id`, `timestamp`) via `**model_dump()`. Fixed by excluding explicitly-set fields.
- **"Already active" handling** — hook now gracefully continues if backend says GPS already active (from prior failed attempt)
- **GPS stop errors don't block task completion** — wrapped in try/catch so complete always proceeds

---

## Phase 2: GPS UI — COMPLETE
> TaskDetailScreen integration + GPS overlay

- **GPS card on TaskDetailScreen** — compact stats (distance/time/points/speed), green/yellow dot, "Tap to expand →"
- **GpsTrackingScreen** — full-screen dark modal rendered inside TaskDetailScreen via `<Modal>`:
  - Animated pulsing green dot (tracking) / solid yellow (paused)
  - "TRACKING" / "PAUSED" status with letter-spacing
  - Two large stat cards: Distance + Duration
  - Three small cards: avg km/h, GPS points, current km/h
  - GPS signal indicator
  - Pause/Resume + Stop buttons with confirmation alert
  - Auto-dismisses when tracking stops
- GPS only starts for tasks with `requires_gps_tracking: true`

---

## Phase 2b: GPS Data Processing — COMPLETE

> Breadcrumbs → geometry + stats on task stop/complete

### Goal
When GPS tracking stops (task complete or manual stop), process the breadcrumbs into meaningful geometry and stats. Store in a new `task_gps_summaries` table.

### New Model: `task_gps_summaries`

**File to create:** `backend/db/models/task_gps_summary.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `task_id` | Integer FK → tasks.id | unique, CASCADE delete |
| `company_id` | Integer FK → companies.id | for scoping |
| `user_id` | Integer FK → users.id | who tracked |
| `track_geometry` | Geometry('MULTILINESTRING', srid=4326) | rendered track — one LineString per segment |
| `coverage_geometry` | Geometry('POLYGON', srid=4326) | convex hull of all points, clipped to block polygon |
| `total_distance_meters` | Numeric(10, 2) | geodesic distance (Pyproj Geod, not Haversine) |
| `total_distance_km` | Numeric(8, 3) | computed |
| `active_duration_minutes` | Integer | total minus paused intervals |
| `total_duration_minutes` | Integer | first point to last point |
| `total_points` | Integer | breadcrumb count |
| `total_segments` | Integer | pause/resume count |
| `avg_speed_kmh` | Numeric(6, 2) | excluding stationary (< 0.5 km/h) |
| `max_speed_kmh` | Numeric(6, 2) | |
| `time_stationary_minutes` | Integer | speed < 0.5 km/h |
| `time_moving_minutes` | Integer | speed ≥ 0.5 km/h |
| `coverage_area_hectares` | Numeric(10, 4) | area of coverage_geometry |
| `block_area_hectares` | Numeric(10, 4) | area of parent block (if vineyard task) |
| `coverage_percentage` | Numeric(5, 2) | coverage / block area × 100 |
| `avg_accuracy_meters` | Numeric(6, 2) | mean GPS accuracy |
| `poor_accuracy_points` | Integer | accuracy > 20m |
| `created_at` | DateTime | when summary was computed |
| `block_id` | Integer FK → blocks.id, nullable | from parent task |

**Indexes:**
- `ix_gps_summary_task` on `task_id` (unique)
- `ix_gps_summary_company` on `company_id`
- GIST index on `track_geometry`
- GIST index on `coverage_geometry`

### Processing Function: `process_gps_track(task_id, db)`

**File:** `backend/services/gps_processing.py`

**Steps:**
1. **Load all breadcrumbs** for task_id, ordered by timestamp
2. **Group by segment_id** → one group per segment
3. **Build LineStrings** — one per segment, from ordered (lng, lat) coordinates
4. **Combine into MultiLineString** if multiple segments
5. **Calculate distance** — Pyproj `Geod.geometry_length(line)` for each segment, sum total (geodesic, accurate)
6. **Calculate duration** — first point timestamp to last point timestamp per segment, sum active segments. Total = first overall to last overall.
7. **Speed stats** — from stored speed values on each point:
   - `avg_speed` = mean of points where speed ≥ 0.5
   - `max_speed` = max of all points
   - `time_stationary` = count of points with speed < 0.5 × interval estimate
   - `time_moving` = active_duration - time_stationary
8. **Coverage geometry** — convex hull of all points. If task has a `block_id`, intersect hull with block polygon using `ST_Intersection`. Calculate area via `Geod.geometry_area_perimeter()`.
9. **Coverage percentage** — if block exists: `coverage_area / block_area × 100`
10. **Accuracy stats** — mean accuracy, count where accuracy > 20m
11. **Persist** — upsert into `task_gps_summaries` (handles re-processing)
12. **Update Task** — set `total_distance_meters` and `area_covered_hectares` on the Task row

### Trigger Points

- **On `POST /tasks/{task_id}/gps/stop`** — call `process_gps_track(task_id, db)` after deactivating GPS
- **On `POST /tasks/{task_id}/complete`** — call `process_gps_track(task_id, db)` if task has GPS points
- **Manual re-process endpoint** — `POST /tasks/{task_id}/gps/reprocess` (admin) for fixing bad data

### API Endpoints to Add/Update

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/tasks/{task_id}/gps/summary` | Return `TaskGpsSummaryResponse` with all stats |
| GET | `/tasks/{task_id}/gps/track/geojson` | Return track as GeoJSON Feature (LineString/MultiLineString) |
| GET | `/tasks/{task_id}/gps/coverage/geojson` | Return coverage polygon as GeoJSON Feature |
| PATCH | `/gps/stats` endpoint | Fix to return real calculated values instead of 0 |

### Alembic Migration

**File:** `backend/alembic/versions/xxxx_add_task_gps_summaries.py`

```sql
CREATE TABLE task_gps_summaries (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    track_geometry geometry(MULTILINESTRING, 4326),
    coverage_geometry geometry(POLYGON, 4326),
    total_distance_meters NUMERIC(10, 2),
    total_distance_km NUMERIC(8, 3),
    active_duration_minutes INTEGER,
    total_duration_minutes INTEGER,
    total_points INTEGER,
    total_segments INTEGER,
    avg_speed_kmh NUMERIC(6, 2),
    max_speed_kmh NUMERIC(6, 2),
    time_stationary_minutes INTEGER,
    time_moving_minutes INTEGER,
    coverage_area_hectares NUMERIC(10, 4),
    block_area_hectares NUMERIC(10, 4),
    coverage_percentage NUMERIC(5, 2),
    avg_accuracy_meters NUMERIC(6, 2),
    poor_accuracy_points INTEGER,
    block_id INTEGER REFERENCES blocks(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_gps_summary_task ON task_gps_summaries(task_id);
CREATE INDEX ix_gps_summary_company ON task_gps_summaries(company_id);
CREATE INDEX ix_gps_summary_track_geom ON task_gps_summaries USING GIST(track_geometry);
CREATE INDEX ix_gps_summary_coverage_geom ON task_gps_summaries USING GIST(coverage_geometry);
```

### Verify
1. Start a GPS task on mobile → walk around → complete
2. Check `task_gps_summaries` table has a row with geometry + stats
3. Hit `/gps/summary` endpoint → returns distance, duration, coverage
4. Hit `/gps/track/geojson` → returns valid GeoJSON LineString
5. Web maps: render track on block (future phase)

---

## Phase 2c: GPS Accuracy & Battery Tuning — NEXT SESSION

> Improve track accuracy while preserving battery life for all-day vineyard work.

### Current Settings
- `distanceInterval: 5m` — new point every 5m movement
- `timeInterval: 5000ms` — or every 5s, whichever comes first
- `accuracy: Location.Accuracy.High` — best available GPS
- `batchUpload: 15s` — bulk POST every 15 seconds
- No filtering of noisy/inaccurate points

### Problem
Raw GPS points include noise (signal bounce, satellite drift, tunnels/trees). This creates jagged tracks that overestimate distance and produce poor coverage polygons. Battery drain scales with polling frequency.

### Improvements to Implement

#### 1. Kalman Filter (client-side smoothing)
Add a simple 1D Kalman filter to `useGpsTracking.js` that smooths incoming GPS positions:
- **State:** estimated lat/lng + velocity
- **On each point:** predict next position from velocity → blend prediction with GPS reading, weighted by accuracy
- **Effect:** eliminates jitter while preserving true movement. ~20 lines of code.
- **Apply before:** storing in buffer and computing distance

```
Kalman gain = estimated_error / (estimated_error + measurement_error)
new_estimate = old_estimate + gain * (measurement - old_estimate)
new_error = (1 - gain) * estimated_error
```

#### 2. Accuracy-Based Point Filtering
Before adding a point to the buffer, reject if:
- `accuracy > 30m` — too inaccurate, would add noise
- `distance from last point < 1m AND speed < 0.3 km/h` — stationary noise
- `speed > 80 km/h` — impossible for vineyard work, GPS glitch

Track rejected point count for quality reporting.

#### 3. Adaptive Polling Intervals
Adjust GPS frequency based on movement state:

| State | Distance Interval | Time Interval | Battery Impact |
|-------|-------------------|---------------|----------------|
| **Moving (> 2 km/h)** | 3m | 3000ms | Higher but needed |
| **Slow (0.5–2 km/h)** | 5m | 5000ms | Current default |
| **Stationary (< 0.5 km/h)** | 20m | 15000ms | Low — just checking |

Implement by stopping and restarting `watchPositionAsync` with new params when speed state changes. Debounce state changes (require 3 consecutive readings at new speed) to avoid oscillation.

#### 4. Server-Side Track Simplification (post-processing)
In `gps_processing.py`, after building LineStrings:
- Apply **Ramer-Douglas-Peucker** simplification via `shapely.simplify(tolerance)` with tolerance ~0.00001 degrees (~1m)
- Removes redundant points on straight segments
- Reduces geometry size by 40-60% without visible quality loss
- Store both raw point count and simplified geometry

#### 5. Battery Monitoring
Read battery level via `expo-battery` and reduce GPS frequency when battery is low:
- `> 30%` — normal mode
- `15–30%` — slow mode (10m / 10s intervals)
- `< 15%` — critical mode (30m / 30s intervals) + warn user

#### 6. Distance Correction Factor
Compare GPS-reported distance with geodesic distance from summary:
- If GPS distance > geodesic × 1.3 → track was noisy, flag in quality report
- Store `distance_correction_factor` on summary for calibration

### Verify
1. Walk the same vineyard path twice — once with raw GPS, once with Kalman filter
2. Compare track smoothness and distance accuracy
3. Monitor battery % over a 2-hour tracking session
4. Check simplified geometry looks correct on web map

---

## Phase 2d: GPS Insights — FUTURE BUILD (deferred)

> This is the intelligence layer that turns GPS tracks into actionable vineyard insights.

### Spray/Fertigation Heatmaps

**Concept:** Weight each GPS point by dwell time (1/speed). Slow areas = more product applied. Fast areas = less coverage. Generate a weighted point grid for heatmap rendering.

**Data model:** `task_gps_heatmap_tiles` or generate on-the-fly from summary + breadcrumbs.

**Endpoint:** `GET /tasks/{task_id}/gps/heatmap` → returns `{ points: [{ lat, lng, weight }], bounds }`

**Rendering:** Web map layer with `mapboxgl.HeatmapLayer` or similar. Mobile: deferred.

### Application Rate Estimation

**Concept:** Combine GPS track with consumable data from the task:
- Track width (from equipment — spray boom width, spreader width) — stored on asset or template
- Speed at each point → area covered per unit time
- Total consumable quantity (from task completion actuals) ÷ total area = application rate

**Output:** L/ha or kg/ha estimated from GPS + consumable data. Show as stat on task completion summary.

### Gap Analysis (Missed Coverage)

**Concept:** Buffer the track LineString by half the equipment width → creates a polygon of "covered area". Subtract from block polygon → remaining area = gaps/misses.

**PostGIS:**
```sql
ST_Difference(
    block.geometry,
    ST_Buffer(track.track_geometry::geography, equipment_width_m / 2)::geometry
)
```

**Output:** GeoJSON polygon of missed areas. Render as red overlay on block.

### Pass Counting (Overlap Detection)

**Concept:** Buffer each track segment individually. Count overlapping buffers per grid cell → number of passes.

**Use case:** Double-spraying wastes product. Under-spraying misses pests. Ideal = exactly 1 pass everywhere.

**Output:** Grid of pass counts. Render as graduated colour on block (1=green, 2=yellow, 3+=red).

### Speed Profile Timeline

**Concept:** Time-series chart of speed over duration. Shows when worker was moving vs stationary, fast vs slow sections.

**Endpoint:** `GET /tasks/{task_id}/gps/speed-profile` → `{ data_points: [{ timestamp, speed_kmh, distance_km }] }`

**Rendering:** Line chart on web task detail page.

### Cross-Task Coverage Analysis

**Concept:** Aggregate GPS tracks from all tasks on a block over a season. Show cumulative coverage — which areas get the most attention, which are neglected.

**Use case:** Identify blocks or rows that are systematically under-serviced.

---

## Phase 3: Map Screen + Tab — NEXT
> Install react-native-maps, build MapScreen with blocks/tasks/assets/risks

### 3a. Install
`npx expo install react-native-maps`
- **iOS:** Apple Maps (free, no API key needed)
- **Android:** Google Maps (needs API key in `app.json` → `android.config.googleMaps.apiKey`)

### 3b. Create `packages/mobile/src/screens/MapScreen.js`

**Data loading on mount:**
1. `blocksService.getBlocksGeoJson()` → block polygons
2. `assetService.getAssetsGeoJson()` → asset markers
3. `riskService.getRisks({ status: 'active' })` → risk indicators
4. `tasksService.getTasks({ status: 'scheduled,ready,in_progress' })` → task counts per block

**Map layers:**
1. **Block polygons** — `<Polygon>` olive fill 30%, white stroke, `onPress` → info panel
2. **Task markers** — `<Marker>` at block centroid with count badge
3. **Asset markers** — `<Marker>` colored by category
4. **Risk dots** — colored circles at block centroid by risk level

**Block info panel** (bottom sheet on tap):
- Block name, variety, area
- Task count + risk badges
- Buttons: "View Tasks", "Create Task", close

**Layer toggles** — floating pills: Blocks | Tasks | Assets | Risks

### 3c. Add Map as 6th tab
- Between Assets and Profile, icon 🗺️
- Field workers need one-tap access

### Verify
Map tab → blocks render → tap block → info panel → toggle layers.

---

## Phase 4: Asset Registration — LATER
> Quick field registration from Assets tab

- `RegisterAssetScreen.js` — name, category chips, auto-GPS, optional photo
- Auto-generated `asset_number = "FIELD-" + Date.now()` (editable on web later)
- FAB on AssetsScreen + map integration
- Unlock asset number editing on web app

---

## Phase 5: Task Creation — LATER
> Quick create + optional start + optional immediate complete

- `CreateTaskScreen.js` + `BlockPickerModal.js`
- Standard `POST /tasks/tasks` — title, block, category, priority
- Optional "Start Now" → "Complete" for quick log-and-done
- FAB on TasksScreen + map "Create Task" button

---

## Phase 6: Polish — LATER
> Consistent UX across all screens

- `EmptyState.js`, `LoadingState.js` shared components
- Pull-to-refresh everywhere, error states with retry
- HomeScreen 2×2 quick actions grid
- GPS active indicator in tab bar

---

## Completed Fixes (2026-04-10)

### Task Assignment Bug
- **Root cause:** `usersService.getCompanyUsers()` method didn't exist — QuickCreate silently failed the guard check
- **Fix:** Added `getCompanyUsers()` to `packages/shared/src/api/usersService.js` calling `/admin/users`
- **Fix:** TaskCreationWizard switched from `adminService` fallback chain to `usersService.getCompanyUsers()`
- **Fix:** Wizard assignment UX — removed "+" button, users now auto-add on dropdown select

---

## Key Decisions
- **react-native-maps** — iOS (Apple Maps, free) + Android (Google Maps, API key)
- **6 tabs** — Map is primary field tool, top-level access
- **GPS foreground only for Expo Go** — background tracking via `expo-task-manager` when moving to dev builds
- **GPS data processing** — new `task_gps_summaries` table with PostGIS geometry, computed on task stop/complete
- **Geodesic distance** — Pyproj Geod (WGS84 ellipsoid), not Haversine, for production accuracy
- **Coverage** — convex hull of GPS points, clipped to block polygon via `ST_Intersection`
