// maps-v2/components/drawing/ParcelAssignmentModal.jsx — Assign land parcel to company
import { useState, useEffect } from 'react';
import { X, Save, Loader, Building2 } from 'lucide-react';
import { parcelsService } from '@vineyard/shared';

export default function ParcelAssignmentModal({
  isOpen,
  parcel,          // selected parcel properties (id, linz_id, appellation, area_hectares, etc.)
  companies,       // available companies
  companiesLoading,
  onSubmit,        // called on success
  onCancel,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    company_id: '',
    ownership_type: 'full',
    ownership_percentage: 100,
    verification_method: 'manual',
    notes: '',
  });

  useEffect(() => {
    if (parcel) {
      setForm({
        company_id: '',
        ownership_type: 'full',
        ownership_percentage: 100,
        verification_method: 'manual',
        notes: '',
      });
      setError(null);
    }
  }, [parcel]);

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!parcel?.id || !form.company_id) {
      setError('Please select a company.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        company_id: parseInt(form.company_id),
        ownership_type: form.ownership_type,
        ownership_percentage: parseFloat(form.ownership_percentage),
        verification_method: form.verification_method,
        notes: form.notes || `Assigned via map interface to parcel ${parcel.linz_id}`,
      };
      parcelsService.validateAssignmentData(payload);
      await parcelsService.assignParcelToCompany(parcel.id, payload);
      onSubmit?.();
    } catch (err) {
      console.error('Parcel assignment failed:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to assign parcel');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !parcel) return null;

  return (
    <div className="v2-form-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">Assign Land Parcel</h3>
        <button className="v2-form-close" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      <div className="v2-form-body">
        {error && <div className="v2-form-error">{error}</div>}

        <div className="v2-form-section">
          <div className="v2-form-section-header">
            <Building2 size={14} />
            <span>Parcel Info</span>
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            <div><strong>LINZ ID:</strong> {parcel.linz_id || '—'}</div>
            {parcel.appellation && <div><strong>Appellation:</strong> {parcel.appellation}</div>}
            {parcel.land_district && <div><strong>District:</strong> {parcel.land_district}</div>}
            {parcel.area_hectares && <div><strong>Area:</strong> {Number(parcel.area_hectares).toFixed(2)} ha</div>}
            {parcel.parcel_intent && <div><strong>Intent:</strong> {parcel.parcel_intent}</div>}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="v2-form-section">
            <div className="v2-form-group">
              <label className="v2-form-label">Company *</label>
              <select
                className="v2-form-select"
                value={form.company_id}
                onChange={handleChange('company_id')}
                required
                disabled={companiesLoading}
              >
                <option value="">{companiesLoading ? 'Loading companies...' : 'Select a company'}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.company_number ? ` (${c.company_number})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="v2-form-row">
              <div className="v2-form-group">
                <label className="v2-form-label">Ownership Type</label>
                <select className="v2-form-select" value={form.ownership_type} onChange={handleChange('ownership_type')}>
                  <option value="full">Full Ownership</option>
                  <option value="partial">Partial Ownership</option>
                  <option value="leased">Leased</option>
                  <option value="disputed">Disputed</option>
                </select>
              </div>
              <div className="v2-form-group">
                <label className="v2-form-label">Percentage</label>
                <input
                  className="v2-form-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.ownership_percentage}
                  onChange={handleChange('ownership_percentage')}
                />
              </div>
            </div>

            <div className="v2-form-group">
              <label className="v2-form-label">Verification Method</label>
              <select className="v2-form-select" value={form.verification_method} onChange={handleChange('verification_method')}>
                <option value="manual">Manual Assignment</option>
                <option value="landonline">Land Online</option>
                <option value="title_deed">Title Deed</option>
                <option value="survey">Survey</option>
              </select>
            </div>

            <div className="v2-form-group">
              <label className="v2-form-label">Notes (optional)</label>
              <textarea
                className="v2-form-input"
                rows={3}
                value={form.notes}
                onChange={handleChange('notes')}
                placeholder="Add notes about this assignment..."
              />
            </div>
          </div>

          <div className="v2-form-actions">
            <div style={{ flex: 1 }} />
            <button type="button" className="v2-form-btn v2-form-btn--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="v2-form-btn v2-form-btn--primary" disabled={saving || !form.company_id || companiesLoading}>
              {saving ? <><Loader size={14} className="v2-spin" /> Assigning...</> : <><Save size={14} /> Assign Parcel</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
