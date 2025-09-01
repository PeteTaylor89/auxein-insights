// src/services/observationsService.js - SIMPLIFIED VERSION
import api from './api';

const observationsService = {
  // Get all observations (company-filtered on backend)
  getAllObservations: async (params = {}) => {
    const response = await api.get('/observations/', { params });
    return response.data;
  },
  
  // Create new observation
  createObservation: async (data) => {
    const response = await api.post('/observations/', data);
    return response.data;
  },
  
  // Get observation by ID
  getObservationById: async (id) => {
    const response = await api.get(`/observations/${id}`);
    return response.data;
  },
  
  // Update observation
  updateObservation: async (id, data) => {
    const response = await api.put(`/observations/${id}`, data);
    return response.data;
  },
  
  // Delete observation
  deleteObservation: async (id) => {
    const response = await api.delete(`/observations/${id}`);
    return response.data;
  },
  
  // Get observations by block
  getObservationsByBlock: async (blockId) => {
    const response = await api.get(`/observations/block/${blockId}`);
    return response.data;
  },
  
  // Enhanced filtering methods
  getObservationsWithFilters: async (filters = {}) => {
    const params = {};
    
    if (filters.block_id) params.block_id = filters.block_id;
    if (filters.observation_type) params.observation_type = filters.observation_type;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.skip) params.skip = filters.skip;
    if (filters.limit) params.limit = filters.limit;
    
    return await observationsService.getAllObservations(params);
  },

  // Get observations by type
  getObservationsByType: async (observationType, params = {}) => {
    return await observationsService.getAllObservations({
      ...params,
      observation_type: observationType
    });
  },

  // Get observations in date range
  getObservationsInDateRange: async (startDate, endDate, params = {}) => {
    return await observationsService.getAllObservations({
      ...params,
      start_date: startDate,
      end_date: endDate
    });
  },

  // Get observation statistics
  getObservationStats: async (filters = {}) => {
    const response = await api.get('/observations/stats', { params: filters });
    return response.data;
  }

};

export default observationsService;