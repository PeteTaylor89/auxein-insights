// src/services/publicApi.js — the INSIGHTS half of the admin app's dual-token setup.
//
// This app talks to two identity systems at once (see AdminAuthContext):
//   - this client  -> /api/v1/admin/*        with the Insights `public_access` token
//   - @vineyard/shared's `api` -> /api/admin/*, /api/v1/grow-admin/*  with the Grow token
//
// Forked from packages/insights/src/services/publicApi.js rather than imported,
// because the two apps need different behaviour on 401 (see below).
import axios from 'axios';

// BASE URL — the /api vs /api/v1 trap.
//
// VITE_API_URL is `/api` here, because @vineyard/shared reads the same variable
// and its services path themselves off `/api` (`/admin/companies`, but
// `/v1/company-admin/...`). Insights endpoints are all under /api/v1, so this
// client appends the /v1 the shared client deliberately omits. Setting
// VITE_API_URL to /api/v1 to suit this file would silently break every Grow
// call in the app.
const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

const publicApi = axios.create({
  baseURL: `${base}/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const INSIGHTS_TOKEN_KEY = 'admin_insights_token';

// Request interceptor — attach the Insights token.
publicApi.interceptors.request.use(
  (config) => {
    // Don't clobber an explicit Authorization: the token EXCHANGE call passes
    // the Grow token by hand, and must not have the stored Insights token
    // (which may be absent or stale) substituted underneath it.
    const token = localStorage.getItem(INSIGHTS_TOKEN_KEY);
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// A 401 here means the Insights half of the session died. The Insights token
// has no refresh, but in this app it is REDERIVABLE: it was minted by exchanging
// the Grow token, and the Grow token has its own refresh. So unlike the Insights
// SPA — which clears the token and drops you to a login — we notify the auth
// context, which re-runs the exchange once and retries.
//
// Without this, the failure mode is the one called out in the plan (§7.1): the
// Grow half of the admin site keeps working while every Insights page bounces,
// with nothing on screen naming the cause.
let onInsightsTokenExpired = null;
export function setInsightsTokenExpiredHandler(fn) {
  onInsightsTokenExpired = fn;
}

publicApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      if (onInsightsTokenExpired) {
        try {
          const newToken = await onInsightsTokenExpired();
          if (newToken) {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return publicApi(originalRequest);
          }
        } catch {
          // Re-exchange failed — fall through and reject. The context has
          // already torn the session down by this point.
        }
      }
    }

    // Preserve BOTH `.status` and `.response` on the rejection. The Insights
    // admin pages being moved in read `error.response.status` in places and
    // `error.status` in others; rejecting with a bare Error (the original bug
    // in the Insights client) makes every failure look like a feature being
    // switched off rather than an outage.
    if (error.response) {
      const message = error.response.data?.detail
        || error.response.data?.message
        || error.message;
      const wrapped = new Error(message);
      wrapped.status = error.response.status;
      wrapped.response = error.response;
      return Promise.reject(wrapped);
    }

    return Promise.reject(new Error('Network error. Please check your connection.'));
  },
);

export default publicApi;
