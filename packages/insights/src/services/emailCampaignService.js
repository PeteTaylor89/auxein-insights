// src/services/emailCampaignService.js - Email Campaign API Service
import publicApi from './publicApi';

const ADMIN = '/admin/email';
const PUBLIC = '/public/email';

const emailCampaignService = {
  // Admin — Templates
  listTemplates: () => publicApi.get(`${ADMIN}/templates`).then(r => r.data),
  getTemplate: (id) => publicApi.get(`${ADMIN}/templates/${id}`).then(r => r.data),

  // Admin — Campaigns
  listCampaigns: (params = {}) => publicApi.get(`${ADMIN}/campaigns`, { params }).then(r => r.data),
  getCampaign: (id) => publicApi.get(`${ADMIN}/campaigns/${id}`).then(r => r.data),
  createCampaign: (data) => publicApi.post(`${ADMIN}/campaigns`, data).then(r => r.data),
  updateCampaign: (id, data) => publicApi.put(`${ADMIN}/campaigns/${id}`, data).then(r => r.data),
  deleteCampaign: (id) => publicApi.delete(`${ADMIN}/campaigns/${id}`).then(r => r.data),
  previewCampaign: (id) => publicApi.post(`${ADMIN}/campaigns/${id}/preview`).then(r => r.data),
  testSendCampaign: (id, email) => publicApi.post(`${ADMIN}/campaigns/${id}/test-send`, { email }).then(r => r.data),
  sendCampaign: (id, data = {}) => publicApi.post(`${ADMIN}/campaigns/${id}/send`, data).then(r => r.data),
  getCampaignStats: (id) => publicApi.get(`${ADMIN}/campaigns/${id}/stats`).then(r => r.data),
  estimateRecipients: (data) => publicApi.post(`${ADMIN}/campaigns/estimate-recipients`, data).then(r => r.data),

  // Admin — Users (for test send picker)
  listUsers: (params = {}) => publicApi.get('/admin/users', { params }).then(r => r.data),

  // Public — Email Preferences
  getPreferences: () => publicApi.get(`${PUBLIC}/preferences`).then(r => r.data),
  updatePreferences: (data) => publicApi.put(`${PUBLIC}/preferences`, data).then(r => r.data),
};

export default emailCampaignService;
