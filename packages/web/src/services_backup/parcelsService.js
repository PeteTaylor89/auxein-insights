// src/services/parcelsService.js
import api from './api';

const parcelsService = {
  // Get all parcels as GeoJSON for map display
  getParcelsGeoJSON: async (params = {}) => {
    const response = await api.get('/parcels/geojson', { params });
    return response.data;
  },
  
  // Get parcels assigned to a specific company
  getParcelsByCompany: async (companyId, params = {}) => {
    const response = await api.get(`/parcels/company/${companyId}`, { params });
    return response.data;
  },
  
  // Get all parcels (non-GeoJSON format)
  getAllParcels: async (params = {}) => {
    const response = await api.get('/parcels', { params });
    return response.data;
  },
  
  // Assign a parcel to a company (admin only)
  assignParcelToCompany: async (parcelId, assignmentData) => {
    const response = await api.post(`/parcels/${parcelId}/assign-company`, assignmentData);
    return response.data;
  },
  
  // Remove parcel assignment from company (admin only)
  removeParcelAssignment: async (parcelId, companyId) => {
    const response = await api.delete(`/parcels/${parcelId}/company-assignment`, {
      params: { company_id: companyId }
    });
    return response.data;
  },
  
  // Search parcels
  searchParcels: async (query, params = {}) => {
    const response = await api.get('/parcels/search', { 
      params: { q: query, ...params } 
    });
    return response.data;
  },
  
  // Get parcel details by ID
  getParcelById: async (parcelId) => {
    const response = await api.get(`/parcels/${parcelId}`);
    return response.data;
  },
  
  // Get parcel statistics
  getParcelStats: async () => {
    const response = await api.get('/parcels/stats');
    return response.data;
  },
  
  // Test LINZ connection (admin only)
  testLinzConnection: async () => {
    const response = await api.get('/parcels/test-connection');
    return response.data;
  },
  
  // Get sync status
  getSyncStatus: async (batchId = null) => {
    const params = batchId ? { batch_id: batchId } : {};
    const response = await api.get('/parcels/sync/status', { params });
    return response.data;
  },
  
  // Trigger full parcel sync (admin only)
  triggerFullSync: async () => {
    const response = await api.post('/parcels/sync/full-refresh');
    return response.data;
  },
  
  // Get sync history (admin only)
  getSyncHistory: async (limit = 10) => {
    const response = await api.get('/parcels/sync/history', { 
      params: { limit } 
    });
    return response.data;
  },
  
  // Helper function to validate assignment data
  validateAssignmentData: (assignmentData) => {
    if (!assignmentData.company_id) {
      throw new Error('Company ID is required');
    }
    
    if (assignmentData.ownership_percentage && 
        (assignmentData.ownership_percentage < 0 || assignmentData.ownership_percentage > 100)) {
      throw new Error('Ownership percentage must be between 0 and 100');
    }
    
    return true;
  },
  
  // Helper function to format parcel data for display
  formatParcelForDisplay: (parcel) => {
    return {
      id: parcel.id,
      displayName: parcel.appellation || `Parcel ${parcel.linz_id}`,
      linzId: parcel.linz_id,
      appellation: parcel.appellation,
      landDistrict: parcel.land_district,
      parcelIntent: parcel.parcel_intent,
      areaHectares: parcel.area_hectares,
      hasAssignment: parcel.has_assignment || false,
      assignedCompanyId: parcel.assigned_company_id,
      assignedCompanyName: parcel.assigned_company_name,
      isOwnedByUserCompany: parcel.is_owned_by_user_company || false
    };
  },
  
  // Helper function to build GeoJSON query parameters
  buildGeoJSONParams: (options = {}) => {
    const params = {};
    
    if (options.bbox) {
      params.bbox = Array.isArray(options.bbox) 
        ? options.bbox.join(',') 
        : options.bbox;
    }
    
    if (options.limit) {
      params.limit = options.limit;
    }
    
    if (options.companyOwnedOnly) {
      params.company_owned_only = options.companyOwnedOnly;
    }
    
    return params;
  },
  
  // Get parcels within a bounding box
  getParcelsInBounds: async (bounds, options = {}) => {
    const { west, south, east, north } = bounds;
    const bbox = `${west},${south},${east},${north}`;
    
    const params = parcelsService.buildGeoJSONParams({
      ...options,
      bbox
    });
    
    return await parcelsService.getParcelsGeoJSON(params);
  },
  
  // Get company's assigned parcels as GeoJSON
  getCompanyParcelsGeoJSON: async (companyId, options = {}) => {
    const params = parcelsService.buildGeoJSONParams({
      ...options,
      companyOwnedOnly: false // We'll filter by company after
    });
    
    const response = await parcelsService.getParcelsGeoJSON(params);
    
    // Filter features to only include parcels assigned to the specified company
    if (response.features) {
      response.features = response.features.filter(
        feature => feature.properties.assigned_company_id === companyId
      );
      response.metadata.count = response.features.length;
      response.metadata.filtered_by_company = companyId;
    }
    
    return response;
  },
  
  // Bulk assign parcels to company (admin only)
  bulkAssignParcels: async (parcelIds, companyId, assignmentData = {}) => {
    const results = [];
    const errors = [];
    
    for (const parcelId of parcelIds) {
      try {
        const result = await parcelsService.assignParcelToCompany(parcelId, {
          company_id: companyId,
          ownership_type: assignmentData.ownership_type || 'full',
          ownership_percentage: assignmentData.ownership_percentage || 100.0,
          verification_method: assignmentData.verification_method || 'manual',
          notes: assignmentData.notes || `Bulk assignment to company ${companyId}`
        });
        results.push(result);
      } catch (error) {
        errors.push({
          parcelId,
          error: error.response?.data?.detail || error.message
        });
      }
    }
    
    return {
      successful: results,
      failed: errors,
      totalProcessed: parcelIds.length,
      successCount: results.length,
      errorCount: errors.length
    };
  },

  getCurrentMapBounds: (mapInstance) => {
    if (!mapInstance) return null;
    
    try {
        const bounds = mapInstance.getBounds();
        const zoom = mapInstance.getZoom();
        
        return {
        bounds: {
            west: bounds.getWest(),
            south: bounds.getSouth(), 
            east: bounds.getEast(),
            north: bounds.getNorth()
        },
        zoom: zoom,
        bbox: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`
        };
    } catch (error) {
        console.error('Error getting map bounds:', error);
        return null;
    }
    },

    // Load parcels for current viewport
    loadParcelsForViewport: async (mapInstance, minZoom = 12, companyOwnedOnly = false) => {
    const viewport = parcelsService.getCurrentMapBounds(mapInstance);
    
    if (!viewport) {
        throw new Error('Unable to get map viewport');
    }
    
    if (viewport.zoom < minZoom) {
        return {
        type: "FeatureCollection",
        features: [],
        metadata: {
            count: 0,
            zoom_too_low: true,
            current_zoom: viewport.zoom,
            min_zoom: minZoom,
            message: `Zoom to level ${minZoom} or higher to load parcels`
        }
        };
    }
    
    // Calculate appropriate limit based on zoom level
    const limit = Math.min(10000, Math.max(500, Math.floor(viewport.zoom * 200)));
    
    return await parcelsService.getParcelsGeoJSON({
        bbox: viewport.bbox,
        limit: limit,
        company_owned_only: companyOwnedOnly  // Add this parameter
    });
    },

    getCompanyParcelsGeoJSON: async (companyId, params = {}) => {
  const response = await api.get(`/parcels/company/${companyId}/geojson`, { params });
  return response.data;
},

// Load company parcels for current viewport
loadCompanyParcelsForViewport: async (companyId, mapInstance, minZoom = 12) => {
  const viewport = parcelsService.getCurrentMapBounds(mapInstance);
  
  if (!viewport) {
    throw new Error('Unable to get map viewport');
  }
  
  if (viewport.zoom < minZoom) {
    return {
      type: "FeatureCollection",
      features: [],
      metadata: {
        count: 0,
        zoom_too_low: true,
        current_zoom: viewport.zoom,
        min_zoom: minZoom,
        message: `Zoom to level ${minZoom} or higher to load parcels`
      }
    };
  }
  
  // Calculate appropriate limit based on zoom level
  const limit = Math.min(10000, Math.max(500, Math.floor(viewport.zoom * 200)));
  
  return await parcelsService.getCompanyParcelsGeoJSON(companyId, {
    bbox: viewport.bbox,
    limit: limit
  });
},

};



export default parcelsService;