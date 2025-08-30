// src/services/vineyardRowsService.js
import api from './api';

const vineyardRowsService = {
  // Get all rows with optional filtering
  getAllRows: async (params = {}) => {
    const response = await api.get('/vineyard_rows/', { params });
    return response.data;
  },
  
  // Get a specific row by ID
  getRowById: async (rowId) => {
    const response = await api.get(`/vineyard_rows/${rowId}`);
    return response.data;
  },
  
  // Get all rows for a specific block
  getRowsByBlock: async (blockId) => {
    const response = await api.get(`/vineyard_rows/by-block/${blockId}`);
    return response.data;
  },
  
  // Create a single row
  createRow: async (rowData) => {
    const response = await api.post('/vineyard_rows/', rowData);
    return response.data;
  },
  
  // Create multiple rows based on block configuration
  createRowSet: async (blockId) => {
    const response = await api.post(`/vineyard_rows/create-row-set/${blockId}`);
    return response.data;
  },
  
  // NEW: Bulk create rows with specific data
  bulkCreateRows: async (bulkData) => {
    const response = await api.post('/vineyard_rows/bulk-create', bulkData);
    return response.data;
  },
  
  // Update a row
  updateRow: async (rowId, rowData) => {
    const response = await api.patch(`/vineyard_rows/${rowId}`, rowData);
    return response.data;
  },
  
  // Update row geometry
  updateRowGeometry: async (rowId, geometry) => {
    const response = await api.put(`/vineyard_rows/${rowId}/geometry`, geometry);
    return response.data;
  },
  
  // Remove row geometry
  removeRowGeometry: async (rowId) => {
    const response = await api.delete(`/vineyard_rows/${rowId}/geometry`);
    return response.data;
  },
  
  // NEW: Update clonal sections for a row
  updateClonalSections: async (rowId, sections) => {
    const response = await api.put(`/vineyard_rows/${rowId}/clonal-sections`, sections);
    return response.data;
  },
  
  // NEW: Get clone info at specific vine position
  getCloneAtVinePosition: async (rowId, vineNumber) => {
    const response = await api.get(`/vineyard_rows/${rowId}/clone-at-vine/${vineNumber}`);
    return response.data;
  },
  
  // Delete a single row
  deleteRow: async (rowId) => {
    const response = await api.delete(`/vineyard_rows/${rowId}`);
    return response.data;
  },
  
  // Delete all rows for a block
  deleteAllRowsByBlock: async (blockId) => {
    const response = await api.delete(`/vineyard_rows/by-block/${blockId}`);
    return response.data;
  },
  
  // Get statistics for rows in a block
  getRowStatsByBlock: async (blockId) => {
    const response = await api.get(`/vineyard_rows/stats/by-block/${blockId}`);
    return response.data;
  },
  
  // Client-side validation for row data
  validateRowData: (rowData) => {
    const errors = [];
    
    if (!rowData.block_id) {
      errors.push('Block ID is required');
    }
    
    if (rowData.vine_spacing && rowData.vine_spacing <= 0) {
      errors.push('Vine spacing must be greater than 0');
    }
    
    if (rowData.row_length && rowData.row_length <= 0) {
      errors.push('Row length must be greater than 0');
    }
    
    return errors.length > 0 ? errors : null;
  },
  
  // Validate bulk creation request
  validateBulkCreation: (bulkData) => {
    const errors = [];
    
    if (!bulkData.block_id) {
      errors.push('Block ID is required');
    }
    
    if (!bulkData.row_start) {
      errors.push('Row start is required');
    }
    
    if (!bulkData.row_end) {
      errors.push('Row end is required');
    }
    
    if (!bulkData.row_count || bulkData.row_count <= 0) {
      errors.push('Row count must be positive');
    }
    
    // Validate row range
    try {
      const startNum = parseInt(bulkData.row_start);
      const endNum = parseInt(bulkData.row_end);
      
      if (!isNaN(startNum) && !isNaN(endNum)) {
        if (endNum - startNum + 1 !== bulkData.row_count) {
          errors.push(`Row count ${bulkData.row_count} doesn't match range ${bulkData.row_start}-${bulkData.row_end}`);
        }
      } else if (bulkData.row_start.length === 1 && bulkData.row_end.length === 1) {
        // Letter range
        const startCode = bulkData.row_start.toUpperCase().charCodeAt(0);
        const endCode = bulkData.row_end.toUpperCase().charCodeAt(0);
        
        if (endCode - startCode + 1 !== bulkData.row_count) {
          errors.push(`Row count ${bulkData.row_count} doesn't match range ${bulkData.row_start}-${bulkData.row_end}`);
        }
      } else {
        errors.push('Invalid row range format');
      }
    } catch (e) {
      errors.push('Error validating row range');
    }
    
    return errors.length > 0 ? errors : null;
  },
  
  // Validate clonal sections
  validateClonalSections: (sections) => {
    const errors = [];
    
    if (!Array.isArray(sections)) {
      errors.push('Sections must be an array');
      return errors;
    }
    
    // Sort sections by start vine
    const sortedSections = [...sections].sort((a, b) => a.start_vine - b.start_vine);
    
    // Check for overlaps
    for (let i = 0; i < sortedSections.length - 1; i++) {
      if (sortedSections[i].end_vine >= sortedSections[i + 1].start_vine) {
        errors.push(`Overlapping sections: vines ${sortedSections[i].end_vine} and ${sortedSections[i + 1].start_vine}`);
      }
    }
    
    // Validate each section
    sections.forEach((section, index) => {
      if (!section.start_vine || section.start_vine < 1) {
        errors.push(`Section ${index + 1}: Start vine must be positive`);
      }
      
      if (!section.end_vine || section.end_vine < section.start_vine) {
        errors.push(`Section ${index + 1}: End vine must be greater than or equal to start vine`);
      }
    });
    
    return errors.length > 0 ? errors : null;
  },
  
  // Calculate total vine count for a set of rows
  calculateTotalVines: (rows) => {
    return rows.reduce((total, row) => {
      if (row.row_length && row.vine_spacing && row.vine_spacing > 0) {
        return total + Math.floor(row.row_length / row.vine_spacing);
      }
      return total;
    }, 0);
  },
  
  // Helper to generate row numbers for preview
  generateRowNumbers: (start, end, count) => {
    try {
      const startNum = parseInt(start);
      const endNum = parseInt(end);
      
      if (!isNaN(startNum) && !isNaN(endNum)) {
        if (endNum - startNum + 1 !== count) {
          throw new Error(`Row count ${count} doesn't match range ${start}-${end}`);
        }
        return Array.from({ length: count }, (_, i) => String(startNum + i));
      } else if (start.length === 1 && end.length === 1 && start.match(/[A-Za-z]/) && end.match(/[A-Za-z]/)) {
        const startCode = start.toUpperCase().charCodeAt(0);
        const endCode = end.toUpperCase().charCodeAt(0);
        
        if (endCode - startCode + 1 !== count) {
          throw new Error(`Row count ${count} doesn't match range ${start}-${end}`);
        }
        return Array.from({ length: count }, (_, i) => String.fromCharCode(startCode + i));
      } else {
        throw new Error('Invalid row range format');
      }
    } catch (error) {
      throw error;
    }
  }
};

export default vineyardRowsService;