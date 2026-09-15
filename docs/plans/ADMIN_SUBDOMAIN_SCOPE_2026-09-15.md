# Scope — consolidate Insights admin + Grow admin onto `admin.auxein.co.nz`

_Scoping only. No code changed. Written 2026-09-15._
_Updated 2026-09-15: prod `is_admin` audit run (§1), §8 decisions recorded._

Supersedes Part 1 of `INSIGHTS_ADMIN_SPLIT_AND_KPI_PLAN.md` (2026-05-18), which
covered the Insights half alone and predates `/admin/accounts`, `/admin/qc`,
`/admin/jobs` and `/admin/email`. Its Part 2 (KPI dashboard) is unaffected.

---

## 1. The decision that drives everything else

Insights admin and Grow admin authenticate against **two different identity
systems with two different tokens**, and the bridge between them runs one way only.

| | Insights admin | Grow admin |
|---|---|---|
| Table | `public_users` | `users` |
| Flag | `public_users.is_admin` (boolean, default false, NOT NULL) | `users.user_type == 'auxein_admin'` (`User.is_auxein_admin`, `user.py:186`). The column is `user_type`; `userTypeRole` is only the client-side name |
| Token | `type:"public_access"`, claim `user_id` | `type:"access"`, claim `sub` |
| Backend dep | `require_admin` (`core/admin_security.py:7`) | `get_current_user` + role check |
| Browser key | `localStorage['public_access_token']` | `localStorage['accessToken']` (+ `refreshToken`) |
| Session | no refresh token | refresh-token rotation |

`get_current_user` **rejects** a `public_access` token by design — that is the
one-way guarantee from `project_grow_insights_sso`: Insights subscribers can
never reach Grow routes. `POST /api/v1/public/auth/exchange` converts
Grow to Insights. **There is no reverse exchange, and adding one would delete
that guarantee.**

So a single admin origin has to resolve this. Three ways:

**Option A — two logins, one shell (no backend change).**
The admin SPA holds both tokens in its own `localStorage` and picks the right one
per API client. Insights calls use `publicApi`; Grow calls use the `@vineyard/shared`
axios client. An admin signs in twice on first visit. Ugly but honest, zero new
auth surface, and it is the only option that ships without touching the security model.

**Option B — Grow login is primary, exchange for the Insights token (recommended).**
Admin signs in once with Grow credentials, gets `accessToken`, and the SPA calls the
**existing** `/public/auth/exchange` on mount to get a `public_access_token`. Both
tokens present, one login, and the handoff runs in the already-permitted direction.
Cost: every Auxein admin must have a Grow `users` row with `user_type='auxein_admin'`
**and** their linked `public_users` row must carry `is_admin=true`.

**Option C — reverse exchange (Insights admin to Grow token).** Not recommended.
It puts a route that mints Grow tokens in front of the Insights identity system and
inverts the one-way invariant that currently makes Grow unreachable from Insights.

> **DECIDED: Option B.** The prod audit below confirms it works today with zero backfill.

### 1.1 Prod audit — run 2026-09-15 against `auxein-db.cnmusikiqmmn.ap-southeast-2` (read-only)

> That host **is** prod despite the local `.env` saying `ENV=staging` — the same quirk is
> already documented at `COUNTRY_INDUSTRY_REGIONS_2026-08-24.md:4`, and it is the only RDS
> host named anywhere in the repo.

```
grow_id | email                    | user_type    | pu_id | is_admin | origin | pw_null
     11 | pete.taylor@auxein.co.nz | auxein_admin |    10 | t        | signup | f
(1 row)
```

There is **exactly one `auxein_admin` in `users`, exactly one `is_admin` row in
`public_users`, and they are the same person, already linked.** `origin='signup'` means
this went down the ADOPT branch — a pre-existing Insights self-signup that the backfill
linked to Grow user 11. `public_users` totals: 63 `signup`, 5 `grow`.

**So Option B needs no backfill and no migration. It works today, for the one admin who exists.**

