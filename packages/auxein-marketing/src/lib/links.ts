/**
 * Product and app-store links.
 *
 * These mirror the backend defaults in `backend/core/config.py`
 * (GROW_FRONTEND_URL, GROW_APP_STORE_URL, GROW_PLAY_STORE_URL) so the
 * marketing site, the web app and the transactional emails all send people
 * to the same places. Update both if a store listing ever moves.
 */

export const GROW_LOGIN_URL = 'https://grow.auxein.co.nz';
export const INSIGHTS_URL = 'https://insights.auxein.co.nz';

export const GROW_APP_STORE_URL =
  'https://apps.apple.com/us/app/auxein-grow/id6774847550';
export const GROW_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=nz.co.auxein.grow';

/** Badge PNGs served from this site's own public/ dir (and the CDN, for emails). */
export const APP_STORE_BADGE = '/images/badges/app-store-badge.png';
export const PLAY_STORE_BADGE = '/images/badges/google-play-badge.png';
