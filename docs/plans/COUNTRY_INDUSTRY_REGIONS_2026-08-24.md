# Country awareness, industry pills, and the regional dashboard

Plan written 2026-08-24. Nothing built. Every fact in §1 was verified against
prod (`ENV=staging` → `auxein-db...ap-southeast-2`) and the working tree on
2026-08-24, not recalled.

Scope asked for:
1. The site becomes **country-aware** — Australia is the second country, and
   data/maps/regions all follow the selection.
2. `/regions` gets a **new name, theme and content**.
3. **Industry pills** at the top (viticulture only active at launch) that
   dictate which regions and models the page offers.
4. A **regional dashboard** — lighter than the Pro one: region dropdown, a
   current-season graph, a phenology table, a disease-pressure graph, and a
   tight summary of climate history + projections.

---

## 1. Verified starting position

### 1.1 Country — the spine already exists, the surfaces do not

`countries` is a real table built during the ingestion platform's Phase 0.2 and
it is well shaped for this:

| column | note |
|---|---|
| `iso2` / `iso3` / `name` | |
| `hemisphere` | `'N'` \| `'S'`, check-constrained |
| `vintage_start_month` | 1-12, check-constrained |
| `default_timezone` | IANA |
| `is_active`, `display_order` | **exactly the flags a country switcher needs** |

**It holds one row: `(1, 'NZ', 'New Zealand', 'S', 7, 'Pacific/Auckland', true)`.**

`country_id` FKs already exist on `climate_zones`, `wine_regions`,
`weather_stations`, `data_sources`, `devices` and `geographical_indications`.
All 23 climate zones have `country_id = 1`. `backend/core/vintage.py` is already
written country-first — it takes `hemisphere` and `vintage_start_month` as
parameters and derives vintage year and day-of-vintage from them.

So the **ingest and reference layer is already multi-country**. Two places are
not:

- **`surface_run` has no country or domain column** (24 columns, verified) and
  the S3 key layout is `surfaces/v2/{variable}/{granularity}/...`
  (`index_surfaces.py:144-159`) with **no country segment**. An Australian
  surface archive would collide with the New Zealand one in both the table and
  the bucket. This is the single largest structural gap and it is cheap to close
  *now* and expensive to close after a second archive exists.
- **The Insights services hardcode the season**: `SEASON_START_MONTH = 9` at
  `insights_dashboard.py:61` and `insights_site_baseline.py:63`. See §5.3 — this
  is harmless for Australia and only bites on a Northern Hemisphere country.

### 1.2 Industry — does not exist anywhere

There is **no industry table and no industry column** in the database. I checked
`information_schema` for both. The industry list is a hardcoded array in
`packages/insights/src/components/home/IndustryChips.jsx`:

```js
export const INDUSTRIES = [
  { key: 'wine',      label: 'Wine',      icon: Grape,  available: true  },
  { key: 'kiwifruit', label: 'Kiwifruit', icon: Leaf,   available: false },
  { key: 'apples',    label: 'Apples',    icon: Apple,  available: false },
  { key: 'cherries',  label: 'Cherries',  icon: Cherry, available: false },
  { key: 'hops',      label: 'Hops',      icon: Sprout, available: false },
];
```

The industry is instead baked into table *names* — `wine_regions`,
`climate_zones.region_id → wine_regions.id`. A kiwifruit "Bay of Plenty" is not
the same polygon as a wine "Bay of Plenty", so industry is an **attribute of the
zone**, not a join onto a shared geography.

### 1.3 What the regional dashboard can actually draw today

This is the finding that shapes the whole build. Measured per zone, 23 zones
total:

| source | coverage | currency |
|---|---|---|
| `climate_zone_daily` | **14 of 23 zones** | to **2026-08-22** ✅ |
| `disease_pressure` | **12 of 23 zones** | to **2026-08-22** ✅ |
| `phenology_estimates` | **13 of 23 zones**, 9 varieties | vintage **2027** ✅ |
| `climate_projections` | **23 of 23 zones**, 2,484 rows | ✅ |
| `climate_zone_season_stats` | 21 zones | **1987-2023 only** ❌ |

Two consequences:

- **The regional dashboard is live where the Pro one is inert.** The Pro
  current-season panel has no data because `surface_run` has zero rows at
  `granularity='daily'` and `insights_site_daily` is empty. The regional
  equivalent reads `climate_zone_daily`, which is current to two days ago. This
  page can ship and *work* while the Pro page is still parked.
- **Nine to eleven of 23 regions have no current-season or disease data.** A
  dropdown that lists 23 regions and blanks on nine of them is worse than one
  that lists 14 honestly. Coverage has to be a first-class part of the payload,
  not an empty chart. See §5.1.

