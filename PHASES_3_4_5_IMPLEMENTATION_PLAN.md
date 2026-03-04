# Phases 3, 4 & 5 — Implementation Plan

> Generated: March 2026
> Prerequisite: Phase 2.5 complete (permissions system in place)
> Reference: `DISCOVERY_REPORT.md`, `PHASE_2_5_IMPLEMENTATION_PLAN.md`

---

## Current State Summary

Before detailing each step, here's what already exists and what's missing:

| Feature | Backend | Frontend | Readiness |
|---------|---------|----------|-----------|
| **Calendar** | `GET /tasks/calendar` endpoint exists | No UI | 30% |
| **Notifications** | Full service + 4 API endpoints | Bell route exists, no UI | 40% |
| **Contractor Mgmt** | Full model + auth + relationships | No admin UI | 20% |
| **GPS Dashboard** | Full API (start/stop/pause/bulk points/stats) | Template refs only, no map | 30% |
| **Reporting** | User CSV export only | No UI | 10% |
| **Mobile App** | All APIs exist | Stub only ("Coming soon!") | 5% |
| **Weather Alerts** | Widget + admin stations exist | No alert rules/triggers | 25% |
| **Insights Views** | Disease/phenology components on Insights app | Pro app has placeholders only | 30% |
| **Spray Diary** | Task-asset linkage, consumable tracking exists | No UI | 25% |
| **Carbon Calculator** | Asset model has fuel/hours fields | No calculation service | 10% |
| **Push Notifications** | In-app notification model wired | No device tokens, no FCM/APNS | 15% |
| **Offline Support** | N/A | Nothing | 0% |
| **External Calendar** | N/A | Nothing | 0% |

---

# PHASE 3 — Web & Mobile Core Workflows

Phase 3 Web and Phase 3 Mobile can run **in parallel** since they share backend APIs but have no frontend dependencies on each other.

---

## Phase 3 Web

### W3.1 — Calendar Page

**What exists:** `GET /tasks/calendar` returns `TaskCalendarEvent` objects with dates, status, priority, assignees. No frontend component.

#### Step W3.1.1: Extend the calendar backend endpoint

**File:** `backend/api/v1/tasks.py`

The existing endpoint only returns tasks. Extend it (or create a new aggregated endpoint) to include:

- **Tasks** — already included
- **Observation plans** — `observation_plans.due_start_at`, `due_end_at`
- **Maintenance due dates** — `asset_maintenance.scheduled_date` where status = "scheduled"
- **Training deadlines** — `training_records.expires_at` for assigned training
- **Risk action due dates** — `risk_actions.target_completion_date` where status != "completed"

**New endpoint:** `GET /api/v1/calendar/events`
- Query params: `start_date`, `end_date`, `event_types[]` (filter by category)
- Returns unified `CalendarEvent` schema with `event_type` discriminator
- Permission: `require_permission("calendar", "read")`

**New file:** `backend/api/v1/calendar.py` (new router)
**New file:** `backend/schemas/calendar.py`
**Modified:** `backend/main.py` (register router)

#### Step W3.1.2: Build the calendar frontend component

**New files:**
- `packages/web/src/pages/Calendar.jsx` — main page
- `packages/web/src/components/calendar/CalendarView.jsx` — week/month toggle
- `packages/web/src/components/calendar/CalendarEvent.jsx` — event card

**Dependencies to add:** `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid` (or equivalent lightweight calendar lib)

**Implementation:**
1. Month view (default) and week view toggle
2. Colour-coded events by type (tasks=blue, observations=green, maintenance=orange, training=purple, actions=red)
3. Click event → navigate to entity detail page
4. Filter sidebar: toggle event types on/off
5. Permission-gated: only show if `hasPermission("calendar", "read")`

**New service method:** `calendarService.getEvents(startDate, endDate, eventTypes)` in `packages/shared/src/api/calendarService.js`

**Modified:** `packages/web/src/App.jsx` (add `/calendar` route)

---

### W3.2 — Notifications UI

**What exists:** Full backend (`NotificationService`, 4 endpoints), Bell icon route reference in `AppBar.jsx`. No frontend UI.

#### Step W3.2.1: Build the notification dropdown and page

**New files:**
- `packages/web/src/components/NotificationBell.jsx` — bell icon with unread count badge
- `packages/web/src/components/NotificationDropdown.jsx` — dropdown list (latest 10)
- `packages/web/src/pages/Notifications.jsx` — full notification list page

**New service:** `packages/shared/src/api/notificationService.js`
```javascript
getNotifications(unreadOnly, limit)
getUnreadCount()
markAsRead(notificationId)
markAllAsRead()
```