**But `is_admin` survives here by accident, not by design.** `ensure_insights_profile`
(`services/insights_profile.py`) **never mentions `is_admin`** — grep returns nothing:

- **link / adopt branches** return the existing row untouched, so an `is_admin` that was
  already there survives. That is the only reason today's audit is green.
- **create branch** (`insights_profile.py:89`) builds a fresh `PublicUser(...)` without
  `is_admin`, so it takes the column default — `false` (verified on both the model,
  `public_user.py:48`, and the live column).

The consequence is in §7.6: the **second** Auxein admin is the one that breaks.

---

## 2. What moves — verified inventory

### 2.1 Insights (`packages/insights/`) — all of it moves

15 routes, `App.jsx:100-121`, all wrapped in `AdminRoute` (`user.is_admin`, client-side):

`/admin` · `/admin/users` · `/admin/users/:id` · `/admin/accounts` · `/admin/articles`
(+`/new`, `/:id/edit`) · `/admin/research` (+`/new`, `/:id/edit`) · `/admin/weather` ·
`/admin/weather/map` · `/admin/weather/:id` · `/admin/qc` · `/admin/jobs` ·
`/admin/banners` · `/admin/email` (+`/new`, `/:id/edit`)

| Group | Files | LOC |
|---|---|---|
| Admin-only pages + layout + guard + CSS | `components/AdminLayout.jsx`, `AdminRoute.jsx`, `pages/AdminDashboard.jsx`, `pages/admin/*` (7 jsx + 1 css), `pages/Admin.css`, `pages/{UserManagement,UserDetail,WeatherStatus,QcDashboard,JobsDashboard,StationMap,StationDetail,BannerManagement}.jsx` + `StationMap.css`, `services/adminService.js` | **~9,390** |
| Editor stack (admin-only in practice) | `components/editor/*` (6 files), `TiptapEditor.jsx` | **~1,220** |
| Also admin-only | `components/ImageUpload.jsx` | small |
| **Forked surfaces/preview stack** — see §2.4 | `services/{surfaceService,publicClimateService,realtimeClimateService}.js`, `components/surfaces/{SurfaceMapFields,surfaceMapConfig,surfaceLabels,ArticleSurfaceMap}`, `components/climate/ClimateWidgetRenderer.jsx`, `hooks/useSurfaceAvailability.js`, `utils/{chartDefaults,responsiveChartOptions}.js`, `components/ResizableImage.jsx` | **~4,700** |

Coupling out of the admin tree is clean at the page level — the only non-admin imports
across every admin page are `AdminLayout`, `ImageUpload`, `TiptapEditor`, `SurfaceMapFields`,
and four services. It is **not** clean one level down; see §2.4.

### 2.4 The forked surfaces stack — corrected after Phase 2

This section did not exist when the work was scoped, and the estimate above was wrong
because of it. Two things only showed up on contact:

**1. `SurfaceMapFields` is not the whole dependency.** It pulls in the surfaces client
stack — `surfaceService`, `publicClimateService`, `realtimeClimateService`,
`surfaceMapConfig`, `surfaceLabels`, `useSurfaceAvailability`, `chartDefaults`,
`ResizableImage`. Every one of those has **6–10 consumers in the public Insights app**, so
none of them can move. They are **permanent forks**: Phase 5 deletes the admin-only files
from Insights and leaves these where they are. Each forked file now carries a header naming
its original and saying so. If they drift far enough to matter, promote the pair into
`@vineyard/shared` rather than reconciling by hand.

**2. The article preview nearly dragged the public signup stack onto the admin origin.**
`AdminArticleEditor` lazy-loads `ClimateWidgetRenderer` via `lazy(() => import(...))` — a
DYNAMIC import, which is why a static import scan missed it. Its closure is ~7,000 LOC and
includes `PublicAuthContext`, `AuthModal`, `SignupForm`, `ForgotPasswordForm`,
`LegalContent` and `utils/analytics` — contradicting both Phase 1 decisions (§8 Q3: fork
login-only; §5: no analytics on this origin).

