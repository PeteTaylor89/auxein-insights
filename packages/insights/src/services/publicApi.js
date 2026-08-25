// src/services/publicApi.js - Separate API instance for public auth (Regional Intelligence)
import axios from 'axios';

// Create axios instance with base URL
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding the public auth token
publicApi.interceptors.request.use(
  (config) => {
    // Don't clobber an explicit Authorization (e.g. the Grow token passed to the
    // SSO exchange call) with the stored Insights token.
    const token = localStorage.getItem('public_access_token');
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
publicApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If error is 401 (Unauthorized) and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Public auth doesn't have refresh tokens
      // Clear tokens and let the app handle re-authentication
      localStorage.removeItem('public_access_token');
      localStorage.removeItem('public_user');
      
      // Don't redirect - let React context handle auth state
      // The usePublicAuth hook will detect this and update isAuthenticated
      return Promise.reject(error);
    }
    
    // Format error message for better handling.
    //
    // THE STATUS AND THE RESPONSE SURVIVE. This used to reject with a bare
    // `new Error(message)`, which threw away `error.response` — and callers
    // read it. `surfaceService.isSurfacesUnavailable` tests
    // `error?.response?.status` and then falls through to `!error?.response`,
    // so with the response stripped EVERY failure looked like "surfaces are
    // switched off" and the panel hid itself instead of reporting an outage.
    // `RegionDashboard` reads `error.status` to tell a 404 from a real fault.
    //
    // Both are attached rather than one: `.status` because it is what a caller
    // actually wants, `.response` because that is the axios shape existing code
    // already checks for.
    if (error.response) {
      const message = error.response.data?.detail ||
                     error.response.data?.message ||
                     error.message;
      const wrapped = new Error(message);
      wrapped.status = error.response.status;
      wrapped.response = error.response;
      return Promise.reject(wrapped);
    }
    
    // Network error
    return Promise.reject(new Error('Network error. Please check your connection.'));
  }
);

export default publicApi;