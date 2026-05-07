# Auxein Grow — Bug Log

> Add bugs below using the template. Prioritise as P0 (blocking), P1 (high), P2 (medium), P3 (low).
> Mark resolved bugs with ~~strikethrough~~ and move to the Resolved section.

---

## Template

```
### [BUG-XXX] Short title
- **Priority:** P0 / P1 / P2 / P3
- **Area:** Mobile / Web / Backend / Maps / Insights
- **Page/Screen:** e.g. TaskDetailScreen, AssetManagement.jsx
- **Steps to reproduce:**
  1. ...
  2. ...
  3. ...
- **Expected:** What should happen
- **Actual:** What actually happens
- **Screenshots/logs:** (paste or link)
- **Notes:** Any context, related bugs, workarounds
```

---

## Open Bugs

<!-- Add new bugs here -->

### [BUG-001] Web — Calibration attached photos not viewable
- **Priority:** P2
- **Area:** Web
- **Page/Screen:** Calibration detail / asset calibration history (web)
- **Steps to reproduce:**
  1. On mobile, complete a calibration with one or more attached photos.
  2. Confirm in DB / via API that photos are stored against the calibration.
  3. Open the same calibration on the web app.
- **Expected:** Attached photos render in the calibration detail view (thumbnails + lightbox).
- **Actual:** No UI to view attached calibration photos on web.
- **Notes:** Mobile capture + upload path works end-to-end and now correctly tags photos against the event row id (fixed 2026-05-07 as side-effect of the calibration overhaul). This is the missing web viewer. Reported 2026-05-07.

### [BUG-003] Web — Task details UX (PLACEHOLDER, to be specced)
- **Priority:** P3
- **Area:** Web
- **Page/Screen:** Task detail
- **Notes:** Flagged 2026-05-07 — needs walkthrough with Pete to capture the specific issues. Hold for follow-up session.

---

## TODOs / Deferred features

### [TODO-001] Mobile — Visitor management page (active visits + sign out)
- **Priority:** P2
- **Area:** Mobile
- **Page/Screen:** New screen, accessible from Home and/or Profile
- **Description:** Add a "Who's on site" view that lists active visitor visits (`GET /visitors/visits/active`, already wired into `visitorService.listActive` on mobile) and lets the host or an admin sign visitors out via `POST /visitors/visits/{id}/sign-out`.
- **Notes:** Sign-in flow shipped 2026-05-07 via the FAB on Home → CreateVisitorScreen. The active visits backend endpoint already returns flattened visit/visitor/host detail. Currently sign-out is web-only.

---

## Resolved

<!-- Move fixed bugs here with resolution notes -->

### ~~[BUG-002] Mobile — Completed calibration still shows as overdue with original date~~
- **Priority:** P2
- **Area:** Mobile / Backend
- **Resolved:** 2026-05-07
- **Resolution:** Replaced the in-place "PUT /calibrations/{id}" completion path with a forward-looking schedule/event two-table model. Each calibration is now an immutable event row in `asset_calibrations`; "due" calibrations live as pending tickets in the new `asset_calibration_schedules` table. Completing an event consumes the schedule and auto-spawns the next pending one (asset interval on pass, 7-day recheck on fail). Bundles in the deferred calibration auto-schedule item from `project_calibration_autoschedule.md`.
- **Files:** `backend/db/models/asset.py`, `backend/api/v1/calibrations.py`, `backend/api/v1/calibration_schedules.py` (new), `backend/api/v1/tasks.py`, `backend/api/v1/assets.py`, `backend/schemas/asset.py`, `alembic/versions/add_calibration_schedules.py`, `alembic/versions/add_asset_calibration_spec.py`, `packages/mobile/src/components/FeedItemModal.js`, `packages/mobile/src/api/services.js`, `packages/web/src/pages/Calibrations.jsx` (new), `packages/web/src/pages/AssetForm.jsx`.