The whole tail came from two edges, and both are cut:
- `PublicAuthContext` entered only via `useSurfaceAvailability`, which the admin app rewires
  to `AdminAuthContext` (the hook only uses it to derive a cache-busting scalar).
- `AuthModal` is one render in `ArticleSurfaceMap` — the "sign up to see the archive" gate
  for anonymous readers. **It cannot fire here:** every viewer has cleared `AdminRoute`, so
  they are signed in and entitled and the server returns the full step list. It is shimmed
  to `return null`, rather than importing ~2,400 LOC of signup UI so a dead branch has
  something to render.

Net effect: 4 files copied instead of 22, and no public auth/analytics surface on the admin
origin. **Anything else moved into this app must be checked for dynamic imports the same
way** — a `lazy(() => import(...))` is invisible to a grep for `from '...'`.

**Dead code to delete, not move:** `hooks/useAdminAuth.js` (156 lines, mostly commented-out
scaffolding). It imports `../contexts/AuthContext`, which **does not exist** in this
package — only `PublicAuthContext` and `CountryIndustryContext` do. Nothing imports it.

### 2.2 Grow (`packages/web/`) — only `/admin` moves

`/admin` (`pages/Admin.jsx`) is genuine platform admin, guarded `userTypeRole !== 'auxein_admin'`.
Five tabs: Companies (manage + create), Users, Properties, Contractors, Banners.

| Files | LOC |
|---|---|
| `pages/Admin.jsx` + `components/admin/{CompanyCreationForm,CompanyManagement,UserManagement,PropertyManagement,ContractorRegistry,BannerManagement}.jsx` | **~4,185** |

These import only `@vineyard/shared`, `lucide-react`, `react-router-dom` and `../HelpTip` —
so they port to a new app almost verbatim, because `@vineyard/shared` is already a
workspace package.

### 2.3 What explicitly does NOT move

Three things live under admin-shaped names but are **tenant self-service**. Moving them
to `admin.auxein.co.nz` would break customers:

- **`/company-admin`** (`CompanyAdmin.jsx`, 2,169 LOC) — the customer's own admin: their
  users, properties, blocks, rows, costs, CSV sync, contractor relationships. Reached by
  the `company_admin` role, not just `auxein_admin`. Backed by `/api/v1/company-admin/*`,
  which gates on `get_current_user`, not on `auxein_admin`. **Stays in Grow.**
- **`/admin/visitors`** (`VisitorManagement.jsx`) — company-scoped `visitorService`, no
  `auxein_admin` guard at all. Misleading URL. **Stays in Grow.**
- **`/admin/contractors`** (`ContractorManagement.jsx`) — company-scoped
  `contractorManagementService`. **Stays in Grow.**

If the URL confusion is worth fixing, rename these to `/company-admin/visitors` and
`/company-admin/contractors` as a separate, optional change — not part of this move.

### 2.5 The Grow admin components were never self-contained — corrected after Phase 3

They were styled by three things that do not exist on the admin origin:
`index.css` (2,725 lines of global app styling), `styles/theme.css` (the
`--color-*` tokens every one of those rules resolves against), and — for the
modal chrome — `pages/CompanyAdmin.css`, which reaches them only as a **global
side effect of a different page's import**. Grow's own `/admin` modals are
unstyled today if you land there without `/company-admin` having loaded first.

Measured rather than assumed: of the **97 class names these components use, 65
are undefined in Grow too** — vestigial. Only **8** genuinely came from the
globals (`form-group`, `form-actions`, `cancel-button`, `error-message`,
`status-badge`, `role-badge`, `btn-accent`, `btn-ghost`). So the admin app gets a
~300-line `grow/grow-admin.css` restyling those against its own tokens, rather
than a 3,000-line theme import. **Every rule is scoped to `.grow-admin-page`** —
unscoped, its `.form-group` would fight the one in Insights' `admin.css` and the
Grow tab would restyle the article editor.

