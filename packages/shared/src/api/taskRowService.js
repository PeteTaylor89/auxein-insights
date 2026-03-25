// packages/shared/src/api/taskRowService.js — Task row management API
import api from './api';

const taskRowService = {
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

  updateRow: async (taskId, rowId, data) => {
    const res = await api.patch(`/tasks/${taskId}/rows/${rowId}`, data);
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

  bulkComplete: async (taskId, rowIds, notes, qualityRating) => {
    const res = await api.post(`/tasks/${taskId}/rows/bulk-complete`, {
      row_ids: rowIds,
      notes: notes || null,
      quality_rating: qualityRating || null,
    });
    return res.data;
  },

  bulkSkip: async (taskId, rowIds, skipReason) => {
    const res = await api.post(`/tasks/${taskId}/rows/bulk-skip`, {
      row_ids: rowIds,
      skip_reason: skipReason,
    });
    return res.data;
  },
};

export default taskRowService;
