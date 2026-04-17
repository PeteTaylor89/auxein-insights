# Mobile Polish, GPS Refinement & Offline Plan

**Created:** 2026-04-17
**Branch:** grow-dev
**Wireframe references:** `docs/plans/observation.html`, `docs/plans/health.html`, `docs/plans/spray.html`

## Deployment Prerequisite

Before mobile testing against the cloud API:
1. Merge `grow-dev` → `main`
2. Run `alembic upgrade head` on production DB
3. Deploy to EB
4. Verify: `GET https://api.auxein.co.nz/api/health`

For local dev testing: run backend locally, mobile via Expo Go on LAN or tunnel mode.

---

## Design System Targets (from wireframes)

| Current App | Wireframe Target |
|---|---|
| Emoji icons | SVG icons (Feather/@expo/vector-icons) |
| Sand background (`#FDF6E3`) | Light slate (`#f8fafc` / `#f1f5f9`) |
| Single olive header | Context-colored headers (green=obs, red=incidents, olive=tasks) |
| Basic text inputs | Filled states (green border on complete fields) |
| Console.error only | Alert boxes, toast badges, step indicators |
| No map component | Satellite mini-map + full-screen GPS map |
| Flat scroll forms | Card-based sections with headers + icons |
| Bottom tab only | Bottom action bars per screen |

---

## Phase M5.1 — Design System Foundation

**Effort:** Medium | **Dependency:** None

- Switch to Inter font (expo-google-fonts or system fallback)
- Shared components matching wireframes:
  - `<SectionCard>` — white card, icon header, shadow, border-radius 12
  - `<GpsSection>` — green box, coordinates, accuracy badge, mini-map placeholder
  - `<BottomActionBar>` — fixed bottom, secondary + primary buttons
  - `<StepIndicator>` — progress dots (completed/active/pending) for wizards
  - `<FilledInput>` — input with green border/bg when value present
  - `<SeveritySelector>` — visual grid (not dropdown)
  - `<PhotoGrid>` — 3-col grid, captured checkmark + add-photo dashed
- Update `theme.js` to match wireframe palette

---

## Phase GPS.1 — Accuracy Filtering

**Effort:** Small | **Dependency:** None

- Discard points with accuracy > 30m (configurable threshold)
- Speed sanity check — flag/discard points implying >50km/h
- Stationary detection — stop recording if <2m movement in 30s
- Altitude smoothing — median-filter to remove GPS spikes

---

## Phase GPS.2 — Spray Track Map View (matches `spray.html`)

**Effort:** Large | **Dependency:** react-native-maps

Hero feature — full-screen GPS tracking with live map:
- `react-native-maps` MapView with satellite tiles
- Block polygon overlay from GeoJSON (blue for active block)
- Live GPS track polyline (blue, accumulated points)
- Pulsing current-position dot
- Header overlay — semi-transparent gradient, task name, block, product
- Stats overlay — 3 floating boxes (duration, distance, coverage %)
- LIVE indicator — red pulsing badge
- Bottom sheet panel — task details (product, rate, block, wind), Pause + Complete buttons
- Replaces current `GpsTrackingScreen.js` dark-themed overlay

---

## Phase M5.2 — Observation Spot Capture (matches `observation.html`)

**Effort:** Medium | **Dependency:** M5.1 shared components

Rebuild `SpotCaptureScreen.js` layout:
- Green olive header with back nav, run name, block+variety+area subtitle
- GPS Section card: coordinate boxes (monospace), accuracy badge, mini-map with block outline + pin
- Template fields in card section with icon header
- Photo grid (3-col, captured checkmark + add-photo dashed)
- Timestamp row at bottom of card
- Bottom bar: "Add Spot" secondary + "Save" primary green
- "Unsaved" badge on card header

---

## Phase OFF.1 + OFF.2 — Network Detection + GPS Offline Queue

**Effort:** Medium | **Dependency:** None

### OFF.1 — Network Detection
- Add `@react-native-community/netinfo`
- `useNetworkStatus()` hook — returns `isOnline`, `connectionType`
- Offline banner at top of screen when disconnected