The `climate_zone_season_stats` 2023 ceiling is the same blocker the Pro page
hit — the climate-history summary will read to 2023 until the zone re-run ships
alongside the site re-population.

### 1.4 What is reusable, and it is a lot

`insights_dashboard._models()` (`backend/services/insights_dashboard.py:751`)
already resolves phenology and disease **per `zone_id`** — it takes
`site.zone_id` and neither model is downscaled to a cell. The Pro panels are
region-level products already, and say so in their own header comment:

> `RegionalModelsPanel.jsx` — "Both models are REAL and already running per
> zone… Neither is downscaled to a cell, so both are badged regional."

717 lines of Pro-styled panel (`CurrentSeasonPanel` 204, `DiseasePanel` 193,
`PhenologyPanel` 143, `RegionalModelsPanel` 94, `ProjectionsPanel` 83) are
directly reusable. That is most of "similar but lighter than the Pro dashboard"
already written.

`RegionDetail.jsx` keeps the five heavyweight *explorers* via
`PublicClimateContainer`. Those are browsing tools and are **not** what this
page wants — the Pro panels are the tight idiom. Both can coexist: the dashboard
summarises, and a "full explorer" link goes to the detailed view.

### 1.5 NZ hardcoding in the frontend

30 occurrences of "New Zealand" across 16 files. The structural ones:

- `components/RegionalMap/index.jsx:99` — `center: [171.5, -41.5]`
- `components/RegionalMap/MapSidebar.jsx:16-26` — **11 NZ region bounding boxes
  hardcoded in JS**, duplicating what the DB already knows
- `useDocumentMeta.js`, `LandingPage`, `RegionsPage`, `Pro`, `About` — copy

---

## 2. The honest cost split

These are two very different sizes of job and they should not be quoted as one.

**Making the site country-aware: small.** The dimension is mostly present. It is
a migration, two endpoints, a URL restructure, a context provider and a copy
sweep. Days, not weeks.

**Giving Australia data: a workstream comparable to everything WS2 has done for
New Zealand.** Australia has:

- no stations in `weather_stations` and no BoM connector in `ingestion/sources/`
- no land mask (the NZ one is LINZ 51153 in `nz_land`)
- no interpolation grid (`VCDN_500m.csv` is 1,438,684 New Zealand cells)
- no surfaces, and no archive equivalent to the CLIFLO record — which was the
  reference the entire era-offset correction was validated against
- no regions, no GIs loaded, no phenology thresholds validated for AU varieties
- roughly **7.7× New Zealand's land area**, so a 500 m national grid is ~11M
  cells against our 1.44M

I would not attempt to estimate that program from here. What I *can* say is that
the sequencing is unambiguous: **build the dimension now, ship it with New
Zealand as the only selectable country, and let Australian data arrive into a
structure that is already waiting for it.** Doing it the other way round means
retrofitting a country key into a live surface archive and a live URL space.

There is also a timing argument that expires:

> **The Insights frontend has never been published since 2026-08-11.**
> `/regions` and `/regions/:slug` were built on 13 August and have **never been
> live**, never been crawled, and carry zero redirect debt. Changing the region
> URL shape is free *today* and stops being free the moment the bundle ships.

Memory records region URLs as "the biggest SEO asset the site has ever had". If
they are going to be country- and industry-scoped, that decision has to land
before the first publish.

---

## 3. Decisions

**Settled by Pete 2026-08-24:**

- **D1 — URL shape: `/nz/wine/marlborough`**, hub at `/nz/wine`. `/regions` and
  `/regions/:slug` redirect permanently.
- **D2 — the nav reads "Explore"**, `h1` stays dynamic.
- **D4 — dimension now, Australian data later.** Australia appears in the
  switcher as inactive. Phase 5 is not in scope and becomes its own plan.
- D3 and D5 taken as recommended below (industry as a column on
  `climate_zones`; the SEO/data entitlement split preserved exactly).

### D1 — URL shape (load-bearing, and free only until publish)

| option | example | note |
|---|---|---|
| **A. Path-scoped, recommended** | `/nz/wine/marlborough` | index at `/nz/wine`. Short, crawlable, unambiguous, one canonical URL per (country, industry, region). |
| B. Literal segment | `/nz/wine/regions/marlborough` | more verbose, leaves room for `/nz/wine/articles` later |
| C. Query params | `/regions/marlborough?country=nz&industry=wine` | **do not** — splits crawl equity across duplicate URLs |

Recommendation: **A**, with `/regions` → `/nz/wine` and `/regions/:slug` →
`/nz/wine/:slug` as permanent redirects. They cost nothing and the old paths are
already emitted by the sitemap generator even though nothing has crawled them.

