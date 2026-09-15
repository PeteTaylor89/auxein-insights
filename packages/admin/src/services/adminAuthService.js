// src/services/adminAuthService.js — Option B sign-in.
//
// One password login (Grow), then a server-side exchange for the Insights token.
// The direction matters: /public/auth/exchange converts a Grow token INTO an
// Insights one. There is no reverse, by design — `get_current_user` rejects a
// `public_access` token so Insights subscribers can never reach Grow routes.
// Logging in with Insights credentials instead would leave the Grow half of
// this app unreachable with no way to fix it.
import { authService } from '@vineyard/shared';
import publicApi, { INSIGHTS_TOKEN_KEY } from './publicApi';

export const GROW_USER_KEY = 'admin_grow_user';
export const INSIGHTS_USER_KEY = 'admin_insights_user';

/**
 * Exchange the stored Grow access token for a fresh Insights token.
 *
 * The Grow token is passed explicitly rather than left to the request
 * interceptor — publicApi's interceptor attaches the INSIGHTS token, which is
 * exactly the one we do not have yet (or which has just expired).
 */
export async function exchangeForInsightsToken(growToken) {
  const response = await publicApi.post('/public/auth/exchange', null, {
    headers: { Authorization: `Bearer ${growToken}` },
  });

  const { access_token: token, user } = response.data || {};
  if (!token) {
    throw new Error('Exchange succeeded but returned no Insights token.');
  }

  localStorage.setItem(INSIGHTS_TOKEN_KEY, token);
  if (user) localStorage.setItem(INSIGHTS_USER_KEY, JSON.stringify(user));

  return { token, user };
}

/**
 * Full admin sign-in: Grow password login, then the exchange.
 *
 * Returns both identities so the caller can check both flags. Deliberately does
 * NOT throw when the Insights half fails — a Grow admin whose `public_users`
 * row lacks `is_admin` should reach a screen that says precisely that, not a
 * generic login error. AdminRoute renders the diagnosis.
 */
export async function adminLogin(email, password) {
  // Grow login. `authService.storeAuthData` writes accessToken/refreshToken and
  // the userType keys that @vineyard/shared's client and AuthContext read.
  const loginResponse = await authService.login(email, password);
  authService.storeAuthData(loginResponse);

  const growUser = {
    id: loginResponse.user_id,
    email: loginResponse.username || email,
    fullName: loginResponse.full_name,
    userType: loginResponse.user_type,
    userTypeRole: loginResponse.user_type_role || loginResponse.user_type,
  };
  localStorage.setItem(GROW_USER_KEY, JSON.stringify(growUser));

  let insightsUser = null;
  let insightsError = null;
  try {
    ({ user: insightsUser } = await exchangeForInsightsToken(loginResponse.access_token));
  } catch (err) {
    insightsError = err;
  }

  return { growUser, insightsUser, insightsError };
}

/** Clear BOTH sessions. A half-cleared session is the bug this whole app risks. */
export function adminLogout() {
  authService.logout?.();
  [
    'accessToken', 'token', 'refreshToken', 'user',
    'userType', 'userTypeRole', 'authMetadata',
    INSIGHTS_TOKEN_KEY, INSIGHTS_USER_KEY, GROW_USER_KEY,
  ].forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* private mode */ }
  });
}

export function getStoredGrowUser() {
  try { return JSON.parse(localStorage.getItem(GROW_USER_KEY)); } catch { return null; }
}

export function getStoredInsightsUser() {
  try { return JSON.parse(localStorage.getItem(INSIGHTS_USER_KEY)); } catch { return null; }
}
