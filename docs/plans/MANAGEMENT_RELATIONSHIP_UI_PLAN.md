# Management Relationship UI — Architecture Plan

**Status:** Draft — awaiting review
**Author:** Claude + Peter
**Date:** 2026-04-16
**Scope:** Build frontend UI for the already-existing `ManagementRelationship` backend so a company admin can invite / transfer management of a property to another company.
**Related docs:** `docs/asbuilt/PROPERTIES_MANAGEMENT.md`

---

## 1. Why we're building this

Today, the backend fully supports the concept of one company *owning* a property while a different company *manages* it day-to-day. This is how real NZ vineyard operations work:

- **Estate model:** one company owns land + manages their own vines (owner = manager — single relationship, both FKs point to the same company).
- **Contract-manager model:** landowner owns the property; an external vineyard management company runs the vineyard under contract (owner ≠ manager).
- **Absentee owner + lease:** owner leases the land to an operator who takes full management control.

The backend already encodes all three via `Property.owner_company_id` + `ManagementRelationship.managing_company_id`, and the R5 sync rule keeps `VineyardBlock.company_id` aligned with the *active* managing company so daily operations (tasks, observations, spray records) are always attributed to whoever is actually running the vineyard. **What's missing is a UI.**

The goal of this plan is to deliver the UI with the smallest possible surface area, leaning on the backend primitives that already exist — without introducing a new "management-company type" concept, because the backend treats companies as flat.

---

## 2. What the backend already gives us (verified)

| Primitive | Where | Notes |
|---|---|---|
| `ManagementRelationship` model | `backend/db/models/management_relationship.py:1-47` | Partial unique index enforces *one active manager per property* (lines 24-31) |
| `PropertyOut.active_managing_company_id` | `backend/schemas/property.py:43` | Already enriched on every property list/detail response |
| `GET /v1/properties/{id}/management-history` | `backend/api/v1/properties.py:151-169` | Returns full history (active + past). Permission: `properties.read` |
| `POST /v1/properties/{id}/management-relationships` | `backend/api/v1/properties.py:172-202` | Atomic transfer. Permission: `properties.manage` (auxein_admin + company_admin only) |
| `transfer_management()` service | `backend/services/management_service.py:19-101` | Deactivates current, creates new, syncs block `company_id`, writes blockchain event per block |
| `propertyService.createManagementRelationship()` | `packages/shared/src/api/propertyService.js:42-45` | POST wrapper — already exists |
| `companiesService.getAllCompanies()` | `packages/shared/src/api/companiesService.js` | Used for Maps V2 company dropdowns |

**Intentionally not built on the backend yet** (scope fences):
- No dedicated "management company" entity — `companies` is a flat table.
- No company-to-company invitations — `invitations` model invites a user into a company only.
- No `listManagementHistory` method in frontend propertyService — we'll add this.

---

## 3. Chosen architecture — Option A (generic companies + transfer flow)

We recommend **Option A** over the alternatives considered:

- **Option A (chosen):** All companies are equal. Any company can manage any property. The flow is a *property owner* transfers management *to* a named company (picked from a dropdown). Matches backend reality 1:1.
- **Option B (rejected):** Add `Company.offers_management_services` boolean + separate "Management Companies" directory. *Rejected because:* requires a backend migration, a discovery UI, and ownership of a directory. The backend model is flat — adding a flag here would be a frontend fiction that drifts from the source of truth.
- **Option C (rejected):** Build a true B2B invitation flow (invite an external company by name/email, they accept, management starts). *Rejected for V1 because:* requires extending the `invitations` model to support company-scoped invitations, two-sided acceptance flow, notification plumbing. Out of scope for the as-built gap we're filling. Revisit post-V1 if customers ask.

### High-level flow for Option A

```
Company Admin (owner of property X)
  ↓
Properties tab → select property → "Manage Ownership" action
  ↓
Modal shows:
  - Current active manager (or "Self-managed — you")
  - Button: "Transfer to another company"
  ↓
Transfer form:
  - Select target company (from full company list)
  - Effective date (default today)
  - Contract reference (optional)
  - Notes (optional)
  - Confirm warning: "This transfers management of property X + all its N blocks to <company>. Blocks will be reassigned to the new managing company. This is logged on the blockchain."
  ↓
Submit → POST /v1/properties/{id}/management-relationships
  ↓
Backend: transfer_management() — atomic
  ↓
UI: success toast, refresh properties list, show new active manager
```

### Why this works with a flat company model

The "target company" dropdown is just *all companies* from `GET /companies`. An auxein admin sees all; a company admin sees companies they're allowed to see via existing company visibility rules (TODO: verify company visibility scoping for non-admin users — see §8 Open Questions).

