# Map points of interest + map printing

**Scoping doc, 2026-08-17. No code written.**

Two requests, scoped together because they touch the same file and the second one is what makes
the first one *worth* doing — a POI you can't put on a printed map is half a feature.

> Pete: *"a free drawing tool for Maps where people can add other non-block or spatial-area points
> of interest. And an ability to print maps to various outputs with options to have various layers
> visible or not."*

---

# Part A — Points of interest

## A1. What exists today

**The drawing engine is already there.** `hooks/useDrawingController.js` wraps MapboxDraw with a
full custom style set, and `MapsPage.jsx` already runs a `drawMode` state machine through
`idle | draw_polygon | draw_spatial | split | edit | draw_property | edit_property_geometry`,
with a `DrawingToolbar`, a draft preview (`showDraft`/`clearDraft`) and a `freeze()` that stops
Draw eating clicks.

It exposes `startDrawPolygon()` and `startDrawLine()`. **It does not expose point drawing** —
but only because nothing asked for it. MapboxDraw ships `draw_point` natively; wiring it is one
callback and one toolbar button. The controller's `line_string` support is already built and
currently unused by any flow, which is a hint that lines were anticipated.

So the *drawing* is cheap. The question is entirely **where the feature is stored**.

## A2. Where POIs should live — three candidates

Pete's framing ("non-block or spatial-area") already rules out the two obvious homes, and the
data agrees.

| Candidate | Why it looks right | Why it isn't |
|---|---|---|
| **`SpatialArea`** | Purpose-built for non-block map geometry, has `area_type`, `company_id`, parent/child nesting | **`geometry` is `Geometry('POLYGON')` — it physically cannot hold a point.** `area_hectares` is meaningless for a POI. And `tasks.spatial_area_id` is an *alternative* to `block_id`, not a refinement — so anything stored here inherits an either/or assumption it shouldn't have. Prod holds **2 rows** total (one orchard, one paddock). |
| **`Asset`** | **Already has `location_point` (POINT) and `location_geometry` (generic GEOMETRY, for "irrigation, fences")** and a live map layer (`useAssetsLayer.js`) | An Asset drags in calibration schedules, maintenance, depreciation and asset permissions. A gate, a spring, a slip or a wasp nest is not an asset with a service history. Prod: **11 assets, 1 with a point, 0 with geometry** — the layer is effectively empty. |
| **New `map_features` table** ✅ | Geometry-agnostic from the start, no inherited lifecycle, no either/or, purpose-matched to "annotation" | One more geometry table to maintain |

**Recommend the new table.** The deciding argument is semantic, not technical: a POI is
**annotation**, and every existing candidate is a **managed entity**. Overloading either one
means every future asset query has to remember to exclude the gate posts.

`Asset.location_geometry` being a *generic* `GEOMETRY` column is worth noting as prior art
though — it's the pattern to copy, not the table to reuse.

## A3. Proposed model

```
map_features
  id             serial PK
  company_id     FK companies(id) NOT NULL, indexed
  property_id    FK properties(id) NULL, indexed     -- for property scoping; see below
  feature_type   varchar(40) NOT NULL, indexed       -- see vocabulary
  name           varchar(120) NOT NULL
  description    text NULL
  geometry       Geometry('GEOMETRY', srid=4326) NOT NULL   -- POINT | LINESTRING | POLYGON
  style          jsonb NULL                          -- {icon, colour} — user choice, bounded
  is_active      boolean NOT NULL DEFAULT true
  created_by_id  FK users(id) NULL
  created_at / updated_at
  INDEX GIST (geometry)
```

**A generic `GEOMETRY` column, not three tables and not a POINT column.** Pete asked for points,
but "free drawing tool" plus an existing unused `startDrawLine()` says lines are next (a race,
a drain, a fence line) and polygons after that (a slip, a frost pocket, a no-spray buffer). One
column covers all three, MapboxDraw already draws all three, and Mapbox GL styles by
`$type` natively.

