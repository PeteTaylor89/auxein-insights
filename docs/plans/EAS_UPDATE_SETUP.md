# EAS Update (OTA) — Setup Plan

**Status:** Scoped 2026-06-01, not yet started. Follow-up to the GPS/auth rebuild.
**Owner:** Pete Taylor
**Goal:** Ship pure-JS fixes (logic in `src/`, screens, copy) over-the-air in seconds instead of a full `eas build` + store-track promotion. Native/config changes still require a build.

---

## Why
Most day-to-day mobile fixes this project ships are pure JS (e.g. this session's `tokenStore.js`, `useGpsTracking.js` logic, `LoginScreen` button). EAS Update delivers those as a new JS bundle to already-installed binaries, no rebuild, no store review. Native changes (`app.json`/Info.plist/AndroidManifest, new native modules, `expo-secure-store` accessibility, etc.) are NOT OTA-able and always need a build.

## Hard constraints (must understand before relying on this)
1. **Setup itself requires ONE more native build.** `expo-updates` is a native module; the first OTA can only land on a binary built *after* this setup. It cannot retro-patch the binary from the current GPS rebuild.
2. **`runtimeVersion` is the compatibility gate.** An update only applies to installed binaries whose `runtimeVersion` matches the update's. Bumping native code/deps must bump `runtimeVersion`, which forces a new build (correctly — old binaries can't run new native code).
3. **What can NEVER ship via OTA:** anything in `app.json` (incl. the `isIosBackgroundLocationEnabled`/`UIBackgroundModes` and permissions), native modules, keychain accessibility, splash/icon, SDK upgrades. JS + assets only.
4. **Store-compliance note:** OTA is for bug fixes / iteration consistent with the reviewed app. Do not use it to introduce materially new behaviour that bypasses Play/App review (esp. anything touching the location/FGS feature set we just declared).

## Current state (verified 2026-06-01)
- `expo` `~54.0.0`, `expo-dev-client` `~6.0.21` installed; **`expo-updates` NOT installed**.
- No `runtimeVersion`, no `updates` block in `app.json`, no `channel` in `eas.json`.
- EAS: projectId `f1dc68ac-bef9-4ad7-a15a-fabca5ccf24f`, owner `auxein`, version `0.1.1`.
- Build profiles: `development`, `preview`, `production` (no channels yet).
- No mobile CI (only backend workflows in `.github/workflows`); builds/updates are run locally.

---

## Plan

### Step 1 — Install + configure (native change → lands in the NEXT build)
```bash
cd packages/mobile
npx expo install expo-updates
eas update:configure        # writes updates.url + EAS project linkage into app.json
```

### Step 2 — runtimeVersion policy (app.json)
Use a fingerprint/appVersion policy so runtimeVersion tracks the native layer automatically:
```json
"runtimeVersion": { "policy": "appVersion" }
```
- `appVersion` policy → runtimeVersion = `expo.version` (currently `0.1.1`). Simple, but you MUST bump `expo.version` whenever native changes, or you'd risk pushing JS that assumes new native code to an old binary. (Alternative: `"fingerprint"` policy auto-detects native changes — more robust, slightly more magic. Decide at implementation.)
- Add the `updates` block (channel-based) so the running app knows where to pull from.

### Step 3 — Wire channels to existing build profiles (eas.json)
Add a `channel` to each build profile so a build subscribes to a matching update stream:
```jsonc
"preview":    { ..., "channel": "preview" },
"production": { ..., "channel": "production" }
```
(`development` uses the dev client; channel optional.)

### Step 4 — First build with updates baked in
`eas build --platform all --profile production` (and/or preview). This binary is the first OTA-capable one. Install it.

### Step 5 — Ship an OTA
```bash
# pure-JS change only:
eas update --channel production --message "fix: <what>"
```
Installed production binaries pull it on next launch (default: check-on-launch).

---

## Decisions to make at implementation
- **runtimeVersion policy:** `appVersion` (simple, manual bump discipline) vs `fingerprint` (auto-detects native drift, safer). Lean `fingerprint` to avoid the "forgot to bump, pushed JS to incompatible binary" footgun.
- **Update check timing:** default ON_LOAD (check at launch) vs manual. ON_LOAD is fine for V1.
- **Channel ↔ track mapping:** `production` channel = the AAB/IPA on store tracks; `preview` channel = internal APK testers. Confirm we don't want a separate `staging`.
- **Rollout safety:** consider `eas update --rollout-percentage` later for gradual rollout; not needed for V1.

## Risks / gotchas
- **EAS uncommitted gotcha applies** (see memory): `eas update` bundles committed state for the JS too — commit before updating, or use `EAS_NO_VCS=1`.
- **Don't conflate channels and git branches** — channel is an EAS-update routing label, independent of branch.
- **Crash risk:** a bad OTA can brick the JS layer of all installed binaries on that channel. `expo-updates` keeps the last-good bundle and can roll back, but adding crash reporting (Sentry — Tech Debt #3 in MOBILE_DEPLOYMENT_STATUS) before leaning hard on OTA is wise.
- **First OTA only reaches post-setup binaries** — communicate that the current GPS-rebuild binary is NOT OTA-updatable.

## Effort
Small + contained: ~Step 1–3 are config, one native build to activate. Half a session. The only "cost" is it must ride a build (can't be OTA'd in itself).
