// src/services/researchService.js — ADMIN HALF ONLY.
//
// Split from packages/insights/src/services/researchService.js. The public half
// (/public/research — list, getBySlug, citation, likes, comments, files) stays
// in the Insights SPA; only the /admin/research surface lives here.
import publicApi from './publicApi';

const ADMIN = '/admin/research';

const researchService = {
  adminList: (params = {}) => publicApi.get(ADMIN, { params }).then(r => r.data),
  adminGet: (id) => publicApi.get(`${ADMIN}/${id}`).then(r => r.data),
  create: (data) => publicApi.post(ADMIN, data).then(r => r.data),
  update: (id, data) => publicApi.put(`${ADMIN}/${id}`, data).then(r => r.data),
  archive: (id) => publicApi.delete(`${ADMIN}/${id}`).then(r => r.data),

  // Sections. Note the asymmetry, which is in the API not this client: create
  // is nested under the paper (`/{id}/sections`) while update and delete key
  // off the SECTION id (`/sections/{id}`).
  addSection: (id, data) => publicApi.post(`${ADMIN}/${id}/sections`, data).then(r => r.data),
  updateSection: (id, data) => publicApi.put(`${ADMIN}/sections/${id}`, data).then(r => r.data),
  deleteSection: (id) => publicApi.delete(`${ADMIN}/sections/${id}`).then(r => r.data),
  reorderSections: (id, sections) =>
    publicApi.put(`${ADMIN}/${id}/sections/order`, { sections }).then(r => r.data),
};

export default researchService;
