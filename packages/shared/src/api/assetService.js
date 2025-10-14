// packages/shared/src/api/assetService.js
import api from './api';

// ============================================================================
// ASSET CRUD OPERATIONS
// ============================================================================

const assetOperations = {
  /**
   * List assets with filtering options
   * @param {Object} params - Filter parameters
   * @param {string} params.category - Filter by category (equipment, vehicle, tool, consumable, infrastructure)
   * @param {string} params.asset_type - Filter by type (physical, consumable)
   * @param {string} params.status - Filter by status (active, maintenance, retired, disposed, out_of_stock)
   * @param {string} params.location - Filter by location (partial match)
   * @param {boolean} params.requires_maintenance - Filter assets requiring maintenance
   * @param {boolean} params.requires_calibration - Filter assets requiring calibration
   * @param {boolean} params.low_stock_only - Show only low stock consumables
   * @param {string} params.certification_scheme - Filter by certification (organics, regenerative, biodynamic, swnz)
   * @param {boolean} params.certified_only - Only show certified items
   * @param {number} params.skip - Pagination offset
   * @param {number} params.limit - Results per page
   */
  listAssets: async (params = {}) => {
    const res = await api.get('/assets', { params });
    return res.data;
  },

  /**
   * Get lightweight asset summary for dropdowns
   * @param {string} category - Optional category filter
   * @param {string} asset_type - Optional type filter
   */
  getAssetsSummary: async ({ category = null, asset_type = null } = {}) => {
    const params = {};
    if (category) params.category = category;
    if (asset_type) params.asset_type = asset_type;
    
    const res = await api.get('/assets/summary', { params });
    return res.data;
  },

  /**
   * Get single asset by ID
   * @param {number} assetId - Asset ID
   */
  getAsset: async (assetId) => {
    const res = await api.get(`/assets/${assetId}`);
    return res.data;
  },

  /**
   * Create new asset
   * @param {Object} payload - Asset data
   */
  createAsset: async (payload) => {
    const res = await api.post('/assets', payload);
    return res.data;
  },

  /**
   * Update existing asset
   * @param {number} assetId - Asset ID
   * @param {Object} payload - Update data
   */
  updateAsset: async (assetId, payload) => {
    const res = await api.put(`/assets/${assetId}`, payload);
    return res.data;
  },

  /**
   * Delete asset (soft delete)
   * @param {number} assetId - Asset ID
   */
  deleteAsset: async (assetId) => {
    const res = await api.delete(`/assets/${assetId}`);
    return res.data;
  },

  /**
   * Get assets by category
   * @param {string} category - Category name
   */
  getAssetsByCategory: async (category) => {
    const res = await api.get(`/assets/category/${category}`);
    return res.data;
  },

  /**
   * Get low stock consumables
   * @param {string} certification_scheme - Optional filter by certification
   */
  getLowStockConsumables: async (certification_scheme = null) => {
    const params = {};
    if (certification_scheme) params.certification_scheme = certification_scheme;
    
    const res = await api.get('/assets/consumables/low-stock', { params });
    return res.data;
  },

  /**
   * Get consumables by certification scheme
   * @param {string} scheme - Certification scheme (organics, regenerative, biodynamic, swnz)
   * @param {boolean} include_uncertified - Include uncertified items
   * @param {boolean} low_stock_only - Only show low stock items
   */
  getConsumablesByCertification: async ({ scheme, include_uncertified = false, low_stock_only = false }) => {
    const res = await api.get('/assets/consumables/by-certification', {
      params: { scheme, include_uncertified, low_stock_only }
    });
    return res.data;
  },

  /**
   * Get certification summary for all consumables
   */
  getCertificationSummary: async () => {
    const res = await api.get('/assets/consumables/certification-summary');
    return res.data;
  },
};

// ============================================================================
// MAINTENANCE OPERATIONS
// ============================================================================

