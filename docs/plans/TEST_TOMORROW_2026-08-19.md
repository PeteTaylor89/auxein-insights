# Test plan — 2026-08-19

Park point for 2026-08-18. Ordered by risk: §1 is live and affects customers, §2 is a day's work
that has now slipped four times, §3 is the new reporting work, §4-5 are not deployed.

**Status 2026-08-19, session start.** All three workstreams are now committed and the tree is
clean of code changes:
- `3acab55` map printing
- `82a3118` reporting (`Reports.css` **did** land in it — 128 lines; the earlier note was wrong)
- `8e225d5` the parallel Insights session's GDD surfaces / Atlas / Pro sites work

`stash@{0}` has been dropped. `git stash` is still unsafe in this repo — a stash on 08-18 swept
away a parallel session's live work and the pop then failed; recovery was `git show
stash@{0}:<path>` written back file by file. Do not use it.

**Nothing below has been deployed.** §7 staging is therefore done; §8 is what remains.

---

## 1. Verify prod — do this first, it is live

Unchanged from 08-18; still not done. The blockchain removal is deployed and the tables are gone.
Route-level checks pass; authenticated **writes** are what remain unverified.

- [*] **Assign a block to a company** → succeeds and **persists** after a refresh. This is the one
      that was 500ing.
- [*] **Create a block** → works, and the response no longer carries `blockchain_created`
- [*] **Split a block** → both halves persist
- [*] **Transfer management of a property** → every block's `company_id` follows
- [*] EB environment is Green, not Green-after-a-failed-rollback

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

### 2b. Two more found by Pete on 08-19 — both FIXED, both untested

Neither was a broken feature. Both were the path to the feature.

**B1 — no way to sign a visitor out, or see who is on site.**
`VisitorsScreen.js` is a complete "who's on site" register: it merges active visitor visits with
active contractor movements, and the row bottom-sheet branches its CTA — `visitorService.signOut()`
for a visitor, `contractorService.checkOut()` for a contractor. It was simply **unreachable**. The
only entry point in the whole app is the on-site chip at `HomeScreen.js:134`, and the context bar
holding it was wrapped in `{properties.length > 0 && ...}`. Property count has nothing to do with
the visitor register, so a user with no properties in scope could sign a visitor IN from the FAB
and then have no route to sign them out. Even when it rendered it read "On site" beside a users
icon with no chevron — a status label, not a route.

Fix: the bar now always renders and **only the property pill** is gated on property count. The chip
gained a chevron, an `accessibilityRole="button"`, and reads **"Who's on site"** when the count is
zero. `marginLeft: 'auto'` keeps it hard right whether or not the pill sits beside it.

- [ ] Home shows the **Who's on site** chip with a chevron, with and without a property selected
- [ ] Tapping it opens the register; the All / Visitors / Contractors filters work
- [ ] Sign a visitor in from the FAB → the chip count goes up → open it → **Sign out** → count drops
- [ ] A contractor row offers **Check out**, not Sign out
- [ ] Confirm the chip still appears for an account whose property scope is empty — that is the
      case that was completely broken

**B1a — the check circle on a rolled-up child completed the task instantly.**
`SubTaskPanel.js` called `completeTask(child.id, {})` — an empty payload, so a tap finished the task
with no start, no hours and no notes. The Undo it offered could never work either:
`backend/api/v1/tasks.py` refuses any update to a completed task (*"Cannot update {status} tasks"*),
which is the same guard the panel already respected when hiding Detach on a finished row.

Fix, per Pete: **the circle no longer completes anything.** Completion follows the standard path —
open the task, start it, complete it with hours and notes. Tapping the circle opens the child rather
than being a dead target. No reopen endpoint is needed, because nothing needs undoing.

- [ ] Tapping the circle on an outstanding child **opens that task** — it does not complete it
- [ ] Completing it properly (open → start → complete with hours + notes) ticks the circle and
      advances the roll-up progress bar
- [ ] The hours entered land on today's timesheet as an entry against that task
- [ ] Detach still works, still shows Undo, and is still hidden on a finished child

**B2 — rolling task entries up to the day total took too many clicks.**
The path was Profile → Timesheet → tap the day → scroll past the entries card → *Roll entries up to
day total* → *Submit*. Five taps and a scroll per day, with no bulk path, so a week ran to ~35 taps.
The roll-up button also sits below the entries list on `TimesheetDayDetailScreen`, so it is below
the fold on any day with a few entries.

A first pass added a one-tap **Roll up** button that set the declared total equal to the entry
total. Pete rejected that: equal is the one answer that is usually wrong, because it forces uncoded
time to zero. The real day is *two tasks at 2 h and 4 h, plus 2 h that was not against a task* —
entries 6, declared 8, uncoded 2.

**The backend already models this exactly.** `TimesheetDay.uncoded_hours` is
`max(day_hours - entry_hours, 0)`, and `recalc()` refuses a declared total *below* the entry total
(*"Task allocations (Xh) cannot exceed day total (Yh)"*), in quarter-hour steps, capped at 24.
Nothing changed server-side.

Fix: a shared **`components/DayTotalSheet.js`**. Rolling up now means *seeding* the total from the
entry hours and handing it over for adjustment — a big stepper at ±0.25, quick chips (`Tasks only`,
`+0.5`, `+1`, `+2`, `+4` **on top of** the coded total), and a live `From tasks + Uncoded → Day
total` breakdown. It mirrors the server's floor, step and ceiling client-side so the errors show
before the round trip rather than as a 400.

It replaces **both** old controls in two places:
- **Month list** — the day card action opens the sheet. Now shown on any editable day, not only one
  with no total, because adjusting is the point; uncoded time is usually remembered after the tasks
  are ticked off. `setDayHours` returns the updated day and it is spliced into state, so no
  scroll-jump.
- **Day detail** — the free-text "Declared day hours" + Save + "Roll entries up to day total" trio
  is gone. Two controls over one field was the original confusion. In its place: an always-visible
  From tasks / Uncoded / Day total grid, and one **Set day total** button.

- [ ] Pete's own case: complete two tasks at 2 h and 4 h, open the day, set the total to **8** →
      From tasks 6.00, Uncoded 2.00, Day total 8.00
- [ ] The sheet opens **seeded with the entry hours** — that seeding is the roll-up
- [ ] `Tasks only` chip returns it to exactly the coded hours and Uncoded reads 0
- [ ] Typing a total **below** the coded hours shows the inline error and disables Save — it must
      never reach the server
- [ ] A non-quarter value (7.1) shows the step error
- [ ] Both entry points give the same sheet and the same result — month list card, and day detail
- [ ] Submitted/approved days show no Set day total button at all
- [ ] Tapping the card body still opens the day detail — the inline action must not swallow that

**B2 revised again, 2026-08-19** — Pete: *"I have 6 hours of entries and only 2 hours on day
total. I want this to be dynamic so the user doesn't have to manually roll up time, only manually
add uncoded time."*

**The model was inverted, and that was the actual bug.** `day_hours` was typed by the user and
`uncoded_hours` was the leftover. That reverses how a day happens: hours arrive by completing
tasks, all day, AFTER any total was declared. So `recalc_hours` checked every completion against a
number typed hours earlier and raised *"Task allocations cannot exceed day total"* the moment the
day ran long.

**And that raise landed mid-write.** `create_entry` flushed the TimeEntry and only then
recalculated; `complete_task` catches the exception and merely logs it. So the entry committed
while `uncoded_hours` and `effective_total_hours` kept their old values — a day listing more task
hours than its own total. Prod's three rows happen to be consistent, but the sequence that breaks
them is live in the code.

Now: **uncoded time is the only figure anyone enters**, and
`effective_total_hours = entry_hours + uncoded_hours`. Completing a task cannot conflict with the
total because it *moves* the total. There is no roll-up — it is continuous. `day_hours` is kept as
a stored mirror so reports and submitted history need no change. `create_entry` also now checks the
24 h cap *before* the row is written, so nothing can half-apply.

Backend: `PATCH /timesheets/days/{id}/uncoded`. `POST .../rollup` is kept as a deprecated no-op
that just recalculates — a phone on an older build still calls it, and a 404 there would read as
"completing tasks is broken". `PATCH /timesheets/days/{id}` with `day_hours` still works and now
means "the day came to N", deriving the uncoded remainder; a total below the coded hours floors at
zero uncoded rather than erroring.

Migration `timesheet_uncoded_input` — **data only, no DDL, applied 2026-08-19.** Re-derives
`entry_hours` from the entries, floors `uncoded_hours`, and sets both `effective_total_hours` and
`day_hours` to their sum. 0 rows violate the new invariant.

Mobile: the sheet is now **Uncoded time** — enter only what wasn't against a task, with a live
`From tasks + Uncoded → Day total` readout and a line saying the total updates itself. The month
card's cells were `From entries / Day total / Effective`, where the last two were two labels for
one number; they are now **From tasks / Uncoded / Day total**.

- [ ] Complete two tasks at 2 h and 4 h → the day total reads **6.00 h with no action taken**
- [ ] Add 2 h uncoded → total 8.00 h; From tasks still 6.00
- [ ] Complete a third task at 3 h → total moves to **11.00 h on its own**, uncoded still 2.00
- [ ] Nowhere in the UI asks you to roll anything up
- [ ] Set uncoded back to 0 via the **None** chip → total returns to the coded hours
- [ ] Off-step (0.1) and a value that would push the day past 24 h both error inline
- [ ] Month card reads From tasks / Uncoded / Day total, and the three agree
- [ ] Submitted/approved days still show no edit control

**Not fixed, noted only.** `TimesheetDayDetailScreen.js` resolves task titles with an N+1 — one
`tasksService.getTask()` per distinct task id. Parallel, but still one request each, so opening a
day with six tasks fires six calls before it settles. Pete declined the batch fix for now.

---

## 3. Reporting — built 08-18, backend verified against the DB, UI never opened

The backend is proven: every report matches raw table counts across all 9 companies, and scoping
was re-tested for leaks. **None of the UI has been used.** Local: `npm run dev:pro` (5173) → Insights.

### 3a. Does it appear at all
- [*] **Reports is the first pill** on `/Insights`, before Climate History.
      It was invisible on the first attempt — `hasPermission` must come from the auth CONTEXT, not
      the standalone helper. If it is missing again, check `localStorage.getItem('userTypeRole')`.
- [*] Three group buttons — **Operations / Compliance / Resources** — switch the tab row beneath
- [*] Switching group lands on that group's first report, never a blank panel

### 3b. The two that were reported broken, now fixed
- [*] **Vineyard census** as Mt Beautiful (company 26) → **22 blocks, 78.82 ha**. It showed 0.
- [*] **Health & safety** as company 24 → **1 active risk**. It showed 0.

Root cause was company-wide rows (`property_id IS NULL`) being dropped when a company owns no
properties. Greystone is the control — 32 blocks, 52.08 ha, 4 risks; it never broke.

### 3c. Filters
- [*] Property dropdown narrows the census: Greystone alone = 21, Muddy Water alone = 11
- [*] On **Outstanding** and **Census** the date inputs are **greyed out** with a tooltip saying
      why, plus a note under the filter bar. They are not meant to be usable.
- [*] On **Assets** both the property and date filters are greyed out

### 3d. Export — CSV has NEVER worked, on any report
The old buttons built a URL without the `/v1` segment and passed the token in the query string,
which the API ignores entirely. It is now an authenticated blob fetch. **Highest-value check here.**
- [*] **CSV downloads and opens** on at least: census, H&S incidents, H&S risks, site access
- [*] The file contains real rows, not an HTML error page
- [*] A failing export shows **Export failed** on the button rather than doing nothing

### 3e. PDF — never clicked
- [*] **Vineyard census PDF** — the widest table and the one that paginates. Check the header band,
      logo mark, company name, page numbers, and that the table header repeats on page 2
- [*] **Health & safety PDF** — two tables in one document; check the second starts cleanly below
      the first rather than overlapping
- [*] Numbers are formatted, not raw floats (`3.58`, not `3.5812993...`)
- [*] Pills print as words — `NOT NOTIFIED`, `STILL ON SITE`
- [*] A report with no data prints "No data for this selection." rather than an empty sheet

### 3f. Permissions
- [*] Sign in as a **company_user** → the Reports pill is **absent**
- [*] Same for a **contractor**
- [*] Backend refuses directly: `GET /api/v1/reports/tasks/summary` as either → **403**

### 3g. The old location is gone
- [*] Company Admin has **no Reports tab**
- [*] `/company-admin?tab=reports` falls back to Users rather than erroring
- [*] The Home quick action now goes to `/Insights`

---

## 4. Web — POIs on a tablet

**Pete's request, now scoped:** *"for types, can we allow a free text (create a type) and have a
small library of icons the user can choose from?"* → **`docs/plans/MAP_POI_CUSTOM_TYPES_2026-08-19.md`**.
Four phases, web only (mobile has no POI support). Cheaper than it looks — `feature_type` is
already a plain VARCHAR, and the `style` JSONB column for `{icon, colour}` already exists and is
never read. **One decision needed before build**: free text lets a user create a "Hazard" type and
rebuild the second hazard register the design explicitly refused, so §2 of that doc proposes a
reserved-word guard that needs your sign-off.

Map printing is done and accepted. Outstanding:
- [*] **Tap a POI on a real tablet** → popup opens. MapboxDraw suppresses tap→click; the bridge is
      generic but a desktop touch emulator will not tell you.
- [*] Sidebar count + fly-to, eye toggle, edit, soft delete, cancel-mid-draw leaves no orphan
- [*] A second company sees nothing of the first's

---

## 5. Marketing copy — DONE 08-19, still unread and undeployed

The 08-17 blockchain scrub (4 files, in `a1b4f81`) plus the mothballed-feature scrub done 08-19.
Pete's call was **reword, do not delete**. Seven claims changed across three files:

| File | Was | Now |
|---|---|---|
| `solutionsData.ts:40` | GPS-tracked spray tasks with automated GrapeLink-compliant diary generation | Block-level spray records with assisted GrapeLink-compliant diary generation |
| `solutionsData.ts:43` | ...alerts, and spray tracking | ...alerts, and spray records |
| `Growfeaturesdata.ts` Map Layers | ...spray efficiency heatmap, and risks | ...points of interest, and risks |
| `Growfeaturesdata.ts` Spray Tasks | ...and GPS-tracked spray run coverage | ...with assisted generation of spray diary records |
| `grow/page.tsx:51` | ...spray efficiency heatmaps... | ...plus points of interest and print-ready map export |
| `grow/page.tsx:57` | complete spray tasks with run tracking | complete spray tasks against the block |
| `grow/page.tsx:79` | alt: GPS tracked spray task | alt: Spray task record with product, rate and block |

**One deletion, not a reword.** `Growfeaturesdata.ts` carried a standalone **GPS Tractor Tracking**
feature entry — "Record GPS tracks for tractor-based tasks with progress logging." Its entire
subject is mothballed, so there was nothing honest to reword it into and the entry was removed.
Restore it if the re-scoped spray insight brings the capability back.

**Left alone deliberately**: `grow/privacy/PrivacyContent.tsx` still describes GPS tracking in six
places. Over-disclosing a permission is safer than under-disclosing it and the Play review may
still expect the copy, so that is a separate decision. See [[project_gps_mothball]].

**Not read by Pete and not deployed.** It is public positioning — read the diff before it ships.

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

## 8. Publishing — BLOCKED 2026-08-19, and why

Pete's decision 08-19: **hold all four deploys** until the parallel session parks, then ship
together. Nothing was built and nothing was deployed.

### The blocker
A parallel Insights session was **actively writing during the 08-19 session** — seven files touched
inside 90 minutes, after that session's first `git status` had come back clean:

```
 M backend/core/public_security.py
 M packages/insights/src/components/surfaces/SurfaceMap.{jsx,css}
 M packages/insights/src/components/surfaces/ZoneOverviewCard.jsx
 M packages/insights/src/services/surfaceService.js
