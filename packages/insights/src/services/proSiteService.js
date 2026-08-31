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
 * The whole dashboard in one call: the site's climatology tiles, the season in
 * progress, and the season just finished.
 *
 * THREE BLOCKS, and they do not share a source or a scale. The payload says
 * which on every field, and nothing here may merge them into one figure — the
 * server deliberately does not, and re-deriving on the client would undo that.
 *
 *   tiles             the site's own cell, 1986-2023 surface archive
 *   season_current    the site's own cell, live daily surface, against that
 *                     cell's own 1986-2005 curve. Both sides, one place.
 *   season_previous   stations aggregated to the REGION, against the regional
 *                     normal. A finished season is only fully recorded at
 *                     station scale, so this one stays regional and says so.
 */
export async function getSiteDashboard(id, { baseline } = {}) {
  const { data } = await publicApi.get(`${BASE}/${id}/dashboard`, {
    params: baseline ? { baseline } : {},
  });
  return data;
}

/**
 * This site's projected climate, scenario by scenario, against its own baseline.
 *
 * `delta` is the number to read: projected minus this cell's own 1986-2005
 * normal, both sampled from the same raster family, so the change is the change
 * MfE published rather than an artefact of two different baselines.
 *
 * `zone_delta` comes back beside it. A projected change means nothing without
 * something to size it against, and the site's own region is the honest
 * comparison — at Fancrest the two agree to 0.03 degC across all sixteen
 * scenario-periods, which is worth showing rather than asserting.
 *
 * FETCHED SEPARATELY from the dashboard, not folded into it. The grid is ~112
 * rows per season and the season is a control the reader changes, so putting it
 * in the dashboard payload would make every site open pay for a panel most
 * visits scroll past, and a season change would refetch the whole dashboard.
 *
 * Season defaults to ANN because SEPAPR is published only for gdd10 — see
 * `seasons` in the response, which is built from what this site actually holds.
 */
export async function getSiteProjections(id, { season } = {}) {
  const { data } = await publicApi.get(`${BASE}/${id}/projections`, {
    params: season ? { season } : {},
  });
  return data;
}

/**
 * Site-level phenology, with the region beside it.
 *
 * The panel previously rendered `dashboard.phenology`, which is the ZONE's
 * estimates read through `site.zone_id` — so a subscriber's own point showed
 * their region's flowering and harvest dates while looking site-specific. This
 * reads the point-level model.
 *
 * The variety row shape is deliberately identical to the zone payload's, so the
 * table renders unchanged; what is added is `zone` per variety and `spread` per
 * stage. `spread` is populated only where an ACCOUNT has three or more sites in
 * the same zone — a lone subscriber has no siblings, and filling it from other
 * subscribers' points would leak their placements.
 */
export async function getSitePhenology(id, { vintage } = {}) {
  const { data } = await publicApi.get(`${BASE}/${id}/phenology`, {
    params: vintage ? { vintage } : {},
  });
  return data;
}

// --- enterprise accounts ------------------------------------------------------

/**
 * Accounts this subscriber is a named member of.
 *
 * Empty for almost everyone, and that is the normal case rather than an error:
 * an account is an enterprise arrangement, not a tier. A caller uses the length
 * of this to decide whether the portfolio entry point exists at all.
 */
export async function listAccounts() {
  const { data } = await publicApi.get('/insights/accounts');
  return data.accounts || [];
}

/**
 * Every site on one account, one row each, with each model's headline.
 *
 * THE WHOLE SET COMES BACK AT ONCE and the table sorts and filters it locally.
 * 67 rows is a payload a browser sorts instantly and a server round-trips
 * slowly, so a re-sort costs nothing — and it means the CSV export and the
 * table can never disagree about what the current view is.
 */
export async function getAccountPortfolio(slug, { vintage, variety } = {}) {
  const { data } = await publicApi.get(
    `/insights/accounts/${encodeURIComponent(slug)}/portfolio`,
    { params: { vintage, variety } },
  );
  return data;
}

/**
 * The same rows as CSV, from the SAME server-side builder.
 *
 * Fetched as a blob through `publicApi` rather than pointed at with a plain
 * link, because every route here is behind `require_pro` and a bare <a href>
 * sends no Authorization header — the download would 401 and the browser would
 * save the error page. This is the `publicApi` rule the free-tier work already
 * ran into: a bare fetch drops the token.
 */
export async function downloadAccountPortfolioCsv(slug, { vintage, variety } = {}) {
  const res = await publicApi.get(
    `/insights/accounts/${encodeURIComponent(slug)}/portfolio.csv`,
    { params: { vintage, variety }, responseType: 'blob' },
  );
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio_${slug}_${vintage || 'current'}_${variety || 'SB'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick rather than immediately: Safari has not finished
  // reading the blob when click() returns and saves a zero-byte file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** One site's daily record: what the portfolio popup charts. */
export async function getSiteTimeseries(id, { start, end, vintage } = {}) {
  const { data } = await publicApi.get(`${BASE}/${id}/timeseries`, {
    params: { start, end, vintage },
  });
  return data;
}

/**
 * Download a CSV through `publicApi` and hand it to the browser.
 *
 * Shared by all three exports. A plain <a href> cannot be used for any of them:
 * every route is behind `require_pro` and a bare link sends no Authorization
 * header, so the download 401s and the browser saves the error page.
 */
async function downloadCsv(url, params, filename) {
  const res = await publicApi.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick, not immediately: Safari has not finished reading
  // the blob when click() returns and saves a zero-byte file.
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

export function downloadSiteTimeseriesCsv(id, label, opts = {}) {
  const slug = String(label || `site${id}`).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  return downloadCsv(`${BASE}/${id}/timeseries.csv`, opts, `${slug}_daily.csv`);
}

export function downloadAccountTimeseriesCsv(slug, opts = {}) {
  return downloadCsv(`/insights/accounts/${encodeURIComponent(slug)}/timeseries.csv`,
                     opts, `${slug}_daily.csv`);
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
