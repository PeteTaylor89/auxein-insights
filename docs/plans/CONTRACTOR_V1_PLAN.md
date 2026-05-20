# Contractor V1 — Web + Mobile + Geofencing

**Created:** 2026-05-17
**Status:** Sprint 1 DONE 2026-05-17. Sprint 2 DONE 2026-05-18. Sprint 3.4 (CheckInScreen) DONE 2026-05-18. Sprint 2.6 (self check-in NULL fix + unified Who's on site) DONE 2026-05-18. Sprint 3.3 + 3.5–3.7 (geofencing) PENDING — convenience features, not V1 blocker.
**Supersedes:** [CONTRACTOR_MOBILE_PLAN.md](./CONTRACTOR_MOBILE_PLAN.md) — that doc only covered mobile UI hiding; this one covers the full web + mobile + property-geofence stack.
**Related:**
- `GROW_COMMERCIAL_RELEASE_PLAN.md` Phase 3 (Relationships card) — this plan executes it
- `MANAGEMENT_RELATIONSHIP_UI_PLAN.md` — separate plan for property-management transfer (different relationship type)
- `VISITOR_REGISTER_SCOPING.md` — the visitor sign-in/out UX that informs the contractor check-in flow

---

## Why this plan exists

Contractors are the only V1 user type that's **mobile-only**. The web app already gates them off (`/contractor-mobile-only` landing). But two things are missing:

1. **Companies have no way to invite contractors or assign them work.** The Relationships tab in `CompanyAdmin` is a placeholder. Tasks can only be assigned to users.
2. **The mobile app shows them the same UI as a regular user.** No property-aware filtering, no check-in flow, no dedicated relationships view.

We also want contractors to be **property-aware**. A contractor with relationships across three vineyards shouldn't see all their blocks/risks/tasks at once on the map — they should see only the property they're currently working on. Geofencing solves this.

---

## What's already in place — verified 2026-05-17

### Backend (do not rebuild)

| Model | Purpose |
|---|---|
| `Contractor` | Independent auth (email + password), own JWT, own login flow |
| `ContractorRelationship` | Company ↔ contractor link with rates, contract dates, training requirements, block access lists, status |
| `ContractorAssignment` | Contractor assigned to a specific task or general work, with scope, scheduling, completion tracking, rate/cost fields |
| `ContractorMovement` | Check-in / check-out with timestamps, blocks visited, equipment cleaning, biosecurity, work summary, hours worked |

### Backend endpoints (do not rebuild)
- `GET/POST/PATCH /api/v1/contractor-management/contractor-relationships`
- `GET /api/v1/contractor-management/contractors/{id}/assignments`
- `POST /api/v1/contractor-management/tasks/{task_id}/contractor-assignments`
- `POST /api/v1/contractor-management/contractor-movements/check-in`
- `POST /api/v1/contractor-management/contractor-movements/{id}/check-out`
- `GET /api/v1/contractor-management/contractor-movements`
- `get_current_user_or_contractor` auth dep handles both token types

### Web (partial)
- `/contractor-mobile-only` landing page exists
- `ProtectedRoute` bounces contractors to it
- `CompanyAdmin.RelationshipsTab` exists as a placeholder with two "Coming soon" cards

### Mobile (partial)
- `LoginScreen` works for contractors
- `AuthContext` exposes `isContractor`, `userTypeRole`
- `MapScreen` partially gates contractor risk creation
- Existing screens (Tasks, Observations, CreateIncident) work for contractors via `get_current_user_or_contractor`

---

## What needs building

### A. Web — Relationships UI (currently placeholder)
The two "Coming soon" cards in `CompanyAdmin:553` become functional:

**Contractor Relationships card** → wire to existing `/contractor-relationships` endpoints:
- List view: status pill, current hourly rate, last worked date, contract end date
- Create modal: search/invite by email, set scope (block access, work types), rates, contract dates
- Detail screen: relationship history, assignment list, suspend/terminate buttons

**Property Management card** — separate plan, defer.

### B. Web — Contractor task assignment

Decision: **two pickers, side by side** — separate user assignment from contractor assignment because the underlying data models are different (TaskAssignment vs ContractorAssignment) and contractor assignments have richer fields (rate, work scope) we may want to surface inline later.

Affects:
- `TaskQuickCreate` — add a multi-select contractor picker beneath the existing user picker. Only shows contractors with active relationships to this company.
- `TaskCreationWizard` — same, in the relevant step.
- On submit, POST to `/tasks/{id}/contractor-assignments` per selected contractor (parallel to the existing user TaskAssignment creation).

### C. Property polygon (the missing primitive)

Currently `properties` table has no geometry. Required for geofencing AND for visually showing the boundary on the mobile map.

- **Alembic migration**: add nullable `geometry: Geometry('POLYGON', srid=4326)` to `properties`
- **Backend**: extend `/properties` responses to include polygon GeoJSON; new endpoint `GET /api/v1/properties/geojson?contractor_scope=true` returns polygons for properties the caller can see
- **Web**: Maps V2 polygon drawing UI on property edit page (Mapbox Draw plugin, snap + undo, save as GeoJSON)

### D. Mobile — contractor-specific shell

Tab navigator branches on `useAuth().isContractor`. Contractor layout = **5 tabs** (no Observe — contractors do ad-hoc observations from the FAB, not planned runs; no Assets):

| Tab | Behaviour |
|---|---|
| **Home** | NO `ConditionsHero`. Replaced with: active check-in card (or "Not checked in" CTA), today's assigned tasks (top 3), **FAB → Task / Observation / Incident / Visit**. |
| **Tasks** | List of contractor's `ContractorAssignment`s. Each row: company badge, property badge, task title, due date. Tap → TaskDetail (existing screen). No create button on the tab — ad-hoc task self-logging happens via the Home FAB. |
| **Map** | Property-aware filtering (§E). Contractor only sees blocks/risks/tasks for their `currentProperty`. Manual override via property pill is still available. |
| **Contracts** (NEW, route name `Relationships`) | List of company relationships: company name, status, rate, last worked. Tap → detail with permitted blocks, recent assignments, contract info. Label is "Contracts" (shorter, renders better on small screens — decided 2026-05-18); internal route + data model keep the `Relationship` naming. |
| **Profile** | The contractor's portal: contact info, password change, training records (read), insurance status (read), notification prefs, recent movements (last 10). |

**FAB lock (decided 2026-05-18):**
- **Task** — ad-hoc self-log of work done (for the case where they undertake work on behalf of a company that wasn't pre-assigned). Routes to a contractor variant of `CreateTaskScreen` or a simplified self-log.
- **Observation** — ad-hoc one-off observation (NOT an observation run). Reuses existing single-observation create path.
- **Incident** — existing `CreateIncidentScreen`, no changes.
- **Visit** — contractor property check-in. **NOT the visitor register** — reuses the `ContractorMovement` model from §E / Sprint 3. Contractors cannot sign in other visitors; they can only check themselves in. This means the Sprint 3 `CheckInScreen` needs to be reachable from the FAB even before the geofence trigger lands (cross-sprint dependency — Sprint 2.2 will stub if necessary).
- **Risk — explicitly NOT in the FAB.** Contractors cannot create risks.

**Property-aware contractor create flows (decided 2026-05-18):**
When a contractor uses the FAB to log a **Task** or **Incident**, the create screens must let them pick which **company** (from active relationships) and which **property/block** (within that company's permitted set) the record belongs to — otherwise these rows have no `company_id` / `property_id` / `block_id` and can't be reported on or filtered. For company-user callers these fields are implicit; for contractor callers they're an explicit choice. Sprint 3.5 wires `currentProperty` from check-in, so once a contractor is checked in the picker pre-fills; before check-in (or when logging from off-site), the picker is mandatory. Same pattern applies to ad-hoc Observation when that screen lands. This is a follow-up tracked against Sprint 2.5 (Task) and a new cross-cutting ticket (Incident + Observation).

### E. Property-aware map — geofencing

**UX (per Pete's call): prompt-style sign-in, mirrors the visitor sign-in flow.**

1. On mount, fetch all property polygons the contractor has active relationships with.
2. On GPS update, run an inline point-in-polygon test against each polygon.
3. If exactly one match AND no active check-in for that property → toast/banner *"You're at Smith Vineyard — sign in?"* with a single Confirm button.
4. Confirm → opens a quick check-in form (purpose, equipment, biosecurity if enabled) → POSTs `ContractorMovement`. Pattern follows the existing visitor sign-in UX, but uses the richer contractor model.
5. Once signed in, `currentProperty` is set. Map auto-filters blocks/risks/tasks. Home shows the active check-in card.
6. **Sign-out is contractor-initiated**: tap the active check-in card → "Sign out" CTA → POSTs `/contractor-movements/{id}/check-out`. Same flow as the visitor "Sign out" the visitor register already supports.

**Geofence math** — a small inline ray-casting function (~30 lines, no `turf.js` dep needed for V1). Property polygons are simple enough.

**Rate-limiting the prompt** — once dismissed, don't re-prompt for the same property within 30 minutes (AsyncStorage timestamp per property). Re-prompts if GPS exits and re-enters the polygon.

**Buffer for GPS jitter** — apply a 5 m inward buffer when running the polygon test, so a contractor near a boundary doesn't bounce between properties.

---

## Order of work

Three sprints, each independently shippable. ~12–15 dev days total.

### Sprint 1 — Web foundation (~3 days) — DONE 2026-05-17

**Goal: a company admin can create relationships and assign tasks to contractors.**

| # | What | Status | Files |
|---|---|---|---|
| 1.1 | Web Relationships UI — directory picker, two-step Create modal, list with preferred sort, suspend/reactivate/terminate | ✅ | `ContractorRelationships.jsx` (new), `CompanyAdmin.jsx` RelationshipsTab |
| 1.2 | Task-create UI: multi-select contractor picker beside user picker (sorted preferred-first with star indicator) | ✅ | `TaskQuickCreate.jsx`, `TaskCreationWizard.jsx` |
| 1.3 | Task-create handler: loops POST `/tasks/{id}/contractor-assignments` per selected contractor | ✅ | Folded into 1.2 |
| 1.4 | Property polygon — Alembic migration + model + `/properties/geojson` endpoint + drawing UI on /maps (pulled forward from Sprint 3) | ✅ | `add_property_geometry.py`, `db/models/property.py`, `schemas/property.py`, `api/v1/properties.py`, `usePropertiesLayer.js` (new), `MapsPage.jsx`, `PropertiesPanel.jsx`, `DrawingToolbar.jsx` |

**Extras shipped in same window (not Sprint 1 scope but adjacent):**
- Backend `_display_name` helper + friendlier assignee names on task list responses
- `TaskWithRelations` schema gained `contractor_names`, `assigned_contractor_ids`, `assigned_user_ids`
- `/observations` restructure → "Field Work" with asset-style tabs, default tab = Task Management
- Task Management table: always-visible multi-select chip filters (Status / Category / Priority / Location / Assignee / Contractor), tightened columns, clickable rows
- Task Detail expansion: Overview / Assignments / Description / Activity sections + Edit modal

After Sprint 1: web admins can set up contractor relationships, assign work, and draw property boundaries on the map. Mobile shell still unchanged — contractors see regular UI.

### Sprint 2 — Mobile contractor shell — DONE 2026-05-18
**Goal: contractors get a purpose-built mobile app.**

| # | What | Status | Files |
|---|---|---|---|
| 2.1 | Tab navigator branching on `isContractor` — **5-tab layout** (Home / Tasks / Map / Contracts / Profile), no Assets, no Observe. Contracts label, route name `Relationships`. | ✅ | `AppNavigator.js`, `RelationshipsScreen.js` placeholder |
| 2.2 | Contractor Home screen — no hero, check-in card (live state: shows On site + Sign out when active), FAB → Task / Observation / Incident / Visit. | ✅ | `ContractorHomeScreen.js`, `AppNavigator.js` |
| 2.3 | Contracts tab — list + detail. Backend `/me/relationships` (list) + `/me/relationships/{id}` (detail), gated on `get_current_contractor`. Stack-wrapped tab. | ✅ | `contractor_management.py`, `contractorService` in mobile `services.js`, `RelationshipsScreen.js`, `RelationshipDetailScreen.js`, `AppNavigator.js` |
| 2.4a | Backend contractor self-service: `/me/profile` (GET/PATCH), `/me/insurance` (PATCH), `/me/password` (POST), `/me/movements` (GET), `/me/insurance/docs` (POST/GET/DELETE/download). S3-backed docs stored against `Contractor.verification_documents` JSON column. | ✅ | `contractor_management.py` |
| 2.4b | ContractorProfileScreen — hero with verification + insurance status pills; sections for contact, per-policy insurance, docs, biosecurity, recent visits, app info, sign out. | ✅ | `ContractorProfileScreen.js`, `AppNavigator.js` ProfileStack branch |
| 2.4c | Edit profile + per-policy insurance + change password screens. `FilledInput` gained `secureTextEntry` / `autoCapitalize` / `autoCorrect` pass-through. | ✅ | `EditContractorProfileScreen.js`, `EditContractorInsuranceScreen.js`, `ChangeContractorPasswordScreen.js`, `FilledInput.js` |
| 2.4d | Insurance doc upload via `expo-document-picker` + delete with native confirm. Section header gained `rightAction` prop alongside existing `onEdit`. | ✅ | `UploadInsuranceDocScreen.js`, `ContractorProfileScreen.js` |
| 2.5 | Tasks tab — `GET /me/assignments` (joins Company + optionally Task → Block → Property). Contractor branch of TasksScreen with company/property/block badges, filter chips (Active / All), overdue counts, status pills, priority indicator, progress bar. Tap → existing TaskDetail. | ✅ | `contractor_management.py`, `ContractorTasksScreen.js`, `AppNavigator.js` TaskStack branch |
| 2.5b | **Property-aware contractor self-create flows (Task + Incident + Visit).** Backend: `/me/companies`, `/me/properties?company_id`, `/me/blocks?property_id`, `/me/assignments` POST, `/me/incidents` POST. Migration `add_contractor_incident_reporter` (incidents.reported_by nullable + reported_by_contractor_id FK + CHECK constraint). Mobile: `CheckInScreen`, `CreateContractorAssignmentScreen`, `ContractorCreateIncidentScreen`. Self-logged assignments use the first active company admin/manager as `assigned_by` to satisfy FK. ContractorHomeScreen check-in card now reflects active `ContractorMovement` state with destructive Sign out. | ✅ | `contractor_management.py`, `db/models/incident.py`, `alembic/versions/add_contractor_incident_reporter.py`, three new mobile screens, `services.js` (8 new methods), `AppNavigator.js` HomeStack |

After Sprint 2: contractor logs in, sees a tailored shell, can edit profile + insurance + change password + upload insurance docs, view their assigned work, self-log ad-hoc work + incidents, and check in/out of properties manually. Property-aware geofence detection (auto-prompt) is Sprint 3.

### Sprint 2.6 — Contractor self check-in NULL fix + unified Who's on site — DONE 2026-05-18
**Goal: contractor self-check-in works against a hardened schema, and one screen shows everyone on site.**

| # | What | Status | Files |
|---|---|---|---|
| 2.6a | Schema/endpoint NULL fix. Field-testing 2026-05-18 hit `checked_in_by NOT NULL` when a contractor self-checked-in. Migration `add_movement_self_checkin` drops NOT NULL on `checked_in_by` + `logged_by` and adds parallel contractor FKs (`checked_in_by_contractor_id`, `checked_out_by_contractor_id`, `logged_by_contractor_id`) with CHECK constraints ensuring exactly one side is populated. `contractor_check_in` / `contractor_check_out` branch on actor type and write to the matching FK pair. Schema gains Optional fields + the three contractor FK columns. | ✅ | `alembic/versions/add_movement_self_checkin.py`, `backend/db/models/contractor_movement.py`, `backend/db/models/contractor.py` (disambiguated `movements` FK), `backend/api/v1/contractor_management.py`, `backend/schemas/contractor.py` |
| 2.6b | Unified `/api/site/active` endpoint — single GET that fans out to active `visitor_visits` + active `contractor_movements`, returns `{ total, visitors_count, contractors_count, items: [...] }` with type=visitor\|contractor. Discriminated rows preserve table-specific fields (host on visitors, biosecurity on contractors). Same storage tables — visitor flow + contractor biosecurity tracking both stay intact. | ✅ | `backend/api/v1/site.py` (new), `backend/main.py` |
| 2.6c | Mobile "Who's on site" rewrite — `VisitorsScreen` now consumes `siteService.listActive`. Filter pills (All · N / Visitors · N / Contractors · N), stat bar (total / visitors / contractors / overdue), type chips per row, biosecurity row + self-checked-in note for contractors. Sign-out branches by `item.type`. HomeScreen on-site chip now shows unified total. | ✅ | `packages/mobile/src/api/services.js` (new `siteService`), `packages/mobile/src/screens/VisitorsScreen.js` (rewrite), `packages/mobile/src/screens/HomeScreen.js` |

**Alembic gotcha hit in flight:** initial revision slug `add_contractor_movement_self_checkin` (36 chars) exceeded `alembic_version.version_num VARCHAR(32)` — DDL applied then the version row update failed, rolling the whole batch back. Renamed to `add_movement_self_checkin` (25 chars) and made the upgrade body idempotent (PG has no `ADD CONSTRAINT IF NOT EXISTS`, used a `DO` block on `pg_constraint`). Memory: `feedback_alembic_version_slug_limit.md`.

### Sprint 3 — Property polygon drawing + check-in + geofencing (~5 days)
**Goal: the mobile app is property-aware. Check-in lifecycle works.**

| # | What | Effort | Files |
|---|---|---|---|
| 3.1 | ~~Web Maps V2 — property polygon drawing UI~~ — PULLED FORWARD into Sprint 1.4 (done 2026-05-17) | ✅ | `MapsPage.jsx`, `usePropertiesLayer.js` (new), `PropertiesPanel.jsx`, `DrawingToolbar.jsx` |
| 3.2 | ~~Backend `/properties/geojson?contractor_scope=true`~~ — PULLED FORWARD into Sprint 1.4 (done 2026-05-17) | ✅ | `api/v1/properties.py` |
| 3.3 | Mobile `useContractorProperties` hook + point-in-polygon util | 0.5 d | new `hooks/useContractorProperties.js`, `utils/pointInPolygon.js` |
| 3.4 | ~~Mobile check-in screen wired to `/contractor-movements`~~ — PULLED FORWARD into Sprint 2.5b (done 2026-05-18). Manual check-in / check-out works. Geofence auto-prompt still pending. | ✅ | `CheckInScreen.js`, `ContractorHomeScreen.js` |
| 3.5 | Geofence detection on GPS update — derive `currentProperty`, surface chip on Map + Home | 1 d | `ContractorHomeScreen.js`, `MapScreen.js`, new `useGeofence.js` |
| 3.6 | Auto-prompt sign-in when entering a property polygon (rate-limited, dismissable) | 0.5 d | `useGeofence.js` + toast |
| 3.7 | Property-aware map: when `currentProperty` set, filter blocks/risks/tasks to that property | 0.5 d | `MapScreen.js` — re-use the existing property scoping pattern |

After Sprint 3: contractor opens the app at the gate of Smith Vineyard, gets prompted to sign in, sees only Smith's data, signs out at end of day. Currently (post Sprint 2.5b) they still need to manually open the Sign in screen, but the lifecycle works end-to-end.

### Deferred follow-ups (out of Sprint 2 + 3, separate phase)
- **Quick observation create** (Observation FAB) — needs a new ad-hoc spot create flow. Currently a coming-soon toast.
- **Property-aware Quick Observation** when the above lands — same scope-picker pattern as Task / Incident.
- **BUG-001 follow-up** — single-photo 404 on calibration download if it recurs.

---

## Permission edge cases — decided

1. **Contractor sees other contractors' tasks?** No. Only their own `ContractorAssignment` records.
2. **Relationship suspended/terminated mid-assignment?** Existing assignments continue (so work-in-progress isn't lost), but no new assignments can be created. Already supported via `ContractorRelationship.status`.
3. **Multi-company contractor?** Relationships list shows all active companies. Check-in disambiguates which company. Geofence detects which property, which implies which company. Already supported in the data model.
4. **Contractor checks in to property A but is assigned task on property B?** Show the task in the Tasks tab but with a warning chip "You're checked in to a different property." Don't block them — there are legitimate cross-property reasons (driving between, picking up equipment).

---

## Out of scope for V1 (defer)

- **Contractor self-signup** — Auxein admin creates accounts manually. Confirmed by Pete.
- **Contractor logging other visitors** — decided 2026-05-18. Contractors cannot use the visitor sign-in flow to register anyone else. They can only check themselves into a property via the ContractorMovement check-in.
- **Contractor creating risks** — decided 2026-05-18. Risk creation is for company users/managers/admins. Contractors can still flag issues via Observation or Incident.
- **Planned observation runs for contractors** — decided 2026-05-18. Contractors do not get the Observe tab. They log ad-hoc one-off observations via the Home FAB. Multi-spot observation runs remain a company-user feature.
- **Biosecurity workflow on check-in** — model has fields, basic UI in V1 (equipment cleaned y/n + notes), full biosecurity workflow is v0.2
- **Contractor invoicing / billing** — rates + cost tracking already in the model, invoicing UI is a separate epic
- **Training-required gates on task assignment** — model supports it, but blocking work without training is v0.2
- **Contractor ↔ company messaging** — separate epic
- **Multi-property concurrent check-ins** — one at a time. If geofence detects multiple polygons (unlikely but possible at boundaries), fall back to manual pick.
- **Web admin view of contractor's current location** — privacy-sensitive; defer until contractors have explicit consent flow.

---

## Open questions resolved 2026-05-17 (Pete)

| Question | Decision |
|---|---|
| Relationships as tab or under Profile? | **Top-level tab (6 tabs)** |
| Geofence trigger UX? | **Prompt-style sign-in mirroring visitor flow. Sign-out is contractor-initiated.** |
| One picker or two for task assignment? | **Two pickers (Users + Contractors)** |

---

## Acceptance (end of Sprint 3)

1. Company admin can invite a contractor by email, set rates and contract dates, suspend or terminate.
2. Company admin can create a task and assign it to one or more contractors alongside (or instead of) users.
3. Contractor logs into mobile and sees the dedicated 6-tab shell — no Assets, no hero, contractor-specific Home.
4. Contractor walks onto a property → prompted to sign in → confirms → ContractorMovement recorded.
5. Once signed in, Map shows only the active property's blocks, risks, tasks. Home shows active check-in chip.
6. Contractor can sign out from the Home check-in card → ContractorMovement check_out_datetime stamped.
7. Manager / admin / user mobile flows are byte-for-byte unchanged.