const maintenanceOperations = {
  /**
   * List maintenance records with filtering
   * @param {Object} params - Filter parameters
   */
  listMaintenance: async (params = {}) => {
    const res = await api.get('/maintenance', { params });
    return res.data;
  },

  /**
   * Get maintenance items that are due or coming due
   * @param {number} days_ahead - Days to look ahead (default 30)
   * @param {boolean} include_overdue - Include overdue items
   */
  getMaintenanceDue: async ({ days_ahead = 30, include_overdue = true } = {}) => {
    const res = await api.get('/maintenance/due', {
      params: { days_ahead, include_overdue }
    });
    return res.data;
  },

  /**
   * Get single maintenance record
   * @param {number} maintenanceId - Maintenance record ID
   */
  getMaintenance: async (maintenanceId) => {
    const res = await api.get(`/maintenance/${maintenanceId}`);
    return res.data;
  },

  /**
   * Create new maintenance record
   * @param {Object} payload - Maintenance data
   */
  createMaintenance: async (payload) => {
    const res = await api.post('/maintenance', payload);
    return res.data;
  },

  /**
   * Update maintenance record
   * @param {number} maintenanceId - Maintenance record ID
   * @param {Object} payload - Update data
   */
  updateMaintenance: async (maintenanceId, payload) => {
    const res = await api.put(`/maintenance/${maintenanceId}`, payload);
    return res.data;
  },

  /**
   * Delete maintenance record
   * @param {number} maintenanceId - Maintenance record ID
   */
  deleteMaintenance: async (maintenanceId) => {
    const res = await api.delete(`/maintenance/${maintenanceId}`);
    return res.data;
  },

  /**
   * Get maintenance history for specific asset
   * @param {number} assetId - Asset ID
   * @param {number} limit - Max records to return
   */
  getAssetMaintenanceHistory: async (assetId, limit = 50) => {
    const res = await api.get(`/maintenance/asset/${assetId}`, {
      params: { limit }
    });
    return res.data;
  },

  /**
   * Mark maintenance as completed
   * @param {number} maintenanceId - Maintenance record ID
   * @param {Object} completionData - Completion details
   */
  completeMaintenance: async (maintenanceId, completionData = {}) => {
    const payload = {
      ...completionData,
      status: 'completed',
      completed_date: completionData.completed_date || new Date().toISOString().split('T')[0]
    };
    const res = await api.put(`/maintenance/${maintenanceId}`, payload);
    return res.data;
  },
};

// ============================================================================
// CALIBRATION OPERATIONS
// ============================================================================

const calibrationOperations = {
  /**
   * List calibration records with filtering
   * @param {Object} params - Filter parameters
   */
  listCalibrations: async (params = {}) => {
    const res = await api.get('/calibrations', { params });
    return res.data;
  },

  /**
   * Get calibrations that are due or coming due
   * @param {number} days_ahead - Days to look ahead (default 30)
   * @param {boolean} include_overdue - Include overdue calibrations
   */
  getCalibrationsDue: async ({ days_ahead = 30, include_overdue = true } = {}) => {
    const res = await api.get('/calibrations/due', {
      params: { days_ahead, include_overdue }
    });
    return res.data;
  },

  /**
   * Get single calibration record
   * @param {number} calibrationId - Calibration record ID
   */
  getCalibration: async (calibrationId) => {
    const res = await api.get(`/calibrations/${calibrationId}`);
    return res.data;
  },

  /**
   * Create new calibration record
   * @param {Object} payload - Calibration data
   */
  createCalibration: async (payload) => {
    const res = await api.post('/calibrations', payload);
    return res.data;
  },

  /**
   * Update calibration record
   * @param {number} calibrationId - Calibration record ID
   * @param {Object} payload - Update data
   */
  updateCalibration: async (calibrationId, payload) => {
    const res = await api.put(`/calibrations/${calibrationId}`, payload);
    return res.data;
  },

  /**
   * Delete calibration record
   * @param {number} calibrationId - Calibration record ID
   */
  deleteCalibration: async (calibrationId) => {
    const res = await api.delete(`/calibrations/${calibrationId}`);
    return res.data;
  },

  /**
   * Get calibration history for specific asset
   * @param {number} assetId - Asset ID
   * @param {string} calibration_type - Optional type filter
   * @param {number} limit - Max records to return
   */
  getAssetCalibrationHistory: async (assetId, { calibration_type = null, limit = 50 } = {}) => {
    const params = { limit };
    if (calibration_type) params.calibration_type = calibration_type;
    
    const res = await api.get(`/calibrations/asset/${assetId}`, { params });
    return res.data;
  },

  /**
   * Get valid calibrations for spray events
   * @param {number} asset_id - Asset ID
   * @param {string} calibration_type - Type of calibration needed
   * @param {number} max_age_days - Maximum age in days
   */
  getValidCalibrations: async ({ asset_id, calibration_type = 'application_rate', max_age_days = 30 }) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - max_age_days);
    
    const res = await api.get('/calibrations', {
      params: {
        asset_id,
        calibration_type,
        status: 'pass',
        calibrated_from: cutoffDate.toISOString().split('T')[0]
      }
    });
    return res.data;
  },
};

