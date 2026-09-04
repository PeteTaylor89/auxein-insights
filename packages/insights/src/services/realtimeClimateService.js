// packages/insights/src/services/realtimeClimateService.js
/**
 * Realtime Climate API Service
 * 
 * Handles API calls for current season climate, phenology estimates,
 * and disease pressure data from the realtime climate endpoints.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const REALTIME_API = `${API_BASE}/public/realtime`;

/**
 * Generic fetch wrapper with error handling
 */
const fetchApi = async (endpoint, options = {}) => {
  const url = `${REALTIME_API}${endpoint}`;
  
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
    console.error(`Realtime API Error [${endpoint}]:`, error);
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
// ZONES
// =============================================================================

/**
 * Get all zones with current season data
 * @param {Object} params - Query parameters
 * @param {number} params.region_id - Filter by region ID
 * @returns {Promise<{zones: Array, vintage_year: number}>}
 */
export const getZonesWithData = async (params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/zones${query}`);
};

/**
 * Get all zones (including those without data) for selection
 * Uses the public climate API to get full zone list
 * @returns {Promise<{zones: Array}>}
 */
export const getAllZones = async () => {
  // Use the public_climate endpoint that returns all zones
  const url = `${API_BASE}/public/public_climate/zones`;
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching all zones:', error);
    throw error;
  }
};

// =============================================================================
// CURRENT SEASON CLIMATE
// =============================================================================

/**
 * Get current season climate summary for a zone
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {number} params.recent_days - Number of recent days to include (1-90)
 * @returns {Promise<{zone, season, recent_days, chart_data}>}
 */
export const getCurrentSeason = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/current-season/${slug}${query}`);
};

/**
 * Get GDD progress vs baseline for a zone
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {number} params.vintage_year - Vintage year (default: current)
 * @returns {Promise<{zone, vintage_year, current_gdd, baseline_gdd_at_date, daily_data, milestones}>}
 */
export const getGddProgress = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/gdd-progress/${slug}${query}`);
};

/**
 * Get hourly climate (temperature etc.) for a recent window.
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {number} params.days - Days of hourly history (1-30, default 10)
 * @returns {Promise<{zone, days, start, end, points}>}
 */
export const getHourlyClimate = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/hourly/${slug}${query}`);
};

// =============================================================================
// PHENOLOGY
// =============================================================================

/**
 * Get list of varieties with GDD thresholds
 * @returns {Promise<{varieties: Array}>}
 */
export const getVarieties = async () => {
  return fetchApi('/varieties');
};

/**
 * Get phenology estimates for a zone
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {string} params.varieties - Comma-separated variety codes
 * @returns {Promise<{zone, vintage_year, estimate_date, varieties}>}
 */
export const getPhenology = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/phenology/${slug}${query}`);
};

// =============================================================================
// DISEASE PRESSURE
// =============================================================================

/**
 * Get disease pressure indicators for a zone
 * @param {string} slug - Zone slug
 * @param {Object} params - Query parameters
 * @param {number} params.recent_days - Number of recent days (1-30)
 * @returns {Promise<{zone, latest_date, current_pressure, recent_days, chart_data}>}
 */
export const getDiseasePressure = async (slug, params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/disease-pressure/${slug}${query}`);
};

// =============================================================================
// REGIONAL OVERVIEW
// =============================================================================

/**
 * Get overview of all zones with current climate status
 * @param {Object} params - Query parameters
 * @param {number} params.region_id - Filter by region ID
 * @returns {Promise<{region_name, vintage_year, latest_data_date, zones, avg_gdd}>}
 */
