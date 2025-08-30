// src/services/subscriptionService.js - Updated for single tier model
import api from './api';

const subscriptionService = {
  // Get the primary subscription (main offering)
  getPrimarySubscription: async () => {
    const response = await api.get('/subscriptions/primary');
    return response.data;
  },

  // Get all subscriptions (admin gets all, users get public only)
  getAllSubscriptions: async (params = {}) => {
    const response = await api.get('/subscriptions/', { params });
    return response.data;
  },

  // Get public subscriptions for pricing pages (no auth required)
  getPublicSubscriptions: async () => {
    const response = await api.get('/subscriptions/public');
    return response.data;
  },

  // Get subscription pricing for specific hectares
  getSubscriptionPricing: async (hectares) => {
    if (hectares < 0) {
      throw new Error('Hectares must be a positive number');
    }
    const response = await api.get(`/subscriptions/public/pricing?hectares=${hectares}`);
    return response.data;
  },

  // Get quick pricing estimate (no auth required)
  getPricingEstimate: async (hectares) => {
    if (hectares < 0) {
      throw new Error('Hectares must be a positive number');
    }
    const response = await api.get(`/subscriptions/estimate?hectares=${hectares}`);
    return response.data;
  },

  // Get subscription by ID
  getSubscriptionById: async (id) => {
    const response = await api.get(`/subscriptions/${id}`);
    return response.data;
  },

  // Get subscription by name
  getSubscriptionByName: async (name) => {
    const response = await api.get(`/subscriptions/name/${name}`);
    return response.data;
  },

  // Get current user's subscription
  getCurrentSubscription: async () => {
    const response = await api.get('/subscriptions/current/subscription');
    return response.data;
  },

  // Get current subscription with pricing
  getCurrentSubscriptionPricing: async () => {
    const response = await api.get('/subscriptions/current/pricing');
    return response.data;
  },

  // Check feature access
  checkFeatureAccess: async (featureName) => {
    const response = await api.get(`/subscriptions/features/${featureName}`);
    return response.data;
  },

  // Calculate pricing for different hectares
  calculatePricing: async (hectares) => {
    if (hectares < 0) {
      throw new Error('Hectares must be a positive number');
    }
    const response = await api.post('/subscriptions/current/calculate-pricing', null, {
      params: { hectares }
    });
    return response.data;
  },

  // Helper methods for single tier model
  
  // Check if feature is available (always true for main subscription)
  isFeatureAvailable: async (featureName) => {
    try {
      const response = await subscriptionService.checkFeatureAccess(featureName);
      return response.is_available;
    } catch (error) {
      console.warn(`Could not check feature ${featureName}:`, error);
      return false;
    }
  },

  // Get feature configuration
  getFeatureConfig: async (featureName) => {
    try {
      const response = await subscriptionService.checkFeatureAccess(featureName);
      return response.feature_config || {};
    } catch (error) {
      console.warn(`Could not get feature config for ${featureName}:`, error);
      return {};
    }
  },

  // Calculate cost per hectare for display
  calculateCostPerHectare: (totalCost, hectares) => {
    if (!hectares || hectares === 0) return 0;
    return totalCost / hectares;
  },

  // Calculate savings percentage
  calculateSavingsPercentage: (monthlyTotal, yearlyTotal) => {
    const monthlyAnnual = monthlyTotal * 12;
    if (monthlyAnnual === 0) return 0;
    const savings = monthlyAnnual - yearlyTotal;
    return Math.max(0, (savings / monthlyAnnual) * 100);
  },

  // Format currency for display
  formatCurrency: (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  },

  // Format hectares for display
  formatHectares: (hectares) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(hectares);
  }
};

export default subscriptionService;
