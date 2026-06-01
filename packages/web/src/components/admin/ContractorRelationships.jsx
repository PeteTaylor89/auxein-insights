// components/admin/ContractorRelationships.jsx — V1 contractor relationship management
// V1 surface: directory picker, hourly rate, contract dates, preferred toggle, company notes.
// Lifecycle: suspend / reactivate / terminate.
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Search, Loader, Edit2, Pause, Play, XCircle, Handshake,
  Star, BadgeCheck, ShieldCheck, ShieldAlert, ShieldX, ArrowLeft,
} from 'lucide-react';
import { contractorManagementService } from '@vineyard/shared';

const SPECIALIZATION_OPTIONS = [
  'pruning', 'spraying', 'harvesting', 'pest_control', 'irrigation',
  'machinery', 'canopy_management', 'soil_management', 'consultation',
];

function StatusPill({ status }) {
  const variant = {
    active: { bg: 'var(--color-success-bg, #ecfdf5)', fg: 'var(--color-success-text)', label: 'Active' },
    suspended: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-text)', label: 'Suspended' },
    inactive: { bg: 'var(--color-surface-warm)', fg: 'var(--color-text-muted)', label: 'Inactive' },
    pending: { bg: 'var(--color-info-bg)', fg: 'var(--color-info-text)', label: 'Pending' },
    terminated: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-text)', label: 'Terminated' },
  }[status] || { bg: 'var(--color-surface-warm)', fg: 'var(--color-text-muted)', label: status || 'Unknown' };

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 'var(--radius-pill)',
      background: variant.bg,
      color: variant.fg,
      fontSize: 'var(--font-size-xs)',
      fontWeight: 600,
      letterSpacing: '0.03em',
    }}>{variant.label}</span>
  );
}

function InsuranceBadge({ status }) {
  if (status === 'compliant') return <span title="Insurance compliant" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-success-text)', fontSize: 'var(--font-size-xs)' }}><ShieldCheck size={12} /> Compliant</span>;
  if (status === 'partial') return <span title="Insurance partial" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-warning-text)', fontSize: 'var(--font-size-xs)' }}><ShieldAlert size={12} /> Partial</span>;
  return <span title="Insurance not on file" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-danger-text)', fontSize: 'var(--font-size-xs)' }}><ShieldX size={12} /> Non-compliant</span>;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function fmtRate(rate) {
  if (rate == null || rate === '') return '—';
  return `$${Number(rate).toFixed(2)}/hr`;
}

function sortRelationships(list) {
  // Preferred first, then active before others, then by business name.
  const statusRank = { active: 0, suspended: 1, inactive: 2, pending: 3, terminated: 4 };
  return [...list].sort((a, b) => {
    const aPref = a.relationship_type === 'preferred_contractor' ? 0 : 1;
    const bPref = b.relationship_type === 'preferred_contractor' ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    const aRank = statusRank[a.status] ?? 99;
    const bRank = statusRank[b.status] ?? 99;
    if (aRank !== bRank) return aRank - bRank;
    return (a.contractor_name || '').localeCompare(b.contractor_name || '');
  });
}

