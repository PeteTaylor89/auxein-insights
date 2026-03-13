// src/api/propertyService.js - Property API service
import api from './api';

const propertyService = {
  async adminListAll(params = {}) {
    const { skip = 0, limit = 100, search, company_id } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      ...(search && { search }),
      ...(company_id && { company_id: company_id.toString() }),
    });
    const response = await api.get(`/admin/properties?${queryParams}`);
    return response.data;
  },

  async listProperties(params = {}) {
    const { skip = 0, limit = 100 } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    const response = await api.get(`/v1/properties/?${queryParams}`);
    return response.data;
  },

  async createProperty(data) {
    const response = await api.post('/v1/properties/', data);
    return response.data;
  },

  async updateProperty(id, data) {
    const response = await api.patch(`/v1/properties/${id}`, data);
    return response.data;
  },

  async getPropertyBlocks(id) {
    const response = await api.get(`/v1/properties/${id}/blocks`);
    return response.data;
  },

  async createManagementRelationship(propertyId, data) {
    const response = await api.post(`/v1/properties/${propertyId}/management-relationships`, data);
    return response.data;
  },
};

export default propertyService;
