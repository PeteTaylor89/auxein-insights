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
    //
    // `day_hours` here is the LEGACY path. It goes through the model's
    // set_day_hours, which expresses a typed total as "uncoded = total minus
    // whatever is already coded" — a number that disagrees with reality the
    // moment the next task completion lands. Send notes through this; send
    // hours through setUncodedHours below.
    const response = await api.patch(`/timesheets/days/${id}`, data);
    return response.data;
  },

  // The only hours figure a user enters. The day total is
  // entry_hours + uncoded_hours and is computed server-side, so there is
  // nothing to roll up and nothing to keep in agreement.
  //
  // This mirrors mobile's timesheets.setUncodedHours. Web had no method for it
  // at all, which is why it was still writing the legacy day_hours field.
  setUncodedHours: async (id, hours) => {
    const response = await api.patch(`/timesheets/days/${id}/uncoded`, { hours });
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