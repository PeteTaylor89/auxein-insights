# Insights Admin Split & KPI Dashboard — Investigation Report

_Investigation date: 2026-05-18. Read-only audit; no code changes._

## Part 1: Extracting Admin → `admin.auxein.co.nz`

### Current structure
- Single SPA at `packages/insights/` serves both public (`/`, `/articles`, `/research`, `/map`) and admin (`/admin/*`) routes
- 15 admin pages, 1 admin guard (`AdminRoute.jsx:32` — client-side check on `user.is_admin`)
- 1 admin layout (`AdminLayout.jsx`) + 4 admin-only services + Tiptap editor stack
- Routing wiring at `packages/insights/src/App.jsx:54-68`

### Coupling inventory (what makes this non-trivial)

| Concern | Files | Effort |
|---|---|---|
| **Auth context** | `PublicAuthContext.jsx` — single context returns `user.is_admin`; same JWT, same `/api/v1/public/auth/login` for both surfaces | Extract to `@vineyard/shared` and consume from both apps. ~½ day |
| **Mixed services** | `articleService.js`, `researchService.js`, `bannerService.js` — each file mixes `/public/*` reads with `/admin/*` writes | Split into `articleAdminService.js` / leave public read in shared. ~1 day |
| **Pure admin services** | `adminService.js`, `emailCampaignService.js` | Move wholesale. ~½ day |
| **Editor stack** | `src/components/editor/*` (Tiptap + custom extensions for climate widgets/iframes), `AdminArticleEditor`, `AdminResearchEditor` — only used by admin | Move wholesale. ~½ day |
| **Shared auth UI** | `src/components/auth/*` (LoginForm, AuthGuard, AuthModal, etc.) used by both | Move to `@vineyard/shared` or duplicate. ~½ day |
| **Build/deploy** | New Vite app, package.json, env vars, CloudFront distro, S3 bucket, Route53 record, CI pipeline | ~1 day infra |
| **Backend** | **No backend work needed.** Endpoints already split at `/api/v1/admin/*` vs `/api/v1/public/*` with `require_admin` dependency (`backend/core/admin_security.py:7-21`). CORS may need `admin.auxein.co.nz` added. | ~½ hour |

### What changes on the backend?

Almost nothing. The split is already clean:
- Admin endpoints: all under `/api/v1/admin/` and gated by `require_admin` (`admin_security.py:7`)
- Public endpoints: under `/api/v1/public/` (auth, articles read, regions, climate, banners read)
- Both consume the same JWT issued by `/api/v1/public/auth/login`. A user with `is_admin=True` will work on both surfaces.

You may want to **also** gate admin endpoints by origin/CORS, but that's defence-in-depth — the `require_admin` check already protects them.

### Effort estimate: **3–5 days of focused work**

Breakdown: ~2 days frontend refactor (extract context, split services, set up new Vite project, copy editor), ~1 day infra (S3/CF/DNS/CI), ~1 day testing/cleanup, plus buffer.

### Risks / decisions to make
1. **Where do auth UI components live?** Recommend a shared package — both surfaces need login/signup/password-reset. Already have `@vineyard/shared`.
2. **Does the admin SPA need the public client-side bundle at all?** It needs the auth flow but not articles/maps. Stripping these is a bundle-size win.
3. **Should admin require a separate session cookie / 2FA / SSO?** Currently shares the public JWT. Splitting domains is a natural opportunity to add stricter auth (e.g. require 2FA for `is_admin=True` users).
4. **Sub-domain only?** No subdomain change for the API needed — keep `api.auxein.co.nz` for both.

---

## Part 2: KPI Dashboard

### Status of each requested metric