Articles and research keep `/articles/:slug` and `/research/:slug` unchanged —
those are RSS `<guid>`s and changing them re-delivers every historical item.

### D2 — The page's new name

The page is no longer "wine regions". Candidates:

| name | route | reads as |
|---|---|---|
| **Explore** | `/nz/wine` | industry-neutral, invites browsing, pairs with "Atlas" |
| Regions | unchanged label | accurate but the pills make it under-sell |
| Climate | | collides with the Atlas |
| Dashboard | | implies signed-in and personal, which it is not |

Recommendation: nav reads **Explore**, the `h1` is dynamic —
"New Zealand wine regions" today, and it composes correctly for every future
(country, industry) pair without a copy change.

### D3 — Industry data model

Recommendation: an `industries` table + **`industry_id` on `climate_zones`**,
*not* a join table. A kiwifruit region is a different polygon from a wine
region, so it is a different zone row. Seed it from the existing hardcoded
array so the chips become DB-driven and `is_active` drives which pill is live.

`wine_regions` gets an `industry_id` too, and **keeps its name** — renaming an
11-row table with several FK dependents buys the user nothing today. Logged as
debt, not done now.

### D4 — What "Australia first up" actually means

This one changes the plan materially and I do not know the answer:

- **(a) Dimension only** — Australia appears in the switcher but is disabled
  until data exists. Phases 1-4 below, ~a week.
- **(b) Australia with real data** — Phase 5 becomes a full workstream and needs
  its own plan, its own source discovery (BoM licensing first), and its own
  timeline.

The plan below assumes **(a)**, because (b) cannot be scoped without knowing
whether there is an Australian data source lined up.

### D5 — Entitlement

`RegionDetail` currently gates the *data* behind registration while the page
shell (h1, description, industry coverage) renders for everyone — deliberately,
so the SEO asset survives. **The new dashboard must preserve exactly that
split**, or the strongest organic-search pages on the site become login walls.

---

## 4. Build phases

Phases are independently reviewable and stop at a natural checkpoint, per the
usual working pattern.

### Phase 1 — The dimension (backend, one migration)

1. Migration (**check `SELECT version_num FROM alembic_version` first** — head
   is `insights_site_daily`; slug ≤ 32 chars):
   - `industries` table: `id, key, name, slug, icon, is_active, display_order`
   - `climate_zones.industry_id` FK, backfilled to viticulture
   - `wine_regions.industry_id` FK, backfilled
   - `countries` row for Australia: `AU`, hemisphere `S`,
     `vintage_start_month = 7`, `is_active = false`
   - **`surface_run.country_id`** FK, backfilled to NZ, and a `NOT NULL` after
     backfill
2. Seed `industries` from the frontend array — viticulture active, the other
   four inactive.
3. `GET /api/v1/public/countries` and `GET /api/v1/public/industries`, both
   returning `is_active` so the UI never hardcodes availability again.
4. `?country=` / `?industry=` filters on `/public/zones` and
   `/realtime/zones`, defaulting to NZ + viticulture so nothing existing breaks.
5. **S3 key layout gains a country segment** —
   `surfaces/v2/{country}/{variable}/...`. Decide now whether to physically
   re-key the existing NZ archive or to treat a missing segment as `nz` in the
   reader. Re-keying ~1,400 objects is an afternoon; a permanent special case is
   forever. Recommend re-keying.

**Checkpoint:** every existing endpoint returns byte-identical payloads with the
defaults applied.

### Phase 2 — Frontend country/industry context

1. `contexts/CountryIndustryContext.jsx` — resolved **from the URL, never from
   state**, so every view stays linkable and crawlable. localStorage stores a
   *redirect hint* used only on `/`; a URL always wins.
2. Route restructure per D1, plus redirects from `/regions` and `/regions/:slug`.
3. Country switcher in `SiteHeader`; hidden entirely while only one country is
   active, so it does not advertise an empty Australia.
4. Copy sweep across the 16 NZ-hardcoded files — country name comes from
   context.
5. `MapSidebar`'s 11 hardcoded bounding boxes come from the API instead; map
   centre and initial bounds derive from the active country.
6. **The sitemap emits the new URLs in this same change** — the standing rule is
   that any page added or removed updates the sitemap in the same commit.

**Checkpoint:** New Zealand behaves exactly as before, at new URLs, with old
URLs redirecting.

### Phase 3 — Regional dashboard endpoint

`GET /api/v1/insights/regions/{slug}/dashboard` — one payload, one call,
mirroring the shape `insights_dashboard.build()` already proved for Pro.

