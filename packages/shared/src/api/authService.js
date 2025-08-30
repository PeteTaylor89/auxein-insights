// src/services/authService.js - Updated for Phase 1.1
import api from './api';

// Detect if we're running in web vs mobile environment
const getClientType = () => {
  // Vite exposes env vars with VITE_ prefix on import.meta.env
  return import.meta.env.VITE_CLIENT_TYPE || 'web';
};

const authService = {
  login: async (email, password) => {
    const clientType = getClientType();
    
    // OAuth2 format with enhanced headers
    const response = await api.post('/auth/login', 
      new URLSearchParams({
        'username': email,
        'password': password
      }), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Client-Type': clientType // NEW: Send client type to backend
        }
      }
    );
    return response.data; // Now includes user_type, user_id, full_name, etc.
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
  
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword
    });
    return response.data;
  },
  
  logout: () => {
    // Clear all auth data including new enhanced fields
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    // NEW: Clear enhanced auth data
    localStorage.removeItem('userType');
    localStorage.removeItem('authMetadata');
  },

  // UPDATED: Enhanced auth data storage
  storeAuthData: (loginResponse, userData = null) => {
    // Store tokens (existing)
    localStorage.setItem('accessToken', loginResponse.access_token);
    localStorage.setItem('token', loginResponse.access_token); // For compatibility
    localStorage.setItem('refreshToken', loginResponse.refresh_token);
    
    // NEW: Store enhanced auth data from login response
    if (loginResponse.user_type) {
      localStorage.setItem('userType', loginResponse.user_type);
      
      // Store metadata for easy access
      const metadata = {
        userId: loginResponse.user_id,
        username: loginResponse.username,
        fullName: loginResponse.full_name,
        role: loginResponse.role,
        companyId: loginResponse.company_id,
        companyIds: loginResponse.company_ids,
        contractorId: loginResponse.contractor_id || null
      };
      localStorage.setItem('authMetadata', JSON.stringify(metadata));
    }
    
    // Store user data if provided (for compatibility)
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
  },

  // Helper to check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    return !!(token && userType);
  },

  // Helper to get stored user (updated to handle both sources)
  getStoredUser: () => {
    try {
      // Try to get from stored user data first
      const userStr = localStorage.getItem('user');
      if (userStr) {
        return JSON.parse(userStr);
      }
      
      // Fallback to auth metadata
      const metadataStr = localStorage.getItem('authMetadata');
      if (metadataStr) {
        const metadata = JSON.parse(metadataStr);
        return {
          id: metadata.userId,
          username: metadata.username,
          full_name: metadata.fullName,
          role: metadata.role,
          company_id: metadata.companyId
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing stored user:', error);
      return null;
    }
  },

  // NEW: Enhanced auth helper methods
  getCurrentUserType: () => {
    return localStorage.getItem('userType');
  },

  getAuthMetadata: () => {
    try {
      const metadataStr = localStorage.getItem('authMetadata');
      return metadataStr ? JSON.parse(metadataStr) : {};
    } catch (error) {
      console.warn('Failed to parse auth metadata');
      return {};
    }
  },

  isCompanyUser: () => {
    return localStorage.getItem('userType') === 'company_user';
  },

  isContractor: () => {
    return localStorage.getItem('userType') === 'contractor';
  },

  getCompanyId: () => {
    const metadata = authService.getAuthMetadata();
    return metadata.companyId || null;
  },

  getCompanyIds: () => {
    const metadata = authService.getAuthMetadata();
    return metadata.companyIds || [];
  },

  getContractorId: () => {
    const metadata = authService.getAuthMetadata();
    return metadata.contractorId || null;
  },

  // NEW: Get current client type
  getClientType: () => {
    return getClientType();
  }
};

export default authService;


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