**Implementation:**
1. `NotificationBell` in `AppBar.jsx` — polls `GET /notifications/unread-count` every 30s
2. Click bell → dropdown with latest 10 notifications, "View all" link
3. Each notification: icon by type, title, body preview, relative timestamp, read/unread indicator
4. Click notification → navigate using `data` JSON (deep-link to entity), mark as read
5. Full page at `/notifications` — paginated list, "Mark all read" button, filter by type
6. Permission: available to all authenticated users (no special permission needed)

**Modified:** `packages/web/src/components/AppBar.jsx` (replace Bell placeholder), `packages/web/src/App.jsx` (add `/notifications` route)

#### Step W3.2.2: Add polling/real-time support (optional enhancement)

If real-time updates are desired later, add SSE (Server-Sent Events) endpoint:
- `GET /api/v1/notifications/stream` — SSE endpoint for real-time push
- Frontend: `EventSource` in `NotificationBell` instead of polling

This is optional for Phase 3 — polling at 30s intervals is sufficient initially.

---

### W3.3 — Contractor Management UI

**What exists:** Full Contractor model with insurance/biosecurity/verification fields, `ContractorRelationship` model, auth endpoints. No admin frontend.

#### Step W3.3.1: Create contractor management backend endpoints

The contractor data exists in models but needs dedicated admin-facing endpoints. Check/create:

**New file:** `backend/api/v1/contractor_management.py`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/contractors` | GET | List contractors for company (via relationships) |
| `/api/v1/contractors/{id}` | GET | Get contractor detail (insurance, biosecurity, verification) |
| `/api/v1/contractor-relationships` | GET | List relationships for company |
| `/api/v1/contractor-relationships` | POST | Create/invite contractor relationship |
| `/api/v1/contractor-relationships/{id}` | PATCH | Update status (approve/suspend/terminate) |
| `/api/v1/contractor-relationships/{id}/verify-insurance` | POST | Mark insurance as verified |
| `/api/v1/contractors/{id}/assignments` | GET | List assignments for contractor at company |
| `/api/v1/contractors/{id}/movements` | GET | List movement/visit history |
| `/api/v1/contractors/{id}/training` | GET | List training status |

Permission: `require_permission("contractors", "read/create/update")`

**Modified:** `backend/main.py` (register router)

#### Step W3.3.2: Build contractor management frontend

**New files:**
- `packages/web/src/pages/ContractorManagement.jsx` — main page with tabs
- `packages/web/src/components/contractors/ContractorList.jsx` — table/grid of contractors
- `packages/web/src/components/contractors/ContractorDetail.jsx` — sliding detail panel
- `packages/web/src/components/contractors/InsuranceStatus.jsx` — insurance verification display
- `packages/web/src/components/contractors/RelationshipActions.jsx` — approve/suspend/terminate controls

**Implementation:**
1. Tab layout: Active | Pending | Suspended | All
2. Contractor card: name, business, insurance status (compliant/partial/non-compliant badges), last active date, jobs completed
3. Click → sliding detail panel with:
   - Contact info, business details
   - Insurance documents with expiry dates and status
   - Biosecurity risk level indicator
   - Active assignments list
   - Movement history timeline
   - Training compliance status
4. Action buttons: Approve, Suspend, Terminate (with confirmation modals)
5. "Invite Contractor" button → form to create new relationship
6. Permission-gated: `hasPermission("contractors", "read")` for viewing, `"update"` for actions

**New service:** `packages/shared/src/api/contractorManagementService.js`

**Modified:** `packages/web/src/App.jsx` (add `/contractors` route), navigation components (add menu item)

---

### W3.4 — GPS Tracking Dashboard

**What exists:** Complete GPS API (start/stop/pause/resume/bulk-points/stats), `TaskGPSTrack` model with lat/lng/altitude/speed/heading. No visualization UI.

#### Step W3.4.1: Build GPS tracking dashboard

**New files:**
- `packages/web/src/pages/GPSTracking.jsx` — standalone dashboard (or embedded in task detail)
- `packages/web/src/components/gps/TrackMap.jsx` — Mapbox GL track visualization
- `packages/web/src/components/gps/TrackStats.jsx` — distance, area, speed stats
- `packages/web/src/components/gps/TrackTimeline.jsx` — playback timeline control

**Implementation:**
1. **Active tracks view:** List of currently tracking tasks (where `gps_tracking_active = true`), with live position on map
2. **Historical track view:** Select a completed task → display track on Mapbox map
   - Polyline with colour gradient (by speed or time)
   - Segment markers for pause/resume points
   - Start/end markers
3. **Track stats panel:** Total distance, area covered, average speed, duration, pause time
4. **Track playback:** Timeline slider to animate position along track (optional enhancement)
5. **Multi-track overlay:** Show multiple task tracks simultaneously for coverage analysis

**Integration points:**
- Task detail page: "View Track" button linking to GPS view for that task
- Maps page: Layer toggle for GPS tracks
- Reporting: GPS stats included in task reports

**New service methods:** Add to `packages/shared/src/api/tasksService.js`:
```javascript
getGPSTrack(taskId, segment)
getGPSStats(taskId)
getActiveGPSTasks(companyId)
```

**Modified:** `packages/web/src/App.jsx` (add route), task detail pages (add "View Track" link)

---

### W3.5 — Unified Reporting Page

**What exists:** User CSV export in admin. No task/observation/timesheet/asset reporting endpoints or UI.

#### Step W3.5.1: Create reporting backend endpoints

**New file:** `backend/api/v1/reports.py`

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/reports/tasks/summary` | Task counts by status, category, assignee. Date range filter. |
| `GET /api/v1/reports/tasks/export` | CSV export of task data |
| `GET /api/v1/reports/observations/summary` | Observation counts by template, block, date range |
| `GET /api/v1/reports/observations/export` | CSV export |
| `GET /api/v1/reports/timesheets/summary` | Hours by user, task, date range. Approval stats. |
| `GET /api/v1/reports/timesheets/export` | CSV export |
| `GET /api/v1/reports/assets/summary` | Asset utilisation, maintenance due, stock levels |
| `GET /api/v1/reports/assets/export` | CSV export |

