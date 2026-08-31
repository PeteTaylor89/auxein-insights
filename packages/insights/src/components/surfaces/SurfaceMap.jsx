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
//
// TWO MODES, ONE MAP (2026-08-25)
// -------------------------------
// `mode` switches the canvas between the MEASURED archive and the MfE 2024
// PROJECTIONS. They are two different kinds of claim on one basemap, so the
// switch is loud and the controls under it change completely: a measurement is
// addressed by a date and scrubbed, a projection is addressed by
// (scenario, period, season) and has no date to scrub.
//
// The three temperature-mean layers render on the SAME colour domain in both
// modes, on purpose — flipping the switch recolours the country, and that only
// means something if the colours mean the same thing on both sides. Rainfall
// and the day counts cannot share it (a projected annual total is twelve months
// against a measured monthly archive) and carry their own measured domain per
// season; `domain.shared_with_measured` says which is which.
//
// FROST IS ABSENT FROM THE PROJECTION LAYER LIST and that is deliberate — the
// server withholds it, see `projection_store.WITHHELD`. Do not add it back
// here; the exclusion belongs on the server where every client inherits it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Play, Pause, Lock, Layers,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import useSurfaceAvailability from '../../hooks/useSurfaceAvailability';
import useProjectionCatalogue from '../../hooks/useProjectionCatalogue';
import {
  tileUrlTemplate,
  projectionTileUrlTemplate,
  getProbe,
  getProjectionProbe,
  findProjectionStep,
  PROJECTION_BASELINE,
  fetchZoneLayer,
  granularityFor,
  cadenceFor,
  statisticFor,
  DAILY_CAPABLE,
  vintageFor,
  SURFACE_VARIABLES,
  DEFAULT_STATISTIC,
} from '../../services/surfaceService';
import ZoneOverviewCard from './ZoneOverviewCard';
import ProjectedControls from './ProjectedControls';
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

// --- basemap and opacity ---------------------------------------------------
// The surface is a continuous field with no landmarks in it: read alone it is a
// coloured blob that happens to be New Zealand-shaped. Everything that lets a
// grower locate themselves — the town they drive to, the river, the range that
// makes the frost — lives in the basemap UNDER it, and at a flat 0.85 the
// surface hid all of it. So the basemap is choosable and the surface's opacity
// is a slider, which are the same fix approached from either side.
//
// `light-v11` stays the default because the legend is calibrated against a pale
// ground: the same 0.6 opacity that reads correctly over light reads as a
// different colour over satellite, and the domain is fixed server-side (see the
// header). Satellite is for finding a place, not for reading a value off.
//
// Mapbox GL v3 renders the GLOBE by default below zoom ~5, and `setStyle` keeps
// the camera and the projection — so switching basemaps does not lose it.
const BASEMAPS = [
  { id: 'light', label: 'Plain', url: 'mapbox://styles/mapbox/light-v11' },
  { id: 'outdoors', label: 'Terrain', url: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
];
const DEFAULT_BASEMAP = 'light';
const DEFAULT_OPACITY = 0.85;
// Below this the surface stops being readable against the legend; above it the
// basemap is gone again. The floor is not 0 on purpose — an invisible layer
// with a live legend under it is a bug report, not a setting.
const MIN_OPACITY = 0.2;

function basemapUrl(id) {
  return (BASEMAPS.find((b) => b.id === id) || BASEMAPS[0]).url;
}

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
  // `max_dry_spell` PULLED 2026-08-27 — Pete's call, and deliberately here as
  // well as on the server.
  //
  // Every published month from 1986-02 carried a national scalar into every
  // cell (`surface_store.WITHHELD_STATISTICS` has the measurements), so the
  // server already drops it from `meta.statistics` and the chip would filter
  // itself out. That is not enough on its own: the filter below falls back to
  // showing every featured statistic when the statistics list is EMPTY, which
  // is what an unreachable or slow `/available` looks like — so on a bad
  // request the chip would come back, and clicking it would 404 the tiles.
  //
  // To restore after rainfall is republished, put 'max_dry_spell' back here AND
  // delete the entry in surface_store.WITHHELD_STATISTICS. Both, or the chip
  // renders against a 404.
  rainfall: ['sum', 'wet_days', 'max'],
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

/**
 * Is this Mapbox map still usable?
 *
 * EVERY `Map` method dereferences `map.style`, and `map.remove()` sets that to
 * undefined. React runs effect cleanups in DECLARATION ORDER, and the effect
 * that owns the map is declared first - so on unmount `map.remove()` runs
 * BEFORE the overlay effects clean up after themselves. Each of those then
 * calls `getLayer()` on a destroyed map and throws:
 *
 *   Cannot read properties of undefined (reading 'getOwnLayer')
 *
 * It surfaces when you leave the Atlas while it is busy, because that is when
 * there are most layers and listeners still attached. Reordering the effects
 * would fix it today and break again the moment one is moved, so every teardown
 * path asks this instead.
 */
function mapAlive(map) {
  return Boolean(map && map.style);
}

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

// A daily stamp is a full date and must READ as one. `monthLabel` splits on the
// dash and takes only the year and month, so it renders every day of August as
// "August 2026" — the scrubber would move, the map would change, and the label
// would sit still, which reads as a broken control rather than as a coarse one.
function dayLabel(stamp) {
  if (!stamp) return '';
  const [y, m, d] = String(stamp).split('-');
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(dt.getTime())
    ? stamp
    : dt.toLocaleDateString('en-NZ', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'UTC',
    });
}

