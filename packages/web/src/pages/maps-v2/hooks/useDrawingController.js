// maps-v2/hooks/useDrawingController.js — MapboxDraw lifecycle management
import { useEffect, useRef, useCallback, useState } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

const DRAW_STYLES = [
  { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], paint: { 'fill-color': '#5B6830', 'fill-outline-color': '#5B6830', 'fill-opacity': 0.15 } },
  { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#5B6830', 'fill-outline-color': '#5B6830', 'fill-opacity': 0.3 } },
  { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#5B6830', 'line-dasharray': [0.2, 2], 'line-width': 2 } },
  { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#5B6830', 'line-width': 2.5 } },
  { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#5B6830' } },
  { id: 'gl-draw-line-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D1583B', 'line-width': 3 } },
  { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D1583B', 'line-width': 3 } },
  { id: 'gl-draw-vertex-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']], paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-color': '#5B6830' } },
  { id: 'gl-draw-vertex-active', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['==', 'active', 'true']], paint: { 'circle-radius': 7, 'circle-color': '#5B6830' } },
  { id: 'gl-draw-polygon-fill-static', type: 'fill', filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#5B6830', 'fill-outline-color': '#5B6830', 'fill-opacity': 0.15 } },
  { id: 'gl-draw-polygon-stroke-static', type: 'line', filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#5B6830', 'line-width': 2, 'line-dasharray': [0.5, 2] } },
  { id: 'gl-draw-line-static', type: 'line', filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'LineString']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D1583B', 'line-width': 3 } },
];

const DRAFT_SOURCE = 'v2-draw-draft';
const DRAFT_LAYER_FILL = 'v2-draw-draft-fill';
const DRAFT_LAYER_LINE = 'v2-draw-draft-line';

export default function useDrawingController(map, mapReady) {
  const drawRef = useRef(null);
  const [isDrawActive, setIsDrawActive] = useState(false);

  // Initialize draw control on mount — always present on the map
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
      try { map.removeControl(draw); } catch { /* map may already be destroyed */ }
      drawRef.current = null;
    };
  }, [map, mapReady]);

  const startDrawPolygon = useCallback(() => { drawRef.current?.changeMode('draw_polygon'); }, []);
  const startDrawLine = useCallback(() => { drawRef.current?.changeMode('draw_line_string'); }, []);
  const startDirectSelect = useCallback((featureId) => { drawRef.current?.changeMode('direct_select', { featureId }); }, []);
  const resetMode = useCallback(() => { drawRef.current?.changeMode('simple_select'); }, []);
  const deleteAll = useCallback(() => { drawRef.current?.deleteAll(); }, []);
  const addFeature = useCallback((feature) => drawRef.current?.add(feature), []);
  const getFeature = useCallback((featureId) => drawRef.current?.get(featureId), []);

  // Freeze: clear all Draw features and return to simple_select.
  // With no features, Draw in simple_select won't intercept clicks on our layers.
  const freeze = useCallback(() => {
    drawRef.current?.deleteAll();
    drawRef.current?.changeMode('simple_select');
  }, []);

  const showDraft = useCallback((geometry) => {
    if (!map) return;
    clearDraft();
    map.addSource(DRAFT_SOURCE, { type: 'geojson', data: { type: 'Feature', geometry, properties: {} } });
    map.addLayer({ id: DRAFT_LAYER_FILL, type: 'fill', source: DRAFT_SOURCE, paint: { 'fill-color': '#5B6830', 'fill-opacity': 0.2 } });
    map.addLayer({ id: DRAFT_LAYER_LINE, type: 'line', source: DRAFT_SOURCE, paint: { 'line-color': '#5B6830', 'line-width': 2, 'line-dasharray': [3, 2] } });
  }, [map]);

  const clearDraft = useCallback(() => {
    if (!map) return;
    try {
      if (map.getLayer(DRAFT_LAYER_FILL)) map.removeLayer(DRAFT_LAYER_FILL);
      if (map.getLayer(DRAFT_LAYER_LINE)) map.removeLayer(DRAFT_LAYER_LINE);
      if (map.getSource(DRAFT_SOURCE)) map.removeSource(DRAFT_SOURCE);
    } catch { /* ignore */ }
  }, [map]);

  const onDrawCreate = useCallback((handler) => {
    if (!map) return () => {};
    map.on('draw.create', handler);
    return () => map.off('draw.create', handler);
  }, [map]);

  return {
    isDrawActive, startDrawPolygon, startDrawLine, startDirectSelect,
    resetMode, deleteAll, addFeature, getFeature,
    freeze, showDraft, clearDraft, onDrawCreate,
  };
}