Permission: `require_permission("reports", "read")` for viewing, `"export"` for CSV download.

**New file:** `backend/schemas/report.py`

#### Step W3.5.2: Build reporting frontend

**New files:**
- `packages/web/src/pages/Reports.jsx` — tabbed report page
- `packages/web/src/components/reports/TaskReport.jsx` — task summary charts + table
- `packages/web/src/components/reports/ObservationReport.jsx` — observation summary
- `packages/web/src/components/reports/TimesheetReport.jsx` — timesheet summary
- `packages/web/src/components/reports/AssetReport.jsx` — asset summary

**Implementation:**
1. Tab layout: Tasks | Observations | Timesheets | Assets
2. Each tab: date range picker, summary stat cards, Chart.js visualisation, data table
3. Export button per tab (CSV download)
4. Tasks: status distribution pie chart, category bar chart, assignee workload, completion trends
5. Observations: runs per template, spots per block, coverage heat map
6. Timesheets: hours by user bar chart, task distribution, approval status, weekly trends
7. Assets: utilisation rates, upcoming maintenance, stock levels below minimum

**New service:** `packages/shared/src/api/reportService.js`

**Modified:** `packages/web/src/App.jsx` (add `/reports` route), navigation (add menu item)

---

## Phase 3 Mobile

### M3.1 — Project Scaffolding

**What exists:** Expo 53 + React Native 0.79.6 skeleton. "Coming soon!" screen. No navigation, no auth, no API integration.

#### Step M3.1.1: Install dependencies and configure navigation

**Modified:** `packages/mobile/package.json`

**Add dependencies:**
```json
"@react-navigation/native": "^7.x",
"@react-navigation/bottom-tabs": "^7.x",
"@react-navigation/stack": "^7.x",
"react-native-screens": "latest",
"react-native-safe-area-context": "latest",
"expo-location": "~18.x",
"expo-image-picker": "~16.x",
"expo-notifications": "~0.30.x",
"expo-secure-store": "~14.x",
"@react-native-async-storage/async-storage": "latest",
"@vineyard/shared": "file:../shared"
```

#### Step M3.1.2: Create navigation structure

**New files:**
```
packages/mobile/src/
├── App.tsx                          # Root with navigation container
├── navigation/
│   ├── AuthNavigator.jsx            # Login/register stack
│   ├── MainNavigator.jsx            # Bottom tabs (role-aware)
│   ├── TasksStack.jsx               # Task screens stack
│   ├── ObservationsStack.jsx        # Observation screens stack
│   └── ProfileStack.jsx             # Profile/settings stack
├── screens/
│   ├── auth/
│   │   ├── LoginScreen.jsx
│   │   └── ForgotPasswordScreen.jsx
│   ├── home/
│   │   └── HomeScreen.jsx           # Dashboard
│   ├── tasks/
│   │   ├── TaskListScreen.jsx
│   │   ├── TaskDetailScreen.jsx
│   │   └── TaskCreateScreen.jsx
│   ├── observations/
│   │   ├── ObservationMenuScreen.jsx # Field menu
│   │   ├── RunCaptureScreen.jsx
│   │   └── SpotCaptureScreen.jsx
│   └── profile/
│       └── ProfileScreen.jsx
├── contexts/
│   └── MobileAuthContext.jsx        # Wraps shared AuthContext + SecureStore
├── services/
│   └── mobileApi.js                 # API instance with SecureStore tokens
├── hooks/
│   ├── useLocation.js               # expo-location wrapper
│   └── useCamera.js                 # expo-image-picker wrapper
└── components/
    ├── LoadingScreen.jsx
    └── PermissionGate.jsx           # Role-aware component wrapper
```

