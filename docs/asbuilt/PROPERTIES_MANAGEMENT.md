# Properties Management — As-Built Documentation

**Module:** Company Admin → Properties Tab + Maps V2 Block/Parcel Assignment
**Last updated:** 2026-04-16
**Status:** Built — needs UX polish (see Known Issues section)

---

## 1. User Workflow

### Who Can Do What

| Role | Create Property | Edit Property | Delete Property | Assign Blocks | Assign Users | Transfer Management |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Auxein Admin** | ✅ | ✅ | ✅ (system admin page) | ✅ | ✅ | ✅ (API only, no UI) |
| **Company Admin** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| **Company Manager** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Company User** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Contractor** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Company Admin Workflow

**Step 1 — Create a Property Unit**
- Navigate to *Company Admin → Properties*
- Click **+ New Property**
- Fields: name (required), region, area (ha), climate zone, address
- Submitting calls `POST /v1/properties/`. The new property has `owner_company_id` = the current user's company.

**Step 2 — Assign Blocks**
- Click the *N blocks* link on a property row
- A slide-open panel lists all blocks visible to the user
- Tick/untick to assign — saves immediately
- Blocks already assigned to other properties show a warning and are dimmed

**Step 3 — Assign Users**
- Scroll to the *User Property Assignments* matrix
- Click the cell at row=user, column=property to toggle access
- An empty cell (`~`) means the user sees **all** properties (default fallback for backwards compatibility)
- A tick means the user is scoped to that property only

**Step 4 — Edit Property**
- Click the edit pencil in the Actions column to enable inline editing
- Save / Cancel buttons replace the row

---

## 2. Data Model

```
┌────────────────┐       ┌────────────────────────┐       ┌────────────────┐
│    Company     │       │ ManagementRelationship │       │    Property    │
├────────────────┤       ├────────────────────────┤       ├────────────────┤
│ id             │◄──────┤ managing_company_id    ├──────►│ id             │
│ name           │       │ property_id            │       │ name           │
│                │       │ start_date / end_date  │       │ address        │
│                │       │ is_active (bool)       │       │ region         │
│                │       └────────────────────────┘       │ total_area_ha  │
│                │                                         │ climate_zone_id│
│                │◄────────────────────────────────────────┤ owner_company_ │
│                │         owner_company_id                │   id           │
│                │                                         │ forecast_lat/lng│
│                │       ┌────────────────────────┐       │ grapelink_*    │
│                │       │ UserPropertyScope      │◄──────┤                │
│                │       ├────────────────────────┤       └────────┬───────┘
│                │       │ user_id                │                │
│                │       │ property_id            │                │ (optional)
│                │       └────────────────────────┘                │
│                │                                                  │
│                │       ┌────────────────────────┐                 │
│                │◄──────┤ VineyardBlock          ├─────────────────┘
│                │       ├────────────────────────┤
│                │       │ id                     │
│                │       │ company_id (required)  │ ← R5 sync field
│                │       │ property_id (optional) │
│                │       │ block_name, variety... │
│                │       └────────────────────────┘
└────────────────┘
```

### Key Relationships

| Field | Meaning |
|-------|---------|
| `Property.owner_company_id` | Who owns the land title |
| `ManagementRelationship.managing_company_id` | Who currently manages the property (can differ from owner — e.g. a vineyard management company) |
| `VineyardBlock.company_id` | Who owns/operates the block. **R5 rule**: synced from ManagementRelationship via `transfer_management()` |
| `VineyardBlock.property_id` | Optional organisational grouping under a property |
| `UserPropertyScope` | Which properties a non-admin user can see |

### Why Properties Matter

- **Data scoping** — tasks, observations, risks, assets all filterable by property
- **Climate zones** — property determines weather station and climate projections
- **Compliance** — GrapeLink, SWNZ certifications are per-property
- **Reporting** — property-level rollups for yield, disease pressure, spray coverage
- **Multi-party management** — vineyard management companies can manage multiple owners' properties via `ManagementRelationship`

---

## 3. Data Flows

### Create Property
```
UI (PropertiesTab.handleCreate)
  → propertyService.createProperty(payload)
  → POST /v1/properties/
  → Backend: permission "properties.create"
  → DB: INSERT properties (owner_company_id = current user's company)
  → Returns PropertyOut
  → UI: refresh list
```

