# Auxein Grow — Mobile Deployment Status

**Date:** 16 May 2026
**Owner:** Pete Taylor
**Purpose:** Context handover for Claude Code (or future sessions) on the state of Auxein Grow's mobile app deployment pipeline (Google Play + Apple App Store / TestFlight).

---

## TL;DR

First Android and iOS builds successfully produced via EAS Build. Android .aab installed on Pete's device via Play Console internal testing track. Apple Developer account registered; iOS build artifact ready but not yet submitted to TestFlight. Several Play Console compliance forms (privacy policy, data safety, store listing assets) still outstanding before external rollout possible.

`eas submit` pipeline not yet wired up — first Android release was a manual .aab upload to Play Console. Service account JSON for Play Console API is stored in AWS Secrets Manager and not in the repo.

---

## App Configuration

**Stack:** React Native + Expo SDK 54 (managed workflow) + EAS Build
**Source location:** `packages/mobile` (npm workspace in monorepo at repo root)
**Bundle IDs:** `nz.co.auxein.grow` (matched across iOS and Android)
**Current version:** 0.1.1 (from `app.json` `expo.version`)
**EAS project ID:** `f1dc68ac-bef9-4ad7-a15a-fabca5ccf24f`
**EAS owner:** `auxein`

### Key config files

- `packages/mobile/app.json` — Expo config; `extra.apiUrl` set to `https://api.auxein.co.nz/api`
- `packages/mobile/eas.json` — three build profiles: `development`, `preview`, `production`
- `packages/mobile/.npmrc` — contains `legacy-peer-deps=true` to handle React 18/19 workspace mismatch

### Backend dependency

Mobile app calls `https://api.auxein.co.nz/api` (FastAPI on Elastic Beanstalk). Confirmed live and reachable (`/health` returns `{"status":"healthy","service":"vineyard-api","version":"0.1.0"}`).

---

## Google Play — Status

### Completed

- ✅ GCP project `auxein-grow-play` created
- ✅ Google Play Android Developer API enabled on the project
- ✅ Organization Policy `iam.disableServiceAccountKeyCreation` disabled at org level (required to allow service account key creation; can be re-enabled if desired)
- ✅ Service account created in `auxein-grow-play`, JSON key generated
- ✅ JSON key stored in AWS Secrets Manager: `auxein/grow/play-console-service-account` (region `ap-southeast-2`)
- ✅ Local copy of JSON deleted from disk; never committed to repo
- ✅ Play Console developer account active
- ✅ App record created in Play Console: "Auxein Grow"
- ✅ Service account invited to Play Console as a user with account-level permissions
- ✅ Service account granted app-level Admin permissions for Auxein Grow
- ✅ First production .aab built via EAS (`eas build --platform android --profile production`)
- ✅ .aab uploaded manually to Play Console internal testing track
- ✅ Play App Signing enrolled (Google manages signing key; EAS-generated upload key)
- ✅ Pete added as internal tester, app installed and running on personal device

### Outstanding

- ⏳ Privacy policy URL — needs to exist at a public URL (e.g. `auxein.co.nz/privacy`) before any track can roll out beyond current state
- ⏳ Data safety form (location collection, background location declarations) — required
- ⏳ Content rating questionnaire
- ⏳ Target audience and content declaration (18+)
- ⏳ App access — provide test account credentials for Google reviewers
- ⏳ Ads declaration (likely "No")
- ⏳ Store listing assets: short description, full description, 512×512 icon, 1024×500 feature graphic, ≥2 phone screenshots
- ⏳ `eas submit` pipeline wiring (currently manual .aab upload; see Tech Debt section)

---

## Apple App Store / TestFlight — Status

### Completed

- ✅ Apple Developer Program enrollment completed
- ✅ EAS authenticated with Apple ID, certificates and provisioning profiles auto-generated
- ✅ Bundle ID `nz.co.auxein.grow` registered on Apple Developer portal
- ✅ First production .ipa built via EAS

### Outstanding

- ⏳ App Store Connect app record creation (may have been auto-created by EAS during build; needs verification)
- ⏳ `eas submit --platform ios --latest` to push .ipa to App Store Connect
- ⏳ TestFlight Test Information (feedback email, beta description, what to test)
- ⏳ Pete added as internal tester in App Store Connect (Users and Access → App Manager role required)
- ⏳ Install on personal iPhone via TestFlight
- ⏳ Background location justification document (will be required for external Beta App Review)

---

## EAS Configuration Snapshot