**Implementation:**
1. `MobileAuthContext` wraps `@vineyard/shared` auth but stores tokens in `expo-secure-store` instead of localStorage
2. `MainNavigator` uses `userTypeRole` to determine which tabs to show:
   - `auxein_admin` / `company_admin` / `company_manager`: Home, Tasks, Observations, Profile
   - `company_user`: Home, My Tasks, Capture, Profile
   - `contractor`: Home, Assigned Tasks, Training, Profile
3. `AuthNavigator` shown when not authenticated, `MainNavigator` when authenticated

#### Step M3.1.3: Mobile API layer

**New file:** `packages/mobile/src/services/mobileApi.js`

- Extends the shared `api.js` but swaps localStorage for `expo-secure-store`
- Adds `X-Client-Type: mobile` header
- Handles token refresh with secure storage
- Offline detection: wraps API calls with network check, queues if offline

---

### M3.2 — Home Dashboard

**New file:** `packages/mobile/src/screens/home/HomeScreen.jsx`

**Implementation:**
1. Company name header
2. Quick stats cards: "X tasks assigned", "Y observations this week", "Z notifications"
3. Weather widget (current conditions from shared weather service)
4. Upcoming items list (next 3 tasks/training/maintenance due)
5. Layout adapts per user type:
   - Admin/Manager: company-wide stats
   - User: personal stats only
   - Contractor: per-relationship stats with company switcher

---

### M3.3 — Task List & Detail

**New files:**
- `packages/mobile/src/screens/tasks/TaskListScreen.jsx`
- `packages/mobile/src/screens/tasks/TaskDetailScreen.jsx`

**Implementation:**
1. **List:** FlatList with pull-to-refresh, filter chips (status: All/Active/Completed), search
2. **Detail:** Task info, status actions (Start/Pause/Resume/Complete buttons), assignment info, row progress (if applicable), GPS track toggle
3. Uses existing `tasksService.getMyTasks()` and `tasksService.getTask(id)` from shared
4. Permission: `company_user` and `contractor` see assigned tasks only. Admin/manager see all.

---

### M3.4 — Task Creation (Simplified)

**New file:** `packages/mobile/src/screens/tasks/TaskCreateScreen.jsx`

**Implementation:**
1. Step wizard: Select template → Set dates → Assign block → Assign user (optional) → Create
2. Quick-create from template: single tap to create with defaults
3. Available to `company_admin` and `company_manager` only (permission-gated)
4. Uses `tasksService.createTask()` from shared

---

### M3.5 — GPS Tracking

**New files:**
- `packages/mobile/src/screens/tasks/GPSTrackingScreen.jsx`
- `packages/mobile/src/services/gpsService.js`
- `packages/mobile/src/hooks/useBackgroundLocation.js`

**Implementation:**
1. `expo-location` foreground + background tracking
2. Controls: Start, Pause, Resume, Stop
3. Live track display on `react-native-maps` MapView
4. Bulk point upload: buffer GPS points locally, POST `/gps/points/bulk` every 30s or on stop
5. Background tracking with `expo-task-manager` for when app is backgrounded
6. Battery-aware: reduce frequency when battery low
7. Offline: store points in AsyncStorage, sync when reconnected

---

### M3.6 — Observation Capture

**New files:**
- `packages/mobile/src/screens/observations/ObservationMenuScreen.jsx` — field menu
- `packages/mobile/src/screens/observations/RunCaptureScreen.jsx` — run workflow
- `packages/mobile/src/screens/observations/SpotCaptureScreen.jsx` — individual spot form

**Implementation:**

1. **Field menu** (per dev plan):
   ```
   Disease Observations
   Phenology Observations
   Bud Count *
   Flower Count *
   Bunch Count
   Bunch/Berry Sampling
   Hazard
   Health and Safety
   Log a Task
   Start / Resume Tasks
   Tractor Task
   ```
   Items with * hidden based on phenological stage data from backend.

2. **Run capture flow:** Select menu item → auto-selects template → choose block → Start run → capture spots
3. **Spot capture:** GPS auto-fill, camera button (expo-image-picker), template-driven form fields, voice-to-text (expo-speech for transcription)
4. Each spot: photo + GPS + form data → POST to `/observations/{run_id}/spots`
5. Optimised for one-handed use: large tap targets, minimal typing, swipe gestures

---

# PHASE 4 — Web & Mobile Secondary Features

**Prerequisite:** Phase 3 complete (web core pages built, mobile app functional)

Phase 4 Web and Phase 4 Mobile can run **in parallel**.

---

## Phase 4 Web

### W4.1 — Weather Alerts Display

**What exists:** WeatherWidget on home dashboard, admin weather station management, weather data ingestion pipeline. No alert rules or triggers.

#### Step W4.1.1: Create weather alert backend

