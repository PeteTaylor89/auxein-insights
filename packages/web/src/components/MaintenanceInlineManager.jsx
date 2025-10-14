// packages/mobile/src/components/MaintenanceInlineManager.jsx
import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import {
  Plus,
  Save,
  Trash2,
  Edit2,
  X,
  Camera,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { assetService } from '@vineyard/shared';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export default function MaintenanceInlineManager({ assetId, inline = false }) {
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    maintenance_type: 'scheduled',
    maintenance_category: '',
    title: '',
    description: '',
    scheduled_date: dayjs().format('YYYY-MM-DD'),
    completed_date: '',
    status: 'scheduled',
    performed_by: '',
    performed_by_user_id: null,
    performed_by_contractor_id: null,
    asset_hours_at_maintenance: '',
    asset_kilometers_at_maintenance: '',
    condition_before: '',
    condition_after: '',
    labor_hours: '',
    labor_cost: '',
    parts_cost: '',
    external_cost: '',
    parts_used: [],
    compliance_certificate_number: '',
    compliance_expiry_date: '',
    compliance_status: '',
    next_due_date: '',
    next_due_hours: '',
    next_due_kilometers: '',
    notes: ''
  });

  // Parts management
  const [newPart, setNewPart] = useState({ name: '', quantity: '', cost: '' });

  // Photos and documents
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);

  // Calculated total cost
  const [calculatedTotal, setCalculatedTotal] = useState(0);

  useEffect(() => {
    loadMaintenance();
  }, [assetId]);

  // Calculate total cost
  useEffect(() => {
    const labor = parseFloat(formData.labor_cost || 0);
    const parts = parseFloat(formData.parts_cost || 0);
    const external = parseFloat(formData.external_cost || 0);
    const total = labor + parts + external;
    setCalculatedTotal(total);
  }, [formData.labor_cost, formData.parts_cost, formData.external_cost]);

  // Auto-populate asset data when creating
  useEffect(() => {
    if (creating && assetId) {
      loadAssetData();
    }
  }, [creating, assetId]);

  const loadMaintenance = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await assetService.maintenance.listMaintenance({ 
        asset_id: assetId,
        limit: 50
      });
      setMaintenance(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load maintenance:', e);
      setError('Failed to load maintenance records');
    } finally {
      setLoading(false);
    }
  };

  const loadAssetData = async () => {
    try {
      const asset = await assetService.getAsset(assetId);
      setFormData(prev => ({
        ...prev,
        asset_hours_at_maintenance: asset.current_hours || '',
        asset_kilometers_at_maintenance: asset.current_kilometers || ''
      }));
    } catch (e) {
      console.error('Failed to load asset data:', e);
    }
  };

  const handleCreate = () => {
    setCreating(true);
    setEditingId(null);
    setFormData({
      maintenance_type: 'scheduled',
      maintenance_category: '',
      title: '',
      description: '',
      scheduled_date: dayjs().format('YYYY-MM-DD'),
      completed_date: '',
      status: 'scheduled',
      performed_by: '',
      performed_by_user_id: null,
      performed_by_contractor_id: null,
      asset_hours_at_maintenance: '',
      asset_kilometers_at_maintenance: '',
      condition_before: '',
      condition_after: '',
      labor_hours: '',
      labor_cost: '',
      parts_cost: '',
      external_cost: '',
      parts_used: [],
      compliance_certificate_number: '',
      compliance_expiry_date: '',
      compliance_status: '',
      next_due_date: '',
      next_due_hours: '',
      next_due_kilometers: '',
      notes: ''
    });
    setNewPart({ name: '', quantity: '', cost: '' });
    setPhotos([]);
    setDocuments([]);
  };

  const handleEdit = async (record) => {
    setEditingId(record.id);
    setCreating(false);
    setFormData({
      maintenance_type: record.maintenance_type || 'scheduled',
      maintenance_category: record.maintenance_category || '',
      title: record.title || '',
      description: record.description || '',
      scheduled_date: record.scheduled_date || dayjs().format('YYYY-MM-DD'),
      completed_date: record.completed_date || '',
      status: record.status || 'scheduled',
      performed_by: record.performed_by || '',
      performed_by_user_id: record.performed_by_user_id || null,
      performed_by_contractor_id: record.performed_by_contractor_id || null,
      asset_hours_at_maintenance: record.asset_hours_at_maintenance || '',
      asset_kilometers_at_maintenance: record.asset_kilometers_at_maintenance || '',
      condition_before: record.condition_before || '',
      condition_after: record.condition_after || '',
      labor_hours: record.labor_hours || '',
      labor_cost: record.labor_cost || '',
      parts_cost: record.parts_cost || '',
      external_cost: record.external_cost || '',
      parts_used: record.parts_used || [],
      compliance_certificate_number: record.compliance_certificate_number || '',
      compliance_expiry_date: record.compliance_expiry_date || '',
      compliance_status: record.compliance_status || '',
      next_due_date: record.next_due_date || '',
      next_due_hours: record.next_due_hours || '',
      next_due_kilometers: record.next_due_kilometers || '',
      notes: record.notes || ''
    });
    setNewPart({ name: '', quantity: '', cost: '' });

    // Load photos and documents
    try {
      const [photoFiles, docFiles] = await Promise.all([
        assetService.files.listMaintenanceFiles(record.id, 'photo').catch(() => []),
        assetService.files.listMaintenanceFiles(record.id).catch(() => [])
      ]);
      setPhotos(photoFiles.filter(f => f.file_category === 'photo') || []);
      setDocuments(docFiles.filter(f => f.file_category !== 'photo') || []);
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  };

  const handleCancel = () => {
    setCreating(false);
    setEditingId(null);
    setFormData({
      maintenance_type: 'scheduled',
      maintenance_category: '',
      title: '',
      description: '',
      scheduled_date: dayjs().format('YYYY-MM-DD'),
      completed_date: '',
      status: 'scheduled',
      performed_by: '',
      performed_by_user_id: null,
      performed_by_contractor_id: null,
      asset_hours_at_maintenance: '',
      asset_kilometers_at_maintenance: '',
      condition_before: '',
      condition_after: '',
      labor_hours: '',
      labor_cost: '',
      parts_cost: '',
      external_cost: '',
      parts_used: [],
      compliance_certificate_number: '',
      compliance_expiry_date: '',
      compliance_status: '',
      next_due_date: '',
      next_due_hours: '',
      next_due_kilometers: '',
      notes: ''
    });
    setNewPart({ name: '', quantity: '', cost: '' });
    setPhotos([]);
    setDocuments([]);
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError('Title is required');
      return false;
    }
    
    if (!formData.maintenance_type) {
      setError('Maintenance type is required');
      return false;
    }
    
    if (!formData.scheduled_date) {
      setError('Scheduled date is required');
      return false;
    }
    
    if (formData.status === 'completed' && !formData.performed_by) {
      setError('Performed by is required for completed maintenance');
      return false;
    }
    
    if (formData.maintenance_type === 'compliance' && formData.status === 'completed') {
      if (!formData.compliance_certificate_number) {
        setError('Certificate number required for completed compliance maintenance');
        return false;
      }
    }
    
    // Validate costs are positive
    const costs = ['labor_cost', 'parts_cost', 'external_cost'];
    for (const cost of costs) {
      if (formData[cost] && Number(formData[cost]) < 0) {
        setError(`${cost.replace('_', ' ')} must be positive`);
        return false;
      }
    }
    
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setBusy(true);
      setError(null);

      const sanitizePayload = (data) =>
        Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
        );

      const payload = sanitizePayload({
        asset_id: assetId,
        maintenance_type: formData.maintenance_type,
        maintenance_category: formData.maintenance_category || null,
        title: formData.title,
        description: formData.description || null,
        scheduled_date: formData.scheduled_date,
        completed_date: formData.completed_date || null,
        status: formData.status,
        performed_by: formData.performed_by || null,
        performed_by_user_id: formData.performed_by_user_id,
        performed_by_contractor_id: formData.performed_by_contractor_id,
        asset_hours_at_maintenance: formData.asset_hours_at_maintenance ? Number(formData.asset_hours_at_maintenance) : null,
        asset_kilometers_at_maintenance: formData.asset_kilometers_at_maintenance ? Number(formData.asset_kilometers_at_maintenance) : null,
        condition_before: formData.condition_before || null,
        condition_after: formData.condition_after || null,
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

      if (creating) {
        await assetService.maintenance.createMaintenance(payload);
      } else if (editingId) {
        await assetService.maintenance.updateMaintenance(editingId, payload);
      }

      await loadMaintenance();
      handleCancel();
    } catch (e) {
      console.error('Failed to save maintenance:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save maintenance';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this maintenance record?')) {
      return;
    }

    try {
      setBusy(true);
      await assetService.maintenance.deleteMaintenance(id);
      await loadMaintenance();
    } catch (e) {
      console.error('Failed to delete maintenance:', e);
      alert('Failed to delete maintenance');
    } finally {
      setBusy(false);
    }
  };

  // Parts management
  const handleAddPart = () => {
    if (!newPart.name || !newPart.quantity || !newPart.cost) {
      setError('Please fill in all part fields');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      parts_used: [
        ...prev.parts_used,
        {
          name: newPart.name,
          quantity: Number(newPart.quantity),
          cost: Number(newPart.cost)
        }
      ]
    }));
    
    setNewPart({ name: '', quantity: '', cost: '' });
  };

  const handleRemovePart = (index) => {
    setFormData(prev => ({
      ...prev,
      parts_used: prev.parts_used.filter((_, i) => i !== index)
    }));
  };

  // Photo upload
  const handlePhotoUpload = async (files) => {
    if (!files?.length || !editingId) {
      if (!editingId) {
        alert('Please save the maintenance record first before uploading photos');
      }
      return;
    }

    setUploadingPhoto(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`${file.name} exceeds 50MB limit`);
          continue;
        }
        await assetService.files.uploadMaintenanceFile({
          maintenanceId: editingId,
          file,
          fileCategory: 'photo',
          description: `Photo: ${file.name}`
        });
      }
      
      const photoFiles = await assetService.files.listMaintenanceFiles(editingId, 'photo');
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

  // Document upload
  const handleDocumentUpload = async (files) => {
    if (!files?.length || !editingId) {
      if (!editingId) {
        alert('Please save the maintenance record first before uploading documents');
      }
      return;
    }

    setUploadingDoc(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`${file.name} exceeds 50MB limit`);
          continue;
        }
        await assetService.files.uploadMaintenanceFile({
          maintenanceId: editingId,
          file,
          fileCategory: 'document',
          description: `Document: ${file.name}`
        });
      }
      
      const docFiles = await assetService.files.listMaintenanceFiles(editingId);
      setDocuments(docFiles.filter(f => f.file_category !== 'photo') || []);
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
      
      const [photoFiles, docFiles] = await Promise.all([
        assetService.files.listMaintenanceFiles(editingId, 'photo').catch(() => []),
        assetService.files.listMaintenanceFiles(editingId).catch(() => [])
      ]);
      setPhotos(photoFiles.filter(f => f.file_category === 'photo') || []);
      setDocuments(docFiles.filter(f => f.file_category !== 'photo') || []);
    } catch (e) {
      console.error('Failed to delete file:', e);
      alert('Failed to delete file');
    }
  };

  const maintenanceTypes = assetService.helpers.getMaintenanceTypes();
  const maintenanceStatuses = assetService.helpers.getMaintenanceStatuses();

  const content = (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: inline ? '0' : '1.25rem',
      boxShadow: inline ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '0.75rem',
          marginBottom: '1rem',
          color: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem'
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Add New Button */}
      {!creating && !editingId && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={handleCreate}
            disabled={busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Plus size={16} /> New Maintenance
          </button>
        </div>
      )}

      {/* Form for Create/Edit */}
      {(creating || editingId) && (
        <div style={{
          border: '2px solid #8b5cf6',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          background: '#faf5ff'
        }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.938rem', fontWeight: '600' }}>
            {creating ? 'New Maintenance Record' : 'Edit Maintenance Record'}
          </h4>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {/* BASIC INFORMATION */}
            <div style={{ 
              padding: '0.75rem', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                Basic Information
              </h5>
              
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <label>
                  <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                    Title <span style={{ color: '#ef4444' }}>*</span>
                  </div>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Regular Service"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.813rem'
                    }}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Maintenance Type <span style={{ color: '#ef4444' }}>*</span>
                    </div>
                    <select
                      value={formData.maintenance_type}
                      onChange={(e) => setFormData({ ...formData, maintenance_type: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem',
                        background: 'white'
                      }}
                    >
                      {maintenanceTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Category
                    </div>
                    <select
                      value={formData.maintenance_category}
                      onChange={(e) => setFormData({ ...formData, maintenance_category: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem',
                        background: 'white'
                      }}
                    >
                      <option value="">Select category</option>
                      <option value="service">Service</option>
                      <option value="repair">Repair</option>
                      <option value="inspection">Inspection</option>
                      <option value="wof">WOF</option>
                      <option value="registration">Registration</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Scheduled Date <span style={{ color: '#ef4444' }}>*</span>
                    </div>
                    <input
                      type="date"
                      value={formData.scheduled_date}
                      onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Completed Date
                    </div>
                    <input
                      type="date"
                      value={formData.completed_date}
                      onChange={(e) => setFormData({ ...formData, completed_date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Status
                    </div>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem',
                        background: 'white'
                      }}
                    >
                      {maintenanceStatuses.map(s => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                    Description
                  </div>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe the maintenance work..."
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.813rem',
                      fontFamily: 'inherit'
                    }}
                  />
                </label>
              </div>
            </div>

            {/* EXECUTION DETAILS */}
            <div style={{ 
              padding: '0.75rem', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                Execution Details
              </h5>
              
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <label>
                  <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                    Performed By {formData.status === 'completed' && <span style={{ color: '#ef4444' }}>*</span>}
                  </div>
                  <input
                    type="text"
                    value={formData.performed_by}
                    onChange={(e) => setFormData({ ...formData, performed_by: e.target.value })}
                    placeholder="Name or initials"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.813rem'
                    }}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Asset Hours at Maintenance
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.asset_hours_at_maintenance}
                      onChange={(e) => setFormData({ ...formData, asset_hours_at_maintenance: e.target.value })}
                      placeholder="0.0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Asset Kilometers at Maintenance
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.asset_kilometers_at_maintenance}
                      onChange={(e) => setFormData({ ...formData, asset_kilometers_at_maintenance: e.target.value })}
                      placeholder="0.0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Condition Before
                    </div>
                    <select
                      value={formData.condition_before}
                      onChange={(e) => setFormData({ ...formData, condition_before: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem',
                        background: 'white'
                      }}
                    >
                      <option value="">Select condition</option>
                      <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                    </select>
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Condition After
                    </div>
                    <select
                      value={formData.condition_after}
                      onChange={(e) => setFormData({ ...formData, condition_after: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem',
                        background: 'white'
                      }}
                    >
                      <option value="">Select condition</option>
                      <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            {/* COST TRACKING */}
            <div style={{ 
              padding: '0.75rem', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                Cost Tracking
              </h5>
              
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Labor Hours
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.labor_hours}
                      onChange={(e) => setFormData({ ...formData, labor_hours: e.target.value })}
                      placeholder="0.0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Labor Cost (NZD)
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.labor_cost}
                      onChange={(e) => setFormData({ ...formData, labor_cost: e.target.value })}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      Parts Cost (NZD)
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.parts_cost}
                      onChange={(e) => setFormData({ ...formData, parts_cost: e.target.value })}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>

                  <label>
                    <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                      External Cost (NZD)
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.external_cost}
                      onChange={(e) => setFormData({ ...formData, external_cost: e.target.value })}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    />
                  </label>
                </div>

                {/* Total Cost Display */}
                <div style={{
                  padding: '0.75rem',
                  background: '#f0fdf4',
                  border: '2px solid #22c55e',
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '0.25rem' }}>
                    Total Cost
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#166534' }}>
                    ${calculatedTotal.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* PARTS USED */}
            <div style={{ 
              padding: '0.75rem', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                Parts Used
              </h5>
              
              {/* Add Part Form */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '2fr 1fr 1fr auto', 
                gap: '0.5rem',
                marginBottom: '0.75rem',
                alignItems: 'end'
              }}>
                <input
                  type="text"
                  value={newPart.name}
                  onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                  placeholder="Part name"
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem'
                  }}
                />
                <input
                  type="number"
                  step="0.1"
                  value={newPart.quantity}
                  onChange={(e) => setNewPart({ ...newPart, quantity: e.target.value })}
                  placeholder="Qty"
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem'
                  }}
                />
                <input
                  type="number"
                  step="0.01"
                  value={newPart.cost}
                  onChange={(e) => setNewPart({ ...newPart, cost: e.target.value })}
                  placeholder="Cost"
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem'
                  }}
                />
                <button
                  onClick={handleAddPart}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.813rem',
                    fontWeight: '500'
                  }}
                >
                  Add
                </button>
              </div>

              {/* Parts List */}
              {formData.parts_used.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {formData.parts_used.map((part, index) => (
                    <div 
                      key={index}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem',
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        fontSize: '0.813rem'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <strong>{part.name}</strong>
                      </div>
                      <div style={{ width: '80px', textAlign: 'center', color: '#6b7280' }}>
                        Qty: {part.quantity}
                      </div>
                      <div style={{ width: '100px', textAlign: 'right', color: '#6b7280' }}>
                        ${parseFloat(part.cost).toFixed(2)}
                      </div>
                      <button
                        onClick={() => handleRemovePart(index)}
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '1rem', 
                  color: '#9ca3af',
                  fontSize: '0.813rem',
                  fontStyle: 'italic'
                }}>
                  No parts added yet
                </div>
              )}
            </div>

            {/* COMPLIANCE (conditional) */}
            {formData.maintenance_type === 'compliance' && (
              <div style={{ 
                padding: '0.75rem', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                  Compliance Details
                </h5>
                
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                    <label>
                      <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                        Certificate Number
                      </div>
                      <input
                        type="text"
                        value={formData.compliance_certificate_number}
                        onChange={(e) => setFormData({ ...formData, compliance_certificate_number: e.target.value })}
                        placeholder="e.g., WOF123456"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.813rem'
                        }}
                      />
                    </label>

                    <label>
                      <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                        Expiry Date
                      </div>
                      <input
                        type="date"
                        value={formData.compliance_expiry_date}
                        onChange={(e) => setFormData({ ...formData, compliance_expiry_date: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.813rem'
                        }}
                      />
                    </label>

                    <label>
                      <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                        Status
                      </div>
                      <select
                        value={formData.compliance_status}
                        onChange={(e) => setFormData({ ...formData, compliance_status: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.813rem',
                          background: 'white'
                        }}
                      >
                        <option value="">Select status</option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                        <option value="conditional">Conditional</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* PHOTOS (edit mode only) */}
            {editingId && (
              <div style={{ 
                padding: '0.75rem', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem'
                }}>
                  <h5 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                    Photos
                  </h5>
                  <div>
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
                        padding: '0.375rem 0.75rem',
                        background: uploadingPhoto ? '#9ca3af' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: uploadingPhoto ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '500'
                      }}
                    >
                      <Camera size={14} /> {uploadingPhoto ? 'Uploading...' : 'Upload Photos'}
                    </button>
                  </div>
                </div>
                
                {photos.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '1rem', 
                    color: '#9ca3af',
                    fontSize: '0.813rem',
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
              </div>
            )}

            {/* DOCUMENTS (edit mode only) */}
            {editingId && (
              <div style={{ 
                padding: '0.75rem', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem'
                }}>
                  <h5 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                    Documents
                  </h5>
                  <div>
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
                        padding: '0.375rem 0.75rem',
                        background: uploadingDoc ? '#9ca3af' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '500'
                      }}
                    >
                      <FileText size={14} /> {uploadingDoc ? 'Uploading...' : 'Upload Documents'}
                    </button>
                  </div>
                </div>
                
                {documents.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '1rem', 
                    color: '#9ca3af',
                    fontSize: '0.813rem',
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
              </div>
            )}

            {/* NOTES */}
            <div style={{ 
              padding: '0.75rem', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                Notes
              </h5>
              
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes and observations..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.813rem',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancel}
                disabled={busy}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={busy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: busy ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                <Save size={16} /> {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance History Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Loading maintenance records...
        </div>
      ) : maintenance.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic',
          fontSize: '0.875rem'
        }}>
          No maintenance records yet
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.813rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Title</th>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Performed By</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Total Cost</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {maintenance.map(record => (
                <tr key={record.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>
                    {dayjs(record.scheduled_date).format('MMM D, YYYY')}
                  </td>
                  <td style={{ padding: 10, fontWeight: '500' }}>
                    {record.title}
                  </td>
                  <td style={{ padding: 10, textTransform: 'capitalize' }}>
                    {record.maintenance_type?.replace('_', ' ')}
                  </td>
                  <td style={{ padding: 10, color: '#6b7280' }}>
                    {record.performed_by || '—'}
                  </td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    <StatusBadge status={record.status} />
                  </td>
                  <td style={{ padding: 10, textAlign: 'right', fontWeight: '600' }}>
                    {record.total_cost ? `$${parseFloat(record.total_cost).toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleEdit(record)}
                        disabled={busy || creating || editingId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '0.25rem 0.5rem',
                          background: '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: (busy || creating || editingId) ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        disabled={busy || creating || editingId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '0.25rem 0.5rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: (busy || creating || editingId) ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
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

// Helper Components
function StatusBadge({ status }) {
  const colors = {
    scheduled: { bg: '#dbeafe', color: '#1e40af', icon: <Clock size={12} /> },
    in_progress: { bg: '#fef3c7', color: '#92400e', icon: <Clock size={12} /> },
    completed: { bg: '#dcfce7', color: '#166534', icon: <CheckCircle size={12} /> },
    cancelled: { bg: '#fee2e2', color: '#991b1b', icon: <XCircle size={12} /> }
  };

  const style = colors[status] || { bg: '#f3f4f6', color: '#374151', icon: <Clock size={12} /> };

  return (
    <span style={{
      background: style.bg,
      color: style.color,
      padding: '0.25rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontWeight: '600',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      textTransform: 'capitalize'
    }}>
      {style.icon}
      {status?.replace('_', ' ')}
    </span>
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
  }, [photo.id]);

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
          alt={photo.description || 'Maintenance photo'} 
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
            alt={photo.description || 'Maintenance photo'} 
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