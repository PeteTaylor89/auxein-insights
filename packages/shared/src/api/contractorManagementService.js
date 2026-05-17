// packages/shared/src/api/contractorManagementService.js - Contractor Management Service (Phase B)
import api from './api';

const BASE = '/v1/contractor-management';

const contractorManagementService = {
  // ===== B1: CONTRACTOR MANAGEMENT =====

  listContractors: async (params = {}) => {
    const res = await api.get(`${BASE}/contractors`, { params });
    return res.data;
  },

  getContractor: async (contractorId) => {
    const res = await api.get(`${BASE}/contractors/${contractorId}`);
    return res.data;
  },

  lookupContractorByEmail: async (email) => {
    const res = await api.get(`${BASE}/contractors/lookup`, { params: { email } });
    return res.data;
  },

  getDirectory: async (params = {}) => {
    const res = await api.get(`${BASE}/contractors/directory`, { params });
    return res.data;
  },

  listRelationships: async () => {
    const res = await api.get(`${BASE}/contractor-relationships`);
    return res.data;
  },

  createRelationship: async (data) => {
    const res = await api.post(`${BASE}/contractor-relationships`, data);
    return res.data;
  },

  updateRelationship: async (relationshipId, data) => {
    const res = await api.patch(`${BASE}/contractor-relationships/${relationshipId}`, data);
    return res.data;
  },

  verifyInsurance: async (relationshipId) => {
    const res = await api.post(`${BASE}/contractor-relationships/${relationshipId}/verify-insurance`);
    return res.data;
  },

  getAssignments: async (contractorId, params = {}) => {
    const res = await api.get(`${BASE}/contractors/${contractorId}/assignments`, { params });
    return res.data;
  },

  getMovements: async (contractorId, params = {}) => {
    const res = await api.get(`${BASE}/contractors/${contractorId}/movements`, { params });
    return res.data;
  },

  getTraining: async (contractorId) => {
    const res = await api.get(`${BASE}/contractors/${contractorId}/training`);
    return res.data;
  },

  // ===== B2: TASK ASSIGNMENTS =====

  assignToTask: async (taskId, data) => {
    const res = await api.post(`${BASE}/tasks/${taskId}/contractor-assignments`, data);
    return res.data;
  },

  listTaskAssignments: async (taskId) => {
    const res = await api.get(`${BASE}/tasks/${taskId}/contractor-assignments`);
    return res.data;
  },

  updateAssignment: async (assignmentId, data) => {
    const res = await api.patch(`${BASE}/contractor-assignments/${assignmentId}`, data);
    return res.data;
  },

  // ===== B3: BIOSECURITY MOVEMENTS =====

  checkIn: async (data) => {
    const res = await api.post(`${BASE}/contractor-movements/check-in`, data);
    return res.data;
  },

  checkOut: async (movementId, data) => {
    const res = await api.post(`${BASE}/contractor-movements/${movementId}/check-out`, data);
    return res.data;
  },

  listMovements: async (params = {}) => {
    const res = await api.get(`${BASE}/contractor-movements`, { params });
    return res.data;
  },

  getMovementDetail: async (movementId) => {
    const res = await api.get(`${BASE}/contractor-movements/${movementId}`);
    return res.data;
  },
};

export default contractorManagementService;
