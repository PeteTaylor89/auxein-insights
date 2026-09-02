# Mobile build 10 — scope and test sheet

**Date:** 2026-09-01
**Version:** v0.2.0 build 9 → **v0.2.1 build 10**, Play internal + TestFlight. Not a public release.
**Supersedes** the scope section of `MOBILE_UPDATE_2026-08-26.md`. That plan's OTA section still stands.

Mobile ships in packages, not one-off fixes: fixed scope, one test sheet, one go/no-go. This is the sheet.

---

## 1. Why this build exists now

Build 9 was cut 2026-08-25 from `1ec35f2`. Everything below has landed since and **none of it is in any build.** Four of the six items are native or near-native, and build 10 is the last build before OTA exists — the last cheap chance to change native surface. Deferring one native item costs a whole build cycle.

---

## 2. Scope

| # | Item | Native? | State |
|---|---|---|---|
| 2.1 | **Crash reporting (Sentry)** | **Yes** | Wired, inert. **DSN deferred 09-02 — it can now arrive by OTA** |
| 2.2 | **EAS Update (OTA)** | **Yes** | **DONE 09-02** — `expo-updates`, fingerprint policy, channels |
| 2.3 | ~~Photo downscaling (`expo-image-manipulator`)~~ | Yes | **CUT 2026-09-02** — see below |
| 2.4 | Materials & equipment card on task detail | No | Built 08-28 |
| 2.5 | Machine hours in the completion sheet | No | Built 09-01 |
| 2.6 | Sticky capture values + row selector | No | Built 09-01 |
| 2.7 | Timesheet editability rule + rejection reason | No | Built 09-01 |
| 2.8 | **`general_user` account + site sign-on (W4)** | No | Built 09-01 |
| 2.9 | Sign-on for every staff user; general tab renamed Home | No | Built 09-02 |
| 2.10 | Who's on site includes staff, with property name | No | Built 09-02 |
| 2.11 | Property required on incident/risk before submit | No | Built 09-02 |
| 2.12 | Timesheets unlocked for `general_user` | No | Built 09-02 |

2.4–2.12 could ride an OTA **once OTA exists**. It does not yet, so they go in this binary.

### 2.8–2.12 DO NOT WORK AGAINST THE DEPLOYED BACKEND

EB is still on `app-260827_183209139890` (27 Aug). Every item from 2.8 down needs backend code
that has never shipped — the `site_attendance` router, `general_user` in the permission matrix,
`incidents` as a module, staff in `/site/active`. Testing them against prod api.auxein.co.nz
gives 404s and 403s that look like app bugs.

**Either deploy the backend first, or point the app at a local one** — and a stale backend fails
silently, so confirm which you are on before calling any row below a fail.

Prod's alembic head is `invite_role_general`, five migrations ahead of that deployed image.

### 2.1 Crash reporting — what is done and what is not

**Done:** `@sentry/react-native@~7.2.0` installed, the `@sentry/react-native/expo` plugin added unconditionally in `app.config.js`, `src/services/crashReporting.js` written, init at module scope in `App.js` before the first render, and `SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` declared empty on all three EAS build profiles.

**Design points worth keeping:**
- The DSN comes from the build environment, never the repo, so it can be rotated without a code change.
- The **plugin is added unconditionally**. It is what puts the native crash handler in the binary, and making it conditional on an env var would mean crash reporting depended on whose shell ran the build.
- **Init is guarded on the DSN** and every call is wrapped. A crash reporter must never be the thing that crashes the app — a build with no DSN reports nothing rather than failing to start.
- **`sendDefaultPii: false` plus a `beforeSend` that strips the user to an id.** A vineyard is a workplace and this app holds timesheets, pay-rate-derived figures and incident records. Nothing about a person leaves the device as a side effect of a stack trace.
- `environment`, `release` and `dist` are set, or every report from every build lands in one undifferentiated pile.

**Still needed — Pete only:**
1. A Sentry account and project (platform: React Native). Copy the DSN.
2. An auth token with `project:releases` scope, for source-map upload. **Without it every stack trace is minified bundle offsets and close to useless.** `app.config.js` logs a warning when the DSN is set and org/project are not.
3. Put the DSN, org and project into `eas.json` (or EAS Secrets — the auth token must be a secret, never in the repo).

---

## 3. Test sheet

Run on a real device, both platforms where noted. **Every row is pass/fail — no partial.**

### 3.1 Crash reporting
- [ ] App starts with **no** DSN configured, logs `crash reporting is inert`, and behaves normally
- [ ] App starts **with** a DSN and logs `Crash reporting started`
- [ ] Fire `sendTestCrash()` once and **confirm the report arrives in the Sentry dashboard**. Wiring a reporter and never seeing a report is indistinguishable from it working
- [ ] The report's stack trace is readable, not minified offsets (this is what the auth token buys)
- [ ] The report carries the right `environment` and `release`
- [ ] The report contains **no name and no email** — user is an id only