**Scope it to `property_id`, not just `company_id`.** Grow already gates blocks, tasks,
observations, assets, risks and incidents through `get_visible_property_ids()` in
`property_service.py`. A POI layer that ignores it would be the one map layer showing a
contractor things they shouldn't see. Nullable for company-wide features, but the visibility
check must handle NULL explicitly rather than by accident.

### Starter vocabulary (`feature_type`)

Keep it a `varchar` with an app-level list, **not a Postgres ENUM** — `vineyard_blocks.status`
is a plain `VARCHAR(20)` for exactly this reason, and adding a POI type shouldn't need a
migration or an `ALTER TYPE`.

`access` (gate, ford, culvert) · `hazard` (slip, bluff, wasp nest, powerline) ·
`infrastructure` (pump, tank, valve, shed, weather station) · `water` (dam, bore, trough) ·
`amenity` (toilet, smoko shed, parking) · `note` (free annotation)

### One thing worth checking before building

`hazard` overlaps with the existing `SiteRisk` model, which already has a
`spatial_area_id` and a map layer (`useRisksLayer.js`). **A hazard POI and a site risk must not
become two competing registers** — WorkSafe reporting keys off `SiteRisk`. Either exclude
`hazard` from the POI vocabulary and send those to `SiteRisk`, or make the POI a lightweight
marker that can be *promoted* to a `SiteRisk`. **Pete's call.** My preference is to ship without
`hazard` and see whether anyone asks — the compliance register should stay singular.

Ship without hazard as these will be aptured in site_risk

## A4. Known trap

**The Maps V2 touch-click bug applies directly.** MapboxDraw suppresses `tap → click`, so any
`map.on('click')` handler is dead on touch and has to be bridged via `touchend`. The existing
`freeze()` exists precisely because of this. A POI layer adds new click targets, so it must go
through the same bridge — and be tested on an actual tablet in the field, not a desktop with a
touch emulator.

---

# Part B — Printing and export

## B1. The finding that shapes everything

```js
// hooks/useMapbox.js:83
const m = new mapboxgl.Map({
  container: containerRef.current,
  style: DEFAULT_STYLE.url,
  ...
  antialias: true,
  // no preserveDrawingBuffer
});
```

**`preserveDrawingBuffer` is not set.** Without it, `map.getCanvas().toDataURL()` returns a blank
image — the WebGL buffer is already cleared by the time you read it. This is *the* classic
Mapbox export failure, and it fails silently: you get a valid PNG of nothing.

There is also **no PDF or canvas library anywhere in the project**. Backend has Pillow only; web
has `mapbox-gl`, `mapbox-gl-draw`, `mapbox-gl-geocoder` and `@turf/turf`, and no
`jspdf`/`html2canvas`/`file-saver`.

### Don't just flip the flag

Setting `preserveDrawingBuffer: true` on the interactive map taxes **every frame of every pan
and zoom**, for a feature used occasionally. And it still gives you the wrong output: the print
is whatever size and DPI the browser window happens to be.

**Render exports from a second, off-screen map instance** created on demand:

```
export requested
  → build a detached container at the target pixel size
  → new mapboxgl.Map({ preserveDrawingBuffer: true, ... }) into it
  → apply the same style + the layer set the user ticked
  → fitBounds to the requested extent
  → wait for 'idle'   (NOT 'load' — 'load' fires before tiles finish)
  → toDataURL / toBlob
  → destroy the map
```

This gets print-resolution output, leaves the interactive map untouched, and makes "print the
current view" and "print this block at A3" the same code path with different bounds. It costs
more than the one-line flag and is the right call anyway.

## B2. Layer selection

Layer visibility today is **six independent booleans** in `MapsPage.jsx`:

```js
showRisks, showSpatialAreas, showParcels, showTasks, showObservations, showAssets
```

plus blocks, which are always on. Each is passed positionally into its `use*Layer` hook.

A print dialog needs to enumerate layers, show them with names, and apply a *different* set to
the export than to the screen. Six loose booleans can't be enumerated. **Lift them into one
keyed object** — `layerVisibility: { risks: true, parcels: false, ... }` — with a small
registry of `{ id, label, icon }`.

