// packages/shared/src/api/reportService.js
import api from './api';

const reportService = {
  // Task reports
  getTaskSummary: async (startDate, endDate, propertyId) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (propertyId) params.property_id = propertyId;
    const res = await api.get('/v1/reports/tasks/summary', { params });
    return res.data;
  },
  exportTasks: (startDate, endDate, propertyId) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (propertyId) params.append('property_id', propertyId);
    return `${api.defaults.baseURL}/reports/tasks/export?${params.toString()}`;
  },

  // Observation reports
  getObservationSummary: async (startDate, endDate, propertyId) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (propertyId) params.property_id = propertyId;
    const res = await api.get('/v1/reports/observations/summary', { params });
    return res.data;
  },
  exportObservations: (startDate, endDate, propertyId) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (propertyId) params.append('property_id', propertyId);
    return `${api.defaults.baseURL}/reports/observations/export?${params.toString()}`;
  },

  // Timesheet reports
  getTimesheetSummary: async (startDate, endDate, propertyId) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (propertyId) params.property_id = propertyId;
    const res = await api.get('/v1/reports/timesheets/summary', { params });
    return res.data;
  },
  exportTimesheets: (startDate, endDate, propertyId) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (propertyId) params.append('property_id', propertyId);
    return `${api.defaults.baseURL}/reports/timesheets/export?${params.toString()}`;
  },

  // Asset reports (no property filter — assets are company-level)
  getAssetSummary: async () => {
    const res = await api.get('/v1/reports/assets/summary');
    return res.data;
  },
  exportAssets: () => {
    return `${api.defaults.baseURL}/reports/assets/export`;
  },

  // Contractor reports — completed work + site visits
  getContractorSummary: async (startDate, endDate, propertyId) => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (propertyId) params.property_id = propertyId;
    const res = await api.get('/v1/reports/contractors/summary', { params });
    return res.data;
  },
  exportContractors: (startDate, endDate, propertyId) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (propertyId) params.append('property_id', propertyId);
    return `${api.defaults.baseURL}/reports/contractors/export?${params.toString()}`;
  },
};

export default reportService;
