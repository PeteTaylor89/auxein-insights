# Insights v1.1 — UX Overhaul & Seasonal Stats Widget

## Session: 2026-04-05

### Progress

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 1 | Mobile UX Fixes | DONE | Touch targets, form overflow, font normalization (pt→rem vars), scroll snap, chart area maximized |
| 2 | Banner Improvements | DONE | Arrows (desktop), swipe (mobile), click-to-expand modal, 12s cycle + pause on interact, dots hidden on mobile |
| 3 | Professional Insight Buttons | DONE | Horizontal layout, accent bar, chevron, olive active state, inline demo badge |
| 4 | Map Explorer Page | DONE | `/map` route, lazy-loaded Mapbox, CTA card on landing, compact sidebar, lazy-load layers, climate zone layer scaffolded |
| 5 | Seasonal Stats Widget | DONE | CTA button → expandable panel, About modal, free-text variety, harvest date calc engine, data capture table, embed iframe, no-auth embed endpoint |
| 6 | Additional Recommendations | TODO | |

---

### Remaining Work

#### Phase 4 follow-ups (deferred — needs zone geometry data)
- **Climate zone boundaries** — DB migration ready (`backend/migrations/add_geometry_to_climate_zones.sql`), model updated with geometry column. Need to populate boundary data then:
  - Zone click → open climate history/projections panel (handler stubbed in `RegionalMap/index.jsx` as `handleClimateZoneClick`)
  - Highlight blocks within zone via spatial intersection (endpoint exists at `GET /api/v1/public/climate-zones/{slug}/blocks`)

#### Phase 6: Additional Recommendations
1. **Articles carousel** — add prev/next arrows (same pattern as banners)
2. **Lazy-load climate explorers** — `React.lazy()` for each of the 5 explorer components inside `PublicClimateContainer`
3. **SEO meta tags** — dynamic `<meta>` for widget/embed pages for social sharing
4. **Accessibility** — `aria-live="polite"` on banner carousel, `role="tablist"` on insight grid
5. **Error states** — user-friendly error cards with retry for climate explorers

---

### Key Files Modified

#### Frontend (`packages/insights/`)
- `src/index.css` — typography scale CSS vars (`--font-xs` through `--font-3xl`)
- `src/App.jsx` — lazy routes: `/map`, `/widget/seasonal`
- `src/pages/Landingpage.jsx` — removed inline map, added CTA cards for Map + Seasonal Stats, widget component
- `src/pages/LandingPage.css` — font normalization (all `pt` → CSS vars), insight card redesign, map CTA, footer grid
- `src/pages/MapExplorer.jsx` + `.css` — **new** full-page map with auth gate
- `src/pages/WidgetEmbed.jsx` + `.css` — **new** standalone embed page (no auth, no site chrome)
- `src/components/SiteBanner.jsx` + `.css` — full rewrite: arrows, click-to-expand modal, swipe, pause-on-interact
- `src/components/SeasonalStatsWidget.jsx` + `.css` — **new** widget: CTA card → expandable panel, About modal, form (zone/variety/harvest date/variable selector), result card with embed
- `src/components/SiteHeader.css` — mobile sign-in button gradient, font normalization
- `src/components/auth/AuthModal.css` — form overflow fix at 640px, legal terms button styling, `.legal-notice` and `.legal-accepted-notice`
- `src/components/RegionalMap/MapSidebar.jsx` — compact rewrite: 240px sidebar, left-aligned layer toggles, climate zone layer support
- `src/components/RegionalMap/RegionalMap.css` — sidebar compacted (12px fonts, inline horizontal legend, tighter spacing)
- `src/components/RegionalMap/index.jsx` — lazy-load layers on first toggle, climate zone layer + click handler, new state/effects for zone opacity/visibility
- `src/components/climate/PublicClimateContainer.jsx` — shortened demo CTA text
- `src/components/climate/PublicClimate.css` — demo CTA `white-space: normal` fix
- `src/components/climate/climate-mobile-responsive.css` — chart areas maximized (heights increased, padding stripped, headers/controls tightened)
- `src/styles/mobile-responsive.css` — 44px touch targets at 768px, scroll snap, `!important` cleanup throughout

#### Backend
- `backend/db/models/climate.py` — added `geometry = Column(Geometry('MULTIPOLYGON', srid=4326))` to `ClimateZone`
- `backend/db/models/seasonal_stats_submission.py` — **new** data capture model (zone, variety, harvest date, selected vars, results, FK to public_user)
- `backend/api/v1/public_climate_zones.py` — **new**: `GET /geojson` (zone boundaries) + `GET /{slug}/blocks` (spatial intersection)
- `backend/api/v1/seasonal_stats.py` — **new**: `POST /calculate` (no auth required, calculates GDD10, GDD0, avg temp, diurnal range, rainfall, min/max temp, frost days, hot days from daily data; captures submission)
- `backend/main.py` — registered `public_climate_zones` and `seasonal_stats` routers
- `backend/migrations/add_geometry_to_climate_zones.sql` — adds geometry column + spatial index + `seasonal_stats_submissions` table

---

### Architecture Decisions

- **Font system**: All `pt` units eliminated from insights CSS. New CSS custom property scale (`--font-xs` 12px through `--font-3xl` 32px) in `:root`
- **Lazy loading**: Map (Mapbox GL ~200KB gzip) only loads on `/map` route. Regions/GIs/Climate Zones layers load on first toggle, not on map init. Only blocks load by default.
- **Seasonal stats auth model**: Widget form requires sign-in (uses `getZonesWithData` which needs auth for zone list). Embed iframe (`/widget/seasonal`) is fully public — calls `POST /calculate` with `HTTPBearer(auto_error=False)` so no token needed. Data capture records `public_user_id` when available, `NULL` for anonymous embed hits.
- **Climate zone geometry**: Added to existing `ClimateZone` model (not a new table). Spatial index for fast intersection queries. Block highlighting uses `ST_Intersects` against zone boundary.
- **Variety field**: Free text input (not a DB lookup). Stored as-is in submissions table for modelling. Displayed as-is on result card and embed.

---

### DB Migrations Needed
Run against RDS before deploying:
```sql
-- From: backend/migrations/add_geometry_to_climate_zones.sql

-- 1. Climate zone geometry column
ALTER TABLE climate_zones ADD COLUMN IF NOT EXISTS geometry geometry(MULTIPOLYGON, 4326);
CREATE INDEX IF NOT EXISTS ix_climate_zones_geometry ON climate_zones USING GIST (geometry);

-- 2. Seasonal stats submissions table
CREATE TABLE IF NOT EXISTS seasonal_stats_submissions (
    id SERIAL PRIMARY KEY,
    public_user_id INTEGER REFERENCES public_users(id),
    zone_slug VARCHAR(100) NOT NULL,
    variety VARCHAR(100),
    harvest_date DATE NOT NULL,
    selected_variables JSONB,
    results JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_seasonal_stats_submissions_user ON seasonal_stats_submissions (public_user_id);
CREATE INDEX IF NOT EXISTS ix_seasonal_stats_submissions_zone ON seasonal_stats_submissions (zone_slug);
```