### 3.2 OTA — see `EAS_UPDATE_SETUP.md`
- [ ] Publish a throwaway update and reopen the app **TWICE**. Check-on-launch means the first reopen only fetches; skipping the second is how OTA gets declared working when it is not
- [ ] `runtimeVersion` policy is `fingerprint`, not `appVersion`
- [ ] **The build's runtimeVersion equals the update's.** Read the fingerprint off the EAS build page, then run `npx expo-updates fingerprint:generate --platform android` locally with `APP_VARIANT=production`. **If they differ, no update will ever land and nothing will report an error** — this is what the Mapbox token fix was for, and it is the single most likely way this feature looks fine and is dead
- [ ] Then publish a real OTA and confirm a visible JS change arrives (`eas update --channel production --message "..."`)
- [ ] **Commit before `eas update`** — it bundles committed state, same trap as `eas build`

### 3.3 Photo downscaling
- [ ] A field photo is visibly better AND smaller than build 9's
- [ ] Upload still works offline and drains on reconnect

### 3.4 Task detail — Materials & equipment
- [ ] The card lists equipment and consumables for a task that has them
- [ ] After completion, recorded quantities show; an unrecorded one reads **"not recorded"**, never `0`
- [ ] Machine hours read `Nh`, or **"no hours"** — never `0h`
- [ ] **No cost figures appear anywhere on mobile** (`costs:read` is company_admin only, and a field worker never is one)

