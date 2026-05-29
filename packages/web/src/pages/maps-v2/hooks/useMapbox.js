// maps-v2/hooks/useMapbox.js — Mapbox GL instance lifecycle
import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAP_STYLES,
  DEFAULT_STYLE,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  TERRAIN_SOURCE,
  SKY_LAYER,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '../utils/mapStyles';
import { registerMapIcons } from '../utils/mapIcons';

// Token — same pattern as existing Maps.jsx
const __MAPBOX_TOKEN__ =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_TOKEN) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN) ||
  'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';

if (__MAPBOX_TOKEN__) {
  mapboxgl.accessToken = __MAPBOX_TOKEN__;
} else {
  console.error('Missing Mapbox token. Set VITE_MAPBOX_TOKEN in your .env.');
}

/**
 * Hook that manages the Mapbox GL map instance.
 *
 * Returns:
 *   map           — the mapboxgl.Map instance (null until loaded)
 *   mapReady      — true once style.load has fired
 *   activeStyle   — current style object from MAP_STYLES
 *   is3D          — whether 3D terrain is active
 *   setStyle      — change the map style by id
 *   containerRef  — ref to attach to the map container div
 */
export default function useMapbox() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeStyle, setActiveStyle] = useState(DEFAULT_STYLE);
  const [is3D, setIs3D] = useState(false);

  // --- Terrain helpers ---
  const add3DTerrain = useCallback((m) => {
    try {
      if (!m.getSource(TERRAIN_SOURCE.id)) {
        m.addSource(TERRAIN_SOURCE.id, {
          type: TERRAIN_SOURCE.type,
          url: TERRAIN_SOURCE.url,
          tileSize: TERRAIN_SOURCE.tileSize,
          maxzoom: TERRAIN_SOURCE.maxzoom,
        });
      }
      m.setTerrain({ source: TERRAIN_SOURCE.id, exaggeration: DEFAULT_TERRAIN_EXAGGERATION });
      if (!m.getLayer(SKY_LAYER.id)) {
        m.addLayer(SKY_LAYER);
      }
      m.easeTo({ pitch: 45, duration: 500 });
    } catch (e) {
      console.warn('add3DTerrain error:', e);
    }
  }, []);

  const remove3DTerrain = useCallback((m) => {
    try {
      m.setTerrain(null);
      if (m.getLayer(SKY_LAYER.id)) m.removeLayer(SKY_LAYER.id);
      if (m.getSource(TERRAIN_SOURCE.id)) m.removeSource(TERRAIN_SOURCE.id);
      m.easeTo({ pitch: 0, duration: 500 });
    } catch (e) {
      console.warn('remove3DTerrain error:', e);
    }
  }, []);

  // --- Init ---
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE.url,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      antialias: true,
      // Finger taps drift more than the 3px default before lift-off, so Mapbox
      // treats them as tiny pans and never fires `click` — feature popups never
      // open on iPad/touch. A wider tolerance lets taps register as clicks.
      clickTolerance: 10,
    });

    m.addControl(new mapboxgl.NavigationControl(), 'top-right');
    m.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'top-right',
    );
    m.addControl(new mapboxgl.ScaleControl({ maxWidth: 150 }), 'bottom-right');

    m.on('style.load', () => {
      registerMapIcons(m);
      setMapReady(true);
    });

    mapRef.current = m;
    setMapInstance(m);

    return () => {
      m.remove();
      mapRef.current = null;
      setMapInstance(null);
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Style switching ---
  const setStyle = useCallback(
    (styleId) => {
      const m = mapRef.current;
      if (!m) return;

      const selected = MAP_STYLES.find((s) => s.id === styleId);
      if (!selected) return;

      const wants3D = !!selected.is3D;
      setActiveStyle(selected);
      setIs3D(wants3D);
      setMapReady(false);

      // Clear terrain before swapping
      try { m.setTerrain(null); } catch {}
      try { if (m.getLayer('sky')) m.removeLayer('sky'); } catch {}
      try { if (m.getSource('mapbox-dem')) m.removeSource('mapbox-dem'); } catch {}

      m.setStyle(selected.url);

      m.once('style.load', () => {
        registerMapIcons(m);
        if (wants3D) {
          add3DTerrain(m);
          m.once('idle', () => setMapReady(true));
        } else {
          remove3DTerrain(m);
          setMapReady(true);
        }
      });
    },
    [add3DTerrain, remove3DTerrain],
  );

  return {
    map: mapInstance,
    mapRef,
    mapReady,
    activeStyle,
    is3D,
    setStyle,
    containerRef,
  };
}
