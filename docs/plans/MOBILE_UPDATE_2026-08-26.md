# Auxein Grow — Mobile Update Plan (build 10)

**Date:** 26 August 2026
**Owner:** Pete Taylor
**Target:** internal testers only — Play internal track + TestFlight. Not a public release.
**From:** v0.2.0 build 9 (live) → **v0.2.1 build 10**

---

## The organising principle

**Build 10 is the last build before OTA exists, so it is the last cheap chance to change native
surface.**

Once `expo-updates` is in a binary, every JS-only change ships in seconds. Everything that is
*not* JS — a new native module, an `app.json` permission, an SDK bump — still costs a full build
and a store round-trip, and always will.

So the scope split below is not by feature area. It is by **whether an item can ever ride an
OTA**. Native items get batched into build 10 whether or not they are urgent, because deferring
one costs a whole extra build cycle.

## Release cadence — updates ship as packages

**Mobile ships in defined packages, not as a stream of one-off fixes.** A package is a named
release with a fixed scope, a test sheet, and a single go/no-go: everything in it is tested
together and released together.

OTA does not change that, and is not a licence to dribble fixes out. What it changes is the
*cost of delivering a package*: one whose scope is entirely JS can go out over the air, without a
build, a submission or a store round-trip. A package that touches native surface still costs a
full build either way.

The practical consequence is that scoping a package should start by asking whether it needs to
contain anything native. If it doesn't, it's cheap to ship and can go whenever it's tested. If it
does — even one item — the whole package pays for a build, which is the argument for batching
every pending native item into the same one. That is exactly the reasoning behind build 10's
scope below.

---

## 0. Known state (verified 2026-08-26)

- `packages/mobile` working tree is **clean**; the newest mobile-touching commit is `1ec35f2`,
  which is what build 9 was cut from. **No mobile code is sitting unreleased.**
- `app.json`: `expo.version` 0.2.0, `ios.buildNumber` "9", `android.versionCode` 9.
- `expo-updates` is **not installed**. No `runtimeVersion`, no `updates` block in `app.json`,
  no `channel` in any `eas.json` profile.
- Everything from the August batch — roll-up children (`SubTaskPanel.js`), the offline write
  queue, the observations/blocks read caches, contractor V1, the GPS mothball, NZ-local dates —
  is **in testers' hands already** as part of build 9.

That last point matters: this update is not "release the backlog". The backlog shipped. This is
plumbing plus whatever build 9's field test turns up.

---

## 1. Native items — must ride build 10

### 1.1 EAS Update (OTA) — **DECIDED, in scope**

Full step-by-step already exists at `docs/plans/EAS_UPDATE_SETUP.md` (scoped 2026-06-01, never
started). It is still accurate — re-verified against the repo today, nothing has drifted.

Work:

```bash
cd packages/mobile
npx expo install expo-updates
eas update:configure
```

then a `runtimeVersion` policy in `app.json`, and a `channel` on the `preview` and `production`
profiles in `eas.json`.

**Open decision — `runtimeVersion` policy.** The old doc offered `appVersion` or `fingerprint`
and left it to implementation time.

> **Recommendation: `fingerprint`.** Under `appVersion`, the compatibility gate is
> `expo.version`, which means *you* have to remember to bump the semver every time native
> surface moves — and if you forget, you can push a JS bundle to a binary that lacks the native
> code it assumes. `fingerprint` derives the gate from the native layer itself, so forgetting is
> not possible. The cost is that it's less legible at a glance: you can't read the runtime
> version off `app.json`. Given the versioning scheme here already had one silent-drift incident
> (the EAS remote counter, 2026-06-04), the auto-detecting option is the safer fit.

**This cannot be verified until build 10 is installed** — see §4.3. Do not treat OTA as working
until a throwaway update has actually landed on a device.

**Compliance note:** internal-track-only keeps this low risk, but the rule still holds — OTA is
for fixes and iteration consistent with the reviewed app, not for introducing materially new
behaviour that sidesteps review. Relevant later, when this goes public.

### 1.2 Crash reporting — **DECISION NEEDED**

Nothing is wired. This has been open since 2026-08-13 and was deliberately not half-built
because it needs an account and a DSN before any code is worth writing.

Recommend **including it in build 10**. Two reasons:

- It's a native module. Not now means not until build 11.
- A field beta is exactly the case it pays for: a crew hits a crash in a block, you get a stack
  trace instead of "the app closed".

Blocked on: a Sentry (or equivalent) account + project DSN. That's yours to create — I can't.
Once the DSN exists it's `npx expo install @sentry/react-native`, the config plugin in
`app.config.js`, and init in `App.js`.

### 1.3 Photo downscaling — **worth folding in**

`useImageCapture` currently works around the absence of a resize library by dropping capture
quality to `0.5` with `exif: false` (`src/hooks/useImageCapture.js:51,67`). That's
*recompression*, not *downscaling* — it degrades the image while leaving the pixel dimensions
full-size, so a field photo is both larger than it needs to be and visibly worse than it should
be.

`expo-image-manipulator` is the fix and is genuinely absent, so it needs a build. Small job,
real quality win on the slowest thing the app does, and it's native — same now-or-build-11
argument.

### 1.4 Nothing else pending

