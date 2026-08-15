// src/services/surfaceService.js — client for the climate surface API.
//
// Contract: docs/plans/SURFACE_CONTRACT_V2.md §5. Response shapes here are the
// contract's, not the stub's — the stub is one implementation of them and the
// real pipeline will be another. Nothing in this file may depend on stub
// behaviour.
//
// Today it is served by backend/api/v1/surfaces.py, which 503s unless
// SURFACE_STUB_ENABLED=1. A 503 therefore means "surfaces are switched off",
// not "surfaces are broken", and callers should degrade quietly rather than
// showing an error — see isSurfacesUnavailable().
import publicApi from './publicApi';

const BASE = '/surfaces';

// The published archive is MONTHLY (1986-01..2023-12, 500 m) plus a per-variable
// `records` set. No daily surfaces exist: the backfill streams month-by-month
// into accumulators and never materialises a daily raster. Asking for `daily`
// now gets a 422 rather than an invented field, so `monthly` is the default
// everywhere on the client.
export const DEFAULT_GRANULARITY = 'monthly';

// Monthly and records surfaces are keyed by statistic as well as by date, so a
// tile URL without one is not resolvable. `mean` is the only statistic every
// variable publishes; rainfall's headline is `sum`.
export const DEFAULT_STATISTIC = {
  temp_mean: 'mean',
  temp_min: 'mean',
  temp_max: 'mean',
  rainfall: 'sum',
};

// §5 variable vocabulary. Units are the contract's and are NOT negotiable at
// the display layer — a chart that relabels C as F must convert, not rename.
export const SURFACE_VARIABLES = {
  temp_mean: { label: 'Mean temperature', unit: 'C', ramp: 'viridis' },
  temp_min: { label: 'Minimum temperature', unit: 'C', ramp: 'blues' },
  temp_max: { label: 'Maximum temperature', unit: 'C', ramp: 'magma' },
  rainfall: { label: 'Rainfall', unit: 'mm', ramp: 'blues' },
  rh: { label: 'Relative humidity', unit: '%', ramp: 'blues' },
  pet: { label: 'Evapotranspiration', unit: 'mm', ramp: 'magma' },
};

/**
 * The surface API is unreachable or switched off, as opposed to having
 * genuinely failed. Callers use this to hide a surface-backed panel instead of
 * rendering an error box — a disabled stub in dev must not look like an outage.
 */
export function isSurfacesUnavailable(error) {
  const status = error?.response?.status;
  return status === 503 || status === 404 || !error?.response;
}

/**
 * Point sample. Contract §5.1.
 *
 * Every returned point carries its own `resolution_m` and `confidence` — a
 * series may legitimately straddle the 5 km historical era and the 500 m modern
 * one, and callers must not average across that boundary silently.
 *
 * `value: null` means no surface for that date. It NEVER means zero. A
 * null-rainfall-written-as-zero bug (B4.1) has already bitten this platform.
 */
export async function getPoint({
  lon, lat, variables, start, end,
  granularity = DEFAULT_GRANULARITY,
  statistic,
}) {
  const { data } = await publicApi.get(`${BASE}/point`, {
    params: {
      lon, lat,
      variables: Array.isArray(variables) ? variables.join(',') : variables,
      start, end, granularity, statistic,
    },
  });
  return data;
}

/**
 * Zonal statistics. Contract §5.2.
 *
 * WARNING — the wine climate zone statistic is block-intersected and carries the
 * range across BLOCKS, not across raster cells, and is not the polygon
 * area-weighted mean that contract §5.2 currently describes. See
 * docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §0 D-C. Until the contract is
 * amended and the backend implements it, treat `min`/`max` from this endpoint as
 * cell extrema and do NOT present them as "coolest/warmest vineyard".
 */
export async function getRegion({ zoneId, variables, start, end, granularity = 'daily' }) {
  const { data } = await publicApi.get(`${BASE}/region`, {
    params: {
      zone_id: zoneId,
      variables: Array.isArray(variables) ? variables.join(',') : variables,
      start, end, granularity,
    },
  });
  return data;
}

/**
 * What exists and where the holes are. Contract §5.3.
 *
 * `gaps` is authoritative. The time-scrubber greys these out; it does not
 * request them and render holes.
 */
export async function getAvailable({
  variable = 'temp_mean',
  granularity = DEFAULT_GRANULARITY,
  statistic,
} = {}) {
  const { data } = await publicApi.get(`${BASE}/available`, {
    params: { variable, granularity, statistic },
  });
  return data;
}