?? alembic/versions/zone_coastal_clip.py
?? backend/scripts/fetch_nz_coastline.py
```

**EB deploys the working DIRECTORY**, so a backend deploy would publish a half-finished
`public_security.py`. The Insights SPA has four source files mid-edit. Both must wait.

Two mitigating facts, both verified rather than assumed:
- **EB does not auto-run migrations.** `backend/.ebextensions/01_python.config` sets only
  WSGI path, static files, `ENV`, instance type and health check — no `container_commands`, and
  `.platform/` holds only an nginx proxy conf. `zone_coastal_clip` would ship as a file and stay
  unapplied.
- `public_security.py` is a **real prod fix**, not scratch work: `HTTPBearer()` defaults to
  `auto_error=True` and raises 403 while RESOLVING the dependency, so `get_optional_public_user`
  rejected every signed-out request and its own `if credentials is None` branch was unreachable.
  That is the Atlas free tier. It wants shipping — just not mid-edit.

### Verified deploy targets (checked against AWS 2026-08-19, profile `eb-cli`)
The v0.1.1 runbook leaves the Pro bucket as a placeholder and the infra memory said
`auxein-grow-web` was "provision pending". **Both were stale — it is live.**

| Target | Bucket | CloudFront | Domain |
|---|---|---|---|
| Pro web | `auxein-grow-web` | `E2DU9CGNMPH53L` | grow.auxein.co.nz |
| Insights SPA | `auxein-insights-webapp` | `E1LDN7KQ7TOFXN` | insights.auxein.co.nz |
| Marketing | `auxein-marketing-site` | `E104EI45ZHSPLU` | auxein.co.nz, www |
| Backend | EB app `auxein-api`, env `auxein-api-prod-lb` | — | api.auxein.co.nz |

### Order, once unblocked
1. Everything in §3 passes in a browser — **CSV first**, it has never worked on any report
2. Parallel session commits `public_security.py`, the surfaces files, `zone_coastal_clip.py` and
   `fetch_nz_coastline.py`; confirm `git status` is clean before touching EB
3. Apply the migration **by name, never bare `upgrade head`**:
   `alembic upgrade zone_coastal_clip` (prod sits one revision behind it)
4. Backend: `cd backend && eb status auxein-api-prod-lb && eb deploy auxein-api-prod-lb`,
   then `curl https://api.auxein.co.nz/api/health`
