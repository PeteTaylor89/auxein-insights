// src/services/observationService.js
import api from './api';

const observationService = {
  // Templates (system + company)
  getTemplates: async ({ include_system = true } = {}) => {
    const res = await api.get('/observations/api/observation-templates', {
      params: { include_system }
    });
    return res.data;
  },

  // Plans
  createPlan: async (payload) => {
    const res = await api.post('/observations/api/observation-plans', payload);
    return res.data;
  },

  getPlan: async (id) => {
    const res = await api.get(`/observations/api/observation-plans/${id}`);
    return res.data;
  },

  listPlans: async (params = {}) => (
    await api.get('/observations/api/observation-plans', { params })
  ).data,

  listRunsForPlan: async (planId) => (
    await api.get(`/observations/api/observation-plans/${planId}/runs`)
  ).data,

  updatePlan: async (id, payload) => {
    const res = await api.patch(`/observations/api/observation-plans/${id}`, payload);
    return res.data;
  },

  // Runs
  listRuns: async (params = {}) => (
    await api.get('/observations/api/observation-runs', { params })
  ).data,

  startRun: async (planId, extras = {}) => {
    const res = await api.post('/observations/api/observation-runs', {
      plan_id: planId,
      ...extras,
    });
    return res.data;
  },
  
  getRun: async (id) => (await api.get(`/observations/api/observation-runs/${id}`)).data,
  updateRun: async (id, payload) => (await api.patch(`/observations/api/observation-runs/${id}`, payload)).data,
  completeRun: async (id) => (await api.post(`/observations/api/observation-runs/${id}/complete`, {})).data,

  createRun: async (payload) => {
    const res = await api.post('/observations/api/observation-runs', payload);
    return res.data;
  },

  checkRunConflicts: async (planId, blockId = null, companyId = null) => {
    const params = { plan_id: planId };
    if (blockId) params.block_id = blockId;
    if (companyId) params.company_id = companyId;
    
    const res = await api.get('/observations/api/observation-runs/conflicts', { params });
    return res.data;
  },

  cancelRun: async (runId) => {
    const res = await api.patch(`/observations/api/observation-runs/${runId}/cancel`);
    return res.data;
  },

  // Templates
  getTemplate: async (id) => (await api.get(`/observations/api/observation-templates/${id}`)).data,

  // Spots
  listSpotsForRun: async (runId) =>
    (await api.get(`/observations/api/observation-runs/${runId}/spots`)).data,

  createSpot: async (runId, payload) =>
    (await api.post(`/observations/api/observation-runs/${runId}/spots`, payload)).data,

  updateSpot: async (spotId, payload) =>
    (await api.patch(`/observations/api/observation-spots/${spotId}`, payload)).data,

  deleteSpot: async (spotId) =>
    (await api.delete(`/observations/api/observation-spots/${spotId}`)).data,

  // Images
  uploadObservationPhoto: async ({ entityType, entityId, file, description }) => {
    const form = new FormData();
    form.append('entity_type', String(entityType));     // e.g. 'observation_spot'
    form.append('entity_id', String(entityId));         // numeric id as string
    form.append('file_category', 'photo');              // optional but recommended
    if (description) form.append('description', description);
    form.append('file', file);                          // the binary

    // IMPORTANT: do NOT set Content-Type header; let the browser add the boundary
    const res = await api.post('/files/upload', form);
    return res.data; // { file_id | id, file_url, download_url, ... }
  },

  listObservationPhotos: async ({ entityType, entityId }) => {
    const res = await api.get(`/files/entity/${entityType}/${entityId}`, {
      params: { file_category: 'photo' }
    });
    return res.data;
  },

  deleteObservationFile: async (fileId) => {
    const res = await api.delete(`/files/${fileId}`);
    return res.data;
  },

  getObservationFileDownloadUrl: (file) => {
    return file?.download_url || file?.file_url || null;
  },

};

export default observationService;
