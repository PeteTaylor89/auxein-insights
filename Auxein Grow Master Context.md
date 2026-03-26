# Auxein Grow — Master Context Document
### For Claude Code Execution
 
> **Version:** 1.0 — Consolidated 2026-03-27
> **Supersedes:** `GROW_V1_BUILD_PLAN.md`, `GROW_V1_PLAN.md`, `GROW_V1_PLAN_REVISION_2.md`,
> `GROW_V1_PLAN_REVISION_3.md`, `PHASES_3_4_5_IMPLEMENTATION_PLAN.md`,
> `Tasks-Observations-Streamlining-Report.md`, `Auxein_Grow_-_As_Built_Operations_Guide.md`,
> `MOBILE_BUNDLING_BUG.md`
>
> **Codebase baseline:** 62 tables · ~600 endpoints · 57 Alembic migrations
> **Current Alembic head:** `r2_external_aliases` (2026-03-25)
 
---
 
## PART 1 — NON-NEGOTIABLE ARCHITECTURE RULES
 
Apply these to every task without exception.
 
**R1. Do not break the live Insights app.**
`insights.auxein.co.nz` is in production. After every backend change, regression-test:
- `GET /api/v1/public/climate/*` (public climate endpoints)
- `GET /api/auth/` (auth flow)
- `GET /api/v1/gis/geojson` and `GET /api/v1/regions/geojson` (dual-auth endpoints)
 
**R2. One backend, three consumers.**
FastAPI on AWS EB serves: Pro web app (port 5173), Regional Insights (port 5174 / insights.auxein.co.nz), and mobile (React Native/Expo). Changes to `packages/shared/` affect all three. Test all three consumers after shared package changes.
 
**R3. Alembic only.**
No raw `ALTER TABLE`. Every schema change = one Alembic revision with a descriptive slug. Run `alembic upgrade head` and verify on staging before prod.
 
**R4. `require_permission()` on every new endpoint.**
Use `require_permission(module, action)` from `core/permissions.py` on every new route. Never rely on frontend role checks for data access.
 
**R5. `company_id` on `VineyardBlock` is a denormalised sync field.**
It must always equal the `managing_company_id` of the property's active `ManagementRelationship`. All writes to `management_relationships` must trigger the sync. Never update `company_id` on a block directly in isolation.
 
**R6. No scope creep.**
Features in the BACKLOG section do not get built now. Mark relevant code with `# TODO v1.x: <description>`.
 
**R7. Clean up tech debt in context.**
When working in or near a file that contains known tech debt (see Appendix), fix it. Do not create new instances of the same debt.
 
**R8. Test at every phase gate.**
No phase is complete until its phase gate test checklist passes AND the Regional Insights regression suite passes. Do not begin the next phase until the gate is green.
 
---
 
## PART 2 — INFRASTRUCTURE REFERENCE
 
| Component | Detail |
|---|---|
| Backend | FastAPI on AWS Elastic Beanstalk (api.auxein.co.nz), t3.micro, Gunicorn+Uvicorn |
| Database | PostgreSQL + PostGIS on AWS RDS, ap-southeast-2 |
| Frontend — Pro web | React + Vite on S3 + CloudFront, port 5173 local |
| Frontend — Insights | React + Vite on S3 + CloudFront (insights.auxein.co.nz), port 5174 local |
| Mobile | React Native / Expo — packages/mobile/ (Phase M, active build) |
| Email | Gmail SMTP via UnifiedEmailService |
| File storage | Local disk on EB instance, company-scoped paths |
| Images | AWS S3 |
| CI/CD | GitHub Actions — daily climate (05:00 UTC), weather ingestion (every 6h) |
| Weather sources | Harvest Electronics (10-min), ECAN (hourly), HBRC (hourly) |
| Mapping | Mapbox GL JS |
 
---
 
## PART 3 — PLATFORM OVERVIEW & PERMISSIONS
 
### Key Concepts
 
