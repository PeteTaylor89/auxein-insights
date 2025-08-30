// src/services/api.js
import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding the auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
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
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (!refreshToken) {
          // No refresh token available, redirect to login
          window.location.href = '/login';
          return Promise.reject(error);
        }
        
        // Request new access token
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || '/api'}/auth/refresh-token`, 
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );
        
        const { access_token } = response.data;
        
        // Store new access token
        localStorage.setItem('accessToken', access_token);
        
        // Retry the original request with new token
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        return axios(originalRequest);
      } catch (refreshError) {
        // If refresh fails, redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;