The system doesn't care whether the target company is a "vineyard management company" or just another landowner — both are valid targets. This keeps UI behaviour aligned with what the backend allows.

---

## 4. UI surface area

### 4.1 Properties table — new column + affordance

**File:** `packages/web/src/pages/CompanyAdmin.jsx` → `PropertiesTab`

Add a **Management** column between *Climate Zone* and *Blocks*:

| State | Display |
|---|---|
| Owner-managed (owner_company_id == active managing_company_id) | Chip: `Self-managed` (grey) |
| Externally managed | Chip: `Managed by <Company Name>` (blue) |
| No active management | Chip: `Unmanaged` (amber) — only possible if relationship was ended without replacement |

Each chip is clickable → opens the **Management modal** (§4.2).

For the Actions column, the existing edit pencil stays. No new action button needed on the row itself.

### 4.2 Management modal — `<PropertyManagementModal>`

**New file:** `packages/web/src/components/admin/PropertyManagementModal.jsx`

Slide-in panel (reuse `.v2-form-panel` pattern from Maps V2 modals for consistency).

**Sections:**

1. **Property summary** (read-only): name, owner company, area, block count.
2. **Current management** — card showing:
   - Active managing company name + logo/initial
   - Start date of current relationship
   - Contract reference (if any)
   - Notes (if any)
   - Small "View history" link → expands §4.3