| block | source | reuse |
|---|---|---|
| current season | `climate_zone_daily` + `climate_zone_daily_baseline` | new `_region_season()`, modelled on `_current_season()` |
| phenology | `phenology_estimates` + `phenology_thresholds` | **`_phenology_varieties()` as-is** |
| disease | `disease_pressure` | **`_models()` as-is** |
| history | `climate_zone_season_stats` | reads to 2023 — see §5.2 |
| projections | `climate_projections` | **`_projections()`, re-keyed to zone** |

Every block carries an explicit `available` + `reason`, because 9-11 zones have
no data. `RegionalModelsPanel` already renders exactly that contract.

**Checkpoint:** an acceptance script in the house style
(`backend/scripts/check_region_dashboard.py`) asserting coverage per zone and
that no block ever returns `0` where it means `null` — B4.1 bit this platform
once.

### Phase 4 — The page itself

1. `pages/ExploreRegions.jsx` replacing `RegionsPage.jsx`:
   - **Industry pills** — DB-driven, viticulture active, the rest carrying the
     existing "coming soon" contact-form behaviour from `IndustryChips`
   - **Region dropdown** — lift `RegionLauncher`'s grouped selector, which
     already orders zones north-to-south from `wine_regions.display_order` and
     promotes each region-level zone to its group header
   - **Coverage-aware** — regions without data are visibly marked in the
     dropdown, not silently broken
2. Dashboard body: season graph, phenology table, disease graph, history +
   projections summary — Pro panels, lighter chrome, tighter spacing.
3. A "full explorer" link into the existing `PublicClimateContainer` view, which
   stays exactly as it is.
4. Theme pass. This is also the moment to *look at the olive retheme*, which has
   touched 37 files and has still never been rendered.

**Checkpoint:** browser, mobile-first, ≥44px targets.

### Phase 5 — Australia (separate plan, gated on D4)

Not scoped here. The first question is BoM licensing and whether an Australian
station record is obtainable on acceptable terms — the same question that killed
NIWA. Everything else follows from the answer.

---

## 5. Traps

### 5.1 Nine to eleven regions have no data
`climate_zone_daily` covers 14 of 23 zones, `disease_pressure` 12, phenology 13.
Which nine differ per model. Coverage must be resolved server-side and rendered
as an explanation, never as an empty chart.

### 5.2 The 2023 ceiling reappears here
`climate_zone_season_stats` stops at vintage 2023, so the history summary stops
there too. Same root cause as the Pro page's, and it clears with the same zone
re-run. Do not build a workaround — build the honest "to 2023" label and delete
it when the re-run ships.

### 5.3 Two different "season starts", and only one is country-aware
`countries.vintage_start_month = 7` is the **vintage-year boundary**.
`SEASON_START_MONTH = 9` is the **growing-season start** (Sep-Apr). They are
different quantities and conflating them will silently shift every seasonal
total. Australia is Southern Hemisphere with the same shape as New Zealand, so
**neither needs to change for Australia** — this only bites on a Northern
Hemisphere country. Add `season_start_month` to `countries` in Phase 1 while the
migration is open, but do not refactor the services until a NH country exists.

### 5.4 `default_timezone` is a scalar and Australia has five
`countries.default_timezone` is a single IANA string. Australia spans
Australia/Perth through Australia/Sydney. Wine argues for Australia/Adelaide as
the default, but the field is a per-country scalar and a national daily rollup
computed in one timezone will be wrong at the edges. Note it; it does not block
the dimension.

### 5.5 The server's UTC date is yesterday all New Zealand morning
`date.today()` on prod is the previous NZ day until midday. Correct in dev,
wrong in prod. Any "current season to date" figure must derive its date from the
country's timezone, not the server's. This is a recorded prod bug class.

### 5.6 A country switcher that loses the SSO hash
Grow opens `${insightsUrl}/#insights_sso=${token}` — the landing route with a
hash fragment, read before routing. Any redirect added at `/` (including a
"remember my country" redirect) must preserve the hash or it silently breaks
one-way SSO from Grow.

### 5.7 Do not `git add -A`
The working tree carries a parallel session's ingest and interpolation work.
`docs/models/lris-nzenvds-...-GTiff/` is 49 MB and is not gitignored.

---

## 5b. Phase 1 build log — 2026-08-24

**Written, syntax-checked, NOT applied.** The migration has not been run against
production and the acceptance suite therefore has not been run at all.

New:
- `alembic/versions/country_industry_dim.py` — head was `insights_site_daily`,
  verified as a single row in `alembic_version` and as the tip on disk
- `backend/core/scope.py` — `resolve(db, country, industry) -> Scope`,
  defaulting to NZ + wine
- `backend/api/v1/public_taxonomy.py` — `/countries`, `/industries`, `/resolve`
- `backend/scripts/check_country_industry.py` — 40-odd assertions, most of them
  on *no regression* rather than on the new endpoints

