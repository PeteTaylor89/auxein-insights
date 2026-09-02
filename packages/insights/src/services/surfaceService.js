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
// `records` set, and — since the live engine started on 2026-07-01 — a DAILY
// series for the four measured variables.
//
// `monthly` stays the default for everyone, because the archive is what the
// free tier is built on and the daily series is the Pro cadence. Daily is
// opt-in through `cadenceFor`, not something a variable falls into.
//
// The comment that used to sit here said no daily surfaces existed and that
// asking for `daily` returned a 422. That was true of the backfill, which
// streams month-by-month into accumulators and never materialises a daily
// raster, and it stopped being true when the forward engine shipped.
export const DEFAULT_GRANULARITY = 'monthly';

// Monthly and records surfaces are keyed by statistic as well as by date, so a
// tile URL without one is not resolvable. `mean` is the only statistic every
// variable publishes; rainfall's headline is `sum`.
export const DEFAULT_STATISTIC = {
  temp_mean: 'mean',
  temp_min: 'mean',
  temp_max: 'mean',
  rainfall: 'sum',
  // The whole running series. `sum` addresses one point of it (the April
  // accumulation) under another name, so defaulting to it would hand the
  // scrubber a single step per season.
  gdd10: 'cumulative',
  gdd0: 'cumulative',
};

// Not every variable is published at the same granularity. The GDD variables
// are SEASONAL accumulations — Sep-Apr, labelled by the vintage year — and do
// not exist as calendar months, so asking for them monthly 404s. Anything
// building a tile URL or an availability request must take the granularity
// from here rather than assuming the monthly default.
export const VARIABLE_GRANULARITY = {
  temp_mean: 'monthly',
  temp_min: 'monthly',
  temp_max: 'monthly',
  rainfall: 'monthly',
  gdd10: 'season',
  gdd0: 'season',
};

export function granularityFor(variable) {
  return VARIABLE_GRANULARITY[variable] || DEFAULT_GRANULARITY;
}

// Variables the live daily engine publishes. NOT the same list as
// `VARIABLE_GRANULARITY`: the GDD layers are seasonal accumulations and have no
// daily form at all, so offering a daily cadence for them would 404.
//
// Granularity used to be purely a property of the variable, which is why
// `granularityFor` takes no second argument. It is now a property of the
// variable AND a reader's choice, and `cadenceFor` is where the two meet — a
// caller that asks for a daily cadence on a variable that has none gets the
// variable's own granularity back rather than a 404.
export const DAILY_CAPABLE = new Set([
  'temp_mean', 'temp_min', 'temp_max', 'rainfall',
]);

export function cadenceFor(variable, cadence) {
  if (cadence === 'daily' && DAILY_CAPABLE.has(variable)) return 'daily';
  return granularityFor(variable);
}

/**
 * The statistic to send for a granularity.
 *
 * A daily surface HAS no statistic — it is the value, not an aggregate over a
 * period, and `surface_run` stores `statistic IS NULL` for exactly that reason.
 * Sending `mean` with a daily request matches zero rows and reports itself as
 * "no surface for this date", which is indistinguishable from a missing day.
 */
export function statisticFor(granularity, statistic) {
  return granularity === 'daily' ? undefined : statistic;
}

/**
 * The vintage a monthly step belongs to.
 *
 * The NZ growing season runs September to April and is labelled by the HARVEST
 * year: Sep 2013 through Apr 2014 is the 2014 season. May to August sits
 * between seasons; those months are attributed to the season that has just
 * finished, so scrubbing through winter keeps a region summary on the vintage a
 * grower last picked rather than blanking it or jumping a year early.
 *
 * Seasonal layers do not need this — their steps carry `season` from the
 * server, which is authoritative. Use that when it is present.
 */
export function vintageFor(validAt) {
  if (!validAt) return null;
  const [y, m] = String(validAt).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return m >= 9 ? y + 1 : y;
}