**New migration:** Add `weather_alerts` table:
```
weather_alerts:
  id (PK), company_id (FK), alert_type (frost/heat/wind/rain/humidity),
  condition (gt/lt/eq), threshold_value, threshold_unit,
  station_id (FK, optional), block_id (FK, optional),
  is_active, notify_roles (JSON array of user_types),
  created_by (FK users), created_at, updated_at
```

**New migration:** Add `weather_alert_events` table:
```
weather_alert_events:
  id (PK), alert_id (FK), triggered_at, resolved_at,
  actual_value, station_id, acknowledged_by (FK users),
  acknowledged_at, notification_sent
```

**New file:** `backend/api/v1/weather_alerts.py`
- CRUD for alert rules (company-scoped)
- `GET /alerts/active` — current triggered alerts
- `GET /alerts/history` — past alert events

**New file:** `backend/services/weather_alert_service.py`
- Called by daily-processing/weather-ingestion jobs
- Evaluates all active alert rules against latest weather data
- Creates `weather_alert_events` when thresholds breached
- Sends notification via `NotificationService`

#### Step W4.1.2: Frontend weather alerts

**Modified:** `packages/web/src/components/widgets/WeatherWidget.jsx` — add alert badge
**Modified:** `packages/web/src/pages/Calendar.jsx` — overlay active weather alerts
**New:** `packages/web/src/components/weather/WeatherAlertBanner.jsx` — dismissible alert banner on home
**New:** `packages/web/src/components/weather/AlertRulesManager.jsx` — admin UI to create/edit alert rules

---

### W4.2 — Insights Completion

**What exists:** `Insights.jsx` page with placeholder cards. Disease pressure and phenology components exist in the Insights (public) app but not in the Pro app. Climate data services exist.

#### Step W4.2.1: Port climate components to Pro app

Copy and adapt from `packages/insights/src/components/climate/`:
- `DiseasePressureExplorer.jsx` → `packages/web/src/components/insights/DiseasePressure.jsx`
- `PhenologyExplorer.jsx` → `packages/web/src/components/insights/Phenology.jsx`

Adapt to use company-scoped climate data (private blocks) instead of public regional data.

#### Step W4.2.2: Build yield estimation component

**New file:** `packages/web/src/components/insights/YieldEstimation.jsx`

**Backend:** `GET /api/v1/insights/yield-estimate/{block_id}`
- Aggregates bud count → flower count → bunch count → berry sampling observations
- Applies variety-specific conversion factors
- Returns estimated yield (kg/ha) with confidence interval

**New file:** `backend/api/v1/insights.py` (new router)
**New file:** `backend/services/yield_estimation_service.py`

#### Step W4.2.3: Build pre-harvest sampling view

**New file:** `packages/web/src/components/insights/PreHarvestSampling.jsx`
- Sugar (Brix), acid, pH tracking over time
- Harvest readiness indicator
- Comparison with previous seasons

#### Step W4.2.4: Connect Insights page placeholders

**Modified:** `packages/web/src/pages/Insights.jsx`
- Replace placeholder cards with real components
- Add block selector and date range controls
- Permission: `require_permission("reports", "read")`

---

### W4.3 — Pro App Header/Footer

**Modified files:**
- `packages/web/src/components/AppBar.jsx` — redesign with section links, branding
- **New:** `packages/web/src/components/Footer.jsx` — consistent footer with links, version
- `packages/web/src/App.jsx` — wrap routes with header/footer layout

Straightforward UI/branding task. No backend changes.

---

### W4.4 — Spray Diary Auto-Generation

**What exists:** Task-asset linkage (`TaskAsset` junction), consumable fields (active_ingredient, application_rate, withholding_period), GPS tracking, weather conditions JSON on tasks.

#### Step W4.4.1: Create spray diary backend