function stepLabel(stamp, granularity) {
  return granularity === 'daily' ? dayLabel(stamp) : monthLabel(stamp);
}

function unitFor(variable, statistic) {
  if (COUNT_STATISTICS.has(statistic)) return 'days';
  return SURFACE_VARIABLES[variable]?.unit || '';
}

// Units whose values are whole numbers. Mirrors `surface_store.INTEGER_UNITS` —
// the server decides which BAND is a count and sends the unit with the value, so
// this rounds on the unit rather than on a list of statistic names and a band
// added there needs no change here.
const INTEGER_UNITS = new Set(['days', 'day of month', 'days since 1986-01-01', 'GDD']);

// Decimals follow the UNIT THAT CAME BACK WITH THE VALUE, never the variable.
// Two different bands make that necessary: `temp_min/frost_days` is a count of
// days measured off a degree layer, and a projected rainfall field is a
// percentage change where the measured layer is millimetres. Keying this on
// `variable` prints '12.3 C' for twelve frost days.
function formatProbeValue(value, unit) {
  if (value == null) return '';
  if (INTEGER_UNITS.has(unit)) return Math.round(value).toLocaleString('en-NZ');
  if (unit === '%') return value.toFixed(0);
  return value.toFixed(1);
}

// The archive's own span, for the anonymous prompt when the server has not
// said otherwise. Only ever a fallback — `access.archive_first/last` is the
// truth and moves when the archive is extended.
function spanLabel(access) {
  // Either gate. `archive_*` when the archive is what is withheld (signed out),
  // `daily_*` when the cadence is (not Pro). One helper because the prompt that
  // renders it is one component.
  const first = access?.archive_first ?? access?.daily_first;
  const last = access?.archive_last ?? access?.daily_last;
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
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  // WHERE the visitor asked, and WHAT came back — two states, not one. The
  // popup's position must not move while its value is reloading, and folding
  // both into one object would re-run the positioning effect on every fetch.
  const [probeAt, setProbeAt] = useState(null);
  const [probe, setProbe] = useState(null);

  // --- projection mode ------------------------------------------------------
  const [mode, setMode] = useState('measured');
  // 'archive' walks the 1986-2023 monthly record; 'daily' walks the live
  // engine's day-by-day series. A CHOICE, not a property of the variable —
  // which is why `cadenceFor` exists rather than a second lookup table. The
  // GDD layers have no daily form, so it falls back for them automatically.
  const [cadence, setCadence] = useState('archive');
  const [projLayer, setProjLayer] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [period, setPeriod] = useState(null);
  const [season, setSeason] = useState(null);
  // Which side of the flip the CANVAS is showing. The chips keep describing the
  // projection either way — flipping to the baseline is asking "and what is it
  // now?", not abandoning the scenario you were looking at.
  const [projView, setProjView] = useState('projected');

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // The basemap actually APPLIED to the map, which is not the same thing as the
  // state: `mapReady` cycles false->true on every style swap to make the raster
  // and zone effects rebuild, and without this the swap effect would re-enter on
  // its own state change and setStyle forever.
  const appliedBasemap = useRef(DEFAULT_BASEMAP);
  // Opacity is read through a ref inside the raster effect rather than being a
  // dependency of it. As a dependency, every tick of the slider would remove and
  // re-add the source — a full tile refetch per pixel of drag. As a ref it is
  // the initial paint value, and the effect below repaints the live layer.
  const opacityRef = useRef(DEFAULT_OPACITY);
  // The probe popup is a real `mapboxgl.Popup` — it tracks the map on pan and
  // zoom natively, where a React-positioned div would have to re-render on every
  // frame of a drag — with React rendering into its DOM node through a portal.
  const popupRef = useRef(null);
  const probeNode = useMemo(
    () => (typeof document === 'undefined' ? null : document.createElement('div')),
    [],
  );

  const granularity = cadenceFor(variable, cadence);
  const dailyOffered = DAILY_CAPABLE.has(variable);
  const isDaily = granularity === 'daily';
  // A daily surface HAS no statistic — it is the value, not an aggregate over a
  // period, and `surface_run` stores `statistic IS NULL` to say so. Sending
  // `mean` with a daily request matches zero rows and reports itself as "no
  // surface for this date", which looks exactly like a missing day.
  const wireStatistic = statisticFor(granularity, statistic);
  const { available, loading, unavailable, months, error, access } =
    useSurfaceAvailability(variable, granularity, wireStatistic);

  // --- the projection catalogue --------------------------------------------
  // Fetched with no layer first, so the mode switch knows whether projections
  // exist at all before anyone presses it; once a layer is chosen the same
  // endpoint returns that layer's whole matrix.
  const projected = mode === 'projected';
  const {
    layers: projLayers,
    scenarios, periods, seasons: projSeasonOptions, steps: projSteps,
    domains: projDomains, combinations,
    access: projAccess, source: projSource, baseline: projBaseline,
    baselines: projBaselines, baselineSource, baselineKey,
    loading: projLoading, unavailable: projUnavailable,
  } = useProjectionCatalogue(projLayer?.variable, projLayer?.statistic);

  // A season the baseline does not cover cannot be flipped to. Checked rather
  // than assumed, so the control disables instead of the map 404ing.
  const baselineStep = season ? projBaselines?.[season] ?? null : null;
  const showingBaseline = projected && projView === 'baseline' && !!baselineStep;

  const projLocked = projAccess?.scope === 'none';

  // Settle on a layer as soon as the catalogue names one. Preferring the layer
  // that matches the measured variable already on screen means flipping the
  // switch keeps looking at the same quantity rather than jumping to whatever
  // sorts first.
  useEffect(() => {
    if (!projected || projLayer || !projLayers.length) return;
    const match = projLayers.find((l) => l.variable === variable)
      || projLayers.find((l) => l.variable === 'temp_mean')
      || projLayers[0];
    setProjLayer({ variable: match.variable, statistic: match.statistic });
  }, [projected, projLayers, projLayer, variable]);

  // THE MATRIX IS NOT FULL — only ssp370 reaches +3 C — so a selection is
  // validated against what is published rather than assumed. This also repairs
  // a selection that a layer change has just invalidated: gdd10 publishes the
  // Sep-Apr season ONLY, so carrying ANN across from temperature would ask for
  // a surface that does not exist.
  useEffect(() => {
    if (!projSteps.length) return;
    const has = (sc, pe) => combinations.has(`${sc}|${pe}`);
    const scenarioOk = scenario && projSteps.some((st) => st.scenario === scenario);
    const nextScenario = scenarioOk ? scenario
      : (scenarios.find((o) => o.value === 'ssp245') || scenarios[0])?.value;
    const periodOk = period && has(nextScenario, period);
    const nextPeriod = periodOk ? period
      : (periods.find((o) => has(nextScenario, o.value)) || periods[0])?.value;
    const seasonOk = season && projSteps.some((st) => st.season === season);
    const nextSeason = seasonOk ? season
      : (projSeasonOptions.find((o) => o.value === 'ANN')
         || projSeasonOptions[0])?.value;

    if (nextScenario !== scenario) setScenario(nextScenario ?? null);
    if (nextPeriod !== period) setPeriod(nextPeriod ?? null);
    if (nextSeason !== season) setSeason(nextSeason ?? null);
  }, [projSteps, combinations, scenarios, periods, projSeasonOptions,
      scenario, period, season]);

  useEffect(() => {
    if (projView === 'baseline' && season && !baselineStep) setProjView('projected');
  }, [projView, season, baselineStep]);

  const projStep = useMemo(
    () => (projected ? findProjectionStep(projSteps, { scenario, period, season }) : null),
    [projected, projSteps, scenario, period, season],
  );

  // Per SEASON. A three-month rainfall total and a twelve-month one are not the
  // same scale, so there is one domain per season rather than one per layer.
  const projDomain = season ? projDomains?.[season] ?? null : null;

  // TWO GATES, decided by the server (2026-08-25). `scope` says which:
  //
  //   'latest_step'  signed out. The newest month of every layer, and the
  //                  archive behind it needs a free account.
  //   'none'         the DAILY cadence, which is Pro.
  //   'full'         nothing withheld.
  //
  // The server sends one step or none accordingly, so the scrubber has nothing
  // to scrub even if this flag were missed — the flag exists to make the reason
  // visible and to disable the transport, not to enforce anything.
  //
  // Anything other than 'full' is locked. Testing for the two withheld values
  // by name rather than `!== 'full'` on purpose: a third gate should have to be
  // added here deliberately rather than inheriting whichever prompt happens to
  // be written below.
  const locked = access?.scope === 'latest_step' || access?.scope === 'none';
  // Which prompt to show. They ask for different things and cost different
  // amounts, and offering the wrong one is worse than offering neither.
  const needsAccount = access?.requires === 'registration';

  const steps = available?.meta?.steps ?? [];
  // ONE legend serves both modes, because the server publishes the projection
  // domain in the same shape as the measured one — min, max, stops, positions,
  // saturates. Anything that read `available.meta.domain` directly would draw a
  // measured scale over a projected map.
  const domain = projected ? projDomain : (available?.meta?.domain ?? null);
  const unit = projected
    ? (projStep?.unit ?? projSteps[0]?.unit ?? '')
    : unitFor(variable, statistic);

  // Keeping the step index across a variable change is deliberate for two
  // layers of the same shape — you stay on July while comparing rainfall to
  // temperature. Across a GRANULARITY change it is meaningless: step 100 of
  // the monthly series is May 1994 and step 100 of the seasonal one is the
  // third month of the 2000 season. Drop it and let the effect below land on
  // the most recent.
  useEffect(() => { setIndex(null); }, [granularity]);

  // A statistic is meaningless on a daily surface and the archive's statistic
  // must survive a round trip through the daily cadence, so it is left alone in
  // state and simply not sent (`wireStatistic`). What DOES need resetting is a
  // variable with no daily form: switching to gdd10 while daily is selected
  // would leave the control showing 'Daily' over a seasonal layer.
  useEffect(() => {
    if (cadence === 'daily' && !DAILY_CAPABLE.has(variable)) setCadence('archive');
  }, [cadence, variable]);

  // Land on the most recent step whenever the layer changes, and keep the index
  // in range — statistics do not all cover the same span.
  //
  // EXCEPT ON THE DAILY CADENCE, which opens A WEEK BACK. The newest daily
  // surface is D-2 by design and is the one most likely to still be revised:
  // `daily_aggregation` keeps correcting `weather_data_daily` for about three
  // days, and the engine re-fits D-9..D-3 weekly because of it. Opening on the
  // freshest day would put the least settled number in the country on screen
  // first. A week back is inside the record and past the revision tail, and
  // every day either side stays on the scrubber.
  const DAILY_OPEN_BACK = 7;
  useEffect(() => {
    if (!months.length) { setIndex(null); return; }
    setIndex((prev) => {
      if (prev != null) return Math.min(prev, months.length - 1);
      const last = months.length - 1;
      return isDaily ? Math.max(0, last - DAILY_OPEN_BACK) : last;
    });
  }, [months, isDaily]);

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

    if (granularity === 'daily') {
      // A YEAR is not a useful jump on a record that is two months long. The
      // outer buttons move a week, which is the span a grower actually reasons
      // in — "what did last week look like" — and it keeps both buttons doing
      // something on every day of the series.
      setIndex((prev) => {
        const from = prev ?? months.length - 1;
        return Math.min(months.length - 1, Math.max(0, from + delta * 7));
      });
      return;
    }

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
        // The CONSTANT, not the state. The picker drives `setStyle` below; this
        // effect must not re-run on a basemap change or it would tear down and
        // rebuild the whole map to change a background.
        style: basemapUrl(DEFAULT_BASEMAP),
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

  // --- basemap swap ---------------------------------------------------------
  // `setStyle` REPLACES the style document, and everything this component added
  // to it — the raster, the zone fill, line and labels, and their sources — goes
  // with it. Mapbox has no "keep my layers" option, so the rebuild is ours.
  //
  // Rather than re-adding each layer here (a second copy of two effects, which
  // would drift from the originals the first time either changed), this drops
  // `mapReady` to false and raises it again on `style.load`. Both effects below
  // are already keyed on `mapReady` and already tear down and rebuild from the
  // current state, so they do exactly the right thing for free.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady) return;
    if (appliedBasemap.current === basemap) return;
    appliedBasemap.current = basemap;
    setMapReady(false);
    map.once('style.load', () => {
      // The user can leave the Atlas mid-swap; `style.load` still fires on a map
      // that React has torn down. See mapAlive.
      if (mapAlive(mapRef.current)) setMapReady(true);
    });
    map.setStyle(basemapUrl(basemap));
  }, [basemap, mapReady]);

  // Repaint the live layer in place. `setPaintProperty` costs nothing and
  // refetches nothing, which is what makes a drag of the slider smooth; the ref
  // carries the same value into the next rebuild of the raster layer.
  useEffect(() => {
    opacityRef.current = opacity;
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady || !map.getLayer(SOURCE_ID)) return;
    map.setPaintProperty(SOURCE_ID, 'raster-opacity', opacity);
  }, [opacity, mapReady]);

  // Swap the raster source whenever the layer or the month changes. Mapbox has
  // no "change the tile URL" operation, so the source is removed and re-added.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady) return;

    // Two builders, and neither can be reached with the other's arguments. A
    // projection has no `valid_at` and no granularity; a measurement has no
    // scenario. Passing one set to the other function is the mistake that would
    // put a 2090 scenario on screen labelled as measured weather, so they do not
    // share a parameter object.
    let url = null;
    if (projected) {
      if (projLayer && scenario && period && season && projDomain) {
        // The SAME builder for both sides. The baseline is addressed by the
        // sentinel in scenario and period, on the same route, rendered by the
        // same tiler against the SAME domain — which is the only reason
        // flipping between them means anything. Two endpoints would eventually
        // be two scales.
        const sentinel = baselineKey?.scenario || PROJECTION_BASELINE;
        url = projectionTileUrlTemplate({
          variable: projLayer.variable, statistic: projLayer.statistic,
          scenario: showingBaseline ? sentinel : scenario,
          period: showingBaseline ? (baselineKey?.period || PROJECTION_BASELINE) : period,
          season,
        });
      }
    } else if (current) {
      url = tileUrlTemplate({
        variable, valid_at: current, granularity, statistic: wireStatistic,
      });
    }

    // Nothing addressable yet — a layer still resolving, or a season with no
    // measured display domain. Clear the raster rather than leaving the previous
    // mode's surface under the new mode's legend.
    if (!url) {
      if (map.getLayer(SOURCE_ID)) map.removeLayer(SOURCE_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      return;
    }

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
      paint: { 'raster-opacity': opacityRef.current, 'raster-fade-duration': 150 },
    }, beneath);
  }, [mapReady, variable, wireStatistic, current, granularity,
      projected, projLayer, scenario, period, season, projDomain,
      showingBaseline, baselineKey]);

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
    return () => { if (mapAlive(map)) map.off('zoomend', onZoom); };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const fc = zones[zoneLevel];
    const remove = () => {
      // The map may already be gone - see mapAlive.
      if (!mapAlive(map)) return;
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
      if (!mapAlive(map)) return;
      map.off('click', ZONE_FILL, onClick);
      map.off('mousemove', onMove);
      map.off('mouseleave', ZONE_FILL, onLeave);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
      remove();
    };
  }, [mapReady, zones, zoneLevel, showZones]);

  // --- probe: click a cell, read its value ----------------------------------
  // WHY A SERVER ROUND TRIP AND NOT THE PIXEL UNDER THE CURSOR. Inverting the
  // colour ramp off the rendered canvas looks free and is wrong: `raster-opacity`
  // blends the tile over whichever basemap is showing — and that opacity is now
  // a slider — while `raster-fade-duration` cross-fades two months mid-scrub. It
  // would return plausible numbers with no way to tell they were wrong.
  //
  // CLICK, NOT HOVER. Every probe is a range read against a COG on S3, and this
  // API is not behind CloudFront. A hover readout would issue one per mousemove.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady) return undefined;

    // Returning `prev` unchanged makes React bail out of the update, which
    // matters because some touch browsers fire a synthesised `click` after
    // `touchend` — without this the same cell would be fetched twice.
    const pick = (lngLat) => setProbeAt((prev) => (
      prev
      && Math.abs(prev.lng - lngLat.lng) < 1e-6
      && Math.abs(prev.lat - lngLat.lat) < 1e-6
        ? prev
        : { lng: lngLat.lng, lat: lngLat.lat }));

    const onClick = (e) => pick(e.lngLat);

    // The same tap bridge the zone layer uses, and for the same reason: a
    // `click` handler alone is dead on touch here, so a probe wired only to
    // `click` would silently not work on a phone. The 8 px guard is what stops a
    // drag of the map from registering as a tap on wherever it ended.
    let touchStart = null;
    const onTouchStart = (e) => {
      touchStart = e.point ? { x: e.point.x, y: e.point.y } : null;
    };
    const onTouchEnd = (e) => {
      if (!touchStart || !e.point) return;
      const moved = Math.hypot(e.point.x - touchStart.x, e.point.y - touchStart.y);
      touchStart = null;
      if (moved > 8) return;
      pick(e.lngLat);
    };

    map.on('click', onClick);
    map.on('touchstart', onTouchStart);
    map.on('touchend', onTouchEnd);
    return () => {
      if (!mapAlive(map)) return;
      map.off('click', onClick);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
    };
  }, [mapReady]);

  // Fetch, and REFETCH when the step or the layer under the popup changes — an
  // open popup follows the scrubber rather than going stale beside a map that
  // has moved on. The address is built the same way the raster layer builds its
  // tile URL, from the same state, so the number quoted is a number off the
  // raster on screen.
  useEffect(() => {
    if (!probeAt) { setProbe(null); return undefined; }
    let live = true;

    let request = null;
    if (projected) {
      if (projLayer && scenario && period && season) {
        request = getProjectionProbe({
          lon: probeAt.lng, lat: probeAt.lat,
          variable: projLayer.variable, statistic: projLayer.statistic,
          scenario: showingBaseline
            ? (baselineKey?.scenario || PROJECTION_BASELINE) : scenario,
          period: showingBaseline
            ? (baselineKey?.period || PROJECTION_BASELINE) : period,
          season,
        });
      }
    } else if (current) {
      request = getProbe({
        lon: probeAt.lng, lat: probeAt.lat,
        variable, granularity, valid_at: current, statistic: wireStatistic,
      });
    }
    if (!request) { setProbe(null); return undefined; }

    setProbe({ loading: true });
    request
      .then((data) => { if (live) setProbe({ loading: false, data }); })
      .catch((err) => {
        if (!live) return;
        // 401 and 402 are the gate, not a failure, and they arrive carrying the
        // offer sentence the catalogue would have made. Show it verbatim rather
        // than inventing a second wording for the same wall.
        setProbe({
          loading: false,
          status: err?.response?.status,
          error: err?.response?.data?.detail || 'Could not read this cell.',
        });
      });
    return () => { live = false; };
  }, [probeAt, projected, projLayer, scenario, period, season, showingBaseline,
      baselineKey, current, variable, wireStatistic, granularity]);

  // Playback would refetch the cell every 420 ms and flicker a number nobody can
  // read at that rate. Close it instead of throttling it.
  useEffect(() => { if (playing) setProbeAt(null); }, [playing]);

  // Position and mount. Popups are DOM on the map container rather than style
  // layers, so this one deliberately SURVIVES a basemap swap — the value you
  // just read stays put while the ground under it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapAlive(map) || !mapReady || !probeNode) return undefined;
    if (!probeAt) {
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      return undefined;
    }
    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: true,
        // A probe is a pin, not a tooltip: clicking elsewhere moves it to the
        // new cell rather than dismissing it, so `closeOnClick` would fight the
        // click handler above.
        closeOnClick: false,
        maxWidth: '250px',
        offset: 8,
        className: 'surface-map__probe-popup',
      }).setDOMContent(probeNode);
      popupRef.current.on('close', () => setProbeAt(null));
    }
    popupRef.current.setLngLat([probeAt.lng, probeAt.lat]).addTo(map);
    return undefined;
  }, [probeAt, mapReady, probeNode]);

  useEffect(() => () => {
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
  }, []);

  // WHAT THE NUMBER IS, in the words the controls are already using. A probe of
  // a monthly MEAN read as a maximum is the failure this line exists to prevent,
  // so the statistic is always named even where it reads as redundant.
  const probeCaption = useMemo(() => {
    if (projected) {
      if (!projLayer) return '';
      const when = showingBaseline
        ? (projBaseline || '1986-2005')
        : (periods.find((o) => o.value === period)?.label || period);
      return [projLayer.label, when, season].filter(Boolean).join(' · ');
    }
    return [
      SURFACE_VARIABLES[variable]?.label || variable,
      // The statistic is part of the caption for an aggregate and a lie for a
      // daily value: there is no "mean" of one day's surface.
      granularity === 'daily' ? 'daily' : statLabel(statistic, variable),
      stepLabel(current, granularity),
      currentSeason != null ? `${currentSeason} season` : null,
    ].filter(Boolean).join(' · ');
  }, [projected, projLayer, showingBaseline, projBaseline, periods, period,
      season, variable, statistic, current, currentSeason, granularity]);

  // --- playback -------------------------------------------------------------
  // A projection has no series, so nothing may be playing through one.
  useEffect(() => { if (projected) setPlaying(false); }, [projected]);

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

        {/* BASEMAP AND OPACITY — bottom-right, the one free corner: the legend
            owns bottom-left, the flip top-left and Mapbox's own navigation
            top-right. Both controls answer the same question ("where am I on
            this?") so they are one panel rather than two, and neither is in the
            rail: they change what the CANVAS looks like, and you have to be
            looking at the canvas to judge them. */}
        {hasToken && !mapFailed && (
          <div className="surface-map__basemap">
            <div className="surface-map__basemap-row" role="group" aria-label="Basemap">
              <Layers size={13} aria-hidden="true" />
              {BASEMAPS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`surface-map__basemap-btn${b.id === basemap ? ' is-active' : ''}`}
                  onClick={() => setBasemap(b.id)}
                  aria-pressed={b.id === basemap}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <label className="surface-map__opacity">
              <span className="sr-only">Surface opacity</span>
              <input
                type="range"
                min={MIN_OPACITY}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                aria-label="Surface opacity"
                aria-valuetext={`${Math.round(opacity * 100)} percent`}
              />
              <span className="surface-map__opacity-value">
                {Math.round(opacity * 100)}%
              </span>
            </label>
          </div>
        )}

        {/* THE FLIP, and it belongs ON the map.
            Same layer, same season, same colour domain — press it and the
            country recolours. Putting it in the rail would mean looking away
            from the one thing it changes, and the comparison only works if both
            images are in the same place a moment apart. Absent, not disabled,
            when the season has no baseline. */}
        {projected && baselineStep && projDomain && (
          <div className="surface-map__flip" role="group"
               aria-label="Baseline or projected">
            <button
              type="button"
              className={`surface-map__flip-btn${
                showingBaseline ? ' is-active' : ''}`}
              onClick={() => setProjView('baseline')}
              aria-pressed={showingBaseline}
            >
              {projBaseline || '1986-2005'}
            </button>
            <button
              type="button"
              className={`surface-map__flip-btn${
                showingBaseline ? '' : ' is-active'}`}
              onClick={() => setProjView('projected')}
              aria-pressed={!showingBaseline}
            >
              {periods.find((o) => o.value === period)?.label || 'Projected'}
            </button>
          </div>
        )}

        {/* The probe card, rendered THROUGH the Mapbox popup rather than
            positioned beside it. A click on a wine region still opens the zone
            card as well: they answer different questions — "what is the whole
            region doing" and "what is it exactly here" — and suppressing one for
            the other would make the map modal for no gain. */}
        {probeNode && probeAt && createPortal(
          <div className="surface-map__probe">
            {probe?.loading && (
              <p className="surface-map__probe-loading">Reading the surface…</p>
            )}

            {probe?.error && (
              <>
                <p className="surface-map__probe-msg">{probe.error}</p>
                {(probe.status === 401 || probe.status === 402) && onSignInRequired && (
                  <button
                    type="button"
                    className="surface-map__probe-cta"
                    onClick={onSignInRequired}
                  >
                    {probe.status === 401 ? 'Sign in free' : 'See Insights Pro'}
                  </button>
                )}
              </>
            )}

            {probe?.data && (
              <>
                <p className="surface-map__probe-value">
                  {probe.data.value == null ? (
                    // NEVER 0. Off the land mask is an absence, and the server
                    // says which absence it is.
                    <span className="surface-map__probe-none">No value here</span>
                  ) : (
                    <>
                      {formatProbeValue(probe.data.value, probe.data.unit)}
                      <span className="surface-map__probe-unit">
                        {' '}
                        {probe.data.unit}
                      </span>
                    </>
                  )}
                </p>
                <p className="surface-map__probe-what">{probeCaption}</p>
                <p className="surface-map__probe-where">
                  {probe.data.value == null && probe.data.reason
                    ? `${probe.data.reason} · `
                    : ''}
                  {probeAt.lat.toFixed(4)}, {probeAt.lng.toFixed(4)}
                  {probe.data.resolution_m
                    ? ` · ${probe.data.resolution_m} m cell`
                    : ''}
                </p>
              </>
            )}
          </div>,
          probeNode,
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
        {/* MEASURED or PROJECTED. Two different kinds of claim on one basemap,
            so the switch is a segmented control at the top of the rail rather
            than a chip among the layers — nothing about "2080-2099 under
            SSP3-7.0" should be one chip away from looking like a measurement.
            Hidden entirely when nothing is published, so the control can never
            offer a mode with no data behind it. */}
        {projLayers.length > 0 && (
          <div className="surface-map__modes" role="tablist" aria-label="What the map shows">
            <button
              type="button"
              role="tab"
              aria-selected={!projected}
              className={`surface-map__mode${!projected ? ' is-active' : ''}`}
              onClick={() => setMode('measured')}
            >
              Measured
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={projected}
              className={`surface-map__mode${projected ? ' is-active' : ''}`}
              onClick={() => setMode('projected')}
            >
              Projected
            </button>
          </div>
        )}

        {projected ? (
          <ProjectedControls
            layers={projLayers}
            layer={projLayer}
            onLayer={setProjLayer}
            scenarios={scenarios}
            periods={periods}
            seasons={projSeasonOptions}
            combinations={combinations}
            scenario={scenario}
            period={period}
            season={season}
            onScenario={setScenario}
            onPeriod={setPeriod}
            onSeason={setSeason}
            step={projStep}
            baselineStep={baselineStep}
            view={projView}
            onView={setProjView}
            baselineSource={baselineSource}
            unit={unit}
            baseline={projBaseline}
            source={projSource}
            domain={projDomain}
            loading={projLoading}
            unavailable={projUnavailable}
            locked={projLocked}
            unlock={projAccess?.unlock}
            onSignInRequired={onSignInRequired}
          />
        ) : (
        <>
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

          {/* CADENCE. Only where a daily series exists — the GDD layers are
              seasonal accumulations with no daily form, and offering the
              control for them would 404 the tiles. The statistic row hides on
              the daily cadence because a daily surface has none. */}
          {dailyOffered && mode === 'measured' && (
            <div className="surface-map__group" role="group" aria-label="Cadence">
              {[
                { key: 'archive', label: 'Monthly archive' },
                { key: 'daily', label: 'Daily' },
              ].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`surface-map__chip${c.key === cadence ? ' is-active' : ''}`}
                  onClick={() => setCadence(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* Conditionally RENDERED, not `hidden`. `.surface-map__group` sets
              `display: flex`, which wins against the hidden attribute, so the
              row would have stayed on screen offering statistics that a daily
              surface does not have. */}
          {!isDaily && (
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
          )}

          <div className="surface-map__group" role="group" aria-label="Overlays">
            <button
              type="button"
              className={`surface-map__chip surface-map__chip--sub${showZones ? ' is-active' : ''}`}
              onClick={() => { setShowZones((v) => !v); setSelectedZone(null); }}
              aria-pressed={showZones}
            >
              Wine regions
            </button>
            {/* The projections placeholder that used to sit here was replaced
                on 2026-08-25 by the Measured/Projected switch above. It belonged
                in this group while it was an overlay you could add; a projection
                REPLACES the surface rather than sitting on top of it, so it is a
                mode, not a layer toggle. */}
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
              aria-label={granularity === 'daily' ? 'Back a week' : granularity === 'season' ? 'Previous season' : 'Same month, previous year'}
              title={granularity === 'daily' ? 'Back a week' : granularity === 'season' ? 'Previous season' : 'Same month, previous year'}
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              type="button"
              className="surface-map__play surface-map__play--nav"
              onClick={() => stepBy(-1)}
              disabled={navDisabled || (index ?? 0) <= 0}
              aria-label={granularity === 'daily' ? 'Previous day' : granularity === 'season' ? 'Previous step' : 'Previous month'}
              title={granularity === 'daily' ? 'Previous day' : granularity === 'season' ? 'Previous step' : 'Previous month'}
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
            aria-label={isDaily ? 'Day' : 'Month'}
            className="surface-map__range"
          />

          <div className="surface-map__nav" role="group" aria-label="Step forward">
            <button
              type="button"
              className="surface-map__play surface-map__play--nav"
              onClick={() => stepBy(1)}
              disabled={navDisabled || (index ?? 0) >= months.length - 1}
              aria-label={granularity === 'daily' ? 'Next day' : granularity === 'season' ? 'Next step' : 'Next month'}
              title={granularity === 'daily' ? 'Next day' : granularity === 'season' ? 'Next step' : 'Next month'}
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              className="surface-map__play surface-map__play--nav"
              onClick={() => jumpYear(1)}
              disabled={navDisabled}
              aria-label={granularity === 'daily' ? 'Forward a week' : granularity === 'season' ? 'Next season' : 'Same month, next year'}
              title={granularity === 'daily' ? 'Forward a week' : granularity === 'season' ? 'Next season' : 'Same month, next year'}
            >
              <ChevronsRight size={18} />
            </button>
          </div>

          <div className="surface-map__readout">
            <strong>
              {loading ? 'Loading…' : stepLabel(current, granularity)}
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

        </>
        )}

        {/* The offer, not a toll booth. Every layer is on screen at full
            resolution either way — what is withheld is the RECORD behind it, so
            the prompt says how much record that is rather than implying the map
            is crippled. */}
        {!projected && locked && (
          <div className="surface-map__unlock">
            <Lock size={15} aria-hidden="true" />
            <p>
              {access?.unlock
                || 'Sign in free to open the full record back to 1986.'}
              {spanLabel(access) && (
                <>
                  {' '}
                  {needsAccount ? 'The archive runs' : 'Daily runs'}{' '}
                  <strong>{spanLabel(access)}</strong>
                  {needsAccount
                    ? (access?.archive_count ? ` — ${access.archive_count} months` : '')
                    : (access?.daily_count ? ` — ${access.daily_count} days` : '')}.
                </>
              )}
            </p>
            <button
              type="button"
              className="surface-map__unlock-cta"
              onClick={onSignInRequired}
              disabled={!onSignInRequired}
            >
              {needsAccount ? 'Sign in free to open it' : 'See Insights Pro'}
            </button>
          </div>
        )}

        {!projected && error && (
          <p className="surface-map__error">Could not load the surface index.</p>
        )}
      </div>
    </div>
  );
}

export default SurfaceMap;
