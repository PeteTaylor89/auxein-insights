// src/services/researchService.js - Research Portal API Service
import publicApi from './publicApi';

const PUBLIC = '/public/research';
const ADMIN = '/admin/research';

const researchService = {
  // Public
  list: (params = {}) => publicApi.get(PUBLIC, { params }).then(r => r.data),
  getBySlug: (slug) => publicApi.get(`${PUBLIC}/${slug}`).then(r => r.data),
  getCitation: (slug, format = 'apa') =>
    publicApi.get(`${PUBLIC}/${slug}/citation`, { params: { format } }).then(r => r.data),
  like: (id) => publicApi.post(`${PUBLIC}/${id}/like`).then(r => r.data),
  unlike: (id) => publicApi.delete(`${PUBLIC}/${id}/like`).then(r => r.data),
  getComments: (id) => publicApi.get(`${PUBLIC}/${id}/comments`).then(r => r.data),
  addComment: (id, body, parentId) =>
    publicApi.post(`${PUBLIC}/${id}/comments`, { body, parent_id: parentId }).then(r => r.data),
  deleteComment: (id) => publicApi.delete(`${PUBLIC}/comments/${id}`).then(r => r.data),
  getFiles: (id) => publicApi.get(`${PUBLIC}/${id}/files`).then(r => r.data),

  // Admin
  adminList: (params = {}) => publicApi.get(ADMIN, { params }).then(r => r.data),
  adminGet: (id) => publicApi.get(`${ADMIN}/${id}`).then(r => r.data),
  create: (data) => publicApi.post(ADMIN, data).then(r => r.data),
  update: (id, data) => publicApi.put(`${ADMIN}/${id}`, data).then(r => r.data),
  archive: (id) => publicApi.delete(`${ADMIN}/${id}`).then(r => r.data),
  addSection: (id, data) => publicApi.post(`${ADMIN}/${id}/sections`, data).then(r => r.data),
  updateSection: (id, data) => publicApi.put(`${ADMIN}/sections/${id}`, data).then(r => r.data),
  deleteSection: (id) => publicApi.delete(`${ADMIN}/sections/${id}`).then(r => r.data),
  reorderSections: (id, sections) =>
    publicApi.put(`${ADMIN}/${id}/sections/order`, { sections }).then(r => r.data),
};

export default researchService;
