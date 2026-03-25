# Grow V1 — Plan Revision 3

> **Date:** 2026-03-25
> **Status:** Updated plan reflecting completed work, strategic reorder to prioritise
> mobile app (data generation) before map intelligence and insights calculations.

---

## 1. COMPLETED WORK SUMMARY

### Phase A — Foundation (COMPLETE, 2026-03-20)
- Property/ManagementRelationship/UserPropertyScope models, migrations, services
- PropertyService, ManagementService with blockchain integration
- Admin UX Redesign, Maps V2 property integration
- 5-tier permission system (17 modules), all Phase 2.5 bugs resolved
- `verify_block_access()` unified helper, auxein_admin global visibility

### Phase B2 — Web Frontend (COMPLETE, 2026-03-20)
- Notifications (bell + dropdown + page), Calendar (month/week + multi-day bars)
- Reports (4 tabs + CSV export), GPS Track Visualization
- Task Quick Create, Quick Observation, Home Dashboard
- Full design system migration — zero hardcoded hex colours across 20+ files

### Phase B — Contractor API (PRE-EXISTING)
- 5 models, 21+ endpoints, schemas, shared service, frontend page

### Revision 2 — R1 through R8 (COMPLETE, 2026-03-25)

| Phase | What was built | Status |
|-------|---------------|--------|
| **R1** | Removed owner read-only lockout, company_admin always sees all properties, schema additions (climate_zone_id, forecast_lat/lng on Property, calendar_feed_token on User) | DONE |
| **R2** | ExternalAlias polymorphic table + CRUD endpoints + admin UI | DONE |
| **R3** | Company admin backend: timesheet summary, training summary, user property scope management, iCal feed (per-user, role-scoped, token auth), task row CRUD (list/generate/complete/skip/bulk), task reschedule endpoint | DONE |
| **R4** | Company Admin page (`/company-admin`): 10 tabs — Team, Invite, Properties, Timesheets, Training, Aliases, GrapeLink, Weather, Calendar Sync, Reports. Moved team management from Profile. Nav link for company_admin. | DONE |
| **R5** | Property scoping on Reports (property_id filter on all 8 endpoints) + Calendar (property_id filter). Property dropdown on both pages. | DONE |
| **R6** | Calendar "+" button (navigates to /tasks/new?date=), drag-and-drop reschedule (backend works, frontend drag not yet functional) | PARTIAL |
| **R7** | TaskDetail page with RowProgressPanel — row list, progress bar, generate/complete/skip/bulk actions, inline notes/quality editing. Task row API service. | DONE |
| **R8** | Property-level insights placeholder with property selector. Climate zone name display (not ID). Inline editing for forecast point + climate zone + GrapeLink IDs in Company Admin. Forecast point map picker. Home page weather widget reads property forecast point. | DONE |

### Streamlining P0-P1 (COMPLETE, 2026-03-25)

| Item | What was built |
|------|---------------|
| **P0: Task completion → stock deduction** | `GET /tasks/{id}/consumables` returns consumables with planned qty. `POST /tasks/{id}/complete` accepts `consumable_actuals` — auto-creates StockMovement per consumable, deducts Asset.current_stock. Frontend: completion modal with actual quantity inputs + batch number. |
| **P1: Pre-task equipment check** | `GET /tasks/{id}/equipment-check` returns calibration status per asset. `POST /tasks/{id}/start` checks calibration, blocks if overdue (409 with override option). Auto-timestamps pre_task_check on start. Frontend: equipment check modal with override. |

---

## 2. STRATEGIC ASSESSMENT — WHAT COMES NEXT

### The Data Generation Gap

The map intelligence layers (C1-C4) and insights calculations all depend on having **real operational data**:

| Intelligence Feature | Data Required | Where Data is Generated |
|---------------------|---------------|------------------------|
| Disease pressure heatmap | Observation runs with disease scores per block | **Field observation capture** (mobile) |
| Phenology stage layer | Observation runs using phenology templates | **Field observation capture** (mobile) |
| Spray efficiency heatmap | GPS tracks during spray tasks + calibration | **GPS tracking during task execution** (mobile) |
| Weather station layer | Station data already ingested (Harvest API) | Automated — no gap |
| Yield estimation | Bud/flower/bunch count observations over season | **Repeated field observations** (mobile) |
| Current season insights | Weather station data + observation triggers | Mixed — station data automated, observations manual |