| # | Metric | Data exists? | Endpoint exists? | Effort |
|---|---|---|---|---|
| 1 | Verified users total | Yes — `public_users.is_verified` | Yes — `/admin/users/stats` → `verified_users` (`admin_users.py:194`) | **None — already shipped** |
| 2 | MAU | Yes — `public_users.last_active` | Yes — `/admin/users/stats` → `active_last_30_days` (`admin_users.py:200`) | None |
| 3 | WAU/MAU ratio | Yes — both counts present | Partial — counts returned, ratio not. Trivial frontend divide | ~10 min |
| 4 | Newsletter opt-in % verified | Yes — `newsletter_opt_in` | Yes — `/admin/users/stats` → `opt_ins.newsletter_pct` (`admin_users.py:181`) — already gated to verified users | None |
| 5 | Live sub-regions (complete view) | Partial — see below | None | **~½ day — definition needed** |
| 6 | Active weather stations NZ | Yes — `weather_stations.is_active` + `country_id` | Partial — `/admin/weather/stations/stats` exists but doesn't split by country | ~2h (add country breakdown) |
| 7 | Active weather stations AU | Yes — schema supports it | None — AU stations not yet ingested (memory: "AU September launch") | Will return 0 until AU launch |
| 8 | Unique article reads / month | Yes — `user_events` with `event_type='article_read'`, `user_id`, `created_at` | None — not aggregated | ~2h SQL + endpoint |
| 9 | Article likes / month | Yes — `article_likes` table with `created_at` | None — monthly aggregation not exposed | ~1h |
| 10 | Article comments / month | Yes — `article_comments` with `created_at`, `is_deleted` | None — monthly aggregation not exposed | ~1h |

### Critical caveats

**1. Event tracking is authenticated-only.**
`packages/insights/src/utils/eventTracker.js:34` skips backend events if no token. Anonymous visitors only flow to Umami. Implications:
- "Unique reads" in `user_events` = unique **signed-in** readers. Anonymous reads are not in your DB.
- For total reach you must combine `user_events` (signed-in unique) + Umami (anonymous) + `articles.view_count` (raw counter, increments on every API hit).
- Recommendation: report two numbers — "unique reads (members)" and "total views (incl. anon)". Or pull Umami via its API into the same dashboard.

**2. "Complete view" sub-region is not defined in schema.**
`wine_regions.is_active` is the only flag (`wine_region.py:53`). To compute "complete," you need to define which fields/relationships must be non-null. Candidates a region needs to count as "complete":
- `geometry` not null
- `description`, `climate_summary`, `summary` populated
- ≥1 active weather station within geometry
- ≥1 published article tagged with the region's slug
- Climate history present (≥N years)

Pick the rule, then the endpoint is a single SQL query. **This is the only metric blocked on a product decision.**

**3. `last_active` accuracy.**
Driven by user activity; check that it's updated on every authenticated request, not just login. Quick grep for `last_active` in `backend/core/public_security.py` would confirm. If it only updates on login, MAU undercounts users who stay logged in but don't re-auth.

**4. Article view counting.**
`POST /public/articles/{id}/view` increments `articles.view_count` (anonymous). Separately, `useArticleTracking.js:43-50` fires `article_read` into `user_events` at 75% scroll depth — but only for authenticated users. So:
- `view_count` = total page-loads (anon + auth, but easy to spam)
- `user_events.article_read` = quality reads (75% scroll, authed only)

For a defensible "engagement" metric, use `article_read`. For raw reach, use Umami.

### Existing infrastructure you didn't ask about but should know
- `UserProfile` table (`user_enrichment.py:19`) — per-user rollup with `engagement_score`, `segment` (power_user/engaged/casual/lurker), `total_article_reads`, `total_research_views`, `avg_session_duration_sec`. Already populated by event ingest.
- `/admin/users/stats` returns 14 metrics (`admin_users.py:194-210`); `/admin/users/activity` returns 30-day timeline of signups/logins/verifications.
- Event ingest endpoint: `POST /public/events/batch` (`enrichment.py:108-110`). Already accepting events from frontend.

### Additional KPIs worth adding (data already there)

