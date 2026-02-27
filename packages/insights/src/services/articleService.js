// src/services/articleService.js - Articles API Service
import publicApi from './publicApi';

const PUBLIC = '/public/articles';
const ADMIN = '/admin/articles';

const articleService = {
  // Public
  list: (params = {}) => publicApi.get(PUBLIC, { params }).then(r => r.data),
  getBySlug: (slug) => publicApi.get(`${PUBLIC}/${slug}`).then(r => r.data),
  getRelated: (slug, limit = 4) => publicApi.get(`${PUBLIC}/${slug}/related`, { params: { limit } }).then(r => r.data),
  recordView: (id) => publicApi.post(`${PUBLIC}/${id}/view`).catch(() => {}),
  like: (id) => publicApi.post(`${PUBLIC}/${id}/like`).then(r => r.data),
  unlike: (id) => publicApi.delete(`${PUBLIC}/${id}/like`).then(r => r.data),
  getComments: (id) => publicApi.get(`${PUBLIC}/${id}/comments`).then(r => r.data),
  addComment: (id, body, parentId) =>
    publicApi.post(`${PUBLIC}/${id}/comments`, { body, parent_id: parentId }).then(r => r.data),
  deleteComment: (id) => publicApi.delete(`${PUBLIC}/comments/${id}`).then(r => r.data),

  // Admin
  adminList: (params = {}) => publicApi.get(ADMIN, { params }).then(r => r.data),
  adminGet: (id) => publicApi.get(`${ADMIN}/${id}`).then(r => r.data),
  create: (data) => publicApi.post(ADMIN, data).then(r => r.data),
  update: (id, data) => publicApi.put(`${ADMIN}/${id}`, data).then(r => r.data),
  archive: (id) => publicApi.delete(`${ADMIN}/${id}`).then(r => r.data),

  // SEO
  validateSeo: (contentType, contentId) =>
    publicApi.get(`/admin/seo/validate/${contentType}/${contentId}`).then(r => r.data),
};

export default articleService;
