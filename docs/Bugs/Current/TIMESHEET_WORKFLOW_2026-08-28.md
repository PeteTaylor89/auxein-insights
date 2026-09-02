# Timesheet workflow — test findings and fix brief

**Date:** 2026-08-28
**Tested by:** live API exercise against the running backend (`:8000` → RDS `auxein_db`, company 24, user 37 `company_admin`) plus source review of `backend/api/v1/timesheets.py`, `backend/api/v1/tasks.py`, `backend/db/models/timesheet.py`, `backend/services/timesheet_rules.py`, `packages/web/src/pages/TimesheetSystem.jsx`, `packages/mobile/src/screens/Timesheet*.js`.

**Headline:** the timesheet state machine on the API is correct. Every transition, guard and arithmetic result behaved as designed. The defects are (a) one silent data-loss path in task completion, (b) one silent data-loss path in the legacy day-total setter, (c) a web UI whose notion of "editable" is the inverse of mobile's, and (d) a missing permission check on the list endpoint.

---

## Fix status

| | Finding | Status |
|---|---|---|
| F1 | Hours destroyed onto an approved day | **Fixed** 2026-08-28 — the product DECISION is still open |
| F2 | Day total below coded hours deletes uncoded | **Fixed** 2026-08-28 |
| F3 | Rejected day is a dead end on web | **Fixed** 2026-09-01 |
| F4 | Submitted days remain editable | **Fixed** 2026-09-01 |
| F5 | List endpoint skips its permission check | **Fixed** 2026-08-28 |
| F6 | Three disagreeing definitions of "editable" | **Fixed** 2026-09-01 — one rule, three mirrors |
| F9, F10 | Web's day-total control | **Fixed** 2026-08-28 — replaced by "Other time" |
| F7, F8, F11–F16 | | Open |

The F6 rule now lives in `backend/services/timesheet_rules.py` (`DAY_EDITABLE_STATUSES`,
`day_is_editable`, `day_lock_reason`), mirrored to `packages/shared/src/utils/timesheetStatus.js`
and `packages/mobile/src/utils/timesheetStatus.js`. **Draft and rejected only.** Change one, change
all three — there is a drift check for it in the session scratchpad
(`check_editability_agreement.py`).

None of the 2026-09-01 work has been opened in a browser or on a phone.

---

## How to read this document

Each finding has **Evidence** (what was observed, verbatim where possible), **Cause** (file:line), and **Fix**. Findings are ordered by severity. Items marked **DECISION** need a product call before implementing — do not choose unilaterally.

Verified-working behaviour is listed at the end. Do not "fix" those.

---

## F1 — Hours are silently destroyed when a task is completed onto an approved day

**Severity:** critical (silent data loss, no recovery path)

### Evidence

Control, day `35` (2019-01-08), status `draft`:

```
before    entry_hours 0.00   effective 0.00   entries []
POST /tasks/tasks/118/complete { hours_worked: 1.5, work_date: "2019-01-08" }
          → 200, status "completed"
after     entry_hours 1.50   effective 1.50   entries [{id:32, task_id:118, hours:1.50}]
```

Test, day `34` (2019-01-07), status `approved`:

```
before    entry_hours 1.00   effective 1.00   entries [{id:33, task_id:null, hours:1.00}]
POST /tasks/tasks/119/complete { hours_worked: 2.0, work_date: "2019-01-07" }
          → 200, status "completed", completed_at 13:28:57Z
after     entry_hours 1.00   effective 1.00   entries [{id:33, task_id:null, hours:1.00}]
```

Identical call shape, same user, same company. Only the day's status differs. The 2.0 hours are recorded nowhere.

### Cause

`backend/api/v1/tasks.py:1550`

```python
if day.status in (TimesheetStatus.draft, TimesheetStatus.submitted, TimesheetStatus.rejected):
    try:
        ts_create_entry(db, day.id, task.id, complete_request.hours_worked)
        hours_entry_created = True
    except Exception as e:
        logger.warning(f"Timesheet entry failed for task {task_id}: {e}")
```

There is no `else`. An approved day falls straight through. The `except Exception` at line 1555 swallows every other failure the same way — a cap breach, a DB error — each returning 200 with the hours discarded.

The worker gets no signal: the "Nh added to today's timesheet" notification at `tasks.py:1578` is gated on `hours_entry_created`, which stays `False`.

### Compounding: there is no fallback record

After both completions, `Task.actual_hours` is `"0.00"` — **including task 118, where the hours did reach the timesheet**. `complete_task` never writes `hours_worked` back to the task; it only passes it to `ts_create_entry`. Consequences:

- a `TimeEntry` row is the only place `hours_worked` is ever persisted
- when that write is skipped, the number is unrecoverable
- any report reading `Task.actual_hours` reads zero for every task, always

### Fix

1. **Persist `hours_worked` on the task itself**, unconditionally, before the timesheet write is attempted. This gives a recovery path and fixes `actual_hours` for reporting. Note `tasks.actual_hours` is `Numeric` and currently defaults to `0.00`; check whether `TaskContractorAssignment.actual_hours_worked` (written at `tasks.py:~1500`) should be the single source instead, and make the two agree.
2. **Do not fail the completion**, but do not stay silent either. Return the outcome in the response so the client can react — add a field such as `timesheet_result: "logged" | "day_locked" | "failed"` to `TaskResponse`, or surface it in a `warnings` array.
3. **Narrow the `except Exception`** to the exceptions `ts_create_entry` actually raises (`ValueError` for cap/step breaches) and let anything else propagate. Swallowing every exception is what makes this class of bug invisible.
4. **DECISION:** what *should* happen when a worker completes a task dated onto an approved day? Options: (a) reject the completion with a clear error, (b) log the hours to the next open day, (c) auto-release the day and notify the approver, (d) queue for manager attention. This is a payroll-policy question, not a code question. Until it is answered, implement 1–3 so the hours are at least never lost.

---

## F2 — Setting a day total below the coded hours deletes uncoded time and reports success

**Severity:** high (silent data loss, through the control the web UI uses)

### Evidence

```
before   entry_hours 3.75   uncoded 1.50   effective 5.25
PATCH /timesheets/days/34 { day_hours: 3.0 }    → 200
after    entry_hours 3.75   uncoded 0.00   effective 3.75
```

The 1.5 uncoded hours were not clamped — they were destroyed. Web then displays "Day hours updated".

### Cause

`backend/db/models/timesheet.py:169` `set_day_hours()`:

```python
coded = _q(sum(...))
self.set_uncoded_hours(max(_q(value - coded), Decimal("0.00")))
```

When `value < coded`, `max(...)` yields `0.00` and the previous uncoded figure is overwritten. The docstring argues that refusing a below-coded total "would resurrect the failure this change removed" — that reasoning is sound for *rejecting* the request, but it does not justify *discarding* existing data.

This is reachable from `POST /timesheets/days` (upsert) and `PATCH /timesheets/days/{id}`, both of which the web UI calls.

### Fix

Make `set_day_hours` non-destructive. When the requested total is below the coded hours, leave `uncoded_hours` untouched and return the day unchanged, plus a response field the client can render (e.g. `warning: "Day total is below the 3.75h already coded to tasks; uncoded time left unchanged."`). Never silently zero a value the user did not name.

Related: see F9 — the web UI should not be writing this field at all.

---

## F3 — A rejected day cannot be fixed or resubmitted on web

**Severity:** high (the workflow cannot close)

### Evidence

The API supports the loop. Confirmed live on day 34:

```
reject?reason=Hours%20look%20high     → 200, status "rejected"
POST /timesheets/entries              → 201
PATCH /timesheets/days/34/uncoded     → 200
POST /timesheets/days/34/submit       → 200, status "submitted"
```

Mobile implements it (`TimesheetDayDetailScreen.js:71` — `isEditable = draft || rejected`, and the submit bar renders on `isEditable`).

Web does not. `packages/web/src/pages/TimesheetSystem.jsx`:

- `:37` `isRejected = (dayData) => dayData?.status === 'rejected'`
- `:68`, `:74`, `:81` — `updateDayHours`, `updateDayNotes`, `addTimeEntry` all early-return on rejected
- `:286` delete button disabled; `:321`, `:350`, `:351` task select, hours input, day total, notes all disabled
- `:346` `canSubmit = dayData.id && dayData.status === 'draft' && ...` — **no Submit button on a rejected day**

So a manager's rejection permanently strands the day for a web user. `submit_timesheet_day` (`timesheets.py:315`) explicitly accepts `draft` *or* `rejected`, with a comment stating that refusing this "made rejection a dead end" — the backend fix landed, the web client never followed.

### Fix

Replace `isRejected` with a shared `isEditable(day)` helper matching mobile: editable when status is `draft` or `rejected`. Change `canSubmit` at `:346` to `['draft','rejected'].includes(dayData.status)`. Show the rejection reason (it is appended to `notes` as `[Rejected: ...]`) rather than the current "Editing disabled — day is rejected." message.

---

## F4 — Submitted days remain editable, so managers approve numbers they never saw

**Severity:** high (approval integrity)

### Evidence

