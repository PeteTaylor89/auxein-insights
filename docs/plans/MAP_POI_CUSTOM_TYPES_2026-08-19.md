# Map POI custom types + icon library — scope

**Scoped 2026-08-19.** Requested by Pete on the 08-19 test sheet, §4: *"for types, can we allow a
free text (create a type) and have a small library of icons the user can choose from?"*

Builds on [MAP_POI_AND_PRINT.md](MAP_POI_AND_PRINT.md), which shipped the POI feature on 08-17.
**Web only** — `packages/mobile` has no POI support of any kind, so nothing here touches the app.

---

## 1. What exists today

POIs work, but their vocabulary is closed in three places at once:

| Layer | File | State |
|---|---|---|
| DB column | `map_features.feature_type` | `String(40)` — **already open**, no Postgres ENUM |
| API validation | `backend/schemas/map_feature.py` | `class FeatureType(str, Enum)` — **closed, 5 values** |
| Client vocabulary | `maps-v2/components/mapFeatureTypes.js` | `MAP_FEATURE_TYPES`, 5 entries, static |

The five are `access`, `infrastructure`, `water`, `amenity`, `note`.

Two facts make this much cheaper than it looks:

**The column is already free text.** `db/models/map_feature.py` says so explicitly — *"App-level
vocabulary, NOT a Postgres ENUM. Adding a type should be a code change, not a migration plus an
ALTER TYPE."* So the storage needs no widening. The only thing rejecting free text is the pydantic
enum at the edge.

**`style` JSONB already exists and is dormant.** The model declares
`style = Column(JSONB, nullable=True)  # {icon, colour} — bounded user choice`, and
`MapFeatureBase` accepts it. But `useMapFeaturesLayer.js` contains **zero references to `style`** —
it is stored and never read. The icon choice was anticipated and left unwired. That is where the
per-feature override belongs, and it needs no migration.

**Icons are drawn, not imported.** `maps-v2/utils/mapIcons.js` holds `ICON_DEFS` — hand-authored
stroke instructions (`M/L/Q`, `circle`, `rect`) rendered to canvas and registered as Mapbox images.
The five POI glyphs are deliberately simple geometry rather than transcribed lucide paths, because
*"there is no fill path, so plain M/L/arc shapes read more cleanly at 32px."* An icon library means
adding entries to `ICON_DEFS`, not shipping an asset bundle.

---

## 2. The decision that matters most: no accidental hazard register

`MapFeature` carries an explicit prohibition, repeated in three files:

> There is deliberately no `hazard` feature type. Hazards belong in `SiteRisk`, which is the
> WorkSafe register. Two competing hazard registers would be worse than none.

**Free text drives straight through that.** Nothing stops a user typing "Hazard", "Risk", "Danger"
or "Slip" as a custom type and pinning site hazards on the map — which is precisely the second,
non-compliant hazard register the design refused, except now it looks sanctioned because the user
built it themselves.

The API's current `hazard` rejection is a closed enum. Once the enum opens, that guard evaporates
unless it is replaced deliberately.

**Proposed guard** — a reserved-word check on type creation, matching case-insensitively on the
slug and on common synonyms (`hazard`, `hazards`, `risk`, `risks`, `danger`, `unsafe`, `incident`,
`near miss`). On a match, refuse the type and return a message that names the right home:

> "Hazards belong in the Risk Register so they carry WorkSafe notifiability. Add it under Health &
> Safety → Risks, and it will appear on the map automatically."

That last clause is true — `legendModel.js` already renders `SiteRisk` on the map with its own
`risk` marker, so the user loses nothing.

**DECIDED 2026-08-19 — Pete: block hazard types.** The reserved-word guard ships. The alternative
(allow it, accept two registers) was considered and rejected.

---

## 3. Where custom types live

Two options. **Recommend B.**

### Option A — free text in the column, no type table
Relax the pydantic enum, write whatever the user typed into `feature_type`, put the icon in
`style.icon`. Build the dropdown from `SELECT DISTINCT feature_type`.

*Cheap: no migration, no new endpoints.* But there is no vocabulary object, so: renaming a type
means rewriting every row; a typo ("Waterr") becomes a permanent second type; two people inventing
the same type with different icons get two legend rows; and the type list can only be discovered
from features that already exist, so a company's first POI of a type has nothing to pick from.