### 3.5 Completion sheet — machine hours
- [ ] A task with primary equipment shows a machine-hours row per machine
- [ ] The primary row's placeholder tracks the hours-worked box as it is typed
- [ ] Leaving a primary row **blank** results in the machine getting the labour hours (check the task's asset card afterwards)
- [ ] Leaving a **secondary** row blank results in no hours for it
- [ ] Typing a different number overrides the inheritance
- [ ] Entering 25 is refused client-side, not by a 422
- [ ] Completing the same task twice does not double the machine's hour meter

### 3.6 Spot capture — sticky values and the row selector
- [ ] Capture spot 1 of a bud count with vines sampled and target buds set. Tap **Save & next**
- [ ] **Vines sampled and target buds carry over. The bud count does NOT.** This is the whole feature and its safety property
- [ ] The banner names what was kept
- [ ] Clearing a carried field leaves it cleared on the next spot — it does not spring back
- [ ] Notes and photos never carry
- [ ] A block **with** rows shows a row picker; search by row number works; the selection clears
- [ ] A block **without** rows shows no row control at all
- [ ] A spot saved with a row is attributed to it (check `observation_spots.row_id`, which was 0/48 before this)
- [ ] Capture still works **offline**, and queued spots drain on reconnect

### 3.7 Timesheets
- [ ] A **rejected** day is editable and shows the manager's reason
- [ ] A **submitted** day is locked, with the "waiting on approval" banner
- [ ] An **approved** day is locked
- [ ] Completing a task onto a submitted or approved day shows the **"Nh NOT added to your timesheet"** notification, and the hours are still on the task

### 3.8 Regression — build 9 behaviour that must not move
- [ ] Login, offline queue drain, photo upload
- [ ] Observation capture out of signal
- [ ] Roll-up children complete normally
- [ ] Visitor register reachable with no property in scope

---

### 3.9 Creating the account (web, before you touch a phone)
- [ ] Manage → invite shows **General (H&S)** and **no longer shows Viewer** (nor Owner in the user list)
- [ ] Selecting General shows the hint "Site sign-on, incidents and visitors. Mobile app only."
- [ ] The invite **sends** — a 400 here means the `invite_role_general` migration has not been applied
- [ ] The email does **not** say "as a General". It reads "…invited you to join {Company} on Auxein Grow"
- [ ] The email's next steps say: open the link in a browser to set a password, **then use the app**
- [ ] Accepting in a browser succeeds and the success page points at the app, **not** the web login
- [ ] Signing in to the **website** with that account is refused with the mobile-only message
- [ ] An admin or manager invite still works, and their email does **not** carry the app-only wording

### 3.10 `general_user` on the phone (item 2.8)
- [ ] Login succeeds on mobile
- [ ] **Three tabs only: Home, Map, Profile.** No Tasks, Observe or Assets
- [ ] The first tab reads **Home** with a house icon — not "Sign on", not a log-in arrow
- [ ] Sign on to a property. The card shows elapsed time and the property name
- [ ] Signing on again at the **same** property does not open a second attendance
- [ ] Signing on at a **different** property offers "Already signed on — move to X?", not an error
- [ ] Sign off works, and the card returns to "Not signed on"
- [ ] Sign on **in aeroplane mode**, then reconnect — it drains, and does not create two rows
- [ ] Report an incident, raise a risk, sign a visitor in — all succeed (see 3.11)
- [ ] The visitor **register** is not readable — they can sign one in, not read the book back

### 3.11 Incidents and risks — the property rule (item 2.11)
Run this as a **`company_user`** as well; the bug was never specific to the H&S account.

The first fix here did nothing on its own: `general_user` had no `properties:read`, so
`GET /v1/properties/` 403'd, the screen's `.catch(() => {})` swallowed it, the list stayed empty
and no picker rendered. Both the permission and the swallow are fixed — **if the card is still
missing, check the network tab for a 403 on `/v1/properties/` before anything else.**

- [ ] On a company with **more than one** property, the Property card is visible on step 0
- [ ] **Next is refused until a property is chosen** — no 403 after filling the whole form in
- [ ] With exactly **one** property it is preselected and Next works immediately
- [ ] As an **admin**, the card reads "Optional — leave clear for a company-wide entry" and Next works with none chosen
- [ ] The same for a **risk**
- [ ] If a 403 does appear it reads "Select a property", not "Only admins can create company-wide items"
- [ ] With **no** properties reachable, the card still appears carrying a reason — never a silent absence
- [ ] A `general_user` sees the property list at all (this needed `properties:read`, added 09-02)

### 3.12 Site sign-on for everybody (item 2.9)
- [ ] As a normal staff user: Home → FAB → **Sign on to site** is the first option
- [ ] Sign on, then confirm you appear in Who's on site
- [ ] As a **contractor**: the FAB has **no** sign-on option — they keep Check in. Confirm Check in still works
- [ ] A contractor checking in appears **once** in Who's on site, not twice

### 3.13 Who's on site (item 2.10)
- [ ] The header chip counts staff as well as visitors and contractors
- [ ] The **Staff** pill shows a real number, not 0, when someone is signed on — this was the bug
- [ ] Every pill's number equals the number of rows under it after filtering
- [ ] A staff row shows the **property name** in its subtitle, and in the detail sheet
- [ ] A visitor row shows no empty Property row (the visitor book is company-wide)
- [ ] Staff rows are visually distinct from visitors and contractors, and read "Staff"
- [ ] As a manager, open a staff row and **Sign off** — it closes, and the list refreshes
- [ ] As a **non-manager**, that sign-off is refused (403) — check the message is legible
- [ ] Empty Staff filter reads "No staff on site", not "No users on site"

### 3.14 Timesheets for `general_user` (item 2.12)
- [ ] The Profile tab offers Timesheet
- [ ] Their own days load — **not** a 403
- [ ] They can create an entry and submit a day
- [ ] They see **only their own** days, nobody else's
- [ ] They cannot approve anything
- [ ] A `company_user` and a `contractor` timesheet still behaves exactly as in build 9

### 3.15 Site access report (web, item 2.10)
- [ ] Reports → site access lists **staff** rows alongside visitors and contractors
- [ ] A staff row shows a property and no induction/equipment state
- [ ] Someone still signed on counts toward **never signed out**
- [ ] The uninducted and equipment-not-cleaned counts did **not** move when staff appeared
- [ ] The CSV export contains the staff rows

---

## 4. Before the build

**Still outstanding, verified 2026-09-02:**

- [ ] **Rename the EAS secret to `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`.** The Android build cannot fetch the Mapbox SDK without it, and the old name `MAPBOX_DOWNLOAD_TOKEN` is no longer read by the plugin. `app.config.js` warns if only the old one is set. **Do this before the build or Android fails.**
      `eas secret:create --scope project --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value <sk...>`
- ~~Sentry DSN~~ — **deferred (Pete, 2026-09-02).** It ships inert. Because `fingerprint.config.js` skips the `extra` section, a later OTA carrying only `SENTRY_DSN` **turns crash reporting on with no rebuild** — measured, see `EAS_UPDATE_SETUP.md`. Adding `SENTRY_ORG`/`SENTRY_PROJECT` for readable stack traces does still need a build.
- ~~OTA~~ — **done 2026-09-02.** `expo-updates@~29.0.20`, `runtimeVersion: fingerprint`, channels on all three profiles.
- ~~Photo downscaling~~ — **cut from this build (Pete, 2026-09-02).** `expo-image-manipulator` stays uninstalled and `useImageCapture.js` keeps recompressing at `quality: 0.5` twice with no downscale. **It is native, so it cannot ride the first OTA** — it now waits for build 11. Re-open it there, not in a JS-only release where it will look like it fits and won't.
- ~~Version bump~~ — done: `0.2.1` / iOS `buildNumber "10"` / Android `versionCode 10`.
- [ ] **Commit first.** `eas build` ignores uncommitted `package.json` — and `@sentry/react-native` was added to it, so an uncommitted tree produces a build with no crash reporting and no error
- [ ] `APP_VARIANT=production` before `eas submit`, and submit by `--id`, never `--latest`
- [ ] Confirm the production identity is still `nz.co.auxein.grow` with no suffix (verified 2026-09-01 after the Sentry change)

**The two native items are the whole argument for this build.** 2.4–2.12 are JS and could ride an
OTA — but OTA does not exist until 2.2 ships in a binary, so deferring 2.2 or 2.3 costs another
full build cycle.

---

## 5. Not in this build

Mobile still cannot attach a task asset, and machine hours cannot be edited after completion — the completion sheet is the only entry point. Both are JS-only, so both can ride the first OTA once 2.2 is proven.
