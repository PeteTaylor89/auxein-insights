// src/services/publicAuthService.js - FINAL WORKING VERSION
import publicApi from './publicApi';

const publicAuthService = {
  // ============================================
  // SIGNUP
  // ============================================
  
  signup: async function(userData) {
    const response = await publicApi.post('/public/auth/signup', userData);
    return response.data;
  },

  // ============================================
  // LOGIN
  // ============================================
  
  login: async function(email, password) {
    const response = await publicApi.post('/public/auth/login', { email, password });
    
    // Store token and user
    if (response.data.access_token) {
      localStorage.setItem('public_access_token', response.data.access_token);
      localStorage.setItem('public_user', JSON.stringify(response.data.user));
    }
    
    return response.data;
  },

  // ============================================
  // GET CURRENT USER
  // ============================================
  
  getCurrentUser: async function() {
    const response = await publicApi.get('/public/auth/me');
    return response.data;
  },

  // ============================================
  // UPDATE PROFILE
  // ============================================
  
  updateProfile: async function(updates) {
    const response = await publicApi.patch('/public/auth/me', updates);
    
    // Update stored user
    if (response.data) {
      localStorage.setItem('public_user', JSON.stringify(response.data));
    }
    
    return response.data;
  },

  // ============================================
  // UPDATE MARKETING PREFERENCES
  // ============================================
  
  updateMarketingPreferences: async function(preferences) {
    const response = await publicApi.patch('/public/auth/me/marketing-preferences', preferences);
    return response.data;
  },

  // ============================================
  // EMAIL VERIFICATION
  // ============================================
  
  verifyEmail: async function(token) {
    const response = await publicApi.post('/public/auth/verify-email', { token });
    return response.data;
  },

  // ============================================
  // RESEND VERIFICATION
  // ============================================
  
  resendVerification: async function(email) {
    const response = await publicApi.post('/public/auth/resend-verification', { email });
    return response.data;
  },

  // ============================================
  // FORGOT PASSWORD
  // ============================================
  
  forgotPassword: async function(email) {
    const response = await publicApi.post('/public/auth/forgot-password', { email });
    return response.data;
  },

  // ============================================
  // RESET PASSWORD
  // ============================================
  
  resetPassword: async function(token, newPassword) {
    const response = await publicApi.post('/public/auth/reset-password', {
      token,
      new_password: newPassword
    });
    return response.data;
  },

  // ============================================
  // HELPER ENDPOINTS
  // ============================================
  
  getUserTypes: async function() {
    const response = await publicApi.get('/public/auth/user-types');
    return response.data;
  },

  getRegions: async function() {
    const response = await publicApi.get('/public/auth/regions');
    return response.data;
  },

  // ============================================
  // LOGOUT
  // ============================================
  
  logout: function() {
    localStorage.removeItem('public_access_token');
    localStorage.removeItem('public_user');
  },

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  isAuthenticated: function() {
    return !!localStorage.getItem('public_access_token');
  },

  getStoredUser: function() {
    const userStr = localStorage.getItem('public_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getToken: function() {
    return localStorage.getItem('public_access_token');
  }
};

// CRITICAL: Export as default
export default publicAuthService;