```
submit                                    → 200, effective 5.25, submitted_at 01:23:30Z
POST /timesheets/entries { hours: 0.5 }   → 201        (after submission)
PATCH /days/34/uncoded { hours: 2.0 }     → 200        (after submission)
approve                                   → 200, effective 6.25, approved_by 37
```

`submitted_at` never moved. The manager's queue showed 5.25h; 6.25h was approved.

### Cause

`backend/api/v1/timesheets.py:57` `_ensure_editable` blocks only `approved`. Mobile independently prevents this in its UI (`isEditable = draft || rejected`); web does not; the API permits it from any client, including a replayed offline queue.

### Fix

Move the rule into the backend where it belongs: `_ensure_editable` should refuse `submitted` as well as `approved` for the owner. Managers with `timesheets:update` may retain the ability to edit a submitted day, but that should be an explicit, separate allowance rather than a side effect of the current condition ordering.

Note this interacts with F1: `complete_task:1550` also allows writes to a `submitted` day. Both call sites must agree. Once they do, F1's DECISION applies to submitted days too.

---

## F5 — `GET /timesheets/days` skips its permission check when `user_id` is omitted

**Severity:** high (data exposure)

### Evidence

`GET /api/timesheets/days?limit=500` with no `user_id` returned **200** and every timesheet day in the company. The call was legitimate for the test account (`company_admin`), but the guard is structurally unreachable for anyone.

### Cause

`backend/api/v1/timesheets.py:185`

```python
if user_id is not None:
    if user_id != current_user.id:
        if not current_user.has_permission("timesheets", "read"):
            raise HTTPException(status_code=403, ...)
    q = q.filter(TimesheetDay.user_id == user_id)
```

The `has_permission("timesheets", "read")` check is nested inside `if user_id is not None`. Omit the parameter and no check runs at all — the query is scoped to the company only. Per `backend/core/permissions.py:82`, `timesheets:read` is `auxein_admin | company_admin | company_manager`; `company_user` has only `read_own`.

The web Team Dashboard is gated client-side (`TimesheetSystem.jsx:40`), which is not a control.

### Fix

Restructure so the default is restrictive:

```python
if not current_user.has_permission("timesheets", "read"):
    # no read permission: may only ever see their own
    if user_id is not None and user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view other users' timesheets")
    q = q.filter(TimesheetDay.user_id == current_user.id)
elif user_id is not None:
    q = q.filter(TimesheetDay.user_id == user_id)
```

Check whether any client relies on the bare call returning company-wide data for a `company_user`; mobile's `TimesheetScreen` should be passing `user_id`.

---

## F6 — An approved day presents fully live edit controls on web, all of which fail

**Severity:** medium (every control produces an error banner)

### Evidence

All six mutations on an approved day are correctly refused by the API:

```
POST   /timesheets/entries        → 409  "Day is approved, not editable (ask a manager/admin to release)"
PATCH  /timesheets/days/34/uncoded → 409  (same)
PATCH  /timesheets/days/34         → 409  (same)
DELETE /timesheets/entries/{id}    → 409  (same)
POST   /timesheets/days (upsert)   → 409  (same)
POST   /timesheets/days/34/rollup  → 409  (same)
```

Web disables controls only on `rejected` (F3), so on an **approved** day the day-total input, notes, task select, hours field, Add button and per-entry Delete buttons are all enabled and all fail into the red error banner.

Note the upsert 409 also means the web `addTimeEntry` path (`:81`) cannot even lazily create/fetch a day for a date whose day is approved.

### The underlying inconsistency

| | draft | submitted | approved | rejected |
|---|---|---|---|---|
| Backend `_ensure_editable` (`timesheets.py:57`) | yes | yes | no | yes |
| Mobile `isEditable` (`TimesheetDayDetailScreen.js:71`) | yes | no | no | yes |
| Web `!isRejected` (`TimesheetSystem.jsx:37`) | yes | yes | yes | no |

### Fix

Define the rule once and share it. Add an `isDayEditable(status)` helper to `packages/shared/src/utils/` and have web, mobile and the backend's `_ensure_editable` agree on it. Fixing F3 and F4 sets the intended rule: editable in `draft` and `rejected` only.

---

## F7 — `release` erases the submission record

**Severity:** medium (audit gap)

### Evidence

```
before release   submitted_at 2026-08-28T01:23:30Z   approved_at 01:22:58Z   approved_by 37
after release    submitted_at null                    approved_at null        approved_by null
```

### Cause

`backend/api/v1/timesheets.py:158` — `release_timesheet_day` nulls `submitted_at` alongside `approved_by` and `approved_at`. A released day becomes indistinguishable from one never submitted, and nothing anywhere records that a release happened, who did it, or when.