There is already a precedent to copy: `components/builder/layerRegistry.js` does exactly this
for the Map Builder layers, with `{ id, name, icon, category, status }`. Extend that pattern to
the management layers rather than inventing a second one.

This refactor is worth doing **whether or not printing ships** — it's the same change that would
let layer visibility persist across reloads, or be saved as a named view.

## B3. Output formats

| Output | Route | Effort | Verdict |
|---|---|---|---|
| **PNG** | Off-screen render → `toBlob` → download | Low | **Ship first.** Covers most real use — paste into an email, a report, a contractor brief. |
| **PDF** | PNG → `jsPDF.addImage` with page size + orientation | Low once PNG works | Ship second. One dependency. |
| **Browser print (`@media print`)** | CSS only | Low to start, high to finish | **Skip.** WebGL canvases and print stylesheets fight, page breaks are unpredictable, and you don't control DPI. Looks cheapest, isn't. |
| **GeoJSON / Shapefile** | Backend, from the geometry tables | Medium | Different feature (data export, not map print). Don't bundle it — the request is a *picture*. |

### Map chrome that must be composited

A printed map is not just the map. Draw the map canvas onto a larger canvas and composite:

- **Title + date** — a map with no date is useless in a compliance file six months later
- **Legend** — only for the layers actually ticked, or it lies
- **Scale bar** — Mapbox's on-screen `ScaleControl` is a DOM element, not canvas; it must be
  redrawn onto the export
- **North arrow** — needed as soon as anyone rotates the map
- **Mapbox attribution** — **not optional.** Mapbox's terms require attribution to remain on
  exported and printed imagery. It is also a DOM element, so it must be composited in
  deliberately. Getting this wrong is a licence breach, not a cosmetic bug.

### Size limits

Browser canvas dimensions are GPU-capped (commonly 4096-16384 px per side, and some mobile GPUs
are far lower). A3 at 300 dpi is ~3508 × 4961 px — inside most limits but not all. **Clamp the
requested size, and degrade to a lower DPI with a visible notice** rather than producing a
truncated or blank image. Test on the oldest tablet anyone actually uses.

## B4. Suggested phasing

| # | Scope | Notes |
|---|---|---|
| **1** | Lift the six booleans into a keyed `layerVisibility` object + a layer registry | Standalone value; unblocks everything below |
| **2** | Off-screen export map + **PNG** download at screen bounds, current layers | The core mechanism. Prove `idle` and attribution first. |
| **3** | Print dialog — paper size, orientation, DPI, title, per-layer tick list | Where it becomes a feature rather than a button |
| **4** | Composited chrome — legend, scale bar, north arrow | |
| **5** | **PDF** via jsPDF | One dependency, small |
| **6** | Saved map views (named layer sets + extent) | Falls out of phase 1 almost free; only worth it if asked for |

---

# Part C — How the two interact

They are independent builds but they land in the same file, and there's a sequencing point worth
taking:

- POIs (Part A) become **one more layer** in the registry from Part B phase 1. Building POIs
  *after* that refactor means the layer wires itself in; building them before means wiring them
  twice.
- **Recommended order: B1 → A → B2+.** The registry refactor is small, unblocks both, and is
  worth doing on its own merits.
- A POI's whole point is often to be *on a printed map* handed to a contractor. Shipping POIs
  with no way to print them is the half-feature version.

## Open questions for Pete

1. **Does `hazard` belong here, or in `SiteRisk`?** (§A3) — the compliance register should
   probably stay singular. No hazzard here - stays in risks
2. **Mobile:** view-only, or capture-in-field? Dropping a pin on a gate while standing at it is
   the natural gesture, but it's a separate build and needs the offline write queue. View-only
   first would be my recommendation. agreed wiht recommendation
