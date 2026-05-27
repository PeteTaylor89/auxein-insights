// pages/CompanyAdmin.jsx — Company admin management page (Grow V1, Revision 2)
// Tabs: Users & Properties, Timesheets, Training, Aliases, GrapeLink, Weather, Calendar Sync, Reports
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { Settings, Users, UserPlus, MapPinned, Clock, GraduationCap, Link2, Grape, CloudSun, Calendar, BarChart3, Copy, RefreshCw, Plus, Trash2, Check, X, Save, MapPin, Handshake, Grid3x3, Pencil, Rows3, CreditCard, ShieldCheck } from 'lucide-react';
import { companyAdminService, propertyService, usersService, reportService, blocksService, vineyardRowsService, byNatural, BLOCK_STATUS_OPTIONS, BLOCK_STATUS_DEFAULT } from '@vineyard/shared';
import CompanyUserManagement from '../components/admin/CompanyUserManagement';
import InvitationForm from '../components/admin/InvitationForm';
import ContractorRelationships from '../components/admin/ContractorRelationships';
import ForecastPointPicker from '../components/ForecastPointPicker';
import BlockStatusBadge from '../components/BlockStatusBadge';
import FeedbackModal from '../components/FeedbackModal';
import TaskReport from '../components/reports/TaskReport';
import ObservationReport from '../components/reports/ObservationReport';
import TimesheetReport from '../components/reports/TimesheetReport';
import AssetReport from '../components/reports/AssetReport';
import './CompanyAdmin.css';
import './Reports.css';

