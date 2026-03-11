# Maps V2 — Implementation Plan

## Why

The current `Maps.jsx` is a 3,944-line monolithic component with 48+ `useState` hooks, mixed refs/state for drawing operations, duplicated geometry validation, dynamic `window` function hacks for popups, and cascading `useEffect` chains. It works, but it's fragile to extend and painful to debug. Phase 3 will add ~18 new features that touch the map — bolting them onto the existing file is not viable.

---

## Architecture Overview

Maps V2 splits the page into **two modes** accessed via a tab/toggle in the sidebar:

### Mode 1: Management View (default)
Day-to-day vineyard operations. Shows the user's blocks with overlays for:
- Risks (existing — colour-coded circles)
- Tasks (new — icon marker per block like observations, click opens a panel listing tasks in desc order with status/type icons. If a task has GPS track data, a "Show track" button renders it on the map — only one GPS track visible at a time)
- Observations (new — icon marker per block, click opens a panel listing observations in desc order with type icons: phenology, disease, pest, etc.)
- Spatial areas (existing — paddocks, orchards, etc.)

### Mode 2: Map Builder
Power-user / planning tool. Lets users compose a custom geospatial view by toggling data layers on/off. **State is persisted** — when a user returns, their layer selections, opacity settings, and any drawings are restored.

Available layers:
- Wine Regions & GIs (existing public data from Insights — `GET /regions/geojson`, `GET /gis/geojson`)
- Topography (Mapbox terrain + contours)
- Land parcels (existing — admin only)
- Management areas / farm environment plans (spatial areas + new types)
- S-Map soil data (placeholder — future API, pending license)
- Geology / faults (placeholder — future API, LINZ/GNS, pending license)
- NDVI / satellite imagery (placeholder — future API)
- Flow paths / hydrology (placeholder — future API)
- Biodiversity zones (placeholder — future API)
- Soil carbon / Downforce integration (placeholder — future API)

Each layer is a toggleable card in the sidebar with opacity control and a legend. Users can drag-reorder active layers to control z-stacking. Placeholder layers show a "Coming soon" state with a description of what the data will provide.

---

## File Structure

```
packages/web/src/pages/maps-v2/
├── MAPS_V2_PLAN.md          ← this file
├── MapsPage.jsx              ← page shell: sidebar + map + mode toggle
├── MapsPage.css              ← page-level layout styles
│
├── components/
│   ├── MapContainer.jsx      ← Mapbox GL init, cleanup, style switching, 3D toggle
│   ├── MapContainer.css
│   ├── Sidebar.jsx           ← collapsible sidebar shell, mode tabs
│   ├── Sidebar.css
│   │
│   ├── management/           ← Management View panels & layers
│   │   ├── BlocksPanel.jsx       ← block list, search, click-to-fly
│   │   ├── RisksPanel.jsx        ← risk layer toggle + filters
│   │   ├── TasksPanel.jsx        ← icon markers per block, click → task list panel, "Show track" for GPS tasks (one track at a time)
│   │   ├── ObservationsPanel.jsx ← icon markers per block, click → obs list by type
│   │   └── SpatialAreasPanel.jsx ← spatial area layer + filters
│   │
│   ├── builder/              ← Map Builder panels
│   │   ├── LayerCatalog.jsx      ← searchable list of all available layers
│   │   ├── ActiveLayers.jsx      ← drag-reorderable stack of enabled layers
│   │   ├── LayerCard.jsx         ← individual layer toggle + opacity + legend
│   │   └── layers/               ← per-layer config & rendering
│   │       ├── RegionsLayer.js       ← wine regions from public API
│   │       ├── GIsLayer.js           ← geographical indications from public API
│   │       ├── TopographyLayer.js
│   │       ├── ParcelsLayer.js
│   │       ├── ManagementAreasLayer.js
│   │       ├── SoilLayer.js       ← placeholder (S-Map, pending license)
│   │       ├── GeologyLayer.js    ← placeholder (GNS, pending license)
│   │       ├── NdviLayer.js       ← placeholder
│   │       ├── FlowPathsLayer.js  ← placeholder
│   │       ├── BiodiversityLayer.js ← placeholder
│   │       └── SoilCarbonLayer.js ← placeholder (Downforce)
│   │
│   ├── drawing/              ← Block/area creation & editing
│   │   ├── DrawingToolbar.jsx    ← draw polygon, split, edit buttons
│   │   ├── BlockCreateForm.jsx   ← new block form (slide-in)
│   │   ├── BlockSplitFlow.jsx    ← split state machine
│   │   ├── BlockEditForm.jsx     ← edit block geometry + metadata
│   │   ├── SpatialAreaForm.jsx   ← create/edit spatial area
│   │   └── useDrawingController.js ← hook: manages MapboxDraw lifecycle
│   │
│   └── shared/               ← Shared map UI components
│       ├── MapPopup.jsx          ← React-rendered popups (replaces HTML string hacks)
│       ├── LayerToggle.jsx       ← reusable toggle + opacity slider
│       ├── StatusBar.jsx         ← bottom status messages
│       └── MapStyleSelector.jsx  ← Streets/Satellite/Outdoors/3D
│
├── hooks/
│   ├── useMapbox.js          ← map instance, style changes, 3D terrain
│   ├── useBlocksLayer.js     ← fetch + render blocks GeoJSON
│   ├── useRisksLayer.js      ← fetch + render risks
│   ├── useSpatialAreasLayer.js
│   ├── useParcelsLayer.js    ← viewport-based loading with debounce
│   ├── useTasksLayer.js      ← icon markers per block + single GPS track overlay
│   ├── useObservationsLayer.js ← icon markers per block centroid
│   ├── useBlockSplit.js      ← split state machine (replaces ref/state mess)
│   └── useBuilderState.js    ← persist/restore builder layer config (localStorage)
│
└── utils/
    ├── mapStyles.js          ← style URL constants, 3D config
    ├── layerColors.js        ← risk colours, block fills, status palette
    ├── geometry.js           ← validation helpers (from blocksService duplication)
    └── popupHelpers.js       ← popup content builders
```