### 2.6 Navigation — what Phase 4 actually changed

The nav inherited from Insights was a flat 12-item bar, and below 768px
`admin.css` simply `display: none`d it: **there was no mobile navigation at
all**, just a brand and a dead "Exit Admin" link pointing at a page that no
longer exists on this origin.

Replaced with `AdminNav` (own `anav-*` namespace, so it cannot fight the old
`.admin-nav-*` rules, now unused):

- **Three groups — Insights / Data / Grow.** The grouping is load-bearing, not
  cosmetic: "Banners" exists in both Insights and Grow against different
  backends (§7.2). A flat list puts two identical words side by side; a grouped
  one makes the difference the first thing you read.
- **Desktop** (>900px): group dropdowns + a user chip with session details and
  sign-out. Escape closes, click-outside closes, navigation closes.
- **Mobile** (≤900px): a real drawer — grouped sections, 44px touch targets,
  body-scroll lock, `env(safe-area-inset-bottom)` on the sign-out, scrim.
- **Grow tabs became routes** (`/grow/:tab`). They lived in component state, so
  every Grow nav entry would have landed on Companies; they are now linkable and
  back-button-correct, which they were not in Grow.
- `admin-layout.css` corrects the inherited desktop-only layout rules: container
  gutter, stacked headers, one-column card grids, wrapping toolbars, and
  `.job-row` — a 4-column grid whose minimums total 24.1rem, ~50px wider than a
  360px phone, which pushed the whole dashboard sideways.

---

## 3. Backend — near-zero, with three real items

The API split is already correct. No endpoint moves, no `require_admin` changes,
no new EB environment. `api.auxein.co.nz` serves both surfaces.

| Prefix | Router(s) | Gate |
|---|---|---|
| `/api/v1/admin/*` | `admin_users`, `admin_insights_accounts`, `admin_weather`, `admin_data`, `admin_qc`, `admin_jobs`, `admin_banners` | `require_admin` (PublicUser) |
| `/api/admin/*` | `admin.py` | `get_current_user` (Grow) |
| `/api/v1/grow-admin/*` | `admin_grow_banners` | `require_auxein_admin` (Grow) |
| `/api/v1/company-admin/*` | `company_admin` | `get_current_user` — **tenant, not platform** |

Work items:

1. **CORS.** Add `https://admin.auxein.co.nz` to `allowed_origins` (`backend/main.py:104-124`).
   Add a dev port too (`5176` on both `localhost` and `127.0.0.1` — the file already documents
   why both spellings are mandatory). One EB redeploy. ~30 min.
2. **`admin.py` is mounted at `/api/admin`, not `/api/v1/admin`.** Two different namespaces
   that both read "admin". The new client must not assume a single base path. No change
   required, but it is a trap worth naming in the client's service layer.
3. **Admin provisioning rule (from the §1.1 audit).** Nothing today grants `is_admin` to a
   newly-created projection row, so onboarding admin #2 is a silent two-step. Pick one:
   (a) teach `ensure_insights_profile` to set `is_admin=True` when
   `grow_user.user_type == 'auxein_admin'` — one condition on the create branch, and it also
   self-heals the adopt branch; or (b) leave the code alone and make it a documented manual
   step. **(a) is better** — it keeps a single source of truth (the Grow role) and means the
   admin site cannot half-work. Either way it is ~1 hour, not a blocker for the move itself.

### 3.1 2FA — answering Q5

There is **no 2FA anywhere in the codebase today.** Verified: no `totp` / `mfa` /
`two_factor` / `otp_secret` reference in `backend/db/models/`, `api/v1/auth.py` or `core/`;
`pyotp` is not in `requirements.txt`; and `users` has **zero** columns matching
`%factor%`, `%otp%` or `%mfa%`. So this is greenfield, not an enable-a-flag job.

