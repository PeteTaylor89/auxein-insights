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
    const token = localStorage.getItem('public_access_token');
    if (token) {
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
    
    // Format error message for better handling
    if (error.response) {
      const message = error.response.data?.detail || 
                     error.response.data?.message || 
                     error.message;
      return Promise.reject(new Error(message));
    }
    
    // Network error
    return Promise.reject(new Error('Network error. Please check your connection.'));
  }
);

export default publicApi;