### Option B — a `map_feature_types` table  ← recommended
A per-company vocabulary, with the five built-ins as system rows.

```
map_feature_types
  id              PK
  company_id      FK companies.id  NULL = system type, visible to everyone
  slug            String(40)   unique per company (and against system slugs)
  label           String(60)   what the user typed, display-cased
  icon            String(40)   an ICON_DEFS key
  colour          String(7)    hex
  is_active       Boolean      soft delete — a retired type must not orphan its features
  created_by_id   FK users.id
  created_at / updated_at
```

`map_features.feature_type` keeps holding the **slug**, so every existing row stays valid and no
data migration is needed beyond seeding the five system rows. A FK is deliberately *not* added:
the slug is already the join key, and a hard FK would block deleting a type that history still
references.

Gains rename-in-one-place, a stable per-company library, one legend row per type, and a dropdown
that works before the first feature exists.

---

## 4. The icon library

**Size: 50 glyphs — DECIDED 2026-08-19** (raised from 20 the same day, once the grid was real). Enough to cover a vineyard without becoming a picker that needs its own
search field. Suggested set, grouped as the picker would show them:

- **Access** — gate, ford, culvert, bridge, cattle stop, track
- **Structures** — shed, tank, pump, weather station, power pole, workshop
- **Water** — dam, bore, trough, irrigation valve, race
- **Ground** — slip, wet patch, frost pocket, rock, tree
- **Amenity** — toilet, parking, smoko, first aid

Each is a new `ICON_DEFS` entry in `mapIcons.js`, authored as stroked geometry to match the
existing five. **Colour stays a bounded palette**, not a free colour picker — roughly 8 swatches
drawn from the existing type colours, so the map keeps a coherent key and no one picks a yellow
that vanishes on a satellite basemap.

### The two places an icon must be registered
This is where the 08-17 work drew blood, and the same traps apply:

1. **The live map** — `useMapbox.js` calls `registerMapIcons` on style load.
2. **The export** — `mapExport.js` renders from a *second off-screen map* and must
   `registerMapIcons` again on the **cloned style**, because marker images live outside the style
   JSON and do not survive the clone. It also waits for `idle`, not `load`.

An icon that renders on screen and comes out blank on an A1 print is the expected failure mode.

3. **The legend swatch** — `MapLegend.jsx` draws the glyph itself using `GLYPH_FRACTION`,
   `GLYPH_STROKE` and `BADGE_RING_FRACTION`, exported as *proportions* so a 20px screen chip and a
   140px A0 chip are the same drawing. Any new glyph must go through that path, not a bitmap copy.

---

## 5. Work breakdown

### Phase 1 — vocabulary (backend) — **BUILT 2026-08-19, migration NOT applied**
New: `db/models/map_feature_type.py`, `schemas/map_feature_type.py`,
`api/v1/map_feature_types.py`, `alembic/versions/add_map_feature_types.py`.
Changed: `core/permissions.py` (new `map_feature_types` module),
`schemas/map_feature.py` (enum → slug string), `api/v1/map_features.py` (resolver),
`db/models/__init__.py`, `main.py`.
Router is at **`/api/map-feature-types`** — matching `map_features` at `/api/map-features`,
NOT `/api/v1/...` as this doc first said.
Verified: `import main` clean, permission matrix correct (manager create True, user create False,
user read True), and the reserved-word guard blocks Hazard / Water Hazard / Slip Danger / Near
Miss / Risk Area while allowing Cattle Stop, Frost Pocket, Whisky Shed and Brisk Walk Track.
**Migration APPLIED 2026-08-19** (`alembic upgrade add_map_feature_types`, by name — never bare
`upgrade head`). Prod alembic head is now `add_map_feature_types`. Table, all six indexes
(including the partial unique on system slugs) and the five seed rows are in place. The two
`feature_type` values already in use — `water` and `access` — both resolve to system rows, so no
existing POI was orphaned.

**Endpoint suite run against the real session layer, 16/16 pass**, every created row hard-deleted
afterwards (0 company types left behind, 5 system types intact):
create; duplicate label 409; shadowing a system slug 409; hazard guard 400 on create AND on rename;
unknown icon 400; off-palette colour 400; company_user 403; rename keeps the slug
(`Cattle Stop` -> `Cattle Grid` while the slug stays `cattle-stop`); resolve 422 on an unknown
slug; retire removes it from the active list; re-creating a retired type revives the row rather
than colliding; system types refuse both edit and retire.


