# Deployment Workflow doc — versioning edit

Edit to apply to **Auxein Inisghts Deployment Workflow V1.0.docx** → section **12. Mobile Apps (Auxein Grow)**.

The doc could not be edited directly (it was open in Word / is a binary `.docx`). Apply the change below by hand in Word.

---

## ACTION: replace the whole body of §12.1 Versioning

The current §12.1 text describes the old **remote** scheme and is now wrong:

> ~~versionCode (Android) and buildNumber (iOS) are managed remotely by EAS — appVersionSource: "remote"... EAS auto-increments the platform build numbers on every build via autoIncrement: true...~~

Delete that and paste the following in its place (keep the `12.1 Versioning` Heading 3).

---

### 12.1 Versioning  *(new text)*

Two independent numbers, set **locally** in `packages/mobile/app.json` and tracked in git (`appVersionSource: "local"` in `eas.json`):

- **`expo.version`** — marketing semver (MAJOR.MINOR.PATCH), shown on the store listing. Bumped **deliberately per release**, not per build.
- **`ios.buildNumber`** (string) and **`android.versionCode`** (integer) — the per-upload build counter. Kept in **lockstep** (the same integer) and incremented on **every** build. Never reused.

Why local rather than remote: the build number lives in the repo, pinned to the commit that produced the build. There is no invisible EAS server counter that can drift out of sync with the stores — that drift was the cause of the duplicate-build-number rejection (`build number N already used`).

**Bump before every build** — from `packages/mobile`:

| Command | Effect |
|---|---|
| `npm run bump:build` | +1 build number only (same release, new build) — most common |
| `npm run bump:patch` | +1 build AND 0.1.1 → 0.1.2 (bugfix release) |
| `npm run bump:minor` | +1 build AND 0.1.1 → 0.2.0 (feature release) |
| `npm run bump:major` | +1 build AND → 1.0.0 |
| `npm run version:show` | print current numbers, change nothing |
| `npm run bump:build -- --build N` | force a specific build integer (e.g. to clear a store clash) |

The bump script is `packages/mobile/scripts/bump-build.mjs`.

**Rules**

1. Run a bump command → **commit `app.json`** → then `eas build`. With local versioning, EAS reads `app.json` from the **committed git state** — an uncommitted bump is silently ignored.
2. Build both platforms together (`eas build --platform all --profile production`) so the single number stays identical across stores.
3. `android.versionCode` must be **strictly greater** than the highest ever uploaded to Play (across all tracks). iOS `buildNumber` must be unique within the version train. The bump script self-heals any drift by using `max(iOS, Android) + 1`.
4. Never hand-edit the build numbers except via the bump script (or a deliberate one-off to clear a clash).

**Current state (as of this edit):** `expo.version` 0.1.1, `buildNumber` / `versionCode` both **8**. (Play was at 7; the iOS train had used 4.)

---

## Also check (no change usually needed)

- §12.2 Production Build — still correct. The only place that referenced `appVersionSource: "remote"` and `autoIncrement: true` was §12.1.
- `eas.json` now has `appVersionSource: "local"` and the `autoIncrement` line was removed from the `production` profile.
