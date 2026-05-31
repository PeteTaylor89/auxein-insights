// services/tokenStore.js — single source of truth for mobile auth tokens.
//
// This module exists to enforce two hard guarantees that the previous
// scattered SecureStore calls did not:
//
//   1. KEYCHAIN ACCESSIBILITY. Tokens are stored with
//      keychainAccessibility: AFTER_FIRST_UNLOCK so they stay readable while
//      the device is LOCKED (screen off). expo-secure-store's default is
//      WHEN_UNLOCKED, under which getItemAsync FAILS while the iPhone is
//      locked. During a screen-off GPS track that made every background
//      request 401, and the old 401 handler then DELETED the tokens —
//      logging the user out mid-track and stranding the unsaved task.
//      See BUGS [GPS-iOS-AUTH].
//
//   2. CLEAR-ONLY-ON-REJECTION. Tokens are cleared exclusively on a
//      definitive auth rejection (401/403 from the refresh endpoint, or no
//      refresh token at all). A locked keychain, dropped network, timeout, or
//      5xx must NEVER destroy the session — the caller retries or queues.
//
// Refresh is single-flight: a burst of concurrent 401s (10s batch upload +
// 6s map poll during tracking) collapses to one /auth/refresh-token call.
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import Constants from 'expo-constants';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const ROLE_KEY = 'userTypeRole';

// AFTER_FIRST_UNLOCK: readable after the first unlock following a boot, and
// remains readable while the device is subsequently locked. The minimum
// accessibility level that supports screen-off background work.
const ACCESSIBLE = SecureStore.AFTER_FIRST_UNLOCK;
const SET_OPTS = { keychainAccessibility: ACCESSIBLE };

const API_URL = Constants.expoConfig?.extra?.apiUrl
  || Constants.manifest?.extra?.apiUrl
  || 'https://api.auxein.co.nz/api';

export async function getAccessToken() {
  try { return await SecureStore.getItemAsync(ACCESS_KEY); } catch { return null; }
}

export async function getRefreshToken() {
  try { return await SecureStore.getItemAsync(REFRESH_KEY); } catch { return null; }
}

export async function getRole() {
  try { return await SecureStore.getItemAsync(ROLE_KEY); } catch { return null; }
}

// Persist whichever tokens are supplied. The backend rotates the refresh
// token on every /auth/refresh-token call, so always persist refresh_token
// when present — dropping it (the old behaviour) left a stale copy in the
// keychain.
export async function setTokens({ access_token, refresh_token, role } = {}) {
  if (access_token) await SecureStore.setItemAsync(ACCESS_KEY, access_token, SET_OPTS);
  if (refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, refresh_token, SET_OPTS);
  if (role) await SecureStore.setItemAsync(ROLE_KEY, role, SET_OPTS);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(ROLE_KEY).catch(() => {});
  fireSessionCleared();
}

// ─── Session-cleared listeners ─────────────────────────────────────────────
// Anything holding live, user-scoped resources (notably the GPS foreground
// service) registers here so that a logout OR an interceptor-driven auth
// rejection tears it down. Using a listener registry keeps tokenStore free of
// imports from those modules (they import tokenStore, not vice-versa).
const _sessionClearedHandlers = new Set();

export function onSessionCleared(cb) {
  _sessionClearedHandlers.add(cb);
  return () => { _sessionClearedHandlers.delete(cb); };
}

function fireSessionCleared() {
  for (const cb of _sessionClearedHandlers) {
    try { cb(); } catch (e) { /* a bad listener must not block token clearing */ }
  }
}

// ─── Single-flight refresh ─────────────────────────────────────────────────
let _inFlight = null;

async function doRefresh() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    const err = new Error('No refresh token available');
    err.code = 'NO_REFRESH_TOKEN';
    throw err;
  }
  // Use a BARE axios call, not the intercepted `api` instance — otherwise a
  // 401 here would recurse back into this same refresh path.
  const res = await axios.post(
    `${API_URL}/auth/refresh-token`,
    { refresh_token: refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  const { access_token, refresh_token } = res.data || {};
  if (!access_token) throw new Error('Refresh response missing access_token');
  await setTokens({ access_token, refresh_token });
  return access_token;
}

// Returns the new access token. Concurrent callers share the in-flight promise.
export function refreshSession() {
  if (!_inFlight) {
    _inFlight = doRefresh();
    // Release the latch once settled (either outcome). Swallow on the derived
    // promise only — the original `_inFlight` still rejects for callers.
    _inFlight.finally(() => { _inFlight = null; }).catch(() => {});
  }
  return _inFlight;
}

// True only when the refresh failure means the session is genuinely dead and
// clearing tokens is correct. Network errors / timeouts / 5xx / no-response
// return false so a transient condition never logs the user out.
export function isAuthRejection(error) {
  if (error?.code === 'NO_REFRESH_TOKEN') return true;
  const status = error?.response?.status;
  return status === 401 || status === 403;
}
