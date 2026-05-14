# Grow — First Commercial Release Plan (web app focus)

> **Source:** Critical review of `docs/plans/grow_dev.md` against current state on 2026-05-11.
> **Scope:** Web Grow app (`packages/web/`). Mobile work continues separately under `MOBILE_POLISH_PLAN.md` / `MOBILE_MAP_PLAN.md` / BLOCKER-001.
> **Workflow:** Phase-by-phase. After each phase Pete tests, then we move on.

---

## Status as of 2026-05-11

### Already shipped (don't rebuild — verify only during phase test passes)
- Property gating across all entities (`UserPropertyScope`, `get_visible_property_ids`)
- Visitor register (web sign-in portal + management page)
- Observation dashboard structure (`plans / runs / templates / tasks / task-templates` tabs)
- Home Upcoming wired to `tasksService`
- Calibration two-table model + asset spec persistence (2026-05-07) — but **see Phase 4 below: the table still lives on its own `/calibrations` route; Pete wants it folded into `/assets` as a fourth tab alongside Equipment, Consumables, Maintenance**

### Pre-flight verified clean
- Alembic: single head `add_banner_audience`. BUG-005 zombie files are inert (do not block new migrations). No merge needed.

### Awaiting product clarification (separate scoping session, not deferred)
1. Insights rebuild — climate history per property, region-vs-property compare, growth/phenology, disease, biosecurity, blockchain
PT Context - there is a table (climate_historical_data) in the DB with 99.9% of daily data for every vineyard block from 1986-2024. As this is too granular, we should have a recompute process for blocks in a property (perhaps a user initiated - button "Compute"? to prevent overloading of computing everytime the user makes a property update) - this would then create a daily property scoped climate record that can be used in the inisghts. A key blocker at the moment is that there are 121,330,218 rows in the climate_historical_data table - and queries are very slow (a SQL select * from climate_historical_data took 12 mins). We might need to update some of our timeseries tables to ensure efficiency. The projections same deal - scope to property. For regional compare that is propery vs climate zones from insigths: direct comparison per variable. The growth/phenology  - two aspects, one drawing from the inisghts models for phenology in the climate zone, and second the observations made by users - i.e. if tehy have made phenology, bud counts, flower counts etc, there is a meaningful means of presenting these data. Same with disease pressures. Biosecurity is on hold for now. Blockchain is purely a visual representation of the key aspects that have gone into the production (perhaps on hold for V1).
2. Compliance — SWNZ, BioGro, Organics, Biodynamic 
PT Context - we need to scope what is required for each, I'll do some research and get claude to produce .md scoping files for each. 
3. Reports — what customers actually want 
PT Context - again on hold while i detail the scope. 

These three get their own plan doc once Pete details them. Treat them as "roadmapped, not in this commercial-release plan."

### Decisions still needed before later phases
- Training overhaul: defer to v1.1, or include?
PT - defer to 1.1
- GrapeLink: defer to v1.1, or include?
PT - I'll scope fully and let you know. 
- Self-service weather station setup: defer to v1.1, or include?
PT - lets scope witha  test run and then come up wiht the implementation plan
---

## Phase 1 — Contractor mobile-only experience (web side)

**Why:** grow_dev says contractors are mobile-only in V1. Web should not present a full app surface to contractor logins.

**Web tasks:**
- `ProtectedRoute`: detect contractor role, redirect to a new `/contractor-mobile-only` landing page (deep link to mobile store + brief explanation)
- `Login.jsx`: after auth, branch on `userTypeRole === 'contractor'`
- Strip header nav for contractor sessions (or hide header entirely on the landing page)
- Confirm `is_contractor` flag is already on the user payload — wire from `useAuth().user`

**No backend changes expected.**

**Test pass:** contractor login bounces to landing; manager/admin/user unaffected; mobile contractor flow unchanged.

---

## Phase 2 — Manage tab polish (CompanyAdmin)

**Why:** highest user-visibility, lowest schema risk. Pete listed seven concrete pain points.

**Web tasks:**
- **Properties tab:** fix table layout glitches; replace text-based assignment with tickbox UI
- **Blocks tab:** swap edit-icon for an "Edit" button; default sort order alphabetical by block name. Rows within a block sorted with natural sort (`localeCompare(b, undefined, { numeric: true })`) so `1, 2, 10` not `1, 10, 2`. Extract the row comparator into a shared util so TaskDetail / ObservationRun / mobile feed all use the same rule.
- **Timesheets tab:**
  - Enlarge nav button
  - Collapse per-task rows into a popup-per-entry; show date pills with task name
  - Smoother "add time" flow
  - Drill-down: team-dashboard day submission opens the underlying tasks
- **Aliases tab:** dropdowns for block/asset selection (no free text)
- **Calendar Sync tab:** end-to-end test of ICS subscribe in real clients; fix anything broken

**Out of scope this phase:** Timesheets *analysis* dashboard (task-type time budgeting) — added in Phase 5.

---

## Phase 3 — Relationships: contractors + property management

**Why:** backend supports both already; Relationships tab placeholder has been waiting.

**Web tasks:**
- **Contractor relationships card:** flesh out — assign/unassign contractors to company-wide, property-scoped, or task-scoped roles per existing backend
- **Property Management card:** execute Phase 1 of `docs/plans/MANAGEMENT_RELATIONSHIP_UI_PLAN.md` (read-only visibility + history modal). Defer transfer flow unless Pete asks.

**Backend:** likely `propertyService.getManagementHistory(propertyId)` — small new endpoint per the plan doc.

---

## Phase 4 — Task & Observation UX + Calibrations relocation