---

## Component Responsibilities

### `MapsPage.jsx`
- Top-level page rendered at `/maps-v2` route (parallel to existing `/maps`)
- Holds the mode state (`management` | `builder`)
- Provides map ref to children via React context
- Layout: sidebar (left) + map (fills remaining space)
- No business logic — pure layout orchestration

### `MapContainer.jsx`
- Creates the Mapbox GL instance on mount, destroys on unmount
- Exposes the `map` instance via context or ref callback
- Handles style switching (streets/satellite/outdoors/3D)
- Adds navigation controls, geolocate control, scale bar
- Does NOT add any data layers — that's the hooks' job

### `Sidebar.jsx`
- Collapsible panel (mobile: slide-over, desktop: fixed left)
- Two tabs at top: **Management** | **Map Builder**
- Renders the appropriate panel set based on active mode
- Scroll container for panel content

### Layer hooks (`useBlocksLayer`, `useRisksLayer`, etc.)
Each hook follows the same pattern:
```js
function useBlocksLayer(map, visible) {
  // 1. Fetch data (SWR or useEffect)
  // 2. When map + data ready, add source + layers
  // 3. Attach click handlers (returning cleanup)
  // 4. On unmount / visibility change, remove layers
  // 5. Return: { data, loading, error, refresh }
}
```
This replaces the current pattern of 5+ tangled `useEffect` chains in Maps.jsx.

### `useBlockSplit.js`
Replaces the current ref/state duality with a proper state machine:
```
States: idle → selecting → drawing_line → confirming → processing → idle
Events: START_SPLIT, LINE_DRAWN, CONFIRM, CANCEL, SPLIT_SUCCESS, SPLIT_ERROR
```
All split-related state lives in one `useReducer`. No more `blockToSplitRef` vs `blockToSplit` divergence.

### `MapPopup.jsx`
Replaces the current pattern of:
```js
// Old: HTML string with onclick="window.openEditForm_123()"
popup.setHTML(`<button onclick="window.openEditForm_${id}()">Edit</button>`);
```
With React-rendered popups using `createRoot` into a DOM node:
```js
// New: React component rendered into popup
const container = document.createElement('div');
createRoot(container).render(<BlockPopupContent block={feature} onEdit={handleEdit} />);
popup.setDOMContent(container);
```
No more global window function leaks.

---

## Data Flow

```
MapsPage
  ├── MapContext.Provider (map instance)
  │
  ├── Sidebar
  │   ├── [Management mode]
  │   │   ├── BlocksPanel ──── useBlocksLayer(map, true)
  │   │   ├── RisksPanel ───── useRisksLayer(map, visible)
  │   │   ├── TasksPanel ──── useTaskTracksLayer(map, visible)
  │   │   └── ...
  │   │
  │   └── [Builder mode]
  │       ├── LayerCatalog
  │       └── ActiveLayers ── useParcelsLayer, useTopography, ...
  │
  ├── MapContainer (creates map, exposes via context)
  │
  └── DrawingToolbar ── useDrawingController (MapboxDraw lifecycle)
```

