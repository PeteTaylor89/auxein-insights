// packages/shared/src/api/companyAdminService.js — Company admin dashboard API
import api from './api.js';

const companyAdminService = {
  // R3.1 — Timesheet summary
  getTimesheetSummary: (dateFrom, dateTo) => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    return api.get(`/v1/company-admin/timesheets/summary?${params}`);
  },

  // R3.2 — Training summary
  getTrainingSummary: () => api.get('/v1/company-admin/training/summary'),

  // R3.3 — User property scopes
  getUserPropertyScopes: (userId) =>
    api.get(`/v1/company-admin/users/${userId}/property-scopes`),

  setUserPropertyScopes: (userId, propertyIds) =>
    api.put(`/v1/company-admin/users/${userId}/property-scopes`, propertyIds),

  // R3.4 — iCal feed
  generateFeedToken: () => api.post('/v1/company-admin/calendar/feed/generate'),

  // R2 — Aliases
  getAliases: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.entity_type) qs.append('entity_type', params.entity_type);
    if (params.entity_id) qs.append('entity_id', params.entity_id);
    if (params.system_name) qs.append('system_name', params.system_name);
    return api.get(`/v1/aliases/?${qs}`);
  },

  createAlias: (data) => api.post('/v1/aliases/', data),
  updateAlias: (id, data) => api.patch(`/v1/aliases/${id}`, data),
  deleteAlias: (id) => api.delete(`/v1/aliases/${id}`),

  // Climate zones (public endpoint)
  getClimateZones: async () => {
    const res = await api.get('/v1/public/public_climate/zones');
    return res.data;
  },
};

export default companyAdminService;
