// maps-v2/hooks/useSpatialAreasLayer.js — Fetch + render spatial areas as fill polygons
import { useEffect, useState, useCallback, useRef } from 'react';
import { spatialAreasService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';

const SOURCE_ID = 'v2-spatial-areas';
const LAYER_IDS = ['v2-spatial-fill', 'v2-spatial-outline', 'v2-spatial-labels'];

/**
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible
 * @returns {{ spatialData, areaCount, loading, error, refresh }}
 */
export default function useSpatialAreasLayer(map, mapReady, visible) {
  const [spatialData, setSpatialData] = useState(null);
  const [areaCount, setAreaCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);

  const fetchAreas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const geojson = await spatialAreasService.getSpatialAreasGeoJSON();
      setSpatialData(geojson);
      setAreaCount(geojson?.features?.length || 0);
    } catch (err) {
      console.error('Failed to fetch spatial areas:', err);
      setError(err.message || 'Failed to load spatial areas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  useEffect(() => {
    if (!map || !mapReady || !spatialData) return;

    const addLayers = () => {
      removeLayers(map, LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      if (!visible) return;

      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: spatialData,
        });

        // Insert before blocks outline if it exists, so blocks render on top
        const beforeLayer = map.getLayer('v2-blocks-outline') ? 'v2-blocks-outline' : undefined;

        map.addLayer({
          id: 'v2-spatial-fill',
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': '#b0e9c5',
            'fill-opacity': 0.18,
          },
        }, beforeLayer);

        map.addLayer({
          id: 'v2-spatial-outline',
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': 'rgba(0, 0, 0, 1)',
            'line-width': 3,
            'line-dasharray': [3, 1],
            'line-opacity': 0.5,
          },
        }, beforeLayer);

        map.addLayer({
          id: 'v2-spatial-labels',
          type: 'symbol',
          source: SOURCE_ID,
          minzoom: 12,
          layout: {
            'text-field': ['coalesce', ['get', 'name'], ['get', 'label']],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 0],
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        }, beforeLayer);

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding spatial areas layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, LAYER_IDS, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, spatialData, visible]);

  return { spatialData, areaCount, loading, error, refresh: fetchAreas };
}
