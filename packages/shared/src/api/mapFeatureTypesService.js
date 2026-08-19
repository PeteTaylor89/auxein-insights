// src/api/mapFeatureTypesService.js — the POI type vocabulary (Maps V2)
//
// Backend: backend/api/v1/map_feature_types.py, mounted at /api/map-feature-types.
// Hyphens, and no /v1 segment — this whole router family sits directly under
// /api, same as /map-features. Copy from here rather than guessing.
//
// Reading is open to anyone who can see the map; creating, renaming and
// retiring is manager+ and the API returns 403 otherwise, so callers should
// surface `detail` rather than assuming a write will succeed.
import api from './api';

const mapFeatureTypesService = {
  // System types (the built-in five) plus this company's own. Pass
  // { include_inactive: true } to see retired ones, which the manager UI needs
  // and the picker does not.
  listMapFeatureTypes: async (params = {}) => {
    const response = await api.get('/map-feature-types/', { params });
    return response.data;
  },

  // The slug is derived server-side from the label, so it is deliberately not
  // in the payload — "Cattle Stop" and "cattle stop" must land on one type.
  createMapFeatureType: async (data) => {
    const response = await api.post('/map-feature-types/', data);
    return response.data;
  },

  // Renaming changes the LABEL only. The slug is what every existing feature
  // stores, so it never follows the rename — see the backend docstring.
  updateMapFeatureType: async (id, data) => {
    const response = await api.patch(`/map-feature-types/${id}`, data);
    return response.data;
  },

  // Soft delete. Features keep their type and keep rendering and legending;
  // the type just leaves the picker.
  retireMapFeatureType: async (id) => {
    const response = await api.delete(`/map-feature-types/${id}`);
    return response.data;
  },
};

export default mapFeatureTypesService;
