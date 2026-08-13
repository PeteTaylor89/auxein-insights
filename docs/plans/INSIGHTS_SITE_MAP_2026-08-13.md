# Insights rebuild — site map, widget backlog, navigation

**Date:** 2026-08-13
**Status:** working backlog. Supersedes nothing; sits under
`PLATFORM_PLAN_2026-08-02.md` §5 (WS3) and is constrained by
`INSIGHTS_REBUILD_AUDIT_2026-08-06.md`.

WS3 has no code yet. This document is the page list and component backlog the
build works through, plus the three decisions Pete resolved on 2026-08-13.

---

## 0. Decisions taken 2026-08-13

### D-A. There are no live widget embeds. `/widget/seasonal` is retired.
Audit §5.1 asked whether to version the seasonal-stats endpoint before surface
numbers move. **Moot — nothing embeds it.** Consequence:

- **Audit invariant #1 is released.** `/widget/seasonal` no longer has to stay a
  chrome-free top-level route, and the nine `vars` keys are no longer frozen API.
- Delete `pages/WidgetEmbed.jsx` + `.css`, the route,
  `components/SeasonalStatsWidget.jsx` + `.css` (it was rendered on the landing
  page between the explorer strip and the map CTA), and the "Get my seasonal
  stats" journey entirely. **Done 2026-08-13.** Nothing else referenced the
  `'widget'` auth-modal context, so removing it stranded no code path.
- **Leave `POST /api/v1/public/seasonal-stats/calculate` mounted for now.** It is
  harmless and removing backend routes is not on this workstream's path. Retire it
  with `zone_aggregation` (D13).
- Invariants #2 (`/` real route + hash read before routing), #3
  (`localStorage.public_access_token`), #4 (`/articles/:slug`, `/research/:slug`)
  **all still stand.**

### D-B. Freeze article climate widgets on the current DB, then re-point at surfaces.
Articles are not static prose — `ArticleDetail.jsx:177` renders live climate
widgets inside article bodies through `ClimateWidgetRenderer`, which reads
`realtimeClimateService` and `publicClimateService`. Ten widget types are already
published inside historical articles:

`gdd_progress`, `temperature_rainfall`, `disease_pressure`, `season_comparison`,
`current_season_summary`, `recent_observations`, `historical_trend`,
`region_trend_compare`, `region_trend_compare_interactive`, `projection_outlook`.

**Rule: the DB path stays alive until each widget type has a surface-backed
replacement.** An article published in March must still render in December. D13
("retire `zone_aggregation` / `climate_zone_daily`") therefore **cannot be a
single cutover** — it is per-widget-type, and articles are the long pole, not the
explorers.

Practical sequence: freeze `ClimateWidgetRenderer`'s current data path → build
surface-backed endpoints → re-point widget types one at a time behind the same
widget-type keys → retire the DB path only when the last type is migrated.

### D-C. Wine climate zones are block-intersected, not area-weighted.
**The new wine climate zone statistic = intersect every block inside the climate
zone polygon with the underlying climate surface, then aggregate up, carrying the
range.**

Applies to **climate histories and current-season metrics**. **Projections keep
using the current DB unchanged** — they were produced the same way already, so
there is nothing to re-derive.

Two consequences that need acting on, not just noting:

1. **This contradicts `SURFACE_CONTRACT_V2.md` §5.2**, which specifies `/region`
   as *"area-weighted over the zone polygon"*. Block-intersected and
   polygon-area-weighted give different numbers — a zone that is 80% mountain and
   20% planted vineyard will differ substantially. The contract needs an amendment
   adding a weighting/masking dimension (additive; no v3 bump needed). **Do not
   build `/region` against §5.2 as written.**
2. **"Aggregated up with the range" means min/max are across BLOCKS, not across
   raster cells.** §5.2's envelope already has `mean`/`min`/`max` fields, so the
   shape survives, but the semantics differ and must be stated in the response —
   otherwise the same JSON means two different things depending on which code path
   filled it. A zone's `min` should answer "the coolest vineyard in this zone", not
   "the coldest cell including the ridge nobody plants on".

