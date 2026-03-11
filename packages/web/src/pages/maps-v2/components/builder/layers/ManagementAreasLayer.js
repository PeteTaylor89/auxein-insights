// maps-v2/components/builder/layers/ManagementAreasLayer.js — Spatial areas as builder layer
import { spatialAreasService } from '@vineyard/shared';
import { removeLayers } from '../../../utils/geometry';

const SOURCE_ID = 'v2-builder-mgmt-areas';
const FILL_ID = 'v2-builder-mgmt-areas-fill';
const LINE_ID = 'v2-builder-mgmt-areas-line';
const LABEL_ID = 'v2-builder-mgmt-areas-label';
const LAYER_IDS = [FILL_ID, LINE_ID, LABEL_ID];

const TYPE_COLORS = {
  paddock: '#86efac',
  orchard: '#fbbf24',
  forestry: '#34d399',
  wetland: '#60a5fa',
  riparian: '#38bdf8',
  native_bush: '#22c55e',
  building: '#a1a1aa',
  dam: '#3b82f6',
  other: '#d4d4d8',
};

let cachedData = null;

async function fetchData() {
  try {
    const data = await spatialAreasService.getSpatialAreasGeoJSON();
    cachedData = data;
    return data;
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

export function addToMap(map, opacity = 0.5, beforeLayerId = 'v2-blocks-fill') {
  return fetchData().then((data) => {
    removeLayers(map, LAYER_IDS, SOURCE_ID);

    if (!data?.features?.length) return;

    map.addSource(SOURCE_ID, { type: 'geojson', data });

    // Build color expression from type
    const colorExpr = ['match', ['get', 'area_type']];
    Object.entries(TYPE_COLORS).forEach(([type, color]) => {
      colorExpr.push(type, color);
    });
    colorExpr.push('#d4d4d8'); // fallback

    map.addLayer({
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': opacity * 0.3,
      },
    }, beforeLayerId);

    map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': colorExpr,
        'line-width': 1.5,
        'line-dasharray': [3, 2],
        'line-opacity': Math.min(opacity + 0.2, 1),
      },
    }, beforeLayerId);

    map.addLayer({
      id: LABEL_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 10,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#2F2F2F',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1,
        'text-opacity': Math.min(opacity + 0.2, 1),
      },
    }, beforeLayerId);
  });
}

export function removeFromMap(map) {
  removeLayers(map, LAYER_IDS, SOURCE_ID);
  cachedData = null;
}

export function setOpacity(map, opacity) {
  if (map.getLayer(FILL_ID)) {
    map.setPaintProperty(FILL_ID, 'fill-opacity', opacity * 0.3);
  }
  if (map.getLayer(LINE_ID)) {
    map.setPaintProperty(LINE_ID, 'line-opacity', Math.min(opacity + 0.2, 1));
  }
  if (map.getLayer(LABEL_ID)) {
    map.setPaintProperty(LABEL_ID, 'text-opacity', Math.min(opacity + 0.2, 1));
  }
}
