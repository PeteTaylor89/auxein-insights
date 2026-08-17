# Mobile rebuild + test — 2026-08-17

One-page field sheet. Full detail lives in `GROW_TASKS_GPS_OFFLINE_2026-08-13.md`
(§2 for the 08-13 batch, §6 for the 08-15 fixes).

---

## 0. Before you start

**Do you need an EAS rebuild?**

| Change | Reaches the dev client over Metro? |
|---|---|
| All six 08-15 fixes (JS only) | **Yes** — no rebuild |
| `app.json` / `eas.json` (permissions cut, variant ids, submit block) | **No** — build-time only |

So: **§A and §B below run over Metro today. §C needs the EAS build.**

```
npm run dev:backend                 # local API — see the warning
npm run dev:mobile -- --clear       # --clear matters: app.config.js is read at start
```

Open the **Auxein dev client**, not Expo Go — Mapbox won't load in Expo Go.

> **Point mobile at the LOCAL backend for anything touching roll-ups.**
> Prod EB predates those endpoints and **both failure modes are silent**: a missing endpoint
> 404s into an empty picker, and `TaskCreate` has no `extra="forbid"`, so an unknown
> `parent_task_id` is silently dropped and you get a `201` with an orphan.
> Set `API_URL=http://192.168.1.144:8000/api` in `packages/mobile/.env`.
>
> The local backend still talks to **prod RDS** — test data is live data.

---

## 1. Shipped and already field-tested — do not retest

Committed in `19af60c` / `e372b02`, verified in the field on 2026-08-15:

- **GPS removal** — no GPS cards, no tracking overlay, no start/stop prompts, no create-task toggle
- **Field Notes** — roll-up card, natural row sort, insert-into-completion-notes
- **Offline write queue, end to end** — including the hard case: a queued child resolving a
  queued parent, survival across a force-quit, and a 4xx dropping instead of retrying forever

That last one is the important result. **The offline write queue is proven, not theoretical.**

---

## 2. Shipped but NEVER TESTED — this is today's list

Six fixes, built 2026-08-15, uncommitted. Four are mobile.

### A. Mobile — over Metro, today

**A1. Roll-up children now render** *(new `components/SubTaskPanel.js`)*
This is the headline fix — a parent showed nothing before, so daughter tasks couldn't be
completed in the field at all.

- [ ] Open a roll-up parent → **Rolled-up issues** card lists children with a done/total bar
- [ ] An ordinary task with no children shows **no card at all** — not an empty one
- [ ] Tick a child → completes, strikes through, drops below the outstanding ones, bar moves
- [ ] **Undo** on the toast puts it back
- [ ] Tap a child → its own detail; back button reads **Back** and returns to the **parent**
- [ ] Complete a child on its own screen, come back → parent shows it done
      *(focus refresh — if it still reads outstanding, the crew ticks it twice)*
- [ ] A **completed** child shows no detach (X) — the API would refuse it
- [ ] Pull-to-refresh on the parent reloads children too
- [ ] **Offline:** tick a child in aeroplane mode → stays ticked, doesn't bounce back;
      reconnect → lands server-side

**A2. Issue titles lead with location**

- [ ] Raise an issue from a row on a task with a block → `Block 4, Row 18 — Broken wire`
- [ ] From a task with **no** block → `Row 18 — …`, no leading comma, no stray dash
- [ ] Paste a very long issue → the `Block/Row` prefix survives, the issue text is what gets cut
- [ ] New roll-up default title shows the real block name, not `Follow-ups — vineyard`

**A3. Observations now work offline** *(new `observationsCache.js` + `blocksCache.js`)*
**Run this before A4** — A4 was blocked on this defect.

- [ ] Online: open Observations, let the list load, open one template, back out
- [ ] **Aeroplane mode on.** Observations tab still lists templates (not an empty picker)
- [ ] Open a template **you did not drill into** while online → form renders with its fields
      *(this is the cache-warming path; empty here means warming is broken)*
