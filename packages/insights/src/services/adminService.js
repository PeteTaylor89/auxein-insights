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
// COMBINED ADMIN SERVICE
// ============================================

const adminService = {
  users: adminUserService,
  weather: adminWeatherService,
  data: adminDataService,
};

export default adminService;