# Auxein Grow v1.0 — Location Services Compliance Specification

**Status:** Authoritative for v1.0 production submission
**Last updated:** 28 May 2026
**Owner:** Pete Taylor
**Purpose:** Defines location-related implementation requirements for Auxein Grow v1.0 such that the app qualifies for the **foreground-service exemption** under Google Play policy and the standard **When In Use** authorization pattern on iOS. If the codebase complies with every requirement in this document, Grow does **not** require Google Play's **background-location** Permissions Declaration Form (the heavy review) or `ACCESS_BACKGROUND_LOCATION`.

> **Note (corrected 2026-06-01):** Grow DOES still require the separate, lighter **foreground-service type declaration** (because it declares `FOREGROUND_SERVICE_LOCATION` and targets SDK 34+), and that declaration **does require a short demonstration video**. The two Play requirements are independent — see §8 for the full breakdown. A prior version of this spec incorrectly stated no video was needed at all.

---

## 1. Scope: v1.0 Location Features

| # | Feature | Pattern | App-closed operation? |
|---|---|---|---|
| 1 | Map view shows user position | Foreground only | No |
| 2 | Geotag observation/task on user tap | Foreground, single-shot | No |
| 3 | Contractor shift tracking — user-initiated start/end | Foreground service | Yes, with persistent notification |
| 4 | Tractor task monitoring — user-initiated start/end | Foreground service | Yes, with persistent notification |

### Explicitly NOT in v1.0

These are deferred to v1.1+ and must not be present in the v1.0 build:

- Geofence-based auto-detection of block entry/exit
- Lone worker safety check-ins (passive periodic pinging)
- Any passive, time-triggered, or geofence-triggered location collection
- Any use of `ACCESS_BACKGROUND_LOCATION`
- Any iOS `Always` location authorization request

---

## 2. Android Requirements

### 2.1 AndroidManifest.xml — Required Permissions

The merged manifest **MUST** contain exactly these location-related permissions:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### 2.2 AndroidManifest.xml — Forbidden Permissions

The merged manifest **MUST NOT** contain:

```xml
<!-- FORBIDDEN in v1.0 -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```

If `ACCESS_BACKGROUND_LOCATION` is introduced transitively by a library (Expo Location, React Native Geolocation, certain mapping SDKs), it must be explicitly removed:

```xml
<manifest xmlns:tools="http://schemas.android.com/tools" ...>
  <uses-permission
      android:name="android.permission.ACCESS_BACKGROUND_LOCATION"
      tools:node="remove" />
</manifest>
```

### 2.3 Foreground Service Declaration

A foreground service of type `location` **MUST** be declared:

```xml
<service
    android:name=".LocationTrackingService"
    android:foregroundServiceType="location"
    android:exported="false" />
```

### 2.4 Foreground Service Lifecycle Requirements

The location-tracking foreground service **MUST**:

1. Only start as a direct result of a **user action** in the app (tap "Start shift", tap "Start task"). It must **not** start automatically on app launch, on login, on boot, on geofence trigger, or on schedule.
2. Display a **persistent foreground notification** the entire time it runs (see §2.6 for copy).
3. Stop and release location resources immediately when the user ends the session, when the activity it tracks completes, or when the app is force-stopped. There must be no "grace period" of continued collection after session end.
4. Not be restarted by `START_STICKY` or any other mechanism after the user has explicitly ended the session.
5. Use the lowest accuracy that satisfies the feature (e.g., `PRIORITY_BALANCED_POWER_ACCURACY` where precise GPS is not strictly required; `PRIORITY_HIGH_ACCURACY` only during active tractor monitoring).
6. Use the longest viable polling interval (target: 30–60 seconds for shift tracking, 5–15 seconds for active tractor monitoring; never sub-second).

### 2.5 Runtime Permission Flow

The app **MUST** request only foreground location permissions at runtime:

