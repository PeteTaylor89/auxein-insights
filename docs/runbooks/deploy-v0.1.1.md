# Deploy Runbook — v0.1.1 (2026-05-08)

End-to-end checklist to push the current `main` branch to AWS production and the Auxein Grow mobile app to Google Play Console internal testing.

## Pre-flight (verify before starting)

- [ ] On `main`, `git status` clean
- [ ] Last commit is `7970a49 feat: calibration schedules, mobile visitor sign-in, grow privacy page` or later (today's Phase 1 visitor management commit on top)
- [ ] Local backend boots clean: `cd backend && uvicorn main:app --reload` and `GET http://localhost:8000/api/health` returns 200
- [ ] EAS authenticated: `eas whoami` returns `auxein` from `packages/mobile/`
- [ ] AWS CLI authenticated: `aws sts get-caller-identity` returns the deploy IAM user

---

## Stage 1 — Backend → Elastic Beanstalk

### 1.1 Alembic migration

**Good news**: there is currently **only one head** (`add_asset_calibration_spec`) — verified 2026-05-08 via `alembic heads`. The 4-divergent-heads warning in older project notes is stale. `alembic upgrade head` will work cleanly. (If you somehow see multiple heads at deploy time, run `alembic merge -m "consolidate" <rev1> <rev2>` first.)

```powershell
# Local pre-check against your local DB
cd A:\auxein-insights-V0.1
alembic heads
alembic current
```

Production migration — there are two safe approaches. Pick one:

**Option A** (simpler — run from your laptop with prod DB credentials):

```powershell
# Set prod DB env vars in the current shell ONLY (don't persist)
$env:DATABASE_URL = "postgresql://USER:PASSWORD@auxein-rds-prod...ap-southeast-2.rds.amazonaws.com:5432/auxein"
cd A:\auxein-insights-V0.1
alembic upgrade head
alembic current   # confirm on add_asset_calibration_spec
Remove-Item Env:\DATABASE_URL
```

**Option B** (safer — SSH into EB instance and run there). Use this if RDS isn't publicly reachable.

```bash
eb ssh auxein-api-prod-lb
cd /var/app/current
source /var/app/venv/*/bin/activate
alembic upgrade head
alembic current
exit
```

### 1.2 EB deploy

```powershell
cd A:\auxein-insights-V0.1\backend
eb status auxein-api-prod-lb
eb deploy auxein-api-prod-lb
```

Watch the deploy for ~5 min. Tail logs if needed: `eb logs --all --stream`.

### 1.3 Smoke test

- [ ] `curl https://api.auxein.co.nz/api/health` → 200
- [ ] Hit `/api/v1/visitors/visits/active` (auth required) — should not 5xx
- [ ] Hit `/api/v1/calibration-schedules` — should return list
- [ ] Hit `/api/v1/calibrations` — should return list with the new event-row shape
- [ ] Spot-check a calibration completion in the web UI to confirm the new schedule/event flow works

If anything 5xx's, check logs: `eb logs auxein-api-prod-lb`. Alembic schema drift is the most likely culprit.

---

## Stage 2 — Web (Pro app) → S3/CloudFront

```powershell
cd A:\auxein-insights-V0.1\packages\web
npm run build
# Output: packages/web/dist/

aws s3 sync dist/ s3://<pro-app-bucket>/ --delete --profile <aws-profile>
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*" --profile <aws-profile>
```

> Bucket name + distribution ID — fill in from your existing AWS deploy notes (this runbook deliberately doesn't hardcode them; verify in the AWS console under CloudFront).

Smoke: open `https://app.auxein.co.nz` (or wherever Pro is hosted) → log in → visit `/calibrations` (the new combined page from yesterday's commit) → confirm it loads + filters work.

---

## Stage 3 — Insights SPA → S3/CloudFront

```powershell
cd A:\auxein-insights-V0.1\packages\insights
npm run build
aws s3 sync dist/ s3://<insights-bucket>/ --delete --profile <aws-profile>
aws cloudfront create-invalidation --distribution-id <insights-dist-id> --paths "/*" --profile <aws-profile>
```

Smoke: open `https://insights.auxein.co.nz` → home loads, climate widget renders.

---

## Stage 4 — Marketing site → its host

The Grow privacy page (`/grow/privacy`) shipped in commit `7970a49` and is **required for Play Console submission**. Confirm it's live at `https://auxein.co.nz/grow/privacy` BEFORE submitting the Android app.

```powershell
cd A:\auxein-insights-V0.1\packages\auxein-marketing
npm run build
# Then deploy via your existing flow (Vercel / S3 / however marketing is hosted)
```

Smoke:

- [ ] `https://auxein.co.nz/grow/privacy` returns 200 and renders the Auxein Grow privacy policy
- [ ] `https://auxein.co.nz/privacy` and `https://auxein.co.nz/terms` cross-link correctly to the Grow privacy page

---

## Stage 5 — Mobile → Google Play internal testing

### 5.1 Play Console one-time setup (skip if done)

- [ ] Enrolled in Google Play Console ($25 one-off, ~24h account review)
- [ ] App created in Play Console with package name **`co.nz.auxein.grow`** (matches `app.json` android.package)
- [ ] App content questionnaires filled (privacy, target audience, data safety, etc.)
- [ ] Privacy policy URL set to **`https://auxein.co.nz/grow/privacy`**
- [ ] App access (test account) provided to Google reviewers
- [ ] Internal testing track created with at least one tester email
- [ ] Service account created in Google Cloud Console (linked to the Play project), JSON key downloaded
- [ ] In Play Console → Setup → API access: invited the service account with **Release manager** permissions to the app

### 5.2 Wire the service account JSON into EAS

```powershell
# Drop the JSON key from Google Cloud Console into:
#   A:\auxein-insights-V0.1\packages\mobile\google-play-service-account.json
# (already gitignored — safe to leave on disk)
```

`eas.json` already references this path under `submit.production.android.serviceAccountKeyPath` (Phase 3 edit).

### 5.3 Cut a preview APK (optional but recommended)

Sideload-test against the freshly-deployed `api.auxein.co.nz` BEFORE submitting the AAB:

```powershell
cd A:\auxein-insights-V0.1\packages\mobile
eas build --profile preview --platform android
# ~15 min build time. Download APK from the EAS dashboard, install on test device.
```

Test path on the APK:

- [ ] Login against prod
- [ ] Home shows tiles + "On site" chip
- [ ] Tap chip → Visitors screen loads (empty if no active visits)
- [ ] FAB → Visitor → register a test visitor → returns to Home → "On site" chip shows 1
- [ ] Visitors screen → tap row → bottom-sheet → Sign out → confirm → row disappears
- [ ] Calibration completion still works (mobile FeedItemModal) end-to-end

### 5.4 Production AAB + Play submission

```powershell
cd A:\auxein-insights-V0.1\packages\mobile
eas build --profile production --platform android
# ~20 min build time. Produces an AAB on EAS.

eas submit --platform android --latest --track internal
# Pulls the AAB and uploads to the Play internal testing track.
# `releaseStatus: draft` in eas.json means it lands as a draft you must promote in Play Console.
```

### 5.5 Promote in Play Console

- [ ] Open Play Console → Internal testing → Releases overview
- [ ] Confirm the new release shows the AAB version code (`versionCode` is auto-incremented by EAS — check the build summary)
- [ ] Add release notes (suggested: "v0.1.1 — Visitor sign-out + Who's-on-site, calibration schedule overhaul")
- [ ] Promote the draft → review → roll out to internal testers
- [ ] Tester install link: Play Console → Internal testing → Testers tab → copy opt-in URL → send to your test list

---

## Rollback notes

| Stage | Rollback |
|---|---|
| Backend | `eb appversion --delete <bad-label>` then `eb deploy <previous-label>`. Alembic: `alembic downgrade -1` (only safe if the migration is reversible — `add_asset_calibration_spec` is column-add only, so a downgrade just drops them; data loss risk is low) |
| Web / Insights | Re-sync the previous build dir from S3 versioning, or rebuild from the previous commit |
| Marketing | Redeploy previous commit |
| Mobile | Halt the Play release in Internal testing; testers stay on the previous version. Cut a fix build with bumped `version` in `app.json` |

---

## Post-deploy checklist

- [ ] Update `MEMORY.md` `project_grow_v1_progress.md` deployment state from "behind / not deployed" → "deployed v0.1.1 on YYYY-MM-DD"
- [ ] Note the alembic head correction: only one head, not 4
- [ ] Move TODO-001 (visitor management page) → resolved in `BUGS.md`
- [ ] Record Play internal testing URL in `MEMORY.md` for next session
