# Auxein Taste — Personal Map Layers (scope proposal)

**Status:** PROPOSAL — nothing built. Authored 2026-09-18.
**Decision asked for:** approve / amend the data model and the sharing model before any code.

---

## 0. Why this document exists

Maps have **never been scoped for Taste**. Verified 2026-09-18 against all four plan
docs and the whole `packages/taste` + `backend_taste` tree:

- No mention of maps, map layers, drawn geometry, tiles or basemaps in
  `AUXEIN_TASTE_MVP_SPEC.md`, `TASTE_BUILD_SPEC.md`, `TASTE_DEV_PLAN.md` or
  `wide_schema_mapping.md`.
- No map library in `packages/taste/package.json`.
- `backend_taste` has **zero** PostGIS/GeoAlchemy2 usage — geography is discrete
  text only.

What the specs *do* say is the deliberate opposite:

> "PostGIS extension available but **not used in v1** beyond being present for later
> migration." — MVP spec §Architecture
> "Geo as discrete fields, never one free-text blob." — BUILD_SPEC, Non-negotiables

And sharing is excluded twice, explicitly:

> "**No sharing/permissions in v1** — entries are owner-scoped." — Story 4.5
> "**No realtime/invites/sharing in v1** — seams only." — Non-negotiables

So this proposal adds scope on **two** axes the app has no concept of today:
spatial data, and a visibility model. That is the main reason to write it down
before building it.

## 1. What is being asked for

Users create their own map layers — draw or import features (a vineyard block, a
sub-region boundary they disagree with, a producer pin, a trip route) — and either
keep them private or share them.

## 2. Where it hangs off what already exists

Two existing seams make this cheaper than it looks:

| Existing thing | How maps uses it |
|---|---|
| `taste.regions` (151 rows, seeded) with a reserved **`gi_id`** column | The anchor between a user's drawn feature and the canonical geography tree. Already there, currently unused. |
| BUILD_SPEC's polymorphic `link` table, with `'geography'` already a valid `*_type` | A map feature links to notes/wines/knowledge entries with no new join tables. **Not built yet — this ships with Epic 4.** |
| House map stack: `mapbox-gl` ^3.12, `@mapbox/mapbox-gl-draw` ^1.5, `@turf/turf` ^7.2 | Already used in `packages/web` (maps-v2), `packages/insights` (SurfaceMap) and mobile (`@rnmapbox/maps`). No new vendor decision. |
| `VITE_MAPBOX_TOKEN` convention | Same env var name as `packages/insights`. |

**Dependency on Epic 4:** bidirectional linking is the thing that makes a map layer
worth more than a drawing. Epic 4 is entirely unbuilt. Maps can ship standalone
(draw + view + share) but the "click a region, see every note from it" payoff needs
the `link` table. Sequence accordingly.

## 3. Data model (proposed)

Two new tables in schema `taste`. Both carry the standard `SyncMixin` columns
(`id` client-UUID, `user_id` loose int, `created_at`, `updated_at`, `version`,
`deleted`) so they behave like every other Taste entity.

### `taste.map_layer`
| Column | Type | Notes |
|---|---|---|
| `name` | text | user-facing |
| `description` | text | optional |
| `visibility` | text | `private` \| `link` \| `public` — see §4 |
| `share_slug` | text, unique, nullable | populated only when visibility ≠ private |
| `style` | JSONB | stroke/fill/opacity/icon defaults for the layer |
| `basemap` | text | mapbox style id; default satellite |
| `region_id` | text, nullable | optional anchor to `taste.regions.id` |

### `taste.map_feature`
| Column | Type | Notes |
|---|---|---|
| `layer_id` | text, indexed | FK-by-convention to `map_layer.id` (no hard FK, matches house style) |
| `name` | text | |
| `kind` | text | `point` \| `line` \| `polygon` |
| `geom` | `geometry(Geometry, 4326)` | **PostGIS**, see below |
| `properties` | JSONB | free per-feature attributes |
| `region_id` | text, nullable | resolved geography, if any |

**GeoJSON-in-JSONB vs PostGIS geometry — recommend PostGIS.** Both work for
draw-and-display. PostGIS wins because:
- the whole point of `regions.gi_id` is a future spatial resolve (which region does
  this polygon fall in?) — impossible in JSONB without shipping the maths client-side;
