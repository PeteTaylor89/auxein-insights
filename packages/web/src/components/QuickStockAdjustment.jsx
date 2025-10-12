// packages/mobile/src/components/QuickStockAdjustment.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import {
  X,
  Plus,
  Minus,
  Save,
  Package,
  AlertCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { assetService } from '@vineyard/shared';

export default function QuickStockAdjustment({ isOpen, onClose, onSuccess, initialAssetId = null }) {  // ADD initialAssetId prop
  const [consumables, setConsumables] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    adjustment_type: 'add',
    quantity: '',
    movement_date: dayjs().format('YYYY-MM-DD'),
    reason: 'purchase',
    notes: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadConsumables();
      resetForm();
    }
  }, [isOpen]);

  // NEW: Pre-select asset when initialAssetId changes
  useEffect(() => {
    if (initialAssetId && consumables.length > 0) {
      const asset = consumables.find(c => c.id === initialAssetId);
      if (asset) {
        setSelectedAsset(asset);
      }
    }
  }, [initialAssetId, consumables]);

  const loadConsumables = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get all active consumables
      const data = await assetService.listAssets({
        category: 'consumable',
        asset_type: 'consumable',
        status: 'active'
      });
      
      setConsumables(data || []);
    } catch (e) {
      console.error('Failed to load consumables:', e);
      setError('Failed to load consumables');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!initialAssetId) {  // Only reset selected asset if no initial asset provided
      setSelectedAsset(null);
    }
    setFormData({
      adjustment_type: 'add',
      quantity: '',
      movement_date: dayjs().format('YYYY-MM-DD'),
      reason: 'purchase',
      notes: ''
    });
    setError(null);
  };

  const handleAssetSelect = (assetId) => {
    const asset = consumables.find(c => c.id === parseInt(assetId));
    setSelectedAsset(asset);
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validation
      if (!selectedAsset) {
        setError('Please select a consumable');
        return;
      }

      if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
        setError('Please enter a valid quantity');
        return;
      }

      // Determine movement type based on adjustment type and reason
      let movementType = 'adjustment';
      if (formData.reason === 'purchase' && formData.adjustment_type === 'add') {
        movementType = 'purchase';
      } else if (formData.reason === 'usage' && formData.adjustment_type === 'subtract') {
        movementType = 'usage';
      } else if (formData.reason === 'damaged' && formData.adjustment_type === 'subtract') {
        movementType = 'disposal';
      }

      // Calculate final quantity with sign
      let finalQuantity = Math.abs(parseFloat(formData.quantity));
      if (formData.adjustment_type === 'subtract') {
        finalQuantity = -finalQuantity;
      }

      // Check if we have enough stock for subtraction
      if (finalQuantity < 0) {
        const currentStock = parseFloat(selectedAsset.current_stock || 0);
        if (currentStock + finalQuantity < 0) {
          setError(`Insufficient stock. Current: ${currentStock} ${selectedAsset.unit_of_measure}`);
          return;
        }
      }

      // Create stock movement
      const payload = {
        asset_id: selectedAsset.id,
        movement_type: movementType,
        movement_date: formData.movement_date,
        quantity: finalQuantity,
        reference_number: formData.reason === 'purchase' ? 'Quick Adjustment' : null,
        notes: formData.notes || `Quick adjustment: ${formData.reason}`
      };

      await assetService.stock.createStockMovement(payload);

      // Success
      if (onSuccess) {
        onSuccess();
      }

      // Show success message briefly then close
      const successMsg = `Stock ${formData.adjustment_type === 'add' ? 'added' : 'removed'} successfully!`;
      alert(successMsg);
      
      onClose();
    } catch (e) {
      console.error('Failed to save stock adjustment:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save adjustment';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally {
      setSaving(false);
    }
  };

  const getStockStatus = (asset) => {
    if (!asset) return null;
    return assetService.helpers.formatStockStatus(asset);
  };

  const reasonOptions = {
    add: [
      { value: 'purchase', label: 'Purchase/Delivery' },
      { value: 'return', label: 'Return from Field' },
      { value: 'found', label: 'Stock Found' },
      { value: 'correction', label: 'Correction' }
    ],
    subtract: [
      { value: 'usage', label: 'Used in Field' },
      { value: 'damaged', label: 'Damaged/Spoiled' },
      { value: 'lost', label: 'Lost/Missing' },
      { value: 'correction', label: 'Correction' }
    ]
  };

  if (!isOpen) return null;

  const stockStatus = selectedAsset ? getStockStatus(selectedAsset) : null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          width: '90vw',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc'
          }}
        >
          <h3 style={{ 
            margin: 0, 
            fontSize: '1.125rem', 
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Package size={20} color="#10b981" />
            Quick Stock Adjustment
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem' }}>
          {error && (
            <div
              style={{
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
              }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Loading consumables...
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* Select Consumable */}
              <label>
                <div style={{ 
                  marginBottom: '0.5rem', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151' 
                }}>
                  Select Consumable <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <select
                  value={selectedAsset?.id || ''}
                  onChange={(e) => handleAssetSelect(e.target.value)}
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: 'white'
                  }}
                >
                  <option value="">— Select a consumable —</option>
                  {consumables.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({asset.current_stock || 0} {asset.unit_of_measure})
                    </option>
                  ))}
                </select>
              </label>

              {/* Current Stock Info */}
              {selectedAsset && stockStatus && (
                <div
                  style={{
                    padding: '0.75rem',
                    background: stockStatus.color === 'green' ? '#dcfce7' : stockStatus.color === 'orange' ? '#fef3c7' : '#fef2f2',
                    border: `1px solid ${stockStatus.color === 'green' ? '#22c55e' : stockStatus.color === 'orange' ? '#fbbf24' : '#fca5a5'}`,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>{stockStatus.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                      Current Stock: {parseFloat(selectedAsset.current_stock || 0).toFixed(2)} {selectedAsset.unit_of_measure}
                    </div>
                    {selectedAsset.minimum_stock && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        Minimum: {parseFloat(selectedAsset.minimum_stock).toFixed(2)} {selectedAsset.unit_of_measure}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Adjustment Type Selector */}
              <div>
                <div style={{ 
                  marginBottom: '0.5rem', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151' 
                }}>
                  Adjustment Type <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, adjustment_type: 'add', reason: 'purchase' })}
                    disabled={saving}
                    style={{
                      padding: '0.75rem',
                      border: formData.adjustment_type === 'add' ? '2px solid #10b981' : '1px solid #d1d5db',
                      background: formData.adjustment_type === 'add' ? '#dcfce7' : 'white',
                      borderRadius: '6px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: formData.adjustment_type === 'add' ? '#166534' : '#374151',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Plus size={16} />
                    Add Stock
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, adjustment_type: 'subtract', reason: 'usage' })}
                    disabled={saving}
                    style={{
                      padding: '0.75rem',
                      border: formData.adjustment_type === 'subtract' ? '2px solid #f59e0b' : '1px solid #d1d5db',
                      background: formData.adjustment_type === 'subtract' ? '#fef3c7' : 'white',
                      borderRadius: '6px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: formData.adjustment_type === 'subtract' ? '#92400e' : '#374151',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Minus size={16} />
                    Remove Stock
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <label>
                <div style={{ 
                  marginBottom: '0.5rem', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151' 
                }}>
                  Quantity <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="0.00"
                    disabled={saving || !selectedAsset}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                  <span style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280', 
                    minWidth: '50px',
                    fontWeight: '500'
                  }}>
                    {selectedAsset?.unit_of_measure || 'units'}
                  </span>
                </div>
              </label>

              {/* Reason */}
              <label>
                <div style={{ 
                  marginBottom: '0.5rem', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151' 
                }}>
                  Reason <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: 'white'
                  }}
                >
                  {reasonOptions[formData.adjustment_type].map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Date */}
              <label>
                <div style={{ 
                  marginBottom: '0.5rem', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151' 
                }}>
                  Date
                </div>
                <input
                  type="date"
                  value={formData.movement_date}
                  onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })}
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </label>

              {/* Notes */}
              <label>
                <div style={{ 
                  marginBottom: '0.5rem', 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: '#374151' 
                }}>
                  Notes
                </div>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes..."
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </label>

              {/* Preview */}
              {selectedAsset && formData.quantity && (
                <div
                  style={{
                    padding: '0.75rem',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#0c4a6e' }}>
                    Preview:
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#0369a1' }}>
                    {parseFloat(selectedAsset.current_stock || 0).toFixed(2)} {selectedAsset.unit_of_measure}
                    {' '}
                    {formData.adjustment_type === 'add' ? (
                      <span style={{ color: '#10b981', fontWeight: '600' }}>
                        <TrendingUp size={14} style={{ display: 'inline', marginBottom: '-2px' }} />
                        {' '}+{parseFloat(formData.quantity).toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: '#f59e0b', fontWeight: '600' }}>
                        <TrendingDown size={14} style={{ display: 'inline', marginBottom: '-2px' }} />
                        {' '}-{parseFloat(formData.quantity).toFixed(2)}
                      </span>
                    )}
                    {' '}→{' '}
                    <span style={{ fontWeight: '700' }}>
                      {(
                        parseFloat(selectedAsset.current_stock || 0) +
                        (formData.adjustment_type === 'add' ? parseFloat(formData.quantity) : -parseFloat(formData.quantity))
                      ).toFixed(2)}{' '}
                      {selectedAsset.unit_of_measure}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            background: '#f8fafc'
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '0.625rem 1.25rem',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !selectedAsset || !formData.quantity}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              background: (saving || !selectedAsset || !formData.quantity) ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (saving || !selectedAsset || !formData.quantity) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Adjustment'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}