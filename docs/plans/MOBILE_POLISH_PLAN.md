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

**Effort:** Large | **Dependency:** OFF.1 | **Status:** Phases 1-2 shipped 2026-05-01 (untested), phases 3-6 pending

Six-phase plan, each reviewable independently. Two phases of foundation + task read cache shipped on 2026-05-01 — all UNTESTED, no UI changes yet (pure plumbing + behind-the-scenes wrapping). Out of scope for OFF.3: offline creation of new entities (createTask/Run/Incident/Risk) and offline photo uploads — both need temp-ID reconciliation, deferred to a future OFF.4.

| Phase | Status | Deliverable |
|---|---|---|
| 1. Foundation | ✅ 2026-05-01 (untested) | `services/offlineCache.js` (generic SWR), `services/writeQueue.js` (typed write queue), `services/syncCoordinator.js` (reconnect listener + status). Wired into `App.js` post-auth init. |
| 2. Task read cache | ✅ 2026-05-01 (untested) | `services/tasksCache.js` wrapping `getUnifiedFeed` / `getTask` / `listRows` / `getProgress` / `getMyTasks`. TasksScreen + TaskDetailScreen consume cached variants. |
| 3. Observation + asset read cache | ❌ Not started | Wrap `observationService` reads + `assetService.listAssets`. |
| 4. Write queue for task actions | ❌ Not started | `startTask`, `completeTask`, `completeRow`, `skipRow`, GPS pause/resume/stop. Optimistic local cache update. Last-write-wins for status. |
| 5. Write queue for observation spots | ❌ Not started | `createSpot`, `updateSpot`, `completeRun`. Append-only for spots. |
| 6. Sync UI | ❌ Not started | OfflineBanner pending count, sync state pill in headers, pull-to-refresh forces flush, ProfileScreen last-sync + pending count. |

**Conflict resolution:** Last-write-wins for status fields. Append-only for spots/rows (each write is an independent queue entry).

**Test plan when phases 1-2 land in front of a device:**
1. Online: open app → Tasks tab loads → tap a task → back out
2. Force-quit, enable airplane mode
3. Reopen → Tasks list and any previously-viewed task detail render from cache (not empty / spinner)
4. OfflineBanner is shown; writes intentionally still hit the network in this milestone (write queue is Phase 4)

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

| # | Phase | Effort | Status | Key Deliverable |
|---|---|---|---|---|
| 1 | M5.1 Design system | Medium | ✅ 2026-04-17 | Shared components, theme update |
| 2 | GPS.1 Accuracy filtering | Small | ✅ 2026-04-17 | useGpsTracking.js refinements |
| 2b | GPS tuning field validation | — | ✅ 2026-04-24 | Open-sky street test: clean parallel lines, good turning, Kalman tuning (Q=6, R_BASE=2) validated. Driveway convergence confirmed as multipath (walls/fences), not algorithm. |
| 2c | GPS lifecycle refinement | Small | ✅ 2026-04-27 | `hasBeenStopped` flag in hook; backend `/gps/summary` checked on TaskDetail load; three-state UI (start / live / locked-complete); explicit "Stop and lock" confirmation. Daylight end-to-end walk-test still pending. |
| 3 | GPS.2 Spray track map | Large | ⏳ Gated on dev build | Full-screen live GPS map (needs EAS dev build + map library decision) |
| 4 | M5.2 Observation capture | Medium | ✅ 2026-04-17 | Rebuilt SpotCaptureScreen |
| 5 | OFF.1+OFF.2 Network + GPS queue | Medium | ⚠️ Shipped 2026-04-17, still untested | Offline resilience. Tunnel-mode walk 2026-04-24 confirmed track retention but did NOT stress offline path (phone stayed on cellular). Proper verification: airplane mode mid-walk + re-enable, confirm queued points flush. |
| 6 | M5.3 Incident wizard | Medium | ✅ 2026-04-19 | CreateIncidentScreen step wizard |
| 7 | GPS.3 Coverage calc | Small | ❌ Not started | Coverage % in spray view. Depends on GPS.2. |
| 8 | GPS.4 Battery efficiency | Medium | ❌ Not started | Adaptive polling stationary-vs-moving, low-battery degradation. Not dev-build blocked. |
| 9 | GPS.5 Background tracking | Large | ⏳ Gated on dev build | expo-task-manager + background location task |
| 10 | OFF.3 Full offline cache | Large | ⚠️ Phases 1-2 of 6 shipped 2026-05-01, untested | Task + observation read cache + write queue. Foundation services + task read-cache integrated into TasksScreen / TaskDetailScreen. Phases 3-6 (obs cache, write queues, sync UI) still to do. |
| 11 | M5.4 Visual polish | Ongoing | ✅ 2026-04-19 | Icons (Feather app-wide), toasts, skeletons, branding |
| 12 | EAS build pipeline | Medium | ✅ 2026-04-27 (config) / ⏳ Pending first build | `eas.json` + `app.config.js` + Mapbox plugin wired; Mapbox tokens stored in EAS env (dev/preview/prod buckets). First Android dev build deferred until Apple Developer Program is sorted (user testing on iPhone Expo Go meanwhile). See `docs/asbuilt/MOBILE_BUILD_PIPELINE.md`. |
| 13 | Risk wizard (mobile) | Medium | ✅ 2026-04-27 | `CreateRiskScreen` 2-step wizard (category + type → details + likelihood × severity); backend `create_risk` notifies managers/admins; "Risk" FAB option on Home. Reframed from Hazard. |
| 14 | Task creation (mobile) | Medium | ✅ 2026-04-27 | `CreateTaskScreen` single-form + new `BlockPickerModal` component (search by name/variety, property-aware filter); `+` FAB on Tasks tab; Home FAB "Task" deep-links here. |

