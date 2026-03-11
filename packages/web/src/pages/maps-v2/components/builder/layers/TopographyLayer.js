// maps-v2/components/builder/layers/TopographyLayer.js — Mapbox terrain contours
import { removeLayers } from '../../../utils/geometry';

const SOURCE_ID = 'v2-builder-contours';
const CONTOUR_ID = 'v2-builder-contours-line';
const CONTOUR_LABEL_ID = 'v2-builder-contours-label';
const TERRAIN_SOURCE = 'mapbox-dem';
const LAYER_IDS = [CONTOUR_ID, CONTOUR_LABEL_ID];

export function addToMap(map, opacity = 0.5) {
  removeLayers(map, LAYER_IDS, SOURCE_ID);

  // Add contour source (vector tiles from Mapbox)
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-terrain-v2',
    });
  }

  // Add terrain DEM for hillshade if not present
  if (!map.getSource(TERRAIN_SOURCE)) {
    map.addSource(TERRAIN_SOURCE, {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }

  // Contour lines
  map.addLayer({
    id: CONTOUR_ID,
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'contour',
    paint: {
      'line-color': '#5B6830',
      'line-width': [
        'match',
        ['%', ['get', 'ele'], 100],
        0, 1.2,  // major contours (every 100m)
        0.5,      // minor contours
      ],
      'line-opacity': opacity * 0.6,
    },
    filter: ['>', 'ele', 0],
  });

  // Contour labels (major only)
  map.addLayer({
    id: CONTOUR_LABEL_ID,
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'contour',
    layout: {
      'text-field': ['concat', ['to-string', ['get', 'ele']], 'm'],
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': 9,
      'symbol-placement': 'line',
      'text-max-angle': 25,
      'text-padding': 5,
    },
    paint: {
      'text-color': '#5B6830',
      'text-halo-color': 'rgba(255,255,255,0.8)',
      'text-halo-width': 1,
      'text-opacity': opacity * 0.7,
    },
    filter: ['==', ['%', ['get', 'ele'], 100], 0],
  });

  return Promise.resolve();
}

export function removeFromMap(map) {
  removeLayers(map, LAYER_IDS, SOURCE_ID);
}

export function setOpacity(map, opacity) {
  if (map.getLayer(CONTOUR_ID)) {
    map.setPaintProperty(CONTOUR_ID, 'line-opacity', opacity * 0.6);
  }
  if (map.getLayer(CONTOUR_LABEL_ID)) {
    map.setPaintProperty(CONTOUR_LABEL_ID, 'text-opacity', opacity * 0.7);
  }
}
