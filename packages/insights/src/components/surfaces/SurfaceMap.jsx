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
import {
  Play, Pause, Lock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import useSurfaceAvailability from '../../hooks/useSurfaceAvailability';
import {
  tileUrlTemplate,
  fetchZoneLayer,
  granularityFor,
  vintageFor,
  SURFACE_VARIABLES,
  DEFAULT_STATISTIC,
} from '../../services/surfaceService';
import ZoneOverviewCard from './ZoneOverviewCard';
import './SurfaceMap.css';

const NZ_BOUNDS = [[165.8, -47.6], [179.4, -33.9]];
// The GDD layers are SEASONAL, not monthly — `granularityFor` decides, and
// every availability request and tile URL below takes it from there.
const VARIABLES = ['temp_mean', 'temp_min', 'temp_max', 'rainfall', 'gdd10', 'gdd0'];
const SOURCE_ID = 'climate-surface';
const ZONE_SOURCE = 'wine-zones';
const ZONE_FILL = 'wine-zones-fill';
const ZONE_LINE = 'wine-zones-line';
const ZONE_LABEL_SOURCE = 'wine-zone-labels';
const ZONE_LABEL = 'wine-zone-labels-text';
const PLAY_MS = 420;

// Zones NEST — Marlborough contains Lower Wairau, Awatere and Upper Wairau — so
// only one level is ever drawn. Drawing both stacks a parent over its children
// and every click lands on the parent. Sub-zones appear once zoomed in enough
// for them to be distinguishable.
const SUBZONE_FROM_ZOOM = 8;

// Statistics worth putting in front of a visitor. The archive publishes more
// (argmin_day, wet_top3, ...) but those are analysis bands, not map layers, and
// a day-of-month index on a continuous ramp reads as noise.
// `sd` (within-month variability) is deliberately absent from temp_mean. On a
// fixed temperature ramp it renders as a near-uniform field that reads as a
// broken layer rather than as a spread in degrees, and it answers a question
// nobody arriving at the Atlas is asking. The band still exists in the archive
// and is still what the GDD integration is built on — it is just not a map.
const FEATURED_STATISTICS = {
  temp_mean: ['mean', 'min', 'max'],
  temp_min: ['mean', 'frost_days', 'min'],
  temp_max: ['mean', 'days_over_25', 'days_over_30', 'max'],
  rainfall: ['sum', 'wet_days', 'max', 'max_dry_spell'],
  // `sum` is the same object as the April accumulation, addressed as the
  // season total. Offering only `cumulative` would make the season total
  // reachable solely by scrubbing to the last step of a season.
  gdd10: ['cumulative', 'sum'],
  gdd0: ['cumulative', 'sum'],
};

const STAT_LABELS = {
  mean: 'Mean', median: 'Median',
  sd: 'Variability', sum: 'Total', wet_days: 'Wet days',
  frost_days: 'Frost days', days_over_25: 'Days over 25', days_over_30: 'Days over 30',
  max_dry_spell: 'Longest dry spell',
  cumulative: 'Through the season',
};

// `min` and `max` are the same band everywhere — the lowest and highest daily
// value in the month — but they do not mean the same thing on every layer, and
// a single label got it plainly wrong: rainfall's `max` read "Warmest day".
// temp_min is a nightly minimum, so its extremes are nights, not days.
const EXTREME_LABELS = {
  temp_mean: { min: 'Coldest day', max: 'Warmest day' },
  temp_min: { min: 'Coldest night', max: 'Warmest night' },
  temp_max: { min: 'Coolest day', max: 'Hottest day' },
  rainfall: { min: 'Driest day', max: 'Wettest day' },
};

// Statistics whose unit is not the variable's own unit. Without this a count of
// frost days renders as "12 C".
const COUNT_STATISTICS = new Set([
  'frost_days', 'wet_days', 'days_over_25', 'days_over_30',
  'days_over_10mm', 'days_over_25mm', 'max_dry_spell',
]);

// `sum` means "the whole month's rain" on rainfall and "the whole season's
// accumulation" on a degree-day layer. One label cannot carry both.
const SEASON_STAT_LABELS = { sum: 'Season total' };

function statLabel(stat, variable) {
  if (granularityFor(variable) === 'season' && SEASON_STAT_LABELS[stat]) {
    return SEASON_STAT_LABELS[stat];
  }
  return EXTREME_LABELS[variable]?.[stat]
    || STAT_LABELS[stat]
    || stat.replace(/_/g, ' ');
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

// The archive's own span, for the anonymous prompt when the server has not
// said otherwise. Only ever a fallback — `access.archive_first/last` is the
// truth and moves when the archive is extended.
function spanLabel(access) {
  const first = access?.archive_first;
  const last = access?.archive_last;
  if (!first || !last) return 'the full record';
  const y0 = String(first).slice(0, 4);
  const y1 = String(last).slice(0, 4);
  return y0 === y1 ? y0 : `${y0}–${y1}`;
}

/**
 * @param {Function} onSignInRequired  opens the auth modal, owned by the page.
 *   SurfaceMap does not own a modal because it is embedded in more than one
 *   place and each host already has its own.
 */
function SurfaceMap({ onSignInRequired }) {
  const [variable, setVariable] = useState('temp_mean');
  const [statistic, setStatistic] = useState(DEFAULT_STATISTIC.temp_mean);
  const [index, setIndex] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [zones, setZones] = useState({ region: null, sub_zone: null });
  const [zoneLevel, setZoneLevel] = useState('region');
  const [selectedZone, setSelectedZone] = useState(null);
  const [showZones, setShowZones] = useState(true);

  const containerRef = useRef(null);
  const mapRef = useRef(null);

  const granularity = granularityFor(variable);
  const { available, loading, unavailable, months, error, access } =
    useSurfaceAvailability(variable, granularity, statistic);

  // The FREE RULE, decided by the server: an anonymous visitor sees the newest
  // month of every layer, and the record behind it needs an account. The
  // server sends exactly one step in that case, so the scrubber has nothing to
  // scrub even if this flag were missed — the flag exists to make the reason
  // visible rather than to enforce anything.
  const locked = access?.scope === 'latest_month';

  const steps = available?.meta?.steps ?? [];
  const domain = available?.meta?.domain ?? null;
  const unit = unitFor(variable, statistic);

  // Keeping the step index across a variable change is deliberate for two
  // layers of the same shape — you stay on July while comparing rainfall to
  // temperature. Across a GRANULARITY change it is meaningless: step 100 of
  // the monthly series is May 1994 and step 100 of the seasonal one is the
  // third month of the 2000 season. Drop it and let the effect below land on
  // the most recent.
  useEffect(() => { setIndex(null); }, [granularity]);

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

  // Seasons present in the current series, in order, with the index of each
  // one's FIRST step. 37 seasons x 8 accumulation months is 296 steps, and
  // hunting for a particular vintage by dragging a slider across all of them
  // is not a usable way to answer "how did 2019 go" — so the scrubber keeps
  // the fine control and this jumps between seasons.
  const seasons = useMemo(() => {
    if (granularity !== 'season') return [];
    const seen = new Map();
    steps.forEach((s, i) => {
      if (s.season != null && !seen.has(s.season)) seen.set(s.season, i);
    });
    return [...seen.entries()].map(([season, index]) => ({ season, index }));
  }, [steps, granularity]);

  const currentSeason = currentStep?.season ?? null;

  // The vintage the map is currently showing. Seasonal layers carry it from the
  // server; monthly layers derive it from the Sep-Apr season definition. This is
  // what any panel opened FROM the map must follow, so the numbers on screen
  // and the numbers in a card describe the same year.
  const vintage = currentSeason ?? vintageFor(current);

  // --- stepping -------------------------------------------------------------
  // The slider alone cannot answer "this month, last year": 456 monthly steps
  // makes one year 2.6% of the track, which is a few pixels on a phone. These
  // move by a known interval instead of by pixels.
  const navDisabled = !months.length || locked;

  const stepBy = useCallback((delta) => {
    setPlaying(false);
    setIndex((prev) => {
      if (!months.length) return prev;
      const from = prev ?? months.length - 1;
      return Math.min(months.length - 1, Math.max(0, from + delta));
    });
  }, [months.length]);

  const jumpYear = useCallback((delta) => {
    if (!months.length || !current) return;
    setPlaying(false);

    if (granularity === 'season') {
      // Hold the position WITHIN the season, so Octobers compare with Octobers
      // and the accumulation is read at the same point of the run. `months` and
      // `steps` are the same list here, so the indices line up.
      const target = (currentSeason ?? 0) + delta;
      const tail = current.slice(5);
      const within = steps.findIndex((s) => s.season === target && s.valid_at.slice(5) === tail);
      const first = steps.findIndex((s) => s.season === target);
      const next = within >= 0 ? within : first;
      if (next >= 0) setIndex(next);
      return;
    }

    // Monthly: shift the CALENDAR year and look the month up, rather than
    // moving 12 index positions. The archive has gaps, and 12 steps across one
    // lands on the wrong month with nothing on screen to say so.
    const [y, m] = current.split('-');
    const wanted = `${String(Number(y) + delta).padStart(4, '0')}-${m}`;
    const exact = months.indexOf(wanted);
    if (exact >= 0) { setIndex(exact); return; }
    // Nearest month on that side, so a gap year still moves rather than
    // swallowing the click.
    const ordered = delta > 0 ? months : [...months].reverse();
    const hit = ordered.find((s) => (delta > 0 ? s > wanted : s < wanted));
    if (hit) setIndex(months.indexOf(hit));
  }, [months, current, granularity, currentSeason, steps]);

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
      variable, valid_at: current, granularity, statistic,
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
    // UNDER the zone furniture, always. `addLayer` with no `beforeId` appends
    // to the TOP of the stack, and this effect re-runs on every variable,
    // statistic and month change — so after the first scrub the surface climbed
    // over the outlines and labels that exist to be read against it. It looked
    // right on first load only because the zone fetch resolves later, which is
    // exactly the kind of ordering that survives a demo and fails in use.
    const beneath = map.getLayer(ZONE_FILL) ? ZONE_FILL : undefined;
    map.addLayer({
      id: SOURCE_ID,
      type: 'raster',
      source: SOURCE_ID,
      paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 150 },
    }, beneath);
  }, [mapReady, variable, statistic, current, granularity]);

  // --- wine zone overlay ----------------------------------------------------
  // Fetched per level and cached, because the geometry is static and the two
  // levels together are the whole layer.
  useEffect(() => {
    if (zones[zoneLevel] !== null) return undefined;
    let live = true;
    fetchZoneLayer({ level: zoneLevel, metric: 'gdd10' })
      .then((fc) => { if (live) setZones((prev) => ({ ...prev, [zoneLevel]: fc })); })
      .catch(() => { if (live) setZones((prev) => ({ ...prev, [zoneLevel]: false })); });
    return () => { live = false; };
  }, [zoneLevel, zones]);

  // Swap sub-zones in once they are big enough on screen to be worth clicking.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;
    const onZoom = () => {
      setZoneLevel(map.getZoom() >= SUBZONE_FROM_ZOOM ? 'sub_zone' : 'region');
    };
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const fc = zones[zoneLevel];
    const remove = () => {
      if (map.getLayer(ZONE_LABEL)) map.removeLayer(ZONE_LABEL);
      if (map.getSource(ZONE_LABEL_SOURCE)) map.removeSource(ZONE_LABEL_SOURCE);
      if (map.getLayer(ZONE_LINE)) map.removeLayer(ZONE_LINE);
      if (map.getLayer(ZONE_FILL)) map.removeLayer(ZONE_FILL);
      if (map.getSource(ZONE_SOURCE)) map.removeSource(ZONE_SOURCE);
    };
    remove();
    if (!showZones || !fc || fc === false) return remove;

    map.addSource(ZONE_SOURCE, {
      type: 'geojson',
      data: fc,
      promoteId: 'id',
      // The outlines are trimmed to the LINZ coastline, so the licence has to
      // appear on the map. Mapbox folds a source attribution into the control
      // that is already there.
      attribution: 'Coastline: LINZ CC BY 4.0',
    });
    // Near-transparent fill: the surface underneath IS the content, so the
    // polygon is a hit target and an outline, not a colour of its own.
    map.addLayer({
      id: ZONE_FILL,
      type: 'fill',
      source: ZONE_SOURCE,
      paint: {
        'fill-color': '#1f2933',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.16, 0.04],
      },
    });
    map.addLayer({
      id: ZONE_LINE,
      type: 'line',
      source: ZONE_SOURCE,
      paint: { 'line-color': '#1f2933', 'line-width': 1.4, 'line-opacity': 0.75 },
    });

    // Labels ride on their OWN point source, using the anchor the server
    // computed on the largest part of each zone. Letting the renderer label the
    // polygon puts "Hawke's Bay" out in the bay, because the centroid of a
    // crescent is not inside it.
    const labels = {
      type: 'FeatureCollection',
      features: (fc.features || [])
        .filter((f) => f.properties?.label_lon != null && f.properties?.label_lat != null)
        .map((f) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [f.properties.label_lon, f.properties.label_lat],
          },
          // planted_ha travels with the label so the collision sort can keep
          // the bigger region's name when two collide.
          properties: {
            name: f.properties.name,
            planted_ha: f.properties.planted_ha ?? 0,
          },
        })),
    };
    if (labels.features.length) {
      map.addSource(ZONE_LABEL_SOURCE, { type: 'geojson', data: labels });
      map.addLayer({
        id: ZONE_LABEL,
        type: 'symbol',
        source: ZONE_LABEL_SOURCE,
        layout: {
          'text-field': ['get', 'name'],
          // Stock Mapbox glyphs. A font the style does not carry silently
          // renders nothing at all rather than falling back.
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 9, 15],
          'text-padding': 6,
          // Collide rather than stack: 23 nested zones would otherwise print
          // over each other at national zoom.
          'text-allow-overlap': false,
          'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'planted_ha'], 0]],
        },
        paint: {
          'text-color': '#1f2933',
          'text-halo-color': 'rgba(255, 255, 255, 0.92)',
          'text-halo-width': 1.6,
        },
      });
    }

    let hovered = null;
    const setHover = (id) => {
      if (hovered !== null) {
        map.setFeatureState({ source: ZONE_SOURCE, id: hovered }, { hover: false });
      }
      hovered = id;
      if (id !== null) {
        map.setFeatureState({ source: ZONE_SOURCE, id }, { hover: true });
      }
    };

    const pick = (point) => {
      const hits = map.queryRenderedFeatures(point, { layers: [ZONE_FILL] });
      return hits.length ? hits[0].properties : null;
    };

    const onClick = (e) => {
      const props = pick(e.point);
      if (props) setSelectedZone(props);
    };
    const onMove = (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: [ZONE_FILL] });
      map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
      setHover(hits.length ? hits[0].id : null);
    };
    const onLeave = () => { setHover(null); map.getCanvas().style.cursor = ''; };

    // MapboxDraw suppresses tap->click, so on touch `map.on('click')` never
    // fires and the zone would be unselectable on exactly the devices this is
    // tested on first. Bridge from touchend, and guard against a drag by
    // requiring the touch to end near where it began.
    let touchStart = null;
    const onTouchStart = (e) => {
      touchStart = e.point ? { x: e.point.x, y: e.point.y } : null;
    };
    const onTouchEnd = (e) => {
      if (!touchStart || !e.point) return;
      const moved = Math.hypot(e.point.x - touchStart.x, e.point.y - touchStart.y);
      touchStart = null;
      if (moved > 8) return;
      const props = pick(e.point);
      if (props) setSelectedZone(props);
    };

    map.on('click', ZONE_FILL, onClick);
    map.on('mousemove', onMove);
    map.on('mouseleave', ZONE_FILL, onLeave);
    map.on('touchstart', onTouchStart);
    map.on('touchend', onTouchEnd);

    return () => {
      map.off('click', ZONE_FILL, onClick);
      map.off('mousemove', onMove);
      map.off('mouseleave', ZONE_FILL, onLeave);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
      remove();
    };
  }, [mapReady, zones, zoneLevel, showZones]);

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

  // The bar's x-axis is the same 0..1 scaled value the tiler paints, so the
  // ticks stay evenly spaced in VALUE while the colours sit wherever the server
  // put them. Rainfall's stops are front-loaded because the distribution is;
  // ignoring `positions` here would draw a legend the tiles do not obey.
  const rampCss = useMemo(() => {
    if (!domain?.stops?.length) return 'linear-gradient(90deg, #eee, #999)';
    const n = domain.stops.length;
    const positions = domain.positions?.length === n
      ? domain.positions
      : domain.stops.map((_, i) => (n > 1 ? i / (n - 1) : 0));
    const stops = domain.stops.map(
      ([r, g, b], i) => `rgb(${r},${g},${b}) ${(positions[i] * 100).toFixed(2)}%`,
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

        {selectedZone && (
          <ZoneOverviewCard
            zone={selectedZone}
            vintage={vintage}
            onClose={() => setSelectedZone(null)}
          />
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
                {statLabel(s, variable)}
              </button>
            ))}
          </div>

          <div className="surface-map__group" role="group" aria-label="Overlays">
            <button
              type="button"
              className={`surface-map__chip surface-map__chip--sub${showZones ? ' is-active' : ''}`}
              onClick={() => { setShowZones((v) => !v); setSelectedZone(null); }}
              aria-pressed={showZones}
            >
              Wine regions
            </button>
            {/* Projections are not published yet — Pete is preparing the data
                files. The control is present and disabled rather than absent so
                the Atlas shows what is coming, and so wiring it later is a data
                source rather than a layout change. */}
            <button
              type="button"
              className="surface-map__chip surface-map__chip--sub is-placeholder"
              disabled
              title="Climate projections are not published yet"
            >
              Projections · soon
            </button>
          </div>

          {seasons.length > 1 && (
            <label className="surface-map__season-pick">
              <span className="sr-only">Season</span>
              <select
                value={currentSeason ?? ''}
                onChange={(e) => {
                  const jump = seasons.find((s) => String(s.season) === e.target.value);
                  if (jump) { setPlaying(false); setIndex(jump.index); }
                }}
                disabled={locked}
              >
                {seasons.map(({ season }) => (
                  <option key={season} value={season}>{season} season</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="surface-map__scrubber">
          <button
            type="button"
            className="surface-map__play"
            onClick={() => setPlaying((p) => !p)}
            disabled={!months.length || locked}
            aria-label={playing ? 'Pause' : 'Play through the record'}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <div className="surface-map__nav" role="group" aria-label="Step back">
            <button
              type="button"
              className="surface-map__play surface-map__play--nav"
              onClick={() => jumpYear(-1)}
              disabled={navDisabled}
              aria-label={granularity === 'season' ? 'Previous season' : 'Same month, previous year'}
              title={granularity === 'season' ? 'Previous season' : 'Same month, previous year'}
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              type="button"
              className="surface-map__play surface-map__play--nav"
              onClick={() => stepBy(-1)}
              disabled={navDisabled || (index ?? 0) <= 0}
              aria-label={granularity === 'season' ? 'Previous step' : 'Previous month'}
              title={granularity === 'season' ? 'Previous step' : 'Previous month'}
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, months.length - 1)}
            value={index ?? 0}
            onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
            disabled={!months.length || locked}
            aria-label="Month"
            className="surface-map__range"
          />

          <div className="surface-map__nav" role="group" aria-label="Step forward">
            <button
              type="button"
              className="surface-map__play surface-map__play--nav"
              onClick={() => stepBy(1)}
              disabled={navDisabled || (index ?? 0) >= months.length - 1}
              aria-label={granularity === 'season' ? 'Next step' : 'Next month'}
              title={granularity === 'season' ? 'Next step' : 'Next month'}
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              className="surface-map__play surface-map__play--nav"
              onClick={() => jumpYear(1)}
              disabled={navDisabled}
              aria-label={granularity === 'season' ? 'Next season' : 'Same month, next year'}
              title={granularity === 'season' ? 'Next season' : 'Same month, next year'}
            >
              <ChevronsRight size={18} />
            </button>
          </div>

          <div className="surface-map__readout">
            <strong>
              {loading ? 'Loading…' : monthLabel(current)}
              {/* The accumulation month alone is ambiguous: October 2019 is a
                  step of the 2020 season, and a grower thinks in vintages. */}
              {currentSeason != null && (
                <span className="surface-map__season"> · {currentSeason} season</span>
              )}
            </strong>
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

        {/* The offer, not a toll booth. Every layer is already on screen at
            full resolution — what an account adds is the record behind it, so
            say how much record that is. */}
        {locked && (
          <div className="surface-map__unlock">
            <Lock size={15} aria-hidden="true" />
            <p>
              You are seeing the most recent month. The archive runs{' '}
              <strong>{spanLabel(access)}</strong>
              {access?.archive_count ? ` — ${access.archive_count} months` : ''}.
            </p>
            <button
              type="button"
              className="surface-map__unlock-cta"
              onClick={onSignInRequired}
              disabled={!onSignInRequired}
            >
              Sign in free to open it
            </button>
          </div>
        )}

        {error && <p className="surface-map__error">Could not load the surface index.</p>}
      </div>
    </div>
  );
}

export default SurfaceMap;