No permission changes are outstanding (the foreground-service/background-location cut landed in
build 9's tree). Expo SDK 54 is current — no upgrade proposed; an SDK bump in the same build as
first-time OTA setup would make a failure hard to attribute.

---

## 2. JS items — build 10, or the first JS-only package after it

These are not obliged to be in build 10. Each one either makes build 10's scope or waits for the
next package — but it waits *as scoped work in that package*, not as a loose fix pushed whenever
it happens to be finished.

### 2.1 Task filter persistence

Today's web change, mirrored. Mobile's task filter is a single pill row — one value across
`all / task / maintenance / calibration / risk_action` (`src/screens/TasksScreen.js:27`) — so
this is much smaller than the web equivalent, not a port of it.

Pattern to mirror: `src/hooks/useLayerVisibility.js`, which already does exactly this shape
against `AsyncStorage` (hydrate on mount, defaults until loaded, debounced write). Do **not**
import the web hook — mobile can't reach `@vineyard/shared`.

Half a day at most, including the same stale-value guard the web version got.

### 2.2 Mobile block summary

The one unbuilt remnant of beta feedback phase 3. Web shipped `BlockSummaryModal.jsx`
2026-08-05 (tasks + observations for a block, opened from map symbols); mobile never got the
equivalent, and the beta asked for it in the Mobile section specifically. The web modal was
written self-contained so its layout can be mirrored.

Note the caveat inherited from web: both source arrays are capped at `limit: 500` by their layer
hooks, so a busy company can under-report counts.

### 2.3 Reserved — build 9 field-test findings

**This slot is deliberately empty and is the most important item in §2.** Build 9 carries a
large amount of code that had never been run in a vineyard when it shipped. Whatever comes back
from testing it should land here, and should outrank 2.1 and 2.2.

Whether they gate build 10 is a scoping call, not a technical one. If the findings are JS-only
and build 10 is otherwise ready, they can be scoped into the first OTA package instead of holding
the build — which is the practical payoff of doing §1.1 first. If any of them turns out to need
native surface, it has to be in build 10 or it waits for build 11.

---

## 3. Release mechanics

Order matters, and two of these steps have bitten before.

1. Build and test everything over Metro against the **dev client** first (§4.1).
   - Check `packages/mobile/.env` before you start. It has silently drifted back to
     `API_URL=https://api.auxein.co.nz/api` before, which reads exactly like a broken deploy —
     every new route 404s and nothing you restart changes it. Use the LAN IP, never `localhost`,
     and restart Metro with `--clear` because `app.config.js` is read at start.
2. `npm run bump:patch` from `packages/mobile` → 0.2.1, build 10 on both platforms in lockstep.
3. **Commit `app.json` before building.** Local versioning reads the version from the working
   copy, but the *bundled code* comes from the commit — an uncommitted change is silently absent
   from the build.
4. `eas build --platform all --profile production` — always `all`, so the single build number
   stays identical across stores.
5. `eas submit` to Play **internal** track and TestFlight.
   - iOS submit config is present (`ascAppId` 6774847550). Android's `serviceAccountKeyPath`
     points at a file that does not exist yet; creating it is fine, it's now covered by
     `.gitignore`, but confirm that before the first `eas submit --platform android`.
   - If a submit error names a `.dev` bundle id, that's a local config-resolve fallback, not a
     wrong build.
6. Verify OTA on the installed build (§4.3) **before** relying on it for anything.

---

## 4. Test sheet

### 4.1 Over Metro, before the build

- Task filter pill survives a force-quit and reopen; a stale stored value falls back to `all`
  rather than showing an empty list
- Block summary opens from the map, counts match what the block actually holds
- Anything from §2.3

### 4.2 On the installed build 10

- App launches, signs in, reaches prod API
- Photos: capture → upload → render, and confirm the file is visibly better than build 9's
- Crash reporting: force a test crash, confirm it arrives in the dashboard
- One offline pass — aeroplane mode, complete a row, reconnect, confirm it lands. The queue was
  proven in build 9; this is a regression check that the new native modules didn't disturb it.

### 4.3 OTA — the step that is easy to skip

- Make a trivial visible JS change (a label)
- `eas update --channel production --message "ota smoke test"`
- Force-quit and reopen the installed build **twice** — the default is check-on-launch, so the
  first reopen fetches and the second one shows it
- Confirm the change appears. Revert it with a second update.

Until this passes, assume OTA does not work.

---

## 5. Doc hygiene

`docs/plans/MOBILE_UPDATES.md` is **stale and misleading**. It describes items 1 (field-notes
roll-up) and 2 (create a follow-up task from a row) as scoped-not-built; both shipped — item 1 in
`19af60c`, item 2 in `8e682c1` and extended through the roll-up work. Its own convention says to
move shipped items to a "Shipped" section with the build number. Either do that or retire the doc
in favour of this one.

---

## 6. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | `runtimeVersion` policy: `appVersion` or `fingerprint` | `fingerprint` — see §1.1 |
| 2 | Crash reporting in build 10? Needs an account + DSN first | Yes — it's native, so no means build 11 |
| 3 | Does §2.2 (block summary) ride build 10, or go in the first OTA package after it? | Either is fine — it shouldn't hold the build, but it shouldn't ship alone either |
