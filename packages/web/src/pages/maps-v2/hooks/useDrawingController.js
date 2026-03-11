// maps-v2/hooks/useDrawingController.js — MapboxDraw lifecycle management
import { useEffect, useRef, useCallback, useState } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

const DRAW_STYLES = [
  // Inactive polygon fill
  {
    id: 'gl-draw-polygon-fill-inactive',
    type: 'fill',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    paint: { 'fill-color': '#5B6830', 'fill-outline-color': '#5B6830', 'fill-opacity': 0.15 },
  },
  // Active polygon fill
  {
    id: 'gl-draw-polygon-fill-active',
    type: 'fill',
    filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
    paint: { 'fill-color': '#5B6830', 'fill-outline-color': '#5B6830', 'fill-opacity': 0.3 },
  },
  // Inactive polygon outline
  {
    id: 'gl-draw-polygon-stroke-inactive',
    type: 'line',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5B6830', 'line-dasharray': [0.2, 2], 'line-width': 2 },
  },
  // Active polygon outline
  {
    id: 'gl-draw-polygon-stroke-active',
    type: 'line',
    filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5B6830', 'line-width': 2.5 },
  },
  // Midpoints
  {
    id: 'gl-draw-polygon-midpoint',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: { 'circle-radius': 4, 'circle-color': '#5B6830' },
  },
  // Inactive line (red for split)
  {
    id: 'gl-draw-line-inactive',
    type: 'line',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#D1583B', 'line-width': 3 },
  },
  // Active line
  {
    id: 'gl-draw-line-active',
    type: 'line',
    filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#D1583B', 'line-width': 3 },
  },
  // Vertex points (inactive)
  {
    id: 'gl-draw-point-inactive',
    type: 'circle',
    filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
    paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#5B6830', 'circle-stroke-width': 2 },
  },
  // Vertex points (active)
  {
    id: 'gl-draw-point-active',
    type: 'circle',
    filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint']],
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#D1583B', 'circle-stroke-width': 2 },
  },
  // Static polygon fill (for draft preview in simple_select mode)
  {
    id: 'gl-draw-polygon-fill-static',
    type: 'fill',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
    paint: { 'fill-color': '#5B6830', 'fill-outline-color': '#5B6830', 'fill-opacity': 0.15 },
  },
  // Static polygon outline
  {
    id: 'gl-draw-polygon-stroke-static',
    type: 'line',
    filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5B6830', 'line-width': 2, 'line-dasharray': [0.2, 2] },
  },
];

const DRAFT_SOURCE = 'v2-draft-geometry';
const DRAFT_FILL = 'v2-draft-fill';
const DRAFT_LINE = 'v2-draft-line';

/**
 * Hook that manages MapboxDraw lifecycle on the map.
 *
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @returns drawing controller API
 */
export default function useDrawingController(map, mapReady) {
  const drawRef = useRef(null);
  const [isDrawActive, setIsDrawActive] = useState(false);

  // Initialize draw control
  useEffect(() => {
    if (!map || !mapReady) return;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, line_string: false, trash: false },
      styles: DRAW_STYLES,
    });

    map.addControl(draw, 'top-right');
    drawRef.current = draw;
    setIsDrawActive(true);

    return () => {
      setIsDrawActive(false);
      try {
        map.removeControl(draw);
      } catch {
        // map may already be destroyed
      }
      drawRef.current = null;
    };
  }, [map, mapReady]);

  // Start drawing a polygon
  const startDrawPolygon = useCallback(() => {
    drawRef.current?.changeMode('draw_polygon');
  }, []);

  // Start drawing a line (for split)
  const startDrawLine = useCallback(() => {
    drawRef.current?.changeMode('draw_line_string');
  }, []);

  // Enter direct_select mode to edit vertices of a feature
  const startDirectSelect = useCallback((featureId) => {
    drawRef.current?.changeMode('direct_select', { featureId });
  }, []);

  // Go back to simple_select (idle)
  const resetMode = useCallback(() => {
    drawRef.current?.changeMode('simple_select');
  }, []);

  // Delete all drawn features
  const deleteAll = useCallback(() => {
    drawRef.current?.deleteAll();
  }, []);

  // Add a feature to draw (for editing existing geometry)
  const addFeature = useCallback((feature) => {
    return drawRef.current?.add(feature);
  }, []);

  // Get a feature by ID from draw
  const getFeature = useCallback((featureId) => {
    return drawRef.current?.get(featureId);
  }, []);

  // Freeze drawing: clear everything and go to simple_select
  const freeze = useCallback(() => {
    drawRef.current?.deleteAll();
    drawRef.current?.changeMode('simple_select');
  }, []);

  // Show a static draft polygon on the map (outside of draw)
  const showDraft = useCallback((geometry) => {
    if (!map) return;
    clearDraft();

    map.addSource(DRAFT_SOURCE, {
      type: 'geojson',
      data: { type: 'Feature', geometry, properties: {} },
    });

    map.addLayer({
      id: DRAFT_FILL,
      type: 'fill',
      source: DRAFT_SOURCE,
      paint: { 'fill-color': '#5B6830', 'fill-opacity': 0.2 },
    });

    map.addLayer({
      id: DRAFT_LINE,
      type: 'line',
      source: DRAFT_SOURCE,
      paint: { 'line-color': '#5B6830', 'line-width': 2 },
    });
  }, [map]);

  // Clear the static draft polygon
  const clearDraft = useCallback(() => {
    if (!map) return;
    try {
      if (map.getLayer(DRAFT_FILL)) map.removeLayer(DRAFT_FILL);
      if (map.getLayer(DRAFT_LINE)) map.removeLayer(DRAFT_LINE);
      if (map.getSource(DRAFT_SOURCE)) map.removeSource(DRAFT_SOURCE);
    } catch {
      // layers may not exist
    }
  }, [map]);

  // Register event listeners (returns cleanup fn)
  const onDrawCreate = useCallback((handler) => {
    if (!map) return () => {};
    map.on('draw.create', handler);
    return () => map.off('draw.create', handler);
  }, [map]);

  const onDrawUpdate = useCallback((handler) => {
    if (!map) return () => {};
    map.on('draw.update', handler);
    return () => map.off('draw.update', handler);
  }, [map]);

  const onDrawDelete = useCallback((handler) => {
    if (!map) return () => {};
    map.on('draw.delete', handler);
    return () => map.off('draw.delete', handler);
  }, [map]);

  const onDrawSelectionChange = useCallback((handler) => {
    if (!map) return () => {};
    map.on('draw.selectionchange', handler);
    return () => map.off('draw.selectionchange', handler);
  }, [map]);

  return {
    draw: drawRef,
    isDrawActive,
    startDrawPolygon,
    startDrawLine,
    startDirectSelect,
    resetMode,
    deleteAll,
    addFeature,
    getFeature,
    freeze,
    showDraft,
    clearDraft,
    onDrawCreate,
    onDrawUpdate,
    onDrawDelete,
    onDrawSelectionChange,
  };
}
