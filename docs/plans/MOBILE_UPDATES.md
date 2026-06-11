# Auxein Grow — Mobile Updates Backlog

Running scope list for the **next mobile release** (the first update after the v0.1.1 first-edition review clears both stores). Mobile work here is **scoped only** — not yet built — to keep the in-review build untouched. Web equivalents have shipped; these are the mobile-parity follow-ups.

> Convention: when one of these is built, move it to a "Shipped" section with the build number it landed in.

---

## 1. Field Notes roll-up on the task screen
**Web parity:** shipped 2026-06-11 in `packages/web/src/pages/TaskDetail.jsx` (derived "Field Notes" card + "Insert field notes" into completion notes).

**What:** a read-only summary near the top of the mobile task screen that rolls up every row's `issues_found` + `notes` into one ordered list, e.g.:
- ⚠ Row 6 — broken post bay 15
- ⚠ Row 12 — irrigation line broken bay 34
- Row 18 — slow growth, re-check

**Where:** `packages/mobile/src/screens/TaskDetailScreen.js`. The screen already loads `rows` (via `listRowsCached`) and renders them lower down — reuse that array; no new fetch.

**Logic (mirror web):**
- For each row: push an entry for `issues_found` (flagged, sorted first) and one for `notes`, each prefixed with the row label (`Row {row_identifier || vineyard_row.row_number || id}`).
- Natural-sort by row label (`byNatural` is already imported in this screen).
- Derived/read-only — no new column, can't drift.
- In the **complete-task modal** (`completionNotes` state), add an **"Insert field notes"** button that seeds/append the rolled-up text into `completionNotes` (matches the web "Insert field notes" chip).

**Decisions (locked, from web):** derived not stored; include both issues + notes; offer copy-into-completion-notes.

**Effort:** ~0.5 day. No backend, no new API.

---

## 2. Create a follow-up task from a row
**Web parity:** shipped 2026-06-11 — `packages/web/src/components/tasks/RowTaskCreateModal.jsx`, opened from each row's expanded detail in `RowProgressPanel.jsx`.

**What:** while completing a row and logging an issue (e.g. "broken post bay 15"), spin off a new task without leaving the screen — prefilled from the row + parent task.

**Where:** `packages/mobile/src/screens/TaskDetailScreen.js`. The row-complete modal already exists (`showRowModal`, `activeRow`, `rowNotes`, `rowIssues`, `handleCompleteRow`). Add a **"Create task"** action in that modal (or the row detail), opening either:
- a lightweight prefilled modal that calls `services.createTask(...)` directly (mirrors the web `RowTaskCreateModal`), **or**
- a navigation to `CreateTaskScreen.js` with route params prefilling title/description/block (reuses existing create UI).
Recommended: the lightweight modal for field speed (matches the web inline-modal decision).

**Prefill (mirror web):**
- `title`: `"{rowLabel} — {issues_found}"`, else `"{rowLabel} — follow-up"`.
- `task_category`: inherit the parent task's category (fallback `general`).
- `description`: the row's issue/notes text + an origin line `"Raised from {parent title/number}, {rowLabel}"`.
- `block_id`: inherit from the parent task.
- `location_notes`: the same origin reference (so it shows on the task card).
- optional: priority, scheduled date, assignees.

**API (existing — `packages/mobile/src/api/services.js`):** `createTask(data)` (full create, accepts `title`, `task_category`, `description`, `block_id`, `location_notes`, `priority`, `scheduled_start_date`, `assigned_user_ids`). No backend change needed.

**Linkage:** reference the origin in `location_notes` text only. Do **not** reuse `source_task_id` — that FK belongs to spray-clone logic and reports filter `source_task_id IS NOT NULL` out. A dedicated originating-row FK is a future enhancement (would need a backend migration; track here if pursued).

**Decisions (locked, from web):** inline prefilled modal; text-reference linkage (no FK); most relevant on inspection/scouting/maintenance rounds.

**Effort:** ~1 day.

---

## Notes
- Both features are pure mobile-client work against existing endpoints — they can ship in the same update.
- Keep titles/labels terse per the mobile UI copy convention (no greetings/filler).
- When built: bump build number per the local-versioning workflow (`npm run bump:build` → commit `app.json` → `eas build --platform all` → `eas submit`), and add a "What's New" line for the store listing.
