# Grow — task roll-up drag, GPS mothball, offline/image rebuild

**Built 2026-08-13. Nothing tested, nothing committed, nothing deployed.**
Test / commit / publish scheduled for 2026-08-14.

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

- [ ] `SELECT version_num FROM alembic_version;` — expect **`surface_index_tables`** (applied to
      prod 2026-08-13 by the parallel Insights session). Today's changes need **no** migration;
      just confirm where you stand before touching prod.
- [ ] Confirm prod EB build date. Per memory it is **2026-07-15**, which predates the roll-up
      endpoints — see the silent-failure warning in §2.3.

### 2.1 Web — task roll-up drag (`/observations`, Tasks tab)

- [ ] Roll-up parent rows show the enlarged chevron; it fills solid olive when expanded.
- [ ] Hovering a plain task row shows the drag grip; a roll-up parent does **not** (can't nest).
- [ ] A `completed`/`cancelled` task shows **no** grip (the API would refuse the update).
- [ ] Drag a task onto a collapsed roll-up → band closes around the single row; drop reparents,
      auto-expands, toast appears.
- [ ] **Undo the toast** → task returns to top level.
- [ ] Drag onto an *expanded* roll-up, hovering over a child row → the whole group stays
      highlighted (this is the `data-rollup-group` strobe fix; watch for flicker).
- [ ] Drag and release outside any roll-up → nothing happens, no error.
- [ ] Bulk bar: select 2+ tasks → **Add to roll-up…** lists existing roll-ups with child counts →
      choose one → all reparent atomically; undo restores each to its previous parent.
- [ ] Select a task that is *already* in roll-up A, add it to roll-up B → moves cleanly.

### 2.2 Web — GPS/spray gone, TaskDetail restyle

- [ ] Task detail: no GPS row, no spray-coverage badge, no "Require GPS tracking" in Edit.
- [ ] Task creation wizard: no GPS checkbox, no spray-readiness checklist. Sprayer badge and
      **Target rate** input are still there (deliberately kept — ordinary planning data).
- [ ] Create a task from a template that has `requires_gps_tracking` on → task is created
      **without** it. (Template flag is intentionally still settable but now inert.)
- [ ] Maps V2: no GPS Tracks panel, no track layer, no GPS entries in the legend, no per-task
      track button in the Tasks panel. Map click behaviour otherwise unchanged.
- [ ] Task detail page is **white**, not sand; back button matches the one on observation Run
      Capture; header card carries the accent top border like the assets dashboard.
- [ ] Task detail with no description → left column shows the empty-state card, not a gap.
- [ ] Field Notes card still renders and **Copy** still works.
- [ ] Help popovers on task templates / assets / calibrations no longer claim GPS is required.
- [ ] **Regression sweep:** the removed `td-*` block in `vineyard-pages.css` was verified unused
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

- [ ] Task detail: no GPS cards in any state, no full-screen tracking overlay.
- [ ] Start a task → starts immediately, no "Start GPS recording?" prompt.
- [ ] Complete a task → no stop-tracking step, completion still logs hours and notes.
- [ ] Create task screen: no "Track GPS during this task" toggle.

### 2.5 Mobile — Field Notes

- [ ] On a task with rows carrying `issues_found` and/or `notes`, a **Field notes** card appears
      under the task card with the count in its subtitle.
- [ ] Issues sort above plain notes; rows sort naturally (2 before 10, not 10 before 2).
- [ ] Complete-task sheet shows **Insert field notes (n)** → appends into completion notes,
      preserving anything already typed.
- [ ] A task with no row notes shows **no** Field notes card at all.

### 2.6 Mobile — offline writes (the important one)

Do this as one continuous sequence; it exercises queue ordering, reference resolution and the
photo handler together.

- [ ] Online first, as a control: complete a row, raise it as an issue into a **new** roll-up,
      attach a photo. Confirm all three landed server-side.
- [ ] **Aeroplane mode on.**
- [ ] Banner turns red and stays up: "Offline — N changes waiting to sync".
- [ ] Complete a row → screen advances as if saved.
- [ ] Raise the issue as a task into a **new** roll-up (this is the ordering test: child references
      a parent that is itself queued).
- [ ] Attach a photo to it.
- [ ] **Force-quit the app.** Reopen — still offline. Banner still shows the pending count, i.e.
      the queue survived the restart.
- [ ] **Aeroplane mode off.** Banner goes amber → "Syncing…" → green "All changes synced", then hides.
- [ ] Server check: the roll-up parent exists, the issue task exists **with `parent_task_id` set to
      the real parent** (not null — that's the orphan failure mode), and the photo is attached
      to the issue task.
- [ ] Tap the amber banner while pending → forces a sync immediately.
- [ ] **Failure-path test:** queue something, then make it fail with a 4xx (e.g. complete an
      already-completed row). It should be **dropped**, not retried forever, and the queue drains.

### 2.7 Mobile — photos

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