// ============================================================================
// STOCK MOVEMENT OPERATIONS (for Consumables)
// ============================================================================

const stockOperations = {
  /**
   * List stock movements with filtering
   * @param {Object} params - Filter parameters
   */
  listStockMovements: async (params = {}) => {
    const res = await api.get('/stock-movements', { params });
    return res.data;
  },

  /**
   * Create new stock movement (purchase, usage, adjustment, etc.)
   * @param {Object} payload - Stock movement data
   */
  createStockMovement: async (payload) => {
    const res = await api.post('/stock-movements', payload);
    return res.data;
  },

  /**
   * Update stock movement
   * @param {number} movementId - Stock movement ID
   * @param {Object} payload - Update data
   */
  updateStockMovement: async (movementId, payload) => {
    const res = await api.put(`/stock-movements/${movementId}`, payload);
    return res.data;
  },

  /**
   * Delete stock movement
   * @param {number} movementId - Stock movement ID
   */
  deleteStockMovement: async (movementId) => {
    const res = await api.delete(`/stock-movements/${movementId}`);
    return res.data;
  },

  /**
   * Get stock movement history for specific asset
   * @param {number} assetId - Asset ID
   * @param {number} limit - Max records to return
   */
  getAssetStockHistory: async (assetId, limit = 50) => {
    const res = await api.get(`/stock-movements/asset/${assetId}`, {
      params: { limit }
    });
    return res.data;
  },

  /**
   * Record product usage (negative stock movement)
   * @param {Object} usageData - Usage details
   */
  recordUsage: async (usageData) => {
    const payload = {
      movement_type: 'usage',
      quantity: -Math.abs(usageData.quantity), // Ensure negative
      movement_date: usageData.movement_date || new Date().toISOString().split('T')[0],
      ...usageData
    };
    return stockOperations.createStockMovement(payload);
  },

  /**
   * Record product purchase (positive stock movement)
   * @param {Object} purchaseData - Purchase details
   */
  recordPurchase: async (purchaseData) => {
    const payload = {
      movement_type: 'purchase',
      quantity: Math.abs(purchaseData.quantity), // Ensure positive
      movement_date: purchaseData.movement_date || new Date().toISOString().split('T')[0],
      ...purchaseData
    };
    return stockOperations.createStockMovement(payload);
  },

  /**
   * Record stock adjustment
   * @param {Object} adjustmentData - Adjustment details
   */
  recordAdjustment: async (adjustmentData) => {
    const payload = {
      movement_type: 'adjustment',
      movement_date: adjustmentData.movement_date || new Date().toISOString().split('T')[0],
      ...adjustmentData
    };
    return stockOperations.createStockMovement(payload);
  },
};

// ============================================================================
// DASHBOARD & ANALYTICS OPERATIONS
// ============================================================================

const dashboardOperations = {
  /**
   * Get asset statistics for dashboard
   */
  getAssetStats: async () => {
    const res = await api.get('/assets/stats');
    return res.data;
  },

  /**
   * Get compliance alerts (WOF, registration, insurance expiring soon)
   * @param {number} days_ahead - Days to look ahead (default 30)
   */
  getComplianceAlerts: async (days_ahead = 30) => {
    const res = await api.get('/assets/compliance-alerts', {
      params: { days_ahead }
    });
    return res.data;
  },

  /**
   * Get stock level alerts for consumables
   */
  getStockAlerts: async () => {
    const res = await api.get('/assets/stock-alerts');
    return res.data;
  },

  /**
   * Get comprehensive dashboard data in one call
   */
  getDashboardData: async () => {
    const [stats, complianceAlerts, stockAlerts, maintenanceDue, calibrationsDue] = await Promise.all([
      dashboardOperations.getAssetStats(),
      dashboardOperations.getComplianceAlerts(30),
      dashboardOperations.getStockAlerts(),
      maintenanceOperations.getMaintenanceDue({ days_ahead: 30 }),
      calibrationOperations.getCalibrationsDue({ days_ahead: 30 })
    ]);

    return {
      stats,
      complianceAlerts,
      stockAlerts,
      maintenanceDue,
      calibrationsDue
    };
  },
};