| Concept | Description |
|---------|-------------|
| **Company** | A tenant organisation (vineyard, wine company, management company) |
| **Property** | A physical land holding owned by a company |
| **Block** | A vineyard block within a property (has geometry, variety, rootstock, etc.) |
| **User** | A person with login access, always linked to exactly one company |
| **Contractor** | An external service provider who can work across multiple companies |
| **Management Relationship** | A link where one company manages another company's property |
 
### 5-Tier Permission Hierarchy
 
```
Auxein Admin          ← Auxein staff only. Full system access.
  └── Company Admin   ← Company owner/director. Full company access.
      └── Company Manager  ← Supervisors. Operational access, no user/property management.
          └── Company User     ← Field staff. View + create observations/tasks.
              └── Contractor       ← External. Assigned work only.
```
 
| Capability | Auxein Admin | Company Admin | Manager | User | Contractor |
|-----------|:-:|:-:|:-:|:-:|:-:|
| System admin panel | Yes | — | — | — | — |
| Create/edit properties | Yes | Yes | — | — | — |
| Create/edit blocks | Yes | Yes | — | — | — |
| Invite users | Yes | Yes | — | — | — |
| Create tasks | Yes | Yes | Yes | — | — |
| Complete tasks | Yes | Yes | Yes | If assigned | If assigned |
| Create observations | Yes | Yes | Yes | Yes | Yes |
| Submit timesheets | — | — | — | Yes | Yes |
 
---
 
## PART 4 — COMPLETED WORK
 
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
 
| Item | What was built | Status |
|------|---------------|--------|
| **R1** | Removed owner read-only lockout; company_admin always sees all properties; schema additions (climate_zone_id, forecast_lat/lng on Property, calendar_feed_token on User) | DONE |
| **R2** | ExternalAlias polymorphic table + CRUD endpoints + admin UI | DONE |
| **R3** | Company admin backend: timesheet summary, training summary, user property scope management, iCal feed (per-user, role-scoped, token auth), task row CRUD (list/generate/complete/skip/bulk), task reschedule endpoint | DONE |
| **R4** | Company Admin page (`/company-admin`): 10 tabs — Team, Invite, Properties, Timesheets, Training, Aliases, GrapeLink, Weather, Calendar Sync, Reports. Nav link for company_admin. | DONE |
| **R5** | Property scoping on Reports (property_id filter on all 8 endpoints) + Calendar (property_id filter). Property dropdown on both pages. | DONE |
| **R6** | Calendar "+" button (navigates to /tasks/new?date=), drag-and-drop reschedule — **backend ready, frontend drag not yet functional** | PARTIAL |
| **R7** | TaskDetail page with RowProgressPanel — row list, progress bar, generate/complete/skip/bulk actions, inline notes/quality editing. Task row API service. | DONE |
| **R8** | Property-level insights placeholder with property selector. Climate zone name display. Inline editing for forecast point + climate zone + GrapeLink IDs in Company Admin. Forecast point map picker. Home page weather widget reads property forecast point. | DONE |
 
### Streamlining P0–P1 (COMPLETE, 2026-03-25)
 
| Item | What was built |
|------|---------------|
| **P0: Task completion → stock deduction** | `GET /tasks/{id}/consumables` returns consumables with planned qty. `POST /tasks/{id}/complete` accepts `consumable_actuals` — auto-creates StockMovement per consumable, deducts Asset.current_stock. Frontend: completion modal with actual quantity inputs + batch number. |
| **P1: Pre-task equipment check** | `GET /tasks/{id}/equipment-check` returns calibration status per asset. `POST /tasks/{id}/start` checks calibration, blocks if overdue (409 with override option). Auto-timestamps pre_task_check on start. Frontend: equipment check modal with override. |
 
---
 
## PART 5 — CURRENT BLOCKER: MOBILE BUNDLING BUG
 
**Status:** OPEN — Blocker for Phase M1
**Severity:** Must resolve before any mobile work can proceed
 
### Problem
The Expo/React Native app bundles successfully (973–1016 modules) but crashes at runtime:
```
ERROR [TypeError: Cannot read property 'S' of undefined]
ERROR [TypeError: Cannot read property 'default' of undefined]
```
 
