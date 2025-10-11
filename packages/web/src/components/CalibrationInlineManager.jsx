// packages/mobile/src/components/CalibrationInlineManager.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import {
  Plus,
  Save,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import { assetService } from '@vineyard/shared';

export default function CalibrationInlineManager({ assetId, onClose, inline = false }) {
  const [calibrations, setCalibrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state for new/edit calibration
  const [formData, setFormData] = useState({
    calibration_type: 'flow_rate',
    calibration_date: dayjs().format('YYYY-MM-DD'),
    parameter_name: '',
    unit_of_measure: '',
    target_value: '',
    measured_value: '',
    tolerance_min: '',
    tolerance_max: '',
    calibrated_by: '',
    temperature: '',
    humidity: '',
    weather_conditions: '',
    adjustment_made: false,
    adjustment_details: '',
    notes: ''
  });

  useEffect(() => {
    loadCalibrations();
  }, [assetId]);

  const loadCalibrations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await assetService.calibration.listCalibrations({ 
        asset_id: assetId,
        limit: 50
      });
      setCalibrations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load calibrations:', e);
      setError('Failed to load calibrations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setCreating(true);
    setEditingId(null);
    setFormData({
      calibration_type: 'flow_rate',
      calibration_date: dayjs().format('YYYY-MM-DD'),
      parameter_name: '',
      unit_of_measure: '',
      target_value: '',
      measured_value: '',
      tolerance_min: '',
      tolerance_max: '',
      calibrated_by: '',
      temperature: '',
      humidity: '',
      weather_conditions: '',
      adjustment_made: false,
      adjustment_details: '',
      notes: ''
    });
  };

  const handleEdit = (calibration) => {
    setEditingId(calibration.id);
    setCreating(false);
    setFormData({
      calibration_type: calibration.calibration_type || 'flow_rate',
      calibration_date: calibration.calibration_date || dayjs().format('YYYY-MM-DD'),
      parameter_name: calibration.parameter_name || '',
      unit_of_measure: calibration.unit_of_measure || '',
      target_value: calibration.target_value || '',
      measured_value: calibration.measured_value || '',
      tolerance_min: calibration.tolerance_min || '',
      tolerance_max: calibration.tolerance_max || '',
      calibrated_by: calibration.calibrated_by || '',
      temperature: calibration.temperature || '',
      humidity: calibration.humidity || '',
      weather_conditions: calibration.weather_conditions || '',
      adjustment_made: calibration.adjustment_made || false,
      adjustment_details: calibration.adjustment_details || '',
      notes: calibration.notes || ''
    });
  };

  const handleCancel = () => {
    setCreating(false);
    setEditingId(null);
    setFormData({
      calibration_type: 'flow_rate',
      calibration_date: dayjs().format('YYYY-MM-DD'),
      parameter_name: '',
      unit_of_measure: '',
      target_value: '',
      measured_value: '',
      tolerance_min: '',
      tolerance_max: '',
      calibrated_by: '',
      temperature: '',
      humidity: '',
      weather_conditions: '',
      adjustment_made: false,
      adjustment_details: '',
      notes: ''
    });
  };

  const handleSave = async () => {
    try {
      setBusy(true);
      setError(null);

      // Validation
      if (!formData.parameter_name.trim()) {
        setError('Parameter name is required');
        return;
      }
      if (!formData.unit_of_measure.trim()) {
        setError('Unit of measure is required');
        return;
      }
      if (!formData.measured_value) {
        setError('Measured value is required');
        return;
      }
      if (!formData.calibrated_by.trim()) {
        setError('Calibrated by is required');
        return;
      }

      const payload = {
        asset_id: assetId,
        calibration_type: formData.calibration_type,
        calibration_date: formData.calibration_date,
        parameter_name: formData.parameter_name,
        unit_of_measure: formData.unit_of_measure,
        target_value: formData.target_value ? Number(formData.target_value) : null,
        measured_value: Number(formData.measured_value),
        tolerance_min: formData.tolerance_min ? Number(formData.tolerance_min) : null,
        tolerance_max: formData.tolerance_max ? Number(formData.tolerance_max) : null,
        calibrated_by: formData.calibrated_by,
        temperature: formData.temperature ? Number(formData.temperature) : null,
        humidity: formData.humidity ? Number(formData.humidity) : null,
        weather_conditions: formData.weather_conditions || null,
        adjustment_made: formData.adjustment_made,
        adjustment_details: formData.adjustment_details || null,
        notes: formData.notes || null
      };

      if (creating) {
        await assetService.calibration.createCalibration(payload);
      } else if (editingId) {
        await assetService.calibration.updateCalibration(editingId, payload);
      }

      await loadCalibrations();
      handleCancel();
    } catch (e) {
      console.error('Failed to save calibration:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save calibration';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this calibration record?')) {
      return;
    }

    try {
      setBusy(true);
      await assetService.calibration.deleteCalibration(id);
      await loadCalibrations();
    } catch (e) {
      console.error('Failed to delete calibration:', e);
      alert('Failed to delete calibration');
    } finally {
      setBusy(false);
    }
  };

  const calibrationTypes = assetService.helpers.getCalibrationType();

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
            Calibration Records
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
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Plus size={16} /> New Calibration
          </button>
        </div>
      )}

      {/* Form for Create/Edit */}
      {(creating || editingId) && (
        <div style={{
          border: '2px solid #3b82f6',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          background: '#f0f9ff'
        }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.938rem', fontWeight: '600' }}>
            {creating ? 'New Calibration Record' : 'Edit Calibration Record'}
          </h4>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {/* Calibration Type & Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Calibration Type
                </div>
                <select
                  value={formData.calibration_type}
                  onChange={(e) => setFormData({ ...formData, calibration_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem'
                  }}
                >
                  {calibrationTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Calibration Date
                </div>
                <input
                  type="date"
                  value={formData.calibration_date}
                  onChange={(e) => setFormData({ ...formData, calibration_date: e.target.value })}
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

            {/* Parameter & Unit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Parameter Name <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <input
                  type="text"
                  value={formData.parameter_name}
                  onChange={(e) => setFormData({ ...formData, parameter_name: e.target.value })}
                  placeholder="e.g., Nozzle Flow Rate"
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
                  Unit of Measure <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <input
                  type="text"
                  value={formData.unit_of_measure}
                  onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                  placeholder="e.g., L/min"
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

            {/* Values */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Target Value
                </div>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.target_value}
                  onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
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
                  Measured Value <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.measured_value}
                  onChange={(e) => setFormData({ ...formData, measured_value: e.target.value })}
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
                  Tolerance Min
                </div>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.tolerance_min}
                  onChange={(e) => setFormData({ ...formData, tolerance_min: e.target.value })}
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
                  Tolerance Max
                </div>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.tolerance_max}
                  onChange={(e) => setFormData({ ...formData, tolerance_max: e.target.value })}
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

            {/* Calibrated By */}
            <label>
              <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                Calibrated By <span style={{ color: '#ef4444' }}>*</span>
              </div>
              <input
                type="text"
                value={formData.calibrated_by}
                onChange={(e) => setFormData({ ...formData, calibrated_by: e.target.value })}
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

            {/* Environmental Conditions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0.75rem' }}>
              <label>
                <div style={{ fontSize: '0.813rem', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Temperature (°C)
                </div>
                <input
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  placeholder="20.0"
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
                  Humidity (%)
                </div>
                <input
                  type="number"
                  step="0.1"
                  value={formData.humidity}
                  onChange={(e) => setFormData({ ...formData, humidity: e.target.value })}
                  placeholder="60.0"
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
                  Weather Conditions
                </div>
                <input
                  type="text"
                  value={formData.weather_conditions}
                  onChange={(e) => setFormData({ ...formData, weather_conditions: e.target.value })}
                  placeholder="e.g., Clear, calm"
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

            {/* Adjustment */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.adjustment_made}
                  onChange={(e) => setFormData({ ...formData, adjustment_made: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.813rem', fontWeight: '500' }}>
                  Adjustment Made
                </span>
              </label>

              {formData.adjustment_made && (
                <textarea
                  rows={2}
                  value={formData.adjustment_details}
                  onChange={(e) => setFormData({ ...formData, adjustment_details: e.target.value })}
                  placeholder="Describe the adjustment made..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.813rem',
                    fontFamily: 'inherit',
                    marginTop: '0.5rem'
                  }}
                />
              )}
            </div>

            {/* Notes */}
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
                  background: busy ? '#9ca3af' : '#059669',
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

      {/* Calibration List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          Loading calibrations...
        </div>
      ) : calibrations.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          No calibration records yet
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
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Parameter</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Target</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Measured</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {calibrations.map(cal => (
                <tr key={cal.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>
                    {dayjs(cal.calibration_date).format('MMM D, YYYY')}
                  </td>
                  <td style={{ padding: 10, textTransform: 'capitalize' }}>
                    {cal.calibration_type?.replace('_', ' ')}
                  </td>
                  <td style={{ padding: 10, fontWeight: '500' }}>
                    {cal.parameter_name}
                  </td>
                  <td style={{ padding: 10, textAlign: 'center', color: '#6b7280' }}>
                    {cal.target_value ? `${cal.target_value} ${cal.unit_of_measure}` : '—'}
                  </td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: '600' }}>
                    {cal.measured_value} {cal.unit_of_measure}
                  </td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    <CalibrationStatusBadge status={cal.status} />
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleEdit(cal)}
                        disabled={busy || creating || editingId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '0.25rem 0.5rem',
                          background: '#3b82f6',
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
                        onClick={() => handleDelete(cal.id)}
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

function CalibrationStatusBadge({ status }) {
  const colors = {
    pass: { bg: '#dcfce7', color: '#166534', icon: <CheckCircle size={12} /> },
    fail: { bg: '#fee2e2', color: '#991b1b', icon: <XCircle size={12} /> },
    out_of_tolerance: { bg: '#fef3c7', color: '#92400e', icon: <AlertTriangle size={12} /> }
  };

  const style = colors[status] || colors.pass;

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