# Mobile Build Pipeline (EAS)

**Created:** 2026-04-27
**Scope:** `packages/mobile/` — Auxein Grow Expo app
**Toolchain:** Expo SDK 54, React Native 0.81, EAS Build/Submit

---

## EAS Project

- **Owner:** `auxein` (Expo organisation)
- **Project ID:** `f1dc68ac-bef9-4ad7-a15a-fabca5ccf24f`
- **Slug:** `auxein-grow`
- **Dashboard:** https://expo.dev/accounts/auxein/projects/auxein-grow

Linked via `eas init` on 2026-04-27. The project ID lives in `app.json` under `extra.eas.projectId` and must not be regenerated.

---

## File Layout

| File | Purpose |
|---|---|
| `packages/mobile/app.json` | Static base config (name, bundle ID, permissions, splash, icons, plugins). |
| `packages/mobile/app.config.js` | Dynamic overlay — reads env vars at config-eval time, appends the Mapbox plugin, injects `extra.apiUrl` + `extra.mapboxPublicToken`. |
| `packages/mobile/eas.json` | Build + submit profiles (`development` / `preview` / `production`). |
| `packages/mobile/package.json` | JS deps. `@rnmapbox/maps` added 2026-04-27. |

`app.config.js` extends `app.json` — Expo loads JSON first, passes it as `config` to the JS function, which spreads + overrides. Static stuff stays in JSON; anything env-driven goes in JS.

---

## Build Profiles

| Profile | Distribution | Output | API_URL | Use case |
|---|---|---|---|---|
| `development` | internal | APK + devClient | LAN dev backend | Day-to-day dev on physical device. Hot reload via Metro. |
| `preview` | internal | APK | `https://api.auxein.co.nz/api` | Internal testers, beta walkthroughs. Sideloaded. |
| `production` | store | AAB (Android) / IPA (iOS) | `https://api.auxein.co.nz/api` | Play Store / App Store submission. `autoIncrement: true`. |

`appVersionSource: remote` means EAS owns Android `versionCode` and iOS `buildNumber` server-side. The `version` field in `app.json` (semver, user-facing) is bumped manually.

---

## Environment Variables

Two layers:

### 1. eas.json `env` blocks (plaintext, in repo)

For non-secret per-profile values:

- `API_URL` — backend URL per environment.

These are visible to anyone with repo access. Never put secrets here.

### 2. EAS environment variables (managed via `eas env:*`)

Bound to one or more environment buckets (`development` / `preview` / `production`). Each profile in `eas.json` declares its bucket via `"environment": "..."` so EAS knows which vars to inject.

| Var | Visibility | Environments | Notes |
|---|---|---|---|
| `MAPBOX_DOWNLOAD_TOKEN` | secret | dev + preview + prod | `sk.*` token with `DOWNLOADS:READ` scope. Build-time only — used by `@rnmapbox/maps` config plugin to download the native SDK during prebuild. Never readable post-creation. |
| `MAPBOX_PUBLIC_TOKEN` | sensitive | dev + preview + prod | `pk.*` token. Bundled into the app binary at build time, injected into `extra.mapboxPublicToken` via `app.config.js`. Hidden from build logs but readable in EAS dashboard. |

**Visibility levels (EAS):**
- `plaintext` — visible in `eas.json`, dashboard, and build logs. Use for `API_URL`-style values.
- `sensitive` — hidden from logs and `eas.json` output, readable in dashboard. Use for keys that end up in the app bundle anyway (`pk.*` tokens).
- `secret` — write-once, never readable. Use for true server-side secrets (`sk.*` tokens, signing keys).

### Creating env vars

```bash
cd packages/mobile

eas env:create \
  --environment development --environment preview --environment production \
  --name MAPBOX_DOWNLOAD_TOKEN \
  --type string \
  --visibility secret \
  --value sk.xxx_your_token_xxx

eas env:create \
  --environment development --environment preview --environment production \
  --name MAPBOX_PUBLIC_TOKEN \
  --type string \
  --visibility sensitive \
  --value pk.xxx_your_token_xxx

eas env:list
```

---

## Build Commands

All run from `packages/mobile/`.

```bash
# Day-to-day dev — install on a physical Android device
eas build --profile development --platform android

# Internal beta APK against prod API
eas build --profile preview --platform android

# Store-bound Android Bundle
eas build --profile production --platform android

# iOS (requires Apple Developer Program enrollment + EAS credentials wired)
eas build --profile production --platform ios
```

Each EAS build runs `npx expo prebuild` server-side to materialise the native `android/`/`ios/` projects from `app.json` + plugins, then compiles with the appropriate native toolchain. Typical wall time:

- Android dev/preview APK: ~12–18 min
- Android production AAB: ~15–25 min
- iOS production IPA: ~20–30 min

Build artefacts are downloadable from the build page on the EAS dashboard.

---

## Local Dev (Expo Go)

Expo Go does not include native modules, so Mapbox doesn't render in Expo Go — you'll see a blank map area or fallback UI. Use it for everything else (forms, auth, lists, GPS via foreground location).

```bash
cd packages/mobile
npm start                 # LAN
npm start -- --tunnel     # tunnel mode (for poor LAN, or split-tunnel testing)
```

For map work, you must use a `development` profile EAS build — installs as a separate APK alongside Expo Go but talks to the same Metro dev server.

---

## Submission (Future — Stores)

Both store accounts are deferred (V0.1 ships via internal-distribution APK + TestFlight only).

When ready:

```bash
# Android — needs Google Play service account JSON in EAS Secrets
eas submit --platform android --latest

# iOS — needs App Store Connect API key (.p8) in EAS Secrets
eas submit --platform ios --latest
```

`submit.production` block in `eas.json` is currently empty — it'll be filled with service-account/key references at submission setup time.

---

## Versioning Policy

- `app.json` `version` — semver, user-facing, bumped manually per release.
- Android `versionCode` / iOS `buildNumber` — auto-incremented by EAS (one per build).

V0.1 series: `0.1.0` → `0.1.1` → `0.1.2` etc. for testing iterations. V1.0 = first commercial release.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Failed to resolve plugin for module "@rnmapbox/maps"` | `npm install` not run after dep was added | `cd packages/mobile && npm install` |
| `eas env:create` fails with no detail | Missing `--environment` flag, or visibility flag invalid | Pass at least one `--environment <bucket>` and one of `--visibility plaintext|sensitive|secret` |
| Build succeeds but Mapbox shows "missing token" | Public token not in EAS env, or wrong environment bucket | `eas env:list` — confirm `MAPBOX_PUBLIC_TOKEN` is in the bucket matching the build profile's `environment` |
| LAN dev build can't reach backend | LAN IP changed | Update `env.API_URL` in `eas.json` `development` profile, rebuild. Or set `API_URL` as an EAS env var instead. |
