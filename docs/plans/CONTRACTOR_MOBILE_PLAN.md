# Contractor Mobile Experience — Plan

**Created:** 2026-05-16
**Status:** Scoping only — not started
**Owner area:** `packages/mobile/`, plus a small backend addition for property check-in
**Related:**
- Web side already shipped (`/contractor-mobile-only` landing) — Grow Phase 1, 2026-05-16
- `docs/plans/GROW_COMMERCIAL_RELEASE_PLAN.md` (Phase 3 — Relationships card touches contractor scoping but doesn't address mobile UI)
- `docs/plans/VISITOR_REGISTER_SCOPING.md` (the sign-in/sign-out pattern that informs the new property check-in feature)

---

## Why

Grow Phase 1 closed the web side: contractors landing on the manager web app get bounced to `/contractor-mobile-only`. But the mobile app still presents the **same UI shell to every authenticated user**, including contractors. As things stand:

- A contractor on mobile sees the Assets tab (and can attempt to create new assets, register risks, log visitors) — none of which they should be doing.
- Backend already enforces permissions (`get_current_user_or_contractor` + the 5-tier matrix), so most of those actions would fail server-side. UX-wise that's a poor experience — actions that look available but error on submit.
- Conversely, there's **no surface** for the contractor-specific workflow Pete actually wants:
  - "What property am I on today, and when did I arrive / leave?"
  - "Which tasks are assigned to me?"
  - "Let me log an observation or incident from the field."

This plan trims the surface to what contractors should see + adds the missing property-check-in flow.

---

## Scope decisions (Pete, 2026-05-16)

### In scope for contractors on mobile

| Feature | Read / Write | Notes |
|---|---|---|
| **My assigned tasks** | Read | Sorted by date, filtered to tasks where `assigned_to_contractor_id` (or via relationship) matches the logged-in contractor. Tap → TaskDetail. They complete tasks (hours, notes, GPS) — same flow as regular users; the screens already work. |
| **Make observations** | Read + Create | Full Observe tab access. Spot capture, photos, severity, GPS — unchanged. |
| **Property check-in** | New (Create + Read) | NEW: prompt at app open (and re-prompt daily) to log which property they're on, with arrival + departure timestamps. See §3 below. |
| **Map view** | Read | Map tab once shipped (`MOBILE_MAP_PLAN.md`). Includes the **risks layer** so they can see hazards before walking into them. No risk creation; no asset pins (or asset pins hidden — see §2). |
| **Incident logging** | Create | If something goes wrong in the field, they file the incident. Existing `CreateIncidentScreen` flow — unchanged. |
| **Profile** | Read + minimal Write | Name, email, password change, notification prefs. No company switching. |

### Out of scope for contractors

| Feature | Why hidden |
|---|---|
| **Visitor management** | Visitor register is a property-owner concern. Contractors are themselves the visitors (or close to it). |
| **Assets** (tab + CRUD) | Asset register belongs to the property owner / company. Contractors using shared equipment touch it via tasks (e.g. "spray with tractor #3"), not through the asset tab. |
| **Risk creation** | Risk management is a manager/admin discipline. Contractors VIEW risks (on the map, on a task they're assigned to) but don't author them. |
| **Task creation** | Already managers-only in spirit — contractors execute tasks they're assigned, never create. |
| **Calibrations (completion)** | **Open question** — currently contractors could complete a calibration ticket via the unified feed. Decide §4: hide vs keep. |
| **Maintenance (create / complete)** | Same as calibrations — currently in the unified feed. Decide §4. |

---

## Phases

Three sub-phases, each independently shippable. CON.1 + CON.2 are the heart of it; CON.3 is polish.

### CON.1 — Conditional UI hiding (≈ S)

Hide what shouldn't be there. No new features, no new screens.

**Tab navigator** (`packages/mobile/src/navigation/AppNavigator.js`):
- Read `isContractor()` from `useAuth()` (already exposed by `packages/shared/src/contexts/AuthContext.jsx`)
- For contractors, drop the **Assets** tab from the bottom nav. Tab order becomes: Home / Tasks / Map / Observe / Profile (5 tabs).
- The Assets tab's screen stack still exists in code, just unreachable via the tab bar. Cheaper than ripping it out; lets future "shared equipment view for contractors" plug in later.

**Home screen** (`packages/mobile/src/screens/HomeScreen.js`):
- "+ Log" FAB options for contractors: **Observation** and **Incident** only. Drop Task, Risk, Visitor.
- Visitor / on-site chip: hide for contractors (they don't run a visitor register).
- Quick-action cards or context: prioritise their assigned tasks + current property check-in state.

**Tasks tab** (`packages/mobile/src/screens/TasksScreen.js`):
- Hide the "+" FAB (CreateTask) for contractors.
- Backend `/tasks` is already property-scoped + contractor-scoped via `get_current_user_or_contractor` and `UserPropertyScope`, so the list naturally filters to "tasks assigned to me or my contractor org" — verify the actual filter logic still works, but no UI change needed beyond hiding the create button.

**Observe tab** — no change. Contractors are first-class observation creators.

**Backend-side** — nothing required for CON.1. Permission matrix already blocks contractor writes on assets/risks/visitors/tasks; CON.1 just hides the buttons that would 403 anyway.

**Test pass:** Log in as a contractor on mobile. Tab bar shows 5 tabs (no Assets). Home FAB shows Observation + Incident only. Tasks tab loads scoped list, no `+` button. Existing manager/admin/user flows unchanged.

---

### CON.2 — Property check-in (≈ M-L)

The headline new feature. Lets contractors record which property they're on, from when to when. Foundation for time-on-site reports, GPS-fenced compliance, and per-property task targeting.

**Backend (new, small)**

New table `contractor_property_checkins`:

| Column | Type | Notes |
|---|---|---|
| `id` | int | PK |
| `contractor_id` | int FK → contractors | |
| `company_id` | int FK → companies | Which company's property they're working on. A contractor relationship can span multiple companies — this disambiguates. |
| `property_id` | int FK → properties | |
| `arrived_at` | datetime | Required, defaults to now on check-in. |
| `departed_at` | datetime | Nullable. Set on check-out. |
| `notes` | text | Optional. |
| `arrival_lat`, `arrival_lng` | float | Captured at check-in (foreground location). Nullable if permission denied. |
| `departure_lat`, `departure_lng` | float | Captured at check-out. |
| `created_at`, `updated_at` | datetime | |

Index: `(contractor_id, departed_at IS NULL)` partial — for "any open check-ins for this contractor?" lookup.

New endpoints under `/api/v1/contractor-checkins`:

| Method | Path | Body / Query | Returns | Permissions |
|---|---|---|---|---|
| `GET` | `/active` | — | Active (un-checked-out) check-in for the calling contractor, or `null` | Contractor only |
| `GET` | `/history` | `?limit=&before=` | Paginated list of past check-ins for the calling contractor | Contractor own, Manager/Admin for their company's contractor pool |
| `POST` | `/check-in` | `{ company_id, property_id, arrival_lat?, arrival_lng?, notes? }` | New check-in row | Contractor only |
| `POST` | `/{id}/check-out` | `{ departure_lat?, departure_lng?, notes? }` | Updated check-in row | Contractor only, must own the row |

Auto-close behaviour: if a check-in is open and a new one is created for a different property, close the old one first (server-side, single transaction). Prevents zombie open check-ins from "I forgot to check out yesterday."

**Mobile**

New screen + service:

- `packages/mobile/src/api/services.js` — add `contractorCheckinService` (getActive, history, checkIn, checkOut)
- `packages/mobile/src/screens/CheckInScreen.js` (new):
  - Property picker (scoped to companies the contractor has an active relationship with)
  - Optional notes
  - "Check in" CTA
  - When an active check-in exists: shows the property + arrival time + a prominent "Check out" CTA
  - GPS captured silently (foreground perm) on check-in / check-out
- `packages/mobile/src/screens/HomeScreen.js`:
  - Contractor context strip at the top: "On site at X since 8:42am" with a check-out chip, OR "Not checked in — tap to log property" CTA if no active check-in
  - Daily prompt: if no check-in for today's date by 9am (configurable), surface a one-tap "Check in to [last property]?" suggestion

**Alembic migration:** new `add_contractor_property_checkins` migration chained off whatever's then-current head.

**Test pass:** Contractor opens app fresh → Home shows "Not checked in" CTA. Tap → picker → choose property → check in. Home now shows "On site at X since 8:42am". Tap chip → CheckInScreen with check-out CTA. Check out → Home reverts to "Not checked in". History tab on Profile shows the day's check-in row.

---

### CON.3 — Contractor-specific Home polish (≈ S)

Once CON.1 + CON.2 are in, the Home screen for contractors should feel purpose-built rather than "the regular Home minus some bits".

**Layout for contractors:**
1. Brand header (same as regular)
2. **Check-in context strip** (from CON.2) — most important state
3. **Today's assigned tasks** — top 3-5, grouped by property. Tap → TaskDetail.
4. **Quick log** — Observation, Incident FAB shortcuts
5. Recent activity / sync state (optional)

No changes for regular users — branching only on `isContractor()`.

**Test pass:** Side-by-side regular user vs contractor Home — different layouts, both clean. Same Tasks tab flow either way.

---

## Open questions

1. **Calibrations + Maintenance in the contractor feed** — currently `tasksService.getUnifiedFeed` returns these alongside tasks. Should contractors complete them, or are they manager-only? Reasonable defaults:
   - **Calibrations**: spray equipment calibration is a real field activity → keep in scope, contractors complete
   - **Maintenance**: regular maintenance is owned by the asset owner → hide from contractor feed
   Pete to confirm.

2. **GPS auto-detect property** — once we have property polygons (Grow Phase 6), the check-in flow could auto-suggest the property based on current GPS. Defer to Phase 6 wiring; ship CON.2 with manual picker for now.

3. **Multi-property check-ins per day** — design assumes one open check-in at a time. If a contractor moves between properties in a single day, they check out + check in to the next. Confirm this matches Pete's mental model (vs. running multiple simultaneous check-ins).

4. **Check-in prompt cadence** — daily, or every app open? Daily is less annoying; every-open catches forgetfulness. Default to daily with a "snooze 2h" option.

5. **Visibility to managers** — should managers see a "who's on site right now" view across their company's properties? Cheap once the table exists. Likely yes — defer to a separate phase (CON.4 — manager visibility).

---

## Ordering relative to the broader roadmap

- **CON.1** can ship anytime — pure UI, no backend, no migration. Slots in as a quick win between any two other pieces.
- **CON.2** needs the migration + endpoints + new screen. Maybe 2 dev days. Doesn't block anything else. Could run in parallel with Mobile Map work.
- **CON.3** sits on top of CON.1 + CON.2 — last.

Suggested slot: after Mobile Map MAP.1–3 (so contractors immediately see the value of the Map tab as their primary surface alongside Tasks), and before Grow Phase 3 (Relationships) since CON.2's data flows back into a per-contractor activity view on the web Relationships tab.

---

## Acceptance (end of CON.3)

1. Contractor login on mobile lands on a Home tailored to them — no Assets tab, no risk/task/visitor create FABs.
2. "On site at [property] since [time]" chip visible whenever they have an open check-in.
3. Tap chip → CheckInScreen → can check out, optionally add notes, captures departure GPS.
4. Daily app-open prompt suggests checking in if they haven't yet.
5. Assigned tasks list filters correctly to their scope; create button hidden.
6. Map tab shows risks layer (so they can see hazards) but no asset/risk creation surfaces.
7. Manager / admin / user flows on mobile are byte-for-byte unchanged.
