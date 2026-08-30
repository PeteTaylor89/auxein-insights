// src/services/adminService.js - Admin API Service for Regional Intelligence
import publicApi from './publicApi'; // Use public auth instance

const ADMIN_BASE = '/admin';

// ============================================
// USER MANAGEMENT
// ============================================

export const adminUserService = {
  /**
   * Get dashboard statistics
   */
  getStats: async () => {
    const response = await publicApi.get(`${ADMIN_BASE}/users/stats`);
    return response.data;
  },

  /**
   * List users with filters and pagination
   */
  listUsers: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/users`, { params });
    return response.data;
  },

  /**
   * Get single user detail
   */
  getUser: async (userId) => {
    const response = await publicApi.get(`${ADMIN_BASE}/users/${userId}`);
    return response.data;
  },

  /**
   * Update user (notes, is_active)
   */
  updateUser: async (userId, data) => {
    const response = await publicApi.patch(`${ADMIN_BASE}/users/${userId}`, data);
    return response.data;
  },

  /**
   * Export users to CSV
   */
  exportUsers: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/users/export`, {
      params,
      responseType: 'blob',
    });
    
    // Create download link
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * Get marketing segment breakdown
   */
  getSegments: async () => {
    const response = await publicApi.get(`${ADMIN_BASE}/users/segments`);
    return response.data;
  },

  /**
   * Get activity timeline
   */
  getActivity: async (days = 7, limit = 50) => {
    const response = await publicApi.get(`${ADMIN_BASE}/users/activity`, {
      params: { days, limit },
    });
    return response.data;
  },
};

// ============================================
// WEATHER INFRASTRUCTURE
// ============================================

export const adminWeatherService = {
  /**
   * Get station overview stats
   */
  getStationStats: async () => {
    const response = await publicApi.get(`${ADMIN_BASE}/weather/stations/stats`);
    return response.data;
  },

  /**
   * List all stations with health status
   */
  listStations: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/weather/stations`, { params });
    return response.data;
  },

  /**
   * Every active station with coordinates, status and variable list, for the
   * coverage map. One call — the map filters client-side from here.
   */
  getStationMap: async ({ refresh = false } = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/weather/stations/map`, {
      params: refresh ? { refresh: true } : undefined,
    });
    return response.data;
  },

  /**
   * Assign a station to a climate zone, or clear it by passing null.
   *
   * This is the switch that turns disease pressure on for a station: the hourly
   * rollup resolves a zone's members through `weather_stations.zone_id` and does
   * no spatial test at all, so a station inside a zone's boundary contributes
   * nothing to it until this is set.
   *
   * The response says whether the assignment is actually usable — a station with
   * no thermometer adds no scoreable hour however it is assigned, because an
   * hour with no temperature is skipped outright.
   */
  assignStationZone: async (stationId, zoneId) => {
    const response = await publicApi.put(
      `${ADMIN_BASE}/weather/stations/${stationId}/zone`,
      { zone_id: zoneId ?? null }
    );
    return response.data;
  },

  /**
   * Recent history for one station and one variable, for the map chart modal.
   */
  getStationSeries: async (stationId, variable, days = 10) => {
    const response = await publicApi.get(
      `${ADMIN_BASE}/weather/stations/${stationId}/series`,
      { params: { variable, days } }
    );
    return response.data;
  },

  /**
   * Get single station detail
   */
  getStation: async (stationId) => {
    const response = await publicApi.get(`${ADMIN_BASE}/weather/stations/${stationId}`);
    return response.data;
  },

  /**
   * Get station health metrics
   */
  getStationHealth: async (stationId) => {
    const response = await publicApi.get(`${ADMIN_BASE}/weather/stations/${stationId}/health`);
    return response.data;
  },

  /**
   * Get ingestion logs
   */
  getIngestionLogs: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/weather/ingestion/logs`, { params });
    return response.data;
  },

  /**
   * Get ingestion summary
   */
  getIngestionSummary: async (days = 7) => {
    const response = await publicApi.get(`${ADMIN_BASE}/weather/ingestion/summary`, {
      params: { days },
    });
    return response.data;
  },

  /**
   * Cleanup old ingestion logs
   */
  cleanupLogs: async (daysToKeep = 30) => {
    const response = await publicApi.delete(`${ADMIN_BASE}/weather/ingestion/logs/cleanup`, {
      params: { days_to_keep: daysToKeep },
    });
    return response.data;
  },
};

// ============================================
// DATA QUALITY
// ============================================

export const adminDataService = {
  /**
   * Get combined data overview
   */
  getOverview: async () => {
    const response = await publicApi.get(`${ADMIN_BASE}/data/overview`);
    return response.data;
  },

  /**
   * Get data gaps report
   */
  getGaps: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/data/gaps`, { params });
    return response.data;
  },

  /**
   * Get quality issues
   */
  getQualityIssues: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/data/quality-issues`, { params });
    return response.data;
  },

  /**
   * Get temporal coverage
   */
  getCoverage: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/data/coverage`, { params });
    return response.data;
  },

  /**
   * Get climate data status per zone
   */
  getClimateStatus: async () => {
    const response = await publicApi.get(`${ADMIN_BASE}/data/climate/status`);
    return response.data;
  },
};

// ============================================
// BANNER MANAGEMENT
// ============================================

export const adminBannerService = {
  listBanners: async () => {
    const response = await publicApi.get(`${ADMIN_BASE}/banners`);
    return response.data;
  },

  createBanner: async (data) => {
    const response = await publicApi.post(`${ADMIN_BASE}/banners`, data);
    return response.data;
  },

  updateBanner: async (id, data) => {
    const response = await publicApi.patch(`${ADMIN_BASE}/banners/${id}`, data);
    return response.data;
  },

  deleteBanner: async (id) => {
    const response = await publicApi.delete(`${ADMIN_BASE}/banners/${id}`);
    return response.data;
  },
};

// ============================================
// DAILY QC
// ============================================

export const adminQcService = {
  /**
   * Run health, coverage, check counts and repeat offenders in one call.
   * The health block comes from `weather_qc_run` — a pass that finds nothing
   * writes no finding, so the findings alone can never say whether QC ran.
   */
  getSummary: async (days = 14) => {
    const response = await publicApi.get(`${ADMIN_BASE}/qc/summary`, {
      params: { days },
    });
    return response.data;
  },

  /**
   * The run log — one row per invocation.
   */
  getRuns: async (limit = 50) => {
    const response = await publicApi.get(`${ADMIN_BASE}/qc/runs`, {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Findings, filterable. Passing `run_id` overrides the date window, because
   * a run's own window may sit outside the range the page is showing.
   */
  getFindings: async (params = {}) => {
    const response = await publicApi.get(`${ADMIN_BASE}/qc/findings`, { params });
    return response.data;
  },
};

// ============================================
// COMBINED ADMIN SERVICE
// ============================================

const adminService = {
  users: adminUserService,
  weather: adminWeatherService,
  data: adminDataService,
  banners: adminBannerService,
  qc: adminQcService,
};

export default adminService;