// maps-v2/components/drawing/BlockCompanyAssignModal.jsx — Assign block to company (auxein admin)
import { useState, useEffect } from 'react';
import { X, Save, Loader, Building2, AlertTriangle } from 'lucide-react';
import { blocksService } from '@vineyard/shared';

export default function BlockCompanyAssignModal({
  isOpen,
  block,              // full block data (id, block_name, variety, area, company_id, property_id, etc.)
  companies,          // available companies
  companiesLoading,
  onSubmit,
  onCancel,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    if (block) {
      setCompanyId('');
      setError(null);
    }
  }, [block]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!block?.id || !companyId) {
      setError('Please select a target company.');
      return;
    }
    if (parseInt(companyId) === block.company_id) {
      setError('This company is already assigned to the block.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await blocksService.assignBlock(block.id, parseInt(companyId));
      onSubmit?.();
    } catch (err) {
      console.error('Block company assignment failed:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to assign block');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !block) return null;

  const currentCompany = companies.find((c) => c.id === block.company_id);
  const isReassign = !!block.company_id;

  return (
    <div className="v2-form-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">{isReassign ? 'Reassign Block' : 'Assign Block to Company'}</h3>
        <button className="v2-form-close" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      <div className="v2-form-body">
        {error && <div className="v2-form-error">{error}</div>}

        <div className="v2-form-section">
          <div className="v2-form-section-header">
            <Building2 size={14} />
            <span>Block Info</span>
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            <div><strong>Name:</strong> {block.block_name || 'Unnamed'}</div>
            {block.variety && <div><strong>Variety:</strong> {block.variety}</div>}
            {block.area && <div><strong>Area:</strong> {Number(block.area).toFixed(2)} ha</div>}
            <div><strong>Current Company:</strong> {currentCompany?.name || (block.company_id ? `Company #${block.company_id}` : 'None')}</div>
            {block.property_id && <div><strong>Property ID:</strong> {block.property_id}</div>}
          </div>
        </div>

        {block.property_id && (
          <div className="v2-form-section" style={{ background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)', color: '#92400e', fontSize: 'var(--font-size-sm)' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Note:</strong> This block is assigned to property #{block.property_id}. Reassigning to a new company will disconnect the block from this property (property stays with its current owner).
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="v2-form-section">
            <div className="v2-form-group">
              <label className="v2-form-label">Target Company *</label>
              <select
                className="v2-form-select"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                disabled={companiesLoading}
              >
                <option value="">{companiesLoading ? 'Loading companies...' : 'Select a company'}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === block.company_id}>
                    {c.name}{c.company_number ? ` (${c.company_number})` : ''}{c.id === block.company_id ? ' — current' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="v2-form-actions">
            <div style={{ flex: 1 }} />
            <button type="button" className="v2-form-btn v2-form-btn--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="v2-form-btn v2-form-btn--primary" disabled={saving || !companyId || companiesLoading}>
              {saving ? <><Loader size={14} className="v2-spin" /> {isReassign ? 'Reassigning...' : 'Assigning...'}</> : <><Save size={14} /> {isReassign ? 'Reassign Block' : 'Assign Block'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
