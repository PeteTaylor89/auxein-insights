// src/services/authService.js
import api from './api';

const authService = {
  login: async (email, password) => {
    // If your API expects username and password fields for OAuth2
    const response = await api.post('/auth/login', 
      new URLSearchParams({
        'username': email,  // OAuth2 uses 'username' for the identifier
        'password': password
      }), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data;
  },
  
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },
  
  refreshToken: async (refreshToken) => {
    const response = await api.post('/auth/refresh-token', { refresh_token: refreshToken });
    return response.data;
  },
  
  getProfile: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  
  // Add change password function for logged-in users
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword
    });
    return response.data;
  },
  
  logout: () => {
    // Clear all possible token keys for compatibility
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },

  // Helper to store auth data consistently
  storeAuthData: (tokens, userData) => {
    // Store with both key names for compatibility
    localStorage.setItem('accessToken', tokens.access_token);
    localStorage.setItem('token', tokens.access_token); // For compatibility
    localStorage.setItem('refreshToken', tokens.refresh_token);
    localStorage.setItem('user', JSON.stringify(userData));
  },

  // Helper to check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    const user = localStorage.getItem('user');
    return !!(token && user);
  },

  // Helper to get stored user
  getStoredUser: () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error parsing stored user:', error);
      return null;
    }
  }
};

export default authService;

// Password reset functions using your existing api service
export const requestPasswordReset = async (email) => {
  const response = await api.post('/auth/forgot-password', { email });
  return response.data;
};

export const resetPassword = async (token, newPassword) => {
  const response = await api.post('/auth/reset-password', { 
    token, 
    new_password: newPassword 
  });
  return response.data;
};