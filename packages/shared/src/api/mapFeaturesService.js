// src/api/mapFeaturesService.js — Map points of interest (Maps V2)
//
// Backend: backend/api/v1/map_features.py, mounted at /api/map-features.
// Note the hyphen: the older map routes use underscores (/spatial_areas),
// newer ones use hyphens. Copy from here rather than guessing.
import api from './api';

const mapFeaturesService = {
  // GeoJSON FeatureCollection for the map layer.
  getMapFeaturesGeoJSON: async (params = {}) => {
    const response = await api.get('/map-features/geojson', { params });
    return response.data;
  },

  listMapFeatures: async (params = {}) => {
    const response = await api.get('/map-features/', { params });
    return response.data;
  },

  getMapFeature: async (id) => {
    const response = await api.get(`/map-features/${id}`);
    return response.data;
  },

  createMapFeature: async (data) => {
    const response = await api.post('/map-features/', data);
    return response.data;
  },

  updateMapFeature: async (id, data) => {
    const response = await api.patch(`/map-features/${id}`, data);
    return response.data;
  },

  // Soft delete by default — the row stays with is_active=false so an
  // accidental removal is recoverable. Pass { hard: true } to purge.
  deleteMapFeature: async (id, { hard = false } = {}) => {
    const response = await api.delete(`/map-features/${id}`, { params: { hard } });
    return response.data;
  },
};

export default mapFeaturesService;
