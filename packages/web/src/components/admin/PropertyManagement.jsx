// components/admin/PropertyManagement.jsx — Property CRUD table for system admin
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, X, Save, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { propertyService, adminService } from '@vineyard/shared';

export default function PropertyManagement() {
  const [properties, setProperties] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: '',
    owner_company_id: '',
    address: '',
    region: '',
    total_area_ha: '',
  });

  // Edit form state
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 200 };
      if (search) params.search = search;
      if (filterCompanyId) params.company_id = filterCompanyId;

      const [props, comps] = await Promise.all([
        propertyService.adminListAll(params),
        adminService.getAllCompanies({ limit: 500 }),
      ]);
      setProperties(props);
      setCompanies(comps);
    } catch (err) {
      console.error('Failed to load properties:', err);
      setError('Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, [search, filterCompanyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const companyName = (id) => {
    const c = companies.find((co) => co.id === id);
    return c ? c.name : id ? `Company #${id}` : '—';
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;

    setSaving(true);
    try {
      await propertyService.createProperty({
        name: createForm.name.trim(),
        owner_company_id: createForm.owner_company_id ? parseInt(createForm.owner_company_id) : null,
        address: createForm.address || null,
        region: createForm.region || null,
        total_area_ha: createForm.total_area_ha ? parseFloat(createForm.total_area_ha) : null,
      });
      setCreateForm({ name: '', owner_company_id: '', address: '', region: '', total_area_ha: '' });
      setShowCreate(false);
      fetchData();
    } catch (err) {
      console.error('Create property failed:', err);
      setError(err.response?.data?.detail || 'Failed to create property');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (prop) => {
    setEditId(prop.id);
    setEditForm({
      name: prop.name || '',
      address: prop.address || '',
      region: prop.region || '',
      total_area_ha: prop.total_area_ha || '',
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editForm.name?.trim()) return;

    setSaving(true);
    try {
      await propertyService.updateProperty(editId, {
        name: editForm.name.trim(),
        address: editForm.address || null,
        region: editForm.region || null,
        total_area_ha: editForm.total_area_ha ? parseFloat(editForm.total_area_ha) : null,
      });
      setEditId(null);
      fetchData();
    } catch (err) {
      console.error('Update property failed:', err);
      setError(err.response?.data?.detail || 'Failed to update property');
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
            placeholder="Search properties..."
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
        <select
          value={filterCompanyId}
          onChange={(e) => setFilterCompanyId(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(91,104,48,0.3)',
            fontSize: '0.9rem',
          }}
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate(!showCreate)}
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
          {showCreate ? <X size={16} /> : <Plus size={16} />}
          {showCreate ? 'Cancel' : 'New Property'}
        </button>
      </div>

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
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          alignItems: 'end',
        }}>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Owner Company</label>
            <select
              value={createForm.owner_company_id}
              onChange={(e) => setCreateForm((f) => ({ ...f, owner_company_id: e.target.value }))}
              style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
            >
              <option value="">None</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Region</label>
            <input
              type="text"
              value={createForm.region}
              onChange={(e) => setCreateForm((f) => ({ ...f, region: e.target.value }))}
              style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Area (ha)</label>
            <input
              type="number"
              step="0.01"
              value={createForm.total_area_ha}
              onChange={(e) => setCreateForm((f) => ({ ...f, total_area_ha: e.target.value }))}
              style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ccc' }}
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#5B6830',
                color: '#fff',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {saving ? <Loader size={14} className="v2-spin" /> : <Save size={14} />}
              Create
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5B6830' }}>
          <Loader size={24} className="v2-spin" /> Loading properties...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #FDF6E3', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Name</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Owner</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Manager</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Region</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Area (ha)</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Blocks</th>
                <th style={{ padding: '8px 10px', color: '#5B6830' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                    No properties found
                  </td>
                </tr>
              ) : (
                properties.map((prop) => (
                  <tr key={prop.id} style={{ borderBottom: '1px solid rgba(91,104,48,0.12)' }}>
                    {editId === prop.id ? (
                      <>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>{companyName(prop.owner_company_id)}</td>
                        <td style={{ padding: '6px 10px' }}>{companyName(prop.active_managing_company_id)}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="text"
                            value={editForm.region}
                            onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}
                            style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.total_area_ha}
                            onChange={(e) => setEditForm((f) => ({ ...f, total_area_ha: e.target.value }))}
                            style={{ width: 80, padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>{prop.block_count ?? '—'}</td>
                        <td style={{ padding: '6px 10px', display: 'flex', gap: 4 }}>
                          <button
                            onClick={handleUpdate}
                            disabled={saving}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#5B6830', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '8px 10px', fontWeight: 500 }}>{prop.name}</td>
                        <td style={{ padding: '8px 10px' }}>{companyName(prop.owner_company_id)}</td>
                        <td style={{ padding: '8px 10px' }}>{companyName(prop.active_managing_company_id)}</td>
                        <td style={{ padding: '8px 10px' }}>{prop.region || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{prop.total_area_ha ?? '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{prop.block_count ?? '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <button
                            onClick={() => startEdit(prop)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(91,104,48,0.3)', background: '#FDF6E3', color: '#5B6830', cursor: 'pointer', fontSize: '0.85rem' }}
                          >
                            Edit
                          </button>
                        </td>
                      </>
                    )}
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