- Migration `add_map_feature_types`: create the table, seed the five system rows with their current
  slugs, labels, icons and colours from `mapFeatureTypes.js`.
- `db/models/map_feature_type.py`.
- Replace `FeatureType` enum validation with a lookup against system types + the caller's company
  types. Keep returning 422 on an unknown slug.
- `GET/POST/PATCH/DELETE /api/v1/map-feature-types`, company-scoped. Delete is a soft
  `is_active=false`; refuse the system five outright.
- **Reserved-word guard from §2** on create and rename.
- Permission: creating a type is a **manager+** action — **DECIDED 2026-08-19** — not any user who
  can drop a pin, because a vocabulary is shared state. Reading the type list stays open to anyone
  who can see the map, or the picker would be empty for the people who use it most.

### Phase 2 — icon library (web) — **BUILT 2026-08-19**
New: `maps-v2/components/PoiIconPicker.{jsx,css}`.
Changed: `maps-v2/utils/mapIcons.js`, `api/v1/map_feature_types.py` (allow-lists).

- **15 new glyphs**, taking the library to **20** with the five category icons. Stroked geometry
  only, 24×24 — `drawElement` has no fill branch, so a shape relying on fill renders hollow.
  Silhouettes are deliberately far apart: `poiCattleStop` is a barred grid rather than more
  posts-and-rails, because it would otherwise twin with the existing gate glyph.
- **Dynamic marker registration.** `MARKER_SPECS` could not carry these — it pre-bakes one image
  per marker with a hardcoded colour, and 20 icons × 8 colours is 160 combinations. New
  `poiMarkerId(icon, colour)` + `registerPoiTypeMarkers(map, types)` build an image per pair
  actually in use and remember the spec in a registry that `drawMarkerSwatch` now falls back to.
  **That registry is what stops a custom POI leaving a blank row in the legend**, on screen and on
  the printed sheet. `registerPoiTypeMarkers` returns the count of NEW images, which is the signal
  Phase 4 needs to know the `match` expressions must be rebuilt.
- **`ICON_DEFS` is now exported** so the picker renders previews from the same instruction set the
  canvas marker is drawn from, mapped to SVG elements. A picker with its own hand-drawn previews
  drifts from the map and nobody finds out until a sheet is printed.
- **Bounded palette of 8**, no colour picker. No yellow and nothing pale — a light badge with a
  white ring disappears against bare dirt on satellite imagery, which is most of the imagery for
  most of the season.
- Backend `ALLOWED_ICONS` (20) and new `ALLOWED_COLOURS` (8) mirror the client and are enforced on
  create **and** update.
- The CSS sets `padding: 0` on every button explicitly. The app's global
  `button { padding: 8px 16px }` turns square icon buttons into clipped rectangles — this has bitten
  the web app before, so the rule carries a comment saying not to "tidy" it away.

**Raised to 50 glyphs, 2026-08-19** (Pete, after Phase 3). Thirty more across six groups —
Access 10, Structures 11, Water 10, Ground 8, Vineyard 4, Amenity 7. At fifty the binding
constraint stops being "is there a glyph for this" and becomes "can I tell these two apart on a
phone in the sun", so near-neighbours are deliberately pushed apart: the fence is posts-and-wires,
the gate posts-and-rails, the cattle stop a boxed grid — three barrier glyphs, three silhouettes.
The picker grid scrolls at 300px so two groups are visible at once. The backend `ALLOWED_ICONS`
list is generated from the client library rather than retyped, and cross-checked both ways.

Verified: `esbuild` parses `PoiIconPicker.jsx` and `mapIcons.js` clean; library is exactly 50 keys,
no duplicates, every key resolves to an `ICON_DEFS` entry and no `poi*` def is orphaned; client and
backend allow-lists are set-equal in both directions (50 = 50, no diff either way); all CSS custom
properties exist in `theme.css`. **Not rendered in a browser.**