// ============================================================================
// FILE MANAGEMENT OPERATIONS (Photos & Documents Only - No Manuals)
// ============================================================================

const fileOperations = {
  /**
   * Upload asset file (photo or document ONLY)
   * @param {number} assetId - Asset ID
   * @param {File} file - File to upload
   * @param {string} fileCategory - File category (photo, document)
   * @param {string} description - Optional description
   */
  uploadAssetFile: async ({ assetId, file, fileCategory = 'document', description = null }) => {
    // Validate fileCategory - only photo and document allowed
    if (!['photo', 'document'].includes(fileCategory)) {
      throw new Error('Only photo and document file categories are supported for assets');
    }

    const formData = new FormData();
    formData.append('entity_type', 'asset');
    formData.append('entity_id', String(assetId)); // Ensure it's a string for the form
    formData.append('file_category', fileCategory);
    if (description) formData.append('description', description);
    formData.append('file', file); // IMPORTANT: 'file' must be last or at least after other fields

    const res = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data' // Ensure proper content type
      }
    });
    return res.data;
  },

  /**
   * Upload maintenance file (photo, invoice, certificate, document)
   * @param {number} maintenanceId - Maintenance record ID
   * @param {File} file - File to upload
   * @param {string} fileCategory - File category
   * @param {string} description - Optional description
   */
  uploadMaintenanceFile: async ({ maintenanceId, file, fileCategory = 'document', description = null }) => {
    const formData = new FormData();
    formData.append('entity_type', 'asset_maintenance');
    formData.append('entity_id', String(maintenanceId));
    formData.append('file_category', fileCategory);
    if (description) formData.append('description', description);
    formData.append('file', file);

    const res = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  },

  /**
   * Upload calibration file (photo, certificate, test results)
   * @param {number} calibrationId - Calibration record ID
   * @param {File} file - File to upload
   * @param {string} fileCategory - File category
   * @param {string} description - Optional description
   */
  uploadCalibrationFile: async ({ calibrationId, file, fileCategory = 'certificate', description = null }) => {
    const formData = new FormData();
    formData.append('entity_type', 'asset_calibration');
    formData.append('entity_id', String(calibrationId));
    formData.append('file_category', fileCategory);
    if (description) formData.append('description', description);
    formData.append('file', file);

    const res = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  },

  /**
   * Upload stock movement file (invoice, receipt, delivery note)
   * @param {number} movementId - Stock movement ID
   * @param {File} file - File to upload
   * @param {string} fileCategory - File category
   * @param {string} description - Optional description
   */
  uploadStockMovementFile: async ({ movementId, file, fileCategory = 'document', description = null }) => {
    const formData = new FormData();
    formData.append('entity_type', 'stock_movement');
    formData.append('entity_id', String(movementId));
    formData.append('file_category', fileCategory);
    if (description) formData.append('description', description);
    formData.append('file', file);

    const res = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  },

  /**
   * List files for an entity
   * @param {string} entityType - Entity type (asset, asset_maintenance, asset_calibration, stock_movement)
   * @param {number} entityId - Entity ID
   * @param {string} fileCategory - Optional file category filter
   */
  listFiles: async ({ entityType, entityId, fileCategory = null }) => {
    const params = fileCategory ? { file_category: fileCategory } : {};
    const res = await api.get(`/files/entity/${entityType}/${entityId}`, { params });
    return res.data;
  },

  /**
   * List asset files (photo or document only)
   * @param {number} assetId - Asset ID
   * @param {string} fileCategory - Optional category filter (photo, document)
   */
  listAssetFiles: async (assetId, fileCategory = null) => {
    return fileOperations.listFiles({
      entityType: 'asset',
      entityId: assetId,
      fileCategory
    });
  },

  /**
   * List asset photos
   * @param {number} assetId - Asset ID
   */
  listAssetPhotos: async (assetId) => {
    return fileOperations.listAssetFiles(assetId, 'photo');
  },

  /**
   * List asset documents
   * @param {number} assetId - Asset ID
   */
  listAssetDocuments: async (assetId) => {
    return fileOperations.listAssetFiles(assetId, 'document');
  },

  /**
   * List maintenance files
   * @param {number} maintenanceId - Maintenance record ID
   * @param {string} fileCategory - Optional category filter
   */
  listMaintenanceFiles: async (maintenanceId, fileCategory = null) => {
    return fileOperations.listFiles({
      entityType: 'asset_maintenance',
      entityId: maintenanceId,
      fileCategory
    });
  },

  /**
   * List calibration files
   * @param {number} calibrationId - Calibration record ID
   * @param {string} fileCategory - Optional category filter
   */
  listCalibrationFiles: async (calibrationId, fileCategory = null) => {
    return fileOperations.listFiles({
      entityType: 'asset_calibration',
      entityId: calibrationId,
      fileCategory
    });
  },

  /**
   * Delete file
   * @param {string} fileId - File ID
   * @param {boolean} permanent - Permanent delete (admin only)
   */
  deleteFile: async (fileId, permanent = false) => {
    const params = permanent ? { permanent: true } : {};
    const res = await api.delete(`/files/${fileId}`, { params });
    return res.data;
  },

  /**
   * Get file download URL
   * @param {Object} file - File object
   */
  getFileDownloadUrl: (file) => {
    return file?.download_url || `/files/${file.id}/download`;
  },

  /**
   * Get file type from mime type
   * @param {Object} file - File object
   */
  getFileType: (file) => {
    const mime = file.mime_type || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.includes('excel') || mime.includes('spreadsheet')) return 'excel';
    if (mime === 'text/csv') return 'csv';
    if (mime.includes('word')) return 'word';
    return 'document';
  },

  downloadBlob: async (fileId) => {
  // Force a blob so we can generate a preview/download regardless of auth headers
  const res = await api.get(`/files/${fileId}/download`, { responseType: 'blob' });
  return res.data; // Blob
},

  getObjectUrl: async (fileId) => {
    const blob = await fileOperations.downloadBlob(fileId);
    return URL.createObjectURL(blob);
  },

  revokeObjectUrl: (url) => {
    try { if (url) URL.revokeObjectURL(url); } catch {}
  },
};