const TABS = [
  { key: 'users', label: 'Team', icon: Users },
  { key: 'invite', label: 'Invite', icon: UserPlus },
  { key: 'properties', label: 'Properties', icon: MapPinned },
  { key: 'blocks', label: 'Blocks', icon: Grid3x3 },
  { key: 'relationships', label: 'Relationships', icon: Handshake },
  { key: 'timesheets', label: 'Timesheets', icon: Clock },
  { key: 'training', label: 'Training', icon: GraduationCap },
  { key: 'aliases', label: 'Aliases', icon: Link2 },
  { key: 'grapelink', label: 'GrapeLink', icon: Grape },
  { key: 'weather', label: 'Weather', icon: CloudSun },
  { key: 'calendar', label: 'Calendar Sync', icon: Calendar },
  { key: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { key: 'compliance', label: 'Plans / Compliance', icon: ShieldCheck },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
];

function CompanyAdmin() {
  const { userTypeRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Sync activeTab with ?tab= URL param so deep-links like
  // /company-admin?tab=reports (from Home Quick Actions) land on the right tab
  // and the back button restores state correctly.
  const initialTab = searchParams.get('tab');
  const isValidTab = (k) => TABS.some(t => t.key === k);
  const [activeTab, setActiveTab] = useState(isValidTab(initialTab) ? initialTab : 'users');

  useEffect(() => {
    const t = searchParams.get('tab');
    if (isValidTab(t) && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabClick = (key) => {
    setActiveTab(key);
    // Keep the URL in sync; preserve other query params, drop the param when
    // landing on the default tab to keep clean URLs.
    const next = new URLSearchParams(searchParams);
    if (key === 'users') next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  if (userTypeRole !== 'company_admin' && userTypeRole !== 'auxein_admin') {
    return (
      <div className="page-container">
        <div className="ca-page">
          <h1 className="section-title">Access Denied</h1>
          <p>Company admin access required.</p>
        </div>
      </div>
    );
  }

  const ActiveIcon = TABS.find(t => t.key === activeTab)?.icon || Settings;

  return (
    <div className="page-container">
      <div className="ca-page">
        <div className="ca-header">
          <div className="ca-title-row">
            <ActiveIcon size={24} />
            <h1 className="section-title">Company Management</h1>
          </div>
        </div>

        <div className="ca-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={`ca-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => handleTabClick(tab.key)}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="ca-content">
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'invite' && <InviteTab />}
          {activeTab === 'properties' && <PropertiesTab />}
          {activeTab === 'blocks' && <BlocksTab />}
          {activeTab === 'relationships' && <RelationshipsTab />}
          {activeTab === 'timesheets' && <TimesheetsTab />}
          {activeTab === 'training' && <TrainingTab />}
          {activeTab === 'aliases' && <AliasesTab />}
          {activeTab === 'grapelink' && <GrapeLinkTab />}
          {activeTab === 'weather' && <WeatherTab />}
          {activeTab === 'calendar' && <CalendarSyncTab />}
          {activeTab === 'subscriptions' && <SubscriptionsTab />}
          {activeTab === 'compliance' && <CompliancePlansTab />}
          {activeTab === 'reports' && <ReportsTab />}
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Team (Users)
// ============================================================================
function UsersTab() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    import('@vineyard/shared').then(({ companiesService }) => {
      companiesService.getCurrentCompanyStats()
        .then(data => setStats(data))
        .catch(console.error);
    });
  }, []);

  return (
    <div className="ca-section">
      <CompanyUserManagement companyId={user?.company_id} />
    </div>
  );
}


// ============================================================================
// TAB: Invite Members
// ============================================================================
function InviteTab() {
  const [stats, setStats] = useState(null);
  const [invitations, setInvitations] = useState([]);

  const fetchInvitations = async () => {
    try {
      const { invitationService } = await import('@vineyard/shared');
      const data = await invitationService.getInvitations();
      setInvitations(data || []);
    } catch (err) {
      console.error('Error fetching invitations:', err);
    }
  };

  useEffect(() => {
    import('@vineyard/shared').then(({ companiesService }) => {
      companiesService.getCurrentCompanyStats()
        .then(data => setStats(data))
        .catch(console.error);
    });
    fetchInvitations();
  }, []);

  return (
    <div className="ca-section">
      <InvitationForm
        onInvitationSent={fetchInvitations}
        companyStats={stats}
      />

      {invitations.length > 0 && (
        <div className="ca-invitations-list">
          <h3 className="ca-section-title">Recent Invitations</h3>
          <table className="ca-table">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Status</th><th>Sent</th></tr>
            </thead>
            <tbody>
              {invitations.slice(0, 10).map(inv => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td className="ca-scope-role">{inv.role}</td>
                  <td><span className={`ca-inv-status ca-inv-${inv.status}`}>{inv.status}</span></td>
                  <td>{new Date(inv.sent_at).toLocaleDateString('en-NZ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// TAB: Properties (with user assignment)
// ============================================================================
function PropertiesTab() {
  const { user, userTypeRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [scopes, setScopes] = useState({});
  const [climateZones, setClimateZones] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', address: '', region: '', total_area_ha: '', climate_zone_id: '' });
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(null);

  // Edit state
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Block assignment panel state
  const [managingBlocksFor, setManagingBlocksFor] = useState(null); // property id

  const canManage = userTypeRole === 'company_admin' || userTypeRole === 'auxein_admin';

  const load = useCallback(async () => {
    try {
      let userList = [];
      let propList = [];
      let blockList = [];
      try {
        const rawUsers = await usersService.listCompanyUsers();
        userList = Array.isArray(rawUsers) ? rawUsers : [];
      } catch (err) { console.error('Failed to load users', err?.response?.data || err); }
      try {
        const rawProps = await propertyService.listProperties();
        propList = Array.isArray(rawProps) ? rawProps : [];
      } catch (err) { console.error('Failed to load properties', err?.response?.data || err); }
      try {
        const rawBlocks = await blocksService.getCompanyBlocks();
        blockList = rawBlocks?.blocks || (Array.isArray(rawBlocks) ? rawBlocks : []);
      } catch (err) { console.error('Failed to load blocks', err); }
      try {
        const zoneData = await companyAdminService.getClimateZones();
        const zones = zoneData?.zones || zoneData || [];
        setClimateZones(Array.isArray(zones) ? zones : []);
      } catch { setClimateZones([]); }

      setUsers(userList);
      setProperties(propList);
      // Natural sort blocks so "Block 2" < "Block 10" instead of lex order.
      setBlocks([...blockList].sort(byNatural('block_name')));

      const scopeMap = {};
      for (const u of userList) {
        if (u.user_type !== 'company_admin') {
          try {
            const res = await companyAdminService.getUserPropertyScopes(u.id);
            scopeMap[u.id] = (res.data || []).map(s => s.property_id);
          } catch { scopeMap[u.id] = []; }
        }
      }
      setScopes(scopeMap);
    } catch (err) {
      console.error('Failed to load users/properties', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleScope = async (userId, propertyId) => {
    const current = scopes[userId] || [];
    const next = current.includes(propertyId)
      ? current.filter(id => id !== propertyId)
      : [...current, propertyId];
    try {
      await companyAdminService.setUserPropertyScopes(userId, next);
      setScopes(prev => ({ ...prev, [userId]: next }));
    } catch (err) { console.error('Failed to update scope', err); }
  };

  const handleCreate = async (e, addAnother = false) => {
    if (e?.preventDefault) e.preventDefault();
    if (!createForm.name.trim()) { alert('Property name is required'); return; }
    setCreating(true);
    setCreateSuccess(null);
    try {
      const payload = {
        name: createForm.name.trim(),
        address: createForm.address || null,
        region: createForm.region || null,
        total_area_ha: createForm.total_area_ha ? parseFloat(createForm.total_area_ha) : null,
        climate_zone_id: createForm.climate_zone_id ? parseInt(createForm.climate_zone_id) : null,
        owner_company_id: user?.company_id || null,
      };
      const created = await propertyService.createProperty(payload);
      const createdName = created?.name || payload.name;
      setCreateForm({ name: '', address: '', region: '', total_area_ha: '', climate_zone_id: '' });
      await load();
      if (addAnother) {
        setCreateSuccess(`Created "${createdName}". Add another below.`);
        // Keep form open
      } else {
        setShowCreate(false);
      }
    } catch (err) {
      console.error('Failed to create property:', err);
      alert(err?.response?.data?.detail || err.message || 'Failed to create property');
    } finally { setCreating(false); }
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setEditForm({
      name: p.name || '',
      address: p.address || '',
      region: p.region || '',
      total_area_ha: p.total_area_ha ?? '',
      climate_zone_id: p.climate_zone_id ?? '',
    });
  };

  const cancelEdit = () => { setEditId(null); setEditForm({}); };

  const saveEdit = async (id) => {
    try {
      const payload = {
        name: editForm.name.trim(),
        address: editForm.address || null,
        region: editForm.region || null,
        total_area_ha: editForm.total_area_ha ? parseFloat(editForm.total_area_ha) : null,
        climate_zone_id: editForm.climate_zone_id ? parseInt(editForm.climate_zone_id) : null,
      };
      await propertyService.updateProperty(id, payload);
      setEditId(null);
      setEditForm({});
      await load();
    } catch (err) {
      console.error('Failed to update property:', err);
      alert(err?.response?.data?.detail || err.message || 'Failed to update property');
    }
  };

  const toggleBlockAssignment = async (blockId, propertyId, isAssigned) => {
    try {
      await blocksService.updateBlock(blockId, { property_id: isAssigned ? null : propertyId });
      // Update local state optimistically
      setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, property_id: isAssigned ? null : propertyId } : b));
    } catch (err) {
      console.error('Failed to update block assignment:', err);
      alert('Failed to update block assignment');
    }
  };

  if (loading) return <p className="ca-loading">Loading properties...</p>;

  const zoneName = (zoneId) => {
    if (!zoneId) return null;
    const zone = climateZones.find(z => z.id === zoneId);
    return zone?.name || null;
  };

  return (
    <div className="ca-section">
      <div className="ca-section-header">
        <h2 className="ca-section-title">Properties</h2>
        {canManage && !showCreate && (
          <button className="ca-btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Property
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ padding: 'var(--space-base)', background: 'var(--color-surface-warm)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)' }}>
          <h3 className="ca-section-title" style={{ marginTop: 0 }}>Create Property</h3>
          {createSuccess && (
            <div className="ca-form-success">
              <Check size={14} /> {createSuccess}
            </div>
          )}
          <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div>
              <label className="ca-inline-label">Name *</label>
              <input className="ca-inline-input" type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., North Valley Estate" required />
            </div>
            <div>
              <label className="ca-inline-label">Region</label>
              <input className="ca-inline-input" type="text" value={createForm.region} onChange={e => setCreateForm(f => ({ ...f, region: e.target.value }))} placeholder="e.g., Marlborough" />
            </div>
            <div>
              <label className="ca-inline-label">Area (ha)</label>
              <input className="ca-inline-input" type="number" step="0.01" value={createForm.total_area_ha} onChange={e => setCreateForm(f => ({ ...f, total_area_ha: e.target.value }))} />
            </div>
            <div>
              <label className="ca-inline-label">Climate Zone</label>
              <select className="ca-inline-input" value={createForm.climate_zone_id} onChange={e => setCreateForm(f => ({ ...f, climate_zone_id: e.target.value }))}>
                <option value="">Not set</option>
                {climateZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="ca-inline-label">Address</label>
              <input className="ca-inline-input" type="text" value={createForm.address} onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))} placeholder="Street, suburb, city" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-base)', justifyContent: 'flex-end' }}>
            <button type="button" className="ca-btn-icon" onClick={() => { setShowCreate(false); setCreateSuccess(null); setCreateForm({ name: '', address: '', region: '', total_area_ha: '', climate_zone_id: '' }); }}>Cancel</button>
            <button type="button" className="ca-btn-secondary" disabled={creating} onClick={(e) => handleCreate(e, true)}>
              <Plus size={14} /> {creating ? 'Saving...' : 'Save & Add Another'}
            </button>
            <button type="submit" className="ca-btn-primary" disabled={creating}>
              <Save size={14} /> {creating ? 'Creating...' : 'Create Property'}
            </button>
          </div>
        </form>
      )}

      {properties.length === 0 ? (
        <p className="ca-empty">No properties yet. {canManage ? 'Click "New Property" to create one.' : 'Ask your admin to create a property.'}</p>
      ) : (
        <>
          <table className="ca-table">
            <thead>
              <tr><th>Name</th><th>Region</th><th>Area (ha)</th><th>Climate Zone</th><th>Blocks</th>{canManage && <th>Actions</th>}</tr>
            </thead>
            <tbody>
              {properties.map(p => {
                const assignedBlocks = blocks.filter(b => b.property_id === p.id);
                const isEditing = editId === p.id;
                return (
                  <tr key={p.id}>
                    {isEditing ? (
                      <>
                        <td><input className="ca-inline-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></td>
                        <td><input className="ca-inline-input" value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} /></td>
                        <td><input className="ca-inline-input" type="number" step="0.01" value={editForm.total_area_ha} onChange={e => setEditForm(f => ({ ...f, total_area_ha: e.target.value }))} /></td>
                        <td>
                          <select className="ca-inline-input" value={editForm.climate_zone_id} onChange={e => setEditForm(f => ({ ...f, climate_zone_id: e.target.value }))}>
                            <option value="">Not set</option>
                            {climateZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                          </select>
                        </td>
                        <td>{assignedBlocks.length}</td>
                        <td>
                          <button className="ca-btn-icon" onClick={() => saveEdit(p.id)} title="Save"><Save size={14} /></button>
                          <button className="ca-btn-icon" onClick={cancelEdit} title="Cancel"><X size={14} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td>{p.region || <span className="ca-muted">-</span>}</td>
                        <td>{p.total_area_ha || <span className="ca-muted">-</span>}</td>
                        <td>{zoneName(p.climate_zone_id) || <span className="ca-muted">Not set</span>}</td>
                        <td>
                          <button
                            className={`ca-chip-btn ${managingBlocksFor === p.id ? 'active' : ''}`}
                            onClick={() => setManagingBlocksFor(managingBlocksFor === p.id ? null : p.id)}
                            title={canManage ? 'Manage block assignments' : 'View assigned blocks'}
                          >
                            <MapPinned size={12} />
                            {assignedBlocks.length} {assignedBlocks.length === 1 ? 'block' : 'blocks'}
                          </button>
                        </td>
                        {canManage && (
                          <td>
                            <button className="ca-chip-btn" onClick={() => startEdit(p)} title="Edit"><Pencil size={12} /> Edit</button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Block assignment panel */}
          {managingBlocksFor && (
            <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-base)', background: 'var(--color-surface-warm)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <h3 className="ca-section-title" style={{ margin: 0 }}>
                  Assign Blocks to "{properties.find(p => p.id === managingBlocksFor)?.name}"
                </h3>
                <button className="ca-btn-icon" onClick={() => setManagingBlocksFor(null)}><X size={14} /></button>
              </div>
              <p className="ca-section-desc">Tick blocks to assign them to this property. Blocks can only belong to one property at a time.</p>
              <div style={{ display: 'grid', gap: 'var(--space-sm)', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {blocks.length === 0 ? (
                  <p className="ca-muted">No blocks available. Create blocks via the map.</p>
                ) : blocks.map(b => {
                  const assignedHere = b.property_id === managingBlocksFor;
                  const assignedElsewhere = b.property_id && !assignedHere;
                  return (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)', background: assignedHere ? 'var(--color-olive-light)' : 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: canManage ? 'pointer' : 'default', opacity: assignedElsewhere ? 0.6 : 1 }}>
                      <input
                        type="checkbox"
                        checked={assignedHere}
                        disabled={!canManage}
                        onChange={() => toggleBlockAssignment(b.id, managingBlocksFor, assignedHere)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{b.block_name || 'Unnamed block'}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          {b.variety || 'No variety'} {b.area ? `• ${Number(b.area).toFixed(2)} ha` : ''}
                          {assignedElsewhere && (
                            <span style={{ color: 'var(--color-warning)' }}> • assigned to another property</span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <h3 className="ca-section-title" style={{ marginTop: 'var(--space-lg)' }}>User Property Assignments</h3>
          <p className="ca-section-desc">
            Assign users to specific properties. Users with no assignments see all properties.
            Company admins always see all properties.
          </p>

          <div className="ca-scope-table-wrap">
            <table className="ca-scope-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  {properties.map(p => (
                    <th key={p.id} className="ca-scope-prop-header" title={p.name}>
                      {p.name.length > 12 ? p.name.slice(0, 12) + '...' : p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isAdmin = u.user_type === 'company_admin';
                  const userScopes = scopes[u.id] || [];
                  return (
                    <tr key={u.id}>
                      <td className="ca-scope-user">{u.first_name} {u.last_name || u.username}</td>
                      <td className="ca-scope-role">{u.user_type?.replace('company_', '')}</td>
                      {properties.map(p => (
                        <td key={p.id} className="ca-scope-cell">
                          {isAdmin ? (
                            <span className="ca-scope-all" title="Admins see all">-</span>
                          ) : (
                            <button
                              className={`ca-scope-check ${userScopes.includes(p.id) ? 'active' : ''} ${userScopes.length === 0 ? 'default-all' : ''}`}
                              onClick={() => toggleScope(u.id, p.id)}
                              title={
                                userScopes.length === 0
                                  ? 'Default: sees all properties (click to limit)'
                                  : userScopes.includes(p.id) ? 'Remove access' : 'Grant access'
                              }
                            >
                              {(userScopes.length === 0 || userScopes.includes(p.id)) && (
                                <Check size={16} color="#16a34a" strokeWidth={3} />
                              )}
                            </button>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}


// ============================================================================
// TAB: Relationships (placeholder — property management + contractor relationships)
// ============================================================================
function RelationshipsTab() {
  return (
    <div className="ca-section">
      <h2 className="ca-section-title">
        <Handshake size={18} style={{ verticalAlign: 'middle', marginRight: 'var(--space-xs)' }} />
        Contractor Relationships
      </h2>
      <p className="ca-section-desc">
        Manage the contractors who work for your company. Add a relationship to make a contractor assignable to tasks.
      </p>
      <ContractorRelationships />

      <h2 className="ca-section-title" style={{ marginTop: 'var(--space-xl, 32px)' }}>
        <MapPinned size={18} style={{ verticalAlign: 'middle', marginRight: 'var(--space-xs)' }} />
        Property Management
      </h2>
      <div className="ca-relationships-grid">
        <div className="ca-relationship-card">
          <div className="ca-relationship-icon">
            <MapPinned size={28} />
          </div>
          <div className="ca-relationship-body">
            <h3 className="ca-relationship-title">Transfer property management</h3>
            <p className="ca-relationship-desc">
              Transfer day-to-day management of a property to another company, or take over management of a property you don't own. Backed by an audit trail.
            </p>
            <span className="ca-relationship-status">Coming soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Blocks (block metadata + row management)
// ============================================================================
function BlocksTab() {
  const { userTypeRole } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingBlockId, setEditingBlockId] = useState(null);

  const canManage = userTypeRole === 'company_admin' || userTypeRole === 'auxein_admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rawBlocks, rawProps] = await Promise.all([
        blocksService.getCompanyBlocks().catch(() => ({ blocks: [] })),
        propertyService.listProperties().catch(() => []),
      ]);
      const blockList = rawBlocks?.blocks || (Array.isArray(rawBlocks) ? rawBlocks : []);
      setBlocks(blockList);
      setProperties(Array.isArray(rawProps) ? rawProps : []);
    } catch (err) {
      console.error('Failed to load blocks/properties', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const propertyName = (id) => properties.find(p => p.id === id)?.name || '—';

  const filteredBlocks = blocks.filter(b => {
    if (propertyFilter === 'unassigned' && b.property_id) return false;
    if (propertyFilter !== 'all' && propertyFilter !== 'unassigned' && b.property_id !== parseInt(propertyFilter)) return false;
    if (statusFilter !== 'all' && (b.status || BLOCK_STATUS_DEFAULT) !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (b.block_name || '').toLowerCase().includes(q) || (b.variety || '').toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    // Sort by property name first, then natural block_name within property.
    // Without this rows render in API order, which is effectively random.
    const pa = a.property_id ? (propertyName(a.property_id) || '') : '~~unassigned';
    const pb = b.property_id ? (propertyName(b.property_id) || '') : '~~unassigned';
    if (pa !== pb) return pa.localeCompare(pb);
    return byNatural('block_name')(a, b);
  });

  if (loading) return <p className="ca-loading">Loading blocks...</p>;

  return (
    <div className="ca-section">
      <div className="ca-section-header">
        <h2 className="ca-section-title">Blocks</h2>
      </div>
      <p className="ca-section-desc">
        Edit block details and manage rows. Block geometry is edited via the map.
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="ca-inline-input"
          style={{ maxWidth: 240 }}
          type="text"
          placeholder="Search name or variety..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="ca-inline-input"
          style={{ maxWidth: 220 }}
          value={propertyFilter}
          onChange={e => setPropertyFilter(e.target.value)}
        >
          <option value="all">All properties</option>
          <option value="unassigned">Unassigned</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          className="ca-inline-input"
          style={{ maxWidth: 200 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {BLOCK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span className="ca-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
          {filteredBlocks.length} of {blocks.length} blocks
        </span>
      </div>

      {filteredBlocks.length === 0 ? (
        <p className="ca-empty">No blocks match your filters.</p>
      ) : (
        <table className="ca-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Variety</th>
              <th>Property</th>
              <th>Area (ha)</th>
              <th>Rows</th>
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredBlocks.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 500 }}>{b.block_name || 'Unnamed'}</td>
                <td><BlockStatusBadge status={b.status || BLOCK_STATUS_DEFAULT} size="sm" /></td>
                <td>{b.variety || <span className="ca-muted">—</span>}</td>
                <td>{b.property_id ? propertyName(b.property_id) : <span className="ca-muted">Unassigned</span>}</td>
                <td>{b.area ? Number(b.area).toFixed(2) : <span className="ca-muted">—</span>}</td>
                <td>{b.row_count ?? <span className="ca-muted">—</span>}</td>
                {canManage && (
                  <td>
                    <button className="ca-chip-btn" onClick={() => setEditingBlockId(b.id)} title="Edit block">
                      <Pencil size={12} /> Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingBlockId && (
        <BlockEditModal
          blockId={editingBlockId}
          properties={properties}
          onClose={() => setEditingBlockId(null)}
          onSaved={() => { load(); }}
        />
      )}
    </div>
  );
}


// ============================================================================
// Block Edit Modal — metadata + row management
// ============================================================================
const VARIETY_OPTIONS = [
  'Sauvignon Blanc', 'Pinot Noir', 'Chardonnay', 'Pinot Gris', 'Riesling',
  'Merlot', 'Syrah', 'Gewürztraminer', 'Cabernet Sauvignon', 'Malbec',
  'Viognier', 'Cabernet Franc', 'Other',
];
const TRAINING_SYSTEMS = ['VSP', 'Scott Henry', 'Lyre', 'Geneva Double Curtain', 'Pergola', 'Gobelet', 'Cordon', 'Cane Pruned', 'Other'];

function BlockEditModal({ blockId, properties, onClose, onSaved }) {
  const [block, setBlock] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await blocksService.getBlockById(blockId);
      setBlock(b);
      setForm({
        block_name: b.block_name || '',
        status: b.status || BLOCK_STATUS_DEFAULT,
        variety: b.variety || '',
        clone: b.clone || '',
        rootstock: b.rootstock || '',
        training_system: b.training_system || '',
        planted_date: b.planted_date?.slice(0, 10) || '',
        removed_date: b.removed_date?.slice(0, 10) || '',
        row_spacing: b.row_spacing ?? '',
        vine_spacing: b.vine_spacing ?? '',
        swnz: !!b.swnz,
        organic: !!b.organic,
        biodynamic: !!b.biodynamic,
        regenerative: !!b.regenerative,
        property_id: b.property_id ?? '',
      });
      try {
        const r = await vineyardRowsService.getRowsByBlock(blockId);
        setRows(Array.isArray(r) ? r : []);
      } catch {
        setRows([]);
      }
    } catch (err) {
      console.error('Failed to load block', err);
      setError('Failed to load block details');
    } finally {
      setLoading(false);
    }
  }, [blockId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [field]: val }));
  };

  const handleSaveBlock = async (e) => {
    e?.preventDefault?.();
    if (!form.block_name.trim()) { setError('Block name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await blocksService.updateBlock(blockId, {
        block_name: form.block_name.trim(),
        status: form.status || BLOCK_STATUS_DEFAULT,
        variety: form.variety || null,
        clone: form.clone || null,
        rootstock: form.rootstock || null,
        training_system: form.training_system || null,
        planted_date: form.planted_date || null,
        removed_date: form.removed_date || null,
        row_spacing: form.row_spacing ? parseFloat(form.row_spacing) : null,
        vine_spacing: form.vine_spacing ? parseFloat(form.vine_spacing) : null,
        swnz: form.swnz,
        organic: form.organic,
        biodynamic: form.biodynamic,
        regenerative: form.regenerative,
        property_id: form.property_id ? parseInt(form.property_id) : null,
      });
      onSaved?.();
      await loadAll();
    } catch (err) {
      console.error('Save block failed', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to save block');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllRows = async () => {
    if (!window.confirm(`Delete all ${rows.length} rows for this block?`)) return;
    try {
      await vineyardRowsService.deleteAllRowsByBlock(blockId);
      setRows([]);
      onSaved?.();
    } catch (err) {
      console.error('Delete rows failed', err);
      alert(err?.response?.data?.detail || 'Failed to delete rows');
    }
  };

  return (
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <h3 className="ca-section-title" style={{ margin: 0 }}>Edit Block</h3>
          <button className="ca-btn-icon" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <div className="ca-modal-body">
          {loading && <p className="ca-loading">Loading...</p>}
          {error && <div className="ca-form-error">{error}</div>}
          {!loading && form && (
            <>
              <form onSubmit={handleSaveBlock}>
                <h4 className="ca-section-title" style={{ fontSize: 'var(--font-size-md)', marginBottom: 'var(--space-sm)' }}>Details</h4>
                <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div>
                    <label className="ca-inline-label">Name *</label>
                    <input className="ca-inline-input" value={form.block_name} onChange={handleChange('block_name')} required />
                  </div>
                  <div>
                    <label className="ca-inline-label">Property</label>
                    <select className="ca-inline-input" value={form.property_id} onChange={handleChange('property_id')}>
                      <option value="">Unassigned</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="ca-inline-label">Status</label>
                    <select className="ca-inline-input" value={form.status} onChange={handleChange('status')}>
                      {BLOCK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="ca-inline-label">Variety</label>
                    <input className="ca-inline-input" list="block-variety-options" value={form.variety} onChange={handleChange('variety')} />
                    <datalist id="block-variety-options">
                      {VARIETY_OPTIONS.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="ca-inline-label">Clone</label>
                    <input className="ca-inline-input" value={form.clone} onChange={handleChange('clone')} />
                  </div>
                  <div>
                    <label className="ca-inline-label">Rootstock</label>
                    <input className="ca-inline-input" value={form.rootstock} onChange={handleChange('rootstock')} />
                  </div>
                  <div>
                    <label className="ca-inline-label">Training System</label>
                    <select className="ca-inline-input" value={form.training_system} onChange={handleChange('training_system')}>
                      <option value="">Select...</option>
                      {TRAINING_SYSTEMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="ca-inline-label">Planted Date</label>
                    <input className="ca-inline-input" type="date" value={form.planted_date} onChange={handleChange('planted_date')} />
                  </div>
                  <div>
                    <label className="ca-inline-label">Removed Date</label>
                    <input className="ca-inline-input" type="date" value={form.removed_date} onChange={handleChange('removed_date')} />
                  </div>
                  <div>
                    <label className="ca-inline-label">Row Spacing (m)</label>
                    <input className="ca-inline-input" type="number" step="0.1" value={form.row_spacing} onChange={handleChange('row_spacing')} />
                  </div>
                  <div>
                    <label className="ca-inline-label">Vine Spacing (m)</label>
                    <input className="ca-inline-input" type="number" step="0.1" value={form.vine_spacing} onChange={handleChange('vine_spacing')} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-md)', flexWrap: 'wrap' }}>
                  {['swnz', 'organic', 'biodynamic', 'regenerative'].map(cert => (
                    <label key={cert} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 'var(--font-size-sm)' }}>
                      <input type="checkbox" checked={form[cert]} onChange={handleChange(cert)} />
                      {cert.toUpperCase()}
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-base)' }}>
                  <button type="submit" className="ca-btn-primary" disabled={saving}>
                    <Save size={14} /> {saving ? 'Saving...' : 'Save Block'}
                  </button>
                </div>
              </form>

              <hr style={{ margin: 'var(--space-lg) 0', border: 0, borderTop: '1px solid var(--color-border)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                <h4 className="ca-section-title" style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>
                  <Rows3 size={16} style={{ verticalAlign: 'middle', marginRight: 'var(--space-xs)' }} />
                  Rows ({rows.length})
                </h4>
                {rows.length > 0 && (
                  <button className="ca-btn-icon" onClick={handleDeleteAllRows} title="Delete all rows">
                    <Trash2 size={14} /> Delete All
                  </button>
                )}
              </div>

              {rows.length === 0 ? (
                <BulkRowCreate blockId={blockId} block={block} onCreated={loadAll} />
              ) : (
                <RowsTable rows={rows} onChange={loadAll} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BulkRowCreate({ blockId, block, onCreated }) {
  const [form, setForm] = useState({
    row_start: block?.row_start || '1',
    row_end: block?.row_end || '',
    row_count: block?.row_count || '',
    variety: block?.variety || '',
    clone: block?.clone || '',
    rootstock: block?.rootstock || '',
    vine_spacing: block?.vine_spacing ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handle = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    const count = parseInt(form.row_count);
    if (!form.row_start || !form.row_end || !count || count < 1) {
      setErr('Row start, end and count are all required'); return;
    }
    setSaving(true);
    try {
      await vineyardRowsService.bulkCreateRows({
        block_id: blockId,
        row_start: String(form.row_start),
        row_end: String(form.row_end),
        row_count: count,
        variety: form.variety || null,
        clone: form.clone || null,
        rootstock: form.rootstock || null,
        vine_spacing: form.vine_spacing ? parseFloat(form.vine_spacing) : null,
      });
      await onCreated();
    } catch (e) {
      console.error('Bulk create failed', e);
      setErr(e?.response?.data?.detail || 'Failed to create rows');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: 'var(--space-base)', background: 'var(--color-surface-warm)', borderRadius: 'var(--radius-md)' }}>
      <p className="ca-section-desc" style={{ marginBottom: 'var(--space-md)' }}>
        No rows yet. Create a range (e.g. 1–20, or A–J) and the rows will be generated with the defaults below.
      </p>
      {err && <div className="ca-form-error" style={{ marginBottom: 'var(--space-sm)' }}>{err}</div>}
      <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div>
          <label className="ca-inline-label">Row Start *</label>
          <input className="ca-inline-input" value={form.row_start} onChange={handle('row_start')} placeholder="1 or A" required />
        </div>
        <div>
          <label className="ca-inline-label">Row End *</label>
          <input className="ca-inline-input" value={form.row_end} onChange={handle('row_end')} placeholder="20 or J" required />
        </div>
        <div>
          <label className="ca-inline-label">Row Count *</label>
          <input className="ca-inline-input" type="number" min="1" value={form.row_count} onChange={handle('row_count')} required />
        </div>
        <div>
          <label className="ca-inline-label">Variety</label>
          <input className="ca-inline-input" value={form.variety} onChange={handle('variety')} />
        </div>
        <div>
          <label className="ca-inline-label">Clone</label>
          <input className="ca-inline-input" value={form.clone} onChange={handle('clone')} />
        </div>
        <div>
          <label className="ca-inline-label">Rootstock</label>
          <input className="ca-inline-input" value={form.rootstock} onChange={handle('rootstock')} />
        </div>
        <div>
          <label className="ca-inline-label">Vine Spacing (m)</label>
          <input className="ca-inline-input" type="number" step="0.1" value={form.vine_spacing} onChange={handle('vine_spacing')} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-base)' }}>
        <button type="submit" className="ca-btn-primary" disabled={saving}>
          <Plus size={14} /> {saving ? 'Creating...' : 'Create Rows'}
        </button>
      </div>
    </form>
  );
}

function RowsTable({ rows, onChange }) {
  const [editingRowId, setEditingRowId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const startEdit = (r) => {
    setEditingRowId(r.id);
    setForm({
      row_number: r.row_number ?? '',
      variety: r.variety || '',
      clone: r.clone || '',
      rootstock: r.rootstock || '',
      row_length: r.row_length ?? '',
      vine_spacing: r.vine_spacing ?? '',
    });
  };
  const cancel = () => { setEditingRowId(null); setForm({}); };

  const save = async (id) => {
    setSaving(true);
    try {
      await vineyardRowsService.updateRow(id, {
        row_number: String(form.row_number),
        variety: form.variety || null,
        clone: form.clone || null,
        rootstock: form.rootstock || null,
        row_length: form.row_length ? parseFloat(form.row_length) : null,
        vine_spacing: form.vine_spacing ? parseFloat(form.vine_spacing) : null,
      });
      await onChange();
      cancel();
    } catch (e) {
      console.error('Row save failed', e);
      alert(e?.response?.data?.detail || 'Failed to save row');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this row?')) return;
    try {
      await vineyardRowsService.deleteRow(id);
      await onChange();
    } catch (e) {
      console.error('Row delete failed', e);
      alert(e?.response?.data?.detail || 'Failed to delete row');
    }
  };

  const handle = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  // Natural-sort rows so 1, 2, 10, 11 instead of 1, 10, 11, 2. Without this
  // the API returns insertion order and rows look randomised.
  const sortedRows = [...(rows || [])].sort(byNatural('row_number'));

  return (
    <div style={{ maxHeight: 420, overflowY: 'auto' }}>
      <table className="ca-table">
        <thead>
          <tr>
            <th>Row</th>
            <th>Variety</th>
            <th>Clone</th>
            <th>Rootstock</th>
            <th>Length (m)</th>
            <th>Vine Spacing</th>
            <th>Vines</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(r => {
            const isEditing = editingRowId === r.id;
            return (
              <tr key={r.id}>
                {isEditing ? (
                  <>
                    <td><input className="ca-inline-input" value={form.row_number} onChange={handle('row_number')} /></td>
                    <td><input className="ca-inline-input" value={form.variety} onChange={handle('variety')} /></td>
                    <td><input className="ca-inline-input" value={form.clone} onChange={handle('clone')} /></td>
                    <td><input className="ca-inline-input" value={form.rootstock} onChange={handle('rootstock')} /></td>
                    <td><input className="ca-inline-input" type="number" step="0.1" value={form.row_length} onChange={handle('row_length')} /></td>
                    <td><input className="ca-inline-input" type="number" step="0.1" value={form.vine_spacing} onChange={handle('vine_spacing')} /></td>
                    <td>{r.vine_count ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ca-btn-icon" onClick={() => save(r.id)} disabled={saving} title="Save"><Save size={14} /></button>
                      <button className="ca-btn-icon" onClick={cancel} title="Cancel"><X size={14} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ fontWeight: 500 }}>{r.row_number}</td>
                    <td>{r.variety || <span className="ca-muted">—</span>}</td>
                    <td>{r.clone || <span className="ca-muted">—</span>}</td>
                    <td>{r.rootstock || <span className="ca-muted">—</span>}</td>
                    <td>{r.row_length ?? <span className="ca-muted">—</span>}</td>
                    <td>{r.vine_spacing ?? <span className="ca-muted">—</span>}</td>
                    <td>{r.vine_count ?? <span className="ca-muted">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ca-btn-icon" onClick={() => startEdit(r)} title="Edit"><Pencil size={14} /></button>
                      <button className="ca-btn-icon" onClick={() => remove(r.id)} title="Delete"><Trash2 size={14} /></button>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ============================================================================
// TAB: Timesheets
// ============================================================================
function TimesheetsTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    companyAdminService.getTimesheetSummary()
      .then(res => setSummary(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="ca-loading">Loading timesheet summary...</p>;
  if (!summary) return <p className="ca-empty">Could not load timesheet data.</p>;

  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Timesheet Overview</h2>
      <div className="ca-stats-grid">
        <div className="stat-card"><div className="stat-value">{summary.pending_approval}</div><div className="stat-label">Pending Approval</div></div>
        <div className="stat-card"><div className="stat-value">{summary.by_status?.approved || 0}</div><div className="stat-label">Approved</div></div>
        <div className="stat-card"><div className="stat-value">{summary.by_status?.rejected || 0}</div><div className="stat-label">Rejected</div></div>
        <div className="stat-card"><div className="stat-value">{summary.total_hours}</div><div className="stat-label">Total Hours</div></div>
      </div>
      <div className="ca-link-row">
        <Link to="/timesheets" className="ca-btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', padding: '8px 18px', borderRadius: 999 }}>
          <Clock size={14} /> View full timesheets
        </Link>
      </div>

      <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-base)', background: 'var(--color-surface-warm)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
        <BarChart3 size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
        <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>Timesheet analysis — coming soon</h3>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Hours by block, by task category, by user. Trend lines, productivity benchmarks, and overtime flags.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Training — placeholder for V1 (modules + routes still live in the
// codebase, just delinked from the active UI). Restore by replacing this
// function body with the prior implementation below this marker.
// ============================================================================
function TrainingTab() {
  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Training</h2>
      <div className="ca-empty" style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
        <GraduationCap size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>Training modules — coming soon</h3>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Module library, assignments, and completion tracking will arrive in a future release.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Subscriptions (placeholder — Xero owns invoicing, this surface will
// summarise plan, seat usage, trial status, and a Contact CTA. See
// docs/plans/COMPANYADMIN_BILLING_SCOPING.md.)
// ============================================================================
function SubscriptionsTab() {
  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Subscriptions</h2>
      <div className="ca-empty" style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
        <CreditCard size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>Subscriptions — coming soon</h3>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Current plan, commitment term, billing cadence, seat usage, and a Contact link for changes. Invoicing stays in Xero.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Plans / Compliance (placeholder — will generate management plans like
// SWNZ, BioGro, Organics, Biodynamic from data already held in Grow.)
// ============================================================================
function CompliancePlansTab() {
  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Plans / Compliance</h2>
      <div className="ca-empty" style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
        <ShieldCheck size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>Plans &amp; Compliance — coming soon</h3>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Generate management plans for SWNZ, BioGro, Organics and Biodynamic directly from the blocks, tasks, calibrations,
          observations and risks already captured in Grow.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Aliases
// ============================================================================
function AliasesTab() {
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entity_type: 'block', entity_id: '', system_name: '', external_id: '', external_label: '' });
  // Source lists for the entity_id dropdown. Loaded once per tab open.
  const [blockOpts, setBlockOpts] = useState([]);
  const [propertyOpts, setPropertyOpts] = useState([]);
  const [userOpts, setUserOpts] = useState([]);

  const load = useCallback(() => {
    companyAdminService.getAliases()
      .then(res => setAliases(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pre-fetch the dropdown source lists so the entity_id selector is instant
  // when a user opens the create form.
  useEffect(() => {
    blocksService.getCompanyBlocks().then(res => {
      const list = res?.blocks || (Array.isArray(res) ? res : []);
      setBlockOpts([...list].sort(byNatural('block_name')));
    }).catch(() => setBlockOpts([]));
    propertyService.listProperties().then(list => {
      setPropertyOpts(Array.isArray(list) ? list : []);
    }).catch(() => setPropertyOpts([]));
    usersService.listCompanyUsers().then(list => {
      setUserOpts(Array.isArray(list) ? list : []);
    }).catch(() => setUserOpts([]));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await companyAdminService.createAlias({
        ...form,
        entity_id: parseInt(form.entity_id),
      });
      setShowForm(false);
      setForm({ entity_type: 'block', entity_id: '', system_name: '', external_id: '', external_label: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create alias');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this alias?')) return;
    try {
      await companyAdminService.deleteAlias(id);
      load();
    } catch (err) {
      console.error('Failed to delete alias', err);
    }
  };

  if (loading) return <p className="ca-loading">Loading aliases...</p>;

  return (
    <div className="ca-section">
      <div className="ca-section-header">
        <h2 className="ca-section-title">External System Aliases</h2>
        <button className="ca-btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancel' : 'Add Alias'}
        </button>
      </div>

      {showForm && (
        <form className="ca-alias-form" onSubmit={handleCreate}>
          <select value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value, entity_id: '' }))}>
            <option value="block">Block</option>
            <option value="property">Property</option>
            <option value="asset">Asset</option>
            <option value="user">User</option>
            <option value="station">Station</option>
          </select>
          {/* Dropdown for known entity types so users don't have to remember
              numeric IDs. Asset + Station fall back to a number input. */}
          {form.entity_type === 'block' ? (
            <select value={form.entity_id} onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))} required>
              <option value="">Select block...</option>
              {blockOpts.map(b => (
                <option key={b.id} value={b.id}>{b.block_name || `Block #${b.id}`}</option>
              ))}
            </select>
          ) : form.entity_type === 'property' ? (
            <select value={form.entity_id} onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))} required>
              <option value="">Select property...</option>
              {propertyOpts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : form.entity_type === 'user' ? (
            <select value={form.entity_id} onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))} required>
              <option value="">Select user...</option>
              {userOpts.map(u => (
                <option key={u.id} value={u.id}>
                  {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.username || u.email}
                </option>
              ))}
            </select>
          ) : (
            <input type="number" placeholder={`${form.entity_type} ID`} value={form.entity_id} onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))} required />
          )}
          <input type="text" placeholder="System (grapelink, swnz, acvm...)" value={form.system_name} onChange={e => setForm(f => ({ ...f, system_name: e.target.value }))} required />
          <input type="text" placeholder="External ID" value={form.external_id} onChange={e => setForm(f => ({ ...f, external_id: e.target.value }))} required />
          <input type="text" placeholder="Label (optional)" value={form.external_label} onChange={e => setForm(f => ({ ...f, external_label: e.target.value }))} />
          <button type="submit" className="ca-btn-primary"><Plus size={14} /> Create</button>
        </form>
      )}

      {aliases.length === 0 ? (
        <p className="ca-empty">No aliases configured. Add external system IDs for blocks, assets, or properties.</p>
      ) : (
        <table className="ca-table">
          <thead>
            <tr><th>Type</th><th>ID</th><th>System</th><th>External ID</th><th>Label</th><th></th></tr>
          </thead>
          <tbody>
            {aliases.map(a => (
              <tr key={a.id}>
                <td>{a.entity_type}</td>
                <td>{a.entity_id}</td>
                <td>{a.system_name}</td>
                <td className="ca-mono">{a.external_id}</td>
                <td>{a.external_label || '-'}</td>
                <td><button className="ca-btn-icon" onClick={() => handleDelete(a.id)} title="Delete"><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


// ============================================================================
// TAB: GrapeLink
// ============================================================================
function GrapeLinkTab() {
  const [properties, setProperties] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = useCallback(() => {
    propertyService.listProperties()
      .then(data => { setProperties(Array.isArray(data) ? data : []); setEdits({}); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = (propId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [propId]: { ...prev[propId], [field]: value }
    }));
  };

  const saveProperty = async (propId) => {
    const changes = edits[propId];
    if (!changes) return;
    setSaving(propId);
    try {
      await propertyService.updateProperty(propId, changes);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const hasChanges = (propId) => {
    const e = edits[propId];
    if (!e) return false;
    const p = properties.find(x => x.id === propId);
    return Object.keys(e).some(k => e[k] !== (p[k] || ''));
  };

  if (loading) return <p className="ca-loading">Loading properties...</p>;

  return (
    <div className="ca-section">
      <h2 className="ca-section-title">GrapeLink Setup</h2>
      <p className="ca-section-desc">Set GrapeLink grower IDs and property codes for compliance exports.</p>
      <div style={{ padding: 'var(--space-md)', background: 'var(--color-info-bg, #dbeafe)', borderLeft: '3px solid var(--color-info, #2d5a87)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-base)', fontSize: 'var(--font-size-sm)' }}>
        <strong>Full integration coming.</strong> For now you can record your GrapeLink identifiers here so Auxein can match them up when the live export pipeline ships. Spray diary, harvest, and compliance push-through are on the roadmap.
      </div>
      <table className="ca-table">
        <thead>
          <tr><th>Property</th><th>Grower ID</th><th>Property Code</th><th></th></tr>
        </thead>
        <tbody>
          {properties.map(p => {
            const e = edits[p.id] || {};
            return (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td>
                  <input
                    className="ca-inline-input"
                    type="text"
                    value={e.grapelink_grower_id ?? p.grapelink_grower_id ?? ''}
                    onChange={(ev) => updateField(p.id, 'grapelink_grower_id', ev.target.value)}
                    placeholder="e.g. GRW-12345"
                  />
                </td>
                <td>
                  <input
                    className="ca-inline-input"
                    type="text"
                    value={e.grapelink_property_code ?? p.grapelink_property_code ?? ''}
                    onChange={(ev) => updateField(p.id, 'grapelink_property_code', ev.target.value)}
                    placeholder="e.g. PROP-001"
                  />
                </td>
                <td>
                  {hasChanges(p.id) && (
                    <button className="ca-btn-primary" onClick={() => saveProperty(p.id)} disabled={saving === p.id}>
                      <Save size={12} /> {saving === p.id ? '...' : 'Save'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ============================================================================
// TAB: Weather
// ============================================================================
function WeatherTab() {
  const [properties, setProperties] = useState([]);
  const [climateZones, setClimateZones] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [mapPickerProp, setMapPickerProp] = useState(null); // property to set location for

  const load = useCallback(() => {
    Promise.all([
      propertyService.listProperties().catch(() => []),
      companyAdminService.getClimateZones().catch(() => []),
    ]).then(([propData, zoneData]) => {
      setProperties(Array.isArray(propData) ? propData : []);
      const zones = zoneData?.zones || zoneData || [];
      setClimateZones(Array.isArray(zones) ? zones : []);
      setEdits({});
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = (propId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [propId]: { ...prev[propId], [field]: value }
    }));
  };

  const saveProperty = async (propId) => {
    const changes = edits[propId];
    if (!changes) return;
    setSaving(propId);
    try {
      // Convert climate_zone_id to int or null
      const payload = { ...changes };
      if ('climate_zone_id' in payload) {
        payload.climate_zone_id = payload.climate_zone_id ? parseInt(payload.climate_zone_id) : null;
      }
      if ('forecast_latitude' in payload) {
        payload.forecast_latitude = payload.forecast_latitude ? parseFloat(payload.forecast_latitude) : null;
      }
      if ('forecast_longitude' in payload) {
        payload.forecast_longitude = payload.forecast_longitude ? parseFloat(payload.forecast_longitude) : null;
      }
      await propertyService.updateProperty(propId, payload);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const hasChanges = (propId) => {
    const e = edits[propId];
    if (!e) return false;
    const p = properties.find(x => x.id === propId);
    return Object.keys(e).some(k => String(e[k] ?? '') !== String(p[k] ?? ''));
  };

  if (loading) return <p className="ca-loading">Loading properties...</p>;

  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Weather & Climate Settings</h2>
      <p className="ca-section-desc">Set the forecast point and climate zone for each property. The climate zone links to regional insights data.</p>
      <table className="ca-table">
        <thead>
          <tr><th>Property</th><th>Forecast Lat</th><th>Forecast Lng</th><th></th><th>Climate Zone</th><th></th></tr>
        </thead>
        <tbody>
          {properties.map(p => {
            const e = edits[p.id] || {};
            return (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td>
                  <input
                    className="ca-inline-input ca-inline-input--narrow"
                    type="text"
                    value={e.forecast_latitude ?? p.forecast_latitude ?? ''}
                    onChange={(ev) => updateField(p.id, 'forecast_latitude', ev.target.value)}
                    placeholder="-41.29"
                  />
                </td>
                <td>
                  <input
                    className="ca-inline-input ca-inline-input--narrow"
                    type="text"
                    value={e.forecast_longitude ?? p.forecast_longitude ?? ''}
                    onChange={(ev) => updateField(p.id, 'forecast_longitude', ev.target.value)}
                    placeholder="174.78"
                  />
                </td>
                <td>
                  <button
                    className="ca-btn-icon"
                    onClick={() => setMapPickerProp(p)}
                    title="Set location on map"
                  >
                    <MapPin size={14} />
                  </button>
                </td>
                <td>
                  <select
                    className="ca-inline-input"
                    value={e.climate_zone_id ?? p.climate_zone_id ?? ''}
                    onChange={(ev) => updateField(p.id, 'climate_zone_id', ev.target.value)}
                  >
                    <option value="">Select zone...</option>
                    {climateZones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {hasChanges(p.id) && (
                    <button className="ca-btn-primary" onClick={() => saveProperty(p.id)} disabled={saving === p.id}>
                      <Save size={12} /> {saving === p.id ? '...' : 'Save'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Map picker modal */}
      <ForecastPointPicker
        isOpen={!!mapPickerProp}
        onClose={() => setMapPickerProp(null)}
        onLocationSet={(newLat, newLng) => {
          if (mapPickerProp) {
            updateField(mapPickerProp.id, 'forecast_latitude', newLat);
            updateField(mapPickerProp.id, 'forecast_longitude', newLng);
          }
        }}
        initialLat={mapPickerProp?.forecast_latitude}
        initialLng={mapPickerProp?.forecast_longitude}
        propertyName={mapPickerProp?.name}
      />

      <h3 className="ca-section-title" style={{ marginTop: 'var(--space-lg)' }}>Harvest Stations</h3>
      <div style={{ padding: 'var(--space-base)', background: 'var(--color-surface-warm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ margin: '0 0 var(--space-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' }}>
          <strong>Already running Harvest weather stations?</strong> Auxein can integrate them so your readings flow straight into Grow alongside your forecast and regional climate data.
        </p>
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Email <a href="mailto:grow@auxein.co.nz?subject=Harvest%20station%20integration" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>grow@auxein.co.nz</a> with your station IDs or login details and we'll wire them up for you.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Calendar Sync
// ============================================================================
// Placeholder for V1 — full implementation (feed token + iCal subscription URL)
// still lives in git history; restore by reverting this block.
function CalendarSyncTab() {
  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Calendar Sync</h2>
      <div className="ca-empty" style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
        <Calendar size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>Calendar sync — coming soon</h3>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Subscribe to your Auxein calendar from Google, Apple, or Outlook. Re-enabling once the iCal feed is hardened.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Reports — full reporting dashboard absorbed from the old /reports page.
// 4 sub-tabs (Tasks, Observations, Timesheets, Assets) + date + property filters.
// CTA at the bottom opens FeedbackModal so users can request new reports.
// ============================================================================
const REPORT_TABS = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'observations', label: 'Observations' },
  { key: 'timesheets', label: 'Timesheets' },
  { key: 'assets', label: 'Assets' },
];

function ReportsTab() {
  const [reportTab, setReportTab] = useState('tasks');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    propertyService.listProperties()
      .then(data => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]));
  }, []);

  const propFilter = propertyId || undefined;

  return (
    <div className="ca-section">
      <div className="reports-page">
        <div className="reports-header">
          <h2 className="ca-section-title" style={{ margin: 0 }}>Reports</h2>
          <div className="reports-filters">
            {properties.length > 0 && (
              <label>
                Property
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="reports-date-input"
                >
                  <option value="">All Properties</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              From
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="reports-date-input"
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="reports-date-input"
              />
            </label>
          </div>
        </div>

        <div className="reports-tabs">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`reports-tab ${reportTab === tab.key ? 'active' : ''}`}
              onClick={() => setReportTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="reports-content">
          {reportTab === 'tasks' && <TaskReport startDate={startDate} endDate={endDate} propertyId={propFilter} />}
          {reportTab === 'observations' && <ObservationReport startDate={startDate} endDate={endDate} propertyId={propFilter} />}
          {reportTab === 'timesheets' && <TimesheetReport startDate={startDate} endDate={endDate} propertyId={propFilter} />}
          {reportTab === 'assets' && <AssetReport />}
        </div>

        {/* CTA — opens FeedbackModal preset to feedback category. */}
        <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-base)', background: 'var(--color-surface-warm)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>Want a report we don't have?</h3>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Tell us what you'd find useful — spray diary, yield rollups, contractor hours, anything. We're building this list now.
            </p>
          </div>
          <button className="ca-btn-primary" onClick={() => setFeedbackOpen(true)} style={{ flexShrink: 0 }}>
            <BarChart3 size={14} /> Request a report
          </button>
        </div>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}


export default CompanyAdmin;