3. **Who can create POIs?** Managers only, or field users too? Web is managers/admins only today
   (`company_user` + `contractor` get `MOBILE_ONLY` 403), so "field users can add POIs" implies
   the mobile build in Q2. Web only
4. **Paper sizes** — A4/A3 enough, or is anyone printing A1/A0 for a shed wall? lets allow A0 to A4

---

# Execution record

## Phase 1 — layer registry refactor. DONE 2026-08-17.

New `components/managementLayerRegistry.js`, modelled deliberately on the existing
`builder/layerRegistry.js` so there is one pattern for "what layers exist", not two. It owns layer
*identity* only (id, label, icon, colour, default, adminOnly, alwaysOn); data fetching and Mapbox
wiring stay in the one-per-layer `use*Layer` hooks.

`MapsPage.jsx`: the six loose booleans are now one keyed `layerVisibility` object with
`toggleLayer(id)` / `setLayerVisible(id, v)`. Read-side aliases (`const { risks: showRisks, … } =
layerVisibility`) keep the ~40 sidebar call sites untouched, so the diff is 40 insertions /
29 deletions rather than a rewrite of a 1,300-line file.

`MapLegend` now receives `layerVisibility` directly instead of a hand-built object literal — it
does keyed lookups and ignores keys it doesn't know, so that second list is gone rather than left
to drift.

`blocks` is in the registry as `alwaysOn: true`: the sidebar ignores it exactly as before, but the
print tick-list can enumerate it. **No behaviour change in this phase**, which was the point.

Verified: parses under esbuild; no `setShow*` call sites remain; UTF-8 intact (19 em-dashes, no
mojibake) after the scripted rewrite.

## Phase 2 — POI backend. DONE 2026-08-17, migration NOT applied.

- `backend/db/models/map_feature.py` — `map_features`, generic `Geometry('GEOMETRY', 4326)`.
- `backend/schemas/map_feature.py` — create/update/response.
- `backend/api/v1/map_features.py` — GeoJSON + list + get + create + patch + delete.
- Registered in `db/models/__init__.py` and `main.py` under `/api/map-features`.
- `alembic/versions/add_map_features.py`.

Decisions taken, per the answers above:
- **No `hazard` feature type.** Vocabulary is `access`, `infrastructure`, `water`, `amenity`,
  `note`. Hazards stay in `SiteRisk`; the schema rejects `hazard` outright.
- **Web-only creation**, so nothing here touches the mobile offline write queue.
- Property-scoped via `build_scope_filter`, mirroring `build_asset_scope_filter` in `assets.py`.
  **The NULL branch is the one that matters** — a plain `property_id IN (...)` silently drops
  every company-wide feature, which is the default for anything drawn without a property selected.
- Tenancy is enforced server-side: a non-admin cannot create into another company whatever
  `company_id` they send.
- Delete is a **soft delete** by default (`is_active = false`), with `?hard=true` to purge.
- Geometry is validated at the edge to `Point | LineString | Polygon`. The column is generic, so
  Postgres would otherwise happily accept a `GeometryCollection` that no part of the UI can draw
  or edit.

### Two things that bit, recorded so they don't bite twice
- **Naming the relationship `property` fails at class-definition time** with
  `TypeError: '_RelationshipDeclared' object is not callable` — it shadows the `@property`
  decorator used just below for `geometry_geojson`. `Asset`, `Incident` and `SiteRisk` all use
  `assigned_property`; so does this.
- **geoalchemy2 does not create the GiST index** when the table is built through alembic rather
  than `metadata.create_all()`. It is created explicitly in the migration.

### Migration order — read before applying
Chain is now `surface_cv_units → zone_cell_mask → add_map_features → drop_blockchain_tables`,
single head.

`add_map_features` was deliberately re-pointed to sit **before** `drop_blockchain_tables`. The
blockchain drop is the only migration with a deployment precondition (its code removal must ship
first), so it belongs at the tip — which makes **`alembic upgrade add_map_features` a valid
stopping point** that gets the POI table in without touching blockchain.

