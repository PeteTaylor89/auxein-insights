# Insights rebuild — non-negotiables audit

**Date:** 2026-08-06
**Scope:** the audit pass required by `PLATFORM_PLAN_2026-08-02.md` §5.1 before any
WS3 code is written. Three things must survive the rebuild verbatim: `WidgetEmbed`,
the Grow→Insights SSO handoff, and the existing article/research URLs.

Everything below was verified against the code on disk, not against the plan.

---

## 0. Starting position

WS3 has **no code**. `SurfaceMap`, `ConfidenceBadge` and `surfaceService` appear
only in plan documents; the last commit touching `packages/insights` is `ab2b50c`,
which predates the platform plan. There is no `/api/v1/surfaces` router and no
stub. So this audit constrains a rebuild that has not begun — which is the right
time for it.

`packages/insights` is ~7,000 lines: public pages (landing, map explorer, the
`components/climate/` explorers, articles, research), the admin/CMS half that D14
keeps, and `components/auth/`.

---

## 1. `WidgetEmbed` — the hardest constraint

**Why it is hard:** it renders in third-party iframes we do not control and cannot
instrument. A break is silent and we find out from the customer.

### The frozen contract

| Surface | Value |
|---|---|
| Embed URL | `https://insights.auxein.co.nz/widget/seasonal` |
| Query params | `zone` (slug, required), `harvest` (date, required), `variety` (optional), `vars` (optional CSV) |
| API call | `POST https://api.auxein.co.nz/api/v1/public/seasonal-stats/calculate` |
| Request body | `{zone_slug, variety, harvest_date, selected_variables}` |
| `vars` vocabulary | `gdd10, gdd0, avg_temp, avg_diurnal, total_rainfall, avg_min_temp, avg_max_temp, frost_days, hot_days` |
| Response fields read | `zone_name, vintage_year, season_start, harvest_date, metrics.<var>` |

`VITE_API_URL` is `https://api.auxein.co.nz/api/v1` in `.env.production`, so the
`${API_BASE}/public/seasonal-stats/...` in the component resolves correctly. Route
is mounted at `main.py:331`.

### Rules for the rebuild

1. **Keep `/widget/seasonal` a top-level route that renders no site chrome.**
   `WidgetEmbed` deliberately mounts outside `SiteHeader`/`SiteBanner`. If the
   rebuild introduces a global layout wrapper, this route must opt out.
2. **The nine `vars` keys are API, not UI.** Renaming `avg_diurnal` breaks any
   embed that pinned its variable list.
3. **Zone slugs are API.** This is the collision with D13: retiring
   `zone_aggregation` / `climate_zone_daily` in favour of surfaces changes where
   `metrics` come from. The response *shape* and the *slug vocabulary* must be
   preserved across that migration even though the numbers will move.
4. **The numbers will move, and embeds will not know.** Surfaces will not
   reproduce station-mean zone aggregates exactly. Either version the endpoint or
   accept a step change in live third-party embeds — this is a decision for Pete,
   not a technical detail (see §5).

---

## 2. Grow → Insights SSO

### The flow, as built

1. `packages/web/src/components/SiteHeader.jsx:109` opens
   `${insightsUrl}/#insights_sso=${token}` in a new tab — **the landing route `/`
   with a hash fragment**.
2. `packages/insights/src/contexts/PublicAuthContext.jsx:10` matches
   `/[#&]insights_sso=([^&]+)/` against `window.location.hash` on mount, then
   strips it from the URL without a reload.
3. It exchanges the Grow token via `publicAuthService.exchangeGrowToken()` →
   `POST /api/v1/public/auth/exchange` with the **Grow** token in the
   `Authorization` header (not the stored Insights one).
4. The backend (`public_auth.py:195`) returns a native Insights `public_access`
   token, giving an ordinary 7-day session rather than inheriting Grow's expiry.
5. The token is stored in `localStorage` under **`public_access_token`**.

### Rules for the rebuild

1. **`/` must stay a real route.** The handoff lands there. A rebuild that moves
   the landing experience to `/home` and redirects breaks SSO unless the redirect
   preserves the hash — and hash fragments are exactly what redirects lose.
2. **The auth context must read the hash before the router can normalise it.**
   Any change that mounts routing above auth, or that uses a router which rewrites
   `location.hash`, silently drops the handoff.
3. **`localStorage` key `public_access_token` is load-bearing** across both the
   SSO path and ordinary login.
4. **One-way only.** Grow users get Insights, not the reverse. Do not add a
   reciprocal exchange while rebuilding auth UI.

---

## 3. Article / research URLs and SEO

