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

  // Runs
  startRun: async (planId, extras = {}) => {
    const res = await api.post('/observations/api/observation-runs', {
      plan_id: planId,
      ...extras,
    });
    return res.data;
  },
};

export default observationService;