### Assign Block to Property
```
UI (block checkbox in assignment panel)
  → blocksService.updateBlock(blockId, { property_id: X })
  → PUT /v1/blocks/{block_id}
  → Backend: setattr(block, 'property_id', X)
  → DB: UPDATE vineyard_blocks SET property_id = X
  → UI: optimistic state update
```

### Assign User to Property
```
UI (scope cell toggle)
  → companyAdminService.setUserPropertyScopes(userId, [propIds...])
  → PUT /v1/company-admin/users/{user_id}/property-scopes
  → Backend: permission "users.update", same-company verification
  → DB: DELETE all UserPropertyScope for user; INSERT new rows
  → UI: scope state updated
```

### Property Visibility Resolution (on every page load)
```
GET /v1/properties/
  → Backend: get_visible_property_ids(current_user)
    1. auxein_admin → ALL
    2. contractor → []
    3. company_admin → all where (managing_company_id = company_id AND is_active)
                       OR (owner_company_id = company_id)
    4. manager/user with scope rows → only UserPropertyScope.property_id
    5. manager/user without scopes → defaults to company properties
  → DB: SELECT properties WHERE id IN visible_ids
  → Returns PropertyOut[] with active_managing_company_id enriched
```

### Management Transfer (R5 Sync) — *API only, no UI yet*
```
POST /v1/properties/{property_id}/management-relationships
  → services/management_service.transfer_management()

Atomic transaction:
  1. Deactivate current ManagementRelationship (is_active=False, end_date=yesterday)
  2. INSERT new ManagementRelationship (is_active=True)
  3. UPDATE vineyard_blocks SET company_id = new_managing_company_id WHERE property_id = X
  4. INSERT blockchain event (management_transfer) for each block
  5. COMMIT
```

---

## 4. Maps V2 Block + Parcel Assignment (Auxein Admin)

### Block → Company Assignment
- Click any block on the map
- If auxein admin: popup shows **Edit Block** + **Assign Company** buttons
- Assign Company opens a modal with:
  - Read-only block info (name, variety, area, current company)
  - Warning if block is assigned to a property
  - Target company dropdown
- Submitting calls `PATCH /v1/blocks/{id}/assign-company`
- Backend creates blockchain chain event for the assignment

### Parcel → Company Assignment
- Auxein admin sees ALL LINZ parcels in viewport (zoom 12+)
- Company admin sees only their assigned parcels
- Click a parcel:
  - Unassigned + admin → **Assign to Company** button → modal with company, ownership type, percentage, verification, notes
  - Assigned + admin → **Remove Assignment** button (confirm dialog)
  - Non-admin → read-only popup
- Backend: `POST /parcels/{id}/assign-company` and `DELETE /parcels/{id}/company-assignment`

---

## 5. Known Issues / Pending Improvements

See `BUGS.md` for tracking. Current open items:
- `Blocks` button on properties table hard to read
- Block-assignment checkboxes in panel may not toggle reliably (state sync issue)
- No "Create Another" workflow after creating a property (form closes)
- Management Relationship UI not yet built — currently API-only
- No UI to create a "management company" type entity, or to invite an external company to manage a property

---

## 6. Files

### Frontend
- `packages/web/src/pages/CompanyAdmin.jsx` — PropertiesTab component
- `packages/web/src/pages/maps-v2/MapsPage.jsx` — block/parcel popup integration
- `packages/web/src/pages/maps-v2/components/drawing/BlockCompanyAssignModal.jsx`
- `packages/web/src/pages/maps-v2/components/drawing/ParcelAssignmentModal.jsx`
- `packages/web/src/pages/maps-v2/components/shared/MapPopup.jsx` — BlockPopupContent + ParcelPopupContent
- `packages/web/src/pages/maps-v2/hooks/useAvailableCompanies.js`
- `packages/web/src/pages/maps-v2/hooks/useParcelsLayer.js`
- `packages/shared/src/api/propertyService.js`
- `packages/shared/src/api/blocksService.js`
- `packages/shared/src/api/parcelsService.js`
- `packages/shared/src/api/companyAdminService.js`

### Backend
- `backend/api/v1/properties.py` — property CRUD + management relationships + user scopes
- `backend/api/v1/blocks.py` — block CRUD + `/assign-company` endpoint
- `backend/api/v1/company_admin.py` — user property scope management
- `backend/services/management_service.py` — `transfer_management()` with R5 sync
- `backend/services/property_service.py` — `get_visible_property_ids()`
- `backend/db/models/property.py`, `management_relationship.py`, `user_property_scope.py`
- `backend/schemas/property.py` — Pydantic schemas