This also gives the honest headline number a natural form: zone mean plus the
spread across real vineyards in it.

### D-D. Fix the SEO sitemap now, and keep it current as pages change.
Audit §3.1: `robots.txt` points at `packages/insights/public/sitemap.xml`, a
one-URL static stub from 2026-02-17, while the good DB-driven sitemap in
`backend/api/v1/seo.py` serves from `api.auxein.co.nz` and nothing references it.
No article or research URL is reaching search engines.

Fix now (§7 below). **Standing rule for the rest of this rebuild: every page added
to or removed from §1 updates the sitemap in the same change.** The rebuild will
add region pages, which are the highest-SEO-value URLs the site has ever had —
shipping them into an orphaned sitemap wastes them.

---

## 1. Page list

Legend: **keep** unchanged · **rebuild** same URL, new implementation ·
**new** · **retire**

### Public

| Route | State | Notes |
|---|---|---|
| `/` | **rebuild** | Home. Must stay a real route — SSO hash lands here (invariant #2). See §2. |
| `/map` | **rebuild** | The Atlas. `SurfaceMap` replaces `MapExplorer` + `RegionalMap`. Deep-linkable: `?var=&date=&lon=&lat=&z=`. |
| `/regions` | **BUILT 2026-08-13** | Region index, grouped by parent region. Destination of the home page's "Select your wine region". Free and ungated. |
| `/regions/:slug` | **BUILT 2026-08-13** | Per-zone page: the five explorers in one navigator. Reuses `PublicClimateContainer` as-is, so the DB path stays frozen (D-B) while the URL is new. **Zone slugs are real URLs for the first time** — a zone used to be selector state only, invisible to search and unlinkable. Highest-SEO-value addition in the rebuild; emitted into the sitemap from `climate_zones`. |
| `/articles` | **keep** | Article index. |
| `/articles/:slug` | **keep — invariant #4** | RSS `<guid>`. Path frozen. Body widgets governed by D-B. |
| `/research` | **keep** | Not currently in the site header at all (§3 defect). |
| `/research/:slug` | **keep — invariant #4** | Path frozen. |
| `/about` | **keep** | Agency acknowledgements live here (`6d4a2b8`). |
| `/methodology` | **new** | The honesty surface: how surfaces are made, what `cv_rmse` means, the distance-banded confidence table (contract §3.4), the era step-change, and the heavy-rain under-prediction disclosure (plan §6). Referenced by every `ConfidenceBadge`. Not optional — it is what makes the confidence numbers publishable. |
| `/stations` | **new (optional)** | Public station-network coverage map. Cheap once the station point layer exists; strong trust signal (805 stations, 776 active). Cut first if time is short. |
| `/feedback` | **keep** | |
| `/legal` | **keep** | |
| `/location` | **new — paid** | `LocationPicker` + `LocationDashboard`. Behind `PaywallGate`. |
| `/widget/seasonal` | **retire** | D-A. |

### Admin — untouched per D14
`/admin`, `/admin/users`, `/admin/users/:id`, `/admin/articles*`,
`/admin/research*`, `/admin/weather`, `/admin/weather/:id`, `/admin/banners`,
`/admin/email*`. Tiptap, `AdminLayout`, `AdminRoute`, `components/auth/` all stay.

**Catch-all:** `*` currently `<Navigate to="/" replace />` (`App.jsx:76`). With
region pages arriving, silently redirecting a mistyped/retired URL to home is
worse than a real 404 — it hides dead links from us and returns 200 to crawlers
for URLs that do not exist. **Add a real `NotFound` page.**

---

## 2. Home page — first build

Current structure: banner → "Vine-Sights" tab strip (5 explorers) → map CTA card
→ articles carousel → footer. The explorers dominate; articles are last and in a
horizontally-scrolling carousel.

Target structure:

1. **Hero — national pulse.** A live stat strip: warmest region right now,
   coldest, wettest, current extremes, records broken. Headline number + region
   name + a `ConfidenceBadge`.
2. **Mini surface map.** Latest available climate surface, no controls, entire
   card is a link to `/map`. Renders the actual product in the first screen —
   plan §5.4's "value visible in 30 seconds without signup".
3. **Articles, promoted.** Lead article large with image, then a grid of recent.
   Replaces the carousel — carousels hide everything past the first card and are
   poor on mobile.
4. **Regions entry point.** Compact grid or choropleth linking to `/regions/:slug`.
5. **Sign-in / value CTA.** Footer.

**Removed:** the five-tab "Vine-Sights" explorer strip (the explorers move to
`/regions/:slug`, where they get a URL) and all seasonal-stats UI (D-A).

**Data source, and this matters:** surfaces are not published yet
(`s3://auxein-climate-surfaces` does not exist, temp_min has not run). The stat
strip and mini map therefore build against **the existing realtime/current-season
DB path plus the surface stub**, and re-point at real surfaces when they land.
That is the same freeze-then-migrate shape as D-B — do not build two mechanisms.

Open question for the stat strip: "warmest region" under D-C means warmest by
block-intersected zone mean. Until `/region` exists in that form, the honest
interim is a station-derived number, clearly labelled.

---

## 3. Navigation

**Three defects in the current header** (`SiteHeader.jsx:114-121`), independent of
any redesign:

1. **The map is not in the nav.** `/map` — the flagship — is reachable only from a
   card partway down the home page.
2. **`/research` is not in the nav at all.** Nor is `/feedback`.
3. **Four of six nav links leave the site** (About, Grow, Contact, Auxein all
   `target="_blank"` to `auxein.co.nz`). The primary navigation of a content
   product mostly navigates away from it. These belong in the footer.

**CHOSEN 2026-08-13: Option A.** Header is
`Home · Atlas · Regions · Articles · Research` + Sign in. Footer absorbs
About · Auxein Grow · Contact · Auxein · Feedback · Methodology · Legal.
`Regions` ships pointing at `/regions` in Pass 2; until then it is omitted rather
than dead.

**Option A — content-led, flat (chosen).**
`Home · Atlas · Regions · Articles · Research` + Sign in. Externals to the footer.
Flat, crawlable, every public page reachable in one click. Grows into B when the
paid tier lands.

**Option B — product-led with grouped menus.**
`Home · Explore ▾ (Atlas, Regions, Compare, My Location) · Learn ▾ (Articles,
Research, Methodology) · Pricing · Sign in`. Right shape once paid + agent exist;
more machinery than the current page count justifies.

**Option C — map-first app shell.**
The Atlas *is* the home page, with a persistent left rail and content in overlay
panels. Boldest expression of the maps-first pivot, but it fights the two things
just asked for — article prominence and a stat-led hero — and it weakens the
landing route that SSO depends on. Not recommended now; revisit for the paid
single-site view, where an app shell is genuinely right.

Regardless of choice: keep the header a single `SiteLayout` component with an
opt-out, so any future chrome-free embed route is one prop rather than a
re-architecture.

---

## 4. Widget / component backlog

Ordered by dependency. Everything in A is a prerequisite for B–E.

### A. Data foundation
| Component | Notes |
|---|---|
| `surfaceService` | `/point`, `/region`, `/available`, `/tiles`. Builds against the stub (`SURFACE_STUB_ENABLED=1`). |
| `useSurfaceAvailability` | Wraps `/available`; exposes `gaps` as first-class. |
| `ConfidenceBadge` | RMSE/SD beside every value. First-class per plan §5.3. Links to `/methodology`. Must degrade when `t_rmse` is null or `n_test < 10`. |
| `SurfaceValue` | Renders a point value. **`null` renders as a gap, never 0** (B4.1). |
| `EraNotice` | Flags mixed `resolution_m` in one series; never blend 5 km history with 500 m silently. |

### B. Map
| Component | Notes |
|---|---|
| `SurfaceMap` | Raster overlay from `/tiles`, variable switcher, opacity. Mapbox GL stays. |
| `TimeScrubber` | **Gap-aware** — greys out `available.gaps` rather than requesting holes. Play/pause. |
| `ColourRampLegend` | Ramp + min/max, matched to the tile request. |
| `PointSamplePopup` | Click → `/point` → value + `ConfidenceBadge` + distance to nearest station. |
| `StationPointLayer` | Solar/wind/soil stay as station points (D10). |
| `RegionChoropleth` | Zones coloured by the D-C block-intersected statistic. |
| `MiniSurfaceMap` | Home embed. Latest date, no controls, whole card links to `/map`. |

### C. Home
`NationalPulse` (stat strip) · `HomeMapCard` · `ArticleHero` + `ArticleGrid`
(replacing `articles-carousel`) · `RegionGrid`.

### D. Region pages
`RegionHeader` · `SeasonExplorer` v2 (surface-backed) · `ClimateHistory` v2 ·
`ProjectionsExplorer` (**DB-backed, unchanged per D-C**) · `PhenologyExplorer` ·
`DiseasePressureExplorer` · `RegionCompare`.

Chart.js → ECharts across all of these (D-list).

### E. Paid tier
`LocationPicker` · `LocationDashboard` · `PaywallGate` · `UpgradeModal` ·
`ManageSubscription` · `InsightAgentPanel`.

### F. Chrome
`SiteLayout` (chrome opt-out) · `SiteHeader` v2 · `SiteFooter` (absorbs the four
external links) · `NotFound`.

### G. Article compatibility — D-B
`ClimateWidgetRenderer` v2: same ten widget-type keys, data path switchable per
type. Frozen behaviour first, surface-backed types added one at a time.

---

## 5. What is NOT blocked, and what is

**Not blocked — build now.** Everything in A, B, C, F. The stub serves real COGs
with real gaps, a null window, mixed resolution and distance-banded confidence,
and its acceptance suite passes 20/20.

**Blocked on data.**
- `/region` in D-C form — needs the contract amendment *and* block geometry
  intersection. Interim: station-derived, labelled.
- Anything needing tmin, frost, rainfall or solar — temp_min has not run
  (5 of 12 frontend metrics are currently delivered).
- Real (non-stub) surfaces — `s3://auxein-climate-surfaces` does not exist and
  rasterio/GDAL is not in `backend/venv`.

---

## 6. Constraints carried forward from the audit

- `/` stays a real route; `PublicAuthContext` reads `#insights_sso=` **before**
  the router normalises the hash.
- `localStorage.public_access_token` keeps its name.
- `/articles/:slug` and `/research/:slug` keep their paths.
- Admin/CMS/Tiptap/auth untouched (D14).
- ~~`/widget/seasonal` chrome-free~~ — released by D-A.

---

## 5a. Entitlement model — decided 2026-08-13

Three tiers, split by *what kind of answer* you get rather than by page:

| | Anonymous | Registered (free) | Pro |
|---|---|---|---|
| Articles | ✅ | ✅ | ✅ |
| Regional stats, all five explorers | ❌ | ✅ | ✅ |
| Atlas surfaces | **one surface load**, then sign-in prompt | ✅ | ✅ |
| Saved site, matched against its regional background | ❌ | ❌ | ✅ |
| AI assistant that interprets the data | ❌ | ❌ | ✅ |
| Industry insights | ❌ | ❌ | ✅ (TBC) |

**Anonymous gets a taste, not a tier.** One load of a single surface —
temperature or rainfall — then the sign-in prompt. Free still requires an
account; registration is the price of the regional product, and that is what
makes the funnel work.

**Grow users get Pro.** Grow SSO writes `subscription_tier = 'grow'`
(`insights_profile.py:99`, commented "not a feature gate"). That comment is now
out of date: `'grow'` must be treated as Pro-equivalent. **A `tier == 'pro'`
check is therefore a bug** — the entitlement test is `tier in {'pro', 'grow'}`,
in one shared helper, not scattered across call sites.

### Built 2026-08-13

**Server (the enforcement):** `backend/core/entitlements.py` is the single
definition. `is_pro()` treats `'grow'` as Pro and an expired `'pro'` as not-Pro;
`require_pro` returns **401 anonymous / 402 signed-in-but-not-Pro** per §5.5, and
`require_registration` returns 401. `/point` is gated; `/tiles`, `/available` and
`/region` stay open — the picture and the regional numbers are the free product.
`PublicUser.is_pro` is a property so the answer serialises straight into
`PublicUserResponse`, because the response deliberately does not carry
`pro_expires_at` and a client rule would call a lapsed subscription Pro.
`backend/scripts/check_entitlements.py` — 20/20, with the Grow case asserted
explicitly so a refactor breaks a test rather than a customer.

**Client (the presentation):** `utils/entitlements.js` reads the server's
`is_pro`. `hooks/useSurfaceQuota.js` spends the anonymous allowance per
*variable/date surface*, fails open, and lets an already-seen surface be
re-opened. `components/auth/AccessGate.jsx` renders both gates.

**Applied:** `/regions/:slug` gates the explorer panel behind registration —
**but not the page.** The `<h1>`, description and industry coverage render for
everyone, because a crawler or a visitor arriving from "<region> climate" must
find content, not a login wall. Gating the whole page would forfeit the strongest
organic-search asset the site has *and* remove the reason to register.

### Four implementation constraints

1. **Count surface LOADS, not renders.** A map re-renders on every pan and zoom;
   the quota is one *surface* — a variable/date combination actually loaded.
   Track in `localStorage`, and **fail open** when storage is unavailable, so
   private-browsing visitors are not hard-walled out of the demo.
2. **Client-side counting is advisory.** Fine for a signup nudge; useless as a
   paywall. Anything genuinely paid — point sampling, the saved site, the
   assistant — must be enforced server-side with `402`, which contract §5.5
   already specifies. Do not implement both with one mechanism.
3. `PublicUser` already carries an unused `first_map_view` column, which is the
   natural home for the signed-in half of this.
4. **The point value is partly derivable from the picture.** With a published
   ramp and min/max, eyedropping a pixel inverts to roughly ±0.5 °C — and
   `ConfidenceBadge` already declares ±1.1 °C, so the free estimate is close to
   the paid number. This is the strongest argument for the tiering above: Pro is
   sold as *your site, interpreted* — the saved location matched against its
   regional background, the assistant, the industry layer — not as a number a
   determined user could estimate from the legend.

## 5b. Mobile-native and embeddable — standing requirement

All features are tested on mobile first, with the intent that components are
embeddable in third-party pages.

- Touch targets ≥44 px; primary actions ≥48 px and full-width.
- Prefer native scroll + CSS `scroll-snap` over JS sliders, so momentum, swipe
  and screen-reader focus scrolling come from the platform. Desktop arrow
  affordances layer on top and hide under `(hover: none)`.
- No hover-only affordances anywhere.
- **Embeddability resurrects the chrome-free route capability.** `/widget/seasonal`
  was retired under D-A because nothing embedded it, but the *capability* is now
  wanted again. Keep it as a `SiteLayout` opt-out prop rather than a bespoke
  route tree, so it is one prop when it is needed.
- **Map point-clicks will not work on touch by default.** MapboxDraw kills
  tap→click, so `map.on('click')` is dead on touch and needs a `touchend`
  bridge. This is directly in the path of the Pro point-sampling feature.

## 6a. Found during the build, 2026-08-13

**1. Article canonical URLs point at the homepage. Worse than the audit's §3.2.**
The audit said article meta was set client-side via `useDocumentMeta`. It was
not — `useDocumentMeta` was used on `MapExplorer` only. `ArticleDetail` and
`ResearchDetail` set **`document.title` and nothing else**, so every article
inherited the site-wide description and OG image *and* the static
`<link rel="canonical" href="https://insights.auxein.co.nz">` from `index.html`.
That is an instruction to search engines to fold every article into the landing
page rather than index it — plausibly a bigger suppressor of article traffic than
the orphaned sitemap. **Fixed:** `useDocumentMeta` now manages `canonical` and
`robots`, and both detail pages use it. Server-side injection (§3.2) is still
unbuilt and still the right long-term answer for social cards.

**2. Gap intervals are exclusive at both endpoints, and the contract does not
say so.** The stub emits gaps as `{available_date}/{next_available_date}`, so
both endpoints *have* surfaces and only the interior is missing. Inclusive
parsing greys out two good dates per gap; a producer that later emits inclusive
intervals makes the scrubber request holes. Silent either way. `surfaceService`
implements exclusive and documents it — **contract §5.3 must pin this down.**

**3. `/map` is behind a sign-in wall.** `MapExplorer` renders a locked state for
anonymous visitors. The home hero now puts the national surface in the first
viewport and points at `/map`, so the journey currently ends at a login prompt —
which contradicts §5.4's "value visible in 30 seconds without signup". **Decision
for Pete**, not changed unilaterally.

**4. Minor:** the mobile nav had `<Link to="https://auxein.co.nz/about/">` — a
react-router `Link` given an absolute URL, which produces a relative path, not an
external link. Removed with the nav rework. Separately, `packages/insights` has
no `eslint.config.js`, so `npm run lint` fails outright on ESLint 9.

---

## 7. Immediate actions

**Done 2026-08-13 (Pass 1):**

1. ~~SEO sitemap fix (D-D)~~ — `robots.txt` now points at the DB-driven sitemap;
   the one-URL static stub is deleted; `seo.py` gained a `STATIC_PAGES` list that
   is the single place to update when the route table changes.
2. ~~Delete the shadow `public/index.html`~~ — it was a strict subset of the real
   shell **with no `<script type="module">`**, so had it ever won the race the
   site would have served a blank page.
3. ~~Retire the seasonal-stats frontend (D-A)~~.
4. ~~Navigation decision~~ — Option A (§3).
5. ~~`surfaceService` → `ConfidenceBadge` → `MiniSurfaceMap` → home rebuild~~,
   plus `SurfaceValue`, `EraNotice`, `useSurfaceAvailability`, `NationalPulse`,
   `ArticleShowcase`, `SiteFooter`, `NotFound`, and per-article canonical/meta.
6. `/regional-overview` now returns `temp_min/max/mean`, `rainfall_mm`,
   `confidence` and `station_count` off the `ClimateZoneDaily` row it already
   loaded — no extra query — which is what makes a real "warmest region right
   now" possible before surfaces land.

**Still open:**

7. **Confirm `public/tools/trend-or-blip.html`** (838 lines, unreferenced from the
   SPA) is not linked externally, then remove.
8. **Amend `SURFACE_CONTRACT_V2.md`**: §5.2 for D-C weighting/masking; §5.3 for
   gap-interval inclusivity (§6a.2); plus the `monthly` granularity and statistic
   dimension the history backfill still needs.
9. **CloudFront**: route `/sitemap.xml` and `/rss.xml` to the API origin so the
   sitemap is same-host, and add a custom error response so `NotFound` returns a
   real 404 status rather than 200.
10. **Decide `/map`'s sign-in wall** (§6a.3).
**Done 2026-08-13 (Pass 2, pulled forward):**

12. `/regions` + `/regions/:slug` built; the Vine-Sights strip is **deleted** from
    the home page and the five explorers now live at a real URL. Old
    `/?view=…&zone=…` deep links redirect to `/regions/:slug?view=…` rather than
    being dropped — they are live in the map panel CTA and in sent email — and
    `ClimateZonePanel` now links straight to the new route. Region URLs are in
    the sitemap. `Regions` added to header and footer nav.
13. Home: `RegionLauncher` (region CTA + industry placeholders) under the stat
    strip; articles returned to a prominent scroll-snap carousel headed
    "Articles / From our contributors".

**Still open:**

14. Build the entitlement gates in §5a — map-session counter + soft prompt, and
    the server-side `402` on `/point`.
15. Explorers still read the zone-aggregation DB path. Re-pointing them at
    surfaces is the D-B migration, per widget type.