### Verified
FastAPI boots, 598 routes, all six `/api/map-features` paths present, `configure_mappers()` clean.
Schema validators tested directly: a valid point passes; `MultiPolygon`, `GeometryCollection`,
empty coordinates and `feature_type=hazard` are all rejected; `MapFeatureUpdate` without geometry
round-trips through `exclude_unset` correctly.

## Next — not built
Phase 3: frontend. Shared service method, `useMapFeaturesLayer`, `draw_point` wired into
`useDrawingController` (one mode string — MapboxDraw ships it), a create/edit form, and the
registry entry. **The touch-click bridge (§A4) applies to the new click targets** and needs a real
tablet.
Then Part B phases 2-5: off-screen export map → PNG → print dialog (A0-A4) → chrome → PDF.

## Phase 3 — POI frontend. DONE 2026-08-17. UNTESTED in a browser.

### New files
- `packages/shared/src/api/mapFeaturesService.js` (+ export in `api/index.js`)
- `maps-v2/components/mapFeatureTypes.js` — the POI vocabulary in one place
- `maps-v2/hooks/useMapFeaturesLayer.js`
- `maps-v2/components/drawing/MapFeatureForm.jsx`

### Edited
- `useDrawingController.js` — `startDrawPoint()` **and three point styles** (see the trap below)
- `utils/mapIcons.js` — 5 glyphs + 5 `MARKER_SPECS`
- `components/managementLayerRegistry.js` — `mapFeatures` entry, default ON
- `components/MapLegend.jsx` — POI markers, driven off `MAP_FEATURE_TYPES`
- `components/drawing/DrawingToolbar.jsx` — **Add POI** button + `draw_poi` mode label
- `MapsPage.jsx` — hook, `draw_poi` draw mode, create/edit form, sidebar panel with fly-to,
  popup with Edit, and the new layer ids in `INTERACTIVE_LAYERS`

### THE TRAP THAT WOULD HAVE WASTED A FIELD TEST
`useDrawingController` passes a custom `styles` array to MapboxDraw, and **a custom styles array
replaces the defaults wholesale**. There was no point style in it — only polygon, line, vertex and
midpoint. So `draw_point` would have succeeded and rendered **nothing**: the user taps, no dot
appears, and it looks exactly like the tap was ignored. The vertex styles don't cover it either,
because they filter on `meta='vertex'` and a drawn point is `meta='feature'`.

Added `gl-draw-point-inactive`, `gl-draw-point-active` and `gl-draw-point-static`.

### Decisions taken while building
- **Toolbar exposes the point tool only.** Lines and polygons work end to end — one generic
  geometry column, and the layer renders all three — but a single "Add POI" button was the ask.
  Adding a line/area tool later is one button and one draw mode: no schema, API or layer change.
- **No zoom-opacity ramp on POI markers**, unlike the assets layer. A POI is often what you zoom
  *out* to find ("where's the gate?"), so fading it below z14 would hide it exactly when wanted.
  The label is still zoom-gated so dense sites don't turn to soup.
- **No geometry editing.** To move a POI, delete it and place it again. Editing geometry means a
  direct-select round trip and a second draw mode for a rare action.
- Delete is soft, behind a two-step confirm in the form.
- The property picker is **hidden when `properties` is empty** — `MapsPage` fetches properties for
  admins only, so a plain manager would otherwise see a dropdown whose only option is
  "company-wide", which reads as broken rather than as a deliberate default. See the limitation
  below.
- `''` from the property `<select>` is converted to `null` before send; the API is
  `Optional[int]` and would 422 on an empty string.

### Verified
Every touched file parses; `MapsPage.jsx` **bundle-resolves** (415 kb, no errors — only
pre-existing `import.meta` warnings from the builder layers). Backend still boots, 598 routes.
Icons register on `style.load` *before* `mapReady` flips, and the layer effect gates on
`mapReady`, so a symbol layer can never reference an unregistered image.