### Dev build decision — gating GPS.2 + GPS.5 + MapScreen

Three biggest remaining items (spray track map, background tracking, overview map tab) all require `npx expo prebuild` + `eas build --profile development`. One-time setup, unlocks all three at once.

Decisions required before running the dev build:

| Decision | Options | Notes |
|---|---|---|
| Map library | `react-native-maps` (free, Apple/Google native) OR `@rnmapbox/maps` (richer styles + offline tile cache, needs Mapbox tokens) | Polish plan GPS.2 says react-native-maps; memory + MOBILE_BUILD_PLAN.md mention Mapbox. Must resolve before prebuild. |
| Mapbox tokens (if Mapbox chosen) | Need both `sk.*` (secret, for tile download) + `pk.*` (public, runtime). User has tokens — still to confirm both types present. | |
| First-build platform | Android-only (easier: APK install, no Apple Dev account) OR Android + iOS (iOS needs Apple Developer Program membership + TestFlight) | |

### Non-blocked items that can ship on Expo Go first

If we want to keep shipping before committing to the dev build:

- ~~**Hazard/Risk create (mobile)**~~ — ✅ shipped 2026-04-27 as Risk wizard.
- ~~**Reopen GPS on active task**~~ — ✅ shipped 2026-04-27, then refined to a three-state lifecycle (start / live / locked-complete) — pause-only resume, stop is permanent.
- ~~**Task creation**~~ — ✅ shipped 2026-04-27 (`CreateTaskScreen` + `BlockPickerModal`).
- ~~**GPS.4 battery efficiency**~~ — deferred (most modern tractors have charging points; revisit if field workers report drain issues).
- **OFF.2 offline queue verification** — airplane-mode walk test + any bugs found.
- **OFF.3 full offline cache** — phases 1-2 (foundation + task read cache) shipped 2026-05-01 untested. Phases 3-6 still pending.
- **Visitor register** — in scoping, product conversation needed (`docs/plans/VISITOR_REGISTER_SCOPING.md`).

## Phase A.5 Additions (2026-04-19)

Features added after competitor-screenshot polish review:

| Feature | Status | Notes |
|---|---|---|
| Row quality rating removed | ✅ | User preference — not valuable to field workers |
| Task complete → timesheet hours | ✅ | `hours_worked` on `TaskCompleteRequest`; backend upserts today's `TimesheetDay` + `TimeEntry`; notifies user |
| Asset registration (mobile) | ✅ | `CreateAssetScreen` + FAB on AssetsScreen; notifies admins + managers |
| Hazard/Risk create (mobile) | ✅ 2026-04-27 | Now `CreateRiskScreen` (reframed Hazard → Risk). 2-step wizard: category (origin) + type (impact) → details + likelihood × severity → live inherent score. Backend `create_risk` notifies managers always, admins on high/critical. |
| Reopen GPS on active task | ✅ 2026-04-27 | Implemented as a three-state GPS card on TaskDetail: never-started shows "Start GPS Tracking"; live shows stats card; stopped shows "GPS Recording Complete" (locked, with summary stats from `/gps/summary`). Stop confirmation explicit about permanence. |
| Visitor register | 📋 Scoping | See `docs/plans/VISITOR_REGISTER_SCOPING.md` |

## Phase 2026-04-27 — UI polish + bug fixes

| Change | Notes |
|---|---|
| Login screen tightened | Removed tagline + "Welcome back" + "Sign in to continue"; footer "© Auxein, NZ" |
| Profile screen | Removed Server field; bell icon swapped from emoji to Feather; chevron Feather; version → 0.1.0 |
| Nav bar | Tab icons 22→26, height 60→72, label fontSize bumped to `sm` |
| Tasks/Assets filter pills | Icons 12/13→16, padding/text bumped |
| Home header | Branded redesign — logo mark + "Auxein Grow" wordmark, no greeting; property selector moved to its own context bar below header (bigger pill) |
| Home FAB | `+ Log` backdrop opacity 0.3→0.55 (more obvious modal feel); added "Risk" option (between Incident and Task) |
| Notifications visual treatment | Read/unread now sharply distinct — unread cards have shadow + accent strip in type colour + bold title; read cards muted (border-light bg, 0.78 opacity, "READ" marker). Empty state uses `Feather bell-off` (was emoji). |
| Notifications navigation bug | Profile tab listener resets to `ProfileMain` on tab press, so Home-bell deep-link doesn't pin Notifications across tab switches |
| Notifications API bug | `notificationService.getNotifications` was hitting `/v1/notifications/` (trailing slash) → 307 redirect → axios drops `Authorization` in RN → 401. Fixed by removing trailing slash. Inline comment added. |
| Home bell badge | Added; previously only Profile screen fetched the unread count |
| Backend `FileEntityType` | Added `risk`; uncommented `incident` (latent bug — incident photo uploads were silently failing) |
| Mobile build pipeline | EAS project linked; `app.config.js`, `eas.json`, `@rnmapbox/maps` config plugin all wired; Mapbox tokens stored in EAS env (sk = secret, pk = sensitive). See `docs/asbuilt/MOBILE_BUILD_PIPELINE.md` and `docs/asbuilt/SECRETS_MANAGEMENT.md`. |

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
