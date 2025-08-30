// Updated src/services/invitationService.js
import api from './api';

const invitationService = {
  // Create and send invitation
  createInvitation: async (invitationData) => {
    console.log('=== INVITATION REQUEST DEBUG ===');
    console.log('Data being sent:', invitationData);
    console.log('Auth token exists:', !!localStorage.getItem('accessToken'));
    
    try {
        const response = await api.post('/invitations/', invitationData);
        console.log('✅ Success:', response.data);
        return response.data;
    } catch (error) {
        console.log('❌ Error status:', error.response?.status);
        console.log('❌ Error data:', error.response?.data);
        console.log('❌ Request URL:', error.config?.url);
        console.log('❌ Request method:', error.config?.method);
        throw error;
    }
  },

  // Get company invitations
  getInvitations: async (params = {}) => {
    const response = await api.get('/invitations', { params });
    return response.data;
  },

  // Cancel invitation
  cancelInvitation: async (invitationId) => {
    const response = await api.delete(`/invitations/${invitationId}`);
    return response.data;
  },

  // Resend invitation
  resendInvitation: async (invitationId) => {
    const response = await api.post(`/invitations/${invitationId}/resend`);
    return response.data; 
  },

  // Get invitation details by token (public endpoint - no auth needed)
  getInvitationByToken: async (token) => {
    try {
      // Note: This is a public endpoint, so we don't use the api instance (which adds auth headers)
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/invitations/token/${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching invitation:', error);
      throw error;
    }
  },

  // Accept invitation (public endpoint)
  acceptInvitation: async (acceptanceData) => {
    try {
      // Public endpoint - no auth needed
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(acceptanceData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error accepting invitation:', error);
      throw error;
    }
  },

  // Login with temporary credentials (public endpoint)
  loginWithTempCredentials: async (token, password) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/invitations/login-temp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, password })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Store the access token if login successful
      if (data.access_token) {
        localStorage.setItem('accessToken', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      
      return data;
    } catch (error) {
      console.error('Error logging in with temp credentials:', error);
      throw error;
    }
  }
};

export default invitationService;