Each panel owns its layer hook. Toggling a panel on/off mounts/unmounts the hook, which adds/removes map layers. No global state cascade.

---

## Migration Strategy

### Phase A: Scaffold + core map (this PR)
1. Create file structure and `MapsPage.jsx` shell
2. `MapContainer.jsx` with style switching + 3D
3. `Sidebar.jsx` with mode tabs (Management active, Builder shows "coming soon" cards)
4. `useMapbox.js` hook
5. `useBlocksLayer.js` — fetch + render blocks with click popups
6. `MapPopup.jsx` — React-rendered popups
7. `MapStyleSelector.jsx`
8. Add `/maps-v2` route in `App.jsx` (parallel to `/maps`)

**Outcome:** Blocks render on map with popups. Sidebar shows blocks list. Style switching works. No drawing yet.

### Phase B: Management layers
1. `useRisksLayer.js` + `RisksPanel.jsx`
2. `useSpatialAreasLayer.js` + `SpatialAreasPanel.jsx`
3. `useParcelsLayer.js` (admin) — viewport-based loading with debounce
4. `useTasksLayer.js` + `TasksPanel.jsx` — icon markers at block centroids (mirrors observations pattern), click opens task list panel with status/type icons, "Show track" button for GPS-enabled tasks (one track rendered at a time)
5. `useObservationsLayer.js` + `ObservationsPanel.jsx` — icon markers at block centroids, click opens obs list panel with type icons

**Outcome:** Full management view parity with current Maps page (minus drawing), plus new task tracks and observation overlays.

### Phase C: Drawing & editing
1. `useDrawingController.js` — MapboxDraw lifecycle
2. `DrawingToolbar.jsx` — mode buttons
3. `BlockCreateForm.jsx` — new block creation
4. `useBlockSplit.js` — state machine for split flow
5. `BlockSplitFlow.jsx` — split UI
6. `BlockEditForm.jsx` — geometry + metadata editing
7. `SpatialAreaForm.jsx` — create/edit spatial areas

**Outcome:** Full drawing parity. Old Maps page can be retired.

### Phase D: Map Builder
1. `LayerCatalog.jsx` + `ActiveLayers.jsx` (drag-reorderable) + `LayerCard.jsx`
2. `useBuilderState.js` — persist/restore layer config to localStorage
3. `RegionsLayer.js` + `GIsLayer.js` — wine regions & GIs from public API (works immediately)
4. `TopographyLayer.js` — Mapbox terrain contours (works immediately)
5. `ParcelsLayer.js` — move parcel viewing to builder (keep admin assignment in management)
6. `ManagementAreasLayer.js` — spatial areas as builder layer
7. Placeholder layer cards for future data pipelines (S-Map, geology, NDVI, flow paths, biodiversity, soil carbon)

**Outcome:** Builder mode functional with regions, GIs, topography, parcels, management areas. State persists across sessions. Placeholder cards show "Coming soon" with descriptions for future integrations.

---

## API Endpoints Used

### Existing (no backend changes needed)
| Endpoint | Used By |
|----------|---------|
| `GET /blocks/geojson` | `useBlocksLayer` |
| `GET /blocks/{id}` | `BlockEditForm` |
| `PUT /blocks/{id}/geometry` | `BlockEditForm` |
| `POST /blocks/{id}/split` | `useBlockSplit` |
| `POST /blocks/` | `BlockCreateForm` |
| `GET /spatial-areas/geojson` | `useSpatialAreasLayer`, `ManagementAreasLayer` |
| `POST /spatial-areas/` | `SpatialAreaForm` |
| `PUT /spatial-areas/{id}` | `SpatialAreaForm` |
| `GET /spatial-areas/company` | `SpatialAreaForm` (parent list) |
| `GET /risk-management/risks` | `useRisksLayer` |
| `GET /risk-management/risks/{id}` | Risk popup detail |
| `GET /tasks/{id}/gps/track` | `useTaskTracksLayer` |
| `GET /tasks/{id}/gps/stats` | `TasksPanel` |
| Parcels viewport loading | `useParcelsLayer` |
| Parcel assignment | `ParcelsLayer` (admin) |
| `GET /v1/regions/geojson` | `RegionsLayer` (Map Builder) |
| `GET /v1/regions/{slug}` | Region popup detail |
| `GET /v1/gis/geojson` | `GIsLayer` (Map Builder) |
| `GET /v1/gis/{slug}` | GI popup detail |

