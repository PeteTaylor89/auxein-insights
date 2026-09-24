// src/services/pipelineService.js — the sales pipeline (Grow, Insights Pro,
// enterprise).
//
// Insights identity (require_admin), so it goes through publicApi. A bare
// fetch() here would drop the token and 403 with no clue why.
import publicApi from './publicApi';

const pipelineService = {
  /**
   * Every lead. Reading this ALSO pulls in any new Insights marketing opt-ins
   * (`synced`, as Grow leads) and Pro enquiries (`synced_pro`).
   */
  listLeads: () =>
    publicApi.get('/admin/pipeline/leads').then((r) => r.data),

  getLead: (id) =>
    publicApi.get(`/admin/pipeline/leads/${id}`).then((r) => r.data),

  createLead: (payload) =>
    publicApi.post('/admin/pipeline/leads', payload).then((r) => r.data),

  /** A PATCH. Send `stage_note` alongside `stage` to annotate the move. */
  updateLead: (id, payload) =>
    publicApi.patch(`/admin/pipeline/leads/${id}`, payload).then((r) => r.data),

  /** Manual leads only — the API refuses opt-in and enquiry leads with a 409. */
  deleteLead: (id) =>
    publicApi.delete(`/admin/pipeline/leads/${id}`).then((r) => r.data),

  // Both return the WHOLE lead, so the drawer replaces one object.
  addActivity: (id, payload) =>
    publicApi.post(`/admin/pipeline/leads/${id}/activities`, payload).then((r) => r.data),

  deleteActivity: (id, activityId) =>
    publicApi.delete(`/admin/pipeline/leads/${id}/activities/${activityId}`)
      .then((r) => r.data),

  searchCompanies: (q = '') =>
    publicApi.get('/admin/pipeline/companies', { params: { q } }).then((r) => r.data),

  /** Insights enterprise accounts, to link a won enterprise deal to. */
  searchAccounts: (q = '') =>
    publicApi.get('/admin/pipeline/accounts', { params: { q } }).then((r) => r.data),
};

export default pipelineService;
