# EAS Update (OTA) — Setup Plan

**Status: IMPLEMENTED 2026-09-02.** Config is in the tree; it activates with build 10.
**Owner:** Pete Taylor

---

## IMPLEMENTED — what was actually done, and the two things measured

- `expo-updates@~29.0.20` installed.
- `app.json`: `runtimeVersion: { policy: "fingerprint" }`, `updates.url` pointing at
  `https://u.expo.dev/f1dc68ac-bef9-4ad7-a15a-fabca5ccf24f`, `fallbackToCacheTimeout: 0`.
- `eas.json`: `channel` added to all three build profiles, each matching its own name.
- `app.config.js`: the Mapbox **download token is no longer a plugin option** (see below).
- `fingerprint.config.js`: new, skipping `ExpoConfigExtraSection` (see below).
- Version bumped to `0.2.1`, iOS `buildNumber` 10, Android `versionCode` 10.
- Nothing added to `App.js` — `ON_LOAD` is the default and needs no runtime code.

### Finding 1: the Mapbox download token would have broken every OTA, silently

`RNMapboxMapsDownloadToken` as a plugin option is written into `gradle.properties`, which makes it
native config, which puts it **inside the fingerprint**. It is an EAS Secret — so it is set on the
build server and NOT on the machine that runs `eas update`. Measured, production/android:

    without the token   67aefe3a5166a935f03e4a3aebab911dda814f90
    with the token      870cf724793f526853c109715d61cceacab52b6e

The build would have stamped one runtimeVersion and every `eas update` the other, so **no update
would ever have reached a binary — with no error anywhere.** The plugin now reads
`RNMAPBOX_MAPS_DOWNLOAD_TOKEN` from the environment instead, which is also what it recommends;
all three token states now fingerprint identically.

**Action required in EAS:** the secret must be named `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`. If it is
currently `MAPBOX_DOWNLOAD_TOKEN`, add the new name — `app.config.js` logs a warning if only the
old one is set, and the Android build cannot fetch the Mapbox SDK without it.

### Finding 2: `extra` was in the fingerprint, so the Sentry DSN could not have ridden an OTA

The fingerprint hashes the whole resolved config, `extra` included. Measured:

    baseline                            b86a3a360cc353a1161959df8132ea82e69a470a
    SENTRY_DSN set                      dad1b78e29cf6f2134ec68b88947223ee46f14d5
    SENTRY_DSN + SENTRY_ORG/PROJECT     9b5b114f21f866ababb27ba02d3d9cfa0180ca22

`extra` is exactly the bag of JS-readable values an OTA should be able to change — `apiUrl`,
`appVariant`, `mapboxPublicToken`, `sentryDsn`. `fingerprint.config.js` now skips that section.
After the skip:

    baseline / DSN only / mapbox token / different API_URL   889630d3129aca3c4a8c931eb139abffb45e1832
    DSN + ORG + PROJECT                                      e9b0ad9b1f443e9c4365081ef076b4556b98fb31

**So: shipping build 10 without a Sentry DSN does NOT cost a build.** An OTA carrying only
`SENTRY_DSN` turns crash reporting on in the installed binary — the native handler is already
there, because the plugin is added unconditionally. `SENTRY_ORG`/`SENTRY_PROJECT` still move the
fingerprint (they are plugin options that write native files), but they only buy **source-map
upload**, i.e. readable rather than minified stack traces. Reporting works without them.

### What still forces a build

Native modules, plugin options, dependencies, icons, splash, permissions, bundle identifiers, the
native project files. All still in the fingerprint, all still correctly incompatible with an old
binary.

---
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
