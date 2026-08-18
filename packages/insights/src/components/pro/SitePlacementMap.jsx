// components/pro/SitePlacementMap.jsx — pick the point.
//
// A dedicated map rather than a mode bolted onto the Atlas. Placement is a
// different gesture from browsing a surface — it wants a satellite basemap, a
// confirm step and no scrubber — and threading a mode through `SurfaceMap`
// would put a rarely-used branch inside the component that renders the whole
// free product.
//
// **The touch bridge is not optional.** Tap does not reliably become a click on
// a Mapbox canvas on this platform, and placement is tested on a phone first,
// so a click-only handler would ship a Pro feature that cannot be used in a
// vineyard. Same `touchstart`/`touchend` pattern with a drag guard the Atlas
// zone layer uses.
import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Crosshair } from 'lucide-react';
import './SitePlacementMap.css';

const NZ_BOUNDS = [[165.8, -47.6], [179.4, -33.9]];
// Beyond this a tap is a drag, not a placement.
const DRAG_GUARD_PX = 8;
// Satellite: a grower recognises their own block from the imagery, not from a
// road map. Placement accuracy matters here in a way it does not on the Atlas.
const STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

function SitePlacementMap({ initial, onPick, height = 380 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const setMarker = useCallback((lngLat) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#d1583b', draggable: true })
        .setLngLat(lngLat)
        .addTo(map);
      // Dragging the pin is the natural correction gesture once it is placed,
      // and it costs nothing to support.
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLngLat();
        onPickRef.current?.({ latitude: p.lat, longitude: p.lng });
      });
    } else {
      markerRef.current.setLngLat(lngLat);
    }
  }, []);

  const hasToken = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

  useEffect(() => {
    if (!hasToken || !containerRef.current || mapRef.current) return undefined;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    let map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE,
        bounds: NZ_BOUNDS,
        fitBoundsOptions: { padding: 24 },
      });
    } catch (err) {
      console.warn('SitePlacementMap: failed to initialise', err);
      setFailed(true);
      return undefined;
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }), 'top-right');
    map.on('load', () => setReady(true));

    const pick = (lngLat) => {
      setMarker(lngLat);
      onPickRef.current?.({ latitude: lngLat.lat, longitude: lngLat.lng });
    };

    const onClick = (e) => pick(e.lngLat);

    let touchStart = null;
    const onTouchStart = (e) => {
      touchStart = e.point ? { x: e.point.x, y: e.point.y } : null;
    };
    const onTouchEnd = (e) => {
      if (!touchStart || !e.point) return;
      const moved = Math.hypot(e.point.x - touchStart.x, e.point.y - touchStart.y);
      touchStart = null;
      if (moved > DRAG_GUARD_PX) return;
      pick(e.lngLat);
    };

    map.on('click', onClick);
    map.on('touchstart', onTouchStart);
    map.on('touchend', onTouchEnd);

    return () => {
      map.off('click', onClick);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      setReady(false);
    };
  }, [hasToken, setMarker]);

  // Reflect a position chosen elsewhere — the "use the nearest land cell"
  // offer moves the pin without the user touching the map.
  useEffect(() => {
    if (!ready || !initial) return;
    const lngLat = { lng: initial.longitude, lat: initial.latitude };
    setMarker(lngLat);
    mapRef.current?.easeTo({ center: lngLat, zoom: Math.max(mapRef.current.getZoom(), 12) });
  }, [ready, initial, setMarker]);

  if (!hasToken || failed) {
    return (
      <div className="site-place__fallback" style={{ height }}>
        <p>The map could not be loaded.</p>
        <p className="site-place__hint">
          {hasToken ? 'Mapbox failed to initialise.' : 'No Mapbox token is configured.'}
        </p>
      </div>
    );
  }

  return (
    <div className="site-place">
      <div ref={containerRef} className="site-place__gl" style={{ height }} />
      <p className="site-place__hint">
        <Crosshair size={14} aria-hidden="true" />
        Tap the map to drop a pin on your site, then drag it to fine-tune.
      </p>
    </div>
  );
}

export default SitePlacementMap;
