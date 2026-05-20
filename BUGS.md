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

### [BUG-006] Backend — Gunicorn workers OOM-killed ~60-90 min after each deploy
- **Priority:** P1 (recurring production outage)
- **Area:** Backend / AWS EB
- **Env:** `auxein-api-prod-lb`, instance i-0c3f1c8061eba0733 (t3.small, 2 GB RAM, **no swap**)
- **Symptom:** API serves traffic fine for ~1 hour after each deploy, then becomes completely offline. Replacement workers OOM as soon as they boot, cascading.
- **Smoking gun (from `/var/log/messages` 2026-05-15 00:52:33):**
  ```
  kernel: Out of memory: Killed process 220455 (gunicorn) total-vm:1851380kB, anon-rss:933016kB
  kernel: oom-kill: ... task=gunicorn, pid=220455
  ```
  Worker 220455 = 911 MB RSS; worker 220454 = 612 MB RSS. Combined ~1.5 GB on a 2 GB box leaves no headroom.
- **Memory growth pattern:** Workers boot at ~250 MB. 72 minutes later they're at 612 + 911 MB. **~14 MB/min growth on essentially idle traffic** → leak signature, not load.
- **Suspected root cause:** SQLAlchemy session leak. Hot suspect is the `Article.tags.overlap` `AttributeError` in `backend/api/v1/articles.py:175` — it throws on every call to `/api/v1/articles/related/{slug}` (and prerender/bot traffic hits this regularly). Exception path likely bypasses the `get_db` dependency teardown, leaving sessions open with cached ORM objects.
- **Contributing factors:**
  - 2 GB instance + 2 gunicorn workers + zero swap is genuinely tight for FastAPI + SQLAlchemy + PostGIS baseline (~250 MB/worker fresh).
  - `utils.seo_prerender` runs every ~5-15 min, potentially loading full article bodies into memory (Tiptap JSON can be 50+ KB each).
- **Immediate mitigation:** `eb restart auxein-api-prod-lb` returns service. Does not fix the leak.
- **Recommended fixes (ranked):**
  1. **Fix `Article.tags.overlap` at `backend/api/v1/articles.py:175`** — switch to `Article.tags.op('&&')(article.tags)` (Postgres ARRAY overlap operator) or cast to `ARRAY(String)`. Eliminates the AttributeError AND the suspected session leak.
  2. **Add gunicorn `--max-requests 500 --max-requests-jitter 50`** in whatever launches gunicorn (Procfile / `.platform/hooks/`). Recycles workers periodically — reclaims leaked memory as a belt-and-braces measure.
  3. **Verify `get_db` teardown.** Confirm `backend/db/session.py` (or wherever `get_db` lives) uses a `try/finally` with `db.close()` so dependency teardown can't leak sessions even on exceptions.
  4. **Audit other endpoints loading PostGIS geometries.** Any `joinedload` on `WineRegion.geometry`, `Block.geometry`, `Property.geometry` pulls 50-500 KB WKB into the session — if the session leaks, that compounds.
  5. **Longer term:** bump to t3.medium (4 GB) or drop to 1 worker. Add swap as a safety net.
- **Verification next session:** SSH to instance, run `watch -n 30 "ps -e -o pid,rss,cmd | grep gunicorn"` while tailing `web.stdout.log`. If RSS climbs while the app is idle → leak confirmed. If it only climbs against specific endpoints → narrow to that endpoint.
- **Logs preserved:** `backend/.elasticbeanstalk/logs/260515_125238/i-0c3f1c8061eba0733/`
- **Reported:** 2026-05-15. Surfaced after Phase A climate-history deploy; the deploy reset workers to clean memory and the hourly leak cycle restarted, making the symptom newly visible. Deploy itself is **not** the cause — the new `/compare/zones/seasons` endpoint returns ~5 KB JSON and was not under load when the OOM fired.

---

## Blockers

<!-- BLOCKER-001 moved to Resolved 2026-05-17 -->

---

## TODOs / Deferred features

<!-- TODO-001 moved to Resolved 2026-05-08 -->

---

## Resolved

<!-- Move fixed bugs here with resolution notes -->

### ~~[BUG-006] Backend — Contractor self check-in violates `contractor_movements.checked_in_by` NOT NULL~~
- **Priority:** P0 (blocks contractor V1 field testing)
- **Area:** Backend / Mobile
- **Resolved:** 2026-05-18
- **Steps to reproduce:** Contractor logs in on mobile, taps Visit FAB, selects a property, completes the check-in form. Backend hits `psycopg2.errors.NotNullViolation` on `contractor_movements.checked_in_by`.
- **Root cause:** `contractor_movements.checked_in_by` + `logged_by` were NOT NULL FKs to `users.id`, but a contractor self-check-in has no user actor. Endpoint already attempted to pass `None` (`checked_in_by=current_user.id if hasattr(current_user, 'company_id') else None`) but the column rejected it. Same shape as the recently-fixed incident reporter bug.
- **Resolution:** Migration `add_movement_self_checkin` drops NOT NULL on the two columns and adds parallel nullable contractor FKs (`checked_in_by_contractor_id`, `checked_out_by_contractor_id`, `logged_by_contractor_id`) with CHECK constraints ensuring at least one side of each pair is populated. `contractor_check_in` / `contractor_check_out` route to the matching FK based on `hasattr(current_user, 'contractor_type')`. `Contractor.movements` and `ContractorMovement.contractor` relationships gained explicit `foreign_keys` to disambiguate the new columns.
- **Files:** `alembic/versions/add_movement_self_checkin.py` (new), `backend/db/models/contractor_movement.py`, `backend/db/models/contractor.py`, `backend/api/v1/contractor_management.py`, `backend/schemas/contractor.py`.

### ~~[BLOCKER-001] Mobile — Cannot create Google Play service account JSON (GCP org policy)~~
- **Priority:** P1
- **Area:** Mobile / Infra
- **Resolved:** 2026-05-16 (per `docs/plans/MOBILE_DEPLOYMENT_STATUS.md`)
- **Resolution:** Org policy `iam.disableServiceAccountKeyCreation` disabled at the org level once super-admin access was reclaimed. Service account `auxein-grow-play` created with JSON key, JSON stored in AWS Secrets Manager (`auxein/grow/play-console-service-account`, ap-southeast-2). First production .aab uploaded to Play Console internal testing track manually; `eas submit` pipeline wiring still tech-debt (see MOBILE_DEPLOYMENT_STATUS.md §Tech Debt #1).
- **Files / config:** `packages/mobile/eas.json` still references `./google-play-service-account.json` — refactor to EAS file secret pending.

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