### `eas.json`

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal",
        "releaseStatus": "draft",
        "changesNotSentForReview": false
      }
    }
  }
}
```

**Known issue:** `submit.production.android.serviceAccountKeyPath` points to a file that does not (and should not) exist locally. Needs refactor to fetch from AWS Secrets Manager at submit time — see Tech Debt.

### Build profiles

- `development` — APK, dev client, internal distribution
- `preview` — APK, internal distribution, production API
- `production` — AAB (Android) / IPA (iOS), auto-increments build numbers via EAS-managed remote versioning

---

## Workspace / Monorepo Notes

Repo root is npm workspaces. Workspaces declared: `packages/*`.

Packages in workspace:
- `packages/mobile` — React Native app (uses React 19 via Expo SDK 54)
- `packages/shared` — shared utilities (`@vineyard/shared`)
- `packages/insights` — Insights web frontend (`@vineyard/insights`, React 18)
- `packages/web` — Pro/Grow web frontend (`@vineyard/web`, React 18)
- `backend/` — FastAPI (not a workspace package)

### React version mismatch (resolved)

Mobile uses React 19; insights/web use React 18. `@vineyard/shared` previously had peer dep `react: "^18.3.1"` which caused EAS Build to fail on `npm ci` with `ERESOLVE` errors. Fix applied:

```json
"peerDependencies": {
  "react": "^18.3.1 || ^19.0.0"
}
```

Also added `packages/mobile/.npmrc` with `legacy-peer-deps=true` as a safety net for future peer dep conflicts during EAS builds.

**Note:** `react-dom` peer dep in `@vineyard/shared` was also widened similarly, though react-dom is not used by the mobile package directly.

---

## Credentials and Secrets

| Credential | Storage Location | Notes |
| --- | --- | --- |
| Play Console service account JSON | AWS Secrets Manager: `auxein/grow/play-console-service-account` (ap-southeast-2) | Original local copy deleted; only authoritative source |
| Android upload keystore | EAS-managed (Expo servers) | Inspect via `eas credentials` |
| iOS Distribution certificate | EAS-managed | |
| iOS provisioning profile | EAS-managed | |
| Apple ID / 2FA | Pete's personal Apple ID | Used during `eas build` for cert generation |
| Google Play test reviewer account | _Not yet created_ | Needed for App Access form |

**Rule:** No credentials in the repo. Never commit `.json` service account keys. `.gitignore` covers the typical patterns; `packages/mobile/.npmrc` is committed (not sensitive).

---

## Tech Debt / Known Issues

### 1. `eas submit` for Android not wired up

Current state: first release was manual .aab upload via Play Console UI. To automate:

**Option A (preferred):** EAS file secret
```bash
# One-time setup
aws secretsmanager get-secret-value \
  --secret-id auxein/grow/play-console-service-account \
  --region ap-southeast-2 \
  --query SecretString --output text > /tmp/play-key.json

cd packages/mobile
eas secret:create --scope project --name GOOGLE_SERVICE_ACCOUNT_KEY --type file --value /tmp/play-key.json
rm /tmp/play-key.json
```

Then update `eas.json` `submit.production.android` to reference the EAS secret name instead of a file path. Need to confirm exact syntax — EAS docs.

**Option B:** Fetch JSON from Secrets Manager at submit time, pass via `--key` flag, delete after. Works but requires AWS credentials wherever `eas submit` runs (fine locally, more setup for CI).

**2026-08-13 — partial.** `eas.json` still points `serviceAccountKeyPath` at
`./google-play-service-account.json`. That path was **not gitignored** (only the differently-named
`auxein-gro-play-*.json` was), so creating the file `eas submit` expects would have committed a
Play Console service account key. Now covered by `packages/mobile/*-service-account.json` in
`.gitignore`.

An `ios` block was added under `submit.production` with **placeholders** for `ascAppId` and
`appleTeamId` — both need real values from App Store Connect before `eas submit --platform ios`
will run. `appleId` is set to Pete's address.

The EAS-secret migration (Option A) is still not done: the exact `eas.json` syntax for referencing
a file secret should be confirmed against current EAS docs rather than guessed, since a wrong key
path fails at submit time with an unhelpful error.

### 2. `extra.apiUrl` hardcoded in `app.json` — RESOLVED 2026-08-13

`app.config.js` already resolved `process.env.API_URL || config.extra?.apiUrl`, so the mechanism
existed; what was missing was any profile actually *setting* `API_URL`. Each `eas.json` build
profile now sets it explicitly, so a profile's backend is visible in one place instead of being
an implicit fallback to the `app.json` value.

All three profiles currently point at prod. To build against something else, change `API_URL` on
that profile only. Local Metro testing still uses `packages/mobile/.env`.

### 3. Crash reporting not wired up

No Sentry, Bugsnag, or equivalent. Flying blind on what testers hit. Worth adding before external testing rollout.

### 4. Service account key rotation policy

GCP org policy `iam.disableServiceAccountKeyCreation` was disabled to allow initial key creation. Should be re-enabled at the org level, and rotation should happen via temporarily disabling and re-enabling. No automated rotation Lambda exists. Manual rotation reminder: every 90 days.

### 5. Google reviewer test account

Needs creation in production database before App Access form can be filled and before any non-internal Play Console track is submitted. Account should be:
- Email: e.g. `playreview@auxein.co.nz` (real address so password resets work)
- Pre-populated with demo vineyard/block/task data
- Documented in App Access form with usage notes

### 6. `app.json` Android permissions — RESOLVED 2026-08-13

The duplication described here was already gone by the time it was checked. **The "clean version"
this doc previously recommended was also wrong** — it listed `ACCESS_BACKGROUND_LOCATION`, which
the app has never requested and must not (see `LOCATION_COMPLIANCE_V1.md`: the design was a
foreground service specifically to avoid it).

Separately, the GPS mothball on 2026-08-13 made several permissions dead, and they were removed:

| Removed | Was for |
|---|---|
| `FOREGROUND_SERVICE` | task GPS tracking foreground service |
| `FOREGROUND_SERVICE_LOCATION` | same |
| `isIosBackgroundLocationEnabled: true` | iOS `UIBackgroundModes: location` |
| `isAndroidForegroundServiceEnabled: true` | generated the two Android permissions above |

Current set is `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`. Location is
still genuinely needed — observation spots, incidents, risks, map follow-user and contractor
check-in all use one-shot `expo-location` reads — but only **when in use**.

**Why this matters for store review:** no foreground-service or background-location declaration is
now required, which removes the Play Console background-location questionnaire and the
corresponding App Store background-mode scrutiny, and simplifies the Data Safety form.

**If GPS tracking is ever revived, these must come back** — `startLocationUpdatesAsync` with a
`foregroundService` option will fail without them. The iOS usage string was also reworded to drop
the reference to recording tractor activity, since it no longer does.

---

## Next Steps (suggested order)

### Immediate (today / this week)

1. Complete Play Console blocking forms in order: privacy policy URL → data safety → content rating → target audience → ads → store listing assets
2. Run `eas submit --platform ios --latest` to push iOS build to App Store Connect
3. Set up TestFlight internal testing group, add Pete, install on iPhone
4. Create Google reviewer test account in production DB; fill App Access form

### Short term (next 1–2 sessions)

5. Wire up `eas submit` for Android via EAS file secret (Option A above)
6. Add Sentry or equivalent crash reporting to mobile app
7. Refactor `extra.apiUrl` to use `app.config.js` + environment variables
8. Re-enable `iam.disableServiceAccountKeyCreation` org policy
9. Clean up duplicate Android permissions in `app.json`

### Before external testing rollout

10. Prepare background location justification (1 paragraph) — required for both Apple Beta App Review and Play Console sensitive permissions review
11. Take real screenshots from working app on device (Android and iOS variants required for store listings)
12. Decide on external tester list (which growers, how many, which devices)
13. Submit for Apple Beta App Review (external TestFlight) — ~24h turnaround
14. Decide whether to use closed or open testing track on Play Console for external rollout

### Operational (ongoing)

15. Document update workflow in `Auxein_Inisghts_Deployment_Workflow_V1_0.docx` — section 12 (Mobile Apps) drafted but not yet inserted
16. Establish version bump convention (semver on `expo.version`, EAS auto-manages build numbers)
17. Establish release notes convention for Play Console / TestFlight uploads
18. Establish tester feedback channel (TestFlight has built-in feedback; Android needs separate mechanism — email or form)

---

## Useful Commands

```bash
# From packages/mobile

# List recent EAS builds
eas build:list

# View EAS-managed credentials
eas credentials

# Trigger production build
eas build --platform all --profile production

# Submit iOS to App Store Connect
eas submit --platform ios --latest

# Check backend health (sanity)
curl https://api.auxein.co.nz/api/health

# Pull Play Console service account JSON from Secrets Manager (when needed)
aws secretsmanager get-secret-value \
  --secret-id auxein/grow/play-console-service-account \
  --region ap-southeast-2 \
  --query SecretString --output text > /tmp/play-key.json
# ... use it ...
rm /tmp/play-key.json
```

---

## File Locations Reference

| File | Purpose |
| --- | --- |
| `packages/mobile/app.json` | Expo app config (bundle IDs, version, permissions, plugins) |
| `packages/mobile/eas.json` | EAS Build and Submit profiles |
| `packages/mobile/.npmrc` | npm config (currently sets `legacy-peer-deps=true`) |
| `packages/mobile/src/api/api.js` | API client; reads `apiUrl` from `Constants.expoConfig.extra` |
| `packages/shared/package.json` | Workspace shared utils; peer deps updated to accept React 18/19 |
| `Auxein_Inisghts_Deployment_Workflow_V1_0.docx` | Master operations doc; mobile section 12 drafted, not yet inserted |