### Fix

Do not clear `submitted_at` — the day *was* submitted, and clearing it destroys history. Add `released_at` / `released_by` columns (Alembic migration; **note the 32-character slug limit on migration names**) and set them here. If a full audit trail is wanted, a `timesheet_day_event` table is the better shape — **DECISION** on scope.

---

## F8 — `PUT /entries/{id}` with `task_id: null` returns 200 and does nothing

**Severity:** medium (a mis-coded entry cannot be corrected)

### Evidence

```
PUT /timesheets/entries/26 { task_id: null }   → 200
GET day 34 → entry 26 still task_id 119, updated_at unchanged (2026-08-28T01:21:46Z)
```

### Cause

`backend/services/timesheet_rules.py` `update_entry`: `if task_id is not None: entry.task_id = task_id`. `None` is overloaded to mean "not supplied", so "clear the task" is unexpressable. `TimeEntryUpdate` (`schemas/timesheet.py`) has no way to distinguish the two.

### Fix

Use Pydantic v2's `model_fields_set` (or a sentinel) to distinguish "absent" from "explicitly null" in `update_time_entry`, and pass an explicit flag down to `update_entry`. Returning 200 for a no-op is the worst outcome — the client believes it succeeded.

---

## F9 — Web cannot set uncoded time and writes the legacy field instead

**Severity:** medium

`PATCH /days/{id}/uncoded` is documented in `timesheets.py:247` as the only hours figure a user enters, and mobile uses it (`packages/mobile/src/api/services.js:698`). But:

- `packages/shared/src/api/timesheetsService.js` has **no method** for it
- web only *displays* `uncoded_hours` (`TimesheetSystem.jsx:355`)
- web's "Day total" input writes `day_hours` through the legacy `set_day_hours` path — the one with the F2 data-loss bug

### Fix

Add `setUncodedHours(dayId, hours)` to `timesheetsService`, and replace web's "Day total" input with an uncoded-time input mirroring mobile's `DayTotalSheet`. Show the derived total read-only alongside it. This removes web's dependency on `set_day_hours` entirely.

---

## F10 — Web posts on every keystroke of the day-total input

**Severity:** medium

`TimesheetSystem.jsx:350`

```jsx
<input type="number" value={dayData.day_hours || ''} onChange={(e) => updateDayHours(day, e.target.value)} />
```

`updateDayHours` (`:67`) issues `POST /timesheets/days` **and** a full `loadData()` per character. Typing `7.5` sends 7 then 7.5; intermediate values that are not 0.25 multiples return 422 and paint the error banner. The input is controlled off server state that reloads mid-type. Combined with F2, a mistyped digit can destroy uncoded hours.

### Fix

Superseded by F9 if the input is replaced. If it is kept in any form, commit on blur or debounce, keep local state while typing, and validate client-side before sending.

---

## F11 — Self-approval is permitted

**Severity:** medium — **DECISION**

### Evidence

User 37 submitted and then approved their own day: `approved_by: 37` on a day with `user_id: 37`.

`approve_timesheet_day` (`timesheets.py:345`) checks `has_permission("timesheets", "approve")` and company scope, but never that the approver differs from the owner.

### Fix

Decide whether separation of duties is required. For a small vineyard where the owner is the only admin, self-approval may be intended — in which case leave it and note it. If not, add the check. Do not change this without a product call.

---

## F12 — Enum repr leaks into a user-facing error message

**Severity:** low

`timesheets.py:322`

```python
raise HTTPException(status_code=409, detail=f"Cannot submit a {day.status} day")
```

Observed live: `"Cannot submit a TimesheetStatus.submitted day"`. Use `day.status.value`. Audit the file for other f-strings interpolating the enum.

---

## F13 — A task-less time entry counts as coded hours

**Severity:** low (modelling inconsistency)

`POST /timesheets/entries { timesheet_day_id: 34, hours: 0.25 }` with no `task_id` returns 201 and the hours land in `entry_hours` — which web labels "Coded" (`TimesheetSystem.jsx:354`). There are now two representations of time-not-against-a-task: a task-less `TimeEntry` (counted as coded) and `TimesheetDay.uncoded_hours` (counted as uncoded).

### Fix — DECISION

Either require `task_id` on `TimeEntryCreate` and route all uncoded time through `uncoded_hours`, or treat task-less entries as uncoded in `recalc_hours`. `TimeEntry.task_id` is already nullable at the DB level with `ondelete="SET NULL"`, so **an entry also becomes task-less when its task is deleted** — that path must be handled whichever way this is decided.

---