- `ACCESS_FINE_LOCATION` (and/or `ACCESS_COARSE_LOCATION`)
- `POST_NOTIFICATIONS` on Android 13+ (API 33+)

The app **MUST NOT** call `requestPermissions()` with `ACCESS_BACKGROUND_LOCATION` anywhere in the codebase.

The runtime prompt **SHOULD** be preceded by an in-app explainer screen (see §5.1) the first time the user is about to encounter the OS permission dialog.

### 2.6 Persistent Notification — Required Copy

Three notification variants, one per session type. Each **MUST** include a clear in-notification action to end the session without deep navigation.

**Contractor shift tracking:**
```
Title: Auxein Grow — Shift in progress
Body:  Recording your work time and location.
Action: End shift
```

**Tractor task monitoring:**
```
Title: Auxein Grow — Task in progress: {taskName}
Body:  Tracking equipment movement.
Action: End task
```

**Active geotag session (if implemented as a session vs single-shot):**
```
Title: Auxein Grow — Observation session active
Body:  Capturing location for new observations.
Action: End session
```

Notification channel: `location_tracking`, importance `IMPORTANCE_LOW` (visible but not noisy).

---

## 3. iOS Requirements

### 3.1 Info.plist — Required Keys

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Auxein Grow uses your location to show your position on the vineyard map, geotag observations and tasks, and record tractor and shift activity while you work.</string>
```

### 3.2 Info.plist — Forbidden Keys

The following **MUST NOT** be present in v1.0:

```xml
<!-- FORBIDDEN in v1.0 -->
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<key>NSLocationAlwaysUsageDescription</key>
```

### 3.3 Background Modes

Xcode capability **Background Modes → Location updates** **MUST** be enabled.

In the compiled Info.plist this appears as:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
</array>
```

No other background modes are required for v1.0 location features.

### 3.4 CLLocationManager Code Requirements

The location manager **MUST**:

1. Request `requestWhenInUseAuthorization()` only. Never `requestAlwaysAuthorization()`.
2. Set `allowsBackgroundLocationUpdates = true` **only after** a user-initiated session has started, and set it back to `false` **immediately** when the session ends.
3. Set `pausesLocationUpdatesAutomatically = false` only while a session is active.
4. Set `showsBackgroundLocationIndicator = true` to ensure the iOS blue indicator is shown (required when collecting location while backgrounded).
5. Use the lowest viable `desiredAccuracy` per session type (e.g., `kCLLocationAccuracyHundredMeters` for shift tracking, `kCLLocationAccuracyBest` only during active tractor monitoring).
6. Call `stopUpdatingLocation()` when the session ends.

### 3.5 Authorization State Handling

The app **MUST** handle these authorization states gracefully:

- `notDetermined` → prompt with `requestWhenInUseAuthorization()`
- `denied` / `restricted` → show in-app message explaining the feature requires location and link to Settings; do not block the rest of the app
- `authorizedWhenInUse` → fully functional for all v1.0 features
- `authorizedAlways` → handle as `authorizedWhenInUse`; do not request, expect, or rely on `Always` authorization

---

## 4. Cross-Platform Code Patterns

### 4.1 React Native / Expo Configuration

If using Expo Location, the `app.json` / `app.config.js` configuration **MUST**:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Auxein Grow uses your location to show your position on the vineyard map, geotag observations and tasks, and record tractor and shift activity while you work.",
        "UIBackgroundModes": ["location"]
      }
    },
    "android": {
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "POST_NOTIFICATIONS"
      ]
    },
    "plugins": [
      ["expo-location", {
        "locationAlwaysAndWhenInUsePermission": false,
        "locationWhenInUsePermission": "Auxein Grow uses your location to show your position on the vineyard map, geotag observations and tasks, and record tractor and shift activity while you work.",
        "isAndroidBackgroundLocationEnabled": false,
        "isAndroidForegroundServiceEnabled": true
      }]
    ]
  }
}
```

The flag `isAndroidBackgroundLocationEnabled` **MUST** be `false`.

### 4.2 Session State Machine

All location-tracking sessions (shift, task) **MUST** follow this state machine:

```
IDLE
  └─ user tap "start" → STARTING
                          ├─ permission check passes → ACTIVE
                          │                              └─ user tap "end" → STOPPING
                          │                                                    └─ resources released → IDLE
                          └─ permission denied → IDLE (show explainer)
