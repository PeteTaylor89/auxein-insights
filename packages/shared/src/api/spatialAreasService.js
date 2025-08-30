// src/services/spatialAreasService.js 
import api from './api';

const spatialAreasService = {
  getAllSpatialAreas: async (params = {}) => {
    const response = await api.get('/spatial_areas/', { params });
    return response.data;
  },
  
  getSpatialAreaById: async (id) => {
    const response = await api.get(`/spatial_areas/${id}`);
    return response.data;
  },
  
  updateSpatialArea: async (id, data) => {
    const response = await api.put(`/spatial_areas/${id}`, data);
    return response.data;
  },
  
  // Get spatial areas as GeoJSON (for map display)
  getSpatialAreasGeoJSON: async (params = {}) => {
    const response = await api.get('/spatial_areas/geojson', { params });
    return response.data;
  },
  
  // Get spatial areas by company
  getCompanySpatialAreas: async (areaType = null) => {
    const params = areaType ? { area_type: areaType } : {};
    const response = await api.get('/spatial_areas/company', { params });
    return response.data;
  },
  
  // Create a new spatial area with polygon geometry
  createSpatialArea: async (spatialAreaData) => {
    const response = await api.post('/spatial_areas/', spatialAreaData);
    return response.data;
  },
  
  // Delete spatial area (soft delete)
  deleteSpatialArea: async (areaId) => {
    const response = await api.delete(`/spatial_areas/${areaId}`);
    return response.data;
  },
  
  // Get summary by area types
  getAreaTypesSummary: async () => {
    const response = await api.get('/spatial_areas/types/summary');
    return response.data;
  },
  
  // Get nearby spatial areas
  getNearbySpatialAreas: async (areaId, distanceMeters = 1000, limit = 10) => {
    const response = await api.get(`/spatial_areas/nearby/${areaId}`, {
      params: { distance_meters: distanceMeters, limit }
    });
    return response.data;
  },
  
  // Validate geometry before creation
  validateGeometry: async (geometry) => {
    const response = await api.post('/spatial_areas/validate-geometry', geometry);
    return response.data;
  },
  
  // Client-side validation (same as blocks)
  validateSpatialAreaGeometry: (geometry) => {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      throw new Error('Invalid geometry: missing required fields');
    }
    
    if (geometry.type !== 'Polygon') {
      throw new Error('Geometry must be a Polygon');
    }
    
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new Error('Invalid coordinates');
    }
    
    const ring = geometry.coordinates[0];
    if (ring.length < 4) {
      throw new Error('Polygon must have at least 4 coordinates');
    }
    
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new Error('Polygon must be closed');
    }
    
    return true;
  },
  
  // Calculate estimated area (same logic as blocks)
  calculateArea: (coordinates) => {
    if (!coordinates || !coordinates[0]) return 0;
    
    const ring = coordinates[0];
    let area = 0;
    
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1];
      area -= ring[i + 1][0] * ring[i][1];
    }
    
    area = Math.abs(area / 2);
    const hectares = area * 111319.9 * 111319.9 * 0.0001;
    
    return hectares;
  }
};

export default spatialAreasService;