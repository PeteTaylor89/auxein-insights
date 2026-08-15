// components/surfaces/SurfaceMap.jsx — the Atlas. The climate surface itself.
//
// This is the first thing on the site that renders the actual product: 500 m
// national interpolated climate surfaces, 1986-01 to 2023-12, served as PNG
// tiles from COGs on S3 via `/api/v1/surfaces/tiles`.
//
// Three things here are load-bearing and easy to undo by accident:
//
// 1. **The colour domain comes from the server, never from the data in view.**
//    `available.meta.domain` is a fixed per-(variable, statistic) range measured
//    from the archive. If the legend invented its own scale it would disagree
//    with the tiles it labels, and scrubbing January to July would recolour
//    rather than change — hiding the seasonal cycle, which is the single most
//    obvious thing this map exists to show.
//
// 2. **The scrubber steps through months the archive actually holds**, from
//    `available.steps`, rather than counting calendar months. A gap must grey
//    out, not 404.
//
// 3. **Confidence travels with the month on screen.** Each step carries its own
//    cv_rmse, and rainfall's is dimensionless (`cv_units: 'ratio'`), so it is
//    suppressed rather than mislabelled as millimetres.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Play, Pause } from 'lucide-react';
import useSurfaceAvailability from '../../hooks/useSurfaceAvailability';
import {
  tileUrlTemplate,
  SURFACE_VARIABLES,
  DEFAULT_STATISTIC,
} from '../../services/surfaceService';
import './SurfaceMap.css';

const NZ_BOUNDS = [[165.8, -47.6], [179.4, -33.9]];
const VARIABLES = ['temp_mean', 'temp_min', 'temp_max', 'rainfall'];
const SOURCE_ID = 'climate-surface';
const PLAY_MS = 420;

// Statistics worth putting in front of a visitor. The archive publishes more
// (argmin_day, wet_top3, ...) but those are analysis bands, not map layers, and
// a day-of-month index on a continuous ramp reads as noise.
const FEATURED_STATISTICS = {
  temp_mean: ['mean', 'min', 'max', 'sd'],
  temp_min: ['mean', 'frost_days', 'min'],
  temp_max: ['mean', 'days_over_25', 'days_over_30', 'max'],
  rainfall: ['sum', 'wet_days', 'max', 'max_dry_spell'],
};

const STAT_LABELS = {
  mean: 'Mean', median: 'Median', min: 'Coldest day', max: 'Warmest day',
  sd: 'Variability', sum: 'Total', wet_days: 'Wet days',
  frost_days: 'Frost days', days_over_25: 'Days over 25', days_over_30: 'Days over 30',
  max_dry_spell: 'Longest dry spell',
};

// Statistics whose unit is not the variable's own unit. Without this a count of
// frost days renders as "12 C".
const COUNT_STATISTICS = new Set([
  'frost_days', 'wet_days', 'days_over_25', 'days_over_30',
  'days_over_10mm', 'days_over_25mm', 'max_dry_spell',
]);

function statLabel(stat) {
  return STAT_LABELS[stat] || stat.replace(/_/g, ' ');
}