`/articles/:slug` and `/research/:slug` must survive verbatim. They are emitted
into the RSS `<guid>`, which feed readers dedupe on — changing them re-delivers
every historical item.

**The audit turned up three live problems here. None are caused by the rebuild;
all of them are cheapest to fix during it.**

### 3.1 The dynamic sitemap is orphaned

There are two sitemaps:

| File | Contents | Served at | Referenced by |
|---|---|---|---|
| `packages/insights/public/sitemap.xml` | **one URL** (the homepage), `lastmod 2026-02-17` | `insights.auxein.co.nz/sitemap.xml` | `robots.txt` |
| `backend/api/v1/seo.py` | every published article + research report, from the DB | `api.auxein.co.nz/sitemap.xml` | **nothing** |

`seo.router` is mounted with no prefix (`main.py:409`), so the good sitemap sits on
the API domain, while `robots.txt` points crawlers at the static stub on the web
domain. Its `SITE_URL` correctly says `https://insights.auxein.co.nz`, so it is a
cross-domain sitemap that nothing references.

**Net effect: no article or research URL is being submitted to search engines.**

### 3.2 Article meta tags are client-side only

`useDocumentMeta` sets `title`, `description`, `og:*` and `twitter:*` from
JavaScript after mount. `packages/insights/index.html` carries a single static set
of tags for the whole SPA.

There is no server-side injection. The `holding_page_middleware` in `main.py:597`
is often mistaken for it — it serves the branded API holding page on
`api.auxein.co.nz` for unmatched non-`/api` paths, and never touches
`insights.auxein.co.nz`, which is S3 + CloudFront.

**Net effect: every social share of an article shows the generic site card.**
Google executes JS and will usually get the right title; Facebook, LinkedIn,
Slack and Twitter do not.

> The memory note "SEO: FastAPI catch-all meta tag injection (not Next.js
> migration)" records a **decision**, not a shipped implementation. It is unbuilt.

### 3.3 A second `index.html` shadows the SPA build

`packages/insights/public/index.html` is a 60-line static page carrying the same
`<title>` and canonical as the SPA shell. Vite copies `public/` verbatim into
`dist/`, where the built `index.html` also lands. The site works today, so the
build output is winning — but this is an unexploded ordnance for any rebuild that
touches the Vite config or output directory.

Also in `public/`: `tools/trend-or-blip.html`, an 838-line standalone tool served
at `/tools/trend-or-blip.html`. Not referenced from the SPA. Confirm with Pete
whether it is linked externally before assuming it can go.

---

## 4. What the rebuild may freely replace

- `components/climate/*` explorers (SeasonExplorer, CurrentSeasonExplorer,
  Phenology, DiseasePressure, Projections, ZoneSelector) — these are the
  chart/table-first UI that the maps-first pivot replaces. They read
  `publicClimateService` / `realtimeClimateService`, i.e. the
  `zone_aggregation` / `climate_zone_daily` path D13 retires.
- `MapExplorer` + `components/RegionalMap/` — superseded by `SurfaceMap`, though
  the popup/sidebar patterns are worth keeping.
- Chart.js → ECharts (D-list). Mapbox GL stays.

**Keep untouched per D14:** everything under `pages/admin/`, `TiptapEditor`,
`BannerManagement`, `UserManagement`, `WeatherStatus`, `StationDetail`,
`AdminLayout`, `AdminRoute`, and the whole of `components/auth/`.

---

## 5. Decisions this audit surfaces for Pete

1. **Widget numbers under surfaces.** When zone metrics start coming from
   surfaces, live third-party embeds change value with no notice. Version the
   endpoint, or accept the step change and publish the offset (the plan's own
   honesty requirement)?
2. **`tools/trend-or-blip.html`** — live and linked, or removable?
3. **SEO fix ordering.** §3.1 (point `robots.txt` at a real sitemap) is a
   ten-minute fix worth doing now, independently of the rebuild. §3.2 (server-side
   meta) is a genuine build; the plan's D-list already routes SEO content to the
   Next.js marketing package, which would solve it differently. Which?

---

## 6. Verdict

Nothing in the non-negotiables blocks the rebuild. The three constraints reduce to
four concrete invariants:

- `/widget/seasonal` stays chrome-free, with its params, var keys and zone slugs intact
- `/` stays a real route and the auth context reads the hash before routing does
- `localStorage.public_access_token` keeps its name
- `/articles/:slug` and `/research/:slug` keep their paths

The SEO findings in §3 are pre-existing defects the rebuild inherits rather than
causes, and §3.1 is worth fixing immediately regardless of what WS3 does.