- [ ] A template with an `options_source` field (EL stage) → dropdown still has its options
- [ ] Block picker still lists blocks offline — in **both** observation capture and task creation
- [ ] Capture a spot offline → queues; reconnect → lands
- [ ] **Quick Field Note** (free-form, no fields) still works offline —
      it must **NOT** hit the "Template unavailable" screen
- [ ] Clear app storage, go offline, open a template → honest **"Template unavailable"** screen,
      not a blank form

**A4. Photos — five checks, never run** *(was blocked by A3)*

- [ ] Capture a photo offline, force-quit before reconnecting → still uploads on reconnect
      *(core of the "photos vanish" fix — the file now lives in the document dir)*
- [ ] Remove a photo from the picker before submitting → doesn't upload, doesn't linger
- [ ] Task detail shows a **Photos** strip for a task with server-held photos;
      tap → full-screen viewer; tap again → close
- [ ] View photos online, then go offline and reopen the task → **photos still render** (disk cache)
- [ ] A task with no photos shows no Photos card and no empty box

### B. Web — same batch, browser not phone

- [ ] Expand a roll-up → hovering a child shows the drag grip; a **completed** child shows none
- [ ] Drag a child from roll-up A onto roll-up B → moves, B auto-expands, toast says **Moved**
- [ ] **Undo** → returns it to **A**, not to top level
- [ ] Drag a child over **its own** roll-up → no highlight, drop does nothing
- [ ] A roll-up left with zero children stops being a drop target
- [ ] Filters button shows the large chevron in an olive box; solid olive when open.
      Both Task Management and Observation Management
- [ ] **Group by → Template** shows template **names**, not `Template #12`.
      Deactivated templates still show a name; tasks with no template group under `No template`

### C. After the EAS build only — cannot be checked over Metro

- [ ] `git check-ignore packages/mobile/google-play-service-account.json` reports a match
- [ ] Android → Settings → Apps → Auxein Grow → Permissions shows **Location** and
      **Notifications** only — no foreground-service entry
- [ ] iOS location prompt copy no longer mentions recording tractor activity;
      no background-location indicator
- [ ] **Regression risk of the permission cut** — confirm an observation spot, an incident and a
      contractor check-in *all still capture coordinates*. They use one-shot `expo-location`
      reads that need only when-in-use, but verify rather than assume
- [ ] Each variant installs alongside the others (dev / preview / prod bundle ids from `e372b02`)

---

## 3. Known blockers — not test failures

- **iOS dev build fails at the credentials step and leaves NO EAS build record.** The new
  `nz.co.auxein.grow.dev` bundle id needs a provisioning profile. Apple-account work, not code.
  Android builds fine.
- **`eas.json` iOS submit placeholders** — `ascAppId` and `appleTeamId` still unfilled;
  `eas submit --platform ios` will fail until they are.
- **Crash reporting** unwired — needs a native module and a DSN.
- **Play reviewer account** needs real demo rows in prod.

## 4. Known limitation, by design

**Optimistic reads are in-memory only.** A1 patches local state when a write is queued, but a
*refresh while still offline* reverts the display. The write itself is safe and still queued —
only the display reverts. The general fix is a pending-writes-aware read cache; not in this batch.

---

## 5. Staging — do NOT `git add -A`

The working tree also holds unrelated in-flight **Insights surfaces** work. Stage by path:

```
packages/mobile/src/api/services.js
packages/mobile/src/components/{SubTaskPanel.js,Toast.js,index.js,BlockPickerModal.js}
packages/mobile/src/screens/{TaskDetailScreen,ObservationsScreen,SpotCaptureScreen}.js
packages/mobile/src/services/{offlineCache,tasksCache,observationsCache,blocksCache}.js
packages/web/src/pages/ObservationDashboard.{jsx,css}
packages/web/src/components/tasks/RowTaskCreateModal.jsx
docs/plans/GROW_TASKS_GPS_OFFLINE_2026-08-13.md
```

There is also a stray zero-byte file literally named `-` in the repo root — safe to delete.

**No backend deploy is needed for any of these fixes.** And `eb deploy` ships the working
*directory*, so a backend deploy right now would publish all the surfaces work with it.