### Root Cause
`@vineyard/shared` is pulled into the metro bundle via npm workspace hoisting, despite no direct imports from mobile source files. The shared package contains web-only code that crashes in React Native:
- `import.meta.env` (Vite-only)
- `localStorage` references
- `react-router-dom` import in `AuthContext.jsx`
- `window.location` references
 
### What Was Tried (already done, do not repeat)
1. `babel-preset-expo unstable_transformImportMeta` — fixed syntax error, runtime values still undefined
2. Safe localStorage wrapper (try/catch) in shared `api.js`
3. Safe `import.meta.env` guards
4. Mobile-specific `api.js` using `expo-secure-store`
5. `initMobileApi()` to patch shared axios instance — failed (axios interceptor internals are minified)
6. Separate mobile services file — all mobile screens import from local services, zero `@vineyard/shared` imports in mobile source
7. Removed `@vineyard/shared` from mobile `package.json` — still being resolved
8. Stripped `metro.config.js` watchFolders — still being resolved
 
### Recommended Resolution Steps (try in order)
1. **Confirm workspace hoisting:** Run `npm ls @vineyard/shared` from `packages/mobile/` to see resolution path
2. **Metro blockList:** In `metro.config.js`, add:
   ```js
   config.resolver.blockList = [/packages\/shared\/.*/];
   ```
3. **Check for transitive imports:** Run metro with `--verbose` to inspect full module graph
4. **Eject from workspaces:** Add mobile to root `package.json` `workspaces.nohoist` or move outside workspace scope
5. **Nuclear option:** Create fresh Expo project outside monorepo, copy mobile source files, install deps independently
 
### Environment
- Expo SDK 54 (upgraded from 53), React 19.1.0, React Native 0.81.5
- Node 20.x, npm workspaces, Windows 10, tested on iOS via Expo Go
 
---
 
## PART 6 — BUILD PLAN: WHAT COMES NEXT
 
### Strategic Rationale (Mobile First)
 
The map intelligence layers and insights calculations depend on real operational data that is primarily captured by field workers on mobile devices. Building map layers before the mobile app produces no visualisable data. The revised build order is:
 
```
Phase M: Mobile App (data generation)
       │
       ▼ (data now flowing from field)
Phase I: Insights Calculations (data processing)
       │
       ▼ (calculations producing map-ready data)
Phase C: Map Intelligence Layers (visualization)
       │
       ▼
Phase D–F: Intelligence, Integrations, Polish
```
 
Phase E (Integrations) can run in parallel with C/D.
 
---
 
### Phase M — Mobile App (~22–32 working days)
**Status: BLOCKED on bundling bug above. Ready to start once resolved.**
 
#### M1: Foundation (5–7 days)
```
M1.1  Expo/React Native project setup (already scaffolded at packages/mobile/)
M1.2  Auth flow — JWT login, token storage (SecureStore), auto-refresh
M1.3  Navigation — bottom tabs (Home, Tasks, Observations, Profile)
M1.4  Shared API service integration (reuse packages/shared/src/api/ OR local services workaround)
M1.5  Offline queue architecture (AsyncStorage, sync on reconnect)
M1.6  Push notification setup (Expo Push, device token model + registration endpoint)
```
 
#### M2: Task Execution (7–10 days)
```
M2.1  Task list — assigned tasks for current user, filterable by status
M2.2  Task detail — info card, status, block, priority, assignees
M2.3  Start task flow — equipment check modal (P1), GPS tracking start
M2.4  Row completion — touch-optimized row list, tap/swipe to complete, GPS auto-tag per row
M2.5  Complete task flow — consumable actuals confirmation (P0), completion notes, photos
M2.6  GPS tracking — background location, speed/distance, auto-pause on stationary
M2.7  Offline task queue — complete rows/tasks offline, sync when reconnected
```
 
#### M3: Observation Capture (5–7 days)
```
M3.1  Quick observation — template picker (5 categories), block picker, 2-step flow
M3.2  Planned observation — view assigned plans, start run, capture spots
M3.3  Spot capture — dynamic form fields from template, GPS auto-fill, camera prominent
M3.4  Photo/video attachment — camera capture, gallery pick, compressed upload
M3.5  Ad-hoc observation — free-form with photo + notes + GPS
M3.6  Offline observation queue — capture spots offline, upload when reconnected
```
 
