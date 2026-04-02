// maps-v2/hooks/useAssetsLayer.js — Fetch + render assets as markers on the map
import { useEffect, useState, useCallback, useRef } from 'react';
import { assetService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import { ASSET_COLORS } from '../utils/layerColors';

const SOURCE_ID = 'v2-assets';
const POINT_LAYER_ID = 'v2-assets-points';
const LINE_LAYER_ID = 'v2-assets-lines';
const LABEL_LAYER_ID = 'v2-assets-labels';

/**
 * Hook that manages the assets layer on the map.
 *
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible — whether the layer is toggled on
 * @returns {{ assetsData, assetCount, loading, error, refresh }}
 */
export default function useAssetsLayer(map, mapReady, visible) {
  const [assetsData, setAssetsData] = useState(null);
  const [assetCount, setAssetCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);

  // --- Fetch ---
  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const geojson = await assetService.getAssetsGeoJSON();
      setAssetsData(geojson);
      setAssetCount(geojson?.features?.length || 0);
    } catch (err) {
      console.error('Failed to fetch assets GeoJSON:', err);
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // --- Render layer ---
  useEffect(() => {
    if (!map || !mapReady || !assetsData) return;

    const allLayerIds = [POINT_LAYER_ID, LINE_LAYER_ID, LABEL_LAYER_ID];

    const addLayers = () => {
      removeLayers(map, allLayerIds, SOURCE_ID);
      addedRef.current = false;

      if (!visible) return;

      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: assetsData,
        });

        // Point assets — circle markers coloured by category
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': [
              'match',
              ['get', 'category'],
              'equipment', ASSET_COLORS.equipment,
              'vehicle', ASSET_COLORS.vehicle,
              'tool', ASSET_COLORS.tool,
              'infrastructure', ASSET_COLORS.infrastructure,
              'consumable', ASSET_COLORS.consumable,
              '#6b7280',
            ],
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              8, 4,
              12, 7,
              16, 10,
            ],
            'circle-opacity': 0.85,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        });

        // Line/polygon assets (irrigation, fences, etc.)
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['!=', ['geometry-type'], 'Point'],
          paint: {
            'line-color': ASSET_COLORS.infrastructure,
            'line-width': 2.5,
            'line-dasharray': [3, 2],
            'line-opacity': 0.8,
          },
        });

        // Labels on zoom
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Point'],
          minzoom: 14,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        });

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding assets layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, allLayerIds, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, assetsData, visible]);

  return { assetsData, assetCount, loading, error, refresh: fetchAssets };
}
