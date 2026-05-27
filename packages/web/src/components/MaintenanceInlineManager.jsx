// packages/web/src/components/MaintenanceInlineManager.jsx
import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import {
  Plus, Save, Trash2, Edit2, X, Camera, FileText,
  AlertTriangle, CheckCircle, XCircle, Clock
} from 'lucide-react';
import { assetService } from '@vineyard/shared';
import './asset-components.css';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Lifted out of the parent component — defining it inline was creating a new
// component reference on every render, causing React to unmount/remount the
// inputs inside and dropping focus on every keypress.
function FormSubSection({ title, children }) {
  return (
    <div className="ac-inline" style={{ padding: 'var(--space-md)', marginBottom: 0 }}>
      <h5 style={{ margin: '0 0 var(--space-md) 0', fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-muted)' }}>{title}</h5>
      {children}
    </div>
  );
}

export default function MaintenanceInlineManager({ assetId, inline = false }) {
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [formData, setFormData] = useState({
    maintenance_type: 'scheduled', maintenance_category: '', title: '', description: '',
    scheduled_date: dayjs().format('YYYY-MM-DD'), completed_date: '', status: 'scheduled',
    performed_by: '', performed_by_user_id: null, performed_by_contractor_id: null,
    asset_hours_at_maintenance: '', asset_kilometers_at_maintenance: '',
    condition_before: '', condition_after: '', labor_hours: '', labor_cost: '',
    parts_cost: '', external_cost: '', parts_used: [],
    compliance_certificate_number: '', compliance_expiry_date: '', compliance_status: '',
    next_due_date: '', next_due_hours: '', next_due_kilometers: '', notes: ''
  });

  const [newPart, setNewPart] = useState({ name: '', quantity: '', cost: '' });
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const [calculatedTotal, setCalculatedTotal] = useState(0);

  useEffect(() => { loadMaintenance(); }, [assetId]);

  useEffect(() => {
    const labor = parseFloat(formData.labor_cost || 0);
    const parts = parseFloat(formData.parts_cost || 0);
    const external = parseFloat(formData.external_cost || 0);
    setCalculatedTotal(labor + parts + external);
  }, [formData.labor_cost, formData.parts_cost, formData.external_cost]);

  useEffect(() => { if (creating && assetId) loadAssetData(); }, [creating, assetId]);

  const loadMaintenance = async () => {
    try { setLoading(true); setError(null); const data = await assetService.maintenance.listMaintenance({ asset_id: assetId, limit: 50 }); setMaintenance(Array.isArray(data) ? data : []); }
    catch (e) { console.error('Failed to load maintenance:', e); setError('Failed to load maintenance records'); }
    finally { setLoading(false); }
  };

  const loadAssetData = async () => {
    try { const asset = await assetService.getAsset(assetId); setFormData(prev => ({ ...prev, asset_hours_at_maintenance: asset.current_hours || '', asset_kilometers_at_maintenance: asset.current_kilometers || '' })); }
    catch (e) { console.error('Failed to load asset data:', e); }
  };

  const resetForm = () => ({
    maintenance_type: 'scheduled', maintenance_category: '', title: '', description: '',
    scheduled_date: dayjs().format('YYYY-MM-DD'), completed_date: '', status: 'scheduled',
    performed_by: '', performed_by_user_id: null, performed_by_contractor_id: null,
    asset_hours_at_maintenance: '', asset_kilometers_at_maintenance: '',
    condition_before: '', condition_after: '', labor_hours: '', labor_cost: '',
    parts_cost: '', external_cost: '', parts_used: [],
    compliance_certificate_number: '', compliance_expiry_date: '', compliance_status: '',
    next_due_date: '', next_due_hours: '', next_due_kilometers: '', notes: ''
  });

  const handleCreate = () => { setCreating(true); setEditingId(null); setFormData(resetForm()); setNewPart({ name: '', quantity: '', cost: '' }); setPhotos([]); setDocuments([]); };

  const handleEdit = async (record) => {
    setEditingId(record.id); setCreating(false);
    setFormData({
      maintenance_type: record.maintenance_type || 'scheduled', maintenance_category: record.maintenance_category || '',
      title: record.title || '', description: record.description || '',
      scheduled_date: record.scheduled_date || dayjs().format('YYYY-MM-DD'), completed_date: record.completed_date || '',
      status: record.status || 'scheduled', performed_by: record.performed_by || '',
      performed_by_user_id: record.performed_by_user_id || null, performed_by_contractor_id: record.performed_by_contractor_id || null,
      asset_hours_at_maintenance: record.asset_hours_at_maintenance || '', asset_kilometers_at_maintenance: record.asset_kilometers_at_maintenance || '',
      condition_before: record.condition_before || '', condition_after: record.condition_after || '',
      labor_hours: record.labor_hours || '', labor_cost: record.labor_cost || '',
      parts_cost: record.parts_cost || '', external_cost: record.external_cost || '',
      parts_used: record.parts_used || [],
      compliance_certificate_number: record.compliance_certificate_number || '', compliance_expiry_date: record.compliance_expiry_date || '',
      compliance_status: record.compliance_status || '',
      next_due_date: record.next_due_date || '', next_due_hours: record.next_due_hours || '', next_due_kilometers: record.next_due_kilometers || '',
      notes: record.notes || ''
    });
    setNewPart({ name: '', quantity: '', cost: '' });
    try {
      const [photoFiles, docFiles] = await Promise.all([
        assetService.files.listMaintenanceFiles(record.id, 'photo').catch(() => []),
        assetService.files.listMaintenanceFiles(record.id).catch(() => [])
      ]);
      setPhotos(photoFiles.filter(f => f.file_category === 'photo') || []);
      setDocuments(docFiles.filter(f => f.file_category !== 'photo') || []);
    } catch (e) { console.error('Failed to load files:', e); }
  };

  const handleCancel = () => { setCreating(false); setEditingId(null); setFormData(resetForm()); setNewPart({ name: '', quantity: '', cost: '' }); setPhotos([]); setDocuments([]); };

  const validateForm = () => {
    if (!formData.title.trim()) { setError('Title is required'); return false; }
    if (!formData.maintenance_type) { setError('Maintenance type is required'); return false; }
    if (!formData.scheduled_date) { setError('Scheduled date is required'); return false; }
    if (formData.status === 'completed' && !formData.performed_by) { setError('Performed by is required for completed maintenance'); return false; }
    if (formData.maintenance_type === 'compliance' && formData.status === 'completed' && !formData.compliance_certificate_number) { setError('Certificate number required for completed compliance maintenance'); return false; }
    for (const cost of ['labor_cost', 'parts_cost', 'external_cost']) { if (formData[cost] && Number(formData[cost]) < 0) { setError(`${cost.replace('_', ' ')} must be positive`); return false; } }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      setBusy(true); setError(null);
      const sanitizePayload = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));
      const payload = sanitizePayload({
        asset_id: assetId, maintenance_type: formData.maintenance_type, maintenance_category: formData.maintenance_category || null,
        title: formData.title, description: formData.description || null,
        scheduled_date: formData.scheduled_date, completed_date: formData.completed_date || null,
        status: formData.status, performed_by: formData.performed_by || null,
        performed_by_user_id: formData.performed_by_user_id, performed_by_contractor_id: formData.performed_by_contractor_id,
        asset_hours_at_maintenance: formData.asset_hours_at_maintenance ? Number(formData.asset_hours_at_maintenance) : null,
        asset_kilometers_at_maintenance: formData.asset_kilometers_at_maintenance ? Number(formData.asset_kilometers_at_maintenance) : null,
        condition_before: formData.condition_before || null, condition_after: formData.condition_after || null,
        labor_hours: formData.labor_hours ? Number(formData.labor_hours) : null,
        labor_cost: formData.labor_cost ? Number(formData.labor_cost) : null,
        parts_cost: formData.parts_cost ? Number(formData.parts_cost) : null,
        external_cost: formData.external_cost ? Number(formData.external_cost) : null,
        parts_used: formData.parts_used.length > 0 ? formData.parts_used : null,
        compliance_certificate_number: formData.compliance_certificate_number || null,
        compliance_expiry_date: formData.compliance_expiry_date || null,
        compliance_status: formData.compliance_status || null,
        notes: formData.notes || null
      });
      if (creating) await assetService.maintenance.createMaintenance(payload);
      else if (editingId) await assetService.maintenance.updateMaintenance(editingId, payload);
      await loadMaintenance(); handleCancel();
    } catch (e) {
      console.error('Failed to save maintenance:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save maintenance';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this maintenance record?')) return;
    try { setBusy(true); await assetService.maintenance.deleteMaintenance(id); await loadMaintenance(); }
    catch (e) { console.error('Failed to delete maintenance:', e); alert('Failed to delete maintenance'); }
    finally { setBusy(false); }
  };

  const handleAddPart = () => {
    if (!newPart.name || !newPart.quantity || !newPart.cost) { setError('Please fill in all part fields'); return; }
    setFormData(prev => ({ ...prev, parts_used: [...prev.parts_used, { name: newPart.name, quantity: Number(newPart.quantity), cost: Number(newPart.cost) }] }));
    setNewPart({ name: '', quantity: '', cost: '' });
  };

  const handleRemovePart = (index) => { setFormData(prev => ({ ...prev, parts_used: prev.parts_used.filter((_, i) => i !== index) })); };

  const handlePhotoUpload = async (files) => {
    if (!files?.length || !editingId) { if (!editingId) alert('Please save the maintenance record first before uploading photos'); return; }
    setUploadingPhoto(true);
    try {
      for (const file of files) { if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; } await assetService.files.uploadMaintenanceFile({ maintenanceId: editingId, file, fileCategory: 'photo', description: `Photo: ${file.name}` }); }
      const photoFiles = await assetService.files.listMaintenanceFiles(editingId, 'photo'); setPhotos(photoFiles || []);
    } catch (e) { console.error('Photo upload failed:', e); alert('Photo upload failed: ' + (e?.message || 'Error')); }
    finally { setUploadingPhoto(false); if (photoInputRef.current) photoInputRef.current.value = ''; }
  };

  const handleDocumentUpload = async (files) => {
    if (!files?.length || !editingId) { if (!editingId) alert('Please save the maintenance record first before uploading documents'); return; }
    setUploadingDoc(true);
    try {
      for (const file of files) { if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; } await assetService.files.uploadMaintenanceFile({ maintenanceId: editingId, file, fileCategory: 'document', description: `Document: ${file.name}` }); }
      const docFiles = await assetService.files.listMaintenanceFiles(editingId); setDocuments(docFiles.filter(f => f.file_category !== 'photo') || []);
    } catch (e) { console.error('Document upload failed:', e); alert('Document upload failed: ' + (e?.message || 'Error')); }
    finally { setUploadingDoc(false); if (docInputRef.current) docInputRef.current.value = ''; }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Delete this file?')) return;
    try {
      await assetService.files.deleteFile(fileId);
      const [photoFiles, docFiles] = await Promise.all([assetService.files.listMaintenanceFiles(editingId, 'photo').catch(() => []), assetService.files.listMaintenanceFiles(editingId).catch(() => [])]);
      setPhotos(photoFiles.filter(f => f.file_category === 'photo') || []); setDocuments(docFiles.filter(f => f.file_category !== 'photo') || []);
    } catch (e) { console.error('Failed to delete file:', e); alert('Failed to delete file'); }
  };

  const maintenanceTypes = assetService.helpers.getMaintenanceTypes();
  const maintenanceStatuses = assetService.helpers.getMaintenanceStatuses();

  const content = (
    <div className={inline ? '' : 'ac-inline'}>
      {error && <div className="ac-error"><AlertTriangle size={16} /> {error}</div>}

      {!creating && !editingId && (
        <div style={{ marginBottom: 'var(--space-base)' }}>
          <button className="ac-btn-primary" onClick={handleCreate} disabled={busy}><Plus size={16} /> New Maintenance</button>
        </div>
      )}

      {(creating || editingId) && (
        <div className="ac-form-panel">
          <h4>{creating ? 'New Maintenance Record' : 'Edit Maintenance Record'}</h4>
          <div className="ac-form-grid">
            <FormSubSection title="Basic Information">
              <div className="ac-form-grid">
                <label>
                  <div className="ac-field-label">Title <span className="ac-required">*</span></div>
                  <input className="ac-input" type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g., Regular Service" />
                </label>
                <div className="ac-form-grid ac-form-grid--2col">
                  <label>
                    <div className="ac-field-label">Maintenance Type <span className="ac-required">*</span></div>
                    <select className="ac-select" value={formData.maintenance_type} onChange={(e) => setFormData({ ...formData, maintenance_type: e.target.value })}>
                      {maintenanceTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <div className="ac-field-label">Category</div>
                    <select className="ac-select" value={formData.maintenance_category} onChange={(e) => setFormData({ ...formData, maintenance_category: e.target.value })}>
                      <option value="">Select category</option>
                      <option value="service">Service</option><option value="repair">Repair</option>
                      <option value="inspection">Inspection</option><option value="wof">WOF</option>
                      <option value="registration">Registration</option>
                    </select>
                  </label>
                </div>
                <div className="ac-form-grid ac-form-grid--3col">
                  <label><div className="ac-field-label">Scheduled Date <span className="ac-required">*</span></div><input className="ac-input" type="date" value={formData.scheduled_date} onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })} /></label>
                  <label><div className="ac-field-label">Completed Date</div><input className="ac-input" type="date" value={formData.completed_date} onChange={(e) => setFormData({ ...formData, completed_date: e.target.value })} /></label>
                  <label><div className="ac-field-label">Status</div><select className="ac-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>{maintenanceStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
                </div>
                <label><div className="ac-field-label">Description</div><textarea className="ac-textarea" rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the maintenance work..." /></label>
              </div>
            </FormSubSection>

            <FormSubSection title="Execution Details">
              <div className="ac-form-grid">
                <label><div className="ac-field-label">Performed By {formData.status === 'completed' && <span className="ac-required">*</span>}</div><input className="ac-input" type="text" value={formData.performed_by} onChange={(e) => setFormData({ ...formData, performed_by: e.target.value })} placeholder="Name or initials" /></label>
                <div className="ac-form-grid ac-form-grid--2col">
                  <label><div className="ac-field-label">Asset Hours at Maintenance</div><input className="ac-input" type="number" step="0.1" value={formData.asset_hours_at_maintenance} onChange={(e) => setFormData({ ...formData, asset_hours_at_maintenance: e.target.value })} placeholder="0.0" /></label>
                  <label><div className="ac-field-label">Asset Kilometers at Maintenance</div><input className="ac-input" type="number" step="0.1" value={formData.asset_kilometers_at_maintenance} onChange={(e) => setFormData({ ...formData, asset_kilometers_at_maintenance: e.target.value })} placeholder="0.0" /></label>
                </div>
                <div className="ac-form-grid ac-form-grid--2col">
                  <label><div className="ac-field-label">Condition Before</div><select className="ac-select" value={formData.condition_before} onChange={(e) => setFormData({ ...formData, condition_before: e.target.value })}><option value="">Select condition</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></label>
                  <label><div className="ac-field-label">Condition After</div><select className="ac-select" value={formData.condition_after} onChange={(e) => setFormData({ ...formData, condition_after: e.target.value })}><option value="">Select condition</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></label>
                </div>
              </div>
            </FormSubSection>

            <FormSubSection title="Cost Tracking">
              <div className="ac-form-grid">
                <div className="ac-form-grid ac-form-grid--4col">
                  <label><div className="ac-field-label">Labor Hours</div><input className="ac-input" type="number" step="0.1" value={formData.labor_hours} onChange={(e) => setFormData({ ...formData, labor_hours: e.target.value })} placeholder="0.0" /></label>
                  <label><div className="ac-field-label">Labor Cost (NZD)</div><input className="ac-input" type="number" step="0.01" value={formData.labor_cost} onChange={(e) => setFormData({ ...formData, labor_cost: e.target.value })} placeholder="0.00" /></label>
                  <label><div className="ac-field-label">Parts Cost (NZD)</div><input className="ac-input" type="number" step="0.01" value={formData.parts_cost} onChange={(e) => setFormData({ ...formData, parts_cost: e.target.value })} placeholder="0.00" /></label>
                  <label><div className="ac-field-label">External Cost (NZD)</div><input className="ac-input" type="number" step="0.01" value={formData.external_cost} onChange={(e) => setFormData({ ...formData, external_cost: e.target.value })} placeholder="0.00" /></label>
                </div>
                <div className="ac-success-box" style={{ textAlign: 'center' }}>
                  <div className="ac-success-text">Total Cost</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#166534' }}>${calculatedTotal.toFixed(2)}</div>
                </div>
              </div>
            </FormSubSection>

            <FormSubSection title="Parts Used">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', alignItems: 'end' }}>
                <input className="ac-input" type="text" value={newPart.name} onChange={(e) => setNewPart({ ...newPart, name: e.target.value })} placeholder="Part name" />
                <input className="ac-input" type="number" step="0.1" value={newPart.quantity} onChange={(e) => setNewPart({ ...newPart, quantity: e.target.value })} placeholder="Qty" />
                <input className="ac-input" type="number" step="0.01" value={newPart.cost} onChange={(e) => setNewPart({ ...newPart, cost: e.target.value })} placeholder="Cost" />
                <button className="ac-btn-success" onClick={handleAddPart}>Add</button>
              </div>
              {formData.parts_used.length > 0 ? (
                <div className="ac-parts-list">
                  {formData.parts_used.map((part, index) => (
                    <div key={index} className="ac-part-item">
                      <div style={{ flex: 1 }}><strong>{part.name}</strong></div>
                      <div className="muted" style={{ width: 80, textAlign: 'center' }}>Qty: {part.quantity}</div>
                      <div className="muted" style={{ width: 100, textAlign: 'right' }}>${parseFloat(part.cost).toFixed(2)}</div>
                      <button className="ac-btn-danger ac-btn-sm" style={{ marginLeft: 'var(--space-sm)' }} onClick={() => handleRemovePart(index)}>Remove</button>
                    </div>
                  ))}
                </div>
              ) : <div className="ac-empty" style={{ padding: 'var(--space-base)' }}>No parts added yet</div>}
            </FormSubSection>

            {formData.maintenance_type === 'compliance' && (
              <FormSubSection title="Compliance Details">
                <div className="ac-form-grid ac-form-grid--3col">
                  <label><div className="ac-field-label">Certificate Number</div><input className="ac-input" type="text" value={formData.compliance_certificate_number} onChange={(e) => setFormData({ ...formData, compliance_certificate_number: e.target.value })} placeholder="e.g., WOF123456" /></label>
                  <label><div className="ac-field-label">Expiry Date</div><input className="ac-input" type="date" value={formData.compliance_expiry_date} onChange={(e) => setFormData({ ...formData, compliance_expiry_date: e.target.value })} /></label>
                  <label><div className="ac-field-label">Status</div><select className="ac-select" value={formData.compliance_status} onChange={(e) => setFormData({ ...formData, compliance_status: e.target.value })}><option value="">Select status</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="conditional">Conditional</option></select></label>
                </div>
              </FormSubSection>
            )}

            {editingId && (
              <FormSubSection title="Photos">
                <div className="ac-inline-header" style={{ marginBottom: 'var(--space-sm)' }}>
                  <span className="ac-field-label" style={{ marginBottom: 0 }}>Uploaded Photos</span>
                  <div>
                    <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(Array.from(e.target.files || []))} />
                    <button className="ac-btn-primary ac-btn-sm" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}><Camera size={14} /> {uploadingPhoto ? 'Uploading...' : 'Upload Photos'}</button>
                  </div>
                </div>
                {photos.length === 0 ? <div className="ac-empty" style={{ padding: 'var(--space-base)' }}>No photos uploaded yet</div> : (
                  <div className="ac-photos-grid">{photos.map(photo => <PhotoThumbnail key={photo.id} photo={photo} onDelete={handleDeleteFile} />)}</div>
                )}
              </FormSubSection>
            )}

            {editingId && (
              <FormSubSection title="Documents">
                <div className="ac-inline-header" style={{ marginBottom: 'var(--space-sm)' }}>
                  <span className="ac-field-label" style={{ marginBottom: 0 }}>Uploaded Documents</span>
                  <div>
                    <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.csv" multiple style={{ display: 'none' }} onChange={(e) => handleDocumentUpload(Array.from(e.target.files || []))} />
                    <button className="ac-btn-primary ac-btn-sm" onClick={() => docInputRef.current?.click()} disabled={uploadingDoc}><FileText size={14} /> {uploadingDoc ? 'Uploading...' : 'Upload Documents'}</button>
                  </div>
                </div>
                {documents.length === 0 ? <div className="ac-empty" style={{ padding: 'var(--space-base)' }}>No documents uploaded yet</div> : (
                  <div className="ac-parts-list">{documents.map(doc => <DocumentItem key={doc.id} document={doc} onDelete={handleDeleteFile} />)}</div>
                )}
              </FormSubSection>
            )}

            <FormSubSection title="Notes">
              <textarea className="ac-textarea" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes and observations..." />
            </FormSubSection>

            <div className="ac-action-bar">
              <button className="ac-btn-cancel" onClick={handleCancel} disabled={busy}>Cancel</button>
              <button className="ac-btn-primary" onClick={handleSave} disabled={busy}><Save size={16} /> {busy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="ac-loading">Loading maintenance records...</div>
      ) : maintenance.length === 0 ? (
        <div className="ac-empty">No maintenance records yet</div>
      ) : (
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Date</th><th>Title</th><th>Type</th><th>Performed By</th>
                <th className="center">Status</th><th className="right">Total Cost</th><th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {maintenance.map(record => (
                <tr key={record.id}>
                  <td>{dayjs(record.scheduled_date).format('MMM D, YYYY')}</td>
                  <td className="bold">{record.title}</td>
                  <td style={{ textTransform: 'capitalize' }}>{record.maintenance_type?.replace('_', ' ')}</td>
                  <td className="muted">{record.performed_by || '—'}</td>
                  <td className="center"><StatusBadge status={record.status} /></td>
                  <td className="right" style={{ fontWeight: 600 }}>{record.total_cost ? `$${parseFloat(record.total_cost).toFixed(2)}` : '—'}</td>
                  <td className="right">
                    <div className="ac-action-bar" style={{ marginTop: 0 }}>
                      <button className="ac-btn-primary ac-btn-sm" onClick={() => handleEdit(record)} disabled={busy || creating || editingId}><Edit2 size={12} /> Edit</button>
                      <button className="ac-btn-danger ac-btn-sm" onClick={() => handleDelete(record.id)} disabled={busy || creating || editingId}><Trash2 size={12} /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return content;
}

function StatusBadge({ status }) {
  const iconMap = { scheduled: <Clock size={12} />, in_progress: <Clock size={12} />, completed: <CheckCircle size={12} />, cancelled: <XCircle size={12} /> };
  const clsMap = { scheduled: 'ac-badge--info', in_progress: 'ac-badge--warning', completed: 'ac-badge--pass', cancelled: 'ac-badge--fail' };
  return <span className={`ac-badge ${clsMap[status] || 'ac-badge--neutral'}`}>{iconMap[status] || <Clock size={12} />} {status?.replace('_', ' ')}</span>;
}

function PhotoThumbnail({ photo, onDelete }) {
  const [enlarged, setEnlarged] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => { try { const url = await assetService.files.getObjectUrl(photo.id); if (alive) setPreviewUrl(url); } catch {} })();
    return () => { alive = false; if (previewUrl) assetService.files.revokeObjectUrl(previewUrl); };
  }, [photo.id]);

  return (
    <>
      <div className="ac-photo-thumb">
        <img src={previewUrl || ''} alt={photo.description || 'Maintenance photo'} onClick={() => setEnlarged(true)} title="Click to enlarge" />
        <button className="ac-photo-delete" onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this photo?')) onDelete(photo.id); }} title="Delete photo">×</button>
      </div>
      {enlarged && (
        <div className="ac-lightbox" onClick={() => setEnlarged(false)}>
          <img src={previewUrl || ''} alt={photo.description || 'Maintenance photo'} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function DocumentItem({ document, onDelete }) {
  return (
    <div className="ac-doc-item">
      <div className="ac-doc-info">
        <FileText size={20} />
        <div>
          <div className="ac-doc-name">{document.original_filename}</div>
          <div className="ac-doc-meta">{document.mime_type} • {Math.round(document.file_size / 1024)} KB</div>
        </div>
      </div>
      <div className="ac-doc-actions">
        <button className="ac-btn-primary ac-btn-sm" onClick={async () => { const blob = await assetService.files.downloadBlob(document.id); const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60_000); }}>View</button>
        <button className="ac-btn-danger ac-btn-sm" onClick={() => { if (window.confirm('Delete this document?')) onDelete(document.id); }}>Delete</button>
      </div>
    </div>
  );
}