3. **Actions** (permission-gated: `properties.manage` i.e. company_admin OR auxein_admin only):
   - Primary: **Transfer Management** → opens §4.4 form inline.
   - Secondary (only if currently externally managed): **End Management** → opens §4.5 confirm (note: backend currently doesn't have a standalone "end without replacement" endpoint — see §8 Open Questions).

### 4.3 History panel (expandable)

Rendered inside the management modal when "View history" is toggled.

Calls `GET /v1/properties/{id}/management-history`. Renders a timeline list:

```
● 2026-04-10 → now  — Riverside Vineyard Management Ltd (active)
    Ref: CONTRACT-2026-042
○ 2024-01-15 → 2026-04-09 — North Valley Estate (self-managed)
○ 2022-08-01 → 2024-01-14 — Previous Owner Co
```

All historical rows are read-only. No edit/delete of history (audit trail).

### 4.4 Transfer form (inline within modal)

Fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| Target company | `<select>` | ✅ | Populated from `companiesService.getAllCompanies()`. Excludes current managing company (disabled option). Reuses `useAvailableCompanies` hook from Maps V2. |
| Effective date | `<input type="date">` | ✅ | Defaults to today. Backend accepts any date; we'll prevent future dates >30 days out in frontend. |
| Contract reference | `<input type="text">` | ❌ | Free text, e.g. "MSA-2026-017" |
| Notes | `<textarea>` | ❌ | Free text |

**Confirmation step before submit** — show a summary box:

> You are about to transfer management of **"North Valley Estate"** (12.4 ha, 8 blocks) from **North Valley Estate Ltd** to **Riverside Vineyard Management Ltd**, effective **2026-04-16**.
>
> All 8 blocks will be reassigned to Riverside Vineyard Management Ltd. This action is recorded on the property's blockchain audit trail and cannot be undone from the UI (a new transfer would be needed to revert).

Requires typed confirmation (user types the target company name) before submit button enables — same pattern we use elsewhere for destructive-ish actions.

### 4.5 End management (deferred — needs backend work)

Not shipping in V1. Requires a backend `DELETE /v1/properties/{id}/management-relationships/{rel_id}` or `end_management()` service function. See §8 Open Questions.

---

## 5. Frontend API changes

**File:** `packages/shared/src/api/propertyService.js`

Add one new method:

```js
getManagementHistory: (propertyId) =>
  apiClient.get(`/v1/properties/${propertyId}/management-history`).then(r => r.data),
```

No other API additions needed. `createManagementRelationship()` already exists (line 42).

---

## 6. Permissions & visibility

| Action | Who can do it |
|---|---|
| View current manager on properties table | Anyone with `properties.read` (manager, user, admin) |
| View management history | Anyone with `properties.read` |
| Open management modal | Anyone with `properties.read` (read-only for non-admins) |
| Click "Transfer Management" | company_admin + auxein_admin only (backend-enforced via `properties.manage`) |
| See target-company dropdown | Same — only shown to users with `properties.manage` |

Frontend gate uses the already-fixed `userTypeRole === 'company_admin' || userTypeRole === 'auxein_admin'` pattern from `PropertiesTab` (`CompanyAdmin.jsx:193`).

---

## 7. Implementation phases

**Phase 1 — Read-only visibility** (ship first)
1. Add `getManagementHistory()` to `propertyService.js`
2. Add "Management" column to properties table with chip display
3. Build `<PropertyManagementModal>` in read-only mode (sections 4.2 current-management + 4.3 history)

Phase 1 delivers value immediately: users can see who manages what, with full history. Zero risk of destructive action.

**Phase 2 — Transfer flow**
4. Build §4.4 transfer form inside the modal
5. Wire `createManagementRelationship()`
6. Add confirmation step with typed-name confirmation
7. Refresh the properties list on success

**Phase 3 — Polish**
8. Loading / error / empty states
9. Toast notifications for success/failure
10. Audit-trail display polish (icons, hover tooltips)

**Out of scope for now:**
- End-without-replacement flow (needs backend)
- Company-to-company invitations (separate epic)
- Multi-property bulk transfer (can be added later if needed)
- Management-company discovery / marketplace UI (Option B/C territory)

---

## 8. Open Questions (resolve before building)

1. **Company visibility for non-admin users** — when a company_admin of Company A opens the dropdown, should they see *only* companies they have an existing relationship with, or *all* companies in the system? This affects whether we need a backend `/v1/companies/visible-to-me` endpoint. **Proposed default:** auxein_admin sees all; company_admin sees all (same as Maps V2 parcel/block assignment). Revisit if privacy concerns arise.

2. **End without replacement** — backend has no "end management without naming a successor" endpoint. Is "unmanaged" a valid state a UI should support? Per the partial unique index, a property *can* have zero active relationships (new properties do, until first relationship is created). **Proposed:** add a minor backend endpoint `POST /{id}/management-relationships/{rel_id}/end` in a later pass; out of scope here.

3. **Who initiates the transfer?** Currently the flow assumes the *property owner* transfers management *to* another company (push). An alternative is the *prospective manager* requests to take over (pull + owner approves). **Proposed:** V1 does push only (owner decides). Pull/approval needs the invitation model and is deferred.

4. **Notifying the new manager** — when management is transferred to Company B, should Company B's admins get a notification? The notification system (`backend/services/notification_service.py`) exists. **Proposed:** yes, as a small backend addition inside `transfer_management()` — a notification for each admin of the new managing company. Cheap to add, large UX win. Flag as a follow-up.

5. **Self-managed display logic** — how do we detect "self-managed"? Rule: `active_managing_company_id == owner_company_id`. We already have both fields on `PropertyOut`. No backend change needed.

6. **Can a company_admin transfer away a property their own company owns?** Backend says yes (`properties.manage` permission is tied to company admin of the *owner* company, verified inside the endpoint). Yes, confirm this matches the intent.

---

## 9. Files to touch

### New
- `packages/web/src/components/admin/PropertyManagementModal.jsx`
- `packages/web/src/components/admin/PropertyManagementModal.css` (or reuse CompanyAdmin.css)

### Modified
- `packages/web/src/pages/CompanyAdmin.jsx` — `PropertiesTab`: new Management column, modal state, handlers
- `packages/web/src/pages/CompanyAdmin.css` — chip variants: `ca-chip-btn--self-managed`, `--external`, `--unmanaged`
- `packages/shared/src/api/propertyService.js` — add `getManagementHistory()`

### Backend (zero changes in Phase 1–2)
All backend primitives needed already exist and are verified in §2. Only §8 open questions might require small additions later.

---

## 10. Verification plan

### Phase 1 acceptance (read-only)
1. As auxein_admin, go to Company Admin → Properties. New "Management" column visible with chip per property.
2. Click a chip → modal opens showing current manager, start date, contract ref.
3. Expand history → see all past relationships in timeline order.
4. As company_user, same modal opens read-only, no transfer button visible.
5. API: `GET /management-history` returns 200 with expected shape.

### Phase 2 acceptance (transfer)
1. As company_admin, open modal → click Transfer → form renders, company dropdown populated.
2. Submit without typing confirmation → button disabled.
3. Type target company name → button enables → submit.
4. Network: `POST /management-relationships` called with correct payload.
5. Success: modal refreshes, shows new active manager, old manager moved to history.
6. Verify blocks: `GET /blocks` shows affected blocks now have `company_id == new_managing_company_id`.
7. Verify blockchain: query chain events for one affected block, see `management_transfer` event.

### Build
- `npx vite build` from `packages/web/` → no errors
- No backend changes → no `alembic upgrade` needed

---

## 11. Non-goals (to prevent scope creep)

- Building a "find a vineyard management company" directory
- Public / external invitations (a company manager outside the system cannot be invited through this flow — they need an account first, which is the existing `InviteTab` flow for users)
- Automated contract-expiry workflows
- Multi-party / partial management splits
- UI for bulk transfers across multiple properties at once