1. **Verification conversion**: signups → verified % over rolling 7/30 days. Detects email deliverability issues.
2. **Activation rate**: % of verified users with `login_count ≥ 2` (someone who came back at least once after verifying).
3. **User type / marketing segment mix** — already in `/admin/users/stats:by_segment` (`admin_users.py:154`).
4. **Research engagement** — same shape as articles (`research_reports` has view/like/comment counts).
5. **Top content by engagement** — already in `/admin/content/performance` (`enrichment.py:246`).
6. **Avg session duration** — `UserProfile.avg_session_duration_sec`, computable from `user_events.session_id`.
7. **Stickiness DAU/MAU** — daily distinct active users (need daily granularity from `last_active` or events).
8. **Weather station health %** — already in `/admin/weather/stations/stats` (healthy/stale/offline). Roll into KPI as "data quality".
9. **Newsletter campaign engagement** — if `email_campaigns` tracks opens/clicks (worth verifying separately).
10. **Geographic spread** — distinct `region_of_interest` values represented.

### Recommended implementation for the "button press" KPI dashboard

Add **one new endpoint**: `GET /api/v1/admin/kpi/snapshot` that returns all metrics in a single JSON payload. ~150 lines of SQL aggregation, runs in <1s on current data volumes. Then a single admin page with cards + spark-line charts.

**Effort: ~2 days** (1 day backend endpoint + tests, 1 day frontend dashboard), assuming sub-region completeness rule is decided. ~80% of the work is just wiring existing data into the response shape — `verified_users`, `active_last_30_days`, `opt_ins.newsletter_pct` already returned by `/admin/users/stats`. The KPI endpoint can call existing query helpers and add the 4 missing aggregations (weather by country, monthly reads/likes/comments).

### Suggested next decisions
1. Define "complete view" for sub-regions — what's the rule?
2. Confirm `last_active` is updated on every authenticated request, not just login.
3. Decide if anonymous reads (Umami) should be merged into the dashboard or shown separately.
4. Admin extraction: is this driven by security (separate domain → stricter auth, e.g. 2FA), or by UX (smaller public bundle)? The answer changes the auth architecture.

---

## Appendix: Admin surface reference

### Admin pages (15 routes, all under `/admin/`)
Wired in `packages/insights/src/App.jsx:54-68`:
- `/admin` → AdminDashboard
- `/admin/users`, `/admin/users/:id` → UserManagement, UserDetail
- `/admin/articles`, `/admin/articles/new`, `/admin/articles/:id/edit` → AdminArticleList, AdminArticleEditor
- `/admin/research`, `/admin/research/new`, `/admin/research/:id/edit` → AdminResearchList, AdminResearchEditor
- `/admin/weather`, `/admin/weather/:id` → WeatherStatus, StationDetail
- `/admin/banners` → BannerManagement
- `/admin/email`, `/admin/email/new`, `/admin/email/:id/edit` → AdminEmailCampaignList, AdminEmailCampaignEditor

### Admin backend routers (all prefix `/api/v1/admin`, all `Depends(require_admin)`)
- `admin_users.py` — user list/stats/activity/export/segments
- `admin_weather.py` — station list/health/stats, ingestion logs
- `admin_data.py` — data quality, gaps, coverage
- Article/research/banner/email admin endpoints (CRUD) — wired through existing routers

### Key models
- `backend/db/models/public_user.py` — PublicUser (is_admin, is_verified, newsletter_opt_in, last_active, login_count)
- `backend/db/models/article.py` — Article (view_count, like_count, comment_count, region_tags)
- `backend/db/models/article_engagement.py` — ArticleComment, ArticleLike (timestamped)
- `backend/db/models/weather.py` — WeatherStation (is_active, country_id), IngestionLog
- `backend/db/models/wine_region.py` — WineRegion (is_active, parent_region_id, geometry)
- `backend/db/models/user_enrichment.py` — UserEvent, UserProfile (event-sourced engagement)