The good news is that Option B makes it cheap, because it collapses to **one** login to
protect. TOTP on the Grow login covers the whole admin origin — the Insights token is then
minted by exchange, behind that factor, and no second implementation is needed on the
`public_users` side.

Sketch (not scoped into §6): `users.totp_secret` + `users.totp_enabled` columns and a
migration; `pyotp` + a QR enrolment endpoint; a second step in `/api/auth/login` that
returns a short-lived challenge instead of tokens when `totp_enabled`; enrolment UI plus a
challenge screen in the admin app; recovery codes. **~1.5–2 days**, and it is genuinely
independent of the move.

**DECIDED 2026-09-15: 2FA is DEFERRED to a later date.** Not cancelled, not scheduled —
out of this piece of work entirely, and out of the §6 estimate. The origin split delivers
value without it; bolting a new auth factor onto a new app while both are unproven means a
failure in either looks like a failure in the other; and with exactly one admin account
(§1.1) the population it protects is one person.

The **IP allow-list in §5 goes in at provision time instead** — about an hour, most of the
same protection for this threat model.

Two things to carry forward to whenever 2FA is picked up:
- **Recovery codes are mandatory, not a nice-to-have.** One admin account means a lost
  phone is a platform-wide admin lockout (§7.7). Create a second admin first.
- **Do not let the deferral quietly become permanent.** The allow-list protects the origin,
  not the API (§5) — `/api/v1/admin/*` stays reachable from anywhere CORS allows with a
  valid token. Password-only remains the whole story for the admin surface until this lands.

---

## 4. Frontend — the actual work

New workspace package `packages/admin/` (Vite + React, matching the `packages/taste/` precedent).
Root `package.json` already globs `packages/*`, so it is picked up automatically; add
`dev:admin` / `build:admin` scripts alongside the existing ones.

| # | Task | Notes | Est. |
|---|---|---|---|
| 1 | Scaffold `packages/admin/` | Vite app, `.env` / `.env.production` (`VITE_API_URL`, `VITE_MAPBOX_TOKEN` — StationMap needs Mapbox), port 5176 | 0.5 d |
| 2 | Auth shell | Per §1 decision. Two API clients side by side: `publicApi` (Insights token) + the shared Grow client. Single `AdminRoute` requiring **both** `is_admin` and `auxein_admin` | 1–1.5 d |
| 3 | Move Insights admin tree | ~9,390 LOC + editor stack ~1,220 + the ~4,700 LOC forked surfaces stack that only appeared on contact (§2.4). **Actual: ~16,300 lines / 57 files.** Mostly file moves + import rewrites, plus one `AuthModal` shim | 1 d |
| 4 | Move Grow admin tree | ~4,185 LOC, imports `@vineyard/shared` already | 0.5 d |
| 5 | Unified navigation | `AdminLayout.jsx` nav (11 items) plus Grow's 5 tabs. **Two `BannerManagement` components with the same name and different backends** (`admin_banners` = Insights, `admin_grow_banners` = Grow) — they must not collide | 0.5 d |
| 6 | Split the mixed services | `articleService` (2 admin / 1 public), `researchService` (1/1), `emailCampaignService` (2/1). Public halves stay in Insights; admin halves move. `adminService.js` moves wholesale | 0.5–1 d |
| 7 | Auth UI — **DECIDED: fork** | Fork a login-only subset into the admin app rather than promoting `components/auth/*` (12 files) to `@vineyard/shared`. Admin needs login; it does not need signup, email verification, or user preferences. Leaves the public Insights auth flow completely untouched — no shared-package churn on a customer-facing path | 0.5 d |
| 8 | Strip admin from both source apps | Delete routes + pages; drop the header links (`insights/SiteHeader.jsx:177,202,258`; `web/SiteHeader.jsx:72,170,253`). Keep `/company-admin` links in Grow untouched. Redirect `/admin*` to `admin.auxein.co.nz` — **bare redirect, no token in the fragment** (see §4.1) | 0.5 d |
| 9 | Fix internal `/admin` links | `AdminDashboard.jsx:84,224`, `QcDashboard.jsx:341` are intra-admin — fine. `TiptapEditor.jsx:72` posts to `/admin/articles/images` (API path, not a route) — fine. Verify nothing else | 0.25 d |
| 10 | Test both surfaces still build and run | Insights public must survive losing the Tiptap/Mapbox admin chunks; Grow must survive losing `/admin` | 0.5 d |

