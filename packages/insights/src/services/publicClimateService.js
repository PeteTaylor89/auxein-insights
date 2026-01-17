// packages/insights/src/services/publicClimateService.js
/**
 * Public Climate API Service
 * 
 * Handles all API calls to the public climate endpoints for Regional Intelligence.
 * Zone-based climate data including history, baseline, and SSP projections.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const CLIMATE_API = `${API_BASE}/public/public_climate`;

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
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
};

/**
 * Build query string from params object
 */
const buildQuery = (params) => {
  const filtered = Object.entries(params || {})
    .filter(([_, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  
  return filtered.length > 0 ? `?${filtered.join('&')}` : '';
};

// =============================================================================
// REGIONS & ZONES
// =============================================================================

/**
 * Get all wine regions with their climate zones
 * @returns {Promise<{regions: Array}>}
 */
export const getRegions = async () => {
  return fetchApi('/regions');
};

/**
 * Get all climate zones
 * @returns {Promise<{zones: Array}>}
 */
export const getZones = async () => {
  return fetchApi('/zones');
};

/**
 * Get single zone details
 * @param {string} slug - Zone slug (e.g., 'waipara')
 * @returns {Promise<Object>}
 */
export const getZone = async (slug) => {
  return fetchApi(`/zones/${slug}`);
};

// =============================================================================
// BASELINE
// =============================================================================

/**
 * Get zone baseline data (1986-2005 average)
 * @param {string} slug - Zone slug
 * @returns {Promise<{zone, monthly, season}>}
 */
export const getZoneBaseline = async (slug) => {
  return fetchApi(`/zones/${slug}/baseline`);
};

// =============================================================================
// HISTORY
// =============================================================================

/**
 * Get monthly climate history for a zone
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {number} params.start_year - Start year filter
 * @param {number} params.end_year - End year filter
 * @param {number} params.vintage_year - Single vintage year filter
 * @param {string} params.months - Comma-separated months (e.g., '10,11,12,1,2,3,4')
 * @returns {Promise<{zone, data, metadata}>}
 */
export const getZoneHistory = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/zones/${slug}/history${query}`);
};

// =============================================================================
// SEASONS
// =============================================================================

/**
 * Get growing season summaries for a zone
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {number} params.start_vintage - Start vintage year
 * @param {number} params.end_vintage - End vintage year
 * @param {number} params.limit - Limit number of seasons (most recent)
 * @returns {Promise<{zone, baseline, seasons}>}
 */
export const getZoneSeasons = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/zones/${slug}/seasons${query}`);
};

// =============================================================================
// PROJECTIONS
// =============================================================================

/**
 * Get climate projections for a zone
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {string} params.ssp - SSP scenario (SSP126, SSP245, SSP370) or 'all'
 * @param {string} params.period - Time period (2021_2040, 2041_2060, 2080_2099) or 'all'
 * @returns {Promise<{zone, baseline_period, projections}>}
 */
export const getZoneProjections = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/zones/${slug}/projections${query}`);
};

// =============================================================================
// COMPARISONS
// =============================================================================

/**
 * Compare multiple seasons for a zone
 * @param {Object} params - Query parameters
 * @param {string} params.zone - Zone slug
 * @param {string} params.vintages - Comma-separated vintage years (e.g., '2020,2022,2024')
 * @param {boolean} params.include_baseline - Include baseline in comparison
 * @returns {Promise<{zone, baseline, seasons, chart_data}>}
 */
export const compareSeasons = async (params) => {
  const query = buildQuery(params);
  return fetchApi(`/compare/seasons${query}`);
};

/**
 * Compare multiple zones for a metric
 * @param {Object} params - Query parameters
 * @param {string} params.zones - Comma-separated zone slugs (max 5)
 * @param {string} params.metric - Metric to compare (gdd, rain, tmean, tmax, tmin)
 * @param {number} params.vintage_year - Vintage year (omit for baseline comparison)
 * @returns {Promise<{metric, metric_label, vintage_year, comparison_type, zones, chart_data}>}
 */
export const compareZones = async (params) => {
  const query = buildQuery(params);
  return fetchApi(`/compare/zones${query}`);
};

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

/**
 * SSP Scenario metadata for UI display
 */
export const SSP_SCENARIOS = {
  SSP126: {
    code: 'SSP126',
    name: 'SSP1-2.6',
    shortName: 'Low Emissions',
    description: 'Sustainability pathway with strong mitigation',
    color: '#22c55e', // green
  },
  SSP245: {
    code: 'SSP245',
    name: 'SSP2-4.5',
    shortName: 'Middle Road',
    description: 'Intermediate emissions scenario',
    color: '#f59e0b', // amber
  },
  SSP370: {
    code: 'SSP370',
    name: 'SSP3-7.0',
    shortName: 'High Emissions',
    description: 'Regional rivalry with limited mitigation',
    color: '#ef4444', // red
  },
};

/**
 * Projection period metadata for UI display
 */
export const PROJECTION_PERIODS = {
  '2021_2040': {
    code: '2021_2040',
    name: 'Near-term',
    label: '2021-2040',
    midpoint: 2030,
  },
  '2041_2060': {
    code: '2041_2060',
    name: 'Mid-century',
    label: '2041-2060',
    midpoint: 2050,
  },
  '2080_2099': {
    code: '2080_2099',
    name: 'End of century',
    label: '2080-2099',
    midpoint: 2090,
  },
};

/**
 * Growing season months (Oct-Apr)
 */
export const GROWING_SEASON_MONTHS = [10, 11, 12, 1, 2, 3, 4];

/**
 * Month names for display
 */
export const MONTH_NAMES = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr',
  5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug',
  9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
};

/**
 * Get growing season months in order (Oct → Apr)
 */
export const getGrowingSeasonLabels = () => {
  return GROWING_SEASON_MONTHS.map(m => MONTH_NAMES[m]);
};

/**
 * Format a value with appropriate units
 * @param {number} value 
 * @param {string} metric - gdd, rain, tmean, tmax, tmin
 * @returns {string}
 */
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

/**
 * Format percentage difference
 * @param {number} value 
 * @returns {string}
 */
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
  SSP_SCENARIOS,
  PROJECTION_PERIODS,
  GROWING_SEASON_MONTHS,
  MONTH_NAMES,
  getGrowingSeasonLabels,
  formatMetricValue,
  formatPercentDiff,
};