```

No state transitions may be triggered by:
- App lifecycle events (background, foreground, terminate)
- Time-based schedulers
- Location-based triggers (geofences)
- Push notifications
- Bluetooth/network events

---

## 5. User-Facing Copy

### 5.1 In-App Pre-Permission Explainer (recommended)

Shown once before the first OS permission prompt. Optional under policy but materially improves grant rates.

```
Title: Allow location access

Auxein Grow uses your device's location while you're using the app to:

• Show your position on vineyard maps
• Geotag observations and tasks at the moment you create them
• Record tractor movement during active tasks
• Track contractor time during active shifts

When a task or shift is running, Grow will continue tracking location
even if you close the app, until you end the session. A notification
stays visible while this is active.

Your location is only shared with your vineyard operator and is never
used for advertising.

[ Allow location access ]   [ Not now ]
```

### 5.2 Permission Denied Recovery Screen

```
Title: Location access is off

To use vineyard mapping, geotagging, shift tracking, and tractor
monitoring, Auxein Grow needs location access.

You can enable it in your device settings.

[ Open Settings ]   [ Continue without location ]
```

---

## 6. Privacy & Compliance Declarations

### 6.1 Google Play Data Safety Form

| Section | Field | Value |
|---|---|---|
| Location | Approximate location | Not collected |
| Location | Precise location — collected | Yes |
| Location | Precise location — shared | Yes (with vineyard operator) |
| Location | Precise location — ephemeral | No |
| Location | Precise location — optional | No (required for core function) |
| Location | Precise location — purposes | App functionality only |
| Location | Precise location — used for ads | No |
| Location | Precise location — used for analytics | No |

### 6.2 iOS App Privacy Labels

Under **Data Linked to You**:

- Location → Precise Location → App Functionality
- User Content → Photos or Videos → App Functionality (geotagged observation photos)
- User Content → Other User Content → App Functionality (observations, notes)
- Identifiers → User ID → App Functionality
- Contact Info → Email Address → App Functionality
- Diagnostics → Crash Data, Performance Data → App Functionality

Under **Data Used to Track You**: none.

### 6.3 Privacy Policy Required Section

The privacy policy at `https://auxein.co.nz/privacy` **MUST** contain a section equivalent to:

> **Location data.** When you use features that require it, Auxein Grow collects your device's precise location. During active contractor shifts or tractor task sessions that you start, Grow continues to record location while the app is closed, until you end the session. A persistent notification (Android) or status indicator (iOS) is visible at all times while this occurs.
>
> Location data is used solely to: display your position on vineyard maps, geotag observations and tasks you create, record shift duration and movement for payroll, and record equipment activity during tasks.
>
> Location data is shared only with the vineyard operator you are engaged by. It is never used for advertising, marketing, or analytics. You can revoke location permissions at any time via your device settings; some features will become unavailable.

### 6.4 Play Listing Description — Required Sentence

The store listing description **MUST** include a sentence equivalent to:

> Auxein Grow uses location to show your position on vineyard maps, geotag observations, and record tractor and contractor activity during active tasks or shifts. Location tracking continues during active sessions even if you close the app, and a notification stays visible until you end the session.

---

## 7. Audit Checklist

Run this checklist against the codebase. Every item must pass before submission.

### 7.1 Static checks