function monthLabel(stamp) {
  if (!stamp) return '';
  const [y, m] = stamp.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return Number.isNaN(d.getTime())
    ? stamp
    : d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function unitFor(variable, statistic) {
  if (COUNT_STATISTICS.has(statistic)) return 'days';
  return SURFACE_VARIABLES[variable]?.unit || '';
}

function SurfaceMap() {
  const [variable, setVariable] = useState('temp_mean');
  const [statistic, setStatistic] = useState(DEFAULT_STATISTIC.temp_mean);
  const [index, setIndex] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const containerRef = useRef(null);
  const mapRef = useRef(null);

  const { available, loading, unavailable, months, error } =
    useSurfaceAvailability(variable, 'monthly', statistic);

  const steps = available?.meta?.steps ?? [];
  const domain = available?.meta?.domain ?? null;
  const unit = unitFor(variable, statistic);

  // Land on the most recent month whenever the layer changes, and keep the
  // index in range — statistics do not all cover the same span.
  useEffect(() => {
    if (!months.length) { setIndex(null); return; }
    setIndex((prev) => (prev == null || prev > months.length - 1 ? months.length - 1 : prev));
  }, [months]);

  const current = index != null && months[index] ? months[index] : null;
  const currentStep = useMemo(
    () => steps.find((s) => s.valid_at === current) || null,
    [steps, current],
  );

  const availableStatistics = available?.meta?.statistics ?? [];
  const statisticOptions = useMemo(() => {
    const featured = FEATURED_STATISTICS[variable] || ['mean'];
    // Only offer what the archive actually publishes for this variable —
    // temp_mean has no frost_days, and offering it would 404 the tiles.
    return featured.filter((s) => !availableStatistics.length || availableStatistics.includes(s));
  }, [variable, availableStatistics]);

  const handleVariable = useCallback((next) => {
    setVariable(next);
    setStatistic(DEFAULT_STATISTIC[next] || 'mean');
  }, []);

  // --- map ------------------------------------------------------------------
  const hasToken = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

  useEffect(() => {
    if (!hasToken || !containerRef.current || mapRef.current) return undefined;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    let map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        bounds: NZ_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        attributionControl: true,
      });
    } catch (err) {
      console.warn('SurfaceMap: map failed to initialise', err);
      setMapFailed(true);
      return undefined;
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('error', (e) => console.warn('SurfaceMap:', e?.error?.message || e));
    map.on('load', () => setMapReady(true));

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [hasToken]);

  // Swap the raster source whenever the layer or the month changes. Mapbox has
  // no "change the tile URL" operation, so the source is removed and re-added.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !current) return;

    const url = tileUrlTemplate({
      variable, valid_at: current, granularity: 'monthly', statistic,
    });

    if (map.getLayer(SOURCE_ID)) map.removeLayer(SOURCE_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    map.addSource(SOURCE_ID, {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      bounds: [NZ_BOUNDS[0][0], NZ_BOUNDS[0][1], NZ_BOUNDS[1][0], NZ_BOUNDS[1][1]],
      maxzoom: 12,
    });
    map.addLayer({
      id: SOURCE_ID,
      type: 'raster',
      source: SOURCE_ID,
      paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 150 },
    });
  }, [mapReady, variable, statistic, current]);

  // --- playback -------------------------------------------------------------
  useEffect(() => {
    if (!playing || !months.length) return undefined;
    const timer = setInterval(() => {
      setIndex((prev) => (prev == null || prev >= months.length - 1 ? 0 : prev + 1));
    }, PLAY_MS);
    return () => clearInterval(timer);
  }, [playing, months.length]);

  // --- confidence -----------------------------------------------------------
  // Rainfall is fitted in ratio space, so its cv_rmse is dimensionless. Showing
  // it beside a millimetre map would imply accuracy ~1000x better than reality.
  const cvIsPublishable =
    currentStep?.cv_rmse != null &&
    currentStep.cv_units === SURFACE_VARIABLES[variable]?.unit &&
    !COUNT_STATISTICS.has(statistic);

  const legendTicks = useMemo(() => {
    if (!domain) return [];
    const { min, max } = domain;
    return [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
  }, [domain]);

  const rampCss = useMemo(() => {
    if (!domain?.stops?.length) return 'linear-gradient(90deg, #eee, #999)';
    const stops = domain.stops.map(
      ([r, g, b], i) => `rgb(${r},${g},${b}) ${(i / (domain.stops.length - 1)) * 100}%`,
    );
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [domain]);

  if (unavailable) {
    return (
      <div className="surface-map surface-map--empty">
        <p>The climate surfaces are not available right now.</p>
      </div>
    );
  }

  return (
    <div className="surface-map">
      <div className="surface-map__canvas">
        {hasToken && !mapFailed ? (
          <div ref={containerRef} className="surface-map__gl" />
        ) : (
          <div className="surface-map__placeholder">
            <p>The map could not be loaded.</p>
            <p className="surface-map__hint">
              {hasToken ? 'Mapbox failed to initialise.' : 'No Mapbox token is configured.'}
            </p>
          </div>
        )}

        {domain && (
          <div className="surface-map__legend" aria-hidden="true">
            <div className="surface-map__ramp" style={{ background: rampCss }} />
            <div className="surface-map__ticks">
              {legendTicks.map((t) => (
                <span key={t}>{Number.isInteger(t) ? t : t.toFixed(1)}</span>
              ))}
            </div>
            <div className="surface-map__legend-unit">
              {unit}
              {domain.saturates && <span className="surface-map__legend-note"> · ends saturate</span>}
            </div>
          </div>
        )}
      </div>

      <div className="surface-map__controls">
        <div className="surface-map__row">
          <div className="surface-map__group" role="group" aria-label="Variable">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                className={`surface-map__chip${v === variable ? ' is-active' : ''}`}
                onClick={() => handleVariable(v)}
              >
                {SURFACE_VARIABLES[v]?.label || v}
              </button>
            ))}
          </div>

          <div className="surface-map__group" role="group" aria-label="Statistic">
            {statisticOptions.map((s) => (
              <button
                key={s}
                type="button"
                className={`surface-map__chip surface-map__chip--sub${s === statistic ? ' is-active' : ''}`}
                onClick={() => setStatistic(s)}
              >
                {statLabel(s)}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-map__scrubber">
          <button
            type="button"
            className="surface-map__play"
            onClick={() => setPlaying((p) => !p)}
            disabled={!months.length}
            aria-label={playing ? 'Pause' : 'Play through the record'}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(0, months.length - 1)}
            value={index ?? 0}
            onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
            disabled={!months.length}
            aria-label="Month"
            className="surface-map__range"
          />

          <div className="surface-map__readout">
            <strong>{loading ? 'Loading…' : monthLabel(current)}</strong>
            {currentStep && (
              <span className="surface-map__meta">
                {currentStep.resolution_m} m
                {cvIsPublishable && (
                  <>
                    {' · '}
                    <abbr title="Cross-validated out-of-sample error for this month's fits, shuffled 10-fold">
                      ±{currentStep.cv_rmse.toFixed(2)} {unit}
                    </abbr>
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        {error && <p className="surface-map__error">Could not load the surface index.</p>}
      </div>
    </div>
  );
}

export default SurfaceMap;
