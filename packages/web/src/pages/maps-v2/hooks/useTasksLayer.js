// maps-v2/hooks/useTasksLayer.js — Task markers at block centroids + single GPS track overlay
import { useEffect, useState, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { tasksService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';

const SOURCE_ID = 'v2-tasks';
const LAYER_ID = 'v2-tasks-symbol';
const LAYER_IDS = [LAYER_ID];
const TRACK_SOURCE_ID = 'v2-task-track';
const TRACK_LAYER_ID = 'v2-task-track-line';

/**
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible
 * @param {object|null} blocksData — blocks GeoJSON to place markers at centroids
 * @returns {{ tasks, taskCount, loading, error, refresh, activeTrackId, showTrack, hideTrack }}
 */
export default function useTasksLayer(map, mapReady, visible, blocksData) {
  const [tasks, setTasks] = useState([]);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTrackId, setActiveTrackId] = useState(null);
  const addedRef = useRef(false);
  const trackAddedRef = useRef(false);

  // --- Fetch tasks ---
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await tasksService.listTasks({ limit: 500 });
      const list = Array.isArray(result) ? result : result?.tasks || result?.data || [];
      setTasks(Array.isArray(list) ? list : []);
      setTaskCount(Array.isArray(list) ? list.length : 0);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // --- Build task markers at block centroids ---
  useEffect(() => {
    if (!map || !mapReady || !blocksData) return;

    const addLayers = () => {
      removeLayers(map, LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      if (!visible || tasks.length === 0) return;

      // Group tasks by block_id
      const tasksByBlock = {};
      tasks.forEach((t) => {
        const bid = t.block_id;
        if (bid) {
          if (!tasksByBlock[bid]) tasksByBlock[bid] = [];
          tasksByBlock[bid].push(t);
        }
      });

      // Build point features at block centroids
      const features = [];
      (blocksData.features || []).forEach((block) => {
        const blockId = block.properties?.id;
        if (!blockId || !tasksByBlock[blockId]) return;

        const lng = block.properties?.centroid_longitude;
        const lat = block.properties?.centroid_latitude;
        if (!lng || !lat) return;

        const blockTasks = tasksByBlock[blockId];
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            block_id: blockId,
            block_name: block.properties?.block_name || 'Unknown',
            task_count: blockTasks.length,
            has_active: blockTasks.some((t) => ['in_progress', 'ready', 'scheduled'].includes(t.status)),
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
            'icon-image': [
              'case',
              ['==', ['get', 'has_active'], true],
              'v2-tasks-icon',
              'v2-tasks-icon-inactive',
            ],
            'icon-size': 1,
            'icon-allow-overlap': true,
            'text-field': ['to-string', ['get', 'task_count']],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 10,
            'text-offset': [1.2, 0],
            'text-anchor': 'left',
            'text-allow-overlap': true,
          },
          paint: {
            'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
            'text-color': '#2F2F2F',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
          },
        });

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding tasks layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, LAYER_IDS, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, visible, tasks, blocksData]);

  // --- GPS track overlay (one at a time) ---
  const hideTrack = useCallback(() => {
    if (!map) return;
    removeLayers(map, [TRACK_LAYER_ID], TRACK_SOURCE_ID);
    trackAddedRef.current = false;
    setActiveTrackId(null);
  }, [map]);

  const showTrack = useCallback(async (taskId) => {
    if (!map) return;

    // Remove previous track
    hideTrack();

    try {
      const track = await tasksService.getGpsTrack(taskId);
      if (!track?.coordinates || track.coordinates.length === 0) return;

      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: track.coordinates,
        },
        properties: { task_id: taskId },
      };

      map.addSource(TRACK_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      map.addLayer({
        id: TRACK_LAYER_ID,
        type: 'line',
        source: TRACK_SOURCE_ID,
        paint: {
          'line-color': '#D1583B',
          'line-width': 3,
          'line-opacity': 0.85,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      });

      trackAddedRef.current = true;
      setActiveTrackId(taskId);

      // Fit to track bounds
      const bounds = new mapboxgl.LngLatBounds();
      track.coordinates.forEach((c) => bounds.extend(c));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 800 });
      }
    } catch (err) {
      console.error('Failed to load GPS track:', err);
    }
  }, [map, hideTrack]);

  // Cleanup track on unmount
  useEffect(() => {
    return () => {
      if (trackAddedRef.current && map) {
        removeLayers(map, [TRACK_LAYER_ID], TRACK_SOURCE_ID);
        trackAddedRef.current = false;
      }
    };
  }, [map]);

  return {
    tasks,
    taskCount,
    loading,
    error,
    refresh: fetchTasks,
    activeTrackId,
    showTrack,
    hideTrack,
  };
}
