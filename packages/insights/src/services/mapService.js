// packages/insights/src/services/mapService.js
/**
 * The clickable region map, already projected to SVG coordinates.
 *
 * The server does the projection so the client is a dumb renderer and the same
 * component draws any country. Nothing here knows what shape it is fetching.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const MAP_API = `${API_BASE}/public/map`;

/**
 * @param {{country?: string, industry?: string, level?: 'region'|'all'}} [opts]
 * @returns {Promise<Object>} `{available, width, height, land, regions[]}`
 *   `available: false` with a `reason` for a scope that has no outline yet —
 *   Australia today. Not an error: it is a real page that should say so.
 */
export const getRegionMap = async ({ country, industry, level } = {}) => {
  const q = new URLSearchParams();
  if (country) q.set('country', country);
  if (industry) q.set('industry', industry);
  if (level) q.set('level', level);
  const qs = q.toString();

  const response = await fetch(`${MAP_API}${qs ? `?${qs}` : ''}`, {
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

export default { getRegionMap };
