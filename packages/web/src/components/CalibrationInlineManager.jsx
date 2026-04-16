// packages/web/src/components/CalibrationInlineManager.jsx
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
import './asset-components.css';

export default function CalibrationInlineManager({ assetId, onClose, inline = false }) {
  const [calibrations, setCalibrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [formData, setFormData] = useState({
    calibration_type: 'flow_rate', calibration_date: dayjs().format('YYYY-MM-DD'),
    parameter_name: '', unit_of_measure: '', target_value: '', measured_value: '',
    tolerance_min: '', tolerance_max: '', calibrated_by: '', temperature: '',
    humidity: '', weather_conditions: '', adjustment_made: false,
    adjustment_details: '', notes: ''
  });

  useEffect(() => { loadCalibrations(); }, [assetId]);

  const loadCalibrations = async () => {
    try {
      setLoading(true); setError(null);
      const data = await assetService.calibration.listCalibrations({ asset_id: assetId, limit: 50 });
      setCalibrations(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Failed to load calibrations:', e); setError('Failed to load calibrations'); }
    finally { setLoading(false); }
  };

  const resetForm = () => ({
    calibration_type: 'flow_rate', calibration_date: dayjs().format('YYYY-MM-DD'),
    parameter_name: '', unit_of_measure: '', target_value: '', measured_value: '',
    tolerance_min: '', tolerance_max: '', calibrated_by: '', temperature: '',
    humidity: '', weather_conditions: '', adjustment_made: false,
    adjustment_details: '', notes: ''
  });

  const handleCreate = () => { setCreating(true); setEditingId(null); setFormData(resetForm()); };

  const handleEdit = (cal) => {
    setEditingId(cal.id); setCreating(false);
    setFormData({
      calibration_type: cal.calibration_type || 'flow_rate',
      calibration_date: cal.calibration_date || dayjs().format('YYYY-MM-DD'),
      parameter_name: cal.parameter_name || '', unit_of_measure: cal.unit_of_measure || '',
      target_value: cal.target_value || '', measured_value: cal.measured_value || '',
      tolerance_min: cal.tolerance_min || '', tolerance_max: cal.tolerance_max || '',
      calibrated_by: cal.calibrated_by || '', temperature: cal.temperature || '',
      humidity: cal.humidity || '', weather_conditions: cal.weather_conditions || '',
      adjustment_made: cal.adjustment_made || false, adjustment_details: cal.adjustment_details || '',
      notes: cal.notes || ''
    });
  };

  const handleCancel = () => { setCreating(false); setEditingId(null); setFormData(resetForm()); };

  const handleSave = async () => {
    try {
      setBusy(true); setError(null);
      if (!formData.parameter_name.trim()) { setError('Parameter name is required'); return; }
      if (!formData.unit_of_measure.trim()) { setError('Unit of measure is required'); return; }
      if (!formData.measured_value) { setError('Measured value is required'); return; }
      if (!formData.calibrated_by.trim()) { setError('Calibrated by is required'); return; }

      const payload = {
        asset_id: assetId, calibration_type: formData.calibration_type,
        calibration_date: formData.calibration_date, parameter_name: formData.parameter_name,
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

      if (creating) await assetService.calibration.createCalibration(payload);
      else if (editingId) await assetService.calibration.updateCalibration(editingId, payload);

      await loadCalibrations();
      handleCancel();
    } catch (e) {
      console.error('Failed to save calibration:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save calibration';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save' : detail);
    } finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this calibration record?')) return;
    try { setBusy(true); await assetService.calibration.deleteCalibration(id); await loadCalibrations(); }
    catch (e) { console.error('Failed to delete calibration:', e); alert('Failed to delete calibration'); }
    finally { setBusy(false); }
  };

  const calibrationTypes = assetService.helpers.getCalibrationType();

  const content = (
    <div className={inline ? '' : 'ac-inline'}>
      {!inline && (
        <div className="ac-inline-header">
          <h3>Calibration Records</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={24} /></button>
        </div>
      )}

      {error && <div className="ac-error"><AlertTriangle size={16} /> {error}</div>}

      {!creating && !editingId && (
        <div style={{ marginBottom: 'var(--space-base)' }}>
          <button className="ac-btn-success" onClick={handleCreate} disabled={busy}>
            <Plus size={16} /> New Calibration
          </button>
        </div>
      )}

      {(creating || editingId) && (
        <div className="ac-form-panel">
          <h4>{creating ? 'New Calibration Record' : 'Edit Calibration Record'}</h4>
          <div className="ac-form-grid">
            <div className="ac-form-grid ac-form-grid--2col">
              <label>
                <div className="ac-field-label">Calibration Type</div>
                <select className="ac-select" value={formData.calibration_type} onChange={(e) => setFormData({ ...formData, calibration_type: e.target.value })}>
                  {calibrationTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label>
                <div className="ac-field-label">Calibration Date</div>
                <input className="ac-input" type="date" value={formData.calibration_date} onChange={(e) => setFormData({ ...formData, calibration_date: e.target.value })} />
              </label>
            </div>

            <div className="ac-form-grid ac-form-grid--2col">
              <label>
                <div className="ac-field-label">Parameter Name <span className="ac-required">*</span></div>
                <input className="ac-input" type="text" value={formData.parameter_name} onChange={(e) => setFormData({ ...formData, parameter_name: e.target.value })} placeholder="e.g., Nozzle Flow Rate" />
              </label>
              <label>
                <div className="ac-field-label">Unit of Measure <span className="ac-required">*</span></div>
                <input className="ac-input" type="text" value={formData.unit_of_measure} onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })} placeholder="e.g., L/min" />
              </label>
            </div>

            <div className="ac-form-grid ac-form-grid--4col">
              <label>
                <div className="ac-field-label">Target Value</div>
                <input className="ac-input" type="number" step="0.0001" value={formData.target_value} onChange={(e) => setFormData({ ...formData, target_value: e.target.value })} placeholder="0.00" />
              </label>
              <label>
                <div className="ac-field-label">Measured Value <span className="ac-required">*</span></div>
                <input className="ac-input" type="number" step="0.0001" value={formData.measured_value} onChange={(e) => setFormData({ ...formData, measured_value: e.target.value })} placeholder="0.00" />
              </label>
              <label>
                <div className="ac-field-label">Tolerance Min</div>
                <input className="ac-input" type="number" step="0.0001" value={formData.tolerance_min} onChange={(e) => setFormData({ ...formData, tolerance_min: e.target.value })} placeholder="0.00" />
              </label>
              <label>
                <div className="ac-field-label">Tolerance Max</div>
                <input className="ac-input" type="number" step="0.0001" value={formData.tolerance_max} onChange={(e) => setFormData({ ...formData, tolerance_max: e.target.value })} placeholder="0.00" />
              </label>
            </div>

            <label>
              <div className="ac-field-label">Calibrated By <span className="ac-required">*</span></div>
              <input className="ac-input" type="text" value={formData.calibrated_by} onChange={(e) => setFormData({ ...formData, calibrated_by: e.target.value })} placeholder="Name or initials" />
            </label>

            <div className="ac-form-grid ac-form-grid--env">
              <label>
                <div className="ac-field-label">Temperature (°C)</div>
                <input className="ac-input" type="number" step="0.1" value={formData.temperature} onChange={(e) => setFormData({ ...formData, temperature: e.target.value })} placeholder="20.0" />
              </label>
              <label>
                <div className="ac-field-label">Humidity (%)</div>
                <input className="ac-input" type="number" step="0.1" value={formData.humidity} onChange={(e) => setFormData({ ...formData, humidity: e.target.value })} placeholder="60.0" />
              </label>
              <label>
                <div className="ac-field-label">Weather Conditions</div>
                <input className="ac-input" type="text" value={formData.weather_conditions} onChange={(e) => setFormData({ ...formData, weather_conditions: e.target.value })} placeholder="e.g., Clear, calm" />
              </label>
            </div>

            <div>
              <label className="ac-checkbox-row">
                <input type="checkbox" checked={formData.adjustment_made} onChange={(e) => setFormData({ ...formData, adjustment_made: e.target.checked })} />
                <span>Adjustment Made</span>
              </label>
              {formData.adjustment_made && (
                <textarea className="ac-textarea" rows={2} value={formData.adjustment_details} onChange={(e) => setFormData({ ...formData, adjustment_details: e.target.value })} placeholder="Describe the adjustment made..." style={{ marginTop: 'var(--space-sm)' }} />
              )}
            </div>

            <label>
              <div className="ac-field-label">Notes</div>
              <textarea className="ac-textarea" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." />
            </label>

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
        <div className="ac-loading">Loading calibrations...</div>
      ) : calibrations.length === 0 ? (
        <div className="ac-empty">No calibration records yet</div>
      ) : (
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Parameter</th>
                <th className="center">Target</th>
                <th className="center">Measured</th>
                <th className="center">Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {calibrations.map(cal => (
                <tr key={cal.id}>
                  <td>{dayjs(cal.calibration_date).format('MMM D, YYYY')}</td>
                  <td className="capitalize">{cal.calibration_type?.replace('_', ' ')}</td>
                  <td className="bold">{cal.parameter_name}</td>
                  <td className="center muted">{cal.target_value ? `${cal.target_value} ${cal.unit_of_measure}` : '—'}</td>
                  <td className="center bold">{cal.measured_value} {cal.unit_of_measure}</td>
                  <td className="center"><CalibrationStatusBadge status={cal.status} /></td>
                  <td className="right">
                    <div className="ac-action-bar" style={{ marginTop: 0 }}>
                      <button className="ac-btn-primary ac-btn-sm" onClick={() => handleEdit(cal)} disabled={busy || creating || editingId}>
                        <Edit2 size={12} /> Edit
                      </button>
                      <button className="ac-btn-danger ac-btn-sm" onClick={() => handleDelete(cal.id)} disabled={busy || creating || editingId}>
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

function CalibrationStatusBadge({ status }) {
  const iconMap = {
    pass: <CheckCircle size={12} />,
    fail: <XCircle size={12} />,
    out_of_tolerance: <AlertTriangle size={12} />
  };
  const cls = status === 'fail' ? 'ac-badge--fail' : status === 'out_of_tolerance' ? 'ac-badge--warning' : 'ac-badge--pass';
  return (
    <span className={`ac-badge ${cls}`}>
      {iconMap[status] || iconMap.pass} {status?.replace('_', ' ')}
    </span>
  );
}