Modified:
- `backend/db/models/{data_platform,climate,wine_region,surface}.py`
- `backend/api/v1/{public_climate,realtime_climate}.py` — optional
  `?country=`/`?industry=` on `/regions`, `/zones` and realtime `/zones`
- `backend/main.py` — mounts `/api/v1/public/taxonomy`
- **`backend/scripts/index_surfaces.py`** — see below. This file belongs to the
  surfaces session.

### The one non-obvious break, and why the change is cross-session

Adding `country_id` to the two partial unique indexes silently breaks
`index_surfaces.py`. It builds its conflict target from a tuple:

```python
RUN_KEYS = ("variable", "granularity", "statistic", "valid_at",
            "resolution_m", "model_version")
```

Postgres resolves `ON CONFLICT (...)` by **matching the inference clause against
an index**. Once the index carries `country_id`, that clause matches nothing and
the statement fails outright — *"there is no unique or exclusion constraint
matching the ON CONFLICT specification"*. It does not degrade, and it would not
appear until the next re-index.

This is the 2026-08-20 failure mode exactly: a migration that redefines
something shipping without the code that reads it. So `country_id` was added to
`RUN_KEYS` in the same change. It is deliberately **not** added to the inserted
columns — inference columns need not be supplied by the INSERT, and the column's
server default is New Zealand, so the script writes exactly the columns it
always did.

`index_surfaces.py:672` is the only writer of `surface_run` in the codebase
(verified). `stage_publish.py` does not write it.

### Cost of applying
`surface_run` is 21,689 rows / 19 MB, `climate_zones` 23, `wine_regions` 11. The
backfill and both index rebuilds are sub-second. There is no local database to
rehearse against — `.env` runs `ENV=staging` against prod RDS and
`LOCAL_DATABASE_URL` is commented out.

---

## 5c. Phase 2 build log — 2026-08-24

Backend verified: `check_scoped_urls.py` **23/23**, `check_country_industry.py`
still **47/47**, `main.py` imports with all three taxonomy routes mounted.
Frontend parse-checked with esbuild across all 19 touched files. **Nothing has
been in a browser** and nothing is committed or deployed.

New:
- `packages/insights/src/contexts/CountryIndustryContext.jsx`
- `packages/insights/src/components/scope/ScopeRouting.jsx` — `ScopedLayout`
  plus the two legacy redirects
- `packages/insights/src/components/scope/CountrySwitcher.{jsx,css}`
- `packages/insights/src/services/taxonomyService.js`
- `backend/scripts/check_scoped_urls.py`

Modified: `App.jsx` (routes), `SiteHeader.jsx` (Explore + switcher),
`IndustryChips.jsx` (DB-driven), `RegionsPage.{jsx,css}`, `RegionDetail.jsx`,
`publicClimateService.js`, `backend/api/v1/{seo,regions}.py`, and ten components
whose `/regions/...` links now build from the scope.

### Three decisions taken during the build

1. **`/` is NOT redirected by the remembered scope.** The plan said localStorage
   would be "a redirect hint used only on `/`". Redirecting the landing page
   would drop the `#insights_sso=` fragment Grow opens the site with (trap 5.6)
   and would put a hop on the highest-value URL on the domain. The hint instead
   decides where region LINKS point when they are rendered outside a scoped
   route. Same benefit, no redirect.

2. **The fallback scope object is memoised.** `useCountryIndustry()` works
   outside a provider, and an unmemoised fallback hands back a new `path`
   identity every render — so the first component to put `path` in a dependency
   array would loop forever. The provider's value was already memoised; the
   fallback now matches, and a component cannot tell which one it has.

3. **`/{country}/{industry}` is safe as a bare two-segment route** because React
   Router ranks static segments above dynamic ones: `/articles/foo` still
   matches `/articles/:slug`. Anything that does reach the dynamic pair and is
   not a real scope 404s inside `ScopedLayout`.

### Deliberately NOT done — the blanket copy sweep

The plan called for sweeping all sixteen "New Zealand" occurrences. Only the
region pages were changed. The rest are **statements of fact about data we only
have for New Zealand** — `observingAgencies.js` lists NZ councils,
`aboutContent.js` and `/about` describe the NZ station network, `LegalContent`
is NZ law, and the `useDocumentMeta` site default describes the product as it
exists. Replacing accurate specific copy with vague copy, for a country with no
data, would make the site worse today in exchange for nothing. They become real
work when Australia has data, and they are listed here so that is a decision
rather than an oversight.

Same reasoning for `RegionalMap`'s `center: [171.5, -41.5]` and the Atlas
sidebar's eleven hardcoded bounding boxes. The sidebar list turned out to be an
**error-path fallback**, not the live source — it already fetches
`/public/regions`, which is now scoped. The plan overstated that one.

---