5. Pro web — this one deploy carries POIs, map printing **and** all ten reports:
   ```
   cd packages/web && npm run build
   aws s3 sync dist/ s3://auxein-grow-web/ --delete --profile eb-cli
   aws cloudfront create-invalidation --distribution-id E2DU9CGNMPH53L --paths "/*" --profile eb-cli
   ```
6. Insights SPA — same shape, `packages/insights` → `auxein-insights-webapp` / `E1LDN7KQ7TOFXN`
7. Marketing — **Next static export, output is `out/` not `dist/`** (`output: 'export'` in
   `next.config`):
   ```
   cd packages/auxein-marketing && npm run build
   aws s3 sync out/ s3://auxein-marketing-site/ --delete --profile eb-cli
   aws cloudfront create-invalidation --distribution-id E104EI45ZHSPLU --paths "/*" --profile eb-cli
   ```

**Ordering matters between 4 and 5**: ship Pro web before the backend and the Reports panel 404s,
because the reporting endpoints are not live yet.

### §6 labour hours — DECIDED
Ship as-is. Work by block reports 0 hours honestly until time is logged against tasks. Not a
blocker; revisit when the capture path exists.

## Prod state at park-up
- **Alembic head in prod: `surface_season_granularity`** (queried directly, single row — the
  earlier `drop_dup_geom_index` note was stale). Local head is `zone_coastal_clip`, one ahead,
  no divergence. The reporting work added no migrations.
- Backend: deployed, matches `4d7ad1f`; **the 08-18 reporting endpoints are NOT deployed**
- Web + Insights + marketing: not deployed · Mobile: not rebuilt
- The stray zero-byte `-` file in the repo root has been deleted.
