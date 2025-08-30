// src/services/adminService.js - Updated for single tier subscription model
import api from './api';
import subscriptionService from './subscriptionService';

const adminService = {
  // ===== COMPANY MANAGEMENT - Updated for single tier =====
  
  async createCompanyWithAdmin(companyData) {
    // Ensure we use the primary subscription if not specified
    if (!companyData.subscription_id) {
      try {
        const primarySub = await subscriptionService.getPrimarySubscription();
        companyData.subscription_id = primarySub.id;
      } catch (error) {
        console.warn('Could not get primary subscription, using default');
        companyData.subscription_id = 1; // Fallback
      }
    }
    
    // Enable trial by default for new companies
    if (companyData.start_trial === undefined) {
      companyData.start_trial = true;
      companyData.trial_days = companyData.trial_days || 14;
    }
    
    const response = await api.post('/admin/create-company-admin', companyData);
    return response.data;
  },

  async getAllCompanies(params = {}) {
    const { skip = 0, limit = 100, search, subscription_id } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      ...(search && { search }),
      ...(subscription_id && { subscription_id: subscription_id.toString() })
    });
    
    const response = await api.get(`/admin/companies?${queryParams}`);
    return response.data;
  },

  async getCompanyUsers(companyId, params = {}) {
    const { skip = 0, limit = 100 } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString()
    });
    
    const response = await api.get(`/admin/companies/${companyId}/users?${queryParams}`);
    return response.data;
  },

  async updateCompanySubscription(companyId, subscriptionId, totalHectares = null, trialDays = null) {
    const params = new URLSearchParams({
      subscription_id: subscriptionId.toString(),
      ...(totalHectares !== null && { total_hectares: totalHectares.toString() }),
      ...(trialDays !== null && { trial_days: trialDays.toString() })
    });
    
    const response = await api.put(`/admin/companies/${companyId}/subscription?${params}`);
    return response.data;
  },

  // Update company hectares (main pricing factor)
  async updateCompanyHectares(companyId, hectares) {
    const response = await api.put(`/admin/companies/${companyId}`, {
      total_hectares: hectares
    });
    return response.data;
  },

  // Start trial for company
  async startCompanyTrial(companyId, trialDays = 14) {
    const response = await api.post(`/admin/companies/${companyId}/start-trial`, {
      trial_days: trialDays
    });
    return response.data;
  },

  // End trial for company
  async endCompanyTrial(companyId, newStatus = 'active') {
    const response = await api.post(`/admin/companies/${companyId}/end-trial`, {
      status: newStatus
    });
    return response.data;
  },

  async deactivateCompany(companyId) {
    const response = await api.post(`/admin/companies/${companyId}/deactivate`);
    return response.data;
  },

  async reactivateCompany(companyId) {
    const response = await api.post(`/admin/companies/${companyId}/reactivate`);
    return response.data;
  },

  // ===== USER MANAGEMENT (unchanged) =====
  
  async getAllUsers(params = {}) {
    const { skip = 0, limit = 100, search, company_id, role, status } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      ...(search && { search }),
      ...(company_id && { company_id: company_id.toString() }),
      ...(role && { role }),
      ...(status && { status })
    });
    
    const response = await api.get(`/admin/users?${queryParams}`);
    return response.data;
  },

  async updateUserStatus(userId, status) {
    const response = await api.put(`/admin/users/${userId}/status`, { status });
    return response.data;
  },

  async updateUserRole(userId, role) {
    const response = await api.put(`/admin/users/${userId}/role`, { role });
    return response.data;
  },

  async suspendUser(userId) {
    const response = await api.post(`/admin/users/${userId}/suspend`);
    return response.data;
  },

  async unsuspendUser(userId) {
    const response = await api.post(`/admin/users/${userId}/unsuspend`);
    return response.data;
  },

  // ===== SUBSCRIPTION MANAGEMENT =====
  
  // Get available subscriptions for admin forms
  async getAvailableSubscriptions() {
    const response = await api.get('/subscriptions');
    return response.data;
  },

  // Get primary subscription details
  async getPrimarySubscription() {
    return await subscriptionService.getPrimarySubscription();
  },

  // Create new subscription (admin only)
  async createSubscription(subscriptionData) {
    const response = await api.post('/admin/subscriptions', subscriptionData);
    return response.data;
  },

  // Update subscription (admin only)
  async updateSubscription(subscriptionId, subscriptionData) {
    const response = await api.put(`/admin/subscriptions/${subscriptionId}`, subscriptionData);
    return response.data;
  },

  // Set primary subscription
  async setPrimarySubscription(subscriptionId) {
    const response = await api.put(`/admin/subscriptions/${subscriptionId}/set-primary`);
    return response.data;
  },

  // ===== ANALYTICS & REPORTING =====
  
  // Get subscription analytics
  async getSubscriptionAnalytics(params = {}) {
    const response = await api.get('/admin/analytics/subscriptions', { params });
    return response.data;
  },

  // Get company analytics
  async getCompanyAnalytics(params = {}) {
    const response = await api.get('/admin/analytics/companies', { params });
    return response.data;
  },

  // Get revenue analytics (based on hectares)
  async getRevenueAnalytics(params = {}) {
    const response = await api.get('/admin/analytics/revenue', { params });
    return response.data;
  },

  // Get trial conversion analytics
  async getTrialAnalytics(params = {}) {
    const response = await api.get('/admin/analytics/trials', { params });
    return response.data;
  },

  // ===== HELPER METHODS FOR SINGLE TIER MODEL =====
  
  // Calculate total revenue for hectares
  calculateRevenueForHectares: (hectares, pricePerHa, isYearly = false) => {
    const multiplier = isYearly ? 1 : 12; // Convert yearly to annual if needed
    return hectares * pricePerHa * multiplier;
  },

  // Format company data for admin display
  formatCompanyForDisplay: (company) => {
    return {
      ...company,
      hectares_formatted: new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(company.total_hectares || 0),
      monthly_cost_formatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: company.currency || 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(company.current_monthly_amount || 0),
      yearly_cost_formatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: company.currency || 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(company.current_yearly_amount || 0)
    };
  },

  // Get company summary stats
  getCompanySummaryStats: async () => {
    try {
      const companies = await adminService.getAllCompanies({ limit: 1000 });
      
      const totalCompanies = companies.length;
      const activeCompanies = companies.filter(c => c.is_active).length;
      const trialCompanies = companies.filter(c => c.is_trial).length;
      const totalHectares = companies.reduce((sum, c) => sum + parseFloat(c.total_hectares || 0), 0);
      const totalMonthlyRevenue = companies
        .filter(c => c.is_active && !c.is_trial)
        .reduce((sum, c) => sum + parseFloat(c.current_monthly_amount || 0), 0);
      const totalYearlyRevenue = companies
        .filter(c => c.is_active && !c.is_trial)
        .reduce((sum, c) => sum + parseFloat(c.current_yearly_amount || 0), 0);
      
      return {
        total_companies: totalCompanies,
        active_companies: activeCompanies,
        trial_companies: trialCompanies,
        inactive_companies: totalCompanies - activeCompanies,
        total_hectares: totalHectares,
        total_monthly_revenue: totalMonthlyRevenue,
        total_yearly_revenue: totalYearlyRevenue,
        average_hectares_per_company: totalCompanies > 0 ? totalHectares / totalCompanies : 0,
        average_monthly_revenue_per_company: activeCompanies > 0 ? totalMonthlyRevenue / activeCompanies : 0
      };
    } catch (error) {
      console.error('Error getting company summary stats:', error);
      throw error;
    }
  },

  // Bulk operations for companies
  async bulkUpdateCompanyHectares(updates) {
    // updates is array of {company_id, hectares}
    const response = await api.post('/admin/companies/bulk-update-hectares', { updates });
    return response.data;
  },

  async bulkStartTrials(companyIds, trialDays = 14) {
    const response = await api.post('/admin/companies/bulk-start-trials', {
      company_ids: companyIds,
      trial_days: trialDays
    });
    return response.data;
  },

  async bulkEndTrials(companyIds, newStatus = 'active') {
    const response = await api.post('/admin/companies/bulk-end-trials', {
      company_ids: companyIds,
      status: newStatus
    });
    return response.data;
  },

  // Export data for reporting
  async exportCompaniesData(format = 'csv', params = {}) {
    const response = await api.get('/admin/export/companies', {
      params: { ...params, format },
      responseType: 'blob'
    });
    return response.data;
  },

  async exportRevenueData(format = 'csv', params = {}) {
    const response = await api.get('/admin/export/revenue', {
      params: { ...params, format },
      responseType: 'blob'
    });
    return response.data;
  }
};

export default adminService;