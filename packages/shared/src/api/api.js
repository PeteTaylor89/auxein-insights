// src/services/api.js
import axios from 'axios';

// Create axios instance with base URL
// Safely read env — import.meta.env is only available in Vite (web), not React Native
const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

// Safe localStorage wrapper — returns null on React Native where localStorage doesn't exist
const storage = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, val); } catch {} },
  remove: (key) => { try { localStorage.removeItem(key); } catch {} },
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Session teardown ──────────────────────────────────────────────────────
// Clear ONLY when the session is genuinely dead. Mirrors authService.logout's
// key list so a forced logout leaves no stale fragments. Inlined (not imported
// from authService) because authService imports this module.
function clearSession() {
  ['accessToken', 'token', 'refreshToken', 'user',
   'userType', 'userTypeRole', 'authMetadata'].forEach((k) => storage.remove(k));
}

// True only when a refresh failure means the session is genuinely dead and
// wiping tokens + redirecting is correct. A dropped network, timeout, 5xx, or
// no-response returns false — a transient condition must NEVER log the user out
// mid-task (that strands unsaved form/observation work). Only a definitive
// auth rejection (401/403 from the refresh endpoint, or no refresh token at
// all) tears the session down.
function isAuthRejection(error) {
  if (error?.code === 'NO_REFRESH_TOKEN') return true;
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

// ─── Single-flight refresh ─────────────────────────────────────────────────
// A burst of concurrent 401s (e.g. a dashboard firing several requests at once
// after the access token quietly expired) collapses to a single
// /auth/refresh-token call. The backend rotates the refresh token on every
// call, so we persist BOTH the new access and the rotated refresh token —
// dropping the rotated refresh token (the old behaviour) left a stale copy in
// localStorage.
let _inFlight = null;

async function doRefresh() {
  const refreshToken = storage.get('refreshToken');
  if (!refreshToken) {
    const err = new Error('No refresh token available');
    err.code = 'NO_REFRESH_TOKEN';
    throw err;
  }
  // BARE axios (not the intercepted `api` instance) so a 401 here can't recurse
  // back into this same refresh path.
  const res = await axios.post(
    `${API_BASE_URL}/auth/refresh-token`,
    { refresh_token: refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  const { access_token, refresh_token } = res.data || {};
  if (!access_token) throw new Error('Refresh response missing access_token');
  storage.set('accessToken', access_token);
  storage.set('token', access_token); // compatibility alias used elsewhere
  if (refresh_token) storage.set('refreshToken', refresh_token);
  return access_token;
}

// Returns the new access token. Concurrent callers share the in-flight promise.
function refreshSession() {
  if (!_inFlight) {
    _inFlight = doRefresh();
    // Release the latch once settled (either outcome). Swallow on the derived
    // promise only — the original `_inFlight` still rejects for callers.
    _inFlight.finally(() => { _inFlight = null; }).catch(() => {});
  }
  return _inFlight;
}

// Request interceptor for adding the auth token
api.interceptors.request.use(
  (config) => {
    const token = storage.get('accessToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — on 401, attempt one single-flight refresh then replay.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Single-flight: concurrent 401s collapse to one refresh that persists
        // BOTH the new access and the rotated refresh token.
        const access_token = await refreshSession();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Only destroy the session + redirect on a DEFINITIVE auth rejection
        // (401/403 from refresh, or no refresh token). A locked-out keychain,
        // dropped network, timeout, or 5xx must NOT log the user out mid-task —
        // reject and let the caller surface a retryable error so unsaved work
        // (long forms, observation runs) is preserved.
        if (isAuthRejection(refreshError)) {
          clearSession();
          if (typeof window !== 'undefined' && window.location) {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