**Key insight:** 5 of 6 intelligence features need observation and task data that is primarily captured by field workers on mobile devices. The web UI has management/reporting UX, but the **data input happens in the field on phones**. Without the mobile app, we can build the calculation pipelines and map layers, but they'll have no data to visualize.

### Recommended Build Order (Revised)

```
Phase M: Mobile App (data generation)
  ├── Auth, navigation, offline-ready architecture
  ├── Task execution (start, row completion, GPS tracking, consumable confirmation)
  ├── Observation capture (quick obs, planned obs, photo/GPS per spot)
  └── Push notifications (device token, Expo push)
       │
       ▼ (data now flowing from field)
Phase I: Insights Calculations (data processing)
  ├── Disease model pipeline (obs data → disease_pressure table)
  ├── Phenology estimation pipeline (obs data → phenology_estimates)
  ├── Spray efficiency calculation (GPS tracks → coverage metrics)
  └── Yield estimation pipeline (bud→flower→bunch aggregation)
       │
       ▼ (calculations producing map-ready data)
Phase C: Map Intelligence Layers (visualization)
  ├── Disease pressure heatmap
  ├── Phenology stage choropleth
  ├── Spray efficiency heatmap
  ├── Weather station live conditions
  └── Map export, import, saved settings
       │
       ▼
Phase D-F: Intelligence, Integrations, Polish
```

### Why Mobile First Makes Sense

1. **Unblocks everything downstream** — observations and task GPS data feed disease models, phenology estimates, spray efficiency, and yield pipelines
2. **Row task management is mobile-primary** — we built the backend (R3/R7) and web reporting UI, but the core data input flow is a field worker tapping rows complete on their phone
3. **Stock deduction flow (P0) works end-to-end** — mobile task completion triggers auto stock deduction
4. **Equipment checks (P1) work end-to-end** — mobile task start shows calibration warnings
5. **iCal feeds (R3)** — already built, mobile users subscribe from their phone calendar app
6. **The web app is management/reporting complete** — company admins have everything they need. The gap is field worker input.

---

## 3. PHASE M: MOBILE APP BUILD

### M1: Foundation (5-7 days)
```
M1.1  Expo/React Native project setup (already scaffolded at packages/mobile/)
M1.2  Auth flow — JWT login, token storage (SecureStore), auto-refresh
M1.3  Navigation — bottom tabs (Home, Tasks, Observations, Profile)
M1.4  Shared API service integration (reuse packages/shared/src/api/)
M1.5  Offline queue architecture (AsyncStorage, sync on reconnect)
M1.6  Push notification setup (Expo Push, device token model + registration endpoint)
```

### M2: Task Execution (7-10 days)
```
M2.1  Task list — assigned tasks for current user, filterable by status
M2.2  Task detail — info card, status, block, priority, assignees
M2.3  Start task flow — equipment check modal (P1), GPS tracking start
M2.4  Row completion — touch-optimized row list, tap/swipe to complete, GPS auto-tag per row
M2.5  Complete task flow — consumable actuals confirmation (P0), completion notes, photos
M2.6  GPS tracking — background location, speed/distance, auto-pause on stationary
M2.7  Offline task queue — complete rows/tasks offline, sync when reconnected
```

### M3: Observation Capture (5-7 days)
```
M3.1  Quick observation — template picker (5 categories), block picker, 2-step flow
M3.2  Planned observation — view assigned plans, start run, capture spots
M3.3  Spot capture — dynamic form fields from template, GPS auto-fill, camera prominent
M3.4  Photo/video attachment — camera capture, gallery pick, compressed upload
M3.5  Ad-hoc observation — free-form with photo + notes + GPS
M3.6  Offline observation queue — capture spots offline, upload when reconnected
```

### M4: Supporting Features (3-5 days)
```
M4.1  Home dashboard — upcoming tasks, notification count, weather widget
M4.2  Profile — user info, calendar feed URL, change password
M4.3  Push notifications — receive task assignments, completions, overdue alerts
M4.4  Timesheet entry — log hours against tasks from mobile
```

### M5: Polish (2-3 days)
```
M5.1  Loading states, error handling, retry logic
M5.2  App icon, splash screen, Auxein branding
M5.3  TestFlight/internal distribution build
```

**Total estimate: ~22-32 working days**

---

## 4. PHASE I: INSIGHTS CALCULATIONS

These are backend-only data processing pipelines. They run on ingested weather data + observation/task data generated by the mobile app.

