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

### [BUG-005] Backend — Two zombie alembic migration files
- **Priority:** P3
- **Area:** Backend / Alembic
- **Files:**
  - `alembic/versions/6fbc24f09e13_add_company_support.py` — has `revision = '[generated_revision_id]'` (literal placeholder string, never filled in). The `companies` table + `company_id` columns it tries to create already exist in prod, so the file is dead code.
  - `alembic/versions/abc123456789_add_token_blacklist_only.py` — has `revision = 'abc123456789'` (looks placeholder-ish). Creates `token_blacklist` table which is **actively used in prod** by `backend/core/security/auth.py` (`is_token_blacklisted` / `blacklist_token`). This file is the only migration that creates the table, so either it WAS applied (and prod's `alembic_version` has `abc123456789` as a second pointer) OR the table was created out-of-band.
- **Symptom (re-verified 2026-05-11):** `alembic heads` actually returns a **single head** (`add_banner_audience`) — alembic silently skips the placeholder-revision file and the `abc123456789` file's down_revision (`848feb1504bd`) is far enough back in the chain that newer revisions bury it. Doesn't affect prod or live deploys — only bites fresh-env bootstrapping when both files are picked up by autogenerate.
- **Files referencing token_blacklist (proves it's live):** `backend/db/models/__init__.py`, `backend/db/base.py`, `backend/core/security/auth.py`, `backend/db/models/token_blacklist.py`.
- **Fix steps:**
  1. On prod, run `SELECT version_num FROM alembic_version;`
  2. If only one row (`add_files_s3_key` or whatever is current) → both zombie files are safe to delete.
  3. If two rows (one being `abc123456789`) → either keep `abc123456789_add_token_blacklist_only.py` and properly chain it into the live history with a merge migration, OR delete the `abc123456789` row from `alembic_version` first, then delete the file.
  4. The `6fbc24f09e13` file is always safe to delete regardless (its placeholder revision string can't be in `alembic_version`).
- **Reported:** 2026-05-09. Discovered while adding `add_banner_audience` migration.

---

## Blockers

### [BLOCKER-001] Mobile — Cannot create Google Play service account JSON (GCP org policy)
- **Priority:** P1 (blocks v0.1.1 mobile launch to Play internal testing)
- **Area:** Mobile / Infra
- **Reported:** 2026-05-08
- **Symptom:** Cannot generate the service account JSON key required by `eas submit --platform android`. Every workaround attempted hits another GCP permission wall.
- **What was tried:**
  1. Create JSON key in existing project → blocked by `iam.disableServiceAccountKeyCreation` org policy
  2. Override the policy at the project level → blocked, requires `roles/orgpolicy.policyAdmin` on the auxein.co.nz org
  3. Simulate policy override → blocked, requires `policysimulator.*` permissions on the org
  4. Create a new project outside the org ("No organisation") → blocked, requires `resourcemanager.projects.create` which the auxein.co.nz Workspace org also restricts
- **Root cause:** `pete.taylor@auxein.co.nz` does not hold any org-level GCP admin role on the auxein.co.nz Google Workspace organisation. All escalation paths require a role that account does not have.
- **Unblock paths (next session):**
  - **A. Reclaim Workspace super-admin** — sign in to `admin.google.com` with the auxein.co.nz super-admin account, grant `pete.taylor@auxein.co.nz` the `Organization Administrator` role at the GCP org level, then any of the workarounds above succeeds. Cleanest but requires tracking down the super-admin login.
  - **B. Personal Google account** — create the GCP project + service account under a personal Gmail (no org constraints), then invite the SA email to the auxein.co.nz Play Console with App Admin permissions. Cross-org SA invite is supported by Play Console. Faster but the SA lives outside the org's audit/billing.
- **Other v0.1.1 mobile work is unaffected:** preview APK build via `eas build --profile preview --platform android` does NOT need the SA JSON (only `eas submit` does). Sideload testing can proceed independently.
- **Files / config already in place** waiting for the JSON:
  - `packages/mobile/eas.json` — `submit.production.android.serviceAccountKeyPath: "./google-play-service-account.json"`
  - `.gitignore` — JSON path already excluded
  - `packages/mobile/app.json` — version 0.1.1, package name `co.nz.auxein.grow`
  - Privacy URL live at `https://auxein.co.nz/grow/privacy`

---

## TODOs / Deferred features

<!-- TODO-001 moved to Resolved 2026-05-08 -->

---

## Resolved

<!-- Move fixed bugs here with resolution notes -->

### ~~[BUG-004] Backend — Insights article links resolve to localhost~~
- **Priority:** P2
- **Area:** Backend / Insights
- **Resolved:** 2026-05-08 (same commit as the brand-aware email refactor)
- **Resolution:** Article URLs now use `INSIGHTS_FRONTEND_URL` env var via the new `core/branding.py` Brand abstraction. `seo_prerender.py` reads `settings.INSIGHTS_FRONTEND_URL` (was `FRONTEND_URL`); same env var drives any future Insights-context emails through `email_utils.py` if needed (set `brand=INSIGHTS` on the call). EB env: `INSIGHTS_FRONTEND_URL=https://insights.auxein.co.nz` (set as part of the deploy runbook).
- **Files:** `backend/core/config.py`, `backend/core/branding.py` (new), `backend/utils/seo_prerender.py`, `backend/core/email_utils.py`, `backend/core/email_templates.py`.

### ~~[TODO-001] Mobile — Visitor management page (active visits + sign out)~~
- **Priority:** P2
- **Area:** Mobile
- **Resolved:** 2026-05-08 (commit `1b562ed`)
- **Resolution:** New `packages/mobile/src/screens/VisitorsScreen.js` — active visits list pulled from `visitorService.listActive()`, pull-to-refresh, skeleton + empty + overdue states, bottom-sheet detail with phone/emergency tap-to-dial, red Sign-out CTA → `POST /visitors/visits/{id}/sign-out`. Wired into `HomeStack` as a sub-screen of Home (so the Map tab slot stays open for v0.2). HomeScreen context bar gets an "N on site" / "On site" chip next to the property pill, taps into VisitorsScreen.
- **Files:** `packages/mobile/src/screens/VisitorsScreen.js` (new), `packages/mobile/src/api/services.js` (added `signOut`), `packages/mobile/src/navigation/AppNavigator.js`, `packages/mobile/src/screens/HomeScreen.js`.

### ~~[BUG-002] Mobile — Completed calibration still shows as overdue with original date~~
- **Priority:** P2
- **Area:** Mobile / Backend
- **Resolved:** 2026-05-07
- **Resolution:** Replaced the in-place "PUT /calibrations/{id}" completion path with a forward-looking schedule/event two-table model. Each calibration is now an immutable event row in `asset_calibrations`; "due" calibrations live as pending tickets in the new `asset_calibration_schedules` table. Completing an event consumes the schedule and auto-spawns the next pending one (asset interval on pass, 7-day recheck on fail). Bundles in the deferred calibration auto-schedule item from `project_calibration_autoschedule.md`.
- **Files:** `backend/db/models/asset.py`, `backend/api/v1/calibrations.py`, `backend/api/v1/calibration_schedules.py` (new), `backend/api/v1/tasks.py`, `backend/api/v1/assets.py`, `backend/schemas/asset.py`, `alembic/versions/add_calibration_schedules.py`, `alembic/versions/add_asset_calibration_spec.py`, `packages/mobile/src/components/FeedItemModal.js`, `packages/mobile/src/api/services.js`, `packages/web/src/pages/Calibrations.jsx` (new), `packages/web/src/pages/AssetForm.jsx`.
