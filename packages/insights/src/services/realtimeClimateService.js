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
  getVarieties,
  getPhenology,
  getDiseasePressure,
  getRegionalOverview,
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