### Known limitation
**A non-admin manager cannot scope a POI to a property** — their features are always company-wide.
`isAdmin` is `auxein_admin || company_admin`, and `fetchProperties` returns early for anyone else.
Fixing it means fetching properties for all web users, which also affects the admin-only Properties
panel — a deliberate call, not an oversight. Company-wide is the sane default regardless.

### Test checklist — NONE of this has been run
- [ ] **Add POI** appears on the toolbar; clicking it says "Click on the map to place a point".
- [ ] Click the map → **a dot appears** (this is the trap above) → form opens.
- [ ] Save → marker renders with the right glyph and colour for its type; name label shows at z14+.
- [ ] All five types render a distinct, legible glyph — check `water` and `note` especially,
      they are the two hand-built curved/complex glyphs.
- [ ] Sidebar shows **Points of Interest** with a count; clicking a row flies to it.
- [ ] Eye toggle hides/shows the layer; legend gains/loses the POI block with it.
- [ ] Click a POI → popup with type badge, name, description, **Edit** → form opens populated.
- [ ] Edit name/type → saves and the marker updates without a page reload.
- [ ] Delete → two-step confirm → marker disappears.
- [ ] **Cancel mid-draw** leaves no orphan dot on the map.
- [ ] **TABLET, not a desktop emulator:** tapping a POI opens the popup. This is the
      MapboxDraw tap→click suppression (§A4); the bridge is generic and should just work, but it
      is the single most likely thing to be broken.
- [ ] A second company sees none of the first's POIs.
- [ ] Empty state: a company with no POIs shows the "None yet" hint, not a blank panel.

### Still not built
Part B phases 2-5 — off-screen export map → PNG → print dialog (A0-A4) → composited chrome
(legend, scale bar, north arrow, **Mapbox attribution**) → PDF. Phase 1's registry is what these
consume: `MANAGEMENT_LAYERS` + `layerVisibility` are already enumerable, so the print tick-list is
a map over the registry rather than a new hand-written list.

---

## Part B — printing. BUILT 2026-08-17. UNTESTED in a browser.

### New files
- `maps-v2/utils/mapExport.js` — off-screen render, paper sizes, canvas clamping, download
- `maps-v2/utils/mapChrome.js` — title, legend, scale bar, north arrow, attribution
- `maps-v2/utils/pdfExport.js` — dependency-free single-page PDF
- `maps-v2/components/print/PrintDialog.jsx`

### Edited
- `managementLayerRegistry.js` — every entry gained `mapLayerIds`
- `DrawingToolbar.jsx` — **Print** button
- `MapsPage.jsx` — dialog state + render
- `db/models/map_feature.py` — dropped the redundant explicit GiST index

### How the render works
`renderMapToCanvas()` clones the LIVE map's style via `map.getStyle()` — which carries every
source (GeoJSON data inline) and layer currently on screen — then strips the layers the user
unticked, and mounts it into a throwaway `mapboxgl.Map` at the target pixel size with
`preserveDrawingBuffer: true`. Waits for **`idle`** (not `load`), copies the WebGL canvas into a
plain 2D canvas, destroys the map.

Cloning the style rather than re-adding layers by hand means the export can never drift from what
is on screen — there is no second rendering path to keep in step.

Three things that would each have produced a broken export:
- **`registerMapIcons(exportMap)` on `style.load`.** Marker images live outside the style JSON, so
  a cloned style has none of them — every symbol layer (POIs, tasks, observations, assets) would
  render nothing and the markers would simply be absent.
- **`idle`, not `load`.** `load` fires once the style and first tiles are in; reading the canvas
  then yields a half-drawn map.
- **`gl-draw-*` and `v2-draw-draft*` layers are stripped.** Editing chrome must never print.