## 5d. Phase 3 build log — 2026-08-24

`check_region_dashboard.py` **35/35**, and the other two suites still green
(47 + 23). **105 checks across the three phases.** Nothing committed, nothing
deployed, no UI yet — this is the endpoint only.

New: `backend/services/insights_region_dashboard.py`,
`backend/scripts/check_region_dashboard.py`.
Modified: `backend/api/v1/public_climate.py` —
`GET /api/v1/public/public_climate/zones/{slug}/dashboard`.

### It reuses the Pro module rather than re-deriving

`insights_dashboard._season_strip` and `._models` take a Pro `site` but touch
only `zone_id` — both were regional products all along, since neither phenology
nor disease is downscaled to a cell. A four-line frozen `ZoneRef(zone_id)` shim
lets them be called without a site, so the Pro page and the region page compute
"this season versus normal" with **one** implementation. Two would drift, and
the drift would be invisible.

The one place the region page is *ahead* of Pro: **projections are real here.**
The Pro `_projections` is an honest placeholder because there is no projection
surface to sample for a single cell — but the projections that exist were
produced per REGION, which is exactly this page's scale. So the region gets
numbers and the site does not, which is the right way round.

### Coverage, measured, and why every block carries its own flag

    climate_zone_daily            13 zones   live season
    climate_zone_daily_baseline   22 zones   the normal curve
    phenology_estimates           13 zones
    disease_pressure              12 zones
    climate_zone_season_stats     21 zones   1987-2023
    climate_projections           23 zones
    climate_projection_extremes   21 zones

No single availability flag can be right. The suite asserts that **every
unavailable block carries a `reason`** — that is the rule that stops a blank
panel shipping.

### Three defects found and handled

1. **`climate_zone_daily_baseline` is missing `day_of_vintage` 243 for every
   zone** — that is 28 February, absent because a climatology built on 365-day
   years has nowhere to put it. It also has **no base-10 cumulative column**,
   only base-0. Accumulating over the present rows would leave a one-day flat
   spot in the cumulative GDD curve in late February, which is peak ripening.
   Day 243 is interpolated from its neighbours and flagged `interpolated: true`.
2. **`climate_zone_season_baseline` is stamped `1987-2006`**, not the page's
   1986-2005. Different twenty-year windows. The history normal is recomputed
   over the page's own baseline from the season rows and the stored one is
   ignored — printing a 1987-2006 normal under a "1986-2005" heading is the kind
   of error that survives for months because both numbers look right.
3. **`%-d` in an f-string strftime is glibc-only** and raised
   `ValueError: Invalid format string` on all 23 zones. Prod is Linux, so this
   would have worked there and failed only in development. Replaced with
   `{start.day}`.

### The test that mattered was the one today cannot reach

24 August is pre-season — vintage 2027 starts 1 September — so every zone
reports `not_started` and the season curve is never built. The most important
block on the page would have shipped untested, and would stay untested for a
third of every year. The suite therefore also builds every zone at
**`today = 2026-03-01`**, mid the 2026 season, where 14 of 23 zones have a real
record. That is what confirms the base-10 fix empirically:

    northland: our gdd10 1372.2  vs  the table's base-0 column 3172.25

A 2.3x error, and both numbers look plausible on a chart.

### Entitlement — deliberately unchanged

The endpoint is public, like all five sibling `/zones/{slug}/*` routes.
`core/entitlements.require_registration` exists but is used by **nothing**;
enforcing it on this one route would make the API inconsistent with its siblings
and risks the anonymous article widgets. The registration gate stays client-side
in `AccessGate`, which is also what keeps the page shell crawlable. Flagged as a
product decision, not taken here.

### Note — the alembic head moved under us

The surfaces session applied **`surface_projection_run`** to prod at 10:47 while
this was being built. The chain is linear and clean:
`insights_site_daily -> country_industry_dim -> surface_projection_run`.

That broke a bad assertion of mine — `check_country_industry.py` pinned the head
to `country_industry_dim`, so any unrelated migration failed it. It now walks the
on-disk chain down from whatever the database reports and asserts
`country_industry_dim` is in the **ancestry**, which is the thing actually worth
knowing. The single-head check stays, because a dual row is a known gotcha here.

---

## 5e. Phase 4 build log — 2026-08-24

All three suites green (35 + 47 + 23 = **105**). Every touched frontend file
parse-checked. **Nothing has been in a browser.**

New: `pages/Explore.jsx`, `components/explore/{IndustryPills,RegionSelect,
SeasonProgressChart,PhenologyTable,DiseaseChart,ClimateSummary,RegionDashboard}.jsx`,
`components/explore/explore.css`, `services/regionDashboardService.js`.
Rewritten: `pages/RegionDetail.jsx`. **Deleted: `pages/RegionsPage.jsx`** —
superseded by `Explore.jsx`; its stylesheet is kept and still supplies the tile
grid. Backend: `_disease_series` and `_regional_totals` added to
`insights_region_dashboard.py`.

