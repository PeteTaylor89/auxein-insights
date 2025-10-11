// packages/mobile/src/pages/AssetForm.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Trash2,
  Camera,
  FileText,
  AlertCircle,
  Settings,
  Wrench,
  Calendar
} from 'lucide-react';
import { assetService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import CalibrationInlineManager from '../components/CalibrationInlineManager';
import MaintenanceTable from '../components/MaintenanceTable';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export default function AssetForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const companyId = authService.getCompanyId();

  // Form state
  const [formData, setFormData] = useState({
    asset_number: '',
    name: '',
    description: '',
    category: 'equipment',
    subcategory: '',
    asset_type: 'physical',
    make: '',
    model: '',
    serial_number: '',
    year_manufactured: '',
    specifications: {},
    purchase_date: '',
    purchase_price: '',
    current_value: '',
    status: 'active',
    location: '',
    requires_calibration: false,
    calibration_interval_days: '',
    requires_maintenance: false,
    maintenance_interval_days: '',
    maintenance_interval_hours: '',
    current_hours: '',
    current_kilometers: '',
    insurance_expiry: '',
    wof_due: '',
    registration_expiry: '',
    fuel_type: '',
    fuel_efficiency_standard: ''
  });

  // UI state
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details'); // details, calibration, maintenance

  // Photos and documents
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);

  // Calibration modal
  const [showCalibrationManager, setShowCalibrationManager] = useState(false);

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  // Load asset data in edit mode
  useEffect(() => {
    if (isEditMode) {
      loadAsset();
    }
  }, [id]);

  const loadAsset = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const asset = await assetService.getAsset(id);
      
      // Populate form
      setFormData({
        asset_number: asset.asset_number || '',
        name: asset.name || '',
        description: asset.description || '',
        category: asset.category || 'equipment',
        subcategory: asset.subcategory || '',
        asset_type: asset.asset_type || 'physical',
        make: asset.make || '',
        model: asset.model || '',
        serial_number: asset.serial_number || '',
        year_manufactured: asset.year_manufactured || '',
        specifications: asset.specifications || {},
        purchase_date: asset.purchase_date || '',
        purchase_price: asset.purchase_price || '',
        current_value: asset.current_value || '',
        status: asset.status || 'active',
        location: asset.location || '',
        requires_calibration: asset.requires_calibration || false,
        calibration_interval_days: asset.calibration_interval_days || '',
        requires_maintenance: asset.requires_maintenance || false,
        maintenance_interval_days: asset.maintenance_interval_days || '',
        maintenance_interval_hours: asset.maintenance_interval_hours || '',
        current_hours: asset.current_hours || '',
        current_kilometers: asset.current_kilometers || '',
        insurance_expiry: asset.insurance_expiry || '',
        wof_due: asset.wof_due || '',
        registration_expiry: asset.registration_expiry || '',
        fuel_type: asset.fuel_type || '',
        fuel_efficiency_standard: asset.fuel_efficiency_standard || ''
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
      console.error('Failed to load asset:', e);
      setError('Failed to load asset details');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        setError('Asset name is required');
        return;
      }

      const sanitizePayload = (data) =>
        Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
        );

      const payload = sanitizePayload({
        ...formData,
        year_manufactured: formData.year_manufactured ? Number(formData.year_manufactured) : null,
        purchase_price: formData.purchase_price ? Number(formData.purchase_price) : null,
        current_value: formData.current_value ? Number(formData.current_value) : null,
        calibration_interval_days: formData.calibration_interval_days ? Number(formData.calibration_interval_days) : null,
        maintenance_interval_days: formData.maintenance_interval_days ? Number(formData.maintenance_interval_days) : null,
        maintenance_interval_hours: formData.maintenance_interval_hours ? Number(formData.maintenance_interval_hours) : null,
        current_hours: formData.current_hours ? Number(formData.current_hours) : null,
        current_kilometers: formData.current_kilometers ? Number(formData.current_kilometers) : null,
        fuel_efficiency_standard: formData.fuel_efficiency_standard ? Number(formData.fuel_efficiency_standard) : null
      });

      let savedAsset;
      if (isEditMode) {
        savedAsset = await assetService.updateAsset(id, payload);
      } else {
        savedAsset = await assetService.createAsset(payload);
      }

      // Navigate to detail page
      navigate(`/assets/equipment/${savedAsset.id}`);
    } catch (e) {
      console.error('Failed to save asset:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save asset';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save asset' : detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(true);
      await assetService.deleteAsset(id);
      navigate('/assets');
    } catch (e) {
      console.error('Failed to delete asset:', e);
      alert('Failed to delete asset: ' + (e?.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  const handlePhotoUpload = async (files) => {
    if (!files?.length) return;
    if (!isEditMode) {
      alert('Please save the asset first before uploading photos');
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
      alert('Please save the asset first before uploading documents');
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

  const categoryOptions = assetService.helpers.getAssetCategories();
  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'maintenance', label: 'In Maintenance' },
    { value: 'retired', label: 'Retired' },
    { value: 'disposed', label: 'Disposed' }
  ];

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
              <Settings size={24} /> {isEditMode ? 'Edit Equipment' : 'New Equipment'}
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
                  background: saving ? '#9ca3af' : '#3b82f6',
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
                icon={<Settings size={16} />}
                active={activeTab === 'details'} 
                onClick={() => setActiveTab('details')} 
              />
              {formData.requires_calibration && (
                <TabButton 
                  label="Calibration" 
                  icon={<Settings size={16} />}
                  active={activeTab === 'calibration'} 
                  onClick={() => setActiveTab('calibration')} 
                />
              )}
              <TabButton 
                label="Maintenance" 
                icon={<Wrench size={16} />}
                active={activeTab === 'maintenance'} 
                onClick={() => setActiveTab('maintenance')} 
              />
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'details' && (
          <>
            {/* Basic Information */}
            <FormSection title="Basic Information">
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                <FormField label="Asset Number" required>
                  <input
                    type="text"
                    value={formData.asset_number}
                    onChange={(e) => handleChange('asset_number', e.target.value)}
                    placeholder="e.g., EQ-001"
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

                <FormField label="Asset Name" required>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g., John Deere Tractor"
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
                    value={formData.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                  >
                    {categoryOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
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
              </div>

              <FormField label="Description">
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Description of the asset..."
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

            {/* Technical Specifications */}
            <FormSection title="Technical Specifications">
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <FormField label="Make">
                  <input
                    type="text"
                    value={formData.make}
                    onChange={(e) => handleChange('make', e.target.value)}
                    placeholder="e.g., John Deere"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Model">
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => handleChange('model', e.target.value)}
                    placeholder="e.g., 6155M"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Serial Number">
                  <input
                    type="text"
                    value={formData.serial_number}
                    onChange={(e) => handleChange('serial_number', e.target.value)}
                    placeholder="Serial number"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Year Manufactured">
                  <input
                    type="number"
                    value={formData.year_manufactured}
                    onChange={(e) => handleChange('year_manufactured', e.target.value)}
                    placeholder="2020"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Location">
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    placeholder="e.g., Main Shed"
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

            {/* Financial Information */}
            <FormSection title="Financial Information">
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <FormField label="Purchase Date">
                  <input
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => handleChange('purchase_date', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </FormField>

                <FormField label="Purchase Price (NZD)">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.purchase_price}
                    onChange={(e) => handleChange('purchase_price', e.target.value)}
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

                <FormField label="Current Value (NZD)">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.current_value}
                    onChange={(e) => handleChange('current_value', e.target.value)}
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

            {/* Calibration Settings */}
            <FormSection title="Calibration Settings">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  id="requires_calibration"
                  checked={formData.requires_calibration}
                  onChange={(e) => handleChange('requires_calibration', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="requires_calibration" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                  This equipment requires calibration
                </label>
              </div>

              {formData.requires_calibration && (
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                  <FormField label="Calibration Interval (days)">
                    <input
                      type="number"
                      value={formData.calibration_interval_days}
                      onChange={(e) => handleChange('calibration_interval_days', e.target.value)}
                      placeholder="e.g., 30"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </FormField>

                  {isEditMode && (
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        onClick={() => setShowCalibrationManager(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 1rem',
                          background: '#059669',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '500'
                        }}
                      >
                        <Settings size={16} /> Manage Calibrations
                      </button>
                    </div>
                  )}
                </div>
              )}
            </FormSection>

            {/* Maintenance Settings */}
            <FormSection title="Maintenance Settings">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  id="requires_maintenance"
                  checked={formData.requires_maintenance}
                  onChange={(e) => handleChange('requires_maintenance', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="requires_maintenance" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                  This equipment requires regular maintenance
                </label>
              </div>

              {formData.requires_maintenance && (
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <FormField label="Maintenance Interval (days)">
                    <input
                      type="number"
                      value={formData.maintenance_interval_days}
                      onChange={(e) => handleChange('maintenance_interval_days', e.target.value)}
                      placeholder="e.g., 90"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </FormField>

                  <FormField label="Maintenance Interval (hours)">
                    <input
                      type="number"
                      value={formData.maintenance_interval_hours}
                      onChange={(e) => handleChange('maintenance_interval_hours', e.target.value)}
                      placeholder="e.g., 250"
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
              )}
            </FormSection>

            {/* Usage Tracking */}
            {formData.category === 'equipment' || formData.category === 'vehicle' && (
              <FormSection title="Usage Tracking">
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <FormField label="Current Hours">
                    <input
                      type="number"
                      step="0.1"
                      value={formData.current_hours}
                      onChange={(e) => handleChange('current_hours', e.target.value)}
                      placeholder="0.0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </FormField>

                  <FormField label="Current Kilometers">
                    <input
                      type="number"
                      step="0.1"
                      value={formData.current_kilometers}
                      onChange={(e) => handleChange('current_kilometers', e.target.value)}
                      placeholder="0.0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </FormField>

                  <FormField label="Fuel Type">
                    <select
                      value={formData.fuel_type}
                      onChange={(e) => handleChange('fuel_type', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: 'white'
                      }}
                    >
                      <option value="">Select fuel type</option>
                      <option value="diesel">Diesel</option>
                      <option value="petrol">Petrol</option>
                      <option value="electric">Electric</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </FormField>

                  <FormField label="Fuel Efficiency Standard (L/hr or L/100km)">
                    <input
                      type="number"
                      step="0.1"
                      value={formData.fuel_efficiency_standard}
                      onChange={(e) => handleChange('fuel_efficiency_standard', e.target.value)}
                      placeholder="0.0"
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
            )}

            {/* Vehicle Compliance */}
            {formData.category === 'vehicle' && (
              <FormSection title="Vehicle Compliance">
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <FormField label="WOF Due Date">
                    <input
                      type="date"
                      value={formData.wof_due}
                      onChange={(e) => handleChange('wof_due', e.target.value)}
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

                  <FormField label="Insurance Expiry">
                    <input
                      type="date"
                      value={formData.insurance_expiry}
                      onChange={(e) => handleChange('insurance_expiry', e.target.value)}
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
            )}

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
                        background: uploadingPhoto ? '#9ca3af' : '#3b82f6',
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
                        background: uploadingDoc ? '#9ca3af' : '#3b82f6',
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

        {/* Calibration Tab */}
        {activeTab === 'calibration' && isEditMode && formData.requires_calibration && (
          <CalibrationInlineManager
            assetId={id}
            inline={true}
          />
        )}

        {/* Maintenance Tab */}
        {activeTab === 'maintenance' && isEditMode && (
          <MaintenanceTable assetId={id} />
        )}

        {/* Calibration Manager Modal */}
        {showCalibrationManager && (
          <CalibrationInlineManager
            assetId={id}
            onClose={() => setShowCalibrationManager(false)}
          />
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
        borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: active ? '#3b82f6' : '#6b7280',
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
          src={assetService.files.getFileDownloadUrl(photo)}
          alt={photo.description || 'Asset photo'} 
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
            src={assetService.files.getFileDownloadUrl(photo)}
            alt={photo.description || 'Asset photo'} 
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
          onClick={() => window.open(assetService.files.getFileDownloadUrl(document), '_blank')}
          style={{
            padding: '0.25rem 0.75rem',
            background: '#3b82f6',
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