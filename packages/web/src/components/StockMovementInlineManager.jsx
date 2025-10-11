// packages/mobile/src/components/StockMovementInlineManager.jsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import {
  Plus,
  Save,
  Trash2,
  Edit2,
  TrendingUp,
  TrendingDown,
  X,
  AlertTriangle,
  ArrowRight,
  Camera,
  FileText,
  Package
} from 'lucide-react';
import { assetService } from '@vineyard/shared';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export default function StockMovementInlineManager({ assetId, onClose, inline = false, onStockUpdate }) {
  const [movements, setMovements] = useState([]);
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // File uploads for current movement
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const [currentMovementFiles, setCurrentMovementFiles] = useState({ photos: [], documents: [] });

  // Form state for new/edit movement
  const [formData, setFormData] = useState({
    movement_type: 'purchase',
    movement_date: dayjs().format('YYYY-MM-DD'),
    quantity: '',
    unit_cost: '',
    total_cost: '',
    batch_number: '',
    expiry_date: '',
    supplier: '',
    task_id: null,
    block_id: null,
    usage_rate: '',
    area_treated: '',
    reference_number: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [assetId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [assetData, movementsData] = await Promise.all([
        assetService.getAsset(assetId),
        assetService.stock.getAssetStockHistory(assetId, 100)
      ]);
      
      setAsset(assetData);
      setMovements(Array.isArray(movementsData) ? movementsData : []);
    } catch (e) {
      console.error('Failed to load stock movements:', e);
      setError('Failed to load stock movements');
    } finally {
      setLoading(false);
    }
  };

  const loadMovementFiles = async (movementId) => {
    try {
      const [photos, documents] = await Promise.all([
        assetService.files.listFiles({ 
          entityType: 'stock_movement', 
          entityId: movementId, 
          fileCategory: 'photo' 
        }).catch(() => []),
        assetService.files.listFiles({ 
          entityType: 'stock_movement', 
          entityId: movementId, 
          fileCategory: 'document' 
        }).catch(() => [])
      ]);
      
      setCurrentMovementFiles({ 
        photos: photos || [], 
        documents: documents || [] 
      });
    } catch (e) {
      console.warn('Failed to load movement files:', e);
      setCurrentMovementFiles({ photos: [], documents: [] });
    }
  };

  const handleCreate = () => {
    setCreating(true);
    setEditingId(null);
    setFormData({
      movement_type: 'purchase',
      movement_date: dayjs().format('YYYY-MM-DD'),
      quantity: '',
      unit_cost: '',
      total_cost: '',
      batch_number: '',
      expiry_date: '',
      supplier: '',
      task_id: null,
      block_id: null,
      usage_rate: '',
      area_treated: '',
      reference_number: '',
      notes: ''
    });
    setCurrentMovementFiles({ photos: [], documents: [] });
  };

  const handleEdit = async (movement) => {
    setEditingId(movement.id);
    setCreating(false);
    setFormData({
      movement_type: movement.movement_type || 'purchase',
      movement_date: movement.movement_date || dayjs().format('YYYY-MM-DD'),
      quantity: Math.abs(movement.quantity || 0).toString(),
      unit_cost: movement.unit_cost?.toString() || '',
      total_cost: movement.total_cost?.toString() || '',
      batch_number: movement.batch_number || '',
      expiry_date: movement.expiry_date || '',
      supplier: movement.supplier || '',
      task_id: movement.task_id || null,
      block_id: movement.block_id || null,
      usage_rate: movement.usage_rate?.toString() || '',
      area_treated: movement.area_treated?.toString() || '',
      reference_number: movement.reference_number || '',
      notes: movement.notes || ''
    });
    
    // Load files for this movement
    await loadMovementFiles(movement.id);
  };

  const handleCancel = () => {
    setCreating(false);
    setEditingId(null);
    setFormData({
      movement_type: 'purchase',
      movement_date: dayjs().format('YYYY-MM-DD'),
      quantity: '',
      unit_cost: '',
      total_cost: '',
      batch_number: '',
      expiry_date: '',
      supplier: '',
      task_id: null,
      block_id: null,
      usage_rate: '',
      area_treated: '',
      reference_number: '',
      notes: ''
    });
    setCurrentMovementFiles({ photos: [], documents: [] });
  };

  const handleSave = async () => {
    try {
      setBusy(true);
      setError(null);

      // Validation
      if (!formData.quantity || parseFloat(formData.quantity) === 0) {
        setError('Quantity is required and must not be zero');
        return;
      }

      // Calculate quantity with sign based on movement type
      let finalQuantity = Math.abs(parseFloat(formData.quantity));
      if (['usage', 'disposal'].includes(formData.movement_type)) {
        finalQuantity = -finalQuantity; // Negative for outgoing
      }

      const payload = {
        asset_id: assetId,
        movement_type: formData.movement_type,
        movement_date: formData.movement_date,
        quantity: finalQuantity,
        unit_cost: formData.unit_cost ? Number(formData.unit_cost) : null,
        batch_number: formData.batch_number || null,
        expiry_date: formData.expiry_date || null,
        supplier: formData.supplier || null,
        task_id: formData.task_id || null,
        block_id: formData.block_id || null,
        usage_rate: formData.usage_rate ? Number(formData.usage_rate) : null,
        area_treated: formData.area_treated ? Number(formData.area_treated) : null,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null
      };

      // Calculate total cost if unit cost is provided
      if (payload.unit_cost) {
        payload.total_cost = Math.abs(payload.quantity) * payload.unit_cost;
      }

      if (creating) {
        await assetService.stock.createStockMovement(payload);
      } else if (editingId) {
        await assetService.stock.updateStockMovement(editingId, payload);
      }

      await loadData();
      
      // Notify parent to update asset stock
      if (onStockUpdate) {
        onStockUpdate();
      }
      
      handleCancel();
    } catch (e) {
      console.error('Failed to save stock movement:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save stock movement';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this stock movement? This will affect the current stock level.')) {
      return;
    }

    try {
      setBusy(true);
      await assetService.stock.deleteStockMovement(id);
      await loadData();
      
      // Notify parent to update asset stock
      if (onStockUpdate) {
        onStockUpdate();
      }
    } catch (e) {
      console.error('Failed to delete stock movement:', e);
      alert('Failed to delete stock movement');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoUpload = async (files, movementId) => {
    if (!files?.length || !movementId) return;

    setUploadingPhoto(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`${file.name} exceeds 50MB limit`);
          continue;
        }
        
        const formData = new FormData();
        formData.append('entity_type', 'stock_movement');
        formData.append('entity_id', movementId);
        formData.append('file_category', 'photo');
        formData.append('description', `Photo: ${file.name}`);
        formData.append('file', file);

        await assetService.files.uploadFile(formData);
      }
      
      // Reload files
      await loadMovementFiles(movementId);
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

  const handleDocumentUpload = async (files, movementId) => {
    if (!files?.length || !movementId) return;

    setUploadingDoc(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`${file.name} exceeds 50MB limit`);
          continue;
        }
        
        const formData = new FormData();
        formData.append('entity_type', 'stock_movement');
        formData.append('entity_id', movementId);
        formData.append('file_category', 'document');
        formData.append('description', `Document: ${file.name}`);
        formData.append('file', file);

        await assetService.files.uploadFile(formData);
      }
      
      // Reload files
      await loadMovementFiles(movementId);
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

  const handleDeleteFile = async (fileId, movementId) => {
    if (!window.confirm('Delete this file?')) return;
    
    try {
      await assetService.files.deleteFile(fileId);
      await loadMovementFiles(movementId);
    } catch (e) {
      console.error('Failed to delete file:', e);
      alert('Failed to delete file');
    }
  };

  const movementTypes = assetService.helpers.getStockMovementTypes();

  const getMovementIcon = (type) => {
    switch (type) {
      case 'purchase':
        return <TrendingUp size={14} color="#10b981" />;
      case 'usage':
        return <TrendingDown size={14} color="#f59e0b" />;
      case 'disposal':
        return <TrendingDown size={14} color="#ef4444" />;
      case 'adjustment':
        return <Package size={14} color="#3b82f6" />;
      case 'transfer':
        return <ArrowRight size={14} color="#8b5cf6" />;
      default:
        return <Package size={14} />;
    }
  };

  const content = (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: inline ? '0' : '1.25rem',
      boxShadow: inline ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Header */}
      {!inline && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #f3f4f6'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
            Stock Movements
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#6b7280'
            }}
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Current Stock Info */}
      {asset && (
        <div style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '8px',
          padding: '0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#0c4a6e', marginBottom: '0.125rem' }}>
              Current Stock Level
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0284c7' }}>
              {parseFloat(asset.current_stock || 0).toFixed(2)} {asset.unit_of_measure}
            </div>
          </div>
          {asset.minimum_stock && (
            <div>
              <div style={{ fontSize: '0.75rem', color: '#0c4a6e', marginBottom: '0.125rem' }}>
                Minimum Level
              </div>
              <div style={{ fontSize: '1rem', fontWeight: '600', color: '#0369a1' }}>
                {parseFloat(asset.minimum_stock).toFixed(2)} {asset.unit_of_measure}
              </div>
            </div>
          )}
        </div>
      )}

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
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Plus size={16} /> New Stock Movement
          </button>
        </div>
      )}

      {/* Form for Create/Edit */}
      {(creating || editingId) && (
        <div style={{
          border: '2px solid #10b981',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          background: '#f0f9ff'
        }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.938rem', fontWeight: '600' }}>
            {creating ? 'New Stock Movement' : 'Edit Stock Movement'}
          </h4>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {/* Movement Type & Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Movement Type <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <select
                  value={formData.movement_type}
                  onChange={(e) => setFormData({ ...formData, movement_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem'
                  }}
                >
                  {movementTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Movement Date <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <input
                  type="date"
                  value={formData.movement_date}
                  onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })}
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

            {/* Quantity & Cost */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Quantity <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.813rem'
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: '30px' }}>
                    {asset?.unit_of_measure || 'units'}
                  </span>
                </div>
              </label>

              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Unit Cost (NZD)
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                  placeholder="0.00"
                  disabled={formData.movement_type === 'usage' || formData.movement_type === 'disposal'}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem',
                    background: (formData.movement_type === 'usage' || formData.movement_type === 'disposal') ? '#f3f4f6' : 'white'
                  }}
                />
              </label>

              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Total Cost (NZD)
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={
                    formData.unit_cost && formData.quantity 
                      ? (parseFloat(formData.unit_cost) * Math.abs(parseFloat(formData.quantity))).toFixed(2)
                      : ''
                  }
                  disabled
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem',
                    background: '#f3f4f6'
                  }}
                />
              </label>
            </div>

            {/* Purchase-specific fields */}
            {formData.movement_type === 'purchase' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <label>
                  <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                    Supplier
                  </div>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    placeholder="Supplier name"
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
                    Batch Number
                  </div>
                  <input
                    type="text"
                    value={formData.batch_number}
                    onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                    placeholder="Batch/Lot number"
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
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
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
            )}

            {/* Usage-specific fields */}
            {formData.movement_type === 'usage' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label>
                  <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                    Application Rate (per ha)
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.usage_rate}
                    onChange={(e) => setFormData({ ...formData, usage_rate: e.target.value })}
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
                    Area Treated (ha)
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.area_treated}
                    onChange={(e) => setFormData({ ...formData, area_treated: e.target.value })}
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
            )}

            {/* Reference & Notes */}
            <label>
              <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                Reference Number (Invoice/Job #)
              </div>
              <input
                type="text"
                value={formData.reference_number}
                onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                placeholder="e.g., INV-2024-001"
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
                Notes
              </div>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
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

            {/* File Uploads - Only show for editing existing movements */}
            {editingId && (
              <div style={{
                borderTop: '1px solid #e5e7eb',
                paddingTop: '0.75rem',
                marginTop: '0.5rem'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {/* Photos */}
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{ fontSize: '0.813rem', fontWeight: '500' }}>
                        Photos ({currentMovementFiles.photos.length})
                      </span>
                      <>
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          style={{ display: 'none' }}
                          onChange={(e) => handlePhotoUpload(Array.from(e.target.files || []), editingId)}
                        />
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={uploadingPhoto}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: uploadingPhoto ? 'not-allowed' : 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          <Camera size={12} /> {uploadingPhoto ? 'Uploading...' : 'Add'}
                        </button>
                      </>
                    </div>
                    {currentMovementFiles.photos.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {currentMovementFiles.photos.map(photo => (
                          <div
                            key={photo.id}
                            style={{
                              position: 'relative',
                              width: '50px',
                              height: '50px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            <img
                              src={assetService.files.getFileDownloadUrl(photo)}
                              alt="Movement photo"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <button
                              onClick={() => handleDeleteFile(photo.id, editingId)}
                              style={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                background: 'rgba(220, 38, 38, 0.9)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: 16,
                                height: 16,
                                fontSize: 10,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Documents */}
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{ fontSize: '0.813rem', fontWeight: '500' }}>
                        Documents ({currentMovementFiles.documents.length})
                      </span>
                      <>
                        <input
                          ref={docInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv"
                          multiple
                          style={{ display: 'none' }}
                          onChange={(e) => handleDocumentUpload(Array.from(e.target.files || []), editingId)}
                        />
                        <button
                          type="button"
                          onClick={() => docInputRef.current?.click()}
                          disabled={uploadingDoc}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          <FileText size={12} /> {uploadingDoc ? 'Uploading...' : 'Add'}
                        </button>
                      </>
                    </div>
                    {currentMovementFiles.documents.length > 0 && (
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        {currentMovementFiles.documents.map(doc => (
                          <div
                            key={doc.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.25rem',
                              background: '#f9fafb',
                              borderRadius: '4px',
                              fontSize: '0.75rem'
                            }}
                          >
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.original_filename}
                            </span>
                            <button
                              onClick={() => handleDeleteFile(doc.id, editingId)}
                              style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                padding: '2px 6px',
                                fontSize: 10,
                                cursor: 'pointer'
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
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
                  fontSize: '0.813rem',
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
                  background: busy ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: '0.813rem',
                  fontWeight: '500'
                }}
              >
                <Save size={14} /> {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Movements List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          Loading stock movements...
        </div>
      ) : movements.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</div>
          <div>No stock movements recorded yet</div>
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
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Quantity</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Cost</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Stock After</th>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Reference</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(movement => {
                const isIncoming = movement.quantity > 0;
                const quantityColor = isIncoming ? '#10b981' : '#f59e0b';
                
                return (
                  <tr key={movement.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10 }}>
                      {dayjs(movement.movement_date).format('MMM D, YYYY')}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.25rem',
                        textTransform: 'capitalize'
                      }}>
                        {getMovementIcon(movement.movement_type)}
                        {movement.movement_type?.replace('_', ' ')}
                      </div>
                    </td>
                    <td style={{ 
                      padding: 10, 
                      textAlign: 'center', 
                      fontWeight: '600',
                      color: quantityColor
                    }}>
                      {isIncoming ? '+' : ''}{parseFloat(movement.quantity).toFixed(2)} {asset?.unit_of_measure}
                    </td>
                    <td style={{ padding: 10, textAlign: 'center', color: '#6b7280' }}>
                      {movement.total_cost 
                        ? assetService.helpers.formatCurrency(movement.total_cost)
                        : '—'
                      }
                    </td>
                    <td style={{ padding: 10, textAlign: 'center', fontWeight: '500' }}>
                      {movement.stock_after !== null && movement.stock_after !== undefined
                        ? `${parseFloat(movement.stock_after).toFixed(2)} ${asset?.unit_of_measure}`
                        : '—'
                      }
                    </td>
                    <td style={{ padding: 10, fontSize: '0.75rem', color: '#6b7280' }}>
                      {movement.reference_number || movement.supplier || '—'}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleEdit(movement)}
                          disabled={busy || creating || editingId}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0.25rem 0.5rem',
                            background: '#10b981',
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
                          onClick={() => handleDelete(movement.id)}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // If inline mode, just return the content
  if (inline) {
    return content;
  }

  // Otherwise, render as a modal
  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '1rem'
    }}
    onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          width: '90vw',
          maxWidth: '1200px',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: '1.25rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>,
    document.body
  );
}