**New file:** `backend/api/v1/spray_diary.py`

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/spray-diary` | List spray events (filtered tractor tasks with consumables) |
| `GET /api/v1/spray-diary/{task_id}` | Detailed spray record for a task |
| `GET /api/v1/spray-diary/export` | CSV/PDF export for compliance |
| `GET /api/v1/spray-diary/withholding` | Active withholding periods with countdown |

**Logic:** A "spray event" is any completed task where:
- `task_category = "vineyard"` AND template indicates spray/tractor work
- Has `TaskAsset` entries with `role = "consumable"`
- Pull in: block, weather_conditions, GPS coverage, completion date, operator

**New file:** `backend/services/spray_diary_service.py`
- Aggregates task + asset + weather + GPS data into a compliance-ready record
- Calculates withholding period expiry dates
- Validates application rates against min/max on consumable

#### Step W4.4.2: Build spray diary frontend

**New files:**
- `packages/web/src/pages/SprayDiary.jsx` — main page
- `packages/web/src/components/spray/SprayEventCard.jsx` — individual spray record
- `packages/web/src/components/spray/WithholdingTracker.jsx` — countdown display

**Implementation:**
1. Chronological list of spray events with filters (block, chemical, date range)
2. Each event: date, block, chemical + rate, weather conditions, operator, GPS coverage area
3. Withholding period tracker: countdown to safe harvest date per block
4. Organic/SWNZ compliance flags per spray event
5. Export button for regulatory submission (CSV + optional PDF)

---

### W4.5 — Asset Insights & Carbon Calculator

**What exists:** Asset model with fuel_type, fuel_efficiency, current_hours, current_kilometers. StockMovement tracks consumable usage linked to tasks.

#### Step W4.5.1: Create carbon calculation backend

**New file:** `backend/services/carbon_calculator_service.py`

**Emission factors (NZ-specific):**
```python
EMISSION_FACTORS = {
    "diesel": 2.68,     # kg CO2 per litre
    "petrol": 2.31,     # kg CO2 per litre
    "electric": 0.0,    # Zero direct emissions (grid factor applied separately)
}
```

**Calculation methods:**
- `calculate_fuel_emissions(asset_id, date_range)` — fuel consumption from stock movements × emission factor
- `calculate_equipment_hours_emissions(asset_id, date_range)` — hours × fuel efficiency × emission factor
- `calculate_gps_based_emissions(task_id)` — distance from GPS track × fuel efficiency
- `get_company_carbon_summary(company_id, date_range)` — aggregated totals

**New endpoint:** `GET /api/v1/assets/carbon-summary?start_date=&end_date=`

#### Step W4.5.2: Build asset insights frontend

**New files:**
- `packages/web/src/components/assets/CarbonDashboard.jsx` — emissions summary
- `packages/web/src/components/assets/MaintenanceCalendar.jsx` — upcoming maintenance/calibration
- `packages/web/src/components/assets/ConsumableCompliance.jsx` — certification tracking

**Modified:** `packages/web/src/pages/AssetsDashboard.jsx` — add insights tab

---

## Phase 4 Mobile

### M4.1 — Risk/Incident Reporting

**New files:**
- `packages/mobile/src/screens/risk/IncidentReportScreen.jsx`
- `packages/mobile/src/screens/risk/ActionListScreen.jsx`

**Implementation:**
1. Large "Report Incident" button on home screen
2. Form: type selector, severity, description (voice-to-text), photo (camera), GPS auto-fill
3. Uses `riskManagementService.createIncident()` from shared
4. View assigned actions list with due dates

---

### M4.2 — Asset Lookup

**New files:**
- `packages/mobile/src/screens/assets/AssetListScreen.jsx`
- `packages/mobile/src/screens/assets/AssetDetailScreen.jsx`
- `packages/mobile/src/screens/assets/LogMaintenanceScreen.jsx`

**Implementation:**
1. Searchable list of equipment and consumables
2. Tap → detail with specs, maintenance history, calibration status
3. "Log Maintenance" action → quick form with photo, notes, date
4. "Record Stock Usage" for consumables → quantity, task link

---

### M4.3 — Timesheeting

**New files:**
- `packages/mobile/src/screens/timesheets/TimesheetScreen.jsx`
- `packages/mobile/src/screens/timesheets/TimeEntryForm.jsx`

**Implementation:**
1. Day view: date selector, total hours display
2. Add entry: select task (from assigned tasks), enter hours, notes
3. Submit for approval button
4. Status indicator: draft / submitted / approved / rejected

---

### M4.4 — Visitor Check-In

**New file:** `packages/mobile/src/screens/visitors/VisitorCheckInScreen.jsx`

**Implementation:**
1. Quick registration: name, company, purpose, phone
2. Photo capture (optional ID photo)
3. Sign-in timestamp auto-set
4. Induction acknowledgement checkbox
5. Sign-out button with timestamp

---

### M4.5 — Training Viewer

**New files:**
- `packages/mobile/src/screens/training/TrainingListScreen.jsx`
- `packages/mobile/src/screens/training/SlideViewerScreen.jsx`
- `packages/mobile/src/screens/training/QuizScreen.jsx`

**Implementation:**
1. List assigned modules with progress indicator
2. Swipeable slide viewer (text, images, video playback)
3. Quiz screen: multiple choice / true-false with immediate feedback
4. Completion tracking and score display
5. Uses `trainingService` from shared

---

### M4.6 — Push Notifications

**New migration:** Add `device_tokens` table:
```
device_tokens:
  id (PK), user_id (FK users, nullable), contractor_id (FK contractors, nullable),
  expo_push_token (String, unique), platform (ios/android/web),
  device_name (String), is_active (Boolean), created_at, updated_at
