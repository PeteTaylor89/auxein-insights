// maps-v2/components/managementLayerRegistry.js
//
// Central registry of the management-mode map layers — the counterpart to
// builder/layerRegistry.js, which does the same job for Map Builder layers.
// Same idea, deliberately the same shape, so there is one pattern for "what
// layers exist" rather than two.
//
// Why this exists: layer visibility used to be six independent `useState`
// booleans in MapsPage (`showRisks`, `showParcels`, …). That works fine for
// rendering the sidebar, where each one is written out by hand, but it cannot
// be *enumerated* — and anything that needs to ask "what layers are there, and
// which are on?" needs exactly that. Map printing needs it (a per-layer tick
// list, and a legend that only describes what was actually rendered), and so
// would persisting layer state or saving a named view.
//
// The registry owns the layer *identity* (id, label, icon, default). It does
// NOT own the data fetching or the Mapbox wiring — those stay in the use*Layer
// hooks, which are already one-per-layer.

import {
  AlertTriangle, Binoculars, ClipboardList, Landmark, LandPlot, Layers, MapPin, Wrench,
} from 'lucide-react';

/**
 * One entry per toggleable management layer, in sidebar display order.
 *
 *   id            — key used in the layerVisibility object and by MapLegend
 *   label         — sidebar heading and print tick-list label
 *   icon          — lucide component, rendered at 16px in the sidebar
 *   color         — icon tint; matches the swatch the layer paints on the map
 *   defaultVisible— initial state on page load
 *   adminOnly     — panel is hidden entirely for non-admins (parcels)
 *   alwaysOn      — no visibility toggle; listed for print, ignored by the sidebar
 *   toggleTitle   — [hidden, shown] tooltip pair for the eye button
 *   mapLayerIds   — the Mapbox layer ids this entry owns. Used ONLY by the
 *                   export renderer, which clones the live style and strips the
 *                   layers the user unticked in the print dialog. Keep in step
 *                   with the corresponding use*Layer hook; a missing id means
 *                   that sub-layer silently survives an untick on the print.
 */
export const MANAGEMENT_LAYERS = [
  {
    id: 'blocks',
    mapLayerIds: ['v2-blocks-fill', 'v2-blocks-outline', 'v2-blocks-labels'],
    label: 'Blocks',
    icon: Landmark,
    color: '#5B6830',
    defaultVisible: true,
    alwaysOn: true,
  },
  {
    id: 'risks',
    mapLayerIds: ['v2-risks-circles'],
    label: 'Risks',
    icon: AlertTriangle,
    color: '#f59e0b',
    defaultVisible: true,
    toggleTitle: ['Show risks', 'Hide risks'],
  },
  {
    id: 'spatialAreas',
    mapLayerIds: ['v2-spatial-fill', 'v2-spatial-outline', 'v2-spatial-labels'],
    label: 'Spatial Areas',
    icon: Layers,
    color: '#5B6830',
    defaultVisible: false,
    toggleTitle: ['Show areas', 'Hide areas'],
  },
  {
    id: 'parcels',
    mapLayerIds: ['v2-parcels-fill', 'v2-parcels-outline'],
    label: 'Land Parcels',
    icon: LandPlot,
    color: '#6b7280',
    defaultVisible: false,
    adminOnly: true,
    toggleTitle: ['Show parcels', 'Hide parcels'],
  },
  {
    id: 'tasks',
    mapLayerIds: ['v2-tasks-symbol'],
    label: 'Tasks',
    icon: ClipboardList,
    color: '#D1583B',
    defaultVisible: true,
    toggleTitle: ['Show tasks', 'Hide tasks'],
  },
  {
    id: 'observations',
    mapLayerIds: ['v2-observations-symbol'],
    label: 'Observations',
    icon: Binoculars,
    color: '#5B6830',
    defaultVisible: true,
    toggleTitle: ['Show obs', 'Hide obs'],
  },
  {
    id: 'assets',
    mapLayerIds: ['v2-assets-points', 'v2-assets-lines', 'v2-assets-lines-casing', 'v2-assets-labels'],
    label: 'Assets',
    icon: Wrench,
    color: '#5B6830',
    defaultVisible: false,
    toggleTitle: ['Show assets', 'Hide assets'],
  },
  {
    id: 'mapFeatures',
    mapLayerIds: ['v2-map-features-points', 'v2-map-features-lines', 'v2-map-features-lines-casing', 'v2-map-features-fill'],
    label: 'Points of Interest',
    icon: MapPin,
    color: '#0369a1',
    // On by default: a POI is only useful if it is there when you need it, and
    // the layer is empty for every company until someone draws one.
    defaultVisible: true,
    toggleTitle: ['Show points of interest', 'Hide points of interest'],
  },
];

export const LAYER_BY_ID = Object.fromEntries(
  MANAGEMENT_LAYERS.map((l) => [l.id, l]),
);

/** Initial `layerVisibility` state, derived so defaults live in one place. */
export function defaultLayerVisibility() {
  return Object.fromEntries(
    MANAGEMENT_LAYERS.map((l) => [l.id, l.defaultVisible]),
  );
}

/**
 * Layers a given viewer may see, in display order.
 * `alwaysOn` layers are included — callers that render toggles filter them out.
 */
export function visibleLayersForViewer(isAdmin) {
  return MANAGEMENT_LAYERS.filter((l) => !l.adminOnly || isAdmin);
}
