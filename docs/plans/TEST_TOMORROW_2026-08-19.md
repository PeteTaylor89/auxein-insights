# Test plan — 2026-08-19

Park point for 2026-08-18. Ordered by risk: §1 is live and affects customers, §2 is a day's work
that has now slipped four times, §3 is the new reporting work, §4-5 are not deployed.

**Nothing was committed on 08-18.** The working tree holds THREE workstreams — reporting, map
printing, and a parallel Insights session's surfaces work. Stage by path (§7).

> **`git stash` is unsafe in this repo.** A stash on 08-18 swept away a parallel session's live
> work and the pop then failed. Recovery was `git show stash@{0}:<path>` written back file by file.
> **`stash@{0}` still exists — drop it once you are satisfied nothing is missing.**

---

## 1. Verify prod — do this first, it is live

Unchanged from 08-18; still not done. The blockchain removal is deployed and the tables are gone.
Route-level checks pass; authenticated **writes** are what remain unverified.

- [ ] **Assign a block to a company** → succeeds and **persists** after a refresh. This is the one
      that was 500ing.
- [ ] **Create a block** → works, and the response no longer carries `blockchain_created`
- [ ] **Split a block** → both halves persist
- [ ] **Transfer management of a property** → every block's `company_id` follows
- [ ] EB environment is Green, not Green-after-a-failed-rollback

---

## 2. Mobile — the six fixes. Still never run.

Committed in `4d7ad1f`, still untested. Displaced on 08-16, 08-17 and again on 08-18.
Full sheet: `docs/plans/MOBILE_TEST_2026-08-17.md`.

```
npm run dev:backend
npm run dev:mobile -- --clear
```
Auxein **dev client**, not Expo Go. `API_URL=http://192.168.1.144:8000/api` in `packages/mobile/.env`.

Order matters — **A3 before A4**:
1. **A1** roll-up children render (`SubTaskPanel`) — the headline fix
2. **A2** issue titles lead with location
3. **A3** observations work offline
4. **A4** photos — five checks, **never once run**

---

## 3. Reporting — built 08-18, backend verified against the DB, UI never opened

The backend is proven: every report matches raw table counts across all 9 companies, and scoping
was re-tested for leaks. **None of the UI has been used.** Local: `npm run dev:pro` (5173) → Insights.

### 3a. Does it appear at all
- [ ] **Reports is the first pill** on `/Insights`, before Climate History.
      It was invisible on the first attempt — `hasPermission` must come from the auth CONTEXT, not
      the standalone helper. If it is missing again, check `localStorage.getItem('userTypeRole')`.
- [ ] Three group buttons — **Operations / Compliance / Resources** — switch the tab row beneath
- [ ] Switching group lands on that group's first report, never a blank panel

### 3b. The two that were reported broken, now fixed
- [ ] **Vineyard census** as Mt Beautiful (company 26) → **22 blocks, 78.82 ha**. It showed 0.
- [ ] **Health & safety** as company 24 → **1 active risk**. It showed 0.

Root cause was company-wide rows (`property_id IS NULL`) being dropped when a company owns no
properties. Greystone is the control — 32 blocks, 52.08 ha, 4 risks; it never broke.

### 3c. Filters
- [ ] Property dropdown narrows the census: Greystone alone = 21, Muddy Water alone = 11
- [ ] On **Outstanding** and **Census** the date inputs are **greyed out** with a tooltip saying
      why, plus a note under the filter bar. They are not meant to be usable.
- [ ] On **Assets** both the property and date filters are greyed out

### 3d. Export — CSV has NEVER worked, on any report
The old buttons built a URL without the `/v1` segment and passed the token in the query string,
which the API ignores entirely. It is now an authenticated blob fetch. **Highest-value check here.**
- [ ] **CSV downloads and opens** on at least: census, H&S incidents, H&S risks, site access
- [ ] The file contains real rows, not an HTML error page
- [ ] A failing export shows **Export failed** on the button rather than doing nothing

### 3e. PDF — never clicked
- [ ] **Vineyard census PDF** — the widest table and the one that paginates. Check the header band,
      logo mark, company name, page numbers, and that the table header repeats on page 2
- [ ] **Health & safety PDF** — two tables in one document; check the second starts cleanly below
      the first rather than overlapping
