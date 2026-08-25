// packages/insights/src/services/taxonomyService.js
/**
 * Country and industry registry.
 *
 * These replace two hardcoded lists: the `INDUSTRIES` array that used to live
 * in `components/home/IndustryChips.jsx`, and the assumption of New Zealand
 * that ran through sixteen files. Both endpoints return `is_active`, so a pill
 * or a switcher entry goes live by flipping a boolean in the database rather
 * than by shipping a bundle.
 *
 * Public and unauthenticated — the scope resolver has to work for an anonymous
 * crawler or the region pages forfeit the organic search value that is the
 * whole reason they exist.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TAXONOMY_API = `${API_BASE}/public/taxonomy`;

const fetchApi = async (endpoint) => {
  const response = await fetch(`${TAXONOMY_API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.detail || `API error: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
};

/** Every country, or only those with data. */
export const getCountries = async ({ activeOnly = false } = {}) =>
  fetchApi(`/countries?active_only=${activeOnly}`);

/** Every industry, or only those with data. */
export const getIndustries = async ({ activeOnly = false } = {}) =>
  fetchApi(`/industries?active_only=${activeOnly}`);

/**
 * Validate a `/{country}/{industry}/...` URL prefix in one round trip.
 *
 * Throws with `status === 404` when either name is unknown — that is a
 * genuinely missing page. A KNOWN but inactive pair resolves normally with
 * `active: false`: Australia is a real place we intend to cover, and the right
 * response is a page that can rank, not a hole.
 */
export const resolveScope = async (country, industry) =>
  fetchApi(`/resolve?country=${encodeURIComponent(country)}` +
           `&industry=${encodeURIComponent(industry)}`);
