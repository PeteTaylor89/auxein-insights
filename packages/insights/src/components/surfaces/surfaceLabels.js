// components/surfaces/surfaceLabels.js — how a surface value is NAMED and PRINTED.
//
// Extracted from SurfaceMap on 2026-09-04, when a second map (the article
// widget) needed the same vocabulary. Every one of these rules is a correction
// to something that was once wrong on screen, and a hand-copied second set
// would lose them one at a time:
//
//   - rainfall's `max` once read "Warmest day"
//   - twelve frost days once printed as "12.3 C"
//   - a daily stamp once rendered every day of August as "August 2026"
//
// The Atlas and the article widget import from here so a fix lands on both.
// Anything that names a statistic, a step or a unit belongs in this file.
import { SURFACE_VARIABLES, granularityFor } from '../../services/surfaceService';

export const STAT_LABELS = {
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
export const EXTREME_LABELS = {
  temp_mean: { min: 'Coldest day', max: 'Warmest day' },
  temp_min: { min: 'Coldest night', max: 'Warmest night' },
  temp_max: { min: 'Coolest day', max: 'Hottest day' },
  rainfall: { min: 'Driest day', max: 'Wettest day' },
};

// `sum` means "the whole month's rain" on rainfall and "the whole season's
// accumulation" on a degree-day layer. One label cannot carry both.
export const SEASON_STAT_LABELS = { sum: 'Season total' };

// Statistics whose unit is not the variable's own unit. Without this a count of
// frost days renders as "12 C".
export const COUNT_STATISTICS = new Set([
  'frost_days', 'wet_days', 'days_over_25', 'days_over_30',
  'days_over_10mm', 'days_over_25mm', 'max_dry_spell',
]);

// Units whose values are whole numbers. Mirrors `surface_store.INTEGER_UNITS` —
// the server decides which BAND is a count and sends the unit with the value, so
// this rounds on the unit rather than on a list of statistic names and a band
// added there needs no change here.
export const INTEGER_UNITS = new Set([
  'days', 'day of month', 'days since 1986-01-01', 'GDD',
]);

export function statLabel(stat, variable) {
  if (!stat) return '';
  if (granularityFor(variable) === 'season' && SEASON_STAT_LABELS[stat]) {
    return SEASON_STAT_LABELS[stat];
  }
  return EXTREME_LABELS[variable]?.[stat]
    || STAT_LABELS[stat]
    || stat.replace(/_/g, ' ');
}

export function monthLabel(stamp) {
  if (!stamp) return '';
  const [y, m] = String(stamp).split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return Number.isNaN(d.getTime())
    ? stamp
    : d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// A daily stamp is a full date and must READ as one. `monthLabel` splits on the
// dash and takes only the year and month, so it renders every day of August as
// "August 2026" — the scrubber would move, the map would change, and the label
// would sit still, which reads as a broken control rather than as a coarse one.
export function dayLabel(stamp) {
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

export function stepLabel(stamp, granularity) {
  return granularity === 'daily' ? dayLabel(stamp) : monthLabel(stamp);
}

export function unitFor(variable, statistic) {
  if (COUNT_STATISTICS.has(statistic)) return 'days';
  return SURFACE_VARIABLES[variable]?.unit || '';
}

// Decimals follow the UNIT THAT CAME BACK WITH THE VALUE, never the variable.
// Two different bands make that necessary: `temp_min/frost_days` is a count of
// days measured off a degree layer, and a projected rainfall field is a
// percentage change where the measured layer is millimetres. Keying this on
// `variable` prints '12.3 C' for twelve frost days.
export function formatProbeValue(value, unit) {
  if (value == null) return '';
  if (INTEGER_UNITS.has(unit)) return Math.round(value).toLocaleString('en-NZ');
  if (unit === '%') return value.toFixed(0);
  return value.toFixed(1);
}

// The archive's own span, for the anonymous prompt when the server has not
// said otherwise. Only ever a fallback — `access.archive_first/last` is the
// truth and moves when the archive is extended.
export function spanLabel(access) {
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
 * It surfaces when you leave the page while it is busy, because that is when
 * there are most layers and listeners still attached. Reordering the effects
 * would fix it today and break again the moment one is moved, so every teardown
 * path asks this instead.
 */
export function mapAlive(map) {
  return Boolean(map && map.style);
}

/**
 * The CSS gradient for a legend, from the server's published ramp.
 *
 * The bar's x-axis is the same 0..1 scaled value the tiler paints, so ticks
 * stay evenly spaced in VALUE while the colours sit wherever the server put
 * them. Rainfall's stops are front-loaded because the distribution is; ignoring
 * `positions` draws a legend the tiles do not obey.
 */
export function rampGradient(domain) {
  if (!domain?.stops?.length) return 'linear-gradient(90deg, #eee, #999)';
  const n = domain.stops.length;
  const positions = domain.positions?.length === n
    ? domain.positions
    : domain.stops.map((_, i) => (n > 1 ? i / (n - 1) : 0));
  const stops = domain.stops.map(
    ([r, g, b], i) => `rgb(${r},${g},${b}) ${(positions[i] * 100).toFixed(2)}%`,
  );
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** Five evenly spaced tick VALUES across a domain. */
export function legendTickValues(domain) {
  if (!domain) return [];
  const { min, max } = domain;
  return [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
}