### The page

Industry pills → region dropdown → four blocks. `/nz/wine` is the hub (pills,
dropdown, crawlable tile grid); `/nz/wine/:slug` is the dashboard.

**The tile grid stayed alongside the dropdown**, deliberately. The dropdown is
the control a returning grower wants, but the tiles are what makes the page
worth anything to a crawler — every zone as a real `<Link>`, which is the entire
reason the region URLs were given their own routes. A JS picker alone would make
them invisible again.

**`?view=` still renders the full explorers.** Those deep links are live in
`ClimateZonePanel`, in article widgets and in sent email, and Phase 2 carried
them through the redirect specifically so they would keep working. The dashboard
is the new default; the explorers are one click away and unchanged.

### Two components, not one, for industries

`home/IndustryChips` is a marketing row — "here is what Insights covers", with a
pending chip linking to the contact form. `explore/IndustryPills` is a
**control**: the active one determines which regions and models the page shows,
so it navigates and carries selected state. Both read the same `industries`
table, so they cannot disagree about what is live. Switching industry drops any
region slug — a wine Marlborough and a kiwifruit Bay of Plenty are different
zone rows with different polygons.

### Coverage is marked, not filtered

The dropdown lists **all 23** regions and marks the ten without a live season.
Listing only the 13 covered ones would hide the site's strongest search assets,
which still carry history, projections and a description. Two requests feed it:
`getZones` (all) and `getZonesWithData` (the covered subset).

### Chart.js, not ECharts

The platform plan named ECharts. The codebase runs Chart.js everywhere
(`SiteSeasonChart`, `DiseasePressureExplorer`, `SiteMonthlyChart`) and a second
charting library for two charts costs more than it buys. Checked rather than
assumed: **Chart.js is already in the main bundle** via
`App -> RegionDetail -> PublicClimateContainer -> utils/chartDefaults ->
chart.js/auto`, so the new charts add only the thin `react-chartjs-2` wrapper
and no lazy boundary is needed.

### `_season_strip`'s note was Pro-page prose

The reused helper writes its own explanatory `note`, and it is addressed to a
subscriber: it talks about "your site's own record". On a public region page
there is no site, so the sentence is simply false. `_regional_totals` rewrites
it rather than dropping it — the thing it exists to say (these are STATION
measurements at regional scale, not the interpolated surface) matters just as
much here.

Also corrected against the real payload: the metric key is `metric`, not `key`,
and the server sends **no difference** — value and normal come from two
different instruments and it declines to subtract them. The subtraction is done
in the client, where the decision is visible.

### Disease needed a series

`_models` returns only the latest reading, which was all the Pro badge needed. A
chart needs the shape — a botrytis index at 40 that has been climbing for a
fortnight is a different instruction from the same 40 on its way down. Added
`_disease_series`: 90 days of the three published indices (UC Davis powdery,
Gonzalez-Dominguez botrytis, Goidanich downy). A **rolling window, not a
season** — the same reason `disease_pressure` was left unpinned when the article
widgets were pinned on 08-23. Cutting at the season boundary would blank the
panel every September.

### What ships looking empty today, correctly

24 August is pre-season, so the season block renders "The 2027 season starts on
1 September — 8 days away" rather than an empty chart. That is the state the
page spends a third of every year in, including launch day.

---

## 5f. The 2023 history gap — CLOSED 2026-08-24

Pete asked whether the climate histories were reading the old tables or the
surfaces. The answer was worse than either: **`climate_zone_surface_monthly` IS
the surface-derived table, and it had simply not been re-run** — 1986..2023
while the archive underneath ran to 2026-07.

### What was measured

| | span before | span after |
|---|---|---|
| `surface_run` monthly (the archive) | 1986-01 .. **2026-07** | unchanged |
| `climate_zone_surface_monthly` | 1986 .. 2023 | **1986 .. 2026** |
| `climate_zone_surface_season` | 1987 .. 2023 | **1987 .. 2026** |
| `climate_history_monthly` | 1986 .. 2023 | unchanged |
| `climate_zone_season_stats` | 1987 .. 2023, 100% `modelled` | unchanged |

### What was run

    aws s3 sync .../surfaces/v2/{var}/monthly/{2024,2025,2026}/  -> the mirror
    aggregate_zone_monthly.py --from-year 2024        11,408 rows
    aggregate_zone_season.py  --from-vintage 2024 --to-vintage 2026   1,083 rows

