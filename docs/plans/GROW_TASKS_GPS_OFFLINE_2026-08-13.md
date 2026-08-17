# Grow — task roll-up drag, GPS mothball, offline/image rebuild

**Built 2026-08-13. Nothing tested, nothing committed, nothing deployed.**
Test / commit / publish scheduled for 2026-08-14.

> **Status 2026-08-15.** The 08-13 batch was committed (`19af60c`, then `e372b02` for the app
> variants) and field-tested — §2.1, §2.2, §2.4, §2.5 and **all of §2.6** pass. Five defects came
> out of that test; all five are now built and are covered by **§6** at the foot of this document.
> **§2.7 remains the open gate** — it was blocked by the observation-offline defect, which §6 fixes.

---

## 1. What was built

Four phases, all **frontend only**. No backend file was changed and no migration was
written — this matters for the deploy plan below.

| # | Area | Summary |
|---|------|---------|
| 1 | Web | Drag a task onto an existing roll-up on the task list, + "Add to roll-up…" in the bulk bar |
| 2 | Web + Mobile | GPS task tracking and spray-coverage UI mothballed (wiring + exposure removed, nothing deleted) |
| 3 | Web | `TaskDetail` restyled on the assets-dashboard idiom; inline `<style>` extracted to `TaskDetail.css` |
| 4 | Mobile | Offline write queue wired up end to end; durable photo pipeline; Field Notes roll-up; `TaskDetailScreen` clean-up |
| 5 | Mobile config | Store-compliance plumbing: permissions cut, `eas.json` env + iOS submit, service-account key gitignore hole closed |

### Files touched today

**Web** — `pages/ObservationDashboard.{jsx,css}`, `pages/TaskDetail.jsx`, **new**
`pages/TaskDetail.css`, `pages/TaskCreationWizard.jsx`, `pages/vineyard-pages.css`,
`help/helpContent.jsx`, `pages/maps-v2/MapsPage.jsx`,
`pages/maps-v2/components/management/TasksPanel.jsx`

**Mobile** — `App.js`, `package.json`, `src/api/{api,services}.js`,
`src/services/{writeQueue,syncCoordinator}.js`, **new** `src/services/{photoStore,uploadQueue}.js`,
`src/hooks/useImageCapture.js`, `src/components/{OfflineBanner,FeedItemModal,index}.js`,
**new** `src/components/EntityPhotos.js`,
`src/screens/{TaskDetailScreen,CreateTaskScreen,SpotCaptureScreen}.js`

**Config** — `packages/mobile/{app.json,eas.json}`, root `.gitignore`,
`docs/plans/MOBILE_DEPLOYMENT_STATUS.md`

Every source file parses under esbuild; both JSON files parse. That is the only verification performed.

---

## 2. Test plan

Order matters — the mobile offline tests depend on a backend that has the roll-up endpoints.

### 2.0 Pre-flight (do first)

- [*] `SELECT version_num FROM alembic_version;` — expect **`surface_index_tables`** (applied to
      prod 2026-08-13 by the parallel Insights session). Today's changes need **no** migration;
      just confirm where you stand before touching prod.
- [*] Confirm prod EB build date. Per memory it is **2026-07-15**, which predates the roll-up
      endpoints — see the silent-failure warning in §2.3.

### 2.1 Web — task roll-up drag (`/observations`, Tasks tab)

