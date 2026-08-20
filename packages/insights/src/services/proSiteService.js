// src/services/proSiteService.js — client for Pro sites.
//
// A Pro subscriber places ONE point and the platform extracts that cell's whole
// 1986-2023 record. Placement is asynchronous: POST returns 202 with
// `status: 'populating'` and the work happens in a cron, so every caller has to
// handle a site that exists but has no numbers yet.
//
// Three refusals arrive as 4xx with a `code` in the body, and all three are
// things the subscriber can act on rather than errors to swallow:
//
//   off_land_mask  the point is on a cell the 500 m surface treats as water.
//                  Common on the coast. Carries `nearest_land` when there is
//                  one within 4 km, so the UI can offer to move there.
//   quota          every entitled slot is taken. The fix is another point
//                  subscription, not an upgrade — they stack.
//   move_limit     the move allowance for the year is spent (429).
import publicApi from './publicApi';

const BASE = '/insights/sites';

/**
 * FastAPI puts a dict `detail` straight through, so the code and message live
 * at `error.response.data.detail`. Normalising here means no component has to
 * know that shape, and an unexpected error still surfaces as a usable object
 * rather than as `[object Object]` in the UI.
 */
export function refusalOf(error) {
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return {
      code: detail.code || 'error',
      message: detail.message || 'That did not work.',
      nearestLand: detail.nearest_land || null,
      entitled: detail.entitled,
      used: detail.used,
      resetsOn: detail.resets_on || null,
      status: error?.response?.status,
    };
  }
  return {
    code: error?.response?.status === 402 ? 'quota' : 'error',
    message: typeof detail === 'string' ? detail : 'That did not work.',
    nearestLand: null,
    status: error?.response?.status,
  };
}

/** Every site this subscriber holds, plus the quota and move allowance. */
export async function listSites() {
  const { data } = await publicApi.get(BASE);
  return data;
}

export async function getSite(id) {
  const { data } = await publicApi.get(`${BASE}/${id}`);
  return data.site;
}

/** Claim a slot. Resolves to the 202 body; throws with a refusal on 4xx. */
export async function placeSite({ latitude, longitude, label }) {
  const { data } = await publicApi.post(BASE, { latitude, longitude, label });
  return data;
}

/**
 * Rename and/or move. The API decides which happened — a request whose
 * coordinates match the stored ones is a rename and does NOT spend a move, so
 * the caller passes the current position when it only means to relabel.
 */
export async function updateSite(id, { latitude, longitude, label }) {
  const { data } = await publicApi.patch(`${BASE}/${id}`, {
    latitude, longitude, label,
  });
  return data;
}

export async function deleteSite(id) {
  await publicApi.delete(`${BASE}/${id}`);
}

/** Per-vintage site values with the regional spread attached. */
export async function getSiteSeason(id, metrics) {
  const params = metrics?.length ? { metrics: metrics.join(',') } : {};
  const { data } = await publicApi.get(`${BASE}/${id}/season`, { params });
  return data;
}

/**
 * Month-by-month against the site's own normal and its region's.
 *
 * `baseline` drives BOTH normals — the API applies one period to each side, so
 * a caller must never request them separately and difference the results.
 */
export async function getSiteMonthly(id, { variable = 'temp_mean',
  statistic = 'mean', baseline } = {}) {
  const { data } = await publicApi.get(`${BASE}/${id}/monthly`, {
    params: { variable, statistic, baseline },
  });
  return data;
}

/**
 * The whole dashboard in one call: the site's climatology tiles, and this
 * season beside them.
 *
 * The two halves come from DIFFERENT SOURCES and the payload says so on every
 * field. `tiles` are the site's own cell from the 1986-2023 surface archive;
 * `season_to_date` is station data aggregated to the region, because no live
 * surface exists yet. Nothing here may merge them into one figure — the server
 * deliberately does not, and re-deriving on the client would undo that.
 */
export async function getSiteDashboard(id, { baseline } = {}) {
  const { data } = await publicApi.get(`${BASE}/${id}/dashboard`, {
    params: baseline ? { baseline } : {},
  });
  return data;
}

// Metrics worth charting on the Pro page, in the order a grower reads them.
// `r99p` is absent because the API omits it per site and says so in
// `meta.omitted` — showing it computed a different way from the regional figure
// would compare methods rather than places.
export const SITE_METRICS = [
  { key: 'gdd10', label: 'Growing degree days', unit: 'GDD' },
  { key: 'tmean', label: 'Mean temperature', unit: 'C' },
  { key: 'rain', label: 'Growing-season rainfall', unit: 'mm' },
  { key: 'frost_days', label: 'Frost days', unit: 'days' },
  { key: 'early_frost_days', label: 'Spring frost days', unit: 'days' },
  { key: 'last_spring_frost_doy', label: 'Last spring frost', unit: 'day of year' },
  { key: 'hot_days_25', label: 'Days over 25', unit: 'days' },
  { key: 'rx1day', label: 'Wettest day', unit: 'mm' },
];

export default {
  listSites, getSite, placeSite, updateSite, deleteSite,
  getSiteSeason, getSiteMonthly, getSiteDashboard, refusalOf, SITE_METRICS,
};