### Future (backend work needed for Map Builder)
| Layer | Data Source | Notes |
|-------|-----------|-------|
| S-Map soils | Manaaki Whenua API or pre-cached tiles | Requires data license |
| Geology / faults | GNS Science / LINZ Data Service | WMS or pre-processed GeoJSON |
| NDVI | Sentinel Hub or custom processing | Raster tiles, date-range selector |
| Flow paths | DEM-derived (8m LiDAR) | Pre-computed per region |
| Biodiversity | DOC / LENZ layers | WMS or static GeoJSON |
| Soil carbon | Downforce API integration | Per-block values, heatmap overlay |
| Topography | Mapbox Terrain v2 | Already available (no backend) |

---

## Key Design Decisions

### 1. React Context for map instance (not prop drilling)
The map object is used by 10+ hooks and components. Context avoids passing it through every level.

### 2. One hook per layer (not one mega-effect)
Each `use*Layer` hook manages its own source, layers, and event handlers. Mounting/unmounting is controlled by the panel visibility, not a cascade of `showXLayer` booleans.

### 3. State machine for block split (not ref/state duality)
`useReducer` with explicit states eliminates the stale closure bugs in the current implementation.

### 4. React-rendered popups (not HTML strings)
`createRoot` into a DOM node gives us proper React event handling, no global `window` function leaks, and component reuse.

### 5. Parallel route during migration
`/maps-v2` runs alongside `/maps`. The sidebar nav can be updated to point to `/maps-v2` when ready. The old page is deleted only after full parity is confirmed.

### 6. Builder layers are pluggable
Each builder layer is a self-contained module exporting `{ id, name, icon, description, addToMap, removeFromMap, Component }`. Adding a new data pipeline means adding one file to `builder/layers/` and registering it in the catalog — no changes to existing code.

### 7. Builder state persistence (localStorage)
`useBuilderState` hook saves the active layer list, opacity values, z-order, and any user drawings to `localStorage` keyed by `company_id`. On mount, it restores the previous session. No backend storage needed initially — can upgrade to API-backed persistence later if multi-device sync is wanted.

### 8. Observations as icon markers (not block fill colours)
Each block gets a small observation icon at its centroid. Clicking the icon opens a slide-out panel listing that block's observations in descending date order, each with a type icon (phenology, disease, pest, general, etc.). This avoids the "what does green/amber/red mean?" confusion and gives richer information at a glance.

### 9. Regions & GIs from Insights public API
The existing `GET /regions/geojson` and `GET /gis/geojson` endpoints (already built for Insights) are reused in Map Builder as toggleable layers. No new backend work — these are public endpoints with simplification support.

---

## Styling

All Maps V2 components use the `theme.css` design system variables. The sidebar uses Grow brand colours (olive headings, terracotta accents, warm sand backgrounds for cards). The map container fills the remaining viewport width.

---

## What Gets Deleted (eventually)

Once V2 has full parity:
- `packages/web/src/pages/Maps.jsx` (3,944 lines)
- `packages/web/src/components/SlidingEditForm.jsx` (replaced by `BlockEditForm`)
- `packages/web/src/components/SpatialAreasSlidingEditForm.jsx` (replaced by `SpatialAreaForm`)
- The `/maps` route in `App.jsx`

Components **kept** (shared with other pages):
- `RiskLocationMap.jsx` — used by risk creation page
- `SpotLocationMap.jsx` — used by observation capture
- `BlockSelectionModal.jsx` — used by observation run start
- `BlockCard.jsx` — used by observation dashboard

---

## Resolved Decisions

1. **Tasks** — same pattern as observations: icon marker per block, click opens a task list panel (desc order, status/type icons). Tasks with GPS data get a "Show track" button that renders the track on the map. Only one GPS track visible at a time — selecting a new one replaces the previous.
2. **Observations** — icon marker at each block's centroid (not fill colour). Clicking the icon opens a slide-out panel listing that block's observations in descending date order, each with a type icon (phenology, disease, pest, general, etc.).
3. **Map Builder layer ordering** — drag-reorderable. `ActiveLayers` uses a drag handle list to let users control z-stacking.
4. **Builder state persistence** — save to `localStorage` (keyed by `company_id`). Layers, opacity, z-order, and drawings restored on next visit. No offline tile caching — Map Builder is web-only.
5. **External data layers** — all placeholders for now (S-Map, geology, NDVI, flow paths, biodiversity, soil carbon). Each shows "Coming soon" with a description. Licensing and API keys to be worked through individually.
6. **Regions & GIs** — reuse existing public endpoints from Insights (`/regions/geojson`, `/gis/geojson`) as Map Builder layers. No new backend work needed.