#### M4: Supporting Features (3–5 days)
```
M4.1  Home dashboard — upcoming tasks, notification count, weather widget
M4.2  Profile — user info, calendar feed URL, change password
M4.3  Push notifications — receive task assignments, completions, overdue alerts
M4.4  Timesheet entry — log hours against tasks from mobile
```
 
#### M5: Polish (2–3 days)
```
M5.1  Loading states, error handling, retry logic
M5.2  App icon, splash screen, Auxein branding
M5.3  TestFlight/internal distribution build
```
 
---
 
### Phase I — Insights Calculations (~10–15 working days)
**Dependency: Phase M (needs observation + task data flowing)**
 
These are backend-only data processing pipelines. They wire already-implemented models to the observation/task data generated by the mobile app.
 
#### I1: Disease Model Pipeline (3–5 days)
```
I1.1  Wire observation disease scores → disease_pressure table (per block per day)
I1.2  UC Davis Powdery Mildew Index — already implemented, needs observation trigger wiring
I1.3  González-Domínguez Botrytis model — already implemented, needs wiring
I1.4  Downy Mildew primary infection — already implemented, needs wiring
I1.5  Background job: daily disease pressure recalculation per zone
```
 
#### I2: Phenology Estimation Pipeline (3–4 days)
```
I2.1  Wire phenology observation templates → phenology_estimates table
I2.2  GDD-based stage estimation (already exists, needs per-property resolution)
I2.3  Variety-specific harvest date prediction refinement from observation data
I2.4  Property-level phenology timeline aggregation
```
 
#### I3: Spray Efficiency Calculation (2–3 days)
```
I3.1  Aggregate GPS tracks per spray task → coverage area
I3.2  Compare planned area vs actual covered area
I3.3  Link calibration data → actual application rate vs target
I3.4  Store spray efficiency scores per block per task
```
 
#### I4: Yield Estimation Pipeline (2–3 days)
```
I4.1  Aggregate bud count → flower count → bunch count observations per block
I4.2  Progressive yield estimate (tonnes/ha) at each phenology stage
I4.3  Block-level and property-level rollup
```
 
---
 
### Phase C — Map Intelligence Layers (~12–18 working days)
**Dependency: Phase I (needs calculated data)**
 
```
C1.  Disease pressure heatmap — GeoJSON from disease_pressure table, Mapbox heatmap layer
C2.  Phenology stage choropleth — GeoJSON from phenology_estimates, colour-coded blocks
C3.  Weather station live conditions — marker layer with current readings from station data
C4.  Spray efficiency heatmap — GPS track overlay + coverage rating per block
C5.  Map export to PDF/image — canvas capture (html2canvas or Mapbox getCanvas())
C6.  Custom GeoJSON/KML/CSV import — file upload, parse, preview, persist
C7.  Map settings save to backend — map config model, user-scoped CRUD
```
 
---
 
### Phase D — Intelligence & Automation (~10–15 working days)
**Dependency: Phase C (map context), Phase I (pipelines)**
 
```
D1.  Calendar aggregated endpoint (obs plans, maintenance, training)
D2.  Spray interval tracker per block/product
D3.  Rule-based auto-task generation (disease + phenology triggers)
D4.  Observation → risk escalation / task trigger automation
D5.  Notification preferences model + per-user filtering
D6.  Weather alert rule engine
```
 
---
 
### Phase E — Integrations & Compliance (~10–15 working days)
**Can run in parallel with C/D**
 
```
E1.  GrapeLink export file (per-property, property-scoped credentials)
E2.  ACVM chemical database (source data, import/cache, lookup)
E3.  Frost risk model (predictive, topographically adjusted)
E4.  Operational reporting — CSV export framework
```
 
---
 
### Phase F — Polish (~5–10 working days)
 
```
F1.  Mobile offline mode refinement
F2.  External calendar sync (iCal → two-way import if viable)
F3.  VMC portfolio dashboard
F4.  Guided onboarding wizard
```
 
---
 
### Grand Timeline
 
