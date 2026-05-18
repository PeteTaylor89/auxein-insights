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

// --- Users (admin-scoped: /admin/users) ---
// Used for the assignee picker on task create. Same endpoint the web hits via
// usersService.getCompanyUsers — returns the caller's company's user list.
export const usersService = {
  getCompanyUsers: async () => {
    const res = await api.get('/admin/users', { params: { skip: 0, limit: 200 } });
    const list = Array.isArray(res.data) ? res.data : (res.data?.users || []);
    return list.filter((u) => u.is_active !== false && !u.is_suspended);
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
  createTask: async (data) => {
    const res = await api.post('/tasks/tasks', data);
    return res.data;
  },
  listTaskTemplates: async (params = {}) => {
    const res = await api.get('/tasks/task-templates', { params });
    return res.data;
  },
  getTaskTemplate: async (templateId) => {
    const res = await api.get(`/tasks/task-templates/${templateId}`);
    return res.data;
  },
  quickCreateTask: async (data) => {
    // template_id is required server-side. assigned_user_ids creates one
    // TaskAssignment per user (multi-assign supported).
    const res = await api.post('/tasks/tasks/quick-create', data);
    return res.data;
  },
  // GPS tracking
  startGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/start`, payload);
    return res.data;
  },
  bulkAddGpsPoints: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/points/bulk`, payload);
    return res.data;
  },
  pauseGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/pause`, payload);
    return res.data;
  },
  resumeGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/resume`, payload);
    return res.data;
  },
  stopGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/stop`, payload);
    return res.data;
  },
  reprocessGpsTrack: async (taskId) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/reprocess`);
    return res.data;
  },
  getGpsTrack: async (taskId, params = {}) => {
    const res = await api.get(`/tasks/tasks/${taskId}/gps/track`, { params });
    return res.data;
  },
  getGpsTrackGeojson: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/gps/track/geojson`);
    return res.data;
  },
  getGpsStats: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/gps/stats`);
    return res.data;
  },
  getGpsSummary: async (taskId) => {
    // Returns 200 once GPS has been stopped (summary committed); 404 otherwise.
    const res = await api.get(`/tasks/tasks/${taskId}/gps/summary`);
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
  listRuns: async (params = {}) => {
    const res = await api.get('/observations/api/observation-runs', { params });
    return res.data;
  },
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
  cancelRun: async (runId) => {
    const res = await api.patch(`/observations/api/observation-runs/${runId}/cancel`);
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
  getBlocksGeoJson: async (propertyId = null) => {
    const params = propertyId ? { property_id: propertyId } : undefined;
    const res = await api.get('/blocks/geojson', { params });
    return res.data;
  },
};

// --- Properties (prefix: /v1/properties) ---
export const propertyService = {
  listProperties: async () => {
    const res = await api.get('/v1/properties/');
    return res.data;
  },
};

// --- Incidents (prefix: /risk-management/incidents) ---
export const incidentService = {
  list: async (params = {}) => {
    const res = await api.get('/risk-management/incidents/', { params });
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/risk-management/incidents/', data);
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/risk-management/incidents/${id}`);
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
  // Create a new calibration event. Pass `schedule_id` when this completes a
  // pending schedule — the backend will mark the schedule completed and auto-spawn
  // the next pending one (asset interval on pass, 7-day recheck on fail).
  create: async (data) => {
    const res = await api.post('/calibrations', data);
    return res.data;
  },
  // PUT only for editing/correcting a previously-saved event. Do not use to "complete" a calibration.
  update: async (id, data) => {
    const res = await api.put(`/calibrations/${id}`, data);
    return res.data;
  },
};

// --- Calibration Schedules (prefix: /calibration-schedules) ---
// Read-only from the mobile client. Schedules are created server-side as side-effects
// of asset registration and calibration events.
export const calibrationScheduleService = {
  get: async (id) => {
    const res = await api.get(`/calibration-schedules/${id}`);
    return res.data;
  },
  list: async (params = {}) => {
    const res = await api.get('/calibration-schedules', { params });
    return res.data;
  },
};

// --- Visitors (prefix: /visitors) ---
export const visitorService = {
  // Register a visitor + visit + sign in, in one call. Mirrors the web visitor portal flow.
  // Backend endpoint accepts a free-form dict + company_id query param.
  registerPortal: async (formData, companyId) => {
    const res = await api.post('/visitors/register', formData, { params: { company_id: companyId } });
    return res.data;
  },
  listActive: async () => {
    const res = await api.get('/visitors/visits/active');
    return res.data;
  },
  // Backend takes `notes` as a query param, not a body.
  signOut: async (visitId, notes) => {
    const res = await api.post(
      `/visitors/visits/${visitId}/sign-out`,
      null,
      { params: notes ? { notes } : {} },
    );
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
    // No trailing slash — backend route is `@router.get("")` so the canonical path is
    // `/api/v1/notifications` (no slash). A trailing slash triggers a 307 redirect, and
    // axios in React Native drops the Authorization header across redirects → 401.
    const res = await api.get('/v1/notifications', { params });
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
  markAllRead: async () => {
    const res = await api.post('/v1/notifications/read-all');
    return res.data;
  },
};

// --- Assets (prefix: /assets) ---
export const assetService = {
  listAssets: async (params = {}) => {
    const res = await api.get('/assets', { params });
    return res.data;
  },
  getAsset: async (id) => {
    const res = await api.get(`/assets/${id}`);
    return res.data;
  },
  createAsset: async (data) => {
    const res = await api.post('/assets', data);
    return res.data;
  },
  getAssetsGeoJson: async (category = null, propertyId = null) => {
    const params = {};
    if (category) params.category = category;
    if (propertyId) params.property_id = propertyId;
    const res = await api.get('/assets/geojson', {
      params: Object.keys(params).length ? params : undefined,
    });
    return res.data;
  },
};

// --- Forecast (prefix: /v1/forecast) ---
// Backend proxies MetOcean and returns a normalised flat shape:
//   {
//     location: { lat, lon },
//     current:  { timestamp, temperature_c, humidity_pct, ... },
//     forecast: [ ...same-shape items at interval_h spacing ]
//   }
export const forecastService = {
  current: async (lat, lon) => {
    const res = await api.get('/v1/forecast/current', { params: { lat, lon } });
    return res.data;
  },
  forecast: async (lat, lon, { hours = 24, intervalH = 3 } = {}) => {
    const res = await api.get('/v1/forecast/forecast', {
      params: { lat, lon, hours, interval_h: intervalH },
    });
    return res.data;
  },
  property: async (propertyId, { hours = 24, intervalH = 3 } = {}) => {
    const res = await api.get(`/v1/forecast/property/${propertyId}`, {
      params: { hours, interval_h: intervalH },
    });
    return res.data;
  },
};

// --- Risk Management (prefix: /risk-management) ---
export const riskService = {
  getRisks: async (params = {}) => {
    const res = await api.get('/risk-management/risks/', { params });
    return res.data;
  },
  getRisk: async (id) => {
    const res = await api.get(`/risk-management/risks/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/risk-management/risks/', data);
    return res.data;
  },
};

// --- Contractor self-service (prefix: /v1/contractor-management/me) ---
// Only callable when signed in as a contractor — backend enforces via
// get_current_contractor on /me/* endpoints. Router is mounted at
// /api/v1/contractor-management, so paths need the /v1/ segment.
export const contractorService = {
  listMyRelationships: async () => {
    const res = await api.get('/v1/contractor-management/me/relationships');
    return res.data;
  },
  getMyRelationship: async (relationshipId) => {
    const res = await api.get(`/v1/contractor-management/me/relationships/${relationshipId}`);
    return res.data;
  },
  // Profile + insurance + biosecurity (full record)
  getMyProfile: async () => {
    const res = await api.get('/v1/contractor-management/me/profile');
    return res.data;
  },
  updateMyProfile: async (patch) => {
    const res = await api.patch('/v1/contractor-management/me/profile', patch);
    return res.data;
  },
  updateMyInsurance: async (patch) => {
    const res = await api.patch('/v1/contractor-management/me/insurance', patch);
    return res.data;
  },
  changeMyPassword: async (current_password, new_password) => {
    const res = await api.post('/v1/contractor-management/me/password', { current_password, new_password });
    return res.data;
  },
  listMyMovements: async (limit = 10) => {
    const res = await api.get('/v1/contractor-management/me/movements', { params: { limit } });
    return res.data;
  },
  // Insurance documents
  listMyInsuranceDocs: async () => {
    const res = await api.get('/v1/contractor-management/me/insurance/docs');
    return res.data;
  },
  uploadMyInsuranceDoc: async ({ uri, name, mime, policy_type, expires_at }) => {
    const form = new FormData();
    form.append('policy_type', policy_type);
    if (expires_at) form.append('expires_at', expires_at);
    form.append('file', { uri, name, type: mime });
    const res = await api.post('/v1/contractor-management/me/insurance/docs', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  deleteMyInsuranceDoc: async (docId) => {
    await api.delete(`/v1/contractor-management/me/insurance/docs/${docId}`);
  },
};