### Phase 3 — type management UI (web) — **BUILT 2026-08-19**
New: `shared/src/api/mapFeatureTypesService.js`, `maps-v2/hooks/useMapFeatureTypes.js`,
`maps-v2/components/MapFeatureTypeManager.{jsx,css}`.
Changed: `shared/src/api/index.js`, `maps-v2/components/drawing/MapFeatureForm.jsx`,
`maps-v2/MapsPage.jsx`, `maps-v2/MapsPage.css`.

- **`useMapFeatureTypes`** is the loader the static array became. It exposes `types`,
  `selectableTypes` (active only — retired ones still draw, they are just not offered),
  `typeBySlug`, `appearanceFor(slug)`, the mutators, and a **`version` counter**. Phase 4 needs
  that counter: a Mapbox `match` expression is baked at `setPaintProperty` time and will not notice
  a new type, so something has to tell the layer to rebuild.
- **It falls back to the built-in five if the request fails**, rather than emptying the picker. A
  map whose POIs lose their icons because a list call 500'd is worse than a stale vocabulary, and
  the form says so on screen.
- **`MapFeatureTypeManager`** — create, rename, recolour, re-icon, retire, restore. The system five
  are shown but locked with a lock icon, because the API refuses to change them and the UI should
  not pretend otherwise. Retire copy says *"stops it being offered, keeps existing features"* —
  "delete" would be a lie. It closes with a line stating hazards are not a map type, so the
  reserved-word refusal is not the first time anyone hears it.
- **Inline create from the form.** The type `<select>` carries a `+ New type…` sentinel that opens
  the manager **seeded with the name already typed into the form**, and selects the new type on
  save. Naming a thing you are already pinning should not mean abandoning the pin.
- **Orphaned types are preserved, not silently reset.** A feature whose type was retired keeps
  showing it as `slug (retired)` in the select. Dropping back to "Select type..." would read as
  data loss on a record nobody touched.
- The marker preview sits beside the select, so the appearance is visible while choosing.
- Gating: `canManageTypes = isAdmin || userTypeRole === 'company_manager'`, matching the API.

**Two bugs caught and fixed during the build**, both mine:
1. The fallback rows derived an `ICON_DEFS` key from a Mapbox image id by regex —
   `'v2-poi-access'` → `'poiaccess'`, not `'poiAccess'`, because there is no hyphen left to
   capitalise. Replaced with an explicit five-entry map.
2. The manager's edit affordance was a tick icon; it is a pencil. The tick is Save.

Verified: `esbuild` parses all five changed/new JSX and JS files clean; every borrowed
`v2-form-*` class and `v2-spin` exists in `MapsPage.css`; every lucide icon imported is used; all
CSS custom properties resolve against `theme.css`. **Not rendered in a browser.**

### Phase 4 — make the map read the vocabulary — **BUILT 2026-08-19**
Changed: `maps-v2/components/mapFeatureTypes.js`, `hooks/useMapFeaturesLayer.js`,
`utils/{legendModel,mapIcons,mapExport,mapChrome}.js`, `components/MapLegend.jsx`,
`components/print/PrintDialog.jsx`, `MapsPage.jsx`.

**The `match` expressions are gone, and that is the design change.** The plan said to rebuild them
when the type list changes. Better: the DATA carries the answer. `decorateFeatures(geojson, types)`
resolves every feature to a concrete `marker_id` and `marker_colour` and writes them into its
properties; the layers just do `['get','marker_id']` and `['get','marker_colour']`. Three
consequences, all good:
- nothing is baked at `addLayer` time, so there is nothing stale to rebuild;
- the **per-feature `style` override finally works** — an expression keyed on `feature_type`
  cannot express "this one gate is different", which is why the JSONB column sat dormant;
- the registration set is computed from the FEATURES, so a style override and a feature whose type
  was retired both get their marker image. Walking the type list would have missed both.

Resolution order is per-feature `style`, then its type, then note-in-charcoal. A feature whose type
was retired, or whose vocabulary failed to load, still draws — losing the pin entirely is worse
than drawing it plainly. `style.color` is accepted alongside `style.colour`.

**The export clone** gets `registerKnownPoiMarkers(exportMap)` beside the existing
`registerMapIcons`. The clone cannot recompute the set — it has no vocabulary and no decorated data
— so it replays the registry the live map filled. Without it a company POI type renders perfectly
on screen and comes out **blank on the sheet**.