- PostGIS is already on the RDS and `GeoAlchemy2==0.17.1` + `shapely==2.1.0` are
  already pinned in `backend/requirements.txt`, so it is a known-good house dep;
- it costs one extra line in `backend_taste/requirements.txt` and a
  `CREATE EXTENSION IF NOT EXISTS postgis` guard in the migration.

**Note:** `backend_taste/requirements.txt` currently has *neither* GeoAlchemy2 nor
shapely. This is a real (small) addition to a service that has so far had no
spatial dependency at all.

**Non-negotiable carried forward:** no cross-schema FK from `taste` to any
Insights/Grow table. If a Taste feature is to reference an Insights GI boundary it
does so through the loose `gi_id` string, exactly as `taste.regions` already does.

## 4. Sharing model (the genuinely new part)

Taste today has **no** sharing concept whatsoever — every row is filtered by
`user_id` in `api/crud.py` and that is the entire authorisation model. Three
visibility levels, in ascending order of build cost:

1. **`private`** (default) — current behaviour, no change.
2. **`link`** — anyone with the `share_slug` URL can view, read-only, no auth. This
   is the cheapest useful share and matches a pattern already proven in this repo:
   the Insights embeddable surface widget uses a **server-verified slug grant**
   (see `project_article_surface_widget`). Reuse that shape, do not invent a new one.
3. **`public`** — listed in a browsable gallery. Needs moderation thinking; defer.

**Recommendation: build `private` + `link` only.** Defer `public`.

**Security note that must not be skipped:** a `link`-visibility layer is served to
**unauthenticated** callers. That endpoint must be a separate, explicitly public
route that selects *only* the layer and its features by slug — never the generic
`make_crud_router`, whose owner-scoping is the only thing standing between a user's
data and the internet. Also relevant: `project_httpbearer_403_anonymous` — the
existing auth dependency 403s anonymous callers, so a public route needs its own
dependency, not the default one.

## 5. Frontend shape

- New `packages/taste/src/features/maps/` — `MapsScreen` (list), `MapEditor`
  (draw/edit), `MapView` (read-only, also serves the public share route).
- `mapbox-gl` + `@mapbox/mapbox-gl-draw` + `@turf/turf`, matching `packages/web`.
- **Carry the known footgun forward:** `project_maps_touch_click` — MapboxDraw kills
  tap→click on touch devices; the fix is to bridge via `touchend`. Taste is a
  phone-first PWA, so this bites *harder* here than it did on web. Budget for it.
- **PWA bundle cost is real.** `mapbox-gl` is ~800 KB gzipped. The current Taste
  bundle is ~320 KB total. Maps must be **lazily route-split**, or first paint at a
  tasting gets materially slower for a feature nobody uses mid-tasting.

## 6. Suggested phasing

| Phase | Deliverable |
|---|---|
| **M1** | Migration (`postgis` guard + both tables), GeoAlchemy2/shapely deps, owner-scoped CRUD, no UI. |
| **M2** | `MapsScreen` + `MapEditor`: draw point/line/polygon, style, save. Lazy-loaded route. |
| **M3** | `visibility` + `share_slug` + the public read-only slug route + `MapView`. |
| **M4** | Link map features ↔ notes/wines. **Blocked on Epic 4's `link` table.** |
| **M5** | Spatial resolve: `ST_Contains` a feature against `regions`, populate `region_id`/`gi_id`. |

## 7. Open questions for Pete

1. **Is this for you or for users?** A personal MW study aid ("where have I tasted
   from?") is M1–M2 and needs no sharing at all. A shareable community feature is
   M3+ and pulls in moderation, abuse and hosting-cost questions.
2. **Import, or draw only?** GeoJSON/KML import is cheap to add at M2 and is how
   most real boundary data would actually arrive. Draw-only is a weaker feature.
3. **Does this outrank the capture-flow work?** Stated priority today is that
   tastings cost too much energy. Maps does not help that. Recommend maps sits
   behind the MW capture redesign.
4. **Mapbox billing** — Taste would be a fourth product on the same token. Worth
   confirming the map-load tier before a public/shareable surface exists.

## 8. What this does NOT propose

- No offline/cached tiles. Taste has been online-only since the 2026-06-28
  rearchitecture; maps does not reopen that.
- No editing of the canonical `taste.regions` tree by users. User geometry lives in
  `map_feature` and *references* regions; it never mutates reference data.
- No realtime/multi-user editing of a shared layer. Share is read-only.
