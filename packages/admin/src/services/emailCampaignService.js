// src/services/emailCampaignService.js — ADMIN HALF ONLY.
//
// Split from packages/insights/src/services/emailCampaignService.js. The public
// half is the subscriber's own preference screen (/public/email/preferences) —
// that belongs to the Insights SPA and is not duplicated here.
import publicApi from './publicApi';

const ADMIN = '/admin/email';

const emailCampaignService = {
  // Templates
  listTemplates: () => publicApi.get(`${ADMIN}/templates`).then(r => r.data),
  getTemplate: (id) => publicApi.get(`${ADMIN}/templates/${id}`).then(r => r.data),

  // Campaigns
  listCampaigns: (params = {}) => publicApi.get(`${ADMIN}/campaigns`, { params }).then(r => r.data),
  getCampaign: (id) => publicApi.get(`${ADMIN}/campaigns/${id}`).then(r => r.data),
  createCampaign: (data) => publicApi.post(`${ADMIN}/campaigns`, data).then(r => r.data),
  updateCampaign: (id, data) => publicApi.put(`${ADMIN}/campaigns/${id}`, data).then(r => r.data),
  deleteCampaign: (id) => publicApi.delete(`${ADMIN}/campaigns/${id}`).then(r => r.data),
  previewCampaign: (id) => publicApi.post(`${ADMIN}/campaigns/${id}/preview`).then(r => r.data),
  testSendCampaign: (id, email) =>
    publicApi.post(`${ADMIN}/campaigns/${id}/test-send`, { email }).then(r => r.data),
  sendCampaign: (id, data = {}) => publicApi.post(`${ADMIN}/campaigns/${id}/send`, data).then(r => r.data),
  getCampaignStats: (id) => publicApi.get(`${ADMIN}/campaigns/${id}/stats`).then(r => r.data),
  estimateRecipients: (data) =>
    publicApi.post(`${ADMIN}/campaigns/estimate-recipients`, data).then(r => r.data),

  // Users — the test-send recipient picker. /admin/users, not under /admin/email.
  listUsers: (params = {}) => publicApi.get('/admin/users', { params }).then(r => r.data),
};

export default emailCampaignService;
