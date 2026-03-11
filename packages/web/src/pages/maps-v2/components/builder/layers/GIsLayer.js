// maps-v2/components/builder/layers/GIsLayer.js — Geographical indications from public API
import axios from 'axios';
import { removeLayers } from '../../../utils/geometry';

const SOURCE_ID = 'v2-builder-gis';
const FILL_ID = 'v2-builder-gis-fill';
const LINE_ID = 'v2-builder-gis-line';
const LABEL_ID = 'v2-builder-gis-label';
const LAYER_IDS = [FILL_ID, LINE_ID, LABEL_ID];

const baseURL = import.meta.env.VITE_API_URL || '/api';

let cachedData = null;

async function fetchData() {
  if (cachedData) return cachedData;
  const headers = {};
  const token = localStorage.getItem('accessToken') || localStorage.getItem('public_access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await axios.get(`${baseURL}/v1/public/gis/geojson?simplify=0.002`, { headers });
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
        'fill-color': ['coalesce', ['get', 'color'], '#D1583B'],
        'fill-opacity': opacity * 0.2,
      },
    }, beforeLayerId);

    map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#D1583B'],
        'line-width': 1.5,
        'line-dasharray': [4, 2],
        'line-opacity': Math.min(opacity + 0.3, 1),
      },
    }, beforeLayerId);

    map.addLayer({
      id: LABEL_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
        'text-size': 10,
        'text-anchor': 'center',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#991b1b',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
        'text-opacity': Math.min(opacity + 0.2, 1),
      },
    }, beforeLayerId);
  });
}

export function removeFromMap(map) {
  removeLayers(map, LAYER_IDS, SOURCE_ID);
}

export function setOpacity(map, opacity) {
  if (map.getLayer(FILL_ID)) {
    map.setPaintProperty(FILL_ID, 'fill-opacity', opacity * 0.2);
  }
  if (map.getLayer(LINE_ID)) {
    map.setPaintProperty(LINE_ID, 'line-opacity', Math.min(opacity + 0.3, 1));
  }
  if (map.getLayer(LABEL_ID)) {
    map.setPaintProperty(LABEL_ID, 'text-opacity', Math.min(opacity + 0.2, 1));
  }
}
