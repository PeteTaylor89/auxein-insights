// packages/shared/src/api/reportService.js
import api from './api';

const reportService = {
  // Task reports
  getTaskSummary: async (startDate, endDate) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const res = await api.get('/v1/reports/tasks/summary', { params });
    return res.data;
  },
  exportTasks: (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return `${api.defaults.baseURL}/reports/tasks/export?${params.toString()}`;
  },

  // Observation reports
  getObservationSummary: async (startDate, endDate) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const res = await api.get('/v1/reports/observations/summary', { params });
    return res.data;
  },
  exportObservations: (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return `${api.defaults.baseURL}/reports/observations/export?${params.toString()}`;
  },

  // Timesheet reports
  getTimesheetSummary: async (startDate, endDate) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const res = await api.get('/v1/reports/timesheets/summary', { params });
    return res.data;
  },
  exportTimesheets: (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return `${api.defaults.baseURL}/reports/timesheets/export?${params.toString()}`;
  },

  // Asset reports
  getAssetSummary: async () => {
    const res = await api.get('/v1/reports/assets/summary');
    return res.data;
  },
  exportAssets: () => {
    return `${api.defaults.baseURL}/reports/assets/export`;
  },
};

export default reportService;