| Phase | Duration | Dependencies |
|-------|----------|-------------|
| **M: Mobile App** | 22–32 days | Blocked on bundling bug |
| **I: Insights Calculations** | 10–15 days | M complete |
| **C: Map Intelligence** | 12–18 days | I complete |
| **D: Intelligence & Automation** | 10–15 days | C + I |
| **E: Integrations** | 10–15 days | Independent (parallel with C/D) |
| **F: Polish** | 5–10 days | All above |
| **Total remaining** | **~70–105 working days** | |
 
**Critical path: M → I → C → D**
 
---
 
## PART 7 — INSIGHTS SCOPE (Full Product Specification)
 
This section captures the complete intended scope of the Insights feature set for v1 and planned extensions.
 
### 7.1 Insights Hierarchy
 
Insights are presented at three levels: **Company**, **Property**, and **Block**. Each level aggregates from the level below. The primary data source falls back gracefully: property-level Harvest station data → regional climate fallback from the Regional Insights platform.
 
### 7.2 Current Season
 
- Harvest station data aggregated to property level (temperature, rainfall, GDD accumulation, humidity, wind)
- Fallback to regional insights data when no station is assigned to the property
- Displayed as a season-to-date summary with time-series charts
 
### 7.3 Phenology
 
**Modelled baseline:**
- Harvest station aggregation to property and variety/clone level
- GDD-based stage estimation using existing GFV/GSR models
- Fallback to regional insights when no station data available
- Clone-level resolution is V2 (data availability dependent)
 
**Observation-based overlay:**
- Block-level phenology stage derived from ObservationRun data using Phenology (EL Stages) template
- Where multiple blocks differ in phenology stage, visualised as a block-level choropleth heatmap
- Noting that different clones within a block may have different timing — clone heatmap is V2 when sufficient observation data exists
 
### 7.4 Climate History
 
- Property-specific historical climate data (Harvest station long-term records)
- Fallback to regional insights historical data
- Key indices: growing degree days, frost days, rainfall total, heat accumulation by season
 
### 7.5 Climate Projections
 
- Property-specific projections (downscaled from NZ regional climate models where available)
- Fallback to regional projections from the Regional Insights platform
- RCP 4.5 and RCP 8.5 scenarios
 
### 7.6 Disease Pressure
 
**Modelled baseline:**
- Harvest station aggregation to property level (hourly temp + humidity → model inputs)
- Three implemented models, needing wiring to observation trigger (Phase I):
  - UC Davis Powdery Mildew Risk Index
  - González-Domínguez Botrytis Risk Model
  - 3-10 Rule / Goidanich Index for Downy Mildew primary infection
- Fallback to regional insights when no station assigned
 
**Observation and spray overlay (decision assist, not decision giving):**
- Disease observation heatmaps derived from Pests & Diseases and Vine Health observation templates
- Spray coverage heatmaps from GPS-tracked spray tasks (calculated in Phase I3)
- Displayed together as a data overlay to assist the grower in interpreting modelled risk alongside actual field evidence and spray history
 
### 7.7 Yield Estimation and Harvest Tracker
 
**Yield estimation (observation-driven):**
- Progressive yield calculation through the season using three observation templates:
  - Bud Count (Post-pruning) → clusters per vine estimate
  - Flower Count / Fruit Set → fruit set correction
  - Yield Estimation (Pre- and Post-veraison) → bunch weight estimate
- Result: tonnes/ha estimate at block level with confidence interval
- Visualised as block-level heatmaps and progressive season graphs
- Calculated in Phase I4
 
**Harvest tracker:**
- Brix, TA, pH readings from On-Site Lab Sampling and External Lab Sampling observation templates
- Time-series graphs of ripening progression per block
- Block-level heatmaps showing ripeness variation across the property
- External lab results (Hill Labs / Eurofins) — lab API integration is V2; manual entry from External Lab Sampling template is V1
 
### 7.8 GPS Track Intelligence
 
GPS tracks are captured during task execution (Phase M2.6). Two derived outputs:
 