**Both legends** now build their POI rows from the company vocabulary passed in, deriving the
specId exactly as the layer does, so `drawMarkerSwatch` finds the registered image and the printed
key shows the real badge. `legendSections(visible, { featureTypes })`; `MapsPage` feeds
`MapLegend`, and `PrintDialog` feeds `drawChrome`.

`decorated` is memoised on `vocabulary.version`, not on the types array — the hook returns a fresh
array each load, so depending on the array would re-add the layers on every poll.

Verified: `esbuild` parses all nine touched files clean; a 25-assertion functional run over the
real modules covers resolution precedence, US/UK colour spelling, unknown and retired types,
marker-id stability and case-folding, spec collection, idempotent registration, legend-swatch
lookup for company **and** fixed markers, the false return that makes callers fall back, and the
export clone replaying the full set onto a blank map. **25/25 pass. Not rendered in a browser.**

#### Legend fixes, 2026-08-19
Two reported together; unrelated causes.

**1. POI logos missing from the on-screen legend — my regression from Phase 4.**
`MapLegend.MarkerSwatch` resolves a row through `SPEC_BY_ID`, which is built from `MARKER_SPECS`
— the FIXED markers. Before Phase 4 a POI row used `t.iconId` (`v2-poi-access`), which is in that
list. Phase 4 changed the row to `poiMarkerId(icon, colour)`, whose image is built on demand and
lives only in the dynamic registry, so every POI row resolved to `null` and drew nothing. The
PRINTED legend was fine, because `drawMarkerSwatch` already falls back to the dynamic registry —
so the two legends disagreed, which is the exact failure `legendModel` exists to prevent.

Fixed by carrying `icon` and `colour` **on the legend row**, and having both renderers prefer them
over any lookup. That also removes a latent ordering hazard — the registry is filled by a layer
effect that may not have run when the legend first renders, and mutating a module-level Map does
not re-render React — and it fixes a case neither renderer handled: a type with **no features yet**
is listed in the key but has no registered image, so it printed blank. Verified: by specId alone
`false`, with an explicit appearance `true`, fixed markers still `true`, an unknown icon still
`false` so callers can fall back.

**2. Blocks and spatial areas not matching the map — a pre-existing tint, not a value mismatch.**
The constants were never wrong: `useBlocksLayer` and `useSpatialAreasLayer` both import from
`layerColors.js`, the same file the legend reads. The fault was the swatch's synthetic backdrop.
`AreaSwatch` paints a stand-in basemap under the translucent fill, and it was **`#4b5563`, a
blue-grey**, while vineyard imagery is green and olive. A 12% `#58e23c` block fill over blue-grey
composites to `#4d665e` — grey-teal — where the map shows `#405c30` over canopy or `#849665` over
dry ground. Green on the map, teal in the key.

Solved numerically against canopy-dark and dry-ground pixels: **`#646c4c`** reproduces the map's
average appearance for both block and spatial fills to within ~2/255 per channel, against ~69 for
the old base. Applied to both the on-screen swatch and the printed one, which had the same
hardcoded value.

#### Marker sizing + zoom fade, 2026-08-19
Pete, after testing: POI symbols should match the other layers and fade out as you zoom out.

POIs were the odd one out on both counts — `icon-size: 0.75` against 0.9 for observations and
risks, and the **only point layer with no `icon-opacity` ramp at all**. The original comment
argued against a ramp ("a POI is what you zoom OUT to find"); in practice a property with twenty
gates and troughs turned to soup at low zoom. That comment is now corrected in place rather than
left to mislead.

Now `icon-size: 0.9` and `['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1]` for both icon and
text — byte-identical to the curve tasks, observations, risks and assets already share, so all
five point layers behave the same. Tasks remain slightly larger at 1.0; say so if POIs should
match that instead.

**Lines and polygons deliberately do NOT fade.** No other line or fill layer does — asset lines
hold at 0.85/0.95 and spatial areas are constant. A drawn race or slip is a shape on the ground
like a block, not a pin, so it stays.

**Watch on the print.** The export holds the on-screen field of view, so a wide sheet composed at
z11 or z12 will now show POI markers faded or absent — while the legend still lists every type.
That is the "legend describes a different map" failure `legendModel` exists to prevent. Compose
print views at z13+ , or revisit whether the export should override marker opacity.

