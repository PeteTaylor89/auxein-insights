// mobile/src/api/services.js — Mobile API services
// Base URL is https://api.auxein.co.nz/api (or http://localhost:8000/api)
// All paths below are relative to that base.
import api from './api';

// --- Auth ---
export const authApi = {
  login: async (identifier, password) => {
    const formData = new URLSearchParams();
    formData.append('username', identifier);
    formData.append('password', password);
    const res = await api.post('/auth/login', formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-client-type': 'mobile' },
    });
    return res.data;
  },
  getProfile: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
  },
};

// --- Tasks (prefix: /tasks) ---
export const tasksService = {
  getMyTasks: async (userId, params = {}) => {
    const res = await api.get('/tasks/tasks', { params: { assigned_to_user_id: userId, ...params } });
    return res.data;
  },
  getUnifiedFeed: async (params = {}) => {
    const res = await api.get('/tasks/tasks/unified-feed', { params });
    return res.data;
  },
  getTask: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}`);
    return res.data;
  },
  getTasks: async (params = {}) => {
    const res = await api.get('/tasks/tasks', { params });
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

// --- Task Rows (prefix: /tasks) ---
export const taskRowService = {
  listRows: async (taskId, status) => {
    const params = {};
    if (status) params.status = status;
    const res = await api.get(`/tasks/tasks/${taskId}/rows`, { params });
    return res.data;
  },
  getProgress: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/rows/progress`);
    return res.data;
  },
  createRows: async (taskId, rows) => {
    const res = await api.post(`/tasks/tasks/${taskId}/rows/bulk`, rows);
    return res.data;
  },
  completeRow: async (taskId, rowId, data = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/rows/${rowId}/complete`, data);
    return res.data;
  },
  skipRow: async (taskId, rowId, skipReason) => {
    const res = await api.post(`/tasks/tasks/${taskId}/rows/${rowId}/skip`, { skip_reason: skipReason });
    return res.data;
  },
};

// --- Observations (prefix: /observations) ---
export const observationService = {
  // Templates
  getTemplates: async (params = {}) => {
    const res = await api.get('/observations/api/observation-templates', { params: { include_system: true, ...params } });
    return res.data;
  },
  getTemplate: async (id) => {
    const res = await api.get(`/observations/api/observation-templates/${id}`);
    return res.data;
  },
  // Plans
  getPlans: async (params = {}) => {
    const res = await api.get('/observations/api/observation-plans', { params });
    return res.data;
  },
  getPlan: async (id) => {
    const res = await api.get(`/observations/api/observation-plans/${id}`);
    return res.data;
  },
  // Runs
  createRun: async (payload) => {
    const res = await api.post('/observations/api/observation-runs', payload);
    return res.data;
  },
  getRun: async (id) => {
    const res = await api.get(`/observations/api/observation-runs/${id}`);
    return res.data;
  },
  completeRun: async (runId) => {
    const res = await api.post(`/observations/api/observation-runs/${runId}/complete`);
    return res.data;
  },
  // Spots
  getSpots: async (runId) => {
    const res = await api.get(`/observations/api/observation-runs/${runId}/spots`);
    return res.data;
  },
  createSpot: async (runId, payload) => {
    const res = await api.post(`/observations/api/observation-runs/${runId}/spots`, payload);
    return res.data;
  },
  updateSpot: async (spotId, payload) => {
    const res = await api.patch(`/observations/api/observation-spots/${spotId}`, payload);
    return res.data;
  },
  // Reference data
  getElStages: async () => {
    const res = await api.get('/observations/api/reference/el-stages');
    return res.data;
  },
  getCatalog: async (category) => {
    const res = await api.get(`/observations/api/reference/catalog/${category}`);
    return res.data;
  },
};

// --- Blocks (prefix: /blocks) ---
export const blocksService = {
  getCompanyBlocks: async () => {
    const res = await api.get('/blocks/company');
    return res.data?.blocks || res.data || [];
  },
};

// --- Properties (prefix: /v1/properties) ---
export const propertyService = {
  listProperties: async () => {
    const res = await api.get('/v1/properties/');
    return res.data;
  },
};

// --- Files (prefix: /v1/files) ---
export const fileService = {
  upload: async (entityType, entityId, imageUri, fileCategory = 'photo') => {
    const formData = new FormData();
    formData.append('entity_type', entityType);
    formData.append('entity_id', String(entityId));
    formData.append('file_category', fileCategory);
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: `${entityType}_${entityId}_${Date.now()}.jpg`,
    });
    const res = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return res.data;
  },
  getEntityFiles: async (entityType, entityId) => {
    const res = await api.get(`/files/entity/${entityType}/${entityId}`);
    return res.data;
  },
};

// --- Maintenance (prefix: /maintenance) ---
export const maintenanceService = {
  get: async (id) => {
    const res = await api.get(`/maintenance/${id}`);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/maintenance/${id}`, data);
    return res.data;
  },
  complete: async (id, data) => {
    const res = await api.put(`/maintenance/${id}`, {
      ...data,
      status: 'completed',
      completed_date: new Date().toISOString().split('T')[0],
    });
    return res.data;
  },
};

// --- Calibrations (prefix: /calibrations) ---
export const calibrationService = {
  get: async (id) => {
    const res = await api.get(`/calibrations/${id}`);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/calibrations/${id}`, data);
    return res.data;
  },
};

// --- Risk Actions (prefix: /risk-management) ---
export const riskActionService = {
  get: async (id) => {
    const res = await api.get(`/risk-management/actions/${id}`);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/risk-management/actions/${id}`, data);
    return res.data;
  },
  updateProgress: async (id, percentage, notes) => {
    const res = await api.put(`/risk-management/actions/${id}/progress`, {
      progress_percentage: percentage,
      notes,
    });
    return res.data;
  },
  complete: async (id, data) => {
    const res = await api.post(`/risk-management/actions/${id}/complete`, data);
    return res.data;
  },
};

// --- Notifications (prefix: /v1/notifications) ---
export const notificationService = {
  getNotifications: async (params = {}) => {
    const res = await api.get('/v1/notifications/', { params });
    return res.data;
  },
  getUnreadCount: async () => {
    const res = await api.get('/v1/notifications/unread-count');
    return res.data;
  },
  markRead: async (notificationId) => {
    const res = await api.patch(`/v1/notifications/${notificationId}/read`);
    return res.data;
  },
};