**Spray coverage heatmap:**
- Path within block polygon = spraying; path outside = transit (excluded)
- Calibration rate × speed interpolated to a raster grid
- Presented as two formats:
  1. Actual application rate (L/ha or kg/ha) as a continuous raster
  2. Deviation from target rate (over/under application) as a diverging colour scale
- Calculated in Phase I3
 
**Track breadcrumb / path visualisation:**
- All GPS paths driven displayed as linestrings on the map
- Colour-coded by task type or operator
- Filter by date range, task type, operator
 
### 7.9 Biosecurity
 
- Observations captured in field using Biosecurity observation template (4 fields)
- Data captured for movement tracing: who, what, when, where
- Displayed as an audit trail for biosecurity events at block and property level
- Full national/regional alert ingestion is V2
 
### 7.10 Blockchain — Chain of Custody
 
- Block-level key data capture displayed as a chain of custody record
- Linked to ManagementService blockchain integration (built in Phase A)
- Displays signed data events: task completions, chemical applications, harvest records
 
### 7.11 Industry Insights
 
- Data feeds from the Regional Insights platform (insights.auxein.co.nz)
- Region-level climate and phenology context surfaced within the Grow platform
- Positions the grower's property performance relative to the regional average
 
---
 
## PART 8 — REPORTING SCOPE
 
Export and display layer — by Property.
 
| Report | Content | Format |
|--------|---------|--------|
| Tasks | Task list with status, assignees, completion dates, consumables used | CSV (V1), PDF (V2) |
| Observations | Observation runs and spot data by block, date, template | CSV (V1) |
| Assets | Asset register, calibration history, stock movements | CSV (V1) |
| Risks | Risk register with status, mitigation actions | CSV (V1) |
| Incidents | Incident log with date, type, block, description | CSV (V1) |
| Hours / Timesheets | Hours by user, task, date range | CSV (V1) |
 
Property-level filter already built (R5). Timesheet summary already in Company Admin (R3). Full PDF/Excel reporting is deferred to v1.x.
 
---
 
## PART 9 — TASK/OBSERVATION/ASSET ARCHITECTURE
 
### The Core Data Pipeline
 
```
TaskTemplate
  ├── required_equipment_ids: [sprayer_id, tractor_id]
  └── required_consumables: [{asset_id, rate_per_hectare, unit}]
        │
        ▼
Task (created from template)
  └── TaskAsset (per asset)
        ├── planned_quantity
        ├── requires_calibration
        │         │
        │    [Task execution — P1: equipment check on start]
        │         │
        ├── actual_quantity
        ├── batch_number
        └── actual_cost
              │
              ▼ [P0: auto-triggered on completion]
StockMovement
  ├── movement_type: "usage"
  ├── quantity: -actual_quantity
  ├── task_id, block_id
  ├── usage_rate, area_treated
  └── stock_before / stock_after
              │
              ▼
Asset.current_stock (auto-updated)
```
 
### 16 Global Observation Templates
 
| Template | Type |
|----------|------|
| Phenology (EL Stages) | phenology |
| Bud Count (Post-pruning) | bud_count |
| Bunch Count (per vine) | bud_count |
| Flower Count / Fruit Set | flower_count |
| Yield Estimation (Pre-veraison) | yield |
| Yield Estimation (Post-veraison) | yield |
| On-Site Lab Sampling | lab_sampling |
| External Lab Sampling | lab_sampling |
| Growth / Canopy | growth |
| Vine Health | disease |
| Pests & Diseases | disease |
| Beneficial Species | pest |
| Biosecurity | biosecurity |
| Land Management | land_management |
| Frost Event | weather |
| Free-form Observation | other |
 
### Quick Observation Flow (built in Phase B2)
ObservationRun supports `plan_id = NULL`. Quick Observation bypasses the plan entirely: pick template → pick block → record spot (auto-GPS, camera prominent) → save.
 
### Streamlining P2 (deferred — see Part 10)
 
---
 
## PART 10 — DEFERRED ITEMS
 
