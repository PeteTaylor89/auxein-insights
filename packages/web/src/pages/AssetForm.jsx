// packages/web/src/pages/AssetForm.jsx
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
import { assetService, authService, propertyService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import CalibrationInlineManager from '../components/CalibrationInlineManager';
import MaintenanceTable from '../components/MaintenanceTable';
import MaintenanceInlineManager from '../components/MaintenanceInlineManager';
import RiskLocationMap from '../components/RiskLocationMap';
import './AssetForm.css';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export default function AssetForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const companyId = authService.getCompanyId();

  const [formData, setFormData] = useState({
    asset_number: '', name: '', description: '', category: 'equipment',
    subcategory: '', asset_type: 'physical', make: '', model: '',
    serial_number: '', year_manufactured: '', specifications: {},
    purchase_date: '', purchase_price: '', current_value: '',
    status: 'active', location_label: '', latitude: '', longitude: '',
    location_geojson: null, requires_calibration: false,
    calibration_interval_days: '', requires_maintenance: false,
    maintenance_interval_days: '', maintenance_interval_hours: '',
    current_hours: '', current_kilometers: '', insurance_expiry: '',
    wof_due: '', registration_expiry: '', fuel_type: '',
    fuel_efficiency_standard: '', property_id: ''
  });
  const [properties, setProperties] = useState([]);

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const [showCalibrationManager, setShowCalibrationManager] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);

  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => document.body.classList.remove("primary-bg");
  }, []);

  useEffect(() => {
    propertyService.listProperties().then(res => setProperties(Array.isArray(res) ? res : [])).catch(() => setProperties([]));
    if (isEditMode) loadAsset();
  }, [id]);

  const loadAsset = async () => {
    try {
      setLoading(true);
      setError(null);
      const asset = await assetService.getAsset(id);
      setFormData({
        asset_number: asset.asset_number || '', name: asset.name || '',
        description: asset.description || '', category: asset.category || 'equipment',
        subcategory: asset.subcategory || '', asset_type: asset.asset_type || 'physical',
        make: asset.make || '', model: asset.model || '',
        serial_number: asset.serial_number || '',
        year_manufactured: asset.year_manufactured || '',
        specifications: asset.specifications || {},
        purchase_date: asset.purchase_date || '',
        purchase_price: asset.purchase_price || '',
        current_value: asset.current_value || '', status: asset.status || 'active',
        location_label: asset.location_label || '',
        latitude: asset.latitude || '', longitude: asset.longitude || '',
        location_geojson: asset.location_geojson || null,
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
        fuel_efficiency_standard: asset.fuel_efficiency_standard || '',
        property_id: asset.property_id ?? ''
      });
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
      if (!formData.asset_number.trim()) { setError('Asset number is required'); return; }
      if (!formData.name.trim()) { setError('Asset name is required'); return; }

      const sanitizePayload = (data) =>
        Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));

      const payload = sanitizePayload({
        ...formData,
        property_id: formData.property_id ? Number(formData.property_id) : null,
        year_manufactured: formData.year_manufactured ? Number(formData.year_manufactured) : null,
        purchase_price: formData.purchase_price ? Number(formData.purchase_price) : null,
        current_value: formData.current_value ? Number(formData.current_value) : null,
        calibration_interval_days: formData.calibration_interval_days ? Number(formData.calibration_interval_days) : null,
        maintenance_interval_days: formData.maintenance_interval_days ? Number(formData.maintenance_interval_days) : null,
        maintenance_interval_hours: formData.maintenance_interval_hours ? Number(formData.maintenance_interval_hours) : null,
        current_hours: formData.current_hours ? Number(formData.current_hours) : null,
        current_kilometers: formData.current_kilometers ? Number(formData.current_kilometers) : null,
        fuel_efficiency_standard: formData.fuel_efficiency_standard ? Number(formData.fuel_efficiency_standard) : null,
        latitude: formData.latitude ? Number(formData.latitude) : null,
        longitude: formData.longitude ? Number(formData.longitude) : null,
      });

      if (isEditMode) {
        await assetService.updateAsset(id, payload);
      } else {
        await assetService.createAsset(payload);
      }
      navigate(`/assets`);
    } catch (e) {
      console.error('Failed to save asset:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save asset';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save asset' : detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) return;
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
    if (!isEditMode) { alert('Please save the asset first before uploading photos'); return; }
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; }
        await assetService.files.uploadAssetFile({ assetId: parseInt(id), file, fileCategory: 'photo', description: `Photo: ${file.name}` });
      }
      const photoFiles = await assetService.files.listAssetPhotos(id);
      setPhotos(photoFiles || []);
    } catch (e) {
      console.error('Photo upload failed:', e);
      alert('Photo upload failed: ' + (e?.response?.data?.detail || e?.message || 'Error'));
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleDocumentUpload = async (files) => {
    if (!files?.length) return;
    if (!isEditMode) { alert('Please save the asset first before uploading documents'); return; }
    setUploadingDoc(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; }
        await assetService.files.uploadAssetFile({ assetId: parseInt(id), file, fileCategory: 'document', description: `Document: ${file.name}` });
      }
      const docFiles = await assetService.files.listAssetDocuments(id);
      setDocuments(docFiles || []);
    } catch (e) {
      console.error('Document upload failed:', e);
      alert('Document upload failed: ' + (e?.response?.data?.detail || e?.message || 'Error'));
    } finally {
      setUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Delete this file?')) return;
    try {
      await assetService.files.deleteFile(fileId);
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
      <div className="page-container">
        <div className="af-loading"><h2>Loading...</h2></div>
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
    <div className="page-container">
        <button className="af-back" onClick={() => navigate('/assets')}>
          <ArrowLeft size={16} /> Back to Assets
        </button>

        <div className="af-header">
          <h1><Settings size={24} /> {isEditMode ? 'Edit Equipment' : 'New Equipment'}</h1>
          <div className="af-header-actions">
            <button className="af-btn-save" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save'}
            </button>
            {isEditMode && (
              <button className="af-btn-delete" onClick={handleDelete} disabled={deleting}>
                <Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="af-error">
            <AlertCircle size={20} /> {error}
          </div>
        )}

        {isEditMode && (
          <div className="af-tab-card">
            <div className="af-tab-bar">
              <button className={`af-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
                <Settings size={16} /> Details
              </button>
              {formData.requires_calibration && (
                <button className={`af-tab ${activeTab === 'calibration' ? 'active' : ''}`} onClick={() => setActiveTab('calibration')}>
                  <Settings size={16} /> Calibration
                </button>
              )}
              <button className={`af-tab ${activeTab === 'maintenance' ? 'active' : ''}`} onClick={() => setActiveTab('maintenance')}>
                <Wrench size={16} /> Maintenance
              </button>
            </div>
          </div>
        )}

        {activeTab === 'details' && (
          <>
            <FormSection title="Basic Information">
              <div className="af-form-grid">
                <FormField label="Asset Number" required>
                  <input className="af-input" type="text" value={formData.asset_number} onChange={(e) => handleChange('asset_number', e.target.value)} placeholder="e.g., EQ-001" disabled={isEditMode} />
                </FormField>
                <FormField label="Asset Name" required>
                  <input className="af-input" type="text" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="e.g., John Deere Tractor" />
                </FormField>
                <FormField label="Category">
                  <select className="af-select" value={formData.category} onChange={(e) => handleChange('category', e.target.value)}>
                    {categoryOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </FormField>
                <FormField label="Status">
                  <select className="af-select" value={formData.status} onChange={(e) => handleChange('status', e.target.value)}>
                    {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </FormField>
                <FormField label="Property">
                  <select className="af-select" value={formData.property_id} onChange={(e) => handleChange('property_id', e.target.value)}>
                    <option value="">Company-wide</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Description">
                <textarea className="af-textarea" rows={3} value={formData.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Description of the asset..." />
              </FormField>
            </FormSection>

            <FormSection title="Technical Specifications">
              <div className="af-form-grid af-form-grid--narrow">
                <FormField label="Make">
                  <input className="af-input" type="text" value={formData.make} onChange={(e) => handleChange('make', e.target.value)} placeholder="e.g., John Deere" />
                </FormField>
                <FormField label="Model">
                  <input className="af-input" type="text" value={formData.model} onChange={(e) => handleChange('model', e.target.value)} placeholder="e.g., 6155M" />
                </FormField>
                <FormField label="Serial Number">
                  <input className="af-input" type="text" value={formData.serial_number} onChange={(e) => handleChange('serial_number', e.target.value)} placeholder="Serial number" />
                </FormField>
                <FormField label="Year Manufactured">
                  <input className="af-input" type="number" value={formData.year_manufactured} onChange={(e) => handleChange('year_manufactured', e.target.value)} placeholder="2020" />
                </FormField>
                <FormField label="Location">
                  <input className="af-input" type="text" value={formData.location_label} onChange={(e) => handleChange('location_label', e.target.value)} placeholder="e.g., Main Shed" />
                </FormField>
              </div>
              <div className="af-location-row">
                <button className="af-btn-action" type="button" onClick={() => setShowLocationMap(true)}>
                  {formData.latitude ? 'Change Location on Map' : 'Set Location on Map'}
                </button>
                {formData.latitude && formData.longitude && (
                  <span className="af-location-info">
                    {formData.location_geojson?.type === 'LineString'
                      ? `Line (${formData.location_geojson.coordinates.length} pts)`
                      : formData.location_geojson?.type === 'Polygon'
                      ? 'Area polygon'
                      : `${Number(formData.latitude).toFixed(5)}, ${Number(formData.longitude).toFixed(5)}`}
                  </span>
                )}
                {formData.latitude && (
                  <button className="af-btn-ghost" type="button" onClick={() => { handleChange('latitude', ''); handleChange('longitude', ''); handleChange('location_geojson', null); }}>
                    Clear
                  </button>
                )}
              </div>
            </FormSection>

            <FormSection title="Financial Information">
              <div className="af-form-grid af-form-grid--narrow">
                <FormField label="Purchase Date">
                  <input className="af-input" type="date" value={formData.purchase_date} onChange={(e) => handleChange('purchase_date', e.target.value)} />
                </FormField>
                <FormField label="Purchase Price (NZD)">
                  <input className="af-input" type="number" step="0.01" value={formData.purchase_price} onChange={(e) => handleChange('purchase_price', e.target.value)} placeholder="0.00" />
                </FormField>
                <FormField label="Current Value (NZD)">
                  <input className="af-input" type="number" step="0.01" value={formData.current_value} onChange={(e) => handleChange('current_value', e.target.value)} placeholder="0.00" />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Calibration Settings">
              <div className="af-checkbox-row">
                <input type="checkbox" id="requires_calibration" checked={formData.requires_calibration} onChange={(e) => handleChange('requires_calibration', e.target.checked)} />
                <label htmlFor="requires_calibration">This equipment requires calibration</label>
              </div>
              {formData.requires_calibration && (
                <div className="af-form-grid">
                  <FormField label="Calibration Interval (days)">
                    <input className="af-input" type="number" value={formData.calibration_interval_days} onChange={(e) => handleChange('calibration_interval_days', e.target.value)} placeholder="e.g., 30" />
                  </FormField>
                  {isEditMode && (
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button className="af-btn-success" onClick={() => setShowCalibrationManager(true)}>
                        <Settings size={16} /> Manage Calibrations
                      </button>
                    </div>
                  )}
                </div>
              )}
            </FormSection>

            {formData.category === 'equipment' || formData.category === 'vehicle' && (
              <FormSection title="Usage Tracking">
                <div className="af-form-grid af-form-grid--narrow">
                  <FormField label="Current Hours">
                    <input className="af-input" type="number" step="0.1" value={formData.current_hours} onChange={(e) => handleChange('current_hours', e.target.value)} placeholder="0.0" />
                  </FormField>
                  <FormField label="Current Kilometers">
                    <input className="af-input" type="number" step="0.1" value={formData.current_kilometers} onChange={(e) => handleChange('current_kilometers', e.target.value)} placeholder="0.0" />
                  </FormField>
                  <FormField label="Fuel Type">
                    <select className="af-select" value={formData.fuel_type} onChange={(e) => handleChange('fuel_type', e.target.value)}>
                      <option value="">Select fuel type</option>
                      <option value="diesel">Diesel</option>
                      <option value="petrol">Petrol</option>
                      <option value="electric">Electric</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </FormField>
                  <FormField label="Fuel Efficiency Standard (L/hr or L/100km)">
                    <input className="af-input" type="number" step="0.1" value={formData.fuel_efficiency_standard} onChange={(e) => handleChange('fuel_efficiency_standard', e.target.value)} placeholder="0.0" />
                  </FormField>
                </div>
              </FormSection>
            )}

            {formData.category === 'vehicle' && (
              <FormSection title="Vehicle Compliance">
                <div className="af-form-grid af-form-grid--narrow">
                  <FormField label="WOF Due Date">
                    <input className="af-input" type="date" value={formData.wof_due} onChange={(e) => handleChange('wof_due', e.target.value)} />
                  </FormField>
                  <FormField label="Registration Expiry">
                    <input className="af-input" type="date" value={formData.registration_expiry} onChange={(e) => handleChange('registration_expiry', e.target.value)} />
                  </FormField>
                  <FormField label="Insurance Expiry">
                    <input className="af-input" type="date" value={formData.insurance_expiry} onChange={(e) => handleChange('insurance_expiry', e.target.value)} />
                  </FormField>
                </div>
              </FormSection>
            )}

            {isEditMode && (
              <FormSection title="Photos" icon={<Camera size={18} />} action={
                <>
                  <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(Array.from(e.target.files || []))} />
                  <button className="af-btn-action" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                    <Camera size={16} /> {uploadingPhoto ? 'Uploading...' : 'Add Photos'}
                  </button>
                </>
              }>
                {photos.length === 0 ? (
                  <div className="af-empty">No photos uploaded yet</div>
                ) : (
                  <div className="af-photos-grid">
                    {photos.map(photo => <PhotoThumbnail key={photo.id} photo={photo} onDelete={handleDeleteFile} />)}
                  </div>
                )}
              </FormSection>
            )}

            {isEditMode && (
              <FormSection title="Documents" icon={<FileText size={18} />} action={
                <>
                  <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.csv" multiple style={{ display: 'none' }} onChange={(e) => handleDocumentUpload(Array.from(e.target.files || []))} />
                  <button className="af-btn-action" onClick={() => docInputRef.current?.click()} disabled={uploadingDoc}>
                    <FileText size={16} /> {uploadingDoc ? 'Uploading...' : 'Add Documents'}
                  </button>
                </>
              }>
                {documents.length === 0 ? (
                  <div className="af-empty">No documents uploaded yet</div>
                ) : (
                  <div className="af-docs-list">
                    {documents.map(doc => <DocumentItem key={doc.id} document={doc} onDelete={handleDeleteFile} />)}
                  </div>
                )}
              </FormSection>
            )}
          </>
        )}

        {activeTab === 'calibration' && isEditMode && formData.requires_calibration && (
          <CalibrationInlineManager assetId={id} inline={true} />
        )}

        {activeTab === 'maintenance' && isEditMode && (
          <MaintenanceInlineManager assetId={id} inline={true} />
        )}

        {showCalibrationManager && (
          <CalibrationInlineManager assetId={id} onClose={() => setShowCalibrationManager(false)} />
        )}

        {showLocationMap && (
          <RiskLocationMap
            isOpen={showLocationMap}
            onClose={() => setShowLocationMap(false)}
            onLocationSet={(location) => {
              const geom = location?.geometry || location;
              if (geom?.type === 'Point' && geom.coordinates) {
                handleChange('longitude', geom.coordinates[0]);
                handleChange('latitude', geom.coordinates[1]);
                handleChange('location_geojson', null);
              } else if (geom?.type === 'LineString' || geom?.type === 'Polygon') {
                handleChange('location_geojson', geom);
                const first = geom.coordinates?.[0];
                if (Array.isArray(first)) {
                  const coord = Array.isArray(first[0]) ? first[0] : first;
                  handleChange('longitude', coord[0]);
                  handleChange('latitude', coord[1]);
                }
              }
              setShowLocationMap(false);
            }}
            initialLocation={
              formData.latitude && formData.longitude
                ? formData.location_geojson || { type: 'Point', coordinates: [Number(formData.longitude), Number(formData.latitude)] }
                : null
            }
          />
        )}

        <MobileNavigation />
    </div>
  );
}

function FormSection({ title, icon, action, children }) {
  return (
    <div className="af-section">
      <div className="af-section-header">
        <h3>{icon} {title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <label className="af-field">
      <div className="af-field-label">
        {label}
        {required && <span className="af-required">*</span>}
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
      } catch { /* swallow */ }
    })();
    return () => {
      alive = false;
      if (previewUrl) assetService.files.revokeObjectUrl(previewUrl);
    };
  }, [photo.id]);

  return (
    <>
      <div className="af-photo-thumb">
        <img src={previewUrl || ''} alt={photo.description || 'Asset photo'} onClick={() => setEnlarged(true)} title="Click to enlarge" />
        <button className="af-photo-delete" onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this photo?')) onDelete(photo.id); }} title="Delete photo">
          ×
        </button>
      </div>
      {enlarged && (
        <div className="af-lightbox" onClick={() => setEnlarged(false)}>
          <img src={previewUrl || ''} alt={photo.description || 'Asset photo'} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function DocumentItem({ document, onDelete }) {
  return (
    <div className="af-doc-item">
      <div className="af-doc-info">
        <FileText size={20} />
        <div>
          <div className="af-doc-name">{document.original_filename}</div>
          <div className="af-doc-meta">{document.mime_type} • {Math.round(document.file_size / 1024)} KB</div>
        </div>
      </div>
      <div className="af-doc-actions">
        <button className="af-btn-action af-btn-sm" onClick={async () => {
          const blob = await assetService.files.downloadBlob(document.id);
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }}>
          Download
        </button>
        <button className="af-btn-delete af-btn-sm" onClick={() => { if (window.confirm('Delete this document?')) onDelete(document.id); }}>
          Delete
        </button>
      </div>
    </div>
  );
}
