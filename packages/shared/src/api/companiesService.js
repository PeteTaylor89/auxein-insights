
// src/services/companiesService.js - Updated for single tier model
import api from './api';

const companiesService = {
  // Get all companies (admin only - returns all, regular users get 403)
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

  // Get companies for public registration (no auth required)
  getPublicCompanies: async (params = {}) => {
    const response = await api.get('/companies/public', { params });
    return response.data;
  },

  // Get company by ID (now includes subscription details)
  getCompanyById: async (id) => {
    const response = await api.get(`/companies/${id}`);
    return response.data;
  },

  // Get current user's company (now includes subscription details)
  getCurrentCompany: async () => {
    const response = await api.get('/companies/current');
    return response.data;
  },

  // Create new company (defaults to primary subscription)
  createCompany: async (data) => {
    // If no subscription_id provided, use primary subscription
    if (!data.subscription_id) {
      try {
        const primarySub = await subscriptionService.getPrimarySubscription();
        data.subscription_id = primarySub.id;
      } catch (error) {
        console.warn('Could not get primary subscription, using default');
        data.subscription_id = 1; // Fallback
      }
    }
    
    const response = await api.post('/companies', data);
    return response.data;
  },

  // Create new company during registration (no auth required)
  createCompanyForRegistration: async (data) => {
    // Default to primary subscription for new registrations
    if (!data.subscription_id) {
      try {
        const primarySub = await subscriptionService.getPrimarySubscription();
        data.subscription_id = primarySub.id;
        
        // Enable trial by default for new registrations
        data.start_trial = true;
        data.trial_days = primarySub.trial_days || 14;
      } catch (error) {
        console.warn('Could not get primary subscription for registration');
        data.subscription_id = 1; // Fallback
      }
    }
    
    const response = await api.post('/companies/public', data);
    return response.data;
  },

  // Update company
  updateCompany: async (id, data) => {
    const response = await api.put(`/companies/${id}`, data);
    return response.data;
  },

  // Update company hectares and recalculate pricing
  updateCompanyHectares: async (id, hectares) => {
    const response = await api.put(`/companies/${id}`, { 
      total_hectares: hectares 
    });
    return response.data;
  },

  // Update company subscription (admin only)
  updateCompanySubscription: async (id, subscriptionData) => {
    const response = await api.put(`/companies/${id}/subscription`, subscriptionData);
    return response.data;
  },

  // Delete company (admin only)
  deleteCompany: async (id) => {
    const response = await api.delete(`/companies/${id}`);
    return response.data;
  },

  // Get current company statistics (uses subscription limits)
  getCurrentCompanyStats: async () => {
    const response = await api.get('/companies/current/stats');
    return response.data;
  },

  // Get current company billing summary
  getCurrentCompanyBilling: async () => {
    try {
      const [company, pricing] = await Promise.all([
        companiesService.getCurrentCompany(),
        subscriptionService.getCurrentSubscriptionPricing()
      ]);
      
      return {
        company_name: company.name,
        total_hectares: parseFloat(company.total_hectares || 0),
        subscription_name: pricing.display_name,
        monthly_cost: parseFloat(pricing.calculated_monthly_price || 0),
        yearly_cost: parseFloat(pricing.calculated_yearly_price || 0),
        cost_per_hectare_monthly: company.total_hectares > 0 
          ? parseFloat(pricing.calculated_monthly_price) / parseFloat(company.total_hectares)
          : 0,
        yearly_savings: pricing.yearly_savings ? parseFloat(pricing.yearly_savings) : 0,
        yearly_savings_percentage: pricing.yearly_savings_percentage || 0,
        currency: pricing.currency || 'USD',
        billing_interval: company.billing_interval || 'month',
        is_trial: company.is_trial || false,
        subscription_status: company.subscription_status || 'active',
        unlimited_users: pricing.max_users === -1,
        unlimited_storage: pricing.max_storage_gb === -1
      };
    } catch (error) {
      console.error('Error getting company billing summary:', error);
      throw error;
    }
  },

  // Get all users for a company (admin only)
  getCompanyUsers: async (id, params = {}) => {
    const response = await api.get(`/companies/${id}/users`, { params });
    return response.data;
  },

  // Get all vineyard blocks for a company
  getCompanyBlocks: async (id, params = {}) => {
    const response = await api.get(`/companies/${id}/blocks`, { params });
    return response.data;
  },

  // Search companies (admin only)
  searchCompanies: async (searchTerm, params = {}) => {
    const response = await api.get('/companies', { 
      params: { ...params, search: searchTerm }
    });
    return response.data;
  },

  // Check if company name is available
  checkCompanyNameAvailable: async (companyName) => {
    const response = await api.get(`/companies/check-name?name=${encodeURIComponent(companyName)}`);
    return response.data;
  },

  // Helper methods for single tier model
  
  // Calculate pricing for different hectare amounts
  calculatePricingForHectares: async (hectares) => {
    try {
      const pricing = await subscriptionService.getPricingEstimate(hectares);
      return pricing;
    } catch (error) {
      console.error('Error calculating pricing:', error);
      throw error;
    }
  },

  // Get user limits info (always unlimited in single tier)
  getUserLimitsInfo: () => {
    return {
      current_users: 0, // Will be set by component
      max_users: -1,
      remaining_slots: -1,
      is_unlimited: true,
      can_invite: true,
      usage_percentage: 0,
      subscription_name: "Professional"
    };
  }
};

// Import subscription service for use in companies service
import subscriptionService from './subscriptionService';

export default companiesService;