export const getRegionalOverview = async (params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/regional-overview${query}`);
};

/**
 * Warmest, coldest and wettest STATION in the country right now, read off raw
 * observations rather than the zone aggregates every other call here uses.
 *
 * The aggregates are a day or two behind by design. This is the one call on
 * the home page that can say "46 minutes ago", which is the whole point of it.
 *
 * @param {Object} params
 * @param {number} params.window_hours - Look-back for the extremes (default 24)
 * @returns {Promise<{window_hours, generated_at, network_latest_at,
 *                    network_window_hours, reporting_stations, extremes}>}
 */
export const getLiveExtremes = async (params = {}) => {
  const query = buildQuery(params);
  return fetchApi(`/live-extremes${query}`);
};

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

/**
 * Phenology stage display names and colors
 */
export const PHENOLOGY_STAGES = {
  dormant: { name: 'Dormant', color: '#94A3B8', icon: '❄️' },
  budburst: { name: 'Budburst', color: '#22C55E', icon: '🌱' },
  pre_flowering: { name: 'Pre-flowering', color: '#84CC16', icon: '🌿' },
  flowering: { name: 'Flowering', color: '#EAB308', icon: '🌸' },
  fruit_set: { name: 'Fruit Set', color: '#F59E0B', icon: '🍇' },
  veraison: { name: 'Véraison', color: '#8B5CF6', icon: '🍇' },
  ripening: { name: 'Ripening', color: '#EC4899', icon: '🍷' },
  harvest_ready: { name: 'Harvest Ready', color: '#EF4444', icon: '✂️' },
  unknown: { name: 'Unknown', color: '#6B7280', icon: '❓' },
};

/**
 * Disease risk level colors and labels
 */
export const RISK_LEVELS = {
  low: { name: 'Low', color: '#22C55E', bgColor: '#DCFCE7' },
  moderate: { name: 'Moderate', color: '#F59E0B', bgColor: '#FEF3C7' },
  high: { name: 'High', color: '#EF4444', bgColor: '#FEE2E2' },
  extreme: { name: 'Extreme', color: '#991B1B', bgColor: '#FCA5A5' },
  unknown: { name: 'Unknown', color: '#6B7280', bgColor: '#F3F4F6' },
};

/**
 * Disease names for display
 */
export const DISEASE_NAMES = {
  downy_mildew: 'Downy Mildew',
  powdery_mildew: 'Powdery Mildew',
  botrytis: 'Botrytis',
};

/**
 * Variety code to display name mapping
 */
export const VARIETY_NAMES = {
  PN: 'Pinot Noir',
  CH: 'Chardonnay',
  SB: 'Sauvignon Blanc',
  RI: 'Riesling',
  PG: 'Pinot Gris',
  ME: 'Merlot',
  SY: 'Syrah',
};

// =============================================================================
// VINTAGE
// =============================================================================

/**
 * The vintage current at a date, on the JULY-JUNE cycle.
 *
 * The one mirror of `realtime_climate.get_current_vintage_year`, which is what
 * `climate_zone_daily.vintage_year` is keyed on. Every caller that needs to
 * name a vintage for a REALTIME endpoint must come through here.
 *
 * It is NOT the Sep-Apr vintage used by `insights_dashboard.current_vintage` on
 * the Pro page, and it is NOT `surfaceService.vintageFor`, which is Sep-Apr for
 * seasonal SURFACES. The three disagree by a year for part of the year, and
 * this one existing in two hand-copied versions is exactly how an article
 * widget and its own snapshot ended up drawing different seasons.
 *
 * @param {string|Date|null} value 'YYYY-MM-DD', a Date, or null for today
 * @returns {number}
 */
export const vintageAt = (value = null) => {
  const d = value == null
    ? new Date()
    : (value instanceof Date ? value : new Date(String(value).slice(0, 10)));
  if (Number.isNaN(d.getTime())) return new Date().getFullYear();
  // Date-only strings parse as UTC, so read them back as UTC or a NZ-morning
  // 1 July reads as 30 June and loses the whole vintage.
  const [year, month] = value instanceof Date || value == null
    ? [d.getFullYear(), d.getMonth() + 1]
    : [d.getUTCFullYear(), d.getUTCMonth() + 1];
  return month >= 7 ? year + 1 : year;
};

/**
 * The fallback vintage PAIR for a season comparison with no explicit vintages.
 *
 * Shared so the live widget and the snapshot taken of it cannot name different
 * seasons — they did, until 2026-09-04: the renderer resolved July-June while
 * the editor's snapshot used the calendar year, so freezing a widget in any
 * September through December silently shifted it back a season.
 *
 * @param {string|Date|null} asOfDate
 * @returns {string} 'YYYY,YYYY', newest first
 */
export const fallbackVintages = (asOfDate = null) => {
  const ref = vintageAt(asOfDate);
  return `${ref},${ref - 1}`;
};

/**
 * Format GDD value
 * @param {number} value 
 * @returns {string}
 */
export const formatGdd = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return `${Math.round(Number(value))} °C·days`;
};

/**
 * Format temperature value
 * @param {number} value 
 * @returns {string}
 */
export const formatTemp = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return `${Number(value).toFixed(1)}°C`;
};

/**
 * Format rainfall value
 * @param {number} value 
 * @returns {string}
 */
export const formatRainfall = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return `${Number(value).toFixed(1)} mm`;
};

/**
 * Format percentage value with sign
 * @param {number} value 
 * @returns {string}
 */
export const formatPercent = (value) => {
  if (value === null || value === undefined) return '';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(1)}%`;
};

/**
 * Format date for display
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', { 
    day: 'numeric', 
    month: 'short',
    year: 'numeric'
  });
};

/**
 * Format short date (day month)
 * @param {string} dateStr 
 * @returns {string}
 */
export const formatShortDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', { 
    day: 'numeric', 
    month: 'short'
  });
};

/**
 * Get status color based on baseline comparison
 * @param {string} status - 'ahead', 'behind', 'normal'
 * @returns {string} CSS color
 */
export const getStatusColor = (status) => {
  switch (status) {
    case 'ahead': return '#22C55E';
    case 'behind': return '#EF4444';
    case 'normal': return '#6B7280';
    default: return '#6B7280';
  }
};

/**
 * Calculate days until a date
 * @param {string} dateStr 
 * @returns {number|null}
 */
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diff;
};

export default {
  getZonesWithData,
  getCurrentSeason,
  getGddProgress,
  getHourlyClimate,
  getVarieties,
  getPhenology,
  getDiseasePressure,
  getRegionalOverview,
  vintageAt,
  fallbackVintages,
  PHENOLOGY_STAGES,
  RISK_LEVELS,
  DISEASE_NAMES,
  VARIETY_NAMES,
  formatGdd,
  formatTemp,
  formatRainfall,
  formatPercent,
  formatDate,
  formatShortDate,
  getStatusColor,
  daysUntil,
};