- [ ] Numbers are formatted, not raw floats (`3.58`, not `3.5812993...`)
- [ ] Pills print as words — `NOT NOTIFIED`, `STILL ON SITE`
- [ ] A report with no data prints "No data for this selection." rather than an empty sheet

### 3f. Permissions
- [ ] Sign in as a **company_user** → the Reports pill is **absent**
- [ ] Same for a **contractor**
- [ ] Backend refuses directly: `GET /api/v1/reports/tasks/summary` as either → **403**

### 3g. The old location is gone
- [ ] Company Admin has **no Reports tab**
- [ ] `/company-admin?tab=reports` falls back to Users rather than erroring
- [ ] The Home quick action now goes to `/Insights`

---

## 4. Web — POIs on a tablet

Map printing is done and accepted. Outstanding:
- [ ] **Tap a POI on a real tablet** → popup opens. MapboxDraw suppresses tap→click; the bridge is
      generic but a desktop touch emulator will not tell you.
- [ ] Sidebar count + fly-to, eye toggle, edit, soft delete, cancel-mid-draw leaves no orphan
- [ ] A second company sees nothing of the first's

---

## 5. Marketing copy — read before deploying, it is public positioning

Four files changed on 08-17, still not read or deployed. The same doc notes the next gap: the site
still sells "GPS-tracked spray tasks" and "spray efficiency heatmaps", both mothballed.

---

## 6. Known data gaps — not bugs, but they shape what the reports can say

- **`Task.actual_hours` is never written by anything.** The model claims it is calculated from
  TimeEntry; nothing assigns it. Hours now come from `TimeEntry.hours` and
  `ContractorAssignment.actual_hours_worked` instead. Prod holds **one time entry, and it has no
  `task_id`, plus zero contractor assignments** — so Work by block will honestly report **0 hours**
  until time is logged against tasks. Worth deciding whether that capture path is a V1 requirement,
  because hours-per-hectare is the headline number of that report.
- **Three companies hold every block with `property_id` NULL** (26, 24, 23). Handled now, but it
  means property filtering does nothing for them.
- **`VisitorVisit` has no `property_id`** — the visitor register is company-wide, so a property
  filter narrows the contractor side of Site access only. The report says so on screen and in the PDF.
- **17 Greystone blocks have no planted date**; the census surfaces this rather than hiding it.
- `auxein_admin` sees only their own `company_id` in every report. Decided: no super-admin view.

---

## 7. Committing — three workstreams, stage by path

**Reporting**
```
backend/api/v1/reports.py  backend/schemas/report.py
packages/shared/src/api/reportService.js  packages/shared/src/utils/permissions.js
packages/web/src/components/reports/**          (9 new files + 5 modified)
packages/web/src/pages/{Insights,CompanyAdmin,Home}.jsx  packages/web/src/pages/Reports.css
packages/web/package.json  package-lock.json        (jspdf + jspdf-autotable)
docs/plans/TEST_TOMORROW_2026-08-19.md
```

**Map printing** (tested and accepted 08-18)
```
packages/web/src/pages/maps-v2/utils/{mapExport,mapChrome,mapIcons,legendModel}.js
packages/web/src/pages/maps-v2/components/MapLegend.jsx
packages/web/src/pages/maps-v2/components/print/PrintDialog.jsx
```

**Not yours** — a parallel Insights session is ACTIVELY writing to this tree:
```
backend/{api/v1/surfaces.py,services/surface_store.py,scripts/index_surfaces.py,scripts/check_surfaces_live.py}
backend/scripts/interpolation/gdd_season.py   packages/insights/**
```

There is still a stray zero-byte file named `-` in the repo root — safe to delete.

---

## 8. Before shipping reporting

1. Everything in §3 passes in a browser
2. Commit reporting and map printing as two separate commits
3. **Backend deploy ships the working DIRECTORY** — a deploy right now would also publish the
   parallel session's in-flight surfaces work. Coordinate before `eb deploy`.
4. Deploy web — it has not shipped since before 08-17, so POIs, map printing and reporting all
   ride on that one deploy
5. Decide on the labour-hours capture gap in §6

## Prod state at park-up
- Alembic head: **`drop_dup_geom_index`** — the reporting work added no migrations
- Backend: deployed, matches `4d7ad1f`; **the 08-18 reporting endpoints are NOT deployed**
- Web + marketing: not deployed · Mobile: not rebuilt
