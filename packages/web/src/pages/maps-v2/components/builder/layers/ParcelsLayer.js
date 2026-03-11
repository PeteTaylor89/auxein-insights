// maps-v2/components/builder/layers/ParcelsLayer.js — Land parcels (admin, viewport-based)
import { parcelsService } from '@vineyard/shared';
import { removeLayers } from '../../../utils/geometry';

const SOURCE_ID = 'v2-builder-parcels';
const FILL_ID = 'v2-builder-parcels-fill';
const LINE_ID = 'v2-builder-parcels-line';
const LAYER_IDS = [FILL_ID, LINE_ID];

let loadCleanup = null;

export function addToMap(map, opacity = 0.5, beforeLayerId = 'v2-blocks-fill') {
  removeLayers(map, LAYER_IDS, SOURCE_ID);

  // Use the viewport-based loader from parcelsService
  const cleanup = parcelsService.loadParcelsForViewport(map, 12);
  loadCleanup = cleanup;

  // The parcelsService adds its own source/layers with different IDs,
  // so we also add builder-specific layers for consistent opacity control
  const onData = () => {
    if (!map.getSource('parcels-source')) return;

    // Add thin builder overlay layers referencing the parcels source
    if (!map.getLayer(FILL_ID)) {
      try {
        map.addLayer({
          id: FILL_ID,
          type: 'fill',
          source: 'parcels-source',
          'source-layer': '',
          paint: {
            'fill-color': '#6366f1',
            'fill-opacity': opacity * 0.1,
          },
        }, beforeLayerId);
      } catch {
        // source may not be geojson type we expect
      }
    }
  };

  map.on('sourcedata', onData);

  return Promise.resolve(() => {
    map.off('sourcedata', onData);
  });
}

export function removeFromMap(map) {
  removeLayers(map, LAYER_IDS, SOURCE_ID);
  if (loadCleanup && typeof loadCleanup === 'function') {
    loadCleanup();
    loadCleanup = null;
  }
}

export function setOpacity(map, opacity) {
  if (map.getLayer(FILL_ID)) {
    map.setPaintProperty(FILL_ID, 'fill-opacity', opacity * 0.1);
  }
}
