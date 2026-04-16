// packages/web/src/components/QuickStockAdjustment.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import {
  X, Plus, Minus, Save, Package, AlertCircle, TrendingUp, TrendingDown
} from 'lucide-react';
import { assetService } from '@vineyard/shared';
import './asset-components.css';

export default function QuickStockAdjustment({ isOpen, onClose, onSuccess, initialAssetId = null }) {
  const [consumables, setConsumables] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    adjustment_type: 'add', quantity: '',
    movement_date: dayjs().format('YYYY-MM-DD'), reason: 'purchase', notes: ''
  });

  useEffect(() => { if (isOpen) { loadConsumables(); resetForm(); } }, [isOpen]);

  useEffect(() => {
    if (initialAssetId && consumables.length > 0) {
      const asset = consumables.find(c => c.id === initialAssetId);
      if (asset) setSelectedAsset(asset);
    }
  }, [initialAssetId, consumables]);

  const loadConsumables = async () => {
    try {
      setLoading(true); setError(null);
      const data = await assetService.listAssets({ category: 'consumable', asset_type: 'consumable', status: 'active' });
      setConsumables(data || []);
    } catch (e) { console.error('Failed to load consumables:', e); setError('Failed to load consumables'); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    if (!initialAssetId) setSelectedAsset(null);
    setFormData({ adjustment_type: 'add', quantity: '', movement_date: dayjs().format('YYYY-MM-DD'), reason: 'purchase', notes: '' });
    setError(null);
  };

  const handleAssetSelect = (assetId) => {
    const asset = consumables.find(c => c.id === parseInt(assetId));
    setSelectedAsset(asset);
  };

  const handleSubmit = async () => {
    try {
      setSaving(true); setError(null);
      if (!selectedAsset) { setError('Please select a consumable'); return; }
      if (!formData.quantity || parseFloat(formData.quantity) <= 0) { setError('Please enter a valid quantity'); return; }

      let movementType = 'adjustment';
      if (formData.reason === 'purchase' && formData.adjustment_type === 'add') movementType = 'purchase';
      else if (formData.reason === 'usage' && formData.adjustment_type === 'subtract') movementType = 'usage';
      else if (formData.reason === 'damaged' && formData.adjustment_type === 'subtract') movementType = 'disposal';

      let finalQuantity = Math.abs(parseFloat(formData.quantity));
      if (formData.adjustment_type === 'subtract') finalQuantity = -finalQuantity;

      if (finalQuantity < 0) {
        const currentStock = parseFloat(selectedAsset.current_stock || 0);
        if (currentStock + finalQuantity < 0) { setError(`Insufficient stock. Current: ${currentStock} ${selectedAsset.unit_of_measure}`); return; }
      }

      const payload = {
        asset_id: selectedAsset.id, movement_type: movementType, movement_date: formData.movement_date,
        quantity: finalQuantity, reference_number: formData.reason === 'purchase' ? 'Quick Adjustment' : null,
        notes: formData.notes || `Quick adjustment: ${formData.reason}`
      };
      await assetService.stock.createStockMovement(payload);
      if (onSuccess) onSuccess();
      alert(`Stock ${formData.adjustment_type === 'add' ? 'added' : 'removed'} successfully!`);
      onClose();
    } catch (e) {
      console.error('Failed to save stock adjustment:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save adjustment';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally { setSaving(false); }
  };

  const getStockStatus = (asset) => asset ? assetService.helpers.formatStockStatus(asset) : null;

  const reasonOptions = {
    add: [
      { value: 'purchase', label: 'Purchase/Delivery' }, { value: 'return', label: 'Return from Field' },
      { value: 'found', label: 'Stock Found' }, { value: 'correction', label: 'Correction' }
    ],
    subtract: [
      { value: 'usage', label: 'Used in Field' }, { value: 'damaged', label: 'Damaged/Spoiled' },
      { value: 'lost', label: 'Lost/Missing' }, { value: 'correction', label: 'Correction' }
    ]
  };

  if (!isOpen) return null;

  const stockStatus = selectedAsset ? getStockStatus(selectedAsset) : null;

  return createPortal(
    <div className="ac-overlay" onClick={onClose}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3><Package size={20} /> Quick Stock Adjustment</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="ac-modal-body">
          {error && <div className="ac-error"><AlertCircle size={16} /> {error}</div>}

          {loading ? (
            <div className="ac-loading">Loading consumables...</div>
          ) : (
            <div className="ac-form-grid">
              <label>
                <div className="ac-field-label">Select Consumable <span className="ac-required">*</span></div>
                <select className="ac-select" value={selectedAsset?.id || ''} onChange={(e) => handleAssetSelect(e.target.value)} disabled={saving}>
                  <option value="">— Select a consumable —</option>
                  {consumables.map(asset => (
                    <option key={asset.id} value={asset.id}>{asset.name} ({asset.current_stock || 0} {asset.unit_of_measure})</option>
                  ))}
                </select>
              </label>

              {selectedAsset && stockStatus && (
                <div className={`ac-stock-status ac-stock-status--${stockStatus.color}`}>
                  <span className="ac-stock-icon">{stockStatus.icon}</span>
                  <div>
                    <div className="ac-stock-label">Current Stock: {parseFloat(selectedAsset.current_stock || 0).toFixed(2)} {selectedAsset.unit_of_measure}</div>
                    {selectedAsset.minimum_stock && <div className="ac-stock-sublabel">Minimum: {parseFloat(selectedAsset.minimum_stock).toFixed(2)} {selectedAsset.unit_of_measure}</div>}
                  </div>
                </div>
              )}

              <div>
                <div className="ac-field-label">Adjustment Type <span className="ac-required">*</span></div>
                <div className="ac-toggle-group">
                  <button type="button" className={`ac-toggle-btn ${formData.adjustment_type === 'add' ? 'active--add' : ''}`} onClick={() => setFormData({ ...formData, adjustment_type: 'add', reason: 'purchase' })} disabled={saving}>
                    <Plus size={16} /> Add Stock
                  </button>
                  <button type="button" className={`ac-toggle-btn ${formData.adjustment_type === 'subtract' ? 'active--subtract' : ''}`} onClick={() => setFormData({ ...formData, adjustment_type: 'subtract', reason: 'usage' })} disabled={saving}>
                    <Minus size={16} /> Remove Stock
                  </button>
                </div>
              </div>

              <label>
                <div className="ac-field-label">Quantity <span className="ac-required">*</span></div>
                <div className="ac-input-with-unit">
                  <input className="ac-input" type="number" step="0.01" min="0" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} placeholder="0.00" disabled={saving || !selectedAsset} />
                  <span className="ac-unit-label">{selectedAsset?.unit_of_measure || 'units'}</span>
                </div>
              </label>

              <label>
                <div className="ac-field-label">Reason <span className="ac-required">*</span></div>
                <select className="ac-select" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} disabled={saving}>
                  {reasonOptions[formData.adjustment_type].map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </label>

              <label>
                <div className="ac-field-label">Date</div>
                <input className="ac-input" type="date" value={formData.movement_date} onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })} disabled={saving} />
              </label>

              <label>
                <div className="ac-field-label">Notes</div>
                <textarea className="ac-textarea" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." disabled={saving} />
              </label>

              {selectedAsset && formData.quantity && (
                <div className="ac-preview">
                  <div className="ac-preview-label">Preview:</div>
                  <div className="ac-preview-text">
                    {parseFloat(selectedAsset.current_stock || 0).toFixed(2)} {selectedAsset.unit_of_measure}{' '}
                    {formData.adjustment_type === 'add' ? (
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                        <TrendingUp size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> +{parseFloat(formData.quantity).toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                        <TrendingDown size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> -{parseFloat(formData.quantity).toFixed(2)}
                      </span>
                    )}
                    {' '} → <span style={{ fontWeight: 700 }}>
                      {(parseFloat(selectedAsset.current_stock || 0) + (formData.adjustment_type === 'add' ? parseFloat(formData.quantity) : -parseFloat(formData.quantity))).toFixed(2)} {selectedAsset.unit_of_measure}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ac-btn-success" onClick={handleSubmit} disabled={saving || !selectedAsset || !formData.quantity}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Adjustment'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
