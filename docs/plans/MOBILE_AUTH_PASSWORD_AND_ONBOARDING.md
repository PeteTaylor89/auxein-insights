# Mobile Auth — Password Management + Mobile-Only User Onboarding (V1, simplified)

**Status:** Scoped 2026-06-01. Forgot-password button BUILT (rides the GPS rebuild). Web-login gate + welcome email = next batch.
**Owner:** Pete Taylor
**Trigger:** Need (1) forgot/change password on mobile, and (2) mobile-only onboarding for `company_user` (the "User" role): new Users complete signup in the browser, then are told to install the app to sign in.

---

## V1 decision (2026-06-01): browser-first, NO deep linking

The earlier universal/App-Links design was dropped for V1. Instead:

- **All password setup/reset happens on the existing public web pages** (`grow.auxein.co.nz/forgot-password`, `/reset-password`), opened in the device browser. These routes already exist and are public (`packages/web/src/App.jsx:340-341`), and the reset email already links to them (`{GROW.frontend_url}/reset-password?token=…`).
- **The mobile-only enforcement is at LOGIN, not at the link.** A `company_user` can do anything in the browser EXCEPT use the web app — when they try to log into web they are bounced to a "download the app" page. They use the mobile app for actual work.

This removes ALL of the previously-blocking infra: no universal/App Links, no `apple-app-site-association`, no `assetlinks.json`, no Apple Team ID, no Play SHA-256, no CloudFront `.well-known` work, no deferred-deep-link / two-tap dance, no mobile rebuild for the reset flow.

---

## Roles
- **"User" = `company_user`** (confirmed: invitation role `user`/`viewer` → `company_user` in `invitations.py`). App-only.
- **Managers/admins** (`company_admin`, `company_manager`, `auxein_admin`): web + mobile, unchanged.
- **Contractors**: already mobile-only via the existing gate (see below) — the precedent we mirror.

---

## Current state (verified 2026-06-01)

**Backend — already complete, no changes needed for reset/change:**
- `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password` — all work, for User + Contractor.
- `reset_token` / `reset_token_expires` columns on User/Contractor/public_user. Token `secrets.token_urlsafe(32)`, 24h expiry.
- Reset email → `{GROW.frontend_url}/reset-password?token=…` = `https://grow.auxein.co.nz/reset-password?token=…`. `GROW_FRONTEND_URL` confirmed correct.

**Web — reset already public + a reusable mobile-only gate already exists:**
- Public routes: `/forgot-password` → `ForgotPasswordForm`, `/reset-password` → `ResetPasswordForm` (`App.jsx:340-341`).
- **Contractor mobile-only precedent:** `packages/web/src/pages/ContractorMobileOnly.jsx` + guards in `App.jsx` (`ProtectedRoute` / `AuthRoute` / `ContractorOnlyRoute`) bounce `userTypeRole === 'contractor'` to a landing page with (empty) `ANDROID_URL` / `IOS_URL` store-link slots. The `company_user` gate is the SAME pattern + one more role.

**Mobile:**
- `LoginScreen.js` — **"Forgot password?" link ADDED** (opens `FORGOT_PASSWORD_URL` via `Linking.openURL`). Done this session; rides the GPS rebuild.
- `ProfileScreen.js` exists, has NO change-password option yet.
- `ChangeContractorPasswordScreen.js` exists — template for an in-app change-password screen.

---

## Scope

### DONE this session (rides the GPS rebuild)
- **Mobile `LoginScreen` "Forgot password?" link** → `Linking.openURL('https://grow.auxein.co.nz/forgot-password')`. One button, no new screens, reuses the working web flow. File: `packages/mobile/src/screens/LoginScreen.js`.

### Next batch — web deploy (no mobile rebuild)
1. **Web-login gate for `company_user`** (mirror the contractor gate):
   - Extend the `App.jsx` guards so `company_user` (not just `contractor`) is bounced to a mobile-only landing page.
   - Generalise `ContractorMobileOnly.jsx` copy ("Contractor accounts…" → "Your account uses the Auxein Grow mobile app") or add a sibling page; fill the `ANDROID_URL` / `IOS_URL` store slots once listings are live.
2. **Backend login enforcement (defence in depth, ~10 lines):** at `/auth/login`, if account is `company_user` and `x-client-type != mobile`, return 403 `MOBILE_ONLY_ACCOUNT`. The web frontend already sends no `x-client-type`; mobile sends `x-client-type: mobile`. Optional but closes the curl-the-token hole; without it the gate is client-side only.
3. **Welcome email for new Users:** ensure `company_user` onboarding email (a) sets password via the existing web `/reset-password` (or `/forgot-password`) link and (b) frames it as "set your password, then download the app to sign in" with store links. Reuse the reset-token machinery; no password ever emailed.

### Follow-up build (optional, not blocking)
- **In-app Change Password** screen in `ProfileScreen` → existing `POST /auth/change-password` (bearer-auth). ~1 screen, mirrors `ChangeContractorPasswordScreen.js`. Better UX than sending a logged-in user to the browser (which would force an email round-trip). Ships in a later mobile build.

---

## Forgot vs Change — the split (rationale)
| Case | Path | Why |
|---|---|---|
| **Forgot** (logged out) | Browser — `Linking.openURL` to web `/forgot-password` | Reuses working public flow; matches browser-first decision; 1 button |
| **Change** (logged in) | In-app screen → `/auth/change-password` | Sending an authenticated user to browser forces an email round-trip; in-app is better UX. Deferred to a follow-up build. |

---

## Notes / risks
- `FORGOT_PASSWORD_URL` is hardcoded in `LoginScreen.js` to `https://grow.auxein.co.nz/forgot-password`. If the Grow web domain ever changes, update there (and the backend `GROW_FRONTEND_URL`).
- Backend 403 gate must NOT block the reset endpoints — a `company_user` must still be able to reset a password on web; they just can't *log in* there. Gate is on `/auth/login` only.
- Store URLs are a single source of truth needed in three places eventually: the web mobile-only page, the welcome email, and any in-app "update" prompts. Fill once listings are live.
- **EAS gotcha:** commit `LoginScreen.js` before `eas build` or the button won't ship.