```

**New file:** `backend/api/v1/device_tokens.py`
- `POST /api/v1/device-tokens` — register push token
- `DELETE /api/v1/device-tokens/{token}` — unregister

**New file:** `backend/services/push_notification_service.py`
- Uses **Expo Push API** (simplest path — no FCM/APNS setup needed, Expo handles routing)
- `send_push(user_id, title, body, data)` — looks up device token, sends via Expo
- Integrated into `NotificationService.notify()` as an additional delivery channel

**Modified:** `backend/services/notification_service.py` — after creating in-app notification, also call push service

**Mobile integration:**
- `packages/mobile/src/services/pushService.js` — register token on app launch via `expo-notifications`
- Handle incoming notifications: navigate to relevant screen using `data` payload

**Backend dependency:** `pip install exponent-server-sdk` (Expo push SDK for Python)

---

# PHASE 5 — Polish & Offline

**Prerequisite:** Phase 4 complete (mobile app has all screens, push notifications working)

---

### 5.1 — Mobile Offline Support

#### Step 5.1.1: Local database setup

**Dependencies:** `expo-sqlite`

**New files:**
- `packages/mobile/src/db/schema.js` — SQLite table definitions
- `packages/mobile/src/db/migrations.js` — local DB versioning
- `packages/mobile/src/db/index.js` — DB connection singleton

**Local tables:**
```sql
tasks (id, json_data, synced_at, dirty)
observations (id, json_data, synced_at, dirty)
gps_points (id, task_id, lat, lng, altitude, speed, timestamp, synced)
timesheets (id, json_data, synced_at, dirty)
```

#### Step 5.1.2: Sync service

**New file:** `packages/mobile/src/services/syncService.js`

**Logic:**
1. On API call: try server first, if fails (network error), queue locally with `dirty = true`
2. On reconnect (NetInfo event): POST all dirty records to server
3. Bulk sync endpoints already exist: `POST /gps/points/bulk`
4. For tasks/observations: create `POST /api/v1/sync/batch` endpoint that accepts an array of creates/updates
5. Conflict resolution: server timestamp wins (last-write-wins). Flag conflicts for user review.

**New file:** `backend/api/v1/sync.py`
- `POST /api/v1/sync/batch` — accepts `{creates: [], updates: []}` for tasks, observations, timesheets
- Returns `{synced: [], conflicts: []}` with server-side resolution

#### Step 5.1.3: Offline UI indicators

**Modified:** `packages/mobile/src/components/` — add offline banner, sync status indicators, queued items count

---

### 5.2 — Mobile Map

**Dependencies:** `react-native-maps` (or `@rnmapbox/maps` for Mapbox)

**New files:**
- `packages/mobile/src/screens/map/MapScreen.jsx`
- `packages/mobile/src/components/map/BlockOverlay.jsx`
- `packages/mobile/src/components/map/GPSTrackOverlay.jsx`

**Implementation:**
1. Vineyard block boundaries as polygons (from `blocks/geojson` endpoint)
2. Current position indicator
3. Active GPS track overlay (live drawing as points come in)
4. Tap block → popup with block info, current task status
5. Layer toggles: blocks, GPS tracks, observation spots

---

### 5.3 — Contractor Mobile Experience

**New files:**
- `packages/mobile/src/screens/contractor/ContractorHomeScreen.jsx`
- `packages/mobile/src/screens/contractor/CompanySwitcher.jsx`
- `packages/mobile/src/screens/contractor/MovementLogScreen.jsx`

**Implementation:**
1. Company switcher (top of screen) when contractor has multiple active relationships
2. Home shows: assigned tasks, required training, upcoming visits for selected company
3. Movement log: check-in/out with GPS, equipment cleaning confirmation, biosecurity acknowledgement
4. Training completion for each company's requirements

---

### 5.4 — Calendar on Mobile

**New file:** `packages/mobile/src/screens/calendar/CalendarScreen.jsx`

**Dependencies:** `react-native-calendars`

**Implementation:**
1. Month view with dot indicators for events
2. Day view: scrollable event list
3. Uses same `GET /api/v1/calendar/events` endpoint from W3.1
4. Tap event → navigate to entity detail

---

### 5.5 — Push Notifications Backend Enhancement

Already built in M4.6. This step adds:

**Preference management:**
- `PATCH /api/v1/notification-preferences` — user can toggle notification types
- Add `notification_preferences` JSON column to `users` table (Alembic migration)
- `PushNotificationService` checks preferences before sending

**Batch delivery:**
- Daily digest option: aggregate notifications and send once per day
- Configurable in user preferences

---

### 5.6 — Reporting on Mobile

**New files:**
- `packages/mobile/src/screens/reports/ReportsDashboard.jsx`
- `packages/mobile/src/components/reports/StatCard.jsx`
- `packages/mobile/src/components/reports/MiniChart.jsx`

**Implementation:**
1. Summary cards: task completion rate, hours logged this week, observation count
2. Mini charts (simplified versions of web charts)
3. Share/export button → generate shareable summary image or CSV via sharing sheet
4. Uses same `/api/v1/reports/*` endpoints from W3.5

---

### 5.7 — External Calendar Sync (iCal)

**New file:** `backend/api/v1/ical.py`

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/calendar/ical/{user_token}.ics` | Personal calendar feed (token-based, no JWT) |
| `GET /api/v1/calendar/ical/company/{company_token}.ics` | Company-wide calendar feed |

**Implementation:**
1. Generate `icalendar` format using Python `icalendar` library
2. Each event: SUMMARY, DTSTART, DTEND, DESCRIPTION, CATEGORIES, UID
3. Token-based auth (not JWT) — user generates a long-lived subscription token from settings
4. Supports `webcal://` protocol for one-click subscription
5. Cache generated .ics file for 15 minutes to reduce DB load

**Backend dependency:** `pip install icalendar`

**New migration:** Add `calendar_subscription_token` column to `users` table

**Frontend integration:**
- `packages/web/src/pages/Profile.jsx` — "Calendar Subscription" section with copy-to-clipboard URL
- `packages/mobile/src/screens/profile/ProfileScreen.jsx` — same

---

# Dependency Graph (Full)

```
Phase 2.5: Permissions Overhaul (PREREQUISITE)
│
├─→ Phase 3 Web (parallel tracks)
│   ├── W3.1 Calendar page
│   ├── W3.2 Notifications UI
│   ├── W3.3 Contractor management UI
│   ├── W3.4 GPS tracking dashboard
│   └── W3.5 Unified reporting
│       │
│       └─→ Phase 4 Web
│           ├── W4.1 Weather alerts (depends on W3.1 calendar for overlay)
│           ├── W4.2 Insights completion (independent)
│           ├── W4.3 Pro app header/footer (independent)
│           ├── W4.4 Spray diary (depends on W3.5 for export patterns)
│           └── W4.5 Asset insights / carbon calculator (independent)
│               │
│               └─→ Phase 5 Web
│                   └── 5.7 External calendar sync (depends on W3.1)
│
├─→ Phase 3 Mobile (parallel with Phase 3 Web)
│   ├── M3.1 Scaffolding (FIRST — everything depends on this)
│   ├── M3.2 Home dashboard (depends on M3.1)
│   ├── M3.3 Task list & detail (depends on M3.1)
│   ├── M3.4 Task creation (depends on M3.3)
│   ├── M3.5 GPS tracking (depends on M3.3)
│   └── M3.6 Observation capture (depends on M3.1)
│       │
│       └─→ Phase 4 Mobile
│           ├── M4.1 Risk/incident reporting (depends on M3.1)
│           ├── M4.2 Asset lookup (depends on M3.1)
│           ├── M4.3 Timesheeting (depends on M3.3)
│           ├── M4.4 Visitor check-in (depends on M3.1)
│           ├── M4.5 Training viewer (depends on M3.1)
│           └── M4.6 Push notifications (depends on M3.1)
│               │
│               └─→ Phase 5 Mobile
│                   ├── 5.1 Offline support (depends on all M3/M4 screens)
│                   ├── 5.2 Mobile map (depends on M3.5 GPS)
│                   ├── 5.3 Contractor experience (depends on M3.1 + M3.3)
│                   ├── 5.4 Calendar on mobile (depends on W3.1 backend)
│                   ├── 5.5 Push enhancements (depends on M4.6)
│                   └── 5.6 Reporting on mobile (depends on W3.5 backend)
```

---

# New File Summary (All Phases)

| Phase | New Backend Files | New Frontend Files | New Migrations |
|-------|------------------|--------------------|----------------|
| 3 Web | 4 (calendar, contractor_mgmt, reports routers + schemas) | ~18 (pages + components) | 0 |
| 3 Mobile | 0 | ~25 (full mobile app structure) | 0 |
| 4 Web | 5 (weather_alerts, insights, spray_diary routers + services) | ~12 (components) | 1 (weather_alerts table) |
| 4 Mobile | 2 (device_tokens router, push service) | ~12 (screens) | 1 (device_tokens table) |
| 5 | 3 (sync, ical routers + offline service) | ~15 (screens + components) | 2 (notification_preferences, calendar_token) |
| **Total** | **~14 new backend files** | **~82 new frontend files** | **4 migrations** |

---

# Critical Rules (Carried Forward)

1. **Backend changes must not break the live Insights app.** Public endpoints (climate, articles, research) must be regression-tested after every backend change.
2. **Shared package changes affect all three consumers.** New services in `packages/shared/` must not break existing imports in web or insights.
3. **Tenant isolation is non-negotiable.** All new endpoints must use `require_permission()` from Phase 2.5 and enforce company_id scoping.
4. **Permissions enforced at API level, not just UI.** Every new endpoint must declare its `(module, action)` permission requirement.
5. **Mobile-first for field workflows.** Observation and task capture UX optimised for one-handed phone use. Large tap targets, minimal typing, GPS/camera/voice-to-text do the heavy lifting.
6. **Alembic for all schema changes.** No manual SQL. Every migration reversible.
