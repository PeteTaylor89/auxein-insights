// packages/shared/src/api/sprayCoverageService.js
import api from './api';

// NOTE: api base is `/api` and the tasks router is mounted at `/api/tasks`, so
// these paths carry a leading `/tasks` — and task-scoped routes double it
// (`/tasks/tasks/{id}/...`), matching the existing GPS endpoints in this module.
const sprayCoverageService = {
  // Spray Program — list summary rows for the company (optionally scoped).
  // decorator `/spray-coverages` + prefix `/api/tasks` => /api/tasks/spray-coverages
  listCoverages: async (params = {}) => {
    const res = await api.get('/tasks/spray-coverages', { params });
    return res.data;
  },

  // Per-event coverage: stats + GeoJSON grid (lazy-builds server-side if missing).
  getCoverage: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/spray-coverage`);
    return res.data;
  },

  // Force recompute (after a calibration correction, or debug).
  recompute: async (taskId) => {
    const res = await api.post(`/tasks/tasks/${taskId}/spray-coverage/recompute`);
    return res.data;
  },

  // Readiness diagnostic: will completing this task build a coverage raster,
  // and if not, what's missing? `asset` is null when no swath-width asset is
  // attached (UI shows nothing in that case).
  getReadiness: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/spray-coverage/readiness`);
    return res.data;
  },

  // Multi-block: blocks (other than the task's own) the track appears to have sprayed.
  getCandidates: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/spray-coverage/candidates`);
    return res.data;
  },

  // Confirm sprayed blocks → clone completed tasks + per-block coverage.
  confirmBlocks: async (taskId, blockIds) => {
    const res = await api.post(`/tasks/tasks/${taskId}/spray-coverage/confirm`, { block_ids: blockIds });
    return res.data;
  },
};

export default sprayCoverageService;
