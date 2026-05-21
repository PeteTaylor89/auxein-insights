// maps-v2/hooks/useAssetsLayer.js — Fetch + render assets as markers on the map
import { useEffect, useState, useCallback, useRef } from 'react';
import { assetService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import { ASSET_LINE_COLORS, ASSET_LINE_DEFAULT, ASSET_LINE_CASING } from '../utils/layerColors';

const SOURCE_ID = 'v2-assets';
const POINT_LAYER_ID = 'v2-assets-points';
const LINE_CASING_LAYER_ID = 'v2-assets-lines-casing';
const LINE_LAYER_ID = 'v2-assets-lines';
const LABEL_LAYER_ID = 'v2-assets-labels';

// Build a Mapbox match expression: lowercased subcategory → colour.
const LINE_COLOR_EXPRESSION = (() => {
  const stops = [];
  Object.entries(ASSET_LINE_COLORS).forEach(([key, colour]) => {
    stops.push(key, colour);
  });
  return [
    'match',
    ['downcase', ['coalesce', ['get', 'subcategory'], '']],
    ...stops,
    ASSET_LINE_DEFAULT,
  ];
})();

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

    const allLayerIds = [POINT_LAYER_ID, LINE_LAYER_ID, LINE_CASING_LAYER_ID, LABEL_LAYER_ID];

    const addLayers = () => {
      removeLayers(map, allLayerIds, SOURCE_ID);
      addedRef.current = false;

      if (!visible) return;

      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: assetsData,
        });

        // Point assets — icon markers (olive wrench)
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'icon-image': 'v2-asset-icon',
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'text-offset': [0, 1.6],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
            'text-color': '#2F2F2F',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
          },
        });

        // Line/polygon assets (irrigation, fences, etc.) — white casing
        // sits under the colour line so it pops against satellite imagery.
        map.addLayer({
          id: LINE_CASING_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['!=', ['geometry-type'], 'Point'],
          paint: {
            'line-color': ASSET_LINE_CASING,
            'line-width': 4,
            'line-opacity': 0.85,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
        }, POINT_LAYER_ID);

        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['!=', ['geometry-type'], 'Point'],
          paint: {
            'line-color': LINE_COLOR_EXPRESSION,
            'line-width': 1.75,
            'line-opacity': 0.95,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
        }, POINT_LAYER_ID);

        // Labels layer no longer needed — included in symbol layer above

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