**Frontend total: 5.5–7 days.**

### 4.1 The redirect carries no token — answering Q6

Redirect `/admin*` on both old origins, and **never attach a token to it.**

This needs stating explicitly because the codebase already contains the opposite pattern
and it would be the obvious thing to copy. `SiteHeader.jsx`'s `openInsights()` hands off a
live Grow token by URL fragment — `window.open(\`${VITE_INSIGHTS_URL}/#insights_sso=${accessToken}\`)`
— and `PublicAuthContext` reads `#insights_sso=` on mount and exchanges it. That is a
reasonable trade for a public content site. It is the wrong trade for admin: it would mean
a URL that, for as long as it sits in someone's history or clipboard, is a bearer
credential for every company record on the platform.

So: the redirect sends the browser to `https://admin.auxein.co.nz` and the admin signs in
there. One extra login, once per session, on a site used by one person. **Do not add
`#insights_sso=` handling to the admin app at all** — the exchange in §1 Option B runs
server-to-server from a password login the admin app performed itself, never from a token
handed in through a URL.

Keep the redirects permanently rather than time-boxing them. They cost one route each, and
a dead `/admin` on the old origins is worse than a redirect for as long as anyone's
bookmarks survive.

### Side benefit worth stating

`App.jsx:38-41` already notes that `StationMap` drags in `mapbox-gl` for a page most users
can never open, and had to be lazy-loaded to contain it. Removing the admin tree takes
Mapbox (admin's copy), the whole Tiptap editor stack, and ~10,600 LOC out of the public
Insights bundle outright — no lazy-loading gymnastics needed. Same for Grow: ~4,185 LOC
and the company/property management surface leave the tenant bundle.

---

## 5. Infrastructure

Follow `docs/runbooks/provision-taste-infra.md` **Stage C only** (the SPA half). No new EB
environment, no new database, no new schema — this is a static site against the existing API.

| Step | Detail |
|---|---|
| ACM cert | `admin.auxein.co.nz`, **us-east-1** (CloudFront requirement), DNS validation |
| S3 bucket | `auxein-admin-web`, `ap-southeast-2`, all four public-access blocks ON |
| CloudFront | New distribution, OAC to the bucket, default root `index.html`, SPA error routing 403/404 to `/index.html` 200, compress, HTTP to HTTPS |
| Route53 | A/AAAA ALIAS to the CF domain, in `Z0932031205PZ3XGHREAD` |
| Deploy | build, `s3 sync`, invalidate — mirroring the insights/grow deploy steps |
| Record | Add bucket + distribution id + cert ARN to the `project_aws_infra` memory |

**IP allow-list — DECIDED, do it at provision time (Q5).** A CloudFront function or WAF
allow-list in front of the admin distribution. Because nothing on this origin is
customer-facing, an allow-list costs nothing in UX — unlike on Grow or Insights. With one
admin account in existence (§1.1) the list is short. ~1 hour while the distribution is
being created, versus a fiddly retrofit later.

Note what it does and does not buy: it protects the *origin*, not the API. The admin
endpoints stay reachable from anywhere CORS allows (§7.5) — the allow-list stops someone
loading the admin UI, not someone calling `/api/v1/admin/*` with a valid token. It is worth
an hour anyway; it is not a substitute for 2FA (§3.1).

**Infra: ~1 day.**

---

## 6. Total and sequencing

| Phase | Est. |
|---|---|
| ~~Decision #1 + the `is_admin` audit~~ | **done 2026-09-15** (§1.1) |
| Frontend (§4) | 5.5–7 d |
| Backend (§3) — CORS + provisioning rule | 0.5 d |
| Infra (§5) — incl. IP allow-list | 1 d |
| Test + cutover + cleanup | 1 d |
| **Total** | **8–9.5 days** |
| _Deferred, NOT in the above:_ TOTP 2FA (§3.1) | _later date_ |

The May estimate of 3–5 days was for the Insights half alone and assumed no cross-identity
problem. Adding Grow roughly doubles it — most of the increase is §1 and task 2, not volume
of code.

### 6.1 Ordered build sequence

Six phases. Each is reviewable and testable on its own; **the old surfaces keep working
until Phase 5**, so there is no point before the very end where admin is unavailable.

| Phase | What | Depends on | Who |
|---|---|---|---|
| **0** | ✅ **DONE.** CORS + provisioning rule. Added `https://admin.auxein.co.nz` + port 5176 (both spellings) to `allowed_origins`; `_grant_admin_from_grow_role` in `ensure_insights_profile` — **grant-only, never revoke**, so an ordinary Grow login cannot strip `is_admin` from an Insights-native admin | — | code |
| **1** | ✅ **DONE.** Scaffold `packages/admin/` + auth shell. Vite on 5176, forked login, Option B exchange, dual-token `AdminRoute` naming the missing flag. Two additions beyond plan: the Insights token is **re-derivable** (single-flight re-exchange on 401, since it was minted by exchange and the Grow token has refresh), and a `/session` diagnostic showing both identities | 0 | code |
| **2** | ✅ **DONE.** Moved the **Insights** admin tree — 15 routes at root-level paths, 44 route refs rewritten, 3 mixed services split, 9 modules marked permanent forks. **~16,300 lines / 57 files**, not the ~10,600 estimated — see §2.4 | 1 | code |
| **3** | Move the **Grow** admin tree — `Admin.jsx` + six `components/admin/*`, ~4,185 LOC. Keep the two `BannerManagement`s visibly distinct | 1 | code |
| **3** | ✅ **DONE.** Moved the **Grow** admin tree into `src/grow/`. Guard dropped (AdminRoute covers it), `GrowUserManagement`/`GrowBannerManagement` renamed against the §7.2 collision, CSS namespaced `grow-admin-*` against a bare global `.admin-page`. Wrote the ~300-line scoped stylesheet these components never had — see §2.5 | 1 | code |
| **4** | ✅ **DONE.** Unified nav: three groups (Insights / Data / Grow), desktop dropdowns, **mobile drawer**, user menu + sign-out. Grow tabs became routes (`/grow/:tab`). `useAdminAuth.js` deletion deferred to Phase 5 — it lives in `packages/insights`, and nothing is removed from there until the cutover | 2, 3 | code |
| **5** | Strip `/admin` from both source apps; bare permanent redirects (§4.1); drop the six header links | 4 + Phase 6 live | code |
| **6** | **Infra (Pete):** ACM cert us-east-1, `auxein-admin-web` bucket, CloudFront + OAC + SPA error routing, Route53 alias, IP allow-list, first deploy. Then redeploy the API for the Phase 0 CORS change | 0 | Pete |

**Phase 0 goes first because Phase 1 cannot be tested without it** — the new dev origin on
5176 is cross-origin to the API and every call fails CORS until it is listed. Phase 6 can
start any time after Phase 0 and run in parallel with 1–4; it only has to be *finished*
before Phase 5, because Phase 5 is the point of no return — that is when the old `/admin`
routes stop existing and the redirect has to land somewhere real.

Phases 2 and 3 are independent of each other and could be done in either order; 2 first
because it is the larger and stranger of the two, so its surprises surface earlier.

---

## 7. Risks

1. **The dual-token session is the whole risk.** Two tokens with different lifetimes on one
   origin: Grow has refresh-token rotation, Insights has none and its interceptor silently
   clears `public_access_token` on any 401 (`publicApi.js:38-46`). An admin can end up
   half-authenticated — Grow tabs work, Insights tabs bounce to login — with no visible
   cause. The admin shell needs to detect a one-sided expiry and re-run the exchange, not
   just redirect. Budget real time here.
2. **Two `BannerManagement` components, two banner backends.** `admin_banners` (Insights,
   `require_admin`) and `admin_grow_banners` (Grow, `require_auxein_admin`). Merging them
   into one nav is an invitation to post an Insights banner to Grow. Keep them visibly
   distinct in the UI.
3. **`/company-admin` must not get swept up.** It is 2,169 LOC sitting next to `Admin.jsx`,
   it imports three of the same `components/admin/*` files (`CompanyUserManagement`,
   `InvitationForm`, `ContractorRelationships`), and it is customer-facing. When moving
   `components/admin/`, move only the six files §2.2 lists.
4. **Client-side-only guards.** `AdminRoute` and the `Admin.jsx` `Navigate` are both
   cosmetic; the real gate is server-side. That is fine today and stays fine — but do not
   let "it is on its own domain now" become a reason to relax anything server-side.
5. **The API has no origin-based gate.** `admin.auxein.co.nz` will be *a* front end for the
   admin endpoints, not *the* front end — the endpoints stay reachable from anywhere CORS
   allows. If the goal of this move includes "admin is only reachable from the admin
   origin," that is additional backend work not scoped here.
6. **Admin #2 is the one that breaks — and it breaks quietly.** Today's single admin works
   because their `public_users` row pre-existed a self-signup with `is_admin` already set
   (§1.1). The next Auxein admin will be created as a Grow user, hit the **create** branch
   of `ensure_insights_profile`, and get `is_admin=false` by column default. Under Option B
   they will log in successfully, see the admin site load, and find that every Grow tab
   works while every Insights tab bounces them to a login they cannot satisfy — with no
   error that names the cause. Two mitigations, do both: fix the provisioning rule (§3 item 3),
   **and** make the admin shell check both flags at the door and say precisely which one is
   missing rather than redirecting. §4 task 2 already requires both flags; this is why.
7. **One admin account is a single point of failure.** The audit found exactly one
   `auxein_admin` and one `is_admin` row, the same person. Adding 2FA (§3.1) to a
   one-account system without recovery codes converts a lost phone into a lockout of the
   entire platform admin surface. If 2FA goes ahead, recovery codes are not optional, and a
   second admin account is worth creating first.

---

## 8. Decisions — all six answered 2026-09-15

| # | Question | Decision | Where it lands |
|---|---|---|---|
| 1 | Auth: Option A, B or C? | **B** — Grow login primary, exchange for the Insights token | §1, §4 task 2 |
| 2 | Does `ensure_insights_profile` preserve `is_admin`? | **Audited.** Yes on link/adopt (by omission, not intent); **no on create**. Today's single admin is fine; admin #2 is not | §1.1, §3 item 3, §7.6 |
| 3 | Fork the auth UI or share it? | **Fork** a login-only subset into the admin app | §4 task 7 |
| 4 | Rename Grow's `/admin/visitors` + `/admin/contractors`? | **Leave them.** Not broken, just badly named — and they stay in Grow either way | §2.3 |
| 5 | 2FA or IP allow-list? | **IP allow-list now (~1 h, at provision time). 2FA DEFERRED** to a later date — out of this scope and out of the §6 estimate | §3.1, §5 |
| 6 | `/admin` redirects — permanent or time-boxed? | **Permanent, and bare** — no token in the fragment, ever | §4.1 |

### Still genuinely open

1. **Create a second `auxein_admin` account before adding 2FA?** The audit found the
   platform has exactly one admin, one person. That is a bus-factor problem already; 2FA
   without recovery codes would make it an outage-shaped one (§7.7). Cheap to fix, but it
   is an account-management decision, not a code one.
2. **Provisioning rule (a) or (b)?** §3 item 3 — patch `ensure_insights_profile` to derive
   `is_admin` from the Grow role, or leave it manual and documented. Recommend (a).
