// src/services/observationsService.js 
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
  },

  // FILE METHODS - UPDATED TO USE NEW GENERIC FILE ENDPOINTS

  // Get observation files
  getObservationFiles: async (observationId) => {
    try {
      console.log(`Fetching files for observation ${observationId}`);
      const response = await api.get(`/files/observation/${observationId}/files`);
      console.log(`API response for observation ${observationId} files:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error fetching files for observation ${observationId}:`, error);
      if (error.response?.status === 404) {
        console.log(`No files found for observation ${observationId}`);
        return [];
      } else if (error.response?.status === 403) {
        console.error(`Permission denied for observation ${observationId} files`);
        return [];
      }
      throw error;
    }
  },

  // Get file URL
  getFileUrl: (fileId, observationId) => {
    const baseURL = api.defaults.baseURL || '';
    const url = `${baseURL}/files/observation/${observationId}/files/${fileId}`;
    console.log(`Generated file URL: ${url}`);
    return url;
  },

  // Upload file to observation - CORRECTED method name and implementation
  uploadFile: async (observationId, file, description = null) => {
    try {
      console.log(`Uploading file to observation ${observationId}:`, file.name);
      
      const formData = new FormData();
      formData.append('file', file);
      if (description) {
        formData.append('description', description);
      }

      const response = await api.post(`/files/observation/${observationId}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      console.log(`File uploaded successfully:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error uploading file to observation ${observationId}:`, error);
      throw error;
    }
  },

  // Batch upload multiple files
  uploadFiles: async (observationId, files) => {
    try {
      console.log(`Uploading ${files.length} files to observation ${observationId}`);
      
      const uploadPromises = files.map(file => 
        observationsService.uploadFile(observationId, file)
      );
      
      const results = await Promise.all(uploadPromises);
      console.log(`Successfully uploaded ${results.length} files`);
      return results;
    } catch (error) {
      console.error(`Error uploading files to observation ${observationId}:`, error);
      throw error;
    }
  },

  // Delete observation file
  deleteObservationFile: async (observationId, fileId) => {
    const response = await api.delete(`/files/observation/${observationId}/files/${fileId}`);
    return response.data;
  },

  // Update file metadata
  updateFileMetadata: async (observationId, fileId, description) => {
    const response = await api.put(`/files/observation/${observationId}/files/${fileId}`, {
      description
    });
    return response.data;
  },

  // Create observation with files in one call
  createObservationWithFiles: async (observationData, files = []) => {
    try {
      // Create observation first
      console.log('Creating observation:', observationData);
      const observation = await observationsService.createObservation(observationData);
      
      // Upload files if provided
      if (files.length > 0) {
        console.log(`Uploading ${files.length} files to observation ${observation.id}`);
        await observationsService.uploadFiles(observation.id, files);
        
        // Fetch updated observation with files
        return await observationsService.getObservationById(observation.id);
      }
      
      return observation;
    } catch (error) {
      console.error('Error creating observation with files:', error);
      throw error;
    }
  },

  // Debug method to test endpoints
  debugFileEndpoints: async (observationId) => {
    try {
      console.log(`Testing file endpoints for observation ${observationId}`);
      
      // Test the main endpoint
      const files = await observationsService.getObservationFiles(observationId);
      console.log(`Found ${files.length} files:`, files);
      
      // Test file URLs if files exist
      if (files.length > 0) {
        const firstFile = files[0];
        const fileUrl = observationsService.getFileUrl(firstFile.id, observationId);
        console.log(`First file URL: ${fileUrl}`);
        
        // Test if URL is accessible
        try {
          const testResponse = await fetch(fileUrl, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
          });
          console.log(`File URL test: ${testResponse.status} ${testResponse.statusText}`);
        } catch (urlError) {
          console.error(`File URL test failed:`, urlError);
        }
      }
      
      return { success: true, files };
    } catch (error) {
      console.error(`Debug failed:`, error);
      return { success: false, error };
    }
  }
};

export default observationsService;