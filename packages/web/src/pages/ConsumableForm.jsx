// packages/mobile/src/pages/ConsumableForm.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Trash2,
  Camera,
  FileText,
  AlertCircle,
  Package,
  Droplet,
  TrendingDown,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { assetService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import StockMovementInlineManager from '../components/StockMovementInlineManager';
import MaintenanceTable from '../components/MaintenanceTable';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export default function ConsumableForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const companyId = authService.getCompanyId();

  // Form state
  const [formData, setFormData] = useState({
    asset_number: '',
    name: '',
    description: '',
    category: 'consumable',
    subcategory: 'spray_product',
    asset_type: 'consumable',
    
    // Stock Management
    unit_of_measure: 'L',
    current_stock: '0',
    minimum_stock: '',
    maximum_stock: '',
    cost_per_unit: '',
    
    // Chemical/Fertilizer Compliance
    active_ingredient: '',
    concentration: '',
    application_rate_min: '',
    application_rate_max: '',
    withholding_period_days: '',
    registration_number: '',
    registration_expiry: '',
    safety_data_sheet_url: '',
    hazard_classifications: {},
    
    // Certification
    certified_for: {
      organics: false,
      regenerative: false,
      biodynamic: false,
      swnz: false
    },
    
    // Storage & Handling
    storage_requirements: {},
    batch_tracking_required: false,
    expiry_tracking_required: false,
    
    // Basic fields
    purchase_date: '',
    purchase_price: '',
    current_value: '',
    status: 'active',
    location: '',
    requires_maintenance: false,
    maintenance_interval_days: ''
  });

  // UI state
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details'); // details, stock_movements, maintenance

  // Photos and documents
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);

  // Stock alert
  const [showStockAlert, setShowStockAlert] = useState(false);

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  // Load consumable data in edit mode
  useEffect(() => {
    if (isEditMode) {
      loadConsumable();
    }
  }, [id]);

  // Check stock alert when current_stock or minimum_stock changes
  useEffect(() => {
    if (isEditMode && formData.current_stock && formData.minimum_stock) {
      const current = parseFloat(formData.current_stock);
      const minimum = parseFloat(formData.minimum_stock);
      setShowStockAlert(current <= minimum);
    } else {
      setShowStockAlert(false);
    }
  }, [formData.current_stock, formData.minimum_stock, isEditMode]);

  const loadConsumable = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const asset = await assetService.getAsset(id);
      
      // Populate form
      setFormData({
        asset_number: asset.asset_number || '',
        name: asset.name || '',
        description: asset.description || '',
        category: asset.category || 'consumable',
        subcategory: asset.subcategory || 'spray_product',
        asset_type: 'consumable',
        
        // Stock Management
        unit_of_measure: asset.unit_of_measure || 'L',
        current_stock: asset.current_stock?.toString() || '0',
        minimum_stock: asset.minimum_stock?.toString() || '',
        maximum_stock: asset.maximum_stock?.toString() || '',
        cost_per_unit: asset.cost_per_unit?.toString() || '',
        
        // Chemical/Fertilizer Compliance
        active_ingredient: asset.active_ingredient || '',
        concentration: asset.concentration || '',
        application_rate_min: asset.application_rate_min?.toString() || '',
        application_rate_max: asset.application_rate_max?.toString() || '',
        withholding_period_days: asset.withholding_period_days?.toString() || '',
        registration_number: asset.registration_number || '',
        registration_expiry: asset.registration_expiry || '',
        safety_data_sheet_url: asset.safety_data_sheet_url || '',
        hazard_classifications: asset.hazard_classifications || {},
        
        // Certification
        certified_for: asset.certified_for || {
          organics: false,
          regenerative: false,
          biodynamic: false,
          swnz: false
        },
        
        // Storage & Handling
        storage_requirements: asset.storage_requirements || {},
        batch_tracking_required: asset.batch_tracking_required || false,
        expiry_tracking_required: asset.expiry_tracking_required || false,
        
        // Basic fields
        purchase_date: asset.purchase_date || '',
        purchase_price: asset.purchase_price?.toString() || '',
        current_value: asset.current_value?.toString() || '',
        status: asset.status || 'active',
        location: asset.location || '',
        requires_maintenance: asset.requires_maintenance || false,
        maintenance_interval_days: asset.maintenance_interval_days?.toString() || ''
      });

      // Load photos and documents
      if (asset.id) {
        const [photoFiles, docFiles] = await Promise.all([
          assetService.files.listAssetPhotos(asset.id).catch(() => []),
          assetService.files.listAssetDocuments(asset.id).catch(() => [])
        ]);
        setPhotos(photoFiles || []);
        setDocuments(docFiles || []);
      }
    } catch (e) {
      console.error('Failed to load consumable:', e);
      setError('Failed to load consumable details');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCertificationChange = (scheme, checked) => {
    setFormData(prev => ({
      ...prev,
      certified_for: {
        ...prev.certified_for,
        [scheme]: checked
      }
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validation
      if (!formData.asset_number.trim()) {
        setError('Asset number is required');
        return;
      }
      if (!formData.name.trim()) {
        setError('Consumable name is required');
        return;
      }
      if (!formData.unit_of_measure.trim()) {
        setError('Unit of measure is required');
        return;
      }
      if (formData.withholding_period_days && parseFloat(formData.withholding_period_days) < 0) {
        setError('Withholding period cannot be negative');
        return;
      }

      // Validate ACVM number if provided
      if (formData.registration_number && !assetService.helpers.validateACVMNumber(formData.registration_number)) {
        const useAnyway = window.confirm(
          'The registration number does not match the standard ACVM format (e.g., ACVM12345). Save anyway?'
        );
        if (!useAnyway) return;
      }

      const sanitizePayload = (data) =>
        Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
        );

      const payload = sanitizePayload({
        ...formData,
        category: 'consumable',
        asset_type: 'consumable',
        current_stock: formData.current_stock ? Number(formData.current_stock) : 0,
        minimum_stock: formData.minimum_stock ? Number(formData.minimum_stock) : null,
        maximum_stock: formData.maximum_stock ? Number(formData.maximum_stock) : null,
        cost_per_unit: formData.cost_per_unit ? Number(formData.cost_per_unit) : null,
        application_rate_min: formData.application_rate_min ? Number(formData.application_rate_min) : null,
        application_rate_max: formData.application_rate_max ? Number(formData.application_rate_max) : null,
        withholding_period_days: formData.withholding_period_days ? Number(formData.withholding_period_days) : null,
        purchase_price: formData.purchase_price ? Number(formData.purchase_price) : null,
        current_value: formData.current_value ? Number(formData.current_value) : null,
        maintenance_interval_days: formData.maintenance_interval_days ? Number(formData.maintenance_interval_days) : null
      });

      let savedAsset;
      if (isEditMode) {
        savedAsset = await assetService.updateAsset(id, payload);
      } else {
        savedAsset = await assetService.createAsset(payload);
      }

      // Navigate to detail page or back to consumables list
      navigate(`/assets/consumables/${savedAsset.id}`);
    } catch (e) {
      console.error('Failed to save consumable:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save consumable';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save consumable' : detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this consumable? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(true);
      await assetService.deleteAsset(id);
      navigate('/assets');
    } catch (e) {
      console.error('Failed to delete consumable:', e);
      alert('Failed to delete consumable: ' + (e?.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  const handlePhotoUpload = async (files) => {
    if (!files?.length) return;
    if (!isEditMode) {
      alert('Please save the consumable first before uploading photos');
      return;
    }

    setUploadingPhoto(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`${file.name} exceeds 50MB limit`);
          continue;
        }
        await assetService.files.uploadAssetFile({
          assetId: id,
          file,
          fileCategory: 'photo',
          description: `Photo: ${file.name}`
        });
      }
      
      // Reload photos
      const photoFiles = await assetService.files.listAssetPhotos(id);
      setPhotos(photoFiles || []);
    } catch (e) {
      console.error('Photo upload failed:', e);
      alert('Photo upload failed: ' + (e?.message || 'Error'));
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
    }
  };

  const handleDocumentUpload = async (files) => {
    if (!files?.length) return;
    if (!isEditMode) {
      alert('Please save the consumable first before uploading documents');
      return;
    }

    setUploadingDoc(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`${file.name} exceeds 50MB limit`);
          continue;
        }
        await assetService.files.uploadAssetFile({
          assetId: id,
          file,
          fileCategory: 'document',
          description: `Document: ${file.name}`
        });
      }
      
      // Reload documents
      const docFiles = await assetService.files.listAssetDocuments(id);
      setDocuments(docFiles || []);
    } catch (e) {
      console.error('Document upload failed:', e);
      alert('Document upload failed: ' + (e?.message || 'Error'));
    } finally {
      setUploadingDoc(false);
      if (docInputRef.current) {
        docInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Delete this file?')) return;
    
    try {
      await assetService.files.deleteFile(fileId);
      
      // Reload files
      const [photoFiles, docFiles] = await Promise.all([
        assetService.files.listAssetPhotos(id).catch(() => []),
        assetService.files.listAssetDocuments(id).catch(() => [])
      ]);
      setPhotos(photoFiles || []);
      setDocuments(docFiles || []);
    } catch (e) {
      console.error('Failed to delete file:', e);
      alert('Failed to delete file');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  const consumableSubcategories = assetService.helpers.getConsumableSubcategories();
  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'out_of_stock', label: 'Out of Stock' },
    { value: 'retired', label: 'Retired' },
    { value: 'disposed', label: 'Disposed' }
  ];

  const stockStatus = isEditMode ? assetService.helpers.formatStockStatus({
    current_stock: formData.current_stock,
    minimum_stock: formData.minimum_stock
  }) : null;

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '1rem' 
      }}>
        
        {/* Back button */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={() => navigate('/assets')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={16} /> Back to Assets
          </button>
        </div>

        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: '1.5rem', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Package size={24} color="#10b981" /> {isEditMode ? 'Edit Consumable' : 'New Consumable'}
            </h1>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: saving ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                <Save size={16} /> {saving ? 'Saving...' : 'Save'}
              </button>
              
              {isEditMode && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: deleting ? '#fca5a5' : '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  <Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ 
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Stock Alert */}
        {showStockAlert && isEditMode && (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <AlertTriangle size={20} color="#f59e0b" />
            <div>
              <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.25rem' }}>
                {stockStatus?.icon} {stockStatus?.label}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
                Current stock ({formData.current_stock} {formData.unit_of_measure}) is at or below minimum level 
                ({formData.minimum_stock} {formData.unit_of_measure}). Consider reordering.
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation - Only show in edit mode */}
        {isEditMode && (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '0',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              borderBottom: '1px solid #f3f4f6'
            }}>
              <TabButton 
                label="Details" 
                icon={<Package size={16} />}
                active={activeTab === 'details'} 
                onClick={() => setActiveTab('details')} 
              />
              <TabButton 
                label="Stock Movements" 
                icon={<TrendingUp size={16} />}
                active={activeTab === 'stock_movements'} 
                onClick={() => setActiveTab('stock_movements')} 
              />
              {formData.requires_maintenance && (
                <TabButton 
                  label="Maintenance" 
                  icon={<FileText size={16} />}
                  active={activeTab === 'maintenance'} 
                  onClick={() => setActiveTab('maintenance')} 
                />
              )}
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'details' && (
          <>
            {/* Basic Information */}
            <FormSection title="Basic Information" icon={<Package size={18} color="#10b981" />}>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                <FormField label="Product Code" required>
                  <input
                    type="text"
                    value={formData.asset_number}
                    onChange={(e) => handleChange('asset_number', e.target.value)}
                    placeholder="e.g., CONS-001"
                    disabled={isEditMode}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: isEditMode ? '#f3f4f6' : 'white'
                    }}
                  />
                </FormField>

                <FormField label="Product Name" required>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g., Roundup 360"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Category">
                  <select
                    value={formData.subcategory}
                    onChange={(e) => handleChange('subcategory', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                  >
                    {consumableSubcategories.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Status">
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Storage Location">
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    placeholder="e.g., Chemical Store A"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>
              </div>

              <FormField label="Description">
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Description of the consumable..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit'
                  }}
                />
              </FormField>
            </FormSection>

            {/* Stock Management */}
            <FormSection title="Stock Management" icon={<Droplet size={18} color="#10b981" />}>
              {isEditMode && stockStatus && (
                <div style={{
                  padding: '0.75rem',
                  background: stockStatus.color === 'green' ? '#dcfce7' : stockStatus.color === 'orange' ? '#fef3c7' : '#fef2f2',
                  border: `1px solid ${stockStatus.color === 'green' ? '#22c55e' : stockStatus.color === 'orange' ? '#fbbf24' : '#fca5a5'}`,
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.25rem' }}>{stockStatus.icon}</span>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>
                      Stock Status: {stockStatus.label}
                    </div>
                    {stockStatus.needs_reorder && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        Consider reordering to maintain adequate stock levels
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <FormField label="Unit of Measure" required>
                  <select
                    value={formData.unit_of_measure}
                    onChange={(e) => handleChange('unit_of_measure', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                  >
                    <option value="L">Litres (L)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g)</option>
                    <option value="units">Units</option>
                    <option value="bags">Bags</option>
                    <option value="bottles">Bottles</option>
                  </select>
                </FormField>

                <FormField label="Current Stock" required>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.current_stock}
                      onChange={(e) => handleChange('current_stock', e.target.value)}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '40px' }}>
                      {formData.unit_of_measure}
                    </span>
                  </div>
                </FormField>

                <FormField label="Minimum Stock (Reorder Level)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimum_stock}
                      onChange={(e) => handleChange('minimum_stock', e.target.value)}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '40px' }}>
                      {formData.unit_of_measure}
                    </span>
                  </div>
                </FormField>

                <FormField label="Maximum Stock">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.maximum_stock}
                      onChange={(e) => handleChange('maximum_stock', e.target.value)}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '40px' }}>
                      {formData.unit_of_measure}
                    </span>
                  </div>
                </FormField>

                <FormField label="Cost per Unit (NZD)">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost_per_unit}
                    onChange={(e) => handleChange('cost_per_unit', e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>
              </div>
            </FormSection>

            {/* Chemical/Fertilizer Compliance */}
            <FormSection title="Compliance & Registration" icon={<FileText size={18} color="#10b981" />}>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                <FormField label="Active Ingredient">
                  <input
                    type="text"
                    value={formData.active_ingredient}
                    onChange={(e) => handleChange('active_ingredient', e.target.value)}
                    placeholder="e.g., Glyphosate"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Concentration">
                  <input
                    type="text"
                    value={formData.concentration}
                    onChange={(e) => handleChange('concentration', e.target.value)}
                    placeholder="e.g., 360 g/L"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Application Rate Min (per ha)">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.application_rate_min}
                    onChange={(e) => handleChange('application_rate_min', e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Application Rate Max (per ha)">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.application_rate_max}
                    onChange={(e) => handleChange('application_rate_max', e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Withholding Period (days)">
                  <input
                    type="number"
                    min="0"
                    value={formData.withholding_period_days}
                    onChange={(e) => handleChange('withholding_period_days', e.target.value)}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="ACVM Registration Number">
                  <input
                    type="text"
                    value={formData.registration_number}
                    onChange={(e) => handleChange('registration_number', e.target.value)}
                    placeholder="e.g., ACVM12345"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Registration Expiry">
                  <input
                    type="date"
                    value={formData.registration_expiry}
                    onChange={(e) => handleChange('registration_expiry', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Safety Data Sheet URL">
                  <input
                    type="url"
                    value={formData.safety_data_sheet_url}
                    onChange={(e) => handleChange('safety_data_sheet_url', e.target.value)}
                    placeholder="https://..."
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>
              </div>
            </FormSection>

            {/* Certification Schemes */}
            <FormSection title="Certification Schemes" icon={<CheckCircle size={18} color="#10b981" />}>
              <div style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.813rem',
                color: '#0c4a6e'
              }}>
                Select which certification schemes this product is approved for
              </div>

              <div style={{ 
                display: 'grid', 
                gap: '0.75rem', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' 
              }}>
                {assetService.helpers.getCertificationSchemes().map(scheme => (
                  <label
                    key={scheme.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      border: formData.certified_for[scheme.value] ? `2px solid ${scheme.color === 'green' ? '#22c55e' : scheme.color === 'emerald' ? '#10b981' : scheme.color === 'purple' ? '#a855f7' : '#3b82f6'}` : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: formData.certified_for[scheme.value] ? (scheme.color === 'green' ? '#dcfce7' : scheme.color === 'emerald' ? '#d1fae5' : scheme.color === 'purple' ? '#f3e8ff' : '#dbeafe') : 'white',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.certified_for[scheme.value] || false}
                      onChange={(e) => handleCertificationChange(scheme.value, e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <span>{scheme.icon}</span>
                        {scheme.label}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                        {scheme.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Show selected certifications summary */}
              {Object.values(formData.certified_for).some(v => v) && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  background: '#dcfce7',
                  border: '1px solid #22c55e',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem', color: '#166534' }}>
                    ✅ Certified For:
                  </div>
                  <div style={{ fontSize: '0.813rem', color: '#166534' }}>
                    {assetService.helpers.getCertificationSchemes()
                      .filter(s => formData.certified_for[s.value])
                      .map(s => s.label)
                      .join(', ')}
                  </div>
                </div>
              )}
            </FormSection>

            {/* Storage & Handling */}
            <FormSection title="Storage & Handling" icon={<Package size={18} color="#10b981" />}>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.batch_tracking_required}
                    onChange={(e) => handleChange('batch_tracking_required', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    Batch tracking required
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.expiry_tracking_required}
                    onChange={(e) => handleChange('expiry_tracking_required', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    Expiry tracking required
                  </span>
                </label>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <FormField label="Storage Requirements">
                  <textarea
                    rows={2}
                    value={formData.storage_requirements.notes || ''}
                    onChange={(e) => handleChange('storage_requirements', { 
                      ...formData.storage_requirements, 
                      notes: e.target.value 
                    })}
                    placeholder="e.g., Store in cool, dry place. Keep away from direct sunlight. Temperature: 5-25°C"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit'
                    }}
                  />
                </FormField>
              </div>
            </FormSection>

            {/* Photos */}
            {isEditMode && (
              <FormSection 
                title="Photos" 
                icon={<Camera size={18} />}
                action={
                  <>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => handlePhotoUpload(Array.from(e.target.files || []))}
                    />
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: uploadingPhoto ? '#9ca3af' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: uploadingPhoto ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      <Camera size={16} /> {uploadingPhoto ? 'Uploading...' : 'Add Photos'}
                    </button>
                  </>
                }
              >
                {photos.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '2rem', 
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    No photos uploaded yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {photos.map(photo => (
                      <PhotoThumbnail
                        key={photo.id}
                        photo={photo}
                        onDelete={handleDeleteFile}
                      />
                    ))}
                  </div>
                )}
              </FormSection>
            )}

            {/* Documents */}
            {isEditMode && (
              <FormSection 
                title="Documents" 
                icon={<FileText size={18} />}
                action={
                  <>
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.csv"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => handleDocumentUpload(Array.from(e.target.files || []))}
                    />
                    <button
                      onClick={() => docInputRef.current?.click()}
                      disabled={uploadingDoc}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: uploadingDoc ? '#9ca3af' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      <FileText size={16} /> {uploadingDoc ? 'Uploading...' : 'Add Documents'}
                    </button>
                  </>
                }
              >
                {documents.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '2rem', 
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    No documents uploaded yet
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {documents.map(doc => (
                      <DocumentItem
                        key={doc.id}
                        document={doc}
                        onDelete={handleDeleteFile}
                      />
                    ))}
                  </div>
                )}
              </FormSection>
            )}
          </>
        )}

        {/* Stock Movements Tab */}
        {activeTab === 'stock_movements' && isEditMode && (
          <StockMovementInlineManager
            assetId={id}
            inline={true}
            onStockUpdate={loadConsumable}
          />
        )}

        {/* Maintenance Tab */}
        {activeTab === 'maintenance' && isEditMode && formData.requires_maintenance && (
          <MaintenanceTable assetId={id} />
        )}

        <MobileNavigation />
      </div>
    </div>
  );
}

// Helper Components
function TabButton({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '1rem',
        border: 'none',
        background: active ? '#f8fafc' : 'white',
        borderBottom: active ? '2px solid #10b981' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: active ? '#10b981' : '#6b7280',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem'
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function FormSection({ title, icon, action, children }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.25rem',
      marginBottom: '1.5rem',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h3 style={{ 
          margin: 0, 
          fontSize: '1rem', 
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <label>
      <div style={{ 
        marginBottom: '0.5rem', 
        fontSize: '0.875rem', 
        fontWeight: '500', 
        color: '#374151' 
      }}>
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
      </div>
      {children}
    </label>
  );
}

function PhotoThumbnail({ photo, onDelete }) {
  const [enlarged, setEnlarged] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = await assetService.files.getObjectUrl(photo.id);
        if (alive) setPreviewUrl(url);
      } catch {}
    })();
    return () => {
      alive = false;
      if (previewUrl) assetService.files.revokeObjectUrl(previewUrl);
    };
  }, [photo.id])

  return (
    <>
      <div style={{ 
        position: 'relative', 
        width: '100px', 
        height: '100px', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        border: '1px solid #e5e7eb',
        cursor: 'pointer'
      }}>
        <img 
          src={previewUrl || ''}
          alt={photo.description || 'Consumable photo'} 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover' 
          }} 
          onClick={() => setEnlarged(true)}
          title="Click to enlarge"
        />
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            if (window.confirm('Delete this photo?')) onDelete(photo.id); 
          }} 
          style={{ 
            position: 'absolute', 
            top: 4, 
            right: 4, 
            background: 'rgba(220, 38, 38, 0.9)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '50%', 
            width: 24, 
            height: 24, 
            fontSize: 14, 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }} 
          title="Delete photo"
        >
          ×
        </button>
      </div>

      {enlarged && (
        <div 
          onClick={() => setEnlarged(false)}
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.9)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: 20, 
            zIndex: 9999
          }}
        >
          <img 
            src={previewUrl || ''}
            alt={photo.description || 'Consumable photo'} 
            style={{ 
              maxWidth: '90vw', 
              maxHeight: '90vh', 
              borderRadius: 8 
            }} 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function DocumentItem({ document, onDelete }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
        <FileText size={20} color="#6b7280" />
        <div>
          <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>
            {document.original_filename}
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
            {document.mime_type} • {Math.round(document.file_size / 1024)} KB
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={async () => {
            const blob = await assetService.files.downloadBlob(document.id);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }}
          style={{
            padding: '0.25rem 0.75rem',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.75rem'
          }}
        >
          View
        </button>
        <button
          onClick={() => {
            if (window.confirm('Delete this document?')) onDelete(document.id);
          }}
          style={{
            padding: '0.25rem 0.75rem',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.75rem'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Missing import
import { CheckCircle } from 'lucide-react';