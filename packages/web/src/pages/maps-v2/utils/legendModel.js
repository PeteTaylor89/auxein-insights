// maps-v2/utils/legendModel.js — What the legend says, for every renderer.
//
// There were two legends: MapLegend.jsx drew real marker glyphs, true fill
// opacities and cased lines, while the print chrome drew a flat coloured square
// per layer and a plain circle per POI type. Same map, two different keys — and
// the printed one was the wrong one, because a printed map is the copy that gets
// filed and argued over.
//
// So the ROWS live here as plain data and each renderer only decides how to
// paint them: SVG on screen, canvas on the print. A new layer is one entry here
// and it appears in both.
//
// This file must stay free of JSX and of canvas calls — the moment it imports
// either, it can only serve one of them again.
import { MARKER_SPECS, poiMarkerId } from './mapIcons';
import {
  BLOCK_FILL_OWN,
  BLOCK_OUTLINE,
  BLOCK_FILL_OPACITY,
  BLOCK_OUTLINE_WIDTH_OWN,
  SPATIAL_AREA_FILL,
  SPATIAL_AREA_FILL_OPACITY,
  SPATIAL_AREA_OUTLINE,
  SPATIAL_AREA_OUTLINE_WIDTH,
  SPATIAL_AREA_OUTLINE_OPACITY,
  SPATIAL_AREA_DASH,
  GPS_TRACK_COLORS,
  ASSET_LINE_DEFAULT,
} from './layerColors';

export const SPEC_BY_ID = Object.fromEntries(MARKER_SPECS.map((s) => [s.id, s]));

const marker = (specId) => ({
  key: specId,
  type: 'marker',
  specId,
  label: SPEC_BY_ID[specId]?.label || specId,
});

/**
 * Legend sections for a given visibility map, in map-reading order.
 *
 * `visible` is keyed exactly like `layerVisibility` (see managementLayerRegistry),
 * which is why the print dialog can pass its own tick list straight in and get a
 * legend describing the print rather than the screen.
 *
 * Row types:
 *   marker — a map image: circular badge + glyph, drawn from MARKER_SPECS
 *   area   — a polygon layer: fill + opacity + outline (+ dash)
 *   line   — a linear layer: colour over a white casing
 */
export function legendSections(visible = {}, { featureTypes = [] } = {}) {
  const sections = [];

  const areas = [];
  // `blocks` is alwaysOn for the sidebar, but the print dialog can still untick
  // it, so this is driven off the flag rather than hardcoded on.
  if (visible.blocks !== false) {
    areas.push({
      key: 'blocks',
      type: 'area',
      label: 'Vineyard block',
      fill: BLOCK_FILL_OWN,
      fillOpacity: BLOCK_FILL_OPACITY,
      outline: BLOCK_OUTLINE,
      outlineWidth: BLOCK_OUTLINE_WIDTH_OWN,
    });
  }
  if (visible.spatialAreas) {
    areas.push({
      key: 'spatial',
      type: 'area',
      label: 'Spatial area',
      fill: SPATIAL_AREA_FILL,
      fillOpacity: SPATIAL_AREA_FILL_OPACITY,
      outline: SPATIAL_AREA_OUTLINE,
      outlineWidth: SPATIAL_AREA_OUTLINE_WIDTH,
      outlineOpacity: SPATIAL_AREA_OUTLINE_OPACITY,
      dash: SPATIAL_AREA_DASH,
    });
  }
  if (areas.length) sections.push({ title: 'Areas', items: areas });

  const markers = [];
  if (visible.tasks) {
    markers.push(marker('v2-tasks-icon'));
    markers.push(marker('v2-tasks-icon-inactive'));
  }
  if (visible.observations) markers.push(marker('v2-obs-icon'));
  if (visible.assets) markers.push(marker('v2-asset-icon'));
  if (visible.risks) {
    for (const id of ['v2-risk-icon-low', 'v2-risk-icon-medium', 'v2-risk-icon-high', 'v2-risk-icon-critical']) {
      markers.push(marker(id));
    }
  }
  if (visible.mapFeatures) {
    // The POI rows come from the COMPANY'S vocabulary, passed in, not from a
    // hardcoded list — that is the whole point of custom types. The specId is
    // derived the same way the layer derives it, so drawMarkerSwatch finds the
    // registered image and both legends show the real badge rather than an
    // approximation of it.
    //
    // Retired types are included when they are still in `featureTypes`: a
    // feature that uses one is still ON the map, and a legend that omits it
    // leaves an unexplained pin on a printed sheet.
    for (const t of featureTypes) {
      // `icon` and `colour` travel WITH the row.
      //
      // A POI type's marker image is built on demand for its (icon, colour)
      // pair, so it is not in MARKER_SPECS and a renderer that only knows how to
      // look up a specId draws nothing — which is exactly what happened to the
      // on-screen legend: every POI row came out blank while the printed one,
      // which falls back to the dynamic registry, was fine.
      //
      // Carrying the appearance on the row removes the lookup from both
      // renderers, and with it the ordering hazard that the registry is
      // populated by a layer effect that may not have run yet.
      markers.push({
        key: poiMarkerId(t.icon, t.colour),
        type: 'marker',
        specId: poiMarkerId(t.icon, t.colour),
        icon: t.icon,
        colour: t.colour,
        label: t.label || t.slug,
      });
    }
  }
  if (markers.length) sections.push({ title: 'Markers', items: markers });

  const lines = [];
  if (visible.gpsTracks) {
    lines.push({ key: 'gps-active', type: 'line', label: 'GPS track — in progress', color: GPS_TRACK_COLORS.in_progress });
    lines.push({ key: 'gps-done', type: 'line', label: 'GPS track — completed', color: GPS_TRACK_COLORS.completed });
  }
  if (visible.assets) {
    lines.push({ key: 'asset-line', type: 'line', label: 'Linear asset (fence, irrigation…)', color: ASSET_LINE_DEFAULT });
  }
  if (lines.length) sections.push({ title: 'Lines', items: lines });

  return sections;
}

/** Flat row count — used to size the printed legend box before drawing it. */
export function legendRowCount(sections) {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
