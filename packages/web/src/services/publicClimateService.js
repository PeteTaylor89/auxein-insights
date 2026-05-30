// packages/web/src/services/publicClimateService.js
/**
 * Public Climate API Service (Grow web)
 *
 * Faithful port of the Regional Insights publicClimateService so the Grow
 * Insights → Climate History tab can render the same zone-based climate views.
 *
 * These endpoints are public (unauthenticated). The router is mounted at
 * /api/v1/public/public_climate. Grow web's VITE_API_URL ends at /api (no
 * version segment), while Insights' ends at /api/v1 — the base resolver below
 * handles both so this file can be shared/synced verbatim.
 */

const RAW = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';
const ROOT = RAW.replace(/\/+$/, '');
const CLIMATE_API = /\/v\d+$/.test(ROOT)
  ? `${ROOT}/public/public_climate`
  : `${ROOT}/v1/public/public_climate`;

/**
 * Generic fetch wrapper with error handling
 */
const fetchApi = async (endpoint, options = {}) => {
  const url = `${CLIMATE_API}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Climate API Error [${endpoint}]:`, error);
    throw error;
  }
};

/**
 * Build query string from params object
 */
const buildQuery = (params) => {
  const filtered = Object.entries(params || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);

  return filtered.length > 0 ? `?${filtered.join('&')}` : '';
};

// =============================================================================
// REGIONS & ZONES
// =============================================================================

/** Get all wine regions with their climate zones */
export const getRegions = async () => fetchApi('/regions');

/** Get all climate zones */
export const getZones = async () => fetchApi('/zones');

/** Get single zone details */
export const getZone = async (slug) => fetchApi(`/zones/${slug}`);

// =============================================================================
// BASELINE
// =============================================================================

/** Get zone baseline data (1986-2005 average) */
export const getZoneBaseline = async (slug) => fetchApi(`/zones/${slug}/baseline`);

// =============================================================================
// HISTORY
// =============================================================================

/** Get monthly climate history for a zone */
export const getZoneHistory = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/zones/${slug}/history${query}`);
};

// =============================================================================
// SEASONS
// =============================================================================

/** Get growing season summaries for a zone */
export const getZoneSeasons = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/zones/${slug}/seasons${query}`);
};

// =============================================================================
// PROJECTIONS
// =============================================================================

/** Get climate projections for a zone */
export const getZoneProjections = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/zones/${slug}/projections${query}`);
};

// =============================================================================
// COMPARISONS
// =============================================================================

/** Compare multiple seasons for a zone */
export const compareSeasons = async (params) => {
  const query = buildQuery(params);
  return fetchApi(`/compare/seasons${query}`);
};

/** Compare multiple zones for a metric */
export const compareZones = async (params) => {
  const query = buildQuery(params);
  return fetchApi(`/compare/zones${query}`);
};

/** Compare multiple zones across multiple seasons (trend over time) */
export const compareZonesSeasons = async (params) => {
  const query = buildQuery(params);
  return fetchApi(`/compare/zones/seasons${query}`);
};

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

/** Growing season months (Sep-Apr) */
export const GROWING_SEASON_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4];

/** Month names for display */
export const MONTH_NAMES = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr',
  5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug',
  9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
};

/** Get growing season months in order (Sep → Apr) */
export const getGrowingSeasonLabels = () => GROWING_SEASON_MONTHS.map(m => MONTH_NAMES[m]);

/** Format a value with appropriate units */
export const formatMetricValue = (value, metric) => {
  if (value === null || value === undefined) return 'N/A';

  switch (metric) {
    case 'gdd':
      return `${Math.round(value)} °C·days`;
    case 'rain':
      return `${Math.round(value)} mm`;
    case 'tmean':
    case 'tmax':
    case 'tmin':
      return `${Number(value).toFixed(1)}°C`;
    default:
      return String(value);
  }
};

/** Format percentage difference */
export const formatPercentDiff = (value) => {
  if (value === null || value === undefined) return '';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(1)}%`;
};

export default {
  getRegions,
  getZones,
  getZone,
  getZoneBaseline,
  getZoneHistory,
  getZoneSeasons,
  getZoneProjections,
  compareSeasons,
  compareZones,
  compareZonesSeasons,
  GROWING_SEASON_MONTHS,
  MONTH_NAMES,
  getGrowingSeasonLabels,
  formatMetricValue,
  formatPercentDiff,
};
