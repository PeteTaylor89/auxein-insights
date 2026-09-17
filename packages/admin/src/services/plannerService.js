// src/services/plannerService.js — the admin's personal planner.
//
// Insights identity (require_admin), so it goes through publicApi. A bare
// fetch() here would drop the token and 403 with no clue why.
import publicApi from './publicApi';

const plannerService = {
  // --- tasks ---------------------------------------------------------------

  /** Tasks, optionally windowed by due date. Dates are 'YYYY-MM-DD' strings. */
  listTasks: (params = {}) =>
    publicApi.get('/admin/planner/tasks', { params }).then((r) => r.data),

  getTask: (id) =>
    publicApi.get(`/admin/planner/tasks/${id}`).then((r) => r.data),

  createTask: (payload) =>
    publicApi.post('/admin/planner/tasks', payload).then((r) => r.data),

  updateTask: (id, payload) =>
    publicApi.patch(`/admin/planner/tasks/${id}`, payload).then((r) => r.data),

  deleteTask: (id) =>
    publicApi.delete(`/admin/planner/tasks/${id}`).then((r) => r.data),

  reorderTasks: (ids) =>
    publicApi.post('/admin/planner/tasks/reorder', { ids }).then((r) => r.data),

  // --- subtasks ------------------------------------------------------------
  // All three return the WHOLE parent task, so the caller replaces one object
  // rather than reconciling a nested list by hand.

  addSubtask: (taskId, payload) =>
    publicApi.post(`/admin/planner/tasks/${taskId}/subtasks`, payload).then((r) => r.data),

  updateSubtask: (taskId, subtaskId, payload) =>
    publicApi.patch(`/admin/planner/tasks/${taskId}/subtasks/${subtaskId}`, payload)
      .then((r) => r.data),

  deleteSubtask: (taskId, subtaskId) =>
    publicApi.delete(`/admin/planner/tasks/${taskId}/subtasks/${subtaskId}`)
      .then((r) => r.data),

  // --- projects ------------------------------------------------------------

  listProjects: (includeArchived = false) =>
    publicApi.get('/admin/planner/projects', {
      params: { include_archived: includeArchived },
    }).then((r) => r.data),

  getProject: (id) =>
    publicApi.get(`/admin/planner/projects/${id}`).then((r) => r.data),

  createProject: (payload) =>
    publicApi.post('/admin/planner/projects', payload).then((r) => r.data),

  updateProject: (id, payload) =>
    publicApi.patch(`/admin/planner/projects/${id}`, payload).then((r) => r.data),

  deleteProject: (id) =>
    publicApi.delete(`/admin/planner/projects/${id}`).then((r) => r.data),

  addNote: (projectId, body) =>
    publicApi.post(`/admin/planner/projects/${projectId}/notes`, { body })
      .then((r) => r.data),

  updateNote: (projectId, noteId, body) =>
    publicApi.patch(`/admin/planner/projects/${projectId}/notes/${noteId}`, { body })
      .then((r) => r.data),

  deleteNote: (projectId, noteId) =>
    publicApi.delete(`/admin/planner/projects/${projectId}/notes/${noteId}`)
      .then((r) => r.data),

  // --- time ----------------------------------------------------------------

  listTime: (params = {}) =>
    publicApi.get('/admin/planner/time', { params }).then((r) => r.data),

  logTime: (payload) =>
    publicApi.post('/admin/planner/time', payload).then((r) => r.data),

  updateTime: (id, payload) =>
    publicApi.patch(`/admin/planner/time/${id}`, payload).then((r) => r.data),

  deleteTime: (id) =>
    publicApi.delete(`/admin/planner/time/${id}`).then((r) => r.data),

  /** Hours per project for a period, plus the unattributed bucket. */
  timeSummary: (params = {}) =>
    publicApi.get('/admin/planner/time/summary', { params }).then((r) => r.data),

  // --- misc ----------------------------------------------------------------

  listClients: () =>
    publicApi.get('/admin/planner/clients').then((r) => r.data),
};

export default plannerService;
