// src/services/riskManagementService.js - Enhanced with Incident Management
import api from './api';

const riskManagementService = {
  // ===== SITE RISKS =====
  
  // Get all risks for company
  getAllRisks: async (params = {}) => {
    const response = await api.get('/risk-management/risks/', { params });
    return response.data;
  },
  
  // Create new risk
  createRisk: async (data) => {
    const response = await api.post('/risk-management/risks/', data);
    return response.data;
  },
  
  // Get risk by ID
  getRiskById: async (id) => {
    try {
      const response = await api.get(`/risk-management/risks/${id}`);
      const risk = response.data;
      
      // Clean the risk data to ensure required fields are not null
      const cleanedRisk = {
        ...risk,
        custom_fields: risk.custom_fields || {},
        tags: risk.tags || [],
        existing_controls: risk.existing_controls || '',
        potential_consequences: risk.potential_consequences || '',
        regulatory_requirements: risk.regulatory_requirements || '',
        location_description: risk.location_description || ''
      };
      
      console.log('✅ Cleaned risk data:', cleanedRisk);
      return cleanedRisk;
    } catch (error) {
      console.error('❌ Error fetching risk by ID:', error);
      
      // If it's a validation error, try to handle it gracefully
      if (error.response?.status === 500 && error.response?.data?.detail) {
        console.warn('⚠️ Server validation error, attempting fallback...');
        
        // Try to get the raw data and clean it manually
        try {
          const fallbackResponse = await api.get(`/risk-management/risks/${id}`, {
            // Add header to potentially bypass some validation
            headers: { 'Accept': 'application/json' }
          });
          
          const rawRisk = fallbackResponse.data;
          return {
            ...rawRisk,
            custom_fields: rawRisk.custom_fields || {},
            tags: rawRisk.tags || [],
            existing_controls: rawRisk.existing_controls || '',
            potential_consequences: rawRisk.potential_consequences || '',
            regulatory_requirements: rawRisk.regulatory_requirements || '',
            location_description: rawRisk.location_description || ''
          };
        } catch (fallbackError) {
          throw error; // Throw original error
        }
      }
      
      throw error;
    }
  },
  
  // Update risk
  updateRisk: async (id, data) => {
    const response = await api.put(`/risk-management/risks/${id}`, data);
    return response.data;
  },
  
  // Update residual risk (with validation)
  updateResidualRisk: async (id, residualData) => {
    const response = await api.put(`/risk-management/risks/${id}/residual`, residualData);
    return response.data;
  },
  
  updateRiskStatus: async (riskId, statusData) => {
    const response = await api.put(`/risk-management/risks/${riskId}/status`, statusData);
    return response.data;
  },

  // Delete risk
  deleteRisk: async (id) => {
    const response = await api.delete(`/risk-management/risks/${id}`);
    return response.data;
  },
  
  // Get risk matrix configuration
  getRiskMatrix: async () => {
    const response = await api.get('/risk-management/risks/matrix');
    return response.data;
  },
  
  // Enhanced risk filtering
  getRisksWithFilters: async (filters = {}) => {
    const params = {};
    
    if (filters.risk_type) params.risk_type = filters.risk_type;
    if (filters.risk_level) params.risk_level = filters.risk_level;
    if (filters.status) params.status = filters.status;
    if (filters.skip) params.skip = filters.skip;
    if (filters.limit) params.limit = filters.limit;
    
    return await riskManagementService.getAllRisks(params);
  },

  // Get risks by type
  getRisksByType: async (riskType, params = {}) => {
    return await riskManagementService.getAllRisks({
      ...params,
      risk_type: riskType
    });
  },

  // Get risks by level
  getRisksByLevel: async (riskLevel, params = {}) => {
    return await riskManagementService.getAllRisks({
      ...params,
      risk_level: riskLevel
    });
  },

  // ===== RISK ACTIONS =====
  
  // Get all actions
  getAllActions: async (params = {}) => {
    const response = await api.get('/risk-management/actions/', { params });
    return response.data;
  },
  
  // Create new action
  createAction: async (data) => {
    const response = await api.post('/risk-management/actions/', data);
    return response.data;
  },
  
  // Get action by ID
  getActionById: async (id) => {
    try {
      const response = await api.get(`/risk-management/actions/${id}`);
      const action = response.data;
      
      // Clean the action data to ensure required fields are not null
      const cleanedAction = {
        ...action,
        custom_fields: action.custom_fields || {},
        tags: action.tags || [],
        action_description: action.action_description || '',
        completion_notes: action.completion_notes || '',
        verification_notes: action.verification_notes || '',
        // IMPORTANT: Preserve the risk association
        risk_id: action.risk_id || null,
        // If there's a risk object, preserve it too
        risk: action.risk || null
      };
      
      console.log('✅ Cleaned action data with risk_id:', cleanedAction);
      return cleanedAction;
    } catch (error) {
      console.error('❌ Error fetching action by ID:', error);
      throw error;
    }
  },
  
  getActionsByRiskId: async (riskId) => {
    try {
      console.log('🔄 Fetching actions for risk ID:', riskId);
      const actionsData = await riskManagementService.getActionsWithFilters({
        risk_id: riskId,
        limit: 100 // Get all actions for this risk
      });
      
      console.log('✅ Actions for risk fetched:', actionsData);
      return Array.isArray(actionsData) ? actionsData : (actionsData.data || actionsData.actions || []);
    } catch (error) {
      console.error('❌ Error fetching actions for risk:', error);
      return []; // Return empty array on error
    }
  },

  // Update action
  updateAction: async (id, data) => {
    const response = await api.put(`/risk-management/actions/${id}`, data);
    return response.data;
  },
  
  // Update action progress
  updateActionProgress: async (id, progressData) => {
    const response = await api.put(`/risk-management/actions/${id}/progress`, progressData);
    return response.data;
  },
  
  // Complete action
  completeAction: async (id, completionData) => {
    const response = await api.post(`/risk-management/actions/${id}/complete`, completionData);
    return response.data;
  },
  
  // Verify action
  verifyAction: async (id, verificationData) => {
    const response = await api.post(`/risk-management/actions/${id}/verify`, verificationData);
    return response.data;
  },
  
  // Get action metrics
  getActionMetrics: async (days = 30) => {
    const response = await api.get('/risk-management/actions/metrics', { 
      params: { days } 
    });
    return response.data;
  },
  
  // Enhanced action filtering
  getActionsWithFilters: async (filters = {}) => {
    const params = {};
    
    if (filters.risk_id) params.risk_id = filters.risk_id;
    if (filters.assigned_to_me) params.assigned_to_me = filters.assigned_to_me;
    if (filters.status) params.status = filters.status;
    if (filters.overdue_only) params.overdue_only = filters.overdue_only;
    if (filters.skip) params.skip = filters.skip;
    if (filters.limit) params.limit = filters.limit;
    
    return await riskManagementService.getAllActions(params);
  },

  // Get actions for specific risk
  getActionsByRisk: async (riskId) => {
    return await riskManagementService.getActionsWithFilters({ risk_id: riskId });
  },

  // Get my assigned actions
  getMyActions: async () => {
    return await riskManagementService.getActionsWithFilters({ assigned_to_me: true });
  },

  // Get overdue actions
  getOverdueActions: async () => {
    return await riskManagementService.getActionsWithFilters({ overdue_only: true });
  },

  // Get action history for recurring actions
  getActionHistory: async (parentActionId) => {
    const response = await api.get(`/risk-management/actions/${parentActionId}/history`);
    return response.data;
  },

  // Get child actions of a parent action
  getChildActions: async (actionId) => {
    const response = await api.get(`/risk-management/actions/${actionId}/children`);
    return response.data;
  },

  // Create next recurring instance
  createNextRecurringInstance: async (actionId) => {
    const response = await api.post(`/risk-management/actions/${actionId}/create-next`);
    return response.data;
  },

  // ===== INCIDENTS =====
  
  // Get all incidents
  getAllIncidents: async (params = {}) => {
    const response = await api.get('/risk-management/incidents/', { params });
    return response.data;
  },
  
  // Create new incident
  createIncident: async (data) => {
    const response = await api.post('/risk-management/incidents/', data);
    return response.data;
  },
  
  // Get incident by ID
  getIncidentById: async (id) => {
    try {
      const response = await api.get(`/risk-management/incidents/${id}`);
      const incident = response.data;
      
      // Clean the incident data
      const cleanedIncident = {
        ...incident,
        custom_fields: incident.custom_fields || {},
        tags: incident.tags || [],
        incident_description: incident.incident_description || '',
        location_description: incident.location_description || '',
        injured_person_name: incident.injured_person_name || '',
        injured_person_role: incident.injured_person_role || '',
        injured_person_company: incident.injured_person_company || '',
        witness_details: incident.witness_details || '',
        injury_type: incident.injury_type || '',
        body_part_affected: incident.body_part_affected || '',
        medical_provider: incident.medical_provider || '',
        environmental_impact: incident.environmental_impact || '',
        immediate_actions_taken: incident.immediate_actions_taken || '',
        investigation_findings: incident.investigation_findings || '',
        lessons_learned: incident.lessons_learned || '',
        closure_reason: incident.closure_reason || ''
      };
      
      console.log('✅ Cleaned incident data:', cleanedIncident);
      return cleanedIncident;
    } catch (error) {
      console.error('❌ Error fetching incident by ID:', error);
      throw error;
    }
  },
  
  // Update incident
  updateIncident: async (id, data) => {
    const response = await api.put(`/risk-management/incidents/${id}`, data);
    return response.data;
  },
  
  // Update incident investigation
  updateInvestigation: async (id, investigationData) => {
    const response = await api.put(`/risk-management/incidents/${id}/investigation`, investigationData);
    return response.data;
  },
  
  // Notify WorkSafe
  notifyWorkSafe: async (id, notificationData) => {
    const response = await api.post(`/risk-management/incidents/${id}/worksafe-notify`, notificationData);
    return response.data;
  },
  
  // Close incident
  closeIncident: async (id, closureData) => {
    const response = await api.post(`/risk-management/incidents/${id}/close`, closureData);
    return response.data;
  },
  
  // Get incident metrics
  getIncidentMetrics: async (days = 30) => {
    const response = await api.get('/risk-management/incidents/metrics', { 
      params: { days } 
    });
    return response.data;
  },
  
  // Enhanced incident filtering
  getIncidentsWithFilters: async (filters = {}) => {
    const params = {};
    
    if (filters.incident_type) params.incident_type = filters.incident_type;
    if (filters.severity) params.severity = filters.severity;
    if (filters.status) params.status = filters.status;
    if (filters.notifiable_only) params.notifiable_only = filters.notifiable_only;
    if (filters.skip) params.skip = filters.skip;
    if (filters.limit) params.limit = filters.limit;
    
    return await riskManagementService.getAllIncidents(params);
  },

  // Get notifiable incidents
  getNotifiableIncidents: async () => {
    return await riskManagementService.getIncidentsWithFilters({ notifiable_only: true });
  },

  // Get incidents by severity
  getIncidentsBySeverity: async (severity) => {
    return await riskManagementService.getIncidentsWithFilters({ severity });
  },

  // Get incidents by type
  getIncidentsByType: async (incidentType) => {
    return await riskManagementService.getIncidentsWithFilters({ incident_type: incidentType });
  },

  // Get serious incidents (requiring immediate attention)
  getSeriousIncidents: async () => {
    return await riskManagementService.getIncidentsWithFilters({ 
      severity: 'serious,critical,fatal' 
    });
  },

  // Get incidents requiring WorkSafe notification
  getIncidentsRequiringNotification: async () => {
    // This would need to be implemented on the backend to filter 
    // incidents where is_notifiable=true AND worksafe_notified=false
    const incidents = await riskManagementService.getNotifiableIncidents();
    return incidents.filter(incident => !incident.worksafe_notified);
  },

  // Get overdue investigations
  getOverdueInvestigations: async () => {
    // This would need backend support, but we can simulate it
    try {
      const response = await api.get('/risk-management/incidents/', {
        params: { 
          investigation_status: 'pending,in_progress',
          limit: 100 
        }
      });
      
      const incidents = response.data;
      const now = new Date();
      
      // Filter for overdue investigations on the frontend
      return incidents.filter(incident => {
        if (!incident.investigation_due_date) return false;
        const dueDate = new Date(incident.investigation_due_date);
        return dueDate < now && incident.investigation_status !== 'completed';
      });
    } catch (error) {
      console.error('❌ Error fetching overdue investigations:', error);
      return [];
    }
  },

  // ===== DASHBOARD & INTEGRATION =====
  
  // Get comprehensive dashboard
  getDashboard: async () => {
    const response = await api.get('/risk-management/dashboard');
    return response.data;
  },
  
  // Get overdue items
  getOverdueItems: async () => {
    const response = await api.get('/risk-management/overdue');
    return response.data;
  },
  
  // Get my assignments
  getMyAssignments: async () => {
    const response = await api.get('/risk-management/my-assignments');
    return response.data;
  },
  
  // Get health check
  getHealthCheck: async () => {
    const response = await api.get('/risk-management/health-check');
    return response.data;
  },
  
  // Generate reports
  generateReport: async (reportType = 'monthly') => {
    const response = await api.get(`/risk-management/reports/${reportType}`);
    return response.data;
  },
  
  // Create risk from incident
  createRiskFromIncident: async (incidentId, riskData) => {
    const response = await api.post(`/risk-management/incidents/${incidentId}/create-risk`, riskData);
    return response.data;
  },
  
  // ===== CONFIGURATION =====
  
  // Get risk management configuration
  getConfig: async () => {
    const response = await api.get('/risk-management/config');
    return response.data;
  },
  
  // Get user permissions
  getUserPermissions: async () => {
    const response = await api.get('/risk-management/permissions');
    return response.data;
  },

  // ===== UTILITY METHODS =====

  // Calculate risk score
  calculateRiskScore: (likelihood, severity) => {
    return likelihood * severity;
  },

  // Determine risk level from score
  determineRiskLevel: (score) => {
    if (score <= 4) return 'low';
    if (score <= 9) return 'medium';
    if (score <= 16) return 'high';
    return 'critical';
  },

  // Format risk for display
  formatRisk: (risk) => {
    const currentLevel = risk.residual_risk_level || risk.inherent_risk_level;
    return {
      ...risk,
      current_risk_level: currentLevel,
      risk_reduced: risk.residual_risk_score < risk.inherent_risk_score,
      is_high_priority: ['high', 'critical'].includes(currentLevel)
    };
  },

  // Format action for display
  formatAction: (action) => {
    const isOverdue = action.target_completion_date && 
                     new Date(action.target_completion_date) < new Date() &&
                     !['completed', 'cancelled'].includes(action.status);
    
    return {
      ...action,
      is_overdue: isOverdue,
      is_high_priority: ['high', 'critical'].includes(action.priority) || 
                       ['high', 'urgent'].includes(action.urgency),
      completion_percentage: action.progress_percentage || 0
    };
  },

  // Format incident for display
  formatIncident: (incident) => {
    const daysSince = Math.floor(
      (new Date() - new Date(incident.incident_date)) / (1000 * 60 * 60 * 24)
    );
    
    const isOverdueInvestigation = incident.investigation_due_date && 
                                  new Date(incident.investigation_due_date) < new Date() &&
                                  incident.investigation_status !== 'completed';
    
    const requiresNotification = incident.is_notifiable && !incident.worksafe_notified;
    
    return {
      ...incident,
      days_since_incident: daysSince,
      is_overdue_investigation: isOverdueInvestigation,
      requires_worksafe_notification: requiresNotification,
      requires_attention: requiresNotification || isOverdueInvestigation,
      severity_color: {
        'minor': 'green',
        'moderate': 'yellow', 
        'serious': 'orange',
        'critical': 'red',
        'fatal': 'red'
      }[incident.severity] || 'gray',
      is_serious_incident: ['serious', 'critical', 'fatal'].includes(incident.severity) || 
                          incident.is_notifiable || 
                          incident.medical_treatment_required
    };
  },

  // Check if incident is serious (for prioritization)
  isIncidentSerious: (incident) => {
    return incident.severity === 'fatal' ||
           incident.severity === 'critical' ||
           incident.severity === 'serious' ||
           incident.is_notifiable ||
           incident.medical_treatment_required;
  },

  // Get incident priority level
  getIncidentPriority: (incident) => {
    if (incident.severity === 'fatal') return 'critical';
    if (incident.severity === 'critical' || incident.is_notifiable) return 'high';
    if (incident.severity === 'serious' || incident.medical_treatment_required) return 'medium';
    return 'low';
  },

  // ===== BULK OPERATIONS =====

  // Create multiple actions for a risk
  createMultipleActions: async (riskId, actionsData) => {
    const createdActions = [];
    
    for (const actionData of actionsData) {
      try {
        const action = await riskManagementService.createAction({
          ...actionData,
          risk_id: riskId
        });
        createdActions.push(action);
      } catch (error) {
        console.error(`Failed to create action: ${actionData.action_title}`, error);
      }
    }
    
    return createdActions;
  },

  // Bulk update action progress
  bulkUpdateActionProgress: async (updates) => {
    const results = [];
    
    for (const update of updates) {
      try {
        const result = await riskManagementService.updateActionProgress(
          update.action_id, 
          { 
            progress_percentage: update.progress_percentage,
            notes: update.notes 
          }
        );
        results.push({ success: true, action_id: update.action_id, data: result });
      } catch (error) {
        results.push({ success: false, action_id: update.action_id, error });
      }
    }
    
    return results;
  },

  // Bulk update incident status
  bulkUpdateIncidentStatus: async (incidentIds, status, notes = '') => {
    const results = [];
    
    for (const incidentId of incidentIds) {
      try {
        const result = await riskManagementService.updateIncident(incidentId, { 
          status,
          closure_reason: status === 'closed' ? notes : undefined
        });
        results.push({ success: true, incident_id: incidentId, data: result });
      } catch (error) {
        results.push({ success: false, incident_id: incidentId, error });
      }
    }
    
    return results;
  },

  // ===== REPORTING & ANALYTICS =====

  // Get incident statistics
  getIncidentStatistics: async (dateRange = 30) => {
    try {
      const incidents = await riskManagementService.getAllIncidents({ 
        limit: 1000  // Get all incidents
      });
      
      const now = new Date();
      const startDate = new Date(now.getTime() - (dateRange * 24 * 60 * 60 * 1000));
      
      const filteredIncidents = incidents.filter(incident => 
        new Date(incident.incident_date) >= startDate
      );
      
      const stats = {
        total: filteredIncidents.length,
        by_type: {},
        by_severity: {},
        by_status: {},
        notifiable: filteredIncidents.filter(i => i.is_notifiable).length,
        serious: filteredIncidents.filter(i => riskManagementService.isIncidentSerious(i)).length,
        with_injuries: filteredIncidents.filter(i => i.incident_type === 'injury').length,
        investigations_complete: filteredIncidents.filter(i => i.investigation_status === 'completed').length
      };
      
      // Group by categories
      filteredIncidents.forEach(incident => {
        stats.by_type[incident.incident_type] = (stats.by_type[incident.incident_type] || 0) + 1;
        stats.by_severity[incident.severity] = (stats.by_severity[incident.severity] || 0) + 1;
        stats.by_status[incident.status] = (stats.by_status[incident.status] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      console.error('❌ Error getting incident statistics:', error);
      return {
        total: 0,
        by_type: {},
        by_severity: {},
        by_status: {},
        notifiable: 0,
        serious: 0,
        with_injuries: 0,
        investigations_complete: 0
      };
    }
  },

  // Get risk-incident correlation
  getRiskIncidentCorrelation: async () => {
    try {
      const [risks, incidents] = await Promise.all([
        riskManagementService.getAllRisks({ limit: 1000 }),
        riskManagementService.getAllIncidents({ limit: 1000 })
      ]);
      
      const linkedIncidents = incidents.filter(i => i.related_risk_id);
      const unlinkedIncidents = incidents.filter(i => !i.related_risk_id);
      
      return {
        total_risks: risks.length,
        total_incidents: incidents.length,
        linked_incidents: linkedIncidents.length,
        unlinked_incidents: unlinkedIncidents.length,
        linkage_rate: incidents.length > 0 ? (linkedIncidents.length / incidents.length * 100) : 0,
        risks_with_incidents: [...new Set(linkedIncidents.map(i => i.related_risk_id))].length
      };
    } catch (error) {
      console.error('❌ Error getting risk-incident correlation:', error);
      return {
        total_risks: 0,
        total_incidents: 0,
        linked_incidents: 0,
        unlinked_incidents: 0,
        linkage_rate: 0,
        risks_with_incidents: 0
      };
    }
  },

  // ===== DEBUG METHODS =====

  // Debug risk management endpoints
  debugEndpoints: async () => {
    try {
      console.log('🔍 Testing Risk Management endpoints...');
      
      // Test dashboard
      const dashboard = await riskManagementService.getDashboard();
      console.log('✅ Dashboard:', dashboard);
      
      // Test permissions
      const permissions = await riskManagementService.getUserPermissions();
      console.log('✅ Permissions:', permissions);
      
      // Test config
      const config = await riskManagementService.getConfig();
      console.log('✅ Config:', config);
      
      // Test risks
      const risks = await riskManagementService.getAllRisks({ limit: 5 });
      console.log('✅ Risks sample:', risks);
      
      // Test incidents
      const incidents = await riskManagementService.getAllIncidents({ limit: 5 });
      console.log('✅ Incidents sample:', incidents);
      
      return { success: true, dashboard, permissions, config, risks, incidents };
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
          response = await api.get(endpoint);
          break;
        case 'post':
          response = await api.post(endpoint, data);
          break;
        case 'put':
          response = await api.put(endpoint, data);
          break;
        case 'delete':
          response = await api.delete(endpoint);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      
      console.log(`✅ ${method.toUpperCase()} ${endpoint}:`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`❌ ${method.toUpperCase()} ${endpoint} failed:`, error);
      return { success: false, error };
    }
  }
};

export default riskManagementService;