**The aggregator reads a LOCAL MIRROR, not S3** — `SURFACE_MIRROR`, defaulting
to a *relative* `scratchpad/...` path, which silently resolves to nothing when
the script is run from `backend/` and reports "496 surfaces missing" rather than
failing. The mirror stopped at 2023, which is the entire reason the tables did.
1.3 GB / 1,333 objects synced to fix it.

`aggregate_zone_monthly.py` also **never called `_configure_proj()`**, unlike
every other raster-touching script here. This workstation's PostGIS sets a
machine-level `PROJ_LIB` with an old `proj.db`, and CRS lookups then fail as a
GDAL *log line* rather than an exception. Added.

### The seam is clean

The thing that could have gone wrong — a step change where the era-offset
corrected 2024+ surfaces meet the pre-2024 archive — did not:

    national Jan gdd10   2022 261 · 2023 257 · 2024 280 · 2025 201 · 2026 233
    national season gdd10  2023 1330 · 2024 1325 · 2025 1353 · 2026 1363
    July frost days      2023 5.9 · 2024 7.2 · 2025 7.8 · 2026 8.5

### The dashboard's history block was repointed

`_history` read `climate_zone_season_stats` — the pre-surface table, still 100%
`source='modelled'` because the observed fold-in has never run. It now reads
`climate_zone_surface_season`. Three consequences:

- history reaches **2026** instead of 2023
- coverage rose from **21 to 23** zones
- **gdd10 and rain joined** the summary, which the old table did not carry

The suite's assertions were inverted to match: it used to assert the 2023
ceiling and now asserts the block tracks the archive's own last vintage,
derived — not hardcoded, which is what went stale in the first place.

### Still on 2023, deliberately not touched

- **`/zones/{slug}/history`** -> `climate_history_monthly`, and
  **`/zones/{slug}/seasons`** -> `climate_zone_season_stats`. These feed the
  legacy `SeasonExplorer`, which is now behind `?view=` rather than being the
  default. Repointing them is a bigger change to legacy components and is its
  own piece of work.
- **`insights_site_service.py:57` `LAST_VINTAGE = 2023`** caps the Pro record.
  Lifting it alone does nothing useful — it needs the site re-population too,
  and Pro is parked.
- `aggregate_zone_season.py:69` hardcodes `FIRST_VINTAGE, LAST_VINTAGE = 1987,
  2023` as its DEFAULT range, so it will go stale again next time. It should
  derive its bound the way `check_surfaces_live.py` now does.

---

## 5g. The home map — Phase 4b, 2026-08-24

`check_region_map.py` **23/23**. Four suites now total **132**.

New: migration `country_map_outline`, `backend/api/v1/public_map.py`,
`backend/scripts/check_region_map.py`, `services/mapService.js`,
`components/home/RegionMap.{jsx,css}`.
**Deleted: `components/home/RegionLauncher.{jsx,css}`** — superseded by the map
here and by `RegionSelect` on Explore.

### Why not hidden links

The ask was to keep region links for SEO but make them invisible. Two problems.
First, **there were none to keep**: `RegionLauncher` navigated with
`navigate()`, so the landing page contained no crawlable link to any region —
the site's strongest organic-search URLs were invisible from its busiest page.
Second, links sized or coloured so people cannot see them but crawlers can are
named in Google's spam policies as hidden links, and the exposure is
domain-wide. The map gives the same crawl paths inside something a visitor
actually wants: every region is a real `<a href>`.

### Country-agnostic by construction

`country_outline` holds one pre-simplified, dissolved land outline per country.
`nz_land` could not be read directly — 2,354 polygons, 9 MB, and its NAME is the
problem: an endpoint reading it only ever draws New Zealand. Australia is now an
INSERT, not a branch.

The endpoint **projects server-side** (equirectangular, cos-latitude corrected —
without the correction NZ renders ~25% too wide) and rounds to integers. That is
what makes it affordable: **20.5 KB** against 75 KB for the equivalent GeoJSON.
There is no NZ anywhere in the component or the response contract.

### Layout

The hero is now three even columns: region map | compact pulse + Pro | surface
map. `NationalPulse` gained a `compact` variant capped at three tiles — at full
size it made the middle column the tallest, which defeats the point.

The industry picker is kept, above the map, because it decides what the map
shows. **`/` stays unscoped**: the pills drive local state and only a region
click navigates to a real `/{country}/{industry}/{slug}`. A redirect on `/`
would drop the `#insights_sso=` fragment Grow arrives with.

---

## 6. Recommended order

1. **D1-D4 answered** (§3) — D1 in particular expires at first publish.
2. **Phase 1**, because a `country_id` on `surface_run` is trivial today and
   painful once a second archive exists.
3. **Publish and look at the site**, including the unrendered olive retheme.
4. Phases 2-4.
5. Australia data as its own program.