### I1: Disease Model Pipeline (3-5 days)
```
I1.1  Wire observation disease scores → disease_pressure table (per block per day)
I1.2  UC Davis Powdery Mildew Index — already implemented, needs observation trigger wiring
I1.3  González-Domínguez Botrytis model — already implemented, needs wiring
I1.4  Downy Mildew primary infection — already implemented, needs wiring
I1.5  Background job: daily disease pressure recalculation per zone
```

### I2: Phenology Estimation Pipeline (3-4 days)
```
I2.1  Wire phenology observation templates → phenology_estimates table
I2.2  GDD-based stage estimation (already exists, needs per-property resolution)
I2.3  Variety-specific harvest date prediction refinement from observation data
I2.4  Property-level phenology timeline aggregation
```

### I3: Spray Efficiency Calculation (2-3 days)
```
I3.1  Aggregate GPS tracks per spray task → coverage area
I3.2  Compare planned area vs actual covered area
I3.3  Link calibration data → actual application rate vs target
I3.4  Store spray efficiency scores per block per task
```

### I4: Yield Estimation Pipeline (2-3 days)
```
I4.1  Aggregate bud count → flower count → bunch count observations per block
I4.2  Progressive yield estimate (tonnes/ha) at each phenology stage
I4.3  Block-level and property-level rollup
```

**Total estimate: ~10-15 working days**

---

## 5. PHASE C: MAP INTELLIGENCE LAYERS (post-Phase I)

With calculation pipelines producing data, the map layers become visualization work:

```
C1.  Disease pressure heatmap — GeoJSON from disease_pressure table, Mapbox heatmap layer
C2.  Phenology stage choropleth — GeoJSON from phenology_estimates, colour-coded blocks
C3.  Weather station live conditions — marker layer with current readings from station data
C4.  Spray efficiency heatmap — GPS track overlay + coverage rating per block
C5.  Map export to PDF/image — canvas capture (html2canvas or Mapbox getCanvas())
C6.  Custom GeoJSON/KML/CSV import — file upload, parse, preview, persist
C7.  Map settings save to backend — map config model, user-scoped CRUD
```

**Total estimate: ~12-18 working days**

---

## 6. REMAINING PHASES D-F

### Phase D: Intelligence & Automation (post-Phase C)
- Calendar aggregated endpoint (obs plans, maintenance, training)
- Spray interval tracker per block/product
- Rule-based auto-task generation (disease + phenology triggers)
- Observation → risk escalation / task trigger automation
- Notification preferences model + per-user filtering
- Weather alert rule engine

### Phase E: Integrations & Compliance
- GrapeLink export file (per-property, property-scoped credentials)
- ACVM chemical database (source data, import/cache, lookup)
- Frost risk model (predictive, topographically adjusted)
- Operational reporting — CSV export framework

### Phase F: Polish
- Mobile offline mode refinement
- External calendar sync (iCal → currently one-way, could add import)
- VMC portfolio dashboard
- Guided onboarding wizard

---

## 7. DEFERRED ITEMS (come back later)

| Item | Why Deferred | When to Revisit |
|------|-------------|-----------------|
| Streamlining P2 (obs template on task complete, obs→task auto-link, user templates) | Valuable but not blocking mobile or map layers | After Phase I, before Phase D |
| Calendar drag-and-drop | Frontend drag not working, backend endpoint ready | Debug session — CSS/event issue |
| Company creation UX (email + password) | No new companies being created yet | Before first external customer |
| Backfill migration (004) | No real production users | Before go-live |
| Maps V2 admin tab (bulk assignment) | Admin can assign via property forms | Phase C timeframe |
| Climate endpoint access patterns (9 endpoints) | Functional but fragile post-fetch checks | Phase I timeframe |
| Metservice API integration | Current sources (Harvest/ECAN/HBRC) sufficient | v1.x |
| Soil moisture / ETc | Data availability unconfirmed from Harvest | v1.x |
| Full PDF/Excel reporting | CSV covers v1 compliance needs | v1.x |
| S-Map soil reference data | Data license dependent | v1.x |

---

## 8. GRAND TIMELINE

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| **M: Mobile App** | 22-32 days | None — ready to start |
| **I: Insights Calculations** | 10-15 days | M (needs observation + task data) |
| **C: Map Intelligence** | 12-18 days | I (needs calculated data) |
| **D: Intelligence & Automation** | 10-15 days | C (map context), I (pipelines) |
| **E: Integrations** | 10-15 days | Independent |
| **F: Polish** | 5-10 days | All above |
| **Total remaining** | **~70-105 working days** | |

The critical path is: **M → I → C → D**. Phase E can run in parallel with C/D.