- [ ] No occurrence of the literal string `ACCESS_BACKGROUND_LOCATION` anywhere in the repo (manifest, code, config, dependency overrides)
- [ ] No occurrence of `requestAlwaysAuthorization` in iOS code (Swift, Obj-C, or React Native bridge)
- [ ] No occurrence of `NSLocationAlwaysUsageDescription` or `NSLocationAlwaysAndWhenInUseUsageDescription` in Info.plist or `app.json`
- [ ] `AndroidManifest.xml` declares the foreground service with `foregroundServiceType="location"`
- [ ] `AndroidManifest.xml` declares all five required permissions listed in §2.1
- [ ] Expo / RN config has `locationAlwaysAndWhenInUsePermission: false` and `isAndroidBackgroundLocationEnabled: false`
- [ ] Privacy policy URL is live, returns 200, contains the §6.3 section

### 7.2 Dynamic checks (run on a built AAB / IPA)

- [ ] Merged manifest (`aapt2 dump permissions app-release.aab | grep -i location`) shows no `ACCESS_BACKGROUND_LOCATION`
- [ ] Built Info.plist (in the IPA) contains `NSLocationWhenInUseUsageDescription` only
- [ ] Built Info.plist contains `UIBackgroundModes` with `location` only

### 7.3 Behavioural checks (manual or instrumented)

- [ ] Foreground service only starts on explicit user tap of "Start shift" or "Start task"
- [ ] Foreground service shows the correct persistent notification (matching §2.6 copy) while running
- [ ] Notification action "End shift" / "End task" stops the service without requiring app navigation
- [ ] Force-stopping the app stops location collection
- [ ] Ending a session stops location collection within 5 seconds
- [ ] On iOS, blue indicator bar appears when app is backgrounded during an active session
- [ ] On iOS, `allowsBackgroundLocationUpdates` is set to `false` when no session is active
- [ ] Denying location permission shows the §5.2 recovery screen and does not crash or block the app
- [ ] Map view requests location only while the map screen is mounted; releases on unmount

### 7.4 Submission-readiness checks

- [ ] Play Data Safety form matches §6.1 exactly
- [ ] iOS App Privacy labels match §6.2 exactly
- [ ] Play listing description contains the §6.4 sentence
- [ ] **Foreground service declaration (§8.2) completed** — FGS type `FOREGROUND_SERVICE_LOCATION`, category "Background location updates"
- [ ] **Demonstration video (§8.3) recorded against the rebuilt app and uploaded as an unlisted URL**
- [ ] Background-location form (Requirement A / §8.1) confirmed NOT triggered — merged manifest has no `ACCESS_BACKGROUND_LOCATION`
- [ ] Demo reviewer account can complete one full shift-tracking cycle and one tractor-task cycle without crashing

---

## 8. Play Declarations — what we DO and do NOT have to submit

**CORRECTION (2026-06-01):** An earlier version of this section claimed Grow needs *no* declaration form and *no* video. That conflated two separate, independent Play requirements. The truth:

| Requirement | Trigger | Video required? | Grow v1.0 |
|---|---|---|---|
| **A. Background location permission** (Policy → App content → "Location in the background"; the heavy review) | `ACCESS_BACKGROUND_LOCATION` in the merged manifest | Yes (≤30s) | **AVOIDED** — we never declare this permission |
| **B. Foreground service types** (Policy → App content → "Foreground service"; the lighter review) | declaring any FGS type (here `FOREGROUND_SERVICE_LOCATION`) while targeting Android 14 / SDK 34+ | **Yes — mandatory** | **REQUIRED — must be completed** |

### 8.1 Requirement A — Background location permission form (AVOIDED)

Per Google Play policy:

> If your app does not include the `ACCESS_BACKGROUND_LOCATION` permission and only uses location when the app is closed when starting a foreground service (e.g., during a curbside pickup, during a delivery, or during navigation), you DO NOT need to submit for approval.

Grow v1.0 avoids this heavier form because:

1. The manifest does not include `ACCESS_BACKGROUND_LOCATION` (§2.2)
2. All app-closed location collection runs inside a `foregroundServiceType="location"` service (§2.3)
3. The service is user-initiated and user-terminated (§2.4.1, §2.4.3)
4. A persistent notification is shown throughout (§2.4.2, §2.6)

If any of these four conditions is broken in implementation, Requirement A is triggered and the background-location declaration form + its own video become mandatory.

### 8.2 Requirement B — Foreground service type declaration (REQUIRED, with video)

Because we declare `FOREGROUND_SERVICE_LOCATION` (which we MUST, for screen-off track recording to work — see §2.1, §2.3) and target SDK 34+, Google Play requires the **foreground service declaration** on the App content page. This is **separate** from, and lighter than, Requirement A — but it is **not optional and it requires a video.**

**Form answers:**

| Field | Value |
|---|---|
| FGS type | `FOREGROUND_SERVICE_LOCATION` |
| Task category to select | **Background location updates** (NOT Navigation, NOT Geofencing, NOT User-initiated location sharing) |
| Description | "During a user-started tractor task or contractor shift, Auxein Grow records the GPS track of the work session so equipment coverage and shift movement are captured for the vineyard operator. Tracking is initiated only by an explicit in-app action, shows a persistent notification the entire time, and stops immediately when the user ends the task or shift." |
| Video link | Unlisted YouTube URL (see §8.3) |

Rationale for **Background location updates** as the category: our behaviour is the fitness-tracker/Strava pattern — recording the path of an active, user-started session while the screen is off. It does **not** require `ACCESS_BACKGROUND_LOCATION`; the FGS declaration is the sanctioned path for background-equivalent location *via* a foreground service. Do **not** select Navigation (no turn-by-turn), Geofencing (explicitly out of scope, §1 — selecting it invites scrutiny for a feature we don't ship), or User-initiated location sharing (connotes real-time person-to-person sharing).

### 8.3 Required demonstration video (~30–60s, screen-recorded on a real device)

The video MUST show the three things reviewers verify — user-initiated, user-noticeable, terminated on completion:

1. Open app → log in → open a task → **tap "Start"** (the user-initiated action).
2. Show the **persistent foreground notification** appear ("Auxein Grow — Task in progress: …").
3. **Lock the phone / turn the screen off**, wait, then wake — show the track has continued recording (points accumulated).
4. Return to the app → **tap "Complete/Stop"** → show the **notification disappears** (service terminates with the task).
5. Caption/voiceover: "Location is collected only during an active, user-started task, shown by a persistent notification, and stops the moment the task ends."

Record this against the **rebuilt** app (Phase 1–4 GPS/auth fixes from BUG-010) so the demonstrated behaviour matches the submitted binary. Host as unlisted (not private) so the reviewer can open it.

### 8.4 If we ever add the v1.1 features in §9

Geofence auto-detection / lone-worker pinging / passive attribution would add `ACCESS_BACKGROUND_LOCATION`, which flips on **Requirement A** as well — the heavier background-location form + its own video. Until then, only Requirement B applies.

---

## 9. Future Work (v1.1+, out of scope for v1.0)

The following features will require this spec to be extended and the Permissions Declaration Form to be completed:

- Geofence-based auto-detection of block entry/exit → requires `ACCESS_BACKGROUND_LOCATION` + Android Geofence API + declaration form + demonstration video
- Lone worker safety check-ins → requires `ACCESS_BACKGROUND_LOCATION` + periodic location collection + declaration form + demonstration video
- Passive contractor time-on-block attribution (without explicit clock-in) → as above

When these features are added, a new compliance spec will need to define:

- The prominent disclosure screen and trigger logic
- The runtime upgrade flow from `ACCESS_FINE_LOCATION` to `ACCESS_BACKGROUND_LOCATION`
- The iOS `Always` authorization upgrade flow with `NSLocationAlwaysAndWhenInUseUsageDescription`
- The YouTube demonstration video requirements
- The Permissions Declaration Form field values

---

*End of specification.*
