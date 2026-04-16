// packages/web/src/components/StockMovementInlineManager.jsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import {
  Plus, Save, Trash2, Edit2, TrendingUp, TrendingDown,
  X, AlertTriangle, ArrowRight, Camera, FileText, Package
} from 'lucide-react';
import { assetService } from '@vineyard/shared';
import './asset-components.css';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export default function StockMovementInlineManager({ assetId, onClose, inline = false, onStockUpdate }) {
  const [movements, setMovements] = useState([]);
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const [currentMovementFiles, setCurrentMovementFiles] = useState({ photos: [], documents: [] });

  const [formData, setFormData] = useState({
    movement_type: 'purchase', movement_date: dayjs().format('YYYY-MM-DD'),
    quantity: '', unit_cost: '', total_cost: '', batch_number: '',
    expiry_date: '', supplier: '', task_id: null, block_id: null,
    usage_rate: '', area_treated: '', reference_number: '', notes: ''
  });

  useEffect(() => { loadData(); }, [assetId]);

  const loadData = async () => {
    try {
      setLoading(true); setError(null);
      const [assetData, movementsData] = await Promise.all([
        assetService.getAsset(assetId),
        assetService.stock.getAssetStockHistory(assetId, 100)
      ]);
      setAsset(assetData);
      setMovements(Array.isArray(movementsData) ? movementsData : []);
    } catch (e) { console.error('Failed to load stock movements:', e); setError('Failed to load stock movements'); }
    finally { setLoading(false); }
  };

  const loadMovementFiles = async (movementId) => {
    try {
      const [photos, documents] = await Promise.all([
        assetService.files.listFiles({ entityType: 'stock_movement', entityId: movementId, fileCategory: 'photo' }).catch(() => []),
        assetService.files.listFiles({ entityType: 'stock_movement', entityId: movementId, fileCategory: 'document' }).catch(() => [])
      ]);
      setCurrentMovementFiles({ photos: photos || [], documents: documents || [] });
    } catch (e) { console.warn('Failed to load movement files:', e); setCurrentMovementFiles({ photos: [], documents: [] }); }
  };

  const resetForm = () => ({
    movement_type: 'purchase', movement_date: dayjs().format('YYYY-MM-DD'),
    quantity: '', unit_cost: '', total_cost: '', batch_number: '',
    expiry_date: '', supplier: '', task_id: null, block_id: null,
    usage_rate: '', area_treated: '', reference_number: '', notes: ''
  });

  const handleCreate = () => { setCreating(true); setEditingId(null); setFormData(resetForm()); setCurrentMovementFiles({ photos: [], documents: [] }); };

  const handleEdit = async (movement) => {
    setEditingId(movement.id); setCreating(false);
    setFormData({
      movement_type: movement.movement_type || 'purchase',
      movement_date: movement.movement_date || dayjs().format('YYYY-MM-DD'),
      quantity: Math.abs(movement.quantity || 0).toString(),
      unit_cost: movement.unit_cost?.toString() || '', total_cost: movement.total_cost?.toString() || '',
      batch_number: movement.batch_number || '', expiry_date: movement.expiry_date || '',
      supplier: movement.supplier || '', task_id: movement.task_id || null,
      block_id: movement.block_id || null, usage_rate: movement.usage_rate?.toString() || '',
      area_treated: movement.area_treated?.toString() || '',
      reference_number: movement.reference_number || '', notes: movement.notes || ''
    });
    await loadMovementFiles(movement.id);
  };

  const handleCancel = () => { setCreating(false); setEditingId(null); setFormData(resetForm()); setCurrentMovementFiles({ photos: [], documents: [] }); };

  const handleSave = async () => {
    try {
      setBusy(true); setError(null);
      if (!formData.quantity || parseFloat(formData.quantity) === 0) { setError('Quantity is required and must not be zero'); return; }
      let finalQuantity = Math.abs(parseFloat(formData.quantity));
      if (['usage', 'disposal'].includes(formData.movement_type)) finalQuantity = -finalQuantity;
      const payload = {
        asset_id: assetId, movement_type: formData.movement_type, movement_date: formData.movement_date,
        quantity: finalQuantity, unit_cost: formData.unit_cost ? Number(formData.unit_cost) : null,
        batch_number: formData.batch_number || null, expiry_date: formData.expiry_date || null,
        supplier: formData.supplier || null, task_id: formData.task_id || null,
        block_id: formData.block_id || null, usage_rate: formData.usage_rate ? Number(formData.usage_rate) : null,
        area_treated: formData.area_treated ? Number(formData.area_treated) : null,
        reference_number: formData.reference_number || null, notes: formData.notes || null
      };
      if (payload.unit_cost) payload.total_cost = Math.abs(payload.quantity) * payload.unit_cost;
      if (creating) await assetService.stock.createStockMovement(payload);
      else if (editingId) await assetService.stock.updateStockMovement(editingId, payload);
      await loadData();
      if (onStockUpdate) onStockUpdate();
      handleCancel();
    } catch (e) {
      console.error('Failed to save stock movement:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save stock movement';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this stock movement? This will affect the current stock level.')) return;
    try { setBusy(true); await assetService.stock.deleteStockMovement(id); await loadData(); if (onStockUpdate) onStockUpdate(); }
    catch (e) { console.error('Failed to delete stock movement:', e); alert('Failed to delete stock movement'); }
    finally { setBusy(false); }
  };

  const handlePhotoUpload = async (files, movementId) => {
    if (!files?.length || !movementId) return;
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; }
        const fd = new FormData();
        fd.append('entity_type', 'stock_movement'); fd.append('entity_id', movementId);
        fd.append('file_category', 'photo'); fd.append('description', `Photo: ${file.name}`); fd.append('file', file);
        await assetService.files.uploadFile(fd);
      }
      await loadMovementFiles(movementId);
    } catch (e) { console.error('Photo upload failed:', e); alert('Photo upload failed: ' + (e?.message || 'Error')); }
    finally { setUploadingPhoto(false); if (photoInputRef.current) photoInputRef.current.value = ''; }
  };

  const handleDocumentUpload = async (files, movementId) => {
    if (!files?.length || !movementId) return;
    setUploadingDoc(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) { alert(`${file.name} exceeds 50MB limit`); continue; }
        const fd = new FormData();
        fd.append('entity_type', 'stock_movement'); fd.append('entity_id', movementId);
        fd.append('file_category', 'document'); fd.append('description', `Document: ${file.name}`); fd.append('file', file);
        await assetService.files.uploadFile(fd);
      }
      await loadMovementFiles(movementId);
    } catch (e) { console.error('Document upload failed:', e); alert('Document upload failed: ' + (e?.message || 'Error')); }
    finally { setUploadingDoc(false); if (docInputRef.current) docInputRef.current.value = ''; }
  };

  const handleDeleteFile = async (fileId, movementId) => {
    if (!window.confirm('Delete this file?')) return;
    try { await assetService.files.deleteFile(fileId); await loadMovementFiles(movementId); }
    catch (e) { console.error('Failed to delete file:', e); alert('Failed to delete file'); }
  };

  const movementTypes = assetService.helpers.getStockMovementTypes();

  const getMovementIcon = (type) => {
    switch (type) {
      case 'purchase': return <TrendingUp size={14} color="var(--color-success)" />;
      case 'usage': return <TrendingDown size={14} color="var(--color-warning)" />;
      case 'disposal': return <TrendingDown size={14} color="var(--color-danger)" />;
      case 'adjustment': return <Package size={14} color="var(--color-info)" />;
      case 'transfer': return <ArrowRight size={14} color="#8b5cf6" />;
      default: return <Package size={14} />;
    }
  };

  const content = (
    <div className={inline ? '' : 'ac-inline'}>
      {!inline && (
        <div className="ac-inline-header">
          <h3>Stock Movements</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={24} /></button>
        </div>
      )}

      {asset && (
        <div className="ac-stock-status ac-stock-status--green" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="ac-stock-sublabel">Current Stock Level</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0284c7' }}>
              {parseFloat(asset.current_stock || 0).toFixed(2)} {asset.unit_of_measure}
            </div>
          </div>
          {asset.minimum_stock && (
            <div>
              <div className="ac-stock-sublabel">Minimum Level</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0369a1' }}>
                {parseFloat(asset.minimum_stock).toFixed(2)} {asset.unit_of_measure}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="ac-error"><AlertTriangle size={16} /> {error}</div>}

      {!creating && !editingId && (
        <div style={{ marginBottom: 'var(--space-base)' }}>
          <button className="ac-btn-success" onClick={handleCreate} disabled={busy}>
            <Plus size={16} /> New Stock Movement
          </button>
        </div>
      )}

      {(creating || editingId) && (
        <div className="ac-form-panel">
          <h4>{creating ? 'New Stock Movement' : 'Edit Stock Movement'}</h4>
          <div className="ac-form-grid">
            <div className="ac-form-grid ac-form-grid--2col">
              <label>
                <div className="ac-field-label">Movement Type <span className="ac-required">*</span></div>
                <select className="ac-select" value={formData.movement_type} onChange={(e) => setFormData({ ...formData, movement_type: e.target.value })}>
                  {movementTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label>
                <div className="ac-field-label">Movement Date <span className="ac-required">*</span></div>
                <input className="ac-input" type="date" value={formData.movement_date} onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })} />
              </label>
            </div>

            <div className="ac-form-grid ac-form-grid--3col">
              <label>
                <div className="ac-field-label">Quantity <span className="ac-required">*</span></div>
                <div className="ac-input-with-unit">
                  <input className="ac-input" type="number" step="0.01" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} placeholder="0.00" />
                  <span className="ac-unit-label">{asset?.unit_of_measure || 'units'}</span>
                </div>
              </label>
              <label>
                <div className="ac-field-label">Unit Cost (NZD)</div>
                <input className="ac-input" type="number" step="0.01" value={formData.unit_cost} onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })} placeholder="0.00" disabled={formData.movement_type === 'usage' || formData.movement_type === 'disposal'} />
              </label>
              <label>
                <div className="ac-field-label">Total Cost (NZD)</div>
                <input className="ac-input" type="number" step="0.01" value={formData.unit_cost && formData.quantity ? (parseFloat(formData.unit_cost) * Math.abs(parseFloat(formData.quantity))).toFixed(2) : ''} disabled />
              </label>
            </div>

            {formData.movement_type === 'purchase' && (
              <div className="ac-form-grid ac-form-grid--3col">
                <label>
                  <div className="ac-field-label">Supplier</div>
                  <input className="ac-input" type="text" value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })} placeholder="Supplier name" />
                </label>
                <label>
                  <div className="ac-field-label">Batch Number</div>
                  <input className="ac-input" type="text" value={formData.batch_number} onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })} placeholder="Batch/Lot number" />
                </label>
                <label>
                  <div className="ac-field-label">Expiry Date</div>
                  <input className="ac-input" type="date" value={formData.expiry_date} onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} />
                </label>
              </div>
            )}

            {formData.movement_type === 'usage' && (
              <div className="ac-form-grid ac-form-grid--2col">
                <label>
                  <div className="ac-field-label">Application Rate (per ha)</div>
                  <input className="ac-input" type="number" step="0.01" value={formData.usage_rate} onChange={(e) => setFormData({ ...formData, usage_rate: e.target.value })} placeholder="0.00" />
                </label>
                <label>
                  <div className="ac-field-label">Area Treated (ha)</div>
                  <input className="ac-input" type="number" step="0.01" value={formData.area_treated} onChange={(e) => setFormData({ ...formData, area_treated: e.target.value })} placeholder="0.00" />
                </label>
              </div>
            )}

            <label>
              <div className="ac-field-label">Reference Number (Invoice/Job #)</div>
              <input className="ac-input" type="text" value={formData.reference_number} onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })} placeholder="e.g., INV-2024-001" />
            </label>

            <label>
              <div className="ac-field-label">Notes</div>
              <textarea className="ac-textarea" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." />
            </label>

            {editingId && (
              <>
                <hr className="ac-divider" />
                <div className="ac-form-grid ac-form-grid--2col">
                  <div>
                    <div className="ac-inline-header" style={{ marginBottom: 'var(--space-sm)' }}>
                      <span className="ac-field-label" style={{ marginBottom: 0 }}>Photos ({currentMovementFiles.photos.length})</span>
                      <div>
                        <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handlePhotoUpload(Array.from(e.target.files || []), editingId)} />
                        <button className="ac-btn-success ac-btn-sm" type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                          <Camera size={12} /> {uploadingPhoto ? 'Uploading...' : 'Add'}
                        </button>
                      </div>
                    </div>
                    {currentMovementFiles.photos.length > 0 && (
                      <div className="ac-photos-grid">
                        {currentMovementFiles.photos.map(photo => (
                          <div key={photo.id} className="ac-photo-thumb" style={{ width: 50, height: 50 }}>
                            <img src={assetService.files.getFileDownloadUrl(photo)} alt="Movement photo" />
                            <button className="ac-photo-delete" style={{ width: 16, height: 16, fontSize: 10, top: 2, right: 2 }} onClick={() => handleDeleteFile(photo.id, editingId)}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="ac-inline-header" style={{ marginBottom: 'var(--space-sm)' }}>
                      <span className="ac-field-label" style={{ marginBottom: 0 }}>Documents ({currentMovementFiles.documents.length})</span>
                      <div>
                        <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv" multiple style={{ display: 'none' }} onChange={(e) => handleDocumentUpload(Array.from(e.target.files || []), editingId)} />
                        <button className="ac-btn-success ac-btn-sm" type="button" onClick={() => docInputRef.current?.click()} disabled={uploadingDoc}>
                          <FileText size={12} /> {uploadingDoc ? 'Uploading...' : 'Add'}
                        </button>
                      </div>
                    </div>
                    {currentMovementFiles.documents.length > 0 && (
                      <div className="ac-parts-list">
                        {currentMovementFiles.documents.map(doc => (
                          <div key={doc.id} className="ac-part-item">
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-size-xs)' }}>{doc.original_filename}</span>
                            <button className="ac-btn-danger ac-btn-sm" onClick={() => handleDeleteFile(doc.id, editingId)}>Delete</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="ac-action-bar">
              <button className="ac-btn-cancel" onClick={handleCancel} disabled={busy}>Cancel</button>
              <button className="ac-btn-success" onClick={handleSave} disabled={busy}>
                <Save size={14} /> {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="ac-loading">Loading stock movements...</div>
      ) : movements.length === 0 ? (
        <div className="ac-empty">
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>📦</div>
          <div>No stock movements recorded yet</div>
        </div>
      ) : (
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th className="center">Quantity</th>
                <th className="center">Cost</th>
                <th className="center">Stock After</th>
                <th>Reference</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(movement => {
                const isIncoming = movement.quantity > 0;
                const quantityColor = isIncoming ? 'var(--color-success)' : 'var(--color-warning)';
                return (
                  <tr key={movement.id}>
                    <td>{dayjs(movement.movement_date).format('MMM D, YYYY')}</td>
                    <td>
                      <span className={`ac-badge ac-badge--${movement.movement_type || 'adjustment'}`}>
                        {getMovementIcon(movement.movement_type)} {movement.movement_type?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="center bold" style={{ color: quantityColor }}>
                      {isIncoming ? '+' : ''}{parseFloat(movement.quantity).toFixed(2)} {asset?.unit_of_measure}
                    </td>
                    <td className="center muted">
                      {movement.total_cost ? assetService.helpers.formatCurrency(movement.total_cost) : '—'}
                    </td>
                    <td className="center bold">
                      {movement.stock_after !== null && movement.stock_after !== undefined
                        ? `${parseFloat(movement.stock_after).toFixed(2)} ${asset?.unit_of_measure}` : '—'}
                    </td>
                    <td className="muted">{movement.reference_number || movement.supplier || '—'}</td>
                    <td className="right">
                      <div className="ac-action-bar" style={{ marginTop: 0 }}>
                        <button className="ac-btn-success ac-btn-sm" onClick={() => handleEdit(movement)} disabled={busy || creating || editingId}>
                          <Edit2 size={12} /> Edit
                        </button>
                        <button className="ac-btn-danger ac-btn-sm" onClick={() => handleDelete(movement.id)} disabled={busy || creating || editingId}>
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

  if (inline) return content;

  return createPortal(
    <div className="ac-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal--full" onClick={(e) => e.stopPropagation()}>
        <div className="ac-modal-body">{content}</div>
      </div>
    </div>,
    document.body
  );
}