#### Phase 4 follow-up — two stale call sites, found in testing 2026-08-19
Pete: *"new POIs under a custom type come up as Point of Interest rather than their name."*

Phase 4 rewired the layer and both legends but **missed two places still reading
`FEATURE_TYPE_BY_VALUE`** — an index over the STATIC five, so a custom type had no entry:
- the **popup** (`MapsPage.jsx`), which fell back to the literal string `Point of Interest` — the
  same label for every POI on the map — and to an undefined badge background;
- the **sidebar POI list**, which fell back to the raw slug and a charcoal dot.

Both now resolve through `resolveAppearance(feature_type, style, typeBySlug)`, the same rule the
map uses. **`FEATURE_TYPE_BY_VALUE` has been deleted**, because every remaining caller of it was a
latent version of this bug; the file carries a note saying so.

The popup body moved out of `MapsPage` into `MapFeaturePopupContent` in `shared/MapPopup.jsx`,
alongside the other popup contents. Two things it has to get right:
- **The vocabulary goes through a ref.** The click handler's effect depends only on
  `[map, mapReady]`, so a value captured directly is stale for the life of the map and a type
  created this session would never appear. `featureTypesRef` follows the existing
  `handleEditFeatureRef` / `navigateRef` pattern.
- **`style` arrives JSON-encoded.** Mapbox serialises nested feature properties, so the popup gets
  a string where the sidebar gets an object. The component parses defensively and a malformed
  value falls through to the type rather than throwing.

**Chip restyled** (Pete: *"maybe make them all the same colour and font but include the icon"*).
One `.v2-popup-badge--feature` style for every type — the background used to be the type's own
colour, which made the label's legibility depend on whichever colour someone picked. The glyph
keeps the type colour, so the chip still ties back to the pin that was clicked; that is the half of
the colour worth keeping. Flag if you want the icon monochrome too.

#### Original plan for this phase
- `mapFeatureTypes.js` stops being a static array and becomes a loader + cache.
- `featureIconExpression()` / `featureColorExpression()` build their `match` stops from fetched
  types. **The layer must rebuild these when the type list changes** — a Mapbox `match` expression
  is baked at `setPaintProperty` time and will not pick up a new type on its own.
- `legendModel.js:98-100` already iterates `MAP_FEATURE_TYPES` rather than a second hardcoded list,
  so it follows for free — that comment was written for exactly this.
- **Per-feature override**: read `style.icon` / `style.colour` with the type as fallback, wiring up
  the dormant JSONB column. One odd gate that wants a different glyph should not need its own type.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Users recreate a hazard register | §2 reserved-word guard — **needs sign-off** |
| Type sprawl: 40 near-duplicate types | Manager+ only to create; inline create shows near-matches first |
| A new glyph prints blank | Register on the cloned export style; check every icon at A1 before shipping |
| `match` expression stale after a type is added | Rebuild layer expressions on type-list change |
| A retired type orphans its features | Soft delete only; features keep rendering and legending |

## 7. Not in scope
- Mobile — no POI support exists to extend.
- User-uploaded icon images. The whole pipeline is canvas-drawn stroke geometry; raster upload
  would need a different registration path and would not scale cleanly to A0.
- Free colour picking — bounded palette only.
- Per-property type vocabularies. Company-wide is the right grain; properties share infrastructure
  language.

## 8. Decisions — all settled 2026-08-19
1. **Hazard guard: BLOCK.** Reserved words refused on create and rename, with a message pointing at
   the Risk Register.
2. **Creating a type: manager+ only.** Reading the list stays open to anyone who can see the map.
3. **Icon library: 50 glyphs** — 20 first, raised to 50 on 2026-08-19.

## 9. Build note — migration chaining
Written while a parallel Insights session holds **two uncommitted migrations** in the tree
(`zone_coastal_clip`, `zone_label_point`), with `zone_label_point` as the local head. Prod is at
`surface_season_granularity`, two behind. `add_map_feature_types` chains onto `zone_label_point`
because a single linear history is right, but **if that session renames or drops either revision
before committing, this one's `down_revision` needs updating to match**. Never `alembic upgrade
head` here — apply by name.