- [*] Roll-up parent rows show the enlarged chevron; it fills solid olive when expanded.
- [*] Hovering a plain task row shows the drag grip; a roll-up parent does **not** (can't nest).
- [*] A `completed`/`cancelled` task shows **no** grip (the API would refuse the update).
- [*] Drag a task onto a collapsed roll-up → band closes around the single row; drop reparents,
      auto-expands, toast appears.
- [*] **Undo the toast** → task returns to top level.
- [*] Drag onto an *expanded* roll-up, hovering over a child row → the whole group stays
      highlighted (this is the `data-rollup-group` strobe fix; watch for flicker).
- [*] Drag and release outside any roll-up → nothing happens, no error.
- [*] Bulk bar: select 2+ tasks → **Add to roll-up…** lists existing roll-ups with child counts →
      choose one → all reparent atomically; undo restores each to its previous parent.
- [ ] Select a task that is *already* in roll-up A, add it to roll-up B → moves cleanly. - unable to select to perform a move from one rollup to another.

the filters button on the task management page needs a larger arrow like on the parent task. 

### 2.2 Web — GPS/spray gone, TaskDetail restyle

- [*] Task detail: no GPS row, no spray-coverage badge, no "Require GPS tracking" in Edit.
- [*] Task creation wizard: no GPS checkbox, no spray-readiness checklist. Sprayer badge and
      **Target rate** input are still there (deliberately kept — ordinary planning data).
- [*] Create a task from a template that has `requires_gps_tracking` on → task is created
      **without** it. (Template flag is intentionally still settable but now inert.)
- [*] Maps V2: no GPS Tracks panel, no track layer, no GPS entries in the legend, no per-task
      track button in the Tasks panel. Map click behaviour otherwise unchanged.
- [*] Task detail page is **white**, not sand; back button matches the one on observation Run
      Capture; header card carries the accent top border like the assets dashboard.
- [*] Task detail with no description → left column shows the empty-state card, not a gap.
- [*] Field Notes card still renders and **Copy** still works.
- [*] Help popovers on task templates / assets / calibrations no longer claim GPS is required.
- [*] **Regression sweep:** the removed `td-*` block in `vineyard-pages.css` was verified unused
      elsewhere, but eyeball any other page using `vp-page` for unintended change.

### 2.3 Mobile — setup

JS-only for testing: **no EAS rebuild needed**. `expo-file-system` was added to `package.json`
but is already a direct dependency of `expo@54`, so the native module is in the current dev
client (v0.1.1 build 8).

```
npm run dev:mobile          # cd packages/mobile && npx expo start
```
Open the **Auxein dev client** (not Expo Go — Mapbox won't load), same network as the PC.

> **Point at a local backend for anything involving roll-ups.** Prod EB predates those endpoints
> and **both failure modes are silent**: a missing endpoint 404s into an empty picker, and
> `TaskCreate` has no `extra="forbid"` so an unknown `parent_task_id` is dropped and you get a
> 201 with an orphan. Set `API_URL=http://192.168.1.144:8000/api` in `packages/mobile/.env`,
> run `npm run dev:backend`, and **restart Expo with `--clear`** (`app.config.js` is read at
> dev-server start). Note the local backend still talks to the **prod RDS** — test data is live data.

### 2.4 Mobile — GPS removal

- [*] Task detail: no GPS cards in any state, no full-screen tracking overlay.
- [*] Start a task → starts immediately, no "Start GPS recording?" prompt.
- [*] Complete a task → no stop-tracking step, completion still logs hours and notes.
- [*] Create task screen: no "Track GPS during this task" toggle.

### 2.5 Mobile — Field Notes

- [*] On a task with rows carrying `issues_found` and/or `notes`, a **Field notes** card appears
      under the task card with the count in its subtitle.
- [*] Issues sort above plain notes; rows sort naturally (2 before 10, not 10 before 2).
- [*] Complete-task sheet shows **Insert field notes (n)** → appends into completion notes,
      preserving anything already typed.
- [*] A task with no row notes shows **no** Field notes card at all.

Mobile rolled up tasks do not display. When entering into a parent task, none of the daughter tasks exist - these need to surface to allow field completion. 
On Issues to tasks, the block name and row number/name need to be raised into the title - EG Block 4, Row 18 - Broken wire. This is as some may group tasks by issue type, some by block

### 2.6 Mobile — offline writes (the important one)

Do this as one continuous sequence; it exercises queue ordering, reference resolution and the
photo handler together.

- [*] Online first, as a control: complete a row, raise it as an issue into a **new** roll-up,
      attach a photo. Confirm all three landed server-side.
- [*] **Aeroplane mode on.**
- [*] Banner turns red and stays up: "Offline — N changes waiting to sync".
- [*] Complete a row → screen advances as if saved.
- [*] Raise the issue as a task into a **new** roll-up (this is the ordering test: child references
      a parent that is itself queued).
- [*] Attach a photo to it.
- [*] **Force-quit the app.** Reopen — still offline. Banner still shows the pending count, i.e.
      the queue survived the restart.
- [*] **Aeroplane mode off.** Banner goes amber → "Syncing…" → green "All changes synced", then hides.
- [*] Server check: the roll-up parent exists, the issue task exists **with `parent_task_id` set to
      the real parent** (not null — that's the orphan failure mode), and the photo is attached
      to the issue task.
- [*] Tap the amber banner while pending → forces a sync immediately.
- [*] **Failure-path test:** queue something, then make it fail with a 4xx (e.g. complete an
      already-completed row). It should be **dropped**, not retried forever, and the queue drains.

### 2.7 Mobile — photos

Observation templates do not load or work offline - therefore no observations work offline. 

- [ ] Capture a photo offline, force-quit before reconnecting → photo still uploads on reconnect.
      (This is the core of the "photos vanish" fix — the file now lives in the document dir.)
- [ ] Remove a photo from the picker before submitting → it doesn't upload, and doesn't linger.
- [ ] Task detail shows a **Photos** strip for a task that has server-held photos; tap → full-screen
      viewer; tap again → close.
- [ ] View photos once online, then go offline and reopen the task → **photos still render**
      (disk cache).
- [ ] A task with no photos shows no Photos card and no empty box.

### 2.8 Store-compliance config (verify at build time, not over Metro)

`app.json` / `eas.json` changes do **not** reach the running dev client — they only take effect in
a fresh EAS build. So these are checked on the release build, not tomorrow's Metro session.

- [ ] `git check-ignore packages/mobile/google-play-service-account.json` reports a match
      (already verified; re-check after any `.gitignore` merge).
- [ ] Fill the two placeholders in `eas.json` → `submit.production.ios`: `ascAppId` and
      `appleTeamId`, from App Store Connect. **`eas submit --platform ios` will fail until then.**
- [ ] After the release build: on Android, Settings → Apps → Auxein Grow → Permissions shows
      **Location** and **Notifications** only — no foreground-service entry.
- [ ] iOS: location prompt copy no longer mentions recording tractor activity, and the app has no
      background-location indicator.
- [ ] Confirm GPS-dependent flows genuinely still work without the removed permissions: an
      observation spot, an incident and a contractor check-in must all still capture coordinates.
      **This is the regression risk of the permission cut** — those use one-shot `expo-location`
      reads, which need only when-in-use, but verify rather than assume.

---

## 3. Commit plan

Pete runs all git commands. Suggested split so the history stays legible — the working tree also
holds unrelated in-flight work (Insights WS3 / surfaces / BoP ingestion) that should **not** ride
along.

**Stage explicitly by path. Do not `git add -A`.**

1. **Web — roll-up drag**
   `packages/web/src/pages/ObservationDashboard.jsx`, `ObservationDashboard.css`
2. **GPS + spray mothball** (web + mobile together — one decision, one commit)
   `packages/web/src/pages/TaskCreationWizard.jsx`, `pages/maps-v2/MapsPage.jsx`,
   `pages/maps-v2/components/management/TasksPanel.jsx`, `help/helpContent.jsx`,
   `packages/mobile/src/screens/CreateTaskScreen.js`
   *(TaskDetail.jsx and TaskDetailScreen.js also carry mothball changes — fold them in here or
   into their restyle commits, but don't split a single file across two commits.)*
3. **Web — TaskDetail restyle**
   `packages/web/src/pages/TaskDetail.jsx`, **new** `TaskDetail.css`, `pages/vineyard-pages.css`
4. **Mobile — offline write + photo queue**
   `packages/mobile/App.js`, `package.json`, `src/api/*`, `src/services/*`,
   `src/hooks/useImageCapture.js`, `src/components/*`, `src/screens/SpotCaptureScreen.js`
5. **Mobile — field notes + task screen clean-up**
   `packages/mobile/src/screens/TaskDetailScreen.js`
6. **Mobile — store compliance**
   `packages/mobile/app.json`, `packages/mobile/eas.json`, `.gitignore`,
   `docs/plans/MOBILE_DEPLOYMENT_STATUS.md`
   *(Commit the `.gitignore` change **first**, on its own, if there's any chance of a service
   account key landing in the working tree before then.)*

Convention reminders: no `"` in commit titles or bodies; title plus tight bullets by area; no
deployment recap.

---

## 4. Deploy plan

### Backend — NOT required
Today's work changed **no backend file** and needs **no migration**. Do not deploy EB for this.

> **If you deploy EB for any other reason, know that `eb deploy` ships the working DIRECTORY, not
> git HEAD.** The tree currently contains untracked/modified backend work for Insights surfaces
> (`backend/api/v1/surfaces.py`, `core/entitlements.py`, `main.py`, `realtime_climate.py`,
> `seo.py`, `public_user.py`, `requirements.txt`). Its migration
> `alembic/versions/surface_index_tables.py` is already **applied** to prod but the file is still
> untracked. A casual deploy publishes all of that code. Either finish that work deliberately or
> stash it first.

### Web (Grow) — required
1. `npm run build:pro` (Pete runs builds).
2. Sync `packages/web/dist` to the Grow S3 bucket, invalidate CloudFront.
3. Prod web is at **2026-06-23** per memory, so this release also carries the **entire undeployed
   Grow beta backlog**: commit `8e682c1` (all beta web items) and the five beta bug fixes from
   2026-08-05, none of which have ever been UI-tested in prod.
   **Budget test time for that backlog, not just today's four phases.**

> Those earlier commits assumed backend endpoints that ARE deployed (their migrations were applied
> to prod), so the risk is UI regressions rather than 404s — but it is a much larger surface than
> one day's work.

### Mobile — staged
- **Testing tomorrow:** Metro only, no build. Covered in §2.3. The `app.json` / `eas.json` changes
  are invisible over Metro — they are build-time config.
- **Store release:** only after §2.6 and §2.7 pass in the field.
  **A rebuild is now unavoidable** (it wasn't before the compliance work): `app.json` permissions
  changed, and permissions are baked into the native binary.
  1. Fill the two `eas.json` iOS submit placeholders.
  2. `npm run bump:build` (lockstep iOS/Android build numbers).
  3. **Commit `app.json`, `eas.json` and `package.json` before building** — `eas build` ignores
     uncommitted changes to them.
  3. `eas build --platform all`, then `eas submit`.
  4. Add a What's New line covering: offline capture that survives losing signal, photos that no
     longer go missing, and GPS tracking removed.

---

## 5. Known gaps / deliberate omissions

- **Optimistic reads.** A task created offline won't appear in the cached task list until it
  syncs — the write queue is durable but the read cache isn't aware of pending writes.
- **Idempotency.** Only requests that provably never reached the server are queued (no
  `error.response`). A 5xx is *not* queued, because the server may have applied it and there are
  no idempotency keys server-side. Widening this needs a backend change first.
- **Photo downscaling.** `expo-image-manipulator` is absent; adding it is a new native module and
  **would** require an EAS rebuild. Photos are recompressed (quality 0.5, no EXIF) but not
  resized, so they're still ~1–2MB.
- **Template GPS flag.** Still settable and still shown as a chip, but now inert. Pete declined
  removing it; help copy says it's inactive. Revisit if it confuses anyone.
- **Insights Spray Program tab** left in place on purpose — it is the shell for a re-scoped spray
  insight, not an oversight.
- **Roll-up drag** can't move a child directly between roll-ups (detach first), and can only reach
  roll-ups rendered on the current page — the bulk-bar picker covers the rest.
- **Crash reporting still not wired.** Nothing was half-built: it needs a new native module (so a
  rebuild) and a Sentry/Bugsnag account + DSN first. Still flying blind on what testers hit.
- **Google reviewer test account** not created — it needs real demo rows in the **prod** database,
  which wasn't something to do unasked. Blocks the Play App Access form.
- **EAS file-secret migration** for the Play Console key left undone rather than guessing at
  `eas.json` syntax; the local-path approach still works.
- **`useGpsTracking` is still compiled into the bundle** via `MapScreen → useLiveLocalTrack →
  useGpsTracking` (module scope calls `TaskManager.defineTask`). Harmless — nothing starts a track
  — but the GPS tree isn't fully dead. Cutting MapScreen's track wiring would finish the job;
  MapScreen was deliberately left alone.

---

## 6. 2026-08-15 — fixes from the field test

Five defects came out of the 08-14 field test (Pete's notes are inline in §2.1, §2.5 and §2.7).
All five are built. **All are frontend only — no backend file changed, no migration.** Verified by
esbuild parse plus eslint on the web files; eslint reports only pre-existing errors.

### 6.1 Mobile — a roll-up's children now render as rows
*Note: "Mobile rolled up tasks do not display. When entering into a parent task, none of the
daughter tasks exist — these need to surface to allow field completion."*

The parent opened to nothing, so issues raised in the field could only be worked from the web app.
No backend work was needed: `GET /tasks/tasks?parent_task_id=` already exists
(`backend/api/v1/tasks.py:877,908`) and is what web's `SubTaskPanel` uses.

- **new** `packages/mobile/src/components/SubTaskPanel.js` — progress bar, per-child complete with
  undo, detach with undo, tap-through to the child. **Self-hides when a task has no children**, so
  it is mounted unconditionally and ordinary tasks are unaffected. Outstanding children sort above
  finished ones.
- `services/tasksCache.js` gained `listChildTasksCached` — the roll-up is opened in the block,
  which is where signal is worst.
- **Queued-write handling:** both actions check the queue's `__queued` stub and patch local state
  instead of re-reading. Without it the stale cache repaints the child as outstanding and the tick
  visibly bounces back.
- **Detach is hidden on a finished child** — `PATCH /tasks/{id}` refuses any update to a
  completed/cancelled task, so it could only ever 400. **Web does not guard this and will fail
  there** (see 6.6).
- `components/Toast.js` gained an optional 4th `action` arg (`{label,onPress}`) — mobile had no
  equivalent to web's `onUndo`. Backward-compatible; no existing caller passed a duration.
- `TaskDetailScreen` back button: opening an issue stacks TaskDetail on TaskDetail, so it now
  pushes with `fromTaskId` and pops when that is set rather than always `navigate('TaskList')`.
  A focus listener re-reads on return so a child completed on its own screen shows as done.

### 6.2 Both clients — issue titles lead with the location
*Note: "On Issues to tasks, the block name and row number/name need to be raised into the title —
EG Block 4, Row 18 - Broken wire. This is as some may group tasks by issue type, some by block."*

`Row 18 — Broken wire` → **`Block 4, Row 18 — Broken wire`**. Done on **both** clients so the two
capture paths can't drift: `issueTitle()` in mobile `TaskDetailScreen`, and the seeded title in web
`RowTaskCreateModal`.

- Degrades cleanly: no block → `Row 18 — …`; no row → `Block 4 — …`; neither → just the issue.
- **Truncation trims the issue, never the location.** The old `.slice(0, 200)` ran on the finished
  string and could cut the location off entirely — the one part that makes the title actionable.
- Em-dash, not the hyphen in the note, to match the existing convention (`Wires — Block A`).
- Also fixed a latent bug: the new-roll-up default title read `task?.block_name` only, so on a
  payload with the block nested it silently fell through to `Follow-ups — vineyard`.

### 6.3 Mobile — observations now work offline
*Note: "Observation templates do not load or work offline — therefore no observations work
offline."*

**This was the blocker for §2.7.** The write queue made submission durable, but capture died
because none of the reads it depends on were cached. Four separate dead ends, all silent:

| read | behaviour offline, before |
|---|---|
| `getTemplates` | swallowed into `[]` — an empty picker looks identical to "no templates exist" |
| `getTemplate` | **threw** — form rendered with zero fields |
| `getCatalog` / `getElStages` | `[]` — every `options_source` dropdown empty |
| `getCompanyBlocks` | `[]` — nothing to pick |

- **new** `services/observationsCache.js` (templates, template, runs, spots, catalogs) and
  **new** `services/blocksCache.js`, both on the existing `tasksCache` pattern. Wired into
  `ObservationsScreen`, `SpotCaptureScreen` and `BlockPickerModal` — that last one also unblocks
  offline task creation, which shares the picker.
- **`getTemplatesCached` warms each template's own cache key from the list response.** Legitimate
  because `GET /observation-templates` and `.../{id}` share one response model
  (`ObservationTemplateOut`), `field_schema` included. So any template the picker has shown is
  openable offline **without** the user having drilled into it online first.
- `paramKey` moved from `tasksCache.js` into `offlineCache.js`, alongside a new `REFERENCE_TTL_MS`
  (30d) for template/catalog/block data. Two copies of a key builder that drift produce keys that
  miss each other, and a cache miss reads as "no data" rather than as an error.
- **`swr` resolves `null` when offline with nothing cached — it does not throw.**
  `SpotCaptureScreen` now renders an explicit *"Template unavailable — open it once with a
  connection"* state. **Gated on `!template`, NOT on `fields.length === 0`**: a free-form note
  template legitimately has no fields and captures via notes + photos, and that is the flow most
  likely to be used out of signal.

### 6.4 Web — move a child between roll-ups
*Note: "unable to select to perform a move from one rollup to another."*

Child rows render `<td />` where the checkbox would be and are deliberately non-selectable, so the
bulk bar could never reach one; detach-then-re-add was the only route.

Small fix, because **`attachToRollUp` already handled re-parenting** — it captures
`previousParentId` and its undo restores the previous roll-up, not top level. Only the gesture was
missing. Child rows are now drag sources as well as part of the parent's drop zone, reusing
`canDragTask` unchanged. `handleDragOverParent` bails when the dragged task already belongs to that
parent, so a no-op drop can't light up a target. Toast branches: moved-to vs rolled-up-under.

Selection stays top-level only — dragging is a 1-to-1 gesture with no range semantics, which is why
it is the right affordance here and the checkbox still is not.

### 6.5 Web — filters chevron, and group-by-template showed an ID
*Note: "the filters button on the task management page needs a larger arrow like on the parent
task."*

- The chevron was a 10px muted text glyph (`▾`/`▸`), reading as decoration rather than as the
  control. Now a lucide chevron at size 18 in a 26px box styled to match `.od-rollup-toggle`
  exactly. Kept as a `<span>`, not a nested button — the whole strip is already the button, and
  that avoids the global `button { padding: 8px 16px }` trap that clips small icon buttons.
  Applied to **both** filter panels; they share the class, so leaving one on a glyph would diverge.
- **Group by → Template showed `Template #12` instead of the name.** `TaskResponse` has
  `template_id` but no `template_name`, and `TaskWithRelations` nests `block`/`creator`/`completer`
  but not `template` — the name was never in the payload. TasksTab now fetches task templates in
  the existing `Promise.all` (no extra round-trip latency) and resolves id → name via a memoised
  map. Fetched **without** `is_active: true`, because a task built from a since-retired template
  still needs that template's name. Deliberately **not** a backend change: populating it on a
  `limit: 500` list endpoint means eager-loading or an N+1, and this codebase has a history of
  gunicorn OOM on list endpoints.

### 6.6 Files touched

**Mobile** — **new** `src/components/SubTaskPanel.js`, **new** `src/services/observationsCache.js`,
**new** `src/services/blocksCache.js`; `src/api/services.js`, `src/components/{Toast,index,
BlockPickerModal}.js`, `src/screens/{TaskDetailScreen,ObservationsScreen,SpotCaptureScreen}.js`,
`src/services/{offlineCache,tasksCache}.js`

**Web** — `src/pages/ObservationDashboard.{jsx,css}`,
`src/components/tasks/RowTaskCreateModal.jsx`

### 6.7 Test plan for this batch

Setup is unchanged — see §2.3. **Still point mobile at a local backend.**

**Mobile — roll-up children (6.1)**
- [ ] Open a roll-up parent on mobile → **Rolled-up issues** card lists its children with a
      done/total progress bar. This is the headline fix; it showed nothing before.
- [ ] An ordinary task with no children shows **no** card at all — not an empty one.
- [ ] Tick a child → it completes, strikes through, drops below the outstanding ones, progress bar
      moves. **Undo** on the toast puts it back.
- [ ] Tap a child → opens its own task detail; back button reads **Back** and returns to the
      **parent**, not to the task list.
- [ ] Complete a child on its own screen, come back → parent's list shows it done (focus refresh).
      If it still shows outstanding, the crew would tick it twice.
- [ ] A **completed** child shows no detach (X) button — the API would refuse it.
- [ ] Pull-to-refresh on the parent reloads the children too.
- [ ] **Offline:** tick a child in aeroplane mode → it stays ticked and does not bounce back.
      Reconnect → it lands server-side.

**Mobile — issue titles (6.2)**
- [ ] Raise an issue from a row on a task with a block → title reads
      `Block 4, Row 18 — Broken wire`.
- [ ] Raise one from a task with **no** block → `Row 18 — …`, no leading comma or stray dash.
- [ ] Paste a very long issue → the `Block/Row` prefix survives and the issue is what gets cut.
- [ ] Web: raise a task from a row via `RowTaskCreateModal` → same seeded title, still editable.
- [ ] New roll-up default title shows the real block name, not `Follow-ups — vineyard`.

**Mobile — observations offline (6.3) — do this before §2.7**
- [ ] Online: open Observations, let the template list load, open one template, back out.
- [ ] **Aeroplane mode on.** Observations tab still lists templates (not an empty picker).
- [ ] Open a template **you did not drill into** while online → the form renders with its fields.
      This is the cache-warming behaviour; if it's empty, warming is broken.
- [ ] A template with an `options_source` field (EL stage) → the dropdown still has its options.
- [ ] Block picker still lists blocks, offline, in both observation capture and task creation.
- [ ] Capture a spot offline → queues; reconnect → lands.
- [ ] **Quick Field Note** (free-form, no fields) still works offline — it must NOT hit the
      "Template unavailable" screen.
- [ ] Clear app storage, go offline, open a template → the honest *"Template unavailable"* screen,
      not a blank form.
- [ ] **Then run §2.7 in full** — it was blocked on this.

**Web — roll-ups and filters (6.4, 6.5)**
- [ ] Expand a roll-up → hovering a child shows the drag grip; a **completed** child shows none.
- [ ] Drag a child from roll-up A onto roll-up B → moves, B auto-expands, toast says **Moved**.
- [ ] **Undo** → returns it to **A**, not to top level.
- [ ] Drag a child over **its own** roll-up → no highlight, and a drop does nothing.
- [ ] A roll-up left with zero children stops being a drop target.
- [ ] Filters button on Task Management shows the large chevron in an olive box; solid olive when
      open. Same on Observation Management.
- [ ] **Group by → Template** shows template **names**, not `Template #12`. Tasks from a
      deactivated template still show its name. Tasks with no template group under `No template`.

### 6.8 Still outstanding after this batch

- **§2.7 photos** — five checks, never run. Was blocked by 6.3; run it now.
- **§2.8 store-compliance** — build-time only, cannot be checked over Metro. Needs the EAS build,
  which is required anyway for the `e372b02` variant identities and the permission cut.
- **iOS dev build** — fails at the credentials step and leaves **no EAS build record**, because the
  new `nz.co.auxein.grow.dev` bundle id needs a provisioning profile. Apple-account work, not code.
  Android built fine.
- **`eas.json` iOS submit placeholders** — `ascAppId` and `appleTeamId` still unfilled.
- **Crash reporting** — still unwired; needs a native module (rebuild) and a DSN.
- **Google reviewer test account** — needs real demo rows in the prod DB. Blocks the Play App
  Access form.
- **Optimistic reads.** 6.1 patches local state on a queued write, but that is in-memory only — a
  refresh while still offline reverts it. The general fix is a pending-writes-aware read cache,
  which is a bigger change than anything here.
- **Web deploy still carries the whole backlog.** Prod web is at 2026-06-23, so this release also
  publishes `8e682c1`, the five 2026-08-05 beta fixes and the 08-13 batch. Budget test time
  accordingly — see §4.