### Chrome
All of it is DOM on screen (Mapbox's ScaleControl and attribution are HTML, the legend is React),
so none of it exists in the WebGL canvas and all of it is redrawn onto the 2D canvas. Furniture
scales off canvas width so an A4 and an A0 look like the same design.

- **Scale bar** is computed against the EXPORT canvas, not the screen — otherwise it is wrong by
  the ratio between screen and paper size, which is the whole point of printing large.
- **North arrow** rotates by `-bearing`; without that it lies the moment anyone rotates the map.
- **Legend** lists only the layers actually rendered, and expands POIs to one row per type.
- **Attribution is unconditional.** There is no toggle. Licence condition, not a preference.

### PDF without a dependency
The project has no PDF library and adding one means a lockfile change and an npm install before
anyone can build. A single-full-page-image PDF does not need one: PDF embeds a JPEG byte-for-byte
via `/DCTDecode`, so `pdfExport.js` copies the canvas JPEG in verbatim — no deflate, no zlib. About
60 lines of object plumbing and a correct xref table.

**Validated, not assumed:** the identical algorithm was ported to Python and the output parsed with
pypdf — 1 page, MediaBox `[0 0 1190.55 841.89]` (= A3 landscape, correct), one `/DCTDecode`
`/DeviceRGB` XObject at the right pixel dimensions, embedded JPEG byte-intact (`FFD8` header).

It is deliberately NOT a general PDF writer: one page, one image, filling the page. If PDFs ever
need text, vector overlays or multiple pages, stop extending it and take jsPDF.
PNG stays the lossless option; JPEG-in-PDF means slight artefacts on labels and outlines.

### Canvas clamping — verified numerically
Browsers cap canvas/renderbuffer size, and tablet GPUs are far lower than desktop, so the ceiling
is a conservative 8192 px on the longest side. Measured:

| | 96 dpi | 150 dpi | 300 dpi |
|---|---|---|---|
| A0 | 4494×3179 | 7022×4967 | **clamped → 8192×5794 (175 dpi)** |
| A1 | 3179×2245 | 4967×3508 | **clamped → 8192×5786 (247 dpi)** |
| A2 | 2245×1587 | 3508×2480 | 7016×4961 |
| A3 | 1587×1123 | 2480×1754 | 4961×3508 |
| A4 | 1123×794 | 1754×1240 | 3508×2480 |

Only A0 and A1 at 300 dpi clamp. **The dialog says so explicitly** rather than quietly handing back
a lower-resolution file than was asked for.

### The duplicate index — found and fixed
`add_map_features` created `ix_map_features_geometry` explicitly, on the assumption geoalchemy2
does not build one via alembic. **That assumption was wrong** — it creates
`idx_map_features_geometry` regardless, so prod ended up with two identical GiST indexes on the
same column. New migration `drop_dup_geom_index` drops the hand-written one; the model no longer
declares it. **Applied to prod 2026-08-17**, verified: one GiST index remains, 2 rows intact.

### Test checklist — NONE of this has been run in a browser
- [ ] **Print** button opens the dialog.
- [ ] Export A4 landscape PNG at 150 dpi → downloads, opens, **is not blank**
      (blank = `preserveDrawingBuffer` regression).
- [ ] The image shows the same basemap, blocks and markers as the screen — **check markers
      specifically**, they are the icon-registration failure mode.
- [ ] Untick Tasks in the dialog → that layer is absent from the file but **still on screen**.
- [ ] Legend lists only ticked layers; POIs appear as one row per type.
- [ ] Scale bar reads a sane distance — sanity-check it against a known block width.
- [ ] Rotate the map, export → **north arrow points to true north**, not up the page.
- [ ] Attribution present bottom-right on every export.
- [ ] A0 @ 300 dpi → the clamp warning appears and names the effective dpi.
- [ ] Export PDF → opens in a viewer at the right paper size, image fills the page.
- [ ] Nothing from an active draw operation appears (no dashed draft, no vertex handles).
- [ ] Export while offline/slow → times out with a message rather than hanging forever.
- [ ] Tablet: the render does not blow memory at A2+.

### Still not built
Saved map views (Part B phase 6) — falls out of the registry nearly free, only worth it if asked
for. Print-by-bounds ("print this block at A3") — `renderMapToCanvas` already accepts a `bounds`
argument, but nothing calls it with one yet; it needs a "print this block" entry point.
