// src/services/blocksService.js
import api from './api';

const blocksService = {
  getAllBlocks: async (params = {}) => {
    const response = await api.get('/blocks', { params });
    return response.data;
  },
  
  getBlockById: async (id) => {
    const response = await api.get(`/blocks/${id}`);
    return response.data;
  },
  
  updateBlock: async (id, data) => {
    const response = await api.put(`/blocks/${id}`, data);
    return response.data;
  },
  
  searchBlocks: async (query, params = {}) => {
    const response = await api.get('/blocks/search', { 
      params: { q: query, ...params } 
    });
    return response.data;
  },
  
  filterBlocks: async (criteria) => {
    const response = await api.get('/blocks/filter', { params: criteria });
    return response.data;
  },
  
  aggregateBlockData: async (field, params = {}) => {
    const response = await api.get('/blocks/aggregate', { 
      params: { group_by: field, ...params } 
    });
    return response.data;
  },
  
  // Get blocks as GeoJSON (for map display)
  getBlocksGeoJSON: async (params = {}) => {
    const response = await api.get('/blocks/geojson', { params });
    return response.data;
  },
  
  // Get blocks by company (for admin users)
  getBlocksByCompany: async (companyId, params = {}) => {
    const response = await api.get('/blocks', { 
      params: { company_id: companyId, ...params } 
    });
    return response.data;
  },
  
  // Get nearby blocks
  getNearbyBlocks: async (blockId, distanceMeters = 1000, limit = 10) => {
    const response = await api.get(`/blocks/nearby/${blockId}`, {
      params: { distance_meters: distanceMeters, limit }
    });
    return response.data;
  },
  
  // Create a new block with polygon geometry
  createBlock: async (blockData) => {
    const response = await api.post('/blocks/', blockData);
    return response.data;
  },
  
  // Claim ownership of a block
  claimBlock: async (blockId, companyId) => {
    const response = await api.patch(`/blocks/${blockId}/claim`, {
      company_id: companyId
    });
    return response.data;
  },

  assignBlock: async (blockId, companyId) => {
    const response = await api.patch(`/blocks/${blockId}/assign-company`, {
      company_id: companyId
    });
    return response.data;
  },
  
  // Split a block into multiple blocks using a line
  splitBlock: async (blockId, splitLineGeometry) => {
    const response = await api.post(`/blocks/${blockId}/split`, {
      split_line: splitLineGeometry
    });
    return response.data;
  },
  
  // Get blocks owned by current user's company
  getCompanyBlocks: async () => {
    const response = await api.get('/blocks/company');
    return response.data;
  },
  
  // Delete a block (if you have this endpoint)
  deleteBlock: async (blockId) => {
    const response = await api.delete(`/blocks/${blockId}`);
    return response.data;
  },
  
  // Validate block geometry before creation
  validateBlockGeometry: (geometry) => {
    // Client-side validation
    if (!geometry || !geometry.type || !geometry.coordinates) {
      throw new Error('Invalid geometry: missing required fields');
    }
    
    if (geometry.type !== 'Polygon') {
      throw new Error('Geometry must be a Polygon');
    }
    
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new Error('Invalid coordinates');
    }
    
    // Check if polygon is closed (first and last coordinates should be the same)
    const ring = geometry.coordinates[0];
    if (ring.length < 4) {
      throw new Error('Polygon must have at least 4 coordinates');
    }
    
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new Error('Polygon must be closed (first and last coordinates must match)');
    }
    
    return true;
  },
  
  // Calculate estimated area before creating block (client-side)
  calculateArea: (coordinates) => {
    // This is a rough calculation - for accurate results use turf.js
    // or calculate server-side
    if (!coordinates || !coordinates[0]) return 0;
    
    const ring = coordinates[0];
    let area = 0;
    
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1];
      area -= ring[i + 1][0] * ring[i][1];
    }
    
    area = Math.abs(area / 2);
    
    // Very rough conversion to hectares (assumes degrees)
    // This is not accurate but gives a ballpark figure
    const hectares = area * 111319.9 * 111319.9 * 0.0001;
    
    return hectares;
  },

  updateBlockGeometry: async (blockId, geometry) => {
    try { blocksService.validateBlockGeometry(geometry); } catch (e) { throw e; }
    const response = await api.put(`/blocks/${blockId}/geometry`, { geometry });
    return response.data; 
  }

};

export default blocksService;