### Deferred to after Phase I (before Phase D)
| Item | Why deferred |
|------|-------------|
| P2: Observation template on task complete (auto-link obs to task completion) | Valuable but not blocking mobile or map layers |
| P2: Obs → task auto-link | As above |
| P2: User-defined custom templates | As above |
| Calendar drag-and-drop (frontend) | Backend endpoint ready; frontend drag CSS/event issue; debug session needed |
 
### Deferred to Phase C timeframe
| Item | Why deferred |
|------|-------------|
| Maps V2 admin tab (bulk assignment) | Admin can assign via property forms |
| Climate endpoint access patterns (9 endpoints) | Functional but fragile post-fetch checks |
 
### Deferred to v1.x
| Item | Note |
|------|------|
| Company creation UX (email + password) | No new companies being created yet |
| Backfill migration (004) | No real production users |
| Metservice API integration | Current sources sufficient |
| Soil moisture / ETc | Data availability unconfirmed |
| Full PDF/Excel reporting | CSV covers v1 compliance needs |
| S-Map soil reference data | Data licence dependent |
| GrapeLink full API push | Export file (CSV) is v1 sufficient |
| Push notifications | Requires Phase M completion |
| Voice-to-text in observations | Mobile and Web Speech API dependency |
| NDVI / vine health layer | Sentinel ESA free tier — post-v1 |
| Carbon reporting | Calculation layer on top of v1 data capture |
| Data import wizard | CSV migration from Vinman / Cropsy |
 
### Deferred to v2
| Item | Note |
|------|------|
| AI-assisted task suggestions | — |
| Ferment data handoff (Fruit Intake Package) | At harvest completion |
| Lab API integrations (Hill Labs, Eurofins) | — |
| Clone-level phenology heatmaps | Data availability dependent |
| Full biosecurity with national alert ingestion | — |
 
---
 
## PART 11 — TESTING STRATEGY
 
### Regional Insights Regression Checklist (run at every phase gate)
 
| # | Test | Method | Expected |
|---|------|--------|----------|
| IR-1 | Public climate endpoints | `GET /api/v1/public/climate/regions` | 200, returns region list |
| IR-2 | Public climate detail | `GET /api/v1/public/climate/marlborough` | 200, returns climate data |
| IR-3 | Public auth flow | `POST /api/auth/public/register` then login | 201 then 200 with JWT |
| IR-4 | Existing user login | `POST /api/auth/public/login` | 200 with JWT |
| IR-5 | Dual-auth GeoJSON (anon) | `GET /api/v1/gis/geojson` (no auth) | 200, public features |
| IR-6 | Dual-auth GeoJSON (authed) | `GET /api/v1/gis/geojson` (with JWT) | 200, enriched features |
| IR-7 | Regions GeoJSON | `GET /api/v1/regions/geojson` | 200, valid FeatureCollection |
| IR-8 | Articles list | `GET /api/v1/public/articles` | 200, array |
| IR-9 | Article detail + SEO | `GET /api/v1/public/articles/{slug}` | 200, includes `meta_title`, `meta_description` |
| IR-10 | Insights frontend loads | Browse `http://localhost:5174/` | Renders, no console errors |
| IR-11 | Insights article page | Browse `http://localhost:5174/articles/{slug}` | Renders with correct meta tags |
| IR-12 | Insights region page | Browse `http://localhost:5174/regions/{region}` | Renders with climate data |
| IR-13 | Shared package integrity | `npm run build` in `packages/insights/` | Zero errors |
 
---
 
## PART 12 — KNOWN TECH DEBT
 
Address in context when working in nearby files. Do not create new instances.
 
| Item | Location | Fix |
|---|---|---|
| Hardcoded SECRET_KEY | `public_security.py` | Env var requirement at startup |
| Backup files in repo | `email_utils - Copy.py`, `email_service - Copy.py` | Delete |
| DEBUG print statements | `climate_calculations.py` | Remove all |
| Token cleanup not scheduled | `cleanup_expired_blacklist()` | Add to GitHub Actions daily job |
| Failed login tracking | Login endpoint | Increment counter on failure |
| Legacy `role` column | `users` table | Eventual migration to `user_type` only (v2 cleanup) |
| No middleware tenant isolation | All routes | Phase A9 PropertyService improves this; full middleware is v2 |
 