// src/services/articleService.js — ADMIN HALF ONLY.
//
// Split from packages/insights/src/services/articleService.js, which mixes
// public reads (/public/articles — list, getBySlug, like, comments, recordView)
// with admin writes (/admin/articles). The public half stays in the Insights
// SPA and is deliberately NOT duplicated here: this origin has no article
// reader, so shipping the read methods would only invite someone to build one.
import publicApi from './publicApi';

const ADMIN = '/admin/articles';

const articleService = {
  adminList: (params = {}) => publicApi.get(ADMIN, { params }).then(r => r.data),
  adminGet: (id) => publicApi.get(`${ADMIN}/${id}`).then(r => r.data),
  create: (data) => publicApi.post(ADMIN, data).then(r => r.data),
  update: (id, data) => publicApi.put(`${ADMIN}/${id}`, data).then(r => r.data),
  archive: (id) => publicApi.delete(`${ADMIN}/${id}`).then(r => r.data),

  // SEO — note this is /admin/seo, not under the articles prefix.
  validateSeo: (contentType, contentId) =>
    publicApi.get(`/admin/seo/validate/${contentType}/${contentId}`).then(r => r.data),
};

export default articleService;