// §5 variable vocabulary. Units are the contract's and are NOT negotiable at
// the display layer — a chart that relabels C as F must convert, not rename.
/**
 * Zone polygons for the Atlas overlay, with one headline number each.
 *
 * `level` matters: zones NEST — Marlborough contains Lower Wairau, Awatere and
 * Upper Wairau — so asking for both levels at once stacks a parent polygon on
 * top of its own children and every click hits the parent. Pick one level per
 * zoom band.
 */
export async function fetchZoneLayer({ level = 'region', metric = 'gdd10', simplify = 0.001 } = {}) {
  const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  const params = new URLSearchParams({ level, metric, simplify: String(simplify) });
  const res = await fetch(`${base}/surfaces/zones?${params}`);
  if (!res.ok) throw httpError('zone layer', res.status);
  return res.json();
}

/**
 * Errors carry `.response.status` so `isSurfacesUnavailable()` can tell a
 * switched-off surface API from a real failure — the same shape the axios-based
 * callers in this module already produce. A 501 (no stub for this route) must
 * hide the panel, not render an error box.
 */
function httpError(what, status) {
  const err = new Error(`${what} failed: ${status}`);
  err.response = { status: status === 501 ? 503 : status };
  return err;
}

/** Growing-season history for one zone. Sep-Apr, labelled by vintage year. */
export async function fetchZoneSeason(slug, metrics) {
  const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  const params = new URLSearchParams();
  if (metrics?.length) params.set('metrics', metrics.join(','));
  const qs = params.toString();
  const res = await fetch(`${base}/surfaces/zones/${encodeURIComponent(slug)}/season${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw httpError('zone season', res.status);
  return res.json();
}

// `ramp` here is only the name of the server's default, kept for reference and
// for the rare explicit override; it is NOT sent on a normal tile request (see
// `tileUrlTemplate`). Every temperature variable shares one ramp on purpose, so
// a colour means one temperature across all three layers.
export const SURFACE_VARIABLES = {
  temp_mean: { label: 'Mean temperature', unit: 'C', ramp: 'temperature' },
  temp_min: { label: 'Minimum temperature', unit: 'C', ramp: 'temperature' },
  temp_max: { label: 'Maximum temperature', unit: 'C', ramp: 'temperature' },
  rainfall: { label: 'Rainfall', unit: 'mm', ramp: 'rain_depth' },
  rh: { label: 'Relative humidity', unit: '%', ramp: 'rain' },
  pet: { label: 'Evapotranspiration', unit: 'mm', ramp: 'heat' },
  // Unit is 'GDD', not 'C'. That is what makes the confidence guard in
  // SurfaceMap suppress the inherited degC cv_rmse instead of printing it
  // beside a degree-day total — these are integrated from temp_mean and were
  // never cross-validated in their own unit.
  gdd10: { label: 'Growing degree days', unit: 'GDD', ramp: 'heat' },
  gdd0: { label: 'Degree days above 0', unit: 'GDD', ramp: 'heat' },
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
  domain,
}) {
  const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  const params = new URLSearchParams();
  // `ramp` is deliberately NOT defaulted here any more. The server holds a
  // measured default ramp AND a fixed display domain per (variable, statistic);
  // sending a ramp from the client overrides half of that pairing — and the
  // pairing now carries stop POSITIONS too, so an override can also put evenly
  // spaced stops on a domain whose ramp was front-loaded for a skewed variable.
  // Send one only when overriding on purpose.
  if (ramp) params.set('ramp', ramp);
  if (statistic) params.set('statistic', statistic);
  // Overriding min/max leaves the server's fixed domain, so tiles rendered with
  // one range and tiles rendered with another must not be mixed in a session.
  if (min != null) params.set('min', String(min));
  if (max != null) params.set('max', String(max));
  // A TILE IS CACHED `immutable` FOR A YEAR, AND THE DOMAIN IS NOT IN ITS KEY.
  //
  // That pairing is safe for the DATA — a re-fit publishes a new model_version
  // rather than mutating a key — but the display domain is a rendering input
  // that lives outside the URL entirely. When the daily rainfall ceiling was
  // corrected from 40 mm to 156 on 2026-09-01, every browser that had already
  // drawn those tiles would have kept the clipped render for a year, and the
  // person most likely to be holding a warm cache is whoever asked for the fix.
  //
  // So the domain the server published is stamped into the URL. It is not a
  // version anyone has to remember to bump: it is derived from
  // `available.meta.domain`, so any future change to a ceiling, a floor or a
  // ramp changes the key by construction. Unknown query parameters are ignored
  // by the tiler, so this costs a few bytes and nothing else.
  if (domain) params.set('d', `${domain.min}_${domain.max}_${domain.ramp}`);
  const query = params.toString();
  const stamp = stampFor(valid_at, granularity);
  return `${apiBase}${BASE}/tiles/${variable}/${granularity}/${stamp}/{z}/{x}/{y}.png${query ? `?${query}` : ''}`;
}

/**
 * How a step is ADDRESSED at a granularity: 'YYYY-MM' for monthly and season,
 * the full ISO date for daily and hourly.
 *
 * Shared by the tile URL and the probe on purpose. They must resolve to the same
 * surface or the popup quotes a number off a raster the map is not showing, and
 * two copies of one truncation rule is exactly how that would happen. This used
 * to be `monthStamp(valid_at) || valid_at` inline, which was right only because
 * no daily layer had reached the Atlas yet.
 */
export function stampFor(valid_at, granularity = DEFAULT_GRANULARITY) {
  if (!valid_at) return valid_at;
  if (granularity === 'monthly' || granularity === 'season') {
    return monthStamp(valid_at) || valid_at;
  }
  return typeof valid_at === 'string' ? valid_at.slice(0, 10) : valid_at;
}

/**
 * ONE cell, ONE step — the value of the surface already on screen at a point.
 *
 * Free at whatever cadence the caller can already see: the server runs the same
 * gate as `/available`, so anonymous gets the newest step, an account gets the
 * 1986 archive and daily stays Pro. It carries NO confidence block; that, and
 * the series, is what `getPoint` sells.
 *
 * Rejections are meaningful and must not be swallowed as "unavailable":
 * **401** means signing in opens it, **402** means Pro does, and both arrive
 * with the offer sentence in `detail`. `isSurfacesUnavailable` deliberately does
 * not match either.
 *
 * Goes through `publicApi`, never a bare fetch — a bare fetch drops the token
 * and every gated step would come back 401 for a signed-in Pro user.
 */
export async function getProbe({
  lon, lat,
  variable = 'temp_mean',
  granularity = DEFAULT_GRANULARITY,
  valid_at,
  statistic,
}) {
  const { data } = await publicApi.get(`${BASE}/probe`, {
    params: {
      lon, lat, variable, granularity, statistic,
      valid_at: stampFor(valid_at, granularity),
    },
  });
  return data;
}

/**
 * The same probe against a projection or the 1986-2005 baseline.
 *
 * A separate call rather than a flag, mirroring the two tile builders: a
 * measurement is addressed by a date and a scenario by (scenario, period,
 * season), and one function taking either set is how a 2090 scenario ends up
 * labelled as measured weather.
 *
 * THE UNIT COMES BACK ON THE RESPONSE. A projected rainfall change field is a
 * percentage while the measured layer is millimetres — do not label this with
 * the variable's own unit.
 */
export async function getProjectionProbe({
  lon, lat, variable, statistic, scenario, period, season,
}) {
  const { data } = await publicApi.get(`${BASE}/projections/probe`, {
    params: { lon, lat, variable, statistic, scenario, period, season },
  });
  return data;
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

/**
 * The archive's own step list, verbatim.
 *
 * `monthsAvailable` RECONSTRUCTS the series by walking the calendar between
 * `first` and `last` and skipping gaps. That is right for a monthly series and
 * wrong for a seasonal one: a season runs Sep-Apr, so walking the calendar
 * invents May, June, July and August steps for all 37 seasons, and the server
 * emits no gaps for `season` precisely because winter is not missing data — it
 * is not part of a growing season. Read the steps instead of deducing them.
 */
export function stepsAvailable(available) {
  const steps = available?.meta?.steps;
  return Array.isArray(steps) ? steps.map((s) => s.valid_at) : [];
}

// --- projections ------------------------------------------------------------
//
// A separate address space from the observational surfaces, mirroring the
// separate table and the separate endpoints. `/surfaces/tiles/...` is a
// MEASUREMENT and `/surfaces/projections/tiles/...` is a SCENARIO, and nothing
// in this file may let one be built by mistake from the other's arguments —
// which is why the projection tile builder takes no `granularity` or `valid_at`
// at all. A projection is not keyed by a date.

/**
 * The projection catalogue. Contract: backend/api/v1/surfaces.py.
 *
 * With no `variable` it returns only the layer list, which is what the mode
 * switch needs in order to decide whether to appear. With one it also returns
 * every published (scenario, period, season), each with the national medians
 * the index already carries — so the change figure beside the map is available
 * the instant a chip is pressed, with no second request.
 *
 * ANONYMOUS CALLERS GET THE LAYER LIST AND NOTHING ELSE. Read
 * `meta.access.scope`; a client must not infer entitlement from whether the
 * arrays came back empty.
 */
export async function getProjectionCatalogue({ variable, statistic } = {}) {
  const { data } = await publicApi.get(`${BASE}/projections/available`, {
    params: { variable, statistic },
  });
  return data;
}

/**
 * The sentinel that addresses the 1986-2005 BASELINE instead of a scenario.
 *
 * The baseline lives in `surface_projection_run` alongside the projections,
 * carrying this literal in BOTH `scenario` and `period` (a CHECK makes the two
 * agree). That is why the flip between them is a change of two path segments
 * rather than a second endpoint — one route, one renderer, no chance of the two
 * drifting apart and rendering the same layer at two different scales.
 *
 * The server also publishes it as `meta.baseline_key`; prefer that when it is
 * present, and treat this as the fallback rather than the source of truth.
 */
export const PROJECTION_BASELINE = 'baseline';

/**
 * Raster tile URL template for a projection. Mapbox substitutes {z}/{x}/{y}.
 *
 * No `ramp` parameter is offered. Every projected layer has a MEASURED display
 * domain and a ramp chosen with it (`scripts/scan_projection_domains.py`), and
 * three of them — rainfall and the two day counts — have a different domain per
 * SEASON because a DJF total is three months and an ANN total is twelve.
 * Overriding half of that pairing from the client is how a map ends up rendered
 * at a scale its own legend does not describe.
 */
export function projectionTileUrlTemplate({
  variable, statistic, scenario, period, season,
}) {
  const apiBase = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  const path = [variable, statistic, scenario, period, season]
    .map(encodeURIComponent).join('/');
  return `${apiBase}${BASE}/projections/tiles/${path}/{z}/{x}/{y}.png`;
}

/**
 * The (scenario, period) pairs that actually exist for a layer.
 *
 * THE MATRIX IS NOT FULL: 16 of the 18 pairs are published, because only
 * ssp370 reaches the +3 C warming level. A client that renders the axes as a
 * cross product offers two chips that 404, so every combination shown has to be
 * checked against this.
 */
export function projectionCombinations(steps = []) {
  const seen = new Set();
  steps.forEach((s) => seen.add(`${s.scenario}|${s.period}`));
  return seen;
}

/** One published step, or null. `steps` is the catalogue's own array. */
export function findProjectionStep(steps = [], { scenario, period, season }) {
  return steps.find(
    (s) => s.scenario === scenario && s.period === period && s.season === season,
  ) || null;
}

export default {
  getPoint,
  getProbe,
  getProjectionProbe,
  stampFor,
  getProjectionCatalogue,
  projectionTileUrlTemplate,
  PROJECTION_BASELINE,
  projectionCombinations,
  findProjectionStep,
  getRegion,
  getAvailable,
  tileUrlTemplate,
  parseGaps,
  isInGap,
  latestAvailableDate,
  monthsAvailable,
  stepsAvailable,
  granularityFor,
  cadenceFor,
  statisticFor,
  DAILY_CAPABLE,
  vintageFor,
  monthStamp,
  isSurfacesUnavailable,
  SURFACE_VARIABLES,
  DEFAULT_GRANULARITY,
  DEFAULT_STATISTIC,
};
