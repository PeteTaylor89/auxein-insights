// packages/web/src/pages/ConsumableForm.jsx
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
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { assetService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import StockMovementInlineManager from '../components/StockMovementInlineManager';
import MaintenanceTable from '../components/MaintenanceTable';
import './AssetForm.css';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export default function ConsumableForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const companyId = authService.getCompanyId();

  const [formData, setFormData] = useState({
    asset_number: '', name: '', description: '',
    category: 'consumable', subcategory: 'spray_product', asset_type: 'consumable',
    unit_of_measure: 'L', current_stock: '0', minimum_stock: '', maximum_stock: '',
    cost_per_unit: '', active_ingredient: '', concentration: '',
    application_rate_min: '', application_rate_max: '', withholding_period_days: '',
    registration_number: '', registration_expiry: '', safety_data_sheet_url: '',
    hazard_classifications: {},
    certified_for: { organics: false, regenerative: false, biodynamic: false, swnz: false },
    storage_requirements: { notes: '' },
    batch_tracking_required: false, expiry_tracking_required: false,
    purchase_date: '', purchase_price: '', current_value: '',
    status: 'active', location: '',
    requires_maintenance: false, maintenance_interval_days: ''
  });

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
  const [showStockAlert, setShowStockAlert] = useState(false);

  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => document.body.classList.remove("primary-bg");
  }, []);

  useEffect(() => {
    if (isEditMode) loadConsumable();
  }, [id]);

  useEffect(() => {
    if (isEditMode && formData.current_stock && formData.minimum_stock) {
      setShowStockAlert(parseFloat(formData.current_stock) <= parseFloat(formData.minimum_stock));
    } else {
      setShowStockAlert(false);
    }
  }, [formData.current_stock, formData.minimum_stock, isEditMode]);

  const loadConsumable = async () => {
    try {
      setLoading(true);
      setError(null);
      const asset = await assetService.getAsset(id);
      setFormData({
        asset_number: asset.asset_number || '', name: asset.name || '',
        description: asset.description || '', category: asset.category || 'consumable',
        subcategory: asset.subcategory || 'spray_product', asset_type: 'consumable',
        unit_of_measure: asset.unit_of_measure || 'L',
        current_stock: asset.current_stock?.toString() || '0',
        minimum_stock: asset.minimum_stock?.toString() || '',
        maximum_stock: asset.maximum_stock?.toString() || '',
        cost_per_unit: asset.cost_per_unit?.toString() || '',
        active_ingredient: asset.active_ingredient || '',
        concentration: asset.concentration || '',
        application_rate_min: asset.application_rate_min?.toString() || '',
        application_rate_max: asset.application_rate_max?.toString() || '',
        withholding_period_days: asset.withholding_period_days?.toString() || '',
        registration_number: asset.registration_number || '',
        registration_expiry: asset.registration_expiry || '',
        safety_data_sheet_url: asset.safety_data_sheet_url || '',
        hazard_classifications: asset.hazard_classifications || {},
        certified_for: asset.certified_for || { organics: false, regenerative: false, biodynamic: false, swnz: false },
        storage_requirements: asset.storage_requirements || { notes: '' },
        batch_tracking_required: asset.batch_tracking_required || false,
        expiry_tracking_required: asset.expiry_tracking_required || false,
        purchase_date: asset.purchase_date || '',
        purchase_price: asset.purchase_price?.toString() || '',
        current_value: asset.current_value?.toString() || '',
        status: asset.status || 'active', location: asset.location || '',
        requires_maintenance: asset.requires_maintenance || false,
        maintenance_interval_days: asset.maintenance_interval_days?.toString() || ''
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
      console.error('Failed to load consumable:', e);
      setError('Failed to load consumable details');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleCertificationChange = (scheme, checked) => {
    setFormData(prev => ({ ...prev, certified_for: { ...prev.certified_for, [scheme]: checked } }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      if (!formData.asset_number.trim()) { setError('Asset number is required'); return; }
      if (!formData.name.trim()) { setError('Consumable name is required'); return; }
      if (!formData.unit_of_measure.trim()) { setError('Unit of measure is required'); return; }
      if (formData.withholding_period_days && parseFloat(formData.withholding_period_days) < 0) { setError('Withholding period cannot be negative'); return; }
      if (formData.registration_number && !assetService.helpers.validateACVMNumber(formData.registration_number)) {
        if (!window.confirm('The registration number does not match the standard ACVM format (e.g., ACVM12345). Save anyway?')) return;
      }
      const sanitizePayload = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));
      const payload = sanitizePayload({
        ...formData, category: 'consumable', asset_type: 'consumable',
        current_stock: formData.current_stock ? Number(formData.current_stock) : 0,
        minimum_stock: formData.minimum_stock ? Number(formData.minimum_stock) : null,
        maximum_stock: formData.maximum_stock ? Number(formData.maximum_stock) : null,
        cost_per_unit: formData.cost_per_unit ? Number(formData.cost_per_unit) : null,
        application_rate_min: formData.application_rate_min ? Number(formData.application_rate_min) : null,
        application_rate_max: formData.application_rate_max ? Number(formData.application_rate_max) : null,
        withholding_period_days: formData.withholding_period_days ? Number(formData.withholding_period_days) : null,
        purchase_price: formData.purchase_price ? Number(formData.purchase_price) : null,
        current_value: formData.current_value ? Number(formData.current_value) : null,
        maintenance_interval_days: formData.maintenance_interval_days ? Number(formData.maintenance_interval_days) : null,
        batch_tracking_required: Boolean(formData.batch_tracking_required),
        expiry_tracking_required: Boolean(formData.expiry_tracking_required),
        storage_requirements: formData.storage_requirements || {}
      });
      if (isEditMode) await assetService.updateAsset(id, payload);
      else await assetService.createAsset(payload);
      navigate(`/assets/`);
    } catch (e) {
      console.error('Failed to save consumable:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save consumable';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save consumable' : detail);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this consumable? This action cannot be undone.')) return;
    try { setDeleting(true); await assetService.deleteAsset(id); navigate('/assets'); }
    catch (e) { console.error('Failed to delete consumable:', e); alert('Failed to delete consumable: ' + (e?.message || 'Unknown error')); }
    finally { setDeleting(false); }
  };

  const handlePhotoUpload = async (files) => {
    if (!files?.length) return;
    if (!isEditMode) { alert('Please save the consumable first before uploading photos'); return; }
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; }
        await assetService.files.uploadAssetFile({ assetId: parseInt(id), file, fileCategory: 'photo', description: `Photo: ${file.name}` });
      }
      const photoFiles = await assetService.files.listAssetPhotos(id);
      setPhotos(photoFiles || []);
    } catch (e) { console.error('Photo upload failed:', e); alert('Photo upload failed: ' + (e?.response?.data?.detail || e?.message || 'Error')); }
    finally { setUploadingPhoto(false); if (photoInputRef.current) photoInputRef.current.value = ''; }
  };

  const handleDocumentUpload = async (files) => {
    if (!files?.length) return;
    if (!isEditMode) { alert('Please save the consumable first before uploading documents'); return; }
    setUploadingDoc(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; }
        await assetService.files.uploadAssetFile({ assetId: parseInt(id), file, fileCategory: 'document', description: `Document: ${file.name}` });
      }
      const docFiles = await assetService.files.listAssetDocuments(id);
      setDocuments(docFiles || []);
    } catch (e) { console.error('Document upload failed:', e); alert('Document upload failed: ' + (e?.response?.data?.detail || e?.message || 'Error')); }
    finally { setUploadingDoc(false); if (docInputRef.current) docInputRef.current.value = ''; }
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
    } catch (e) { console.error('Failed to delete file:', e); alert('Failed to delete file'); }
  };

  if (loading) {
    return <div className="page-container"><div className="af-loading"><h2>Loading...</h2></div></div>;
  }

  const consumableSubcategories = assetService.helpers.getConsumableSubcategories();
  const statusOptions = [
    { value: 'active', label: 'Active' }, { value: 'out_of_stock', label: 'Out of Stock' },
    { value: 'retired', label: 'Retired' }, { value: 'disposed', label: 'Disposed' }
  ];
  const stockStatus = isEditMode ? assetService.helpers.formatStockStatus({ current_stock: formData.current_stock, minimum_stock: formData.minimum_stock }) : null;

  return (
    <div className="page-container">
      <button className="af-back" onClick={() => navigate('/assets')}>
        <ArrowLeft size={16} /> Back to Assets
      </button>

      <div className="af-header">
        <h1><Package size={24} /> {isEditMode ? 'Edit Consumable' : 'New Consumable'}</h1>
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

      {error && <div className="af-error"><AlertCircle size={20} /> {error}</div>}

      {showStockAlert && isEditMode && (
        <div className="vp-warning-banner" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <AlertTriangle size={20} />
          <div>
            <div style={{ fontWeight: 600 }}>{stockStatus?.icon} {stockStatus?.label}</div>
            <div>Current stock ({formData.current_stock} {formData.unit_of_measure}) is at or below minimum level ({formData.minimum_stock} {formData.unit_of_measure}). Consider reordering.</div>
          </div>
        </div>
      )}

      {isEditMode && (
        <div className="af-tab-card">
          <div className="af-tab-bar">
            <button className={`af-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
              <Package size={16} /> Details
            </button>
            <button className={`af-tab ${activeTab === 'stock_movements' ? 'active' : ''}`} onClick={() => setActiveTab('stock_movements')}>
              <TrendingUp size={16} /> Stock Movements
            </button>
            {formData.requires_maintenance && (
              <button className={`af-tab ${activeTab === 'maintenance' ? 'active' : ''}`} onClick={() => setActiveTab('maintenance')}>
                <FileText size={16} /> Maintenance
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'details' && (
        <>
          <FormSection title="Basic Information" icon={<Package size={18} />}>
            <div className="af-form-grid">
              <FormField label="Product Code" required>
                <input className="af-input" type="text" value={formData.asset_number} onChange={(e) => handleChange('asset_number', e.target.value)} placeholder="e.g., CONS-001" disabled={isEditMode} />
              </FormField>
              <FormField label="Product Name" required>
                <input className="af-input" type="text" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="e.g., Roundup 360" />
              </FormField>
              <FormField label="Category">
                <select className="af-select" value={formData.subcategory} onChange={(e) => handleChange('subcategory', e.target.value)}>
                  {consumableSubcategories.map(opt => <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>)}
                </select>
              </FormField>
              <FormField label="Status">
                <select className="af-select" value={formData.status} onChange={(e) => handleChange('status', e.target.value)}>
                  {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </FormField>
              <FormField label="Storage Location">
                <input className="af-input" type="text" value={formData.location} onChange={(e) => handleChange('location', e.target.value)} placeholder="e.g., Chemical Store A" />
              </FormField>
            </div>
            <FormField label="Description">
              <textarea className="af-textarea" rows={3} value={formData.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Description of the consumable..." />
            </FormField>
          </FormSection>

          <FormSection title="Stock Management" icon={<Droplet size={18} />}>
            {isEditMode && stockStatus && (
              <div className={`ac-stock-status ac-stock-status--${stockStatus.color}`}>
                <span className="ac-stock-icon">{stockStatus.icon}</span>
                <div>
                  <div className="ac-stock-label">Stock Status: {stockStatus.label}</div>
                  {stockStatus.needs_reorder && <div className="ac-stock-sublabel">Consider reordering to maintain adequate stock levels</div>}
                </div>
              </div>
            )}
            <div className="af-form-grid af-form-grid--narrow">
              <FormField label="Unit of Measure" required>
                <select className="af-select" value={formData.unit_of_measure} onChange={(e) => handleChange('unit_of_measure', e.target.value)}>
                  <option value="L">Litres (L)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="g">Grams (g)</option>
                  <option value="units">Units</option>
                  <option value="bags">Bags</option>
                  <option value="bottles">Bottles</option>
                </select>
              </FormField>
              <FormField label="Current Stock" required>
                <div className="ac-input-with-unit">
                  <input className="af-input" type="number" step="0.01" value={formData.current_stock} onChange={(e) => handleChange('current_stock', e.target.value)} placeholder="0.00" />
                  <span className="ac-unit-label">{formData.unit_of_measure}</span>
                </div>
              </FormField>
              <FormField label="Minimum Stock (Reorder Level)">
                <div className="ac-input-with-unit">
                  <input className="af-input" type="number" step="0.01" value={formData.minimum_stock} onChange={(e) => handleChange('minimum_stock', e.target.value)} placeholder="0.00" />
                  <span className="ac-unit-label">{formData.unit_of_measure}</span>
                </div>
              </FormField>
              <FormField label="Maximum Stock">
                <div className="ac-input-with-unit">
                  <input className="af-input" type="number" step="0.01" value={formData.maximum_stock} onChange={(e) => handleChange('maximum_stock', e.target.value)} placeholder="0.00" />
                  <span className="ac-unit-label">{formData.unit_of_measure}</span>
                </div>
              </FormField>
              <FormField label="Cost per Unit (NZD)">
                <input className="af-input" type="number" step="0.01" value={formData.cost_per_unit} onChange={(e) => handleChange('cost_per_unit', e.target.value)} placeholder="0.00" />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Compliance & Registration" icon={<FileText size={18} />}>
            <div className="af-form-grid">
              <FormField label="Active Ingredient">
                <input className="af-input" type="text" value={formData.active_ingredient} onChange={(e) => handleChange('active_ingredient', e.target.value)} placeholder="e.g., Glyphosate" />
              </FormField>
              <FormField label="Concentration">
                <input className="af-input" type="text" value={formData.concentration} onChange={(e) => handleChange('concentration', e.target.value)} placeholder="e.g., 360 g/L" />
              </FormField>
              <FormField label="Application Rate Min (per ha)">
                <input className="af-input" type="number" step="0.01" value={formData.application_rate_min} onChange={(e) => handleChange('application_rate_min', e.target.value)} placeholder="0.00" />
              </FormField>
              <FormField label="Application Rate Max (per ha)">
                <input className="af-input" type="number" step="0.01" value={formData.application_rate_max} onChange={(e) => handleChange('application_rate_max', e.target.value)} placeholder="0.00" />
              </FormField>
              <FormField label="Withholding Period (days)">
                <input className="af-input" type="number" min="0" value={formData.withholding_period_days} onChange={(e) => handleChange('withholding_period_days', e.target.value)} placeholder="0" />
              </FormField>
              <FormField label="ACVM Registration Number">
                <input className="af-input" type="text" value={formData.registration_number} onChange={(e) => handleChange('registration_number', e.target.value)} placeholder="e.g., ACVM12345" />
              </FormField>
              <FormField label="Registration Expiry">
                <input className="af-input" type="date" value={formData.registration_expiry} onChange={(e) => handleChange('registration_expiry', e.target.value)} />
              </FormField>
              <FormField label="Safety Data Sheet URL">
                <input className="af-input" type="url" value={formData.safety_data_sheet_url} onChange={(e) => handleChange('safety_data_sheet_url', e.target.value)} placeholder="https://..." />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Certification Schemes" icon={<CheckCircle size={18} />}>
            <div className="ac-info">Select which certification schemes this product is approved for</div>
            <div className="af-form-grid af-form-grid--narrow">
              {assetService.helpers.getCertificationSchemes().map(scheme => (
                <label key={scheme.value} className={`ac-cert-card ${formData.certified_for[scheme.value] ? 'selected' : ''}`}>
                  <input type="checkbox" checked={formData.certified_for[scheme.value] || false} onChange={(e) => handleCertificationChange(scheme.value, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }} />
                  <div style={{ flex: 1 }}>
                    <div className="ac-cert-card-title"><span>{scheme.icon}</span> {scheme.label}</div>
                    <div className="ac-cert-card-desc">{scheme.description}</div>
                  </div>
                </label>
              ))}
            </div>
            {Object.values(formData.certified_for).some(v => v) && (
              <div className="ac-success-box" style={{ marginTop: 'var(--space-base)' }}>
                <div className="ac-success-title">Certified For:</div>
                <div className="ac-success-text">
                  {assetService.helpers.getCertificationSchemes().filter(s => formData.certified_for[s.value]).map(s => s.label).join(', ')}
                </div>
              </div>
            )}
          </FormSection>

          <FormSection title="Storage & Handling" icon={<Package size={18} />}>
            <div style={{ display: 'grid', gap: 'var(--space-md)', marginBottom: 'var(--space-base)' }}>
              <label className="ac-checkbox-row">
                <input type="checkbox" checked={formData.batch_tracking_required} onChange={(e) => handleChange('batch_tracking_required', e.target.checked)} />
                <span>Batch tracking required</span>
              </label>
              <label className="ac-checkbox-row">
                <input type="checkbox" checked={formData.expiry_tracking_required} onChange={(e) => handleChange('expiry_tracking_required', e.target.checked)} />
                <span>Expiry tracking required</span>
              </label>
            </div>
            <FormField label="Storage Requirements">
              <textarea className="af-textarea" rows={3} value={formData.storage_requirements?.notes || ''} onChange={(e) => handleChange('storage_requirements', { ...formData.storage_requirements, notes: e.target.value })} placeholder="e.g., Store in cool, dry place. Keep away from direct sunlight. Temperature: 5-25°C" />
            </FormField>
          </FormSection>

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

      {activeTab === 'stock_movements' && isEditMode && (
        <StockMovementInlineManager assetId={id} inline={true} onStockUpdate={loadConsumable} />
      )}

      {activeTab === 'maintenance' && isEditMode && formData.requires_maintenance && (
        <MaintenanceTable assetId={id} />
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
      try { const url = await assetService.files.getObjectUrl(photo.id); if (alive) setPreviewUrl(url); } catch {}
    })();
    return () => { alive = false; if (previewUrl) assetService.files.revokeObjectUrl(previewUrl); };
  }, [photo.id]);

  return (
    <>
      <div className="af-photo-thumb">
        <img src={previewUrl || ''} alt={photo.description || 'Consumable photo'} onClick={() => setEnlarged(true)} title="Click to enlarge" />
        <button className="af-photo-delete" onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this photo?')) onDelete(photo.id); }} title="Delete photo">×</button>
      </div>
      {enlarged && (
        <div className="af-lightbox" onClick={() => setEnlarged(false)}>
          <img src={previewUrl || ''} alt={photo.description || 'Consumable photo'} onClick={(e) => e.stopPropagation()} />
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
        }}>View</button>
        <button className="af-btn-delete af-btn-sm" onClick={() => { if (window.confirm('Delete this document?')) onDelete(document.id); }}>Delete</button>
      </div>
    </div>
  );
}
