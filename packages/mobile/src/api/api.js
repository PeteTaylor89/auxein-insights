// mobile/src/api/api.js — Mobile-specific axios instance (token handling via tokenStore)
import axios from 'axios';
import Constants from 'expo-constants';
import { getAccessToken, refreshSession, clearTokens, isAuthRejection } from '../services/tokenStore';

const API_URL = Constants.expoConfig?.extra?.apiUrl
  || Constants.manifest?.extra?.apiUrl
  || 'https://api.auxein.co.nz/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

// Request interceptor — attach bearer token from the keychain before each call.
// Reads go through tokenStore, which stores with AFTER_FIRST_UNLOCK so the read
// succeeds even while the device is locked (screen-off GPS tracking).
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getAccessToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (err) {
      // SecureStore not available (e.g. web preview) — skip
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — on 401, attempt one single-flight refresh then replay.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Single-flight: concurrent 401s (batch upload + map poll) collapse to
        // one refresh that persists BOTH the new access and rotated refresh token.
        const access_token = await refreshSession();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Only destroy the session on a DEFINITIVE auth rejection (401/403 from
        // refresh, or no refresh token). A locked keychain, dropped network,
        // timeout, or 5xx must NOT log the user out mid-task — reject and let
        // the caller retry or queue the work.
        if (isAuthRejection(refreshError)) {
          await clearTokens();
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
