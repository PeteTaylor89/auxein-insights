// maps-v2/hooks/useGpsTracksLayer.js — Recent GPS tracks (last 30d) rendered
// as status-coloured LineStrings with white casing for satellite contrast.
import { useEffect, useState, useCallback, useRef } from 'react';
import { tasksService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import {
  GPS_TRACK_COLORS,
  GPS_TRACK_DEFAULT,
  GPS_TRACK_CASING,
} from '../utils/layerColors';

const SOURCE_ID = 'v2-gps-tracks';
const CASING_LAYER_ID = 'v2-gps-tracks-casing';
const LINE_LAYER_ID = 'v2-gps-tracks-line';

// Mapbox match expression on status → colour.
const LINE_COLOR_EXPRESSION = (() => {
  const stops = [];
  Object.entries(GPS_TRACK_COLORS).forEach(([key, colour]) => {
    stops.push(key, colour);
  });
  return [
    'match',
    ['coalesce', ['get', 'status'], 'completed'],
    ...stops,
    GPS_TRACK_DEFAULT,
  ];
})();

// Cancelled and draft tracks dim to reduce visual noise.
const LINE_OPACITY_EXPRESSION = [
  'match',
  ['coalesce', ['get', 'status'], 'completed'],
  'cancelled', 0.4,
  'draft', 0.5,
  0.9,
];

/**
 * Hook that fetches recent GPS tracks and renders them as a dedicated layer.
 *
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible — whether the layer is toggled on
 * @param {number} days — look-back window (default 30)
 * @returns {{ tracksData, trackCount, loading, error, refresh }}
 */
export default function useGpsTracksLayer(map, mapReady, visible, days = 30) {
  const [tracksData, setTracksData] = useState(null);
  const [trackCount, setTrackCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);

  // Fetch on toggle-on so an unused layer doesn't pay the cost.
  const fetchTracks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fc = await tasksService.getRecentGpsTracksGeoJSON(days);
      setTracksData(fc);
      setTrackCount(fc?.features?.length || 0);
    } catch (err) {
      console.error('Failed to fetch GPS tracks:', err);
      setError(err.message || 'Failed to load GPS tracks');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!visible) return;
    fetchTracks();
  }, [visible, fetchTracks]);

  // Render
  useEffect(() => {
    if (!map || !mapReady) return;

    const layerIds = [LINE_LAYER_ID, CASING_LAYER_ID];

    const addLayers = () => {
      removeLayers(map, layerIds, SOURCE_ID);
      addedRef.current = false;

      if (!visible || !tracksData || !tracksData.features?.length) return;

      try {
        map.addSource(SOURCE_ID, { type: 'geojson', data: tracksData });

        map.addLayer({
          id: CASING_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': GPS_TRACK_CASING,
            'line-width': 5,
            'line-opacity': 0.8,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });

        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': LINE_COLOR_EXPRESSION,
            'line-width': 2.5,
            'line-opacity': LINE_OPACITY_EXPRESSION,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding GPS tracks layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, layerIds, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, visible, tracksData]);

  return { tracksData, trackCount, loading, error, refresh: fetchTracks };
}