/**
 * Raster tile URL template for Mapbox. Contract §5.4.
 *
 * Returned as a template with {z}/{x}/{y} intact because Mapbox substitutes
 * them itself. Absolute, since tiles are fetched by the map rather than by our
 * axios instance and so do not inherit its baseURL.
 */
export function tileUrlTemplate({
  variable,
  valid_at,
  granularity = DEFAULT_GRANULARITY,
  statistic,
  ramp,
  min,
  max,
}) {
  const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  const params = new URLSearchParams();
  // `ramp` is deliberately NOT defaulted here any more. The server holds a
  // measured default ramp AND a fixed display domain per (variable, statistic);
  // sending a ramp from the client overrides half of that pairing and can put a
  // blues ramp on a domain chosen for magma. Send one only when overriding on
  // purpose.
  if (ramp) params.set('ramp', ramp);
  if (statistic) params.set('statistic', statistic);
  // Overriding min/max leaves the server's fixed domain, so tiles rendered with
  // one range and tiles rendered with another must not be mixed in a session.
  if (min != null) params.set('min', String(min));
  if (max != null) params.set('max', String(max));
  const query = params.toString();
  const stamp = monthStamp(valid_at) || valid_at;
  return `${apiBase}${BASE}/tiles/${variable}/${granularity}/${stamp}/{z}/{x}/{y}.png${query ? `?${query}` : ''}`;
}

/** 'YYYY-MM' from a Date or any ISO date string. Monthly surfaces key on this. */
export function monthStamp(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// --- gap handling ----------------------------------------------------------
// `available.gaps` is a list of ISO intervals, "START/END". The scrubber, the
// mini map and any date picker all need the same answer to "can I ask for this
// date", so the parsing lives here once.
//
// GAP ENDPOINTS ARE EXCLUSIVE. A gap is emitted as
// `{available_date}/{next_available_date}` — both endpoints HAVE surfaces and
// only the interior is missing. Contract §5.3 does not currently say so, and
// getting it backwards is silently wrong in both directions: inclusive parsing
// greys out two perfectly good dates per gap, and a producer that later emits
// inclusive intervals makes the scrubber request holes. Flagged for the
// contract amendment; until then this is the authority.

/** Parse ["1993-01-01/1993-12-31", ...] into [{start, end}] of Date. */
export function parseGaps(gaps = []) {
  return gaps
    .map((g) => {
      const [start, end] = String(g).split('/');
      const s = new Date(start);
      const e = new Date(end ?? start);
      return Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) ? null : { start: s, end: e };
    })
    .filter(Boolean);
}

/** True when `date` falls strictly inside a gap and must not be requested. */
export function isInGap(date, gaps = []) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return true;
  return parseGaps(gaps).some((g) => d > g.start && d < g.end);
}

/**
 * The most recent date that actually has a surface, for "show me the latest"
 * callers (the home mini map). Returns an ISO date string, or null when the
 * variable has nothing at all.
 *
 * Walks backwards from `last` rather than trusting it, because `last` is the
 * end of the covered RANGE and the range may end inside a gap.
 */
export function latestAvailableDate(available, maxLookbackDays = 400) {
  if (!available?.last) return null;
  const gaps = parseGaps(available.gaps);
  const first = available.first ? new Date(available.first) : null;
  const d = new Date(available.last);
  for (let i = 0; i < maxLookbackDays; i += 1) {
    if (first && d < first) return null;
    const inGap = gaps.some((g) => d > g.start && d < g.end);
    if (!inGap) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

/**
 * Every month between `first` and `last` that is not inside a gap, as 'YYYY-MM'.
 * This is what the scrubber steps through — it must never offer a month the
 * archive does not hold.
 */
export function monthsAvailable(available) {
  if (!available?.first || !available?.last) return [];
  const gaps = parseGaps(available.gaps);
  const start = new Date(available.first);
  const end = new Date(available.last);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const out = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stop = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cursor.getTime() <= stop) {
    if (!gaps.some((g) => cursor > g.start && cursor < g.end)) {
      out.push(monthStamp(cursor));
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export default {
  getPoint,
  getRegion,
  getAvailable,
  tileUrlTemplate,
  parseGaps,
  isInGap,
  latestAvailableDate,
  monthsAvailable,
  monthStamp,
  isSurfacesUnavailable,
  SURFACE_VARIABLES,
  DEFAULT_GRANULARITY,
  DEFAULT_STATISTIC,
};
