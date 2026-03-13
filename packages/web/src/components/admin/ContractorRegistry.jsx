// components/admin/ContractorRegistry.jsx — Contractor creation + list for system admin
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, X, Save, Loader, UserPlus } from 'lucide-react';
import { adminService } from '@vineyard/shared';

const CONTRACTOR_TYPES = ['individual', 'company', 'partnership'];
const SPECIALIZATION_OPTIONS = [
  'pruning', 'spraying', 'harvesting', 'pest_control',
  'canopy_management', 'irrigation', 'fencing', 'general',
];

export default function ContractorRegistry() {
  const [contractors, setContractors] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const [form, setForm] = useState({
    business_name: '',
    contact_person: '',
    email: '',
    phone: '',
    contractor_type: 'individual',
    specializations: [],
    generate_password: true,
    pre_verified: true,
    company_id: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contractorList, companyList] = await Promise.all([
        adminService.getAllContractors({ search, limit: 200 }),
        adminService.getAllCompanies({ limit: 500 }),
      ]);
      setContractors(contractorList);
      setCompanies(companyList);
    } catch (err) {
      console.error('Failed to load contractors:', err);
      setError('Failed to load contractors');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSpec = (spec) => {
    setForm((f) => ({
      ...f,
      specializations: f.specializations.includes(spec)
        ? f.specializations.filter((s) => s !== spec)
        : [...f.specializations, spec],
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.business_name.trim() || !form.contact_person.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Business name, contact person, email and phone are required.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await adminService.createContractor({
        business_name: form.business_name.trim(),
        contact_person: form.contact_person.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        contractor_type: form.contractor_type,
        specializations: form.specializations,
        generate_password: form.generate_password,
        pre_verified: form.pre_verified,
        company_id: form.company_id ? parseInt(form.company_id) : null,
      });

      const pwMsg = result.generated_password
        ? ` Generated password: ${result.generated_password}`
        : '';
      setSuccessMsg(`Contractor "${form.business_name}" created successfully.${pwMsg}`);
      setForm({
        business_name: '',
        contact_person: '',
        email: '',
        phone: '',
        contractor_type: 'individual',
        specializations: [],
        generate_password: true,
        pre_verified: true,
        company_id: '',
      });
      setShowCreate(false);
      fetchData();
    } catch (err) {
      console.error('Create contractor failed:', err);
      setError(err.response?.data?.detail || 'Failed to create contractor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#999' }} />
          <input
            type="text"
            placeholder="Search contractors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 8px 8px 32px',
              borderRadius: 8,
              border: '1px solid rgba(91,104,48,0.3)',
              fontSize: '0.9rem',
            }}
          />
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setSuccessMsg(null); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: showCreate ? '#D1583B' : '#5B6830',
            color: '#fff',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {showCreate ? <X size={16} /> : <UserPlus size={16} />}
          {showCreate ? 'Cancel' : 'New Contractor'}
        </button>
      </div>

      {successMsg && (
        <div style={{
          background: '#E4F2DC',
          border: '1px solid #5B6830',
          color: '#5B6830',
          padding: '8px 12px',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: '0.9rem',
        }}>
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#5B6830' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div style={{
          background: '#FBE4DE',
          border: '1px solid #D1583B',
          color: '#D1583B',
          padding: '8px 12px',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: '0.9rem',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#D1583B' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} style={{
          background: '#FDF6E3',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#D1583B', fontSize: '1rem' }}>Create New Contractor</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Business Name *</label>
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Contact Person *</label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone *</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
              <select
                value={form.contractor_type}
                onChange={(e) => setForm((f) => ({ ...f, contractor_type: e.target.value }))}
                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
              >
                {CONTRACTOR_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Link to Company</label>
              <select
                value={form.company_id}
                onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
              >
                <option value="">None</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>Specializations</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SPECIALIZATION_OPTIONS.map((spec) => (
                <label key={spec} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 16,
                  border: `1px solid ${form.specializations.includes(spec) ? '#5B6830' : '#ccc'}`,
                  background: form.specializations.includes(spec) ? '#E4F2DC' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}>
                  <input
                    type="checkbox"
                    checked={form.specializations.includes(spec)}
                    onChange={() => toggleSpec(spec)}
                    style={{ display: 'none' }}
                  />
                  {spec.replace('_', ' ')}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.generate_password}
                onChange={(e) => setForm((f) => ({ ...f, generate_password: e.target.checked }))}
              />
              Generate password
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.pre_verified}
                onChange={(e) => setForm((f) => ({ ...f, pre_verified: e.target.checked }))}
              />
              Pre-verify account
            </label>
          </div>

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#5B6830',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {saving ? <Loader size={14} className="v2-spin" /> : <UserPlus size={14} />}
              Create Contractor
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5B6830' }}>
          <Loader size={24} className="v2-spin" /> Loading contractors...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #FDF6E3', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Business Name</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Contact</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Email</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Type</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Specializations</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Status</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Relationships</th>
              </tr>
            </thead>
            <tbody>
              {contractors.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                    No contractors found
                  </td>
                </tr>
              ) : (
                contractors.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(91,104,48,0.12)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{c.business_name}</td>
                    <td style={{ padding: '8px 10px' }}>{c.contact_person}</td>
                    <td style={{ padding: '8px 10px' }}>{c.email}</td>
                    <td style={{ padding: '8px 10px' }}>{c.contractor_type}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {(c.specializations || []).map((s) => (
                        <span key={s} style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: '#FDF6E3',
                          color: '#5B6830',
                          fontSize: '0.8rem',
                          marginRight: 4,
                          marginBottom: 2,
                        }}>
                          {s.replace('_', ' ')}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: c.is_active ? '#E4F2DC' : '#FBE4DE',
                        color: c.is_active ? '#5B6830' : '#D1583B',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                      }}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>{c.relationship_count ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
