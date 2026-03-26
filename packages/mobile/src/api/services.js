// mobile/src/api/services.js — Mobile API services using the mobile api instance
// These mirror the shared services but import from the mobile api (SecureStore auth)
import api from './api';

export const tasksService = {
  getMyTasks: async (params = {}) => {
    const res = await api.get('/tasks/tasks/my-tasks', { params });
    return res.data;
  },
  getTask: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}`);
    return res.data;
  },
  startTask: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/start`, payload);
    return res.data;
  },
  completeTask: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/complete`, payload);
    return res.data;
  },
  getEquipmentCheck: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/equipment-check`);
    return res.data;
  },
  getConsumables: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/consumables`);
    return res.data;
  },
};

export const taskRowService = {
  listRows: async (taskId, status) => {
    const params = {};
    if (status) params.status = status;
    const res = await api.get(`/tasks/${taskId}/rows`, { params });
    return res.data;
  },
  getProgress: async (taskId) => {
    const res = await api.get(`/tasks/${taskId}/rows/progress`);
    return res.data;
  },
  generateRows: async (taskId) => {
    const res = await api.post(`/tasks/${taskId}/rows/generate`);
    return res.data;
  },
  completeRow: async (taskId, rowId, data = {}) => {
    const res = await api.post(`/tasks/${taskId}/rows/${rowId}/complete`, data);
    return res.data;
  },
  skipRow: async (taskId, rowId, skipReason) => {
    const res = await api.post(`/tasks/${taskId}/rows/${rowId}/skip`, { skip_reason: skipReason });
    return res.data;
  },
};

export const observationService = {
  getTemplates: async () => {
    const res = await api.get('/observation-templates');
    return res.data;
  },
  getPlans: async (params = {}) => {
    const res = await api.get('/observation-plans', { params });
    return res.data;
  },
  createRun: async (payload) => {
    const res = await api.post('/observation-runs', payload);
    return res.data;
  },
};

export const blocksService = {
  getCompanyBlocks: async () => {
    const res = await api.get('/blocks/company');
    return res.data;
  },
};

export const propertyService = {
  listProperties: async () => {
    const res = await api.get('/v1/properties/');
    return res.data;
  },
};

export const authApi = {
  getProfile: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
  login: async (identifier, password) => {
    const formData = new URLSearchParams();
    formData.append('username', identifier);
    formData.append('password', password);
    const res = await api.post('/auth/login', formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-client-type': 'mobile' },
    });
    return res.data;
  },
  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
  },
};
