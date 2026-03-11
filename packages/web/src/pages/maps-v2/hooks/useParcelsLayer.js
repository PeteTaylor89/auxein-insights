// maps-v2/hooks/useParcelsLayer.js — Viewport-based parcel loading (admin only)
import { useEffect, useState, useCallback, useRef } from 'react';
import { parcelsService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';

const SOURCE_ID = 'v2-land-parcels';
const LAYER_IDS = ['v2-parcels-fill', 'v2-parcels-outline'];
const MIN_ZOOM = 12;
const DEBOUNCE_MS = 400;

/**
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible
 * @param {boolean} isAdmin
 * @returns {{ parcelCount, loading, error }}
 */
export default function useParcelsLayer(map, mapReady, visible, isAdmin) {
  const [parcelCount, setParcelCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);
  const debounceRef = useRef(null);

  // Load parcels for current viewport
  const loadForViewport = useCallback(async () => {
    if (!map || !visible || !isAdmin) return;

    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM) {
      // Too zoomed out — clear data
      if (map.getSource(SOURCE_ID)) {
        map.getSource(SOURCE_ID).setData({ type: 'FeatureCollection', features: [] });
      }
      setParcelCount(0);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await parcelsService.loadParcelsForViewport(map, MIN_ZOOM, false);
      const count = result?.features?.length || 0;
      setParcelCount(count);
    } catch (err) {
      console.error('Failed to load parcels:', err);
      setError(err.message || 'Failed to load parcels');
    } finally {
      setLoading(false);
    }
  }, [map, visible, isAdmin]);

  // Debounced viewport handler
  const onMoveEnd = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadForViewport, DEBOUNCE_MS);
  }, [loadForViewport]);

  // Setup layers + viewport listener
  useEffect(() => {
    if (!map || !mapReady || !isAdmin) return;

    const setup = () => {
      removeLayers(map, LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      if (!visible) return;

      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Insert before blocks so blocks render on top
        const beforeLayer = map.getLayer('v2-blocks-fill') ? 'v2-blocks-fill' : undefined;

        map.addLayer({
          id: 'v2-parcels-fill',
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'has_assignment'], true],
              '#000000',
              '#94a3b8',
            ],
            'fill-opacity': 0.05,
          },
        }, beforeLayer);

        map.addLayer({
          id: 'v2-parcels-outline',
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'has_assignment'], true],
              '#000000',
              '#64748b',
            ],
            'line-width': [
              'case',
              ['==', ['get', 'has_assignment'], true],
              2.5,
              1,
            ],
            'line-opacity': 1,
          },
        }, beforeLayer);

        addedRef.current = true;

        // Initial load
        loadForViewport();

        // Listen for viewport changes
        map.on('moveend', onMoveEnd);
      } catch (err) {
        console.error('Error adding parcels layer:', err);
      }
    };

    setup();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (map) {
        map.off('moveend', onMoveEnd);
        if (addedRef.current) {
          removeLayers(map, LAYER_IDS, SOURCE_ID);
          addedRef.current = false;
        }
      }
    };
  }, [map, mapReady, visible, isAdmin, loadForViewport, onMoveEnd]);

  return { parcelCount, loading, error };
}
