// maps-v2/hooks/useObservationsLayer.js — Observation markers at block centroids
import { useEffect, useState, useCallback, useRef } from 'react';
import { observationService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';

const SOURCE_ID = 'v2-observations';
const LAYER_ID = 'v2-observations-symbol';
const LAYER_IDS = [LAYER_ID];

/**
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible
 * @param {object|null} blocksData — blocks GeoJSON for centroid placement
 * @returns {{ observations, obsCount, loading, error, refresh }}
 */
export default function useObservationsLayer(map, mapReady, visible, blocksData) {
  const [observations, setObservations] = useState([]);
  const [obsCount, setObsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);

  // --- Fetch observation runs ---
  const fetchObservations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await observationService.listRuns({ limit: 500 });
      const list = result?.runs || result || [];
      const arr = Array.isArray(list) ? list : [];
      setObservations(arr);
      setObsCount(arr.length);
    } catch (err) {
      console.error('Failed to fetch observations:', err);
      setError(err.message || 'Failed to load observations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  // --- Render markers at block centroids ---
  useEffect(() => {
    if (!map || !mapReady || !blocksData) return;

    const addLayers = () => {
      removeLayers(map, LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      if (!visible || observations.length === 0) return;

      // Group observations by block_id
      const obsByBlock = {};
      observations.forEach((o) => {
        const bid = o.block_id;
        if (bid) {
          if (!obsByBlock[bid]) obsByBlock[bid] = [];
          obsByBlock[bid].push(o);
        }
      });

      // Build point features
      const features = [];
      (blocksData.features || []).forEach((block) => {
        const blockId = block.properties?.id;
        if (!blockId || !obsByBlock[blockId]) return;

        const lng = block.properties?.centroid_longitude;
        const lat = block.properties?.centroid_latitude;
        if (!lng || !lat) return;

        const blockObs = obsByBlock[blockId];
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            block_id: blockId,
            block_name: block.properties?.block_name || 'Unknown',
            obs_count: blockObs.length,
            latest_date: blockObs
              .map((o) => o.started_at || o.created_at)
              .filter(Boolean)
              .sort()
              .reverse()[0] || '',
          },
        });
      });

      if (features.length === 0) return;

      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });

        map.addLayer({
          id: LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'icon-image': 'v2-obs-icon',
            'icon-size': 0.9,
            'icon-offset': [0, 20], // push icon below block label
            'icon-allow-overlap': true,
            'text-field': ['to-string', ['get', 'obs_count']],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 10,
            'text-offset': [1.2, 1.6],
            'text-anchor': 'left',
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#2F2F2F',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        });

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding observations layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, LAYER_IDS, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, visible, observations, blocksData]);

  return { observations, obsCount, loading, error, refresh: fetchObservations };
}
