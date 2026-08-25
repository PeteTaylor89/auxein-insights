// packages/insights/src/services/regionDashboardService.js
/**
 * The regional dashboard — one call, one payload, five blocks.
 *
 * Every block on the page keys off the same zone, so five requests would be
 * five chances for a partial render. The server also resolves coverage, which
 * differs per block: 13 of 23 zones have a live season, 12 have disease, 13
 * phenology, 21 history, 23 projections. The client renders each block's own
 * `reason` rather than deciding for itself what "no data" means.
 *
 * ## IT MUST GO THROUGH `publicApi`, AND IT DID NOT
 *
 * This used a bare `fetch` with only a Content-Type header, so no
 * Authorization token was ever sent and **the server saw every caller as
 * anonymous** — signed in, free or Pro. That was invisible while the payload
 * was the same for everyone. The moment history and projections were gated
 * (2026-08-24, on Pro; 2026-08-25, on a free account) it meant those two blocks
 * showed a sign-in prompt to people who were already signed in, including Pro
 * subscribers, and no amount of correcting the SERVER gate could fix it.
 *
 * `publicApi` is the axios instance carrying the request interceptor that
 * attaches `public_access_token`. **Any endpoint whose answer depends on who is
 * asking has to be called through it.** A raw `fetch` in this directory is only
 * safe for something genuinely public — the country outline, the taxonomy, the
 * zone geometry — and that distinction is easy to lose when an endpoint becomes
 * gated later, which is exactly what happened here.
 */
import publicApi from './publicApi';

/**
 * @param {string} slug zone slug, e.g. 'marlborough'
 * @returns {Promise<Object>} the dashboard payload
 * @throws {Error} with `.status === 404` when the slug is not an active zone
 */
export const getRegionDashboard = async (slug) => {
  // The path is relative to `publicApi`'s baseURL (VITE_API_URL), which already
  // ends at /api/v1 — the same URL the bare fetch built, now with the token.
  const { data } = await publicApi.get(
    `/public/public_climate/zones/${encodeURIComponent(slug)}/dashboard`,
  );
  return data;
};

export default { getRegionDashboard };