### OFF.2 — GPS Offline Queue
- On bulk upload failure (network error), write points to AsyncStorage
- On reconnect, flush the queue
- Show pending point count in GPS status bar ("15 points queued")
- Persist across app restarts

---

## Phase M5.3 — Incident Report Wizard (matches `health.html`)

**Effort:** Medium | **Dependency:** M5.1 shared components

Rebuild CreateIncident as step-based wizard:
- Step 1: Type + Severity (visual severity grid selector) + Property
- Step 2: Details (title, description, location with GPS + mini-map)
- Step 3: Injury details (conditional — only for injury type)
- Step 4: Actions + evidence (photos, checkboxes)
- Red theme header (`#991b1b` gradient)
- Alert box for WorkSafe notification rules
- Progress steps bar (completed checkmark / active / pending)
- Bottom bar: "Back" + "Next Step" / "Submit" on final step

---

## Phase GPS.3 — Coverage Calculation

**Effort:** Small | **Dependency:** GPS.2

- Calculate coverage % by intersecting GPS track buffer (spray width) with block polygon area
- Backend `process_gps_track` already computes `area_covered_hectares` — expose as % of block
- Display in stats overlay on spray track view

---

## Phase GPS.4 — Battery Efficiency

**Effort:** Medium | **Dependency:** None

- Adaptive interval — stationary: reduce polling from 5s to 30s, resume 5s on movement
- Battery level monitoring — warn at 20%, auto-reduce accuracy at 10%

---

## Phase GPS.5 — Background Tracking (Dev Build Required)

**Effort:** Large | **Dependency:** EAS dev build (not Expo Go)

- Integrate `expo-task-manager` + `expo-location` background task
- `Location.startLocationUpdatesAsync` with `TaskManager.defineTask`
- Background task writes to local buffer (AsyncStorage)
- Foreground sync flushes buffer on app resume
- Critical for real field use (users lock phone during multi-hour tasks)

---

## Phase OFF.3 — Task & Observation Offline Cache

**Effort:** Large | **Dependency:** OFF.1

- Read cache — cache last-loaded task list, task detail, observation runs in AsyncStorage
- Write queue — queue status changes (start/pause/complete), spot saves, row completions
- Conflict resolution — last-write-wins for status, append-only for spots/rows
- Sync indicator in header (green checkmark / orange spinner / red X)
- Manual sync via pull-to-refresh
- ProfileScreen shows last sync time and pending queue count

---

## Phase M5.4 — Visual Polish

**Effort:** Ongoing | **Dependency:** After functional phases

- Replace all emoji icons with Feather icons
- Toast notifications for errors/success
- Loading skeletons for list screens
- Pull-to-refresh consistency
- Consistent card styling across all screens

---

## Build Order

| # | Phase | Effort | Key Deliverable |
|---|---|---|---|
| 1 | M5.1 Design system | Medium | Shared components, theme update |
| 2 | GPS.1 Accuracy filtering | Small | useGpsTracking.js refinements |
| 3 | GPS.2 Spray track map | Large | Full-screen live GPS map (hero feature) |
| 4 | M5.2 Observation capture | Medium | Rebuilt SpotCaptureScreen |
| 5 | OFF.1+OFF.2 Network + GPS queue | Medium | Offline resilience |
| 6 | M5.3 Incident wizard | Medium | Step-based incident flow |
| 7 | GPS.3 Coverage calc | Small | Coverage % in spray view |
| 8 | GPS.5 Background tracking | Large | Dev build, expo-task-manager |
| 9 | OFF.3 Full offline cache | Large | Complete offline support |
| 10 | M5.4 Visual polish | Ongoing | Icons, toasts, skeletons |

---

## Testing Plan

### Local Dev (each phase)
- Run backend locally, Expo Go on LAN
- Test the specific feature built

### Tunnel Mode Field Test (after GPS.2)
- `npx expo start --tunnel`
- Walk a block with phone on cellular
- Test GPS tracking + spray map view

### Standalone APK (after GPS.5)
- EAS build: `eas build --platform android --profile preview`
- Full field test with background tracking
- Multi-hour task simulation (battery drain check)

### Multi-User (after OFF.3)
- Admin/Manager/User login testing
- Property scoping verification on mobile
- Cross-property assignment edge cases