**Web tasks:**
- **TaskDetail.jsx:** collapse the dead vertical whitespace when row progress isn't active; replace empty panel with task summary or condensed metadata block
- **Task templates:** add subcategory dropdown + free-text fallback to template create/edit
- **ObservationDashboard.jsx:** tighten tab labels and cross-tab navigation friction (Pete to flag specifics during testing)
- **Calibrations relocation:**
  - Add a fourth tab on `/assets` (alongside Equipment, Consumables, Maintenance) that renders the existing `Calibrations.jsx` table verbatim
  - Reuse the same data fetch, filters, and inline manager
  - Retire the standalone `/calibrations` route OR keep it as a redirect to `/assets?tab=calibrations` (recommend redirect — cheaper to retain external bookmarks)

**No backend changes.**

---

## Phase 5 — Home + Calendar + Notifications + Timesheet analytics

**Web tasks:**
- **Home.jsx:** verify Upcoming pulls role-appropriate tasks; polish empty/loading states
- **Calendar.jsx:**
  - Fix multi-event-per-day expansion so row ownership is visually unambiguous
  - Verify all five event types render correctly: task / observation / training / risk_action / maintenance
- **Notifications.jsx:**
  - Add "Clear all" + per-item dismiss
  - Click-through to target route where one exists; hide chevron where it doesn't
  - Per grow_dev: "if we cannot click through… do not build for V1"
- **Timesheets analysis:** new card/tab on Manage > Timesheets showing time-by-task-type aggregation for budgeting

---

## Phase 6 — Maps (property polygon + GPS track viewer)

**Web tasks:**
- **Property polygon drawing** in `maps-v2/`:
  - Draw/edit polygon UI on the property edit page
  - Save GeoJSON to a new column on `properties` (Alembic migration)
  - Render polygon on Maps V2 and (later) mobile map
  - **Visual only in V1.** No geofence triggers, no entry/exit events. Column shape supports geofencing later — that's a v1.x feature.
- **GPS track viewer** — list of recorded GPS overlays by task/date, render selected track on the map. Backend overlay data already exists from mobile recording flow.
- **Map Maker:** leave as-is per grow_dev ("keep current info as a teaser")

**Backend:** one Alembic migration for property polygon column.

---

## Phase 7 — Profile + unified Insights/Grow auth (Option C — FK + propagation)

**Web tasks:**
- **Profile.jsx:** strip Company section + Subscription section; keep individual settings (name, email, password, training assignments, notification prefs)

**Backend tasks (one Alembic migration + auth changes):**
- Alembic: add nullable `linked_public_user_id` FK on `users` → `public_users.id` (unique constraint on the FK so two `users` can't both point at the same `public_users` row)
- **Grow signup flow** (`auth.py`):
  - Create `users` row as today
  - Check for existing `public_users` row by email
    - If found: link via FK (don't overwrite the password)
    - If not: create new `public_users` row with the same hashed password, link via FK
- **Insights signup flow** (`public_auth.py`):
  - Create `public_users` row as today
  - If a Grow `users` row with that email already exists, link the FK back automatically. No password change.
- **Password reset / change:**
  - Propagate the new hash to the linked row in the same transaction
  - Applies in both directions (Grow password change → public_users hash; Insights password reset → users hash for the linked user)
- **Backfill** (lazy, opportunistic — no big-bang migration):
  - On next successful login of an existing Grow user without a linked `public_users` row, check for a matching email
    - If a public_users row exists: link it (use existing password — don't overwrite); flag for the user that their Insights login may differ
    - If no public_users row: create one with the just-validated password hash and link
  - Same behaviour on the Insights side for existing public_users without a Grow link
- **Edge cases to handle:**
  - Email change on either side must update the other if linked (or unlink — design decision: recommend re-link if new email also matches, else unlink and surface a "your Insights account is no longer linked" notice)
  - Account deletion: cascade or unlink? Recommend unlink (keep `public_users` since it may have content/articles attached; soft-delete on `users`)

**Test pass:**
- New Grow signup → can immediately log into Insights with same credentials
- New Insights signup of an existing Grow user's email → fails with "log in instead" prompt (or auto-links — confirm with Pete)
- Password reset in Grow → next Insights login uses the new password
- Existing Grow user (pre-FK) logs in → public_users row created + linked transparently

---

## Phase 8 — Style consistency sweep

**Web tasks:**
- Catalog inconsistencies first (buttons, cards, forms, typography, spacing) across pages
- Fix in groups using `theme.css` tokens — one group per PR (buttons, then cards, then forms)
- Defer if no concrete checklist emerges — easy to over-scope

---

## Out of scope for first commercial release (recommend, pending Pete confirmation)

- **Roadmapped (separate plan docs to be written):** Insights rebuild - not necessarly (this isn't as big as most insights are similar to that in Auxein Insights webapp), Compliance dashboards, Reports
- **v1.1 candidates:** Training overhaul, GrapeLink integration, Biosecurity (or placeholder), Blockchain visualization, Self-service weather station setup, Property management transfer flow (read-only ships in Phase 3)

---

## Open questions

Resolved 2026-05-11:
- ~~Blocks sort~~ → alphabetical by block name; rows via natural sort comparator
- ~~Unified auth approach~~ → Option C: FK + propagation
- ~~Property polygon scope~~ → visual only in V1, column shape supports future geofencing

Still open:
1. Training / GrapeLink / Weather-station self-service: in scope or v1.1?
PT - I'll work on a detailed scope
2. Insights signup of an existing Grow user's email — fail with "log in instead", or auto-link silently?
Fail with log-in "Account already exists"
3. Email change behaviour when accounts are linked — re-link to new email if found, or unlink and notify?
PT - relink to new email with notification
