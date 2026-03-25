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

// Response interceptor for handling token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 (Unauthorized) and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Get stored refresh token
        const refreshToken = storage.get('refreshToken');

        if (!refreshToken) {
          // No refresh token available — on web, redirect to login
          if (typeof window !== 'undefined' && window.location) {
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }

        // Request new access token
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh-token`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const { access_token } = response.data;

        // Store new access token
        storage.set('accessToken', access_token);

        // Retry the original request with new token
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        return axios(originalRequest);
      } catch (refreshError) {
        // If refresh fails — on web, redirect to login
        storage.remove('accessToken');
        storage.remove('refreshToken');
        if (typeof window !== 'undefined' && window.location) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
