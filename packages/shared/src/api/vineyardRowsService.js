// src/services/vineyardRowsService.js
import api from './api';

// Keep in step with MAX_ROW_RANGE in backend/api/v1/vineyard_rows.py — a client
// that accepts a wider range than the server just moves the rejection later.
const MAX_ROW_RANGE = 2000;

/**
 * Spreadsheet-column value of a letter row label — 1-based, bijective base-26
 * (no zero digit), matching Excel: A=1 … Z=26, AA=27 … AZ=52, ZZ=702.
 * Mirrors alpha_to_index() on the backend.
 */
const alphaToIndex = (token) => {
  let n = 0;
  for (const ch of token.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

/** Inverse of alphaToIndex: 27 -> 'AA'. */
const indexToAlpha = (index) => {
  let out = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const isNumericToken = (s) => /^-?\d+$/.test(s);
const isAlphaToken = (s) => /^[A-Za-z]+$/.test(s);

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
  // ---- Spreadsheet round-trip ----
  //
  // Not getAllRows: that one caps at limit=1000 and Greystone alone holds 1281
  // rows. An export truncated at 1000 would diff the missing 281 as "not in
  // this list", and ticking "skip invalid" would then quietly drop them.
  exportRows: async (params = {}) => {
    const response = await api.get('/vineyard_rows/export', { params });
    return response.data;
  },

  // Creates as well as updates — a row needs no geometry, so a spreadsheet can
  // legitimately bring a block's whole row set into existence.
  importRows: async (payload) => {
    const response = await api.post('/vineyard_rows/import', payload);
    return response.data;
  },

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

  // Apply attributes to an inclusive range of existing rows in one call.
  // Only the keys present in `payload` are written server-side, so omit a field
  // to leave it untouched rather than passing null.
  updateRowRange: async (blockId, payload) => {
    const response = await api.patch(`/vineyard_rows/by-block/${blockId}/range`, payload);
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
    
    // Validate row range against the single shared expander, so this can't drift
    // from what expandRowRange (and the backend) actually accept.
    const numbers = vineyardRowsService.expandRowRange(bulkData.row_start, bulkData.row_end);
    if (numbers.length === 0) {
      errors.push('Row range must be numeric (e.g. 1 to 50) or letters (e.g. A to AZ)');
    } else if (numbers.length !== bulkData.row_count) {
      errors.push(`Row count ${bulkData.row_count} doesn't match range ${bulkData.row_start}-${bulkData.row_end} (${numbers.length} rows)`);
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
  
  // Expand an inclusive row range into its row numbers, mirroring the server's
  // expand_row_range. Handles plain integers ("1" to "50") and spreadsheet-style
  // letters ("A" to "AZ" = 52 rows). Returns [] for an unparseable or oversized
  // range rather than throwing, so callers can use it for live UI feedback while
  // the user is still typing.
  expandRowRange: (start, end) => {
    const s = String(start ?? '').trim();
    const e = String(end ?? '').trim();
    if (!s || !e) return [];

    if (isNumericToken(s) && isNumericToken(e)) {
      const [lo, hi] = [parseInt(s, 10), parseInt(e, 10)].sort((a, b) => a - b);
      if (hi - lo + 1 > MAX_ROW_RANGE) return [];
      return Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));
    }

    if (isAlphaToken(s) && isAlphaToken(e)) {
      const [lo, hi] = [alphaToIndex(s), alphaToIndex(e)].sort((a, b) => a - b);
      if (hi - lo + 1 > MAX_ROW_RANGE) return [];
      return Array.from({ length: hi - lo + 1 }, (_, i) => indexToAlpha(lo + i));
    }

    return [];
  },

  // Helper to generate row numbers for preview. Delegates to expandRowRange so
  // there is a single definition of what a range means on this side, matching
  // generate_row_numbers on the backend.
  generateRowNumbers: (start, end, count) => {
    const numbers = vineyardRowsService.expandRowRange(start, end);
    if (numbers.length === 0) {
      throw new Error('Row range must be numeric (e.g. 1 to 50) or letters (e.g. A to AZ)');
    }
    if (numbers.length !== count) {
      throw new Error(`Row count ${count} doesn't match range ${start}-${end} (${numbers.length} rows)`);
    }
    return numbers;
  }
};

export default vineyardRowsService;