// ============================================================================
// HELPER UTILITIES
// ============================================================================

const assetHelpers = {
  /**
   * Calculate spray application usage
   * @param {number} area_hectares - Area treated in hectares
   * @param {number} application_rate - Application rate in L/ha or kg/ha
   * @returns {number} Total product usage
   */
  calculateSprayUsage: (area_hectares, application_rate) => {
    return area_hectares * application_rate;
  },

  /**
   * Calculate application rate from calibration
   * @param {number} flow_rate - Flow rate per nozzle (L/min)
   * @param {number} nozzle_count - Number of nozzles
   * @param {number} nozzle_spacing - Spacing between nozzles (cm)
   * @param {number} travel_speed - Travel speed (km/h)
   * @returns {number} Application rate in L/ha
   */
  calculateApplicationRate: (flow_rate, nozzle_count, nozzle_spacing, travel_speed) => {
    // Formula: (Flow rate × nozzles × 600) / (nozzle spacing × speed)
    return (flow_rate * nozzle_count * 600) / (nozzle_spacing * travel_speed);
  },

  /**
   * Check if calibration is valid for use
   * @param {Object} calibration - Calibration record
   * @param {number} max_age_days - Maximum age in days
   * @returns {boolean} Is valid
   */
  isCalibrationValid: (calibration, max_age_days = 30) => {
    if (!calibration || calibration.status !== 'pass') return false;
    
    const calibDate = new Date(calibration.calibration_date);
    const now = new Date();
    const daysDiff = Math.floor((now - calibDate) / (1000 * 60 * 60 * 24));
    
    return daysDiff <= max_age_days;
  },

  /**
   * Check if stock is sufficient for planned usage
   * @param {Object} asset - Asset (consumable)
   * @param {number} planned_usage - Planned usage amount
   * @returns {Object} { sufficient, shortage, current_stock, after_usage }
   */
  checkStockSufficiency: (asset, planned_usage) => {
    const current = parseFloat(asset.current_stock || 0);
    const sufficient = current >= planned_usage;
    const shortage = sufficient ? 0 : planned_usage - current;
    
    return {
      sufficient,
      shortage,
      current_stock: current,
      after_usage: current - planned_usage
    };
  },

  /**
   * Format asset status for display
   * @param {string} status - Status code
   * @returns {Object} { label, color, icon }
   */
  formatAssetStatus: (status) => {
    const statusMap = {
      active: { label: 'Active', color: 'green', icon: '✓' },
      maintenance: { label: 'In Maintenance', color: 'orange', icon: '🔧' },
      retired: { label: 'Retired', color: 'gray', icon: '📦' },
      disposed: { label: 'Disposed', color: 'red', icon: '🗑️' },
      out_of_stock: { label: 'Out of Stock', color: 'red', icon: '⚠️' }
    };
    return statusMap[status] || { label: status, color: 'gray', icon: '?' };
  },

  /**
   * Format stock status for display
   * @param {Object} asset - Asset (consumable)
   * @returns {Object} { label, color, icon, needs_reorder }
   */
  formatStockStatus: (asset) => {
    const current = parseFloat(asset.current_stock || 0);
    const minimum = parseFloat(asset.minimum_stock || 0);
    
    if (current <= 0) {
      return { label: 'Out of Stock', color: 'red', icon: '🚫', needs_reorder: true };
    }
    if (current <= minimum) {
      return { label: 'Low Stock', color: 'orange', icon: '⚠️', needs_reorder: true };
    }
    return { label: 'Adequate', color: 'green', icon: '✓', needs_reorder: false };
  },

  /**
   * Calculate days until due/overdue
   * @param {string} dueDate - Due date string
   * @returns {Object} { days, is_overdue, is_due_soon }
   */
  calculateDaysUntilDue: (dueDate) => {
    if (!dueDate) return { days: null, is_overdue: false, is_due_soon: false };
    
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due - now;
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      days: Math.abs(days),
      is_overdue: days < 0,
      is_due_soon: days >= 0 && days <= 7
    };
  },

  /**
   * Format certification badges for display
   * @param {Object} certified_for - Certification object from asset
   * @returns {Array} Array of certification objects with display info
   */
  formatCertifications: (certified_for) => {
    if (!certified_for) return [];
    
    const certMap = {
      organics: { 
        label: 'Organic', 
        shortLabel: 'ORG',
        color: 'green', 
        icon: '🌱',
        description: 'Certified for organic viticulture'
      },
      regenerative: { 
        label: 'Regenerative', 
        shortLabel: 'REGEN',
        color: 'emerald', 
        icon: '🌿',
        description: 'Approved for regenerative agriculture'
      },
      biodynamic: { 
        label: 'Biodynamic', 
        shortLabel: 'BIO',
        color: 'purple', 
        icon: '🌙',
        description: 'Biodynamic certification compliant'
      },
      swnz: { 
        label: 'SWNZ', 
        shortLabel: 'SWNZ',
        color: 'blue', 
        icon: '✓',
        description: 'Sustainable Winegrowing New Zealand approved'
      }
    };
    
    return Object.entries(certified_for)
      .filter(([key, value]) => value === true)
      .map(([key]) => certMap[key])
      .filter(Boolean);
  },

  /**
   * Check if consumable is certified for specific scheme
   * @param {Object} asset - Asset (consumable)
   * @param {string} scheme - Scheme name (organics, regenerative, biodynamic, swnz)
   * @returns {boolean}
   */
  isCertifiedFor: (asset, scheme) => {
    if (!asset || !asset.certified_for) return false;
    return asset.certified_for[scheme] === true;
  },

  /**
   * Get certification schemes as array
   * @returns {Array} Available certification schemes
   */
  getCertificationSchemes: () => {
    return [
      { 
        value: 'organics', 
        label: 'Organic', 
        shortLabel: 'ORG',
        description: 'Certified for organic viticulture',
        icon: '🌱',
        color: 'green'
      },
      { 
        value: 'regenerative', 
        label: 'Regenerative Agriculture', 
        shortLabel: 'REGEN',
        description: 'Approved for regenerative practices',
        icon: '🌿',
        color: 'emerald'
      },
      { 
        value: 'biodynamic', 
        label: 'Biodynamic', 
        shortLabel: 'BIO',
        description: 'Biodynamic certification compliant',
        icon: '🌙',
        color: 'purple'
      },
      { 
        value: 'swnz', 
        label: 'Sustainable Winegrowing NZ', 
        shortLabel: 'SWNZ',
        description: 'SWNZ scheme approved',
        icon: '✓',
        color: 'blue'
      }
    ];
  },

  /**
   * Get asset category options
   * @returns {Array} Available asset categories
   */
  getAssetCategories: () => {
    return [
      { value: 'equipment', label: 'Equipment', icon: '🚜' },
      { value: 'vehicle', label: 'Vehicle', icon: '🚗' },
      { value: 'tool', label: 'Tool', icon: '🔧' },
      { value: 'consumable', label: 'Consumable', icon: '📦' },
      { value: 'infrastructure', label: 'Infrastructure', icon: '🏗️' }
    ];
  },

  /**
   * Get asset type options
   * @returns {Array} Available asset types
   */
  getAssetTypes: () => {
    return [
      { value: 'physical', label: 'Physical Asset' },
      { value: 'consumable', label: 'Consumable' }
    ];
  },

  /**
   * Get consumable subcategories (focused on organic/SWNZ relevant materials)
   * @returns {Array} Available consumable subcategories
   */
  getConsumableSubcategories: () => {
    return [
      { value: 'spray_product', label: 'Spray Product', icon: '💧' },
      { value: 'fertilizer', label: 'Fertilizer', icon: '🌾' },
      { value: 'organic_input', label: 'Organic Input', icon: '🌱' },
      { value: 'fuel', label: 'Fuel', icon: '⛽' },
      { value: 'other', label: 'Other', icon: '📦' }
    ];
  },

  /**
   * Get maintenance type options
   * @returns {Array} Available maintenance types
   */
  getMaintenanceTypes: () => {
    return [
      { value: 'scheduled', label: 'Scheduled Maintenance' },
      { value: 'reactive', label: 'Reactive Maintenance' },
      { value: 'emergency', label: 'Emergency Repair' },
      { value: 'compliance', label: 'Compliance Check' }
    ];
  },

  /**
   * Get maintenance status options
   * @returns {Array} Available maintenance statuses
   */
  getMaintenanceStatuses: () => {
    return [
      { value: 'scheduled', label: 'Scheduled', color: 'blue' },
      { value: 'in_progress', label: 'In Progress', color: 'yellow' },
      { value: 'completed', label: 'Completed', color: 'green' },
      { value: 'cancelled', label: 'Cancelled', color: 'gray' }
    ];
  },

  /**
   * Get calibration type options (spray-focused)
   * @returns {Array} Available calibration types
   */
  getCalibrationType: () => {
    return [
      { value: 'flow_rate', label: 'Flow Rate', description: 'Nozzle flow rate calibration' },
      { value: 'pressure', label: 'Pressure', description: 'System pressure calibration' },
      { value: 'application_rate', label: 'Application Rate', description: 'Total application rate' },
      { value: 'pattern_uniformity', label: 'Pattern Uniformity', description: 'Spray pattern distribution' },
      { value: 'speed', label: 'Speed Calibration', description: 'Travel speed accuracy' },
      { value: 'fuel_efficiency', label: 'Fuel Efficiency', description: 'Fuel consumption rate' },
      { value: 'other', label: 'Other', description: 'Other calibration type' }
    ];
  },

  /**
   * Get stock movement type options
   * @returns {Array} Available stock movement types
   */
  getStockMovementTypes: () => {
    return [
      { value: 'purchase', label: 'Purchase', color: 'green', icon: '📥' },
      { value: 'usage', label: 'Usage', color: 'orange', icon: '📤' },
      { value: 'transfer', label: 'Transfer', color: 'blue', icon: '↔️' },
      { value: 'adjustment', label: 'Adjustment', color: 'yellow', icon: '⚖️' },
      { value: 'disposal', label: 'Disposal', color: 'red', icon: '🗑️' }
    ];
  },

  /**
   * Format currency value
   * @param {number} value - Currency value
   * @param {string} currency - Currency code (default NZD)
   * @returns {string} Formatted currency string
   */
  formatCurrency: (value, currency = 'NZD') => {
    if (!value && value !== 0) return '-';
    
    const formatter = new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    return formatter.format(value);
  },

  /**
   * Format quantity with unit
   * @param {number} quantity - Quantity value
   * @param {string} unit - Unit of measure
   * @returns {string} Formatted quantity string
   */
  formatQuantity: (quantity, unit = 'units') => {
    if (!quantity && quantity !== 0) return '-';
    return `${parseFloat(quantity).toFixed(2)} ${unit}`;
  },

  /**
   * Format date for display
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted date string
   */
  formatDate: (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },

  /**
   * Validate ACVM registration number (NZ format)
   * @param {string} acvmNumber - ACVM number to validate
   * @returns {boolean} Is valid
   */
  validateACVMNumber: (acvmNumber) => {
    if (!acvmNumber) return false;
    // Basic ACVM format: ACVM followed by digits (e.g., ACVM12345)
    const acvmRegex = /^ACVM\d{4,6}$/i;
    return acvmRegex.test(acvmNumber);
  },

  /**
   * Check if maintenance is overdue
   * @param {Object} maintenance - Maintenance record
   * @returns {boolean} Is overdue
   */
  isMaintenanceOverdue: (maintenance) => {
    if (!maintenance.scheduled_date) return false;
    if (['completed', 'cancelled'].includes(maintenance.status)) return false;
    
    const scheduled = new Date(maintenance.scheduled_date);
    const now = new Date();
    return scheduled < now;
  },

  /**
   * Check if calibration is overdue
   * @param {Object} calibration - Calibration record
   * @returns {boolean} Is overdue
   */
  isCalibrationOverdue: (calibration) => {
    if (!calibration.next_due_date) return false;
    
    const dueDate = new Date(calibration.next_due_date);
    const now = new Date();
    return dueDate < now;
  },

  /**
   * Calculate total maintenance cost
   * @param {Object} maintenance - Maintenance record
   * @returns {number} Total cost
   */
  calculateMaintenanceCost: (maintenance) => {
    const labor = parseFloat(maintenance.labor_cost || 0);
    const parts = parseFloat(maintenance.parts_cost || 0);
    const external = parseFloat(maintenance.external_cost || 0);
    return labor + parts + external;
  },

  /**
   * Get priority color for maintenance
   * @param {Object} maintenance - Maintenance record
   * @returns {string} Color name
   */
  getMaintenancePriorityColor: (maintenance) => {
    if (assetHelpers.isMaintenanceOverdue(maintenance)) return 'red';
    
    const daysInfo = assetHelpers.calculateDaysUntilDue(maintenance.scheduled_date);
    if (daysInfo.is_due_soon) return 'orange';
    if (daysInfo.days <= 14) return 'yellow';
    return 'blue';
  },

  /**
   * Get priority color for calibration
   * @param {Object} calibration - Calibration record
   * @returns {string} Color name
   */
  getCalibrationPriorityColor: (calibration) => {
    if (assetHelpers.isCalibrationOverdue(calibration)) return 'red';
    
    const daysInfo = assetHelpers.calculateDaysUntilDue(calibration.next_due_date);
    if (daysInfo.is_due_soon) return 'orange';
    if (daysInfo.days <= 14) return 'yellow';
    return 'blue';
  },

  /**
   * Filter consumables by certification
   * @param {Array} consumables - Array of consumable assets
   * @param {string} scheme - Certification scheme to filter by
   * @returns {Array} Filtered consumables
   */
  filterByCertification: (consumables, scheme) => {
    return consumables.filter(asset => assetHelpers.isCertifiedFor(asset, scheme));
  },

  /**
   * Group assets by category
   * @param {Array} assets - Array of assets
   * @returns {Object} Assets grouped by category
   */
  groupByCategory: (assets) => {
    return assets.reduce((groups, asset) => {
      const category = asset.category || 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(asset);
      return groups;
    }, {});
  },

  /**
   * Group consumables by certification
   * @param {Array} consumables - Array of consumable assets
   * @returns {Object} Consumables grouped by certification schemes
   */
  groupByCertification: (consumables) => {
    const schemes = ['organics', 'regenerative', 'biodynamic', 'swnz'];
    const groups = {};
    
    schemes.forEach(scheme => {
      groups[scheme] = consumables.filter(asset => 
        assetHelpers.isCertifiedFor(asset, scheme)
      );
    });
    
    return groups;
  },
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

const assetService = {
  // Asset operations
  ...assetOperations,
  
  // Maintenance operations
  maintenance: maintenanceOperations,
  
  // Calibration operations
  calibration: calibrationOperations,
  
  // Stock operations
  stock: stockOperations,
  
  // Dashboard operations
  dashboard: dashboardOperations,
  
  // File operations (photos & documents only - no manuals)
  files: fileOperations,
  
  // Helper utilities
  helpers: assetHelpers,
};

export default assetService;