## F14 — There is no way to delete a timesheet day

**Severity:** low

No `DELETE /timesheets/days/{id}` exists. A day created in error — including one auto-created by `complete_task:1541` with the wrong `work_date` — is permanent. Entries can be deleted, leaving an empty day row.

Two such rows were created during this test and could not be removed: **id 34 (2019-01-07)** and **id 35 (2019-01-08)**, both `draft`, 0.00h, user 37, company 24. They are harmless but will appear if anyone navigates to January 2019. Delete them directly if you want them gone.

### Fix

Add a delete endpoint restricted to `draft` days with no entries, or have the list endpoint hide empty draft days.

---

## F15 — `TimesheetSystem.jsx` reads the legacy `role` column

**Severity:** low

`:40` `const canViewTeamDashboard = user && ['manager', 'admin'].includes(user.role);`

Every other web surface uses `userTypeRole` (`SiteHeader.jsx:68`, `Calendar.jsx:36`, `CompanyAdmin.jsx:61`, `ProtectedRoute.jsx:29`). `users.role` is the legacy 3-value column the User model comments as replaced by `user_type`. It works for accounts where the two agree, but this page is the only one depending on that.

### Fix

Use `userTypeRole` and check against `['company_admin', 'company_manager', 'auxein_admin']`.

---

## F16 — Adjacent: the invite role map drops `company_manager`

**Severity:** medium — outside timesheets, but it determines who can approve

`backend/api/v1/invitations.py:229` and `:304`:

```python
role_to_user_type = {"admin": "company_admin", "manager": "company_manager",
                     "user": "company_user", "viewer": "company_user"}
```

`User.can_invite_role` (`db/models/user.py:205`) explicitly permits an admin to invite with role `"company_manager"`. That key is absent from the map, so `.get(...)` falls through to `"company_user"`. The invitee lands with `role='company_manager'` but `user_type='company_user'` — no `timesheets:approve`, and web login refuses them with `MOBILE_ONLY` (`invitations.py:311`).

### Fix

Accept both naming schemes in the map, or normalise `invitation.role` on creation. Then audit existing users for the mismatch (`role` implying manager/admin while `user_type` is `company_user`).

---

## Verified working — do not change

Confirmed live during this run:

- **Derived-total arithmetic.** 2.50 + 1.25 = 3.75 coded; +1.50 uncoded = 5.25 effective; `day_hours` mirrors `effective_total_hours` throughout. The continuous roll-up described in the `recalc_hours` comment behaves as documented — no lag, no half-applied entry.
- **Entry validation.** `0.1` → 422 "must be in 0.25 increments"; `25` → 422 "must be <= 24"; `-1` → 422 "must be > 0". Same for uncoded: `1.3` → 422 step, `30` → 422 `le=24`.
- **Zero-hour submit** → 400 "Cannot submit a zero-hour day".
- **Wrong-state transitions** all correctly 409: approve/reject a `draft`, release a `draft`, release a `submitted`, submit twice.
- **Approved-day lockout** — all six mutation endpoints refuse with 409 and the correct message.
- **Release → edit → resubmit** works end to end on the API. This was the originally reported concern and it is *not* a backend defect; see F3 for where the real dead end is.
- **Reject → edit → resubmit** works end to end on the API.
- **`work_date` handling.** A completion dated `2019-01-08` landed on that day, not the server's today. The NZ-vs-UTC fix described in `TaskCompleteRequest.work_date` works.
- **Rejection reason** is appended to `notes` as `[Rejected: <reason>]` as intended.

---

## Suggested order of work

1. **F1** and **F2** first — both destroy data silently and neither has a recovery path.
2. **F5** — one-function fix, closes a data-exposure hole.
3. **F6** shared `isDayEditable` helper, then **F3** and **F4** on top of it. Doing F6 first avoids fixing the same disagreement three times.
4. **F9** + **F10** together — replacing the day-total input removes both.
5. **F7**, **F8**, **F12**, **F15**, **F16**.
6. **F11**, **F13**, **F14** after their DECISIONs are answered.

## Notes for whoever picks this up

- The backend at `:8000` reads `.env`, which currently has `ENV=staging` — `get_database_url()` resolves to the RDS instance, **not** `localhost`. Anything you run against the local API writes to the shared database. Set `ENV=local` before testing.
- Migrations live at the repo root in `alembic/versions/`, not under `backend/`. Slugs over 32 characters silently roll back the DDL.
- Tasks `118` (`TASK-2026-C24-019`) and `119` (`TASK-2026-C24-020`) in company 24 were moved to `completed` by this test and cannot be reopened through the API — `/resume` only accepts `paused`.
