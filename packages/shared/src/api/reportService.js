// packages/shared/src/api/reportService.js
//
// TWO BUGS THIS FILE USED TO HAVE, both of which meant CSV export had never
// worked on any report:
//
//  1. The summary calls used '/v1/reports/...' but the export URLs were built as
//     `${baseURL}/reports/...` — no /v1 — so every export 404'd.
//  2. Exports were opened with `window.open(url + '&token=' + accessToken)`.
//     The API authenticates with OAuth2PasswordBearer, which reads the
//     Authorization header and nothing else, so the token in the query string
//     was ignored and the request was anonymous. 401 even once the path was
//     right — and it put a bearer token in browser history and server logs on
//     the way.
//
// Exports now go through the same authenticated axios client as everything
// else, as a blob, and the download is triggered from memory. No backend
// change, no token in a URL.
import api from './api';

const dateParams = (startDate, endDate, propertyId) => {
  const params = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (propertyId) params.property_id = propertyId;
  return params;
};

const get = async (path, params) => {
  const res = await api.get(`/v1/reports/${path}`, { params });
  return res.data;
};

/**
 * Fetch a CSV with the caller's credentials and hand it to the browser.
 * Returns nothing; throws if the request fails, so the caller can surface it
 * rather than leaving the user staring at a button that did nothing.
 */
const download = async (path, params, filename) => {
  const res = await api.get(`/v1/reports/${path}`, { params, responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a later tick — revoking synchronously can cancel the download in
  // some browsers before it has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

const reportService = {
  // ── Operations ──────────────────────────────────────────────────────
  getWorkByBlock: (startDate, endDate, propertyId) =>
    get('work-by-block/summary', dateParams(startDate, endDate, propertyId)),
  exportWorkByBlock: (startDate, endDate, propertyId) =>
    download('work-by-block/export', dateParams(startDate, endDate, propertyId), 'work_by_block.csv'),

  // No date range: an overdue task from three months ago is the point of the report.
  getOutstanding: (propertyId) =>
    get('outstanding/summary', propertyId ? { property_id: propertyId } : {}),
  exportOutstanding: (propertyId) =>
    download('outstanding/export', propertyId ? { property_id: propertyId } : {}, 'outstanding_work.csv'),

  getTaskSummary: (startDate, endDate, propertyId) =>
    get('tasks/summary', dateParams(startDate, endDate, propertyId)),
  exportTasks: (startDate, endDate, propertyId) =>
    download('tasks/export', dateParams(startDate, endDate, propertyId), 'tasks_report.csv'),

  getObservationSummary: (startDate, endDate, propertyId) =>
    get('observations/summary', dateParams(startDate, endDate, propertyId)),
  exportObservations: (startDate, endDate, propertyId) =>
    download('observations/export', dateParams(startDate, endDate, propertyId), 'observations_report.csv'),

  // ── Compliance ──────────────────────────────────────────────────────
  getHealthSafety: (startDate, endDate, propertyId) =>
    get('health-safety/summary', dateParams(startDate, endDate, propertyId)),
  // Two tables in one report, so the export names the one it wants.
  exportHealthSafety: (startDate, endDate, propertyId, section = 'incidents') =>
    download(
      'health-safety/export',
      { ...dateParams(startDate, endDate, propertyId), section },
      section === 'risks' ? 'risk_register.csv' : 'incident_register.csv',
    ),

  getSiteAccess: (startDate, endDate, propertyId) =>
    get('site-access/summary', dateParams(startDate, endDate, propertyId)),
  exportSiteAccess: (startDate, endDate, propertyId) =>
    download('site-access/export', dateParams(startDate, endDate, propertyId), 'site_access_log.csv'),

  // A census is a statement of what is in the ground now, so no date range.
  getVineyardCensus: (propertyId, includeRemoved = false) =>
    get('vineyard-census/summary', {
      ...(propertyId ? { property_id: propertyId } : {}),
      include_removed: includeRemoved,
    }),
  exportVineyardCensus: (propertyId, includeRemoved = false) =>
    download('vineyard-census/export', {
      ...(propertyId ? { property_id: propertyId } : {}),
      include_removed: includeRemoved,
    }, 'vineyard_census.csv'),

  // ── Resources ───────────────────────────────────────────────────────
  getTimesheetSummary: (startDate, endDate, propertyId) =>
    get('timesheets/summary', dateParams(startDate, endDate, propertyId)),
  exportTimesheets: (startDate, endDate, propertyId) =>
    download('timesheets/export', dateParams(startDate, endDate, propertyId), 'timesheets_report.csv'),

  // Assets are company-level — no property filter on the endpoint.
  getAssetSummary: () => get('assets/summary', {}),
  exportAssets: () => download('assets/export', {}, 'assets_report.csv'),

  getContractorSummary: (startDate, endDate, propertyId) =>
    get('contractors/summary', dateParams(startDate, endDate, propertyId)),
  exportContractors: (startDate, endDate, propertyId) =>
    download('contractors/export', dateParams(startDate, endDate, propertyId), 'contractors_report.csv'),
};

export default reportService;