export default function ContractorRelationships() {
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await contractorManagementService.listRelationships();
      setRelationships(sortRelationships(Array.isArray(data) ? data : []));
    } catch (err) {
      console.error('Failed to load contractor relationships:', err);
      setError('Failed to load contractor relationships.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (rel, newStatus, reason) => {
    if (newStatus === 'terminated') {
      const ok = confirm(`Terminate the relationship with ${rel.contractor_name}? This ends the engagement and the contractor will no longer be assignable.`);
      if (!ok) return;
    }
    try {
      const payload = { status: newStatus };
      if (newStatus === 'terminated' && reason) payload.termination_reason = reason;
      await contractorManagementService.updateRelationship(rel.id, payload);
      await load();
    } catch (err) {
      console.error('Status change failed:', err);
      alert(err?.response?.data?.detail || 'Failed to update relationship.');
    }
  };

  if (loading) {
    return <div className="ca-loading"><Loader size={16} /> Loading relationships...</div>;
  }

  return (
    <div>
      {error && <div className="ca-form-error" style={{ marginBottom: 'var(--space-base)' }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-base)' }}>
        <p className="ca-section-desc" style={{ margin: 0 }}>
          {relationships.length === 0
            ? 'No contractor relationships yet. Add one to start assigning them work.'
            : `${relationships.length} relationship${relationships.length === 1 ? '' : 's'}.`}
        </p>
        <button className="ca-btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> Add Contractor
        </button>
      </div>

      {relationships.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="ca-table">
            <thead>
              <tr>
                <th>Contractor</th>
                <th>Status</th>
                <th>Hourly rate</th>
                <th>Contract end</th>
                <th>Last worked</th>
                <th>Jobs</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {relationships.map(rel => {
                const isPreferred = rel.relationship_type === 'preferred_contractor';
                return (
                  <tr key={rel.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                        {isPreferred && <Star size={14} fill="#f59e0b" color="#f59e0b" title="Preferred contractor" />}
                        <span style={{ fontWeight: 600 }}>{rel.contractor_name}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {rel.contact_person}{rel.email ? ` · ${rel.email}` : ''}
                      </div>
                    </td>
                    <td><StatusPill status={rel.status} /></td>
                    <td>{fmtRate(rel.hourly_rate)}</td>
                    <td>{fmtDate(rel.contract_end)}</td>
                    <td>{fmtDate(rel.last_worked_date)}</td>
                    <td>{rel.jobs_completed_for_company || 0}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {rel.status !== 'terminated' && (
                        <button className="ca-btn-icon" onClick={() => setEditing(rel)} title="Edit">
                          <Edit2 size={14} />
                        </button>
                      )}
                      {rel.status === 'active' && (
                        <button className="ca-btn-icon" onClick={() => handleStatusChange(rel, 'suspended')} title="Suspend">
                          <Pause size={14} />
                        </button>
                      )}
                      {rel.status === 'suspended' && (
                        <button className="ca-btn-icon" onClick={() => handleStatusChange(rel, 'active')} title="Reactivate">
                          <Play size={14} />
                        </button>
                      )}
                      {(rel.status === 'active' || rel.status === 'suspended') && (
                        <button
                          className="ca-btn-icon"
                          onClick={() => {
                            const reason = prompt('Reason for termination (optional):') || '';
                            handleStatusChange(rel, 'terminated', reason);
                          }}
                          title="Terminate"
                          style={{ color: 'var(--color-danger-text)' }}
                        >
                          <XCircle size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateRelationshipModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {editing && (
        <EditRelationshipModal
          relationship={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}


// ============================================================================
// Create flow — two steps: pick from directory, then configure
// ============================================================================
function CreateRelationshipModal({ onClose, onCreated }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'configure'
  const [picked, setPicked] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [dirLoading, setDirLoading] = useState(true);
  const [dirError, setDirError] = useState(null);
  const [search, setSearch] = useState('');
  const [specFilter, setSpecFilter] = useState('');

  const [form, setForm] = useState({
    hourly_rate: '',
    contract_start: '',
    contract_end: '',
    company_notes: '',
    preferred: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    (async () => {
      setDirLoading(true);
      setDirError(null);
      try {
        const data = await contractorManagementService.getDirectory();
        setDirectory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load directory:', err);
        setDirError(err?.response?.data?.detail || 'Failed to load directory.');
      } finally {
        setDirLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return directory.filter(c => {
      if (specFilter && !(c.specializations || []).includes(specFilter)) return false;
      if (!q) return true;
      return (
        (c.business_name || '').toLowerCase().includes(q) ||
        (c.contact_person || '').toLowerCase().includes(q)
      );
    });
  }, [directory, search, specFilter]);

  const handlePick = (contractor) => {
    if (contractor.existing_relationship_status) return; // disabled
    setPicked(contractor);
    setStep('configure');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!picked || saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const payload = {
        contractor_id: picked.id,
        relationship_type: form.preferred ? 'preferred_contractor' : 'contractor',
      };
      if (form.hourly_rate !== '') payload.hourly_rate = Number(form.hourly_rate);
      if (form.contract_start) payload.contract_start = form.contract_start;
      if (form.contract_end) payload.contract_end = form.contract_end;
      if (form.company_notes.trim()) payload.company_notes = form.company_notes.trim();
      await contractorManagementService.createRelationship(payload);
      onCreated();
    } catch (err) {
      console.error('Create relationship failed:', err);
      setSaveErr(err?.response?.data?.detail || 'Failed to create relationship.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ maxWidth: 880 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <h3 className="ca-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
            {step === 'configure' && (
              <button className="ca-btn-icon" onClick={() => { setStep('pick'); setPicked(null); }} title="Back to directory">
                <ArrowLeft size={16} />
              </button>
            )}
            <Handshake size={18} />
            {step === 'pick' ? 'Choose a contractor' : `New relationship — ${picked?.business_name}`}
          </h3>
          <button className="ca-btn-icon" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <div className="ca-modal-body">
          {step === 'pick' && (
            <>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-base)', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', top: 10, left: 10, color: 'var(--color-text-muted)' }} />
                  <input
                    className="ca-inline-input"
                    style={{ paddingLeft: 32 }}
                    placeholder="Search by name or contact..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="ca-inline-input"
                  style={{ maxWidth: 220 }}
                  value={specFilter}
                  onChange={e => setSpecFilter(e.target.value)}
                >
                  <option value="">All specializations</option>
                  {SPECIALIZATION_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              {dirLoading && <div className="ca-loading"><Loader size={16} /> Loading directory...</div>}
              {dirError && <div className="ca-form-error">{dirError}</div>}

              {!dirLoading && !dirError && (
                <>
                  {filtered.length === 0 ? (
                    <div className="ca-empty">
                      No contractors match. Auxein curates the directory — ask us to add new accounts.
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gap: 'var(--space-md)',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    }}>
                      {filtered.map(c => {
                        const linked = !!c.existing_relationship_status;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handlePick(c)}
                            disabled={linked}
                            style={{
                              textAlign: 'left',
                              padding: 'var(--space-base)',
                              background: linked ? 'var(--color-surface-warm)' : 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-md)',
                              cursor: linked ? 'not-allowed' : 'pointer',
                              opacity: linked ? 0.65 : 1,
                              transition: 'border-color 0.15s, box-shadow 0.15s',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 'var(--space-xs)',
                            }}
                            onMouseEnter={e => { if (!linked) e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600 }}>{c.business_name}</span>
                              {c.is_verified && (
                                <BadgeCheck size={14} color="#0ea5e9" title="Verified by Auxein" />
                              )}
                            </div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                              {c.contact_person} · {c.contractor_type}
                            </div>
                            {c.specializations?.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {c.specializations.slice(0, 4).map(s => (
                                  <span key={s} style={{
                                    padding: '1px 8px',
                                    fontSize: '0.7rem',
                                    background: 'var(--color-surface-warm)',
                                    borderRadius: 999,
                                    color: 'var(--color-text-muted)',
                                  }}>{s.replace(/_/g, ' ')}</span>
                                ))}
                                {c.specializations.length > 4 && (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>+{c.specializations.length - 4}</span>
                                )}
                              </div>
                            )}
                            <div style={{ marginTop: 'var(--space-xs)' }}>
                              <InsuranceBadge status={c.insurance_status} />
                            </div>
                            {linked && (
                              <div style={{
                                marginTop: 'var(--space-xs)',
                                fontSize: 'var(--font-size-xs)',
                                color: 'var(--color-text-muted)',
                                fontStyle: 'italic',
                              }}>
                                Already linked ({c.existing_relationship_status})
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === 'configure' && picked && (
            <form onSubmit={handleSubmit}>
              <div style={{
                padding: 'var(--space-base)',
                background: 'var(--color-surface-warm)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-base)',
              }}>
                <div style={{ fontWeight: 600 }}>{picked.business_name}</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                  {picked.contact_person} · {picked.contractor_type}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label className="ca-inline-label">Hourly rate (NZD)</label>
                  <input
                    className="ca-inline-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.hourly_rate}
                    onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                    placeholder="e.g. 45.00"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 22 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.preferred}
                      onChange={e => setForm(f => ({ ...f, preferred: e.target.checked }))}
                    />
                    <Star size={14} fill={form.preferred ? '#f59e0b' : 'none'} color="#f59e0b" />
                    Mark as preferred contractor
                  </label>
                </div>
                <div>
                  <label className="ca-inline-label">Contract start</label>
                  <input
                    className="ca-inline-input"
                    type="date"
                    value={form.contract_start}
                    onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="ca-inline-label">Contract end</label>
                  <input
                    className="ca-inline-input"
                    type="date"
                    value={form.contract_end}
                    onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-md)' }}>
                <label className="ca-inline-label">Notes (visible to your company only)</label>
                <textarea
                  className="ca-inline-input"
                  rows={3}
                  value={form.company_notes}
                  onChange={e => setForm(f => ({ ...f, company_notes: e.target.value }))}
                  placeholder="Anything your team should know about working with this contractor."
                />
              </div>

              {saveErr && <div className="ca-form-error" style={{ marginTop: 'var(--space-base)' }}>{saveErr}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
                <button type="button" className="ca-btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="ca-btn-primary" disabled={saving}>
                  {saving ? <Loader size={14} /> : <Plus size={14} />}
                  {' '}Create Relationship
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// Edit existing relationship
// ============================================================================
function EditRelationshipModal({ relationship, onClose, onSaved }) {
  const [form, setForm] = useState({
    hourly_rate: relationship.hourly_rate ?? '',
    contract_start: relationship.contract_start || '',
    contract_end: relationship.contract_end || '',
    company_notes: relationship.company_notes || '',
    preferred: relationship.relationship_type === 'preferred_contractor',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        hourly_rate: form.hourly_rate === '' ? null : Number(form.hourly_rate),
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        company_notes: form.company_notes,
        relationship_type: form.preferred ? 'preferred_contractor' : 'contractor',
      };
      await contractorManagementService.updateRelationship(relationship.id, payload);
      onSaved();
    } catch (err) {
      console.error('Update failed:', err);
      setError(err?.response?.data?.detail || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <h3 className="ca-section-title" style={{ margin: 0 }}>
            Edit — {relationship.contractor_name}
          </h3>
          <button className="ca-btn-icon" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <div className="ca-modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="ca-inline-label">Hourly rate (NZD)</label>
                <input
                  className="ca-inline-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.hourly_rate}
                  onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: 22 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.preferred}
                    onChange={e => setForm(f => ({ ...f, preferred: e.target.checked }))}
                  />
                  <Star size={14} fill={form.preferred ? '#f59e0b' : 'none'} color="#f59e0b" />
                  Preferred contractor
                </label>
              </div>
              <div>
                <label className="ca-inline-label">Contract start</label>
                <input
                  className="ca-inline-input"
                  type="date"
                  value={form.contract_start}
                  onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))}
                />
              </div>
              <div>
                <label className="ca-inline-label">Contract end</label>
                <input
                  className="ca-inline-input"
                  type="date"
                  value={form.contract_end}
                  onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-md)' }}>
              <label className="ca-inline-label">Notes</label>
              <textarea
                className="ca-inline-input"
                rows={3}
                value={form.company_notes}
                onChange={e => setForm(f => ({ ...f, company_notes: e.target.value }))}
              />
            </div>

            {error && <div className="ca-form-error" style={{ marginTop: 'var(--space-base)' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
              <button type="button" className="ca-btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="ca-btn-primary" disabled={saving}>
                {saving ? <Loader size={14} /> : null} Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
