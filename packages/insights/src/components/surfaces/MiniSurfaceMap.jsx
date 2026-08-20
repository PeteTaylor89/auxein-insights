// components/surfaces/MiniSurfaceMap.jsx — the home page's climate surface.
//
// Deliberately not a small copy of the Atlas. It is a non-interactive preview
// whose entire job is to put the actual product on screen in the first viewport
// and hand the visitor to /map (PLATFORM_PLAN §5.4: value visible in 30 seconds
// without signup). No scrubber, no variable switcher, no popups — every control
// belongs on the Atlas.
//
// It degrades to a still card rather than disappearing: no Mapbox token, no
// surfaces enabled, or no date with a surface all end in something that still
// reads as "there is a national climate map here" and still links onward. A
// blank hole in the first screen is worse than a plain one.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { Map as MapIcon, ArrowRight } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';
import useSurfaceAvailability from '../../hooks/useSurfaceAvailability';
import {
  tileUrlTemplate,
  SURFACE_VARIABLES,
  DEFAULT_STATISTIC,
} from '../../services/surfaceService';
import './MiniSurfaceMap.css';

// Mainland NZ plus enough margin that the fitted view is not cropped tight.
const NZ_BOUNDS = [[165.8, -47.6], [179.4, -33.9]];

// The published archive is monthly, so `latest` is a 'YYYY-MM' stamp rather
// than a full date. Rendering it as a day would invent precision the surface
// does not have — a monthly mean is not a measurement on the 1st.
function formatMonth(stamp) {
  if (!stamp) return '';
  const [y, m] = String(stamp).split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return Number.isNaN(d.getTime())
    ? stamp
    : d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function MiniSurfaceMap({ variable = 'temp_mean', to = '/map' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapFailed, setMapFailed] = useState(false);
  const statistic = DEFAULT_STATISTIC[variable] || 'mean';
  const { latest, unavailable, loading, isStub } =
    useSurfaceAvailability(variable, 'monthly', statistic);

  const meta = SURFACE_VARIABLES[variable] || {};
  const hasToken = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);
  const canRenderMap = hasToken && !unavailable && !mapFailed && Boolean(latest);

  useEffect(() => {
    if (!canRenderMap || !containerRef.current || mapRef.current) return undefined;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    let map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        bounds: NZ_BOUNDS,
        fitBoundsOptions: { padding: 8 },
        interactive: false,
        attributionControl: false,
      });
    } catch (err) {
      console.warn('MiniSurfaceMap: map failed to initialise', err);
      setMapFailed(true);
      return undefined;
    }

    mapRef.current = map;
    map.on('error', (e) => console.warn('MiniSurfaceMap:', e?.error?.message || e));

    map.on('load', () => {
      map.addSource('surface', {
        type: 'raster',
        tiles: [tileUrlTemplate({
          variable, valid_at: latest, granularity: 'monthly', statistic,
        })],
        tileSize: 256,
        bounds: [NZ_BOUNDS[0][0], NZ_BOUNDS[0][1], NZ_BOUNDS[1][0], NZ_BOUNDS[1][1]],
        maxzoom: 12,
      });
      map.addLayer({
        id: 'surface',
        type: 'raster',
        source: 'surface',
        paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 200 },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [canRenderMap, variable, statistic, latest]);

  return (
    <Link to={to} className="mini-surface-map" aria-label={`${meta.label || variable} surface — open the Atlas`}>
      <div className="mini-surface-map__canvas">
        {canRenderMap ? (
          <div ref={containerRef} className="mini-surface-map__gl" />
        ) : (
          <div className="mini-surface-map__placeholder">
            <MapIcon size={30} aria-hidden="true" />
            <span>{loading ? 'Loading the national surface…' : 'National climate surface'}</span>
          </div>
        )}
        <div className="mini-surface-map__scrim" aria-hidden="true" />
      </div>

      <div className="mini-surface-map__caption">
        <div className="mini-surface-map__labels">
          {/* The pitch, not the label. "Mean temperature, July 2023" describes
              what is on screen; it does not give anyone a reason to click. A
              cold visitor does not yet know what 500 m resolution buys them,
              so the line promises the ACTION instead of the specification.
              Swappable in one string — the alternatives considered were
              "Every hectare of New Zealand, at 500 m" and "38 years of
              climate, mapped to your block", both of which land better once
              the reader already knows what this is. */}
          <strong className="mini-surface-map__pitch">
            Explore NZ's climate, current conditions, and projections
          </strong>
          <span className="mini-surface-map__meta">
            {meta.label || variable}
            {latest && <> &middot; {formatMonth(latest)}</>}
          </span>
          {isStub && <span className="mini-surface-map__demo">demo data</span>}
        </div>
        <span className="mini-surface-map__cta">
          Open the Atlas
          <ArrowRight size={15} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

export default MiniSurfaceMap;
