// packages/shared/src/api/timesheetsService.js
import api from './api';

/**
 * Timesheets API service
 * Fixed URLs to match FastAPI route definitions
 */
const timesheetsService = {
  // ---- Days ----
  getDays: async (params = {}) => {
    const response = await api.get('/timesheets/days', { params });
    return response.data;
  },

  createDay: async (data) => {
    // data: { work_date (YYYY-MM-DD), day_hours?, notes? }
    const response = await api.post('/timesheets/days', data);
    return response.data;
  },

  getDayById: async (id) => {
    const response = await api.get(`/timesheets/days/${id}`);
    return response.data;
  },

  updateDay: async (id, data) => {
    // data: { day_hours?, notes? } (PATCH)
    const response = await api.patch(`/timesheets/days/${id}`, data);
    return response.data;
  },

  submitDay: async (id) => {
    const response = await api.post(`/timesheets/days/${id}/submit`);
    return response.data;
  },

  approveDay: async (id) => {
    const response = await api.post(`/timesheets/days/${id}/approve`);
    return response.data;
  },

  rejectDay: async (id, reason = '') => {
    const response = await api.post(`/timesheets/days/${id}/reject`, null, {
      params: reason ? { reason } : undefined,
    });
    return response.data;
  },

  releaseDay: async (id) => {
    const response = await api.post(`/timesheets/days/${id}/release`);
    return response.data;
  },

  // ---- Entries ----
  createEntry: async (data) => {
    // data: { timesheet_day_id, task_id?, hours }
    const response = await api.post('/timesheets/entries', data);
    return response.data;
  },

  updateEntry: async (entryId, data) => {
    // data: { task_id?, hours? }
    const response = await api.put(`/timesheets/entries/${entryId}`, data);
    return response.data;
  },

  deleteEntry: async (entryId) => {
    const response = await api.delete(`/timesheets/entries/${entryId}`);
    return response.data;
  },



};

export default timesheetsService;