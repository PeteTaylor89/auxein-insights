// src/services/visitorService.js - Visitor Management Service
import api from './api';

const visitorService = {
  // ===== VISITORS =====
  
  // Get all visitors for company
  getAllVisitors: async (params = {}) => {
    const response = await api.get('/visitors/', { params });
    return response.data;
  },
  
  // Create new visitor
  createVisitor: async (data) => {
    const response = await api.post('/visitors/', data);
    return response.data;
  },
  
  // Get visitor by ID
  getVisitorById: async (id) => {
    try {
      const response = await api.get(`/visitors/${id}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching visitor by ID:', error);
      throw error;
    }
  },
  
  // Update visitor
  updateVisitor: async (id, data) => {
    const response = await api.put(`/visitors/${id}`, data);
    return response.data;
  },
  
  // Ban visitor
  banVisitor: async (id, reason) => {
    const response = await api.post(`/visitors/${id}/ban`, { reason });
    return response.data;
  },
  
  // Search visitors
  searchVisitors: async (query) => {
    const response = await api.get('/visitors/search', { 
      params: { q: query } 
    });
    return response.data;
  },
  
  // Enhanced visitor filtering
  getVisitorsWithFilters: async (filters = {}) => {
    const params = {};
    
    if (filters.search) params.search = filters.search;
    if (filters.active_only !== undefined) params.active_only = filters.active_only;
    if (filters.skip) params.skip = filters.skip;
    if (filters.limit) params.limit = filters.limit;
    
    return await visitorService.getAllVisitors(params);
  },

  // ===== VISITOR VISITS =====
  
  // Get all visits
  getAllVisits: async (params = {}) => {
    const response = await api.get('/visitors/visits/', { params });
    return response.data;
  },
  
  // Create new visit
  createVisit: async (data) => {
    const response = await api.post('/visitors/visits/', data);
    return response.data;
  },
  
  // Get visit by ID
  getVisitById: async (id) => {
    try {
      const response = await api.get(`/visitors/visits/${id}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching visit by ID:', error);
      throw error;
    }
  },
  
  // Get active visits
  getActiveVisits: async () => {
    try {
      const response = await api.get('/visitors/visits/active');
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching active visits:', error);
      return []; // Return empty array on error
    }
  },
  
  // Sign in visitor
  signInVisitor: async (visitId, signInData = {}) => {
    const response = await api.post(`/visitors/visits/${visitId}/sign-in`, {
      induction_completed: signInData.induction_completed || false,
      ppe_provided: signInData.ppe_provided || [],
      safety_briefing_given: signInData.safety_briefing_given || false,
      areas_accessed: signInData.areas_accessed || [],
      notes: signInData.notes || null
    });
    return response.data;
  },
  
  // Sign out visitor
  signOutVisitor: async (visitId, notes = null) => {
    const response = await api.post(`/visitors/visits/${visitId}/sign-out`, {
      notes: notes
    });
    return response.data;
  },
  
  // Enhanced visit filtering
  getVisitsWithFilters: async (filters = {}) => {
    const params = {};
    
    if (filters.visitor_id) params.visitor_id = filters.visitor_id;
    if (filters.visit_date) params.visit_date = filters.visit_date;
    if (filters.status) params.status = filters.status;
    if (filters.skip) params.skip = filters.skip;
    if (filters.limit) params.limit = filters.limit;
    
    return await visitorService.getAllVisits(params);
  },

  // Get visits for specific visitor
  getVisitsByVisitor: async (visitorId) => {
    return await visitorService.getVisitsWithFilters({ visitor_id: visitorId });
  },

  // ===== VISITOR REGISTRATION PORTAL =====
  
  // Register visitor and visit (requires authentication)
  registerVisitorPortal: async (registrationData, companyId) => {
    try {
      const response = await api.post(`/visitors/register?company_id=${companyId}`, registrationData);
      return response.data;
    } catch (error) {
      console.error('❌ Error registering visitor:', error);
      throw error;
    }
  },

  // ===== DASHBOARD & REPORTING =====
  
  // Get visitor dashboard
  getDashboard: async () => {
    const response = await api.get('/visitors/dashboard');
    return response.data;
  },
  
  // Get visitor statistics
  getStats: async (days = 30) => {
    const response = await api.get('/visitors/stats', { 
      params: { days } 
    });
    return response.data;
  },
  
  // Export visitor data
  exportVisitorData: async (format = 'csv', days = 30) => {
    const response = await api.get('/visitors/export', {
      params: { format, days }
    });
    return response.data;
  },

  // ===== UTILITY METHODS =====

  // Format visitor for display
  formatVisitor: (visitor) => {
    return {
      ...visitor,
      full_name: `${visitor.first_name} ${visitor.last_name}`,
      is_frequent: visitor.total_visits >= 3,
      status_display: visitor.is_banned ? 'Banned' : visitor.is_active ? 'Active' : 'Inactive'
    };
  },

  // Format visit for display
  formatVisit: (visit) => {
    const isOverdue = visit.expected_duration_hours && 
                     visit.signed_in_at && 
                     !visit.signed_out_at &&
                     new Date() > new Date(new Date(visit.signed_in_at).getTime() + (visit.expected_duration_hours * 60 * 60 * 1000));
    
    return {
      ...visit,
      is_overdue: isOverdue,
      is_active: visit.signed_in_at && !visit.signed_out_at,
      duration_minutes: visit.visit_duration_minutes || 0,
      status_display: {
        'planned': 'Planned',
        'in_progress': 'On Site',
        'completed': 'Completed',
        'cancelled': 'Cancelled'
      }[visit.status] || visit.status
    };
  },

  // Get visit status color
  getVisitStatusColor: (status) => {
    const colors = {
      'planned': 'blue',
      'in_progress': 'green',
      'completed': 'gray',
      'cancelled': 'red'
    };
    return colors[status] || 'gray';
  },

  // ===== BULK OPERATIONS =====

  // Create multiple visits for a visitor
  createMultipleVisits: async (visitorId, visitsData) => {
    const createdVisits = [];
    
    for (const visitData of visitsData) {
      try {
        const visit = await visitorService.createVisit({
          ...visitData,
          visitor_id: visitorId
        });
        createdVisits.push(visit);
      } catch (error) {
        console.error(`Failed to create visit: ${visitData.purpose}`, error);
      }
    }
    
    return createdVisits;
  },

  // Bulk sign out visitors
  bulkSignOutVisitors: async (visitIds, notes = null) => {
    const results = [];
    
    for (const visitId of visitIds) {
      try {
        const result = await visitorService.signOutVisitor(visitId, notes);
        results.push({ success: true, visit_id: visitId, data: result });
      } catch (error) {
        results.push({ success: false, visit_id: visitId, error });
      }
    }
    
    return results;
  },

  // ===== DEBUG METHODS =====

  // Debug visitor management endpoints
  debugEndpoints: async () => {
    try {
      console.log('🔍 Testing Visitor Management endpoints...');
      
      // Test dashboard
      const dashboard = await visitorService.getDashboard();
      console.log('✅ Dashboard:', dashboard);
      
      // Test stats
      const stats = await visitorService.getStats();
      console.log('✅ Stats:', stats);
      
      // Test visitors
      const visitors = await visitorService.getAllVisitors({ limit: 5 });
      console.log('✅ Visitors sample:', visitors);
      
      // Test active visits
      const activeVisits = await visitorService.getActiveVisits();
      console.log('✅ Active visits:', activeVisits);
      
      return { success: true, dashboard, stats, visitors, activeVisits };
    } catch (error) {
      console.error('❌ Debug failed:', error);
      return { success: false, error };
    }
  },

  // Test specific endpoint
  testEndpoint: async (endpoint, method = 'GET', data = null) => {
    try {
      let response;
      switch (method.toLowerCase()) {
        case 'get':
          response = await api.get(`/visitors${endpoint}`);
          break;
        case 'post':
          response = await api.post(`/visitors${endpoint}`, data);
          break;
        case 'put':
          response = await api.put(`/visitors${endpoint}`, data);
          break;
        case 'delete':
          response = await api.delete(`/visitors${endpoint}`);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      
      console.log(`✅ ${method.toUpperCase()} /visitors${endpoint}:`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`❌ ${method.toUpperCase()} /visitors${endpoint} failed:`, error);
      return { success: false, error };
    }
  }
};

export default visitorService;