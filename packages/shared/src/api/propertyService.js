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

  // Save (or clear, pass null) a GeoJSON polygon as the property boundary.
  async updatePropertyGeometry(id, geometry) {
    const response = await api.patch(`/v1/properties/${id}`, { geometry });
    return response.data;
  },

  // --- Insights site -------------------------------------------------------
  // A property's own point in the Insights climate archive. Without one, This
  // Season shows the property its REGION's climate, which is somebody else's.

  // Never 404s on an absent site: "no site yet" is a normal answer the UI
  // renders as a button, and a 404 would be indistinguishable from a property
  // that does not exist.
  async getInsightsSite(id) {
    const response = await api.get(`/v1/properties/${id}/insights-site`);
    return response.data;
  },

  // 202 — the row exists straight away, its climate record does not. A 422
  // carries `{code, message}` naming what the user has to fix: no forecast
  // point set, or a point that falls outside the land mask (in which case the
  // detail carries the distance to the nearest usable cell).
  async provisionInsightsSite(id) {
    const response = await api.post(`/v1/properties/${id}/insights-site`);
    return response.data;
  },

  // Regional / site / observed growth stages for this property, per variety.
  // Every track can be absent and each absence carries its own reason — see
  // backend/services/grow_phenology.
  async getPropertyPhenology(id, vintage) {
    const response = await api.get(`/v1/properties/${id}/phenology`, {
      params: vintage ? { vintage } : undefined,
    });
    return response.data;
  },

  // Weather to date and disease pressure for this property — regional and, when
  // it has a climate site, its own point. Both halves are assembled server-side
  // so the panel does not need a second HTTP client for the public realtime
  // endpoints. See backend/services/grow_season.
  async getPropertySeason(id, days) {
    const response = await api.get(`/v1/properties/${id}/season`, {
      params: days ? { days } : undefined,
    });
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
