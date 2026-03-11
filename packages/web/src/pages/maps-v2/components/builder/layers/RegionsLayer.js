// maps-v2/components/builder/layers/RegionsLayer.js — Wine regions from public API
import axios from 'axios';
import { removeLayers } from '../../../utils/geometry';

const SOURCE_ID = 'v2-builder-regions';
const FILL_ID = 'v2-builder-regions-fill';
const LINE_ID = 'v2-builder-regions-line';
const LABEL_ID = 'v2-builder-regions-label';
const LAYER_IDS = [FILL_ID, LINE_ID, LABEL_ID];

const baseURL = import.meta.env.VITE_API_URL || '/api';

let cachedData = null;

async function fetchData() {
  if (cachedData) return cachedData;
  const headers = {};
  const token = localStorage.getItem('accessToken') || localStorage.getItem('public_access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await axios.get(`${baseURL}/v1/public/regions/geojson?simplify=0.002`, { headers });
  cachedData = res.data;
  return cachedData;
}

export function addToMap(map, opacity = 0.5, beforeLayerId = 'v2-blocks-fill') {
  return fetchData().then((data) => {
    removeLayers(map, LAYER_IDS, SOURCE_ID);

    map.addSource(SOURCE_ID, { type: 'geojson', data });

    map.addLayer({
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#5B6830'],
        'fill-opacity': opacity * 0.4,
      },
    }, beforeLayerId);

    map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#5B6830'],
        'line-width': 2,
        'line-opacity': Math.min(opacity + 0.3, 1),
      },
    }, beforeLayerId);

    map.addLayer({
      id: LABEL_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-anchor': 'center',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#2F2F2F',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
        'text-opacity': Math.min(opacity + 0.3, 1),
      },
    }, beforeLayerId);
  });
}

export function removeFromMap(map) {
  removeLayers(map, LAYER_IDS, SOURCE_ID);
}

export function setOpacity(map, opacity) {
  if (map.getLayer(FILL_ID)) {
    map.setPaintProperty(FILL_ID, 'fill-opacity', opacity * 0.4);
  }
  if (map.getLayer(LINE_ID)) {
    map.setPaintProperty(LINE_ID, 'line-opacity', Math.min(opacity + 0.3, 1));
  }
  if (map.getLayer(LABEL_ID)) {
    map.setPaintProperty(LABEL_ID, 'text-opacity', Math.min(opacity + 0.3, 1));
  }
}
