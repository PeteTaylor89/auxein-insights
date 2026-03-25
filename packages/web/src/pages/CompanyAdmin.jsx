// pages/CompanyAdmin.jsx — Company admin management page (Grow V1, Revision 2)
// Tabs: Users & Properties, Timesheets, Training, Aliases, GrapeLink, Weather, Calendar Sync, Reports
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { Settings, Users, UserPlus, MapPinned, Clock, GraduationCap, Link2, Grape, CloudSun, Calendar, BarChart3, Copy, RefreshCw, Plus, Trash2, Check, X, Save, MapPin } from 'lucide-react';
import { companyAdminService, propertyService, usersService, reportService } from '@vineyard/shared';
import CompanyUserManagement from '../components/admin/CompanyUserManagement';
import InvitationForm from '../components/admin/InvitationForm';
import ForecastPointPicker from '../components/ForecastPointPicker';
import './CompanyAdmin.css';

const TABS = [
  { key: 'users', label: 'Team', icon: Users },
  { key: 'invite', label: 'Invite', icon: UserPlus },
  { key: 'properties', label: 'Properties', icon: MapPinned },
  { key: 'timesheets', label: 'Timesheets', icon: Clock },
  { key: 'training', label: 'Training', icon: GraduationCap },
  { key: 'aliases', label: 'Aliases', icon: Link2 },
  { key: 'grapelink', label: 'GrapeLink', icon: Grape },
  { key: 'weather', label: 'Weather', icon: CloudSun },
  { key: 'calendar', label: 'Calendar Sync', icon: Calendar },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
];

function CompanyAdmin() {
  const { userTypeRole } = useAuth();
  const [activeTab, setActiveTab] = useState('users');

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
                onClick={() => setActiveTab(tab.key)}
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
          {activeTab === 'timesheets' && <TimesheetsTab />}
          {activeTab === 'training' && <TrainingTab />}
          {activeTab === 'aliases' && <AliasesTab />}
          {activeTab === 'grapelink' && <GrapeLinkTab />}
          {activeTab === 'weather' && <WeatherTab />}
          {activeTab === 'calendar' && <CalendarSyncTab />}
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
  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [scopes, setScopes] = useState({});
  const [climateZones, setClimateZones] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // Fetch independently so one failure doesn't block the other
      let userList = [];
      let propList = [];
      try {
        const rawUsers = await usersService.listCompanyUsers();
        userList = Array.isArray(rawUsers) ? rawUsers : [];
      } catch (err) {
        console.error('Failed to load users', err?.response?.data || err);
      }
      try {
        const rawProps = await propertyService.listProperties();
        propList = Array.isArray(rawProps) ? rawProps : [];
      } catch (err) {
        console.error('Failed to load properties', err?.response?.data || err);
      }
      // Fetch climate zones for name display
      try {
        const zoneData = await companyAdminService.getClimateZones();
        const zones = zoneData?.zones || zoneData || [];
        setClimateZones(Array.isArray(zones) ? zones : []);
      } catch { setClimateZones([]); }

      setUsers(userList);
      setProperties(propList);

      // Load scopes for each non-admin user
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
    } catch (err) {
      console.error('Failed to update scope', err);
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
      <h2 className="ca-section-title">Properties</h2>

      {properties.length === 0 ? (
        <p className="ca-empty">No properties found. Create properties from the system admin page.</p>
      ) : (
        <>
          <table className="ca-table">
            <thead>
              <tr><th>Name</th><th>Region</th><th>Area (ha)</th><th>Climate Zone</th></tr>
            </thead>
            <tbody>
              {properties.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.region || <span className="ca-muted">-</span>}</td>
                  <td>{p.total_area_ha || <span className="ca-muted">-</span>}</td>
                  <td>{zoneName(p.climate_zone_id) || <span className="ca-muted">Not set</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>

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
                              title={userScopes.includes(p.id) ? 'Remove access' : 'Grant access'}
                            >
                              {userScopes.length === 0 ? '~' : userScopes.includes(p.id) ? <Check size={14} /> : ''}
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
        <Link to="/timesheets" className="ca-link-btn">View Full Timesheets</Link>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Training
// ============================================================================
function TrainingTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    companyAdminService.getTrainingSummary()
      .then(res => setSummary(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="ca-loading">Loading training summary...</p>;
  if (!summary) return <p className="ca-empty">Could not load training data.</p>;

  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Training Overview</h2>
      <div className="ca-stats-grid">
        <div className="stat-card"><div className="stat-value">{summary.total_users}</div><div className="stat-label">Users with Training</div></div>
        <div className="stat-card"><div className="stat-value">{summary.total_completed}/{summary.total_assigned}</div><div className="stat-label">Completed</div></div>
        <div className="stat-card"><div className="stat-value">{summary.completion_rate}%</div><div className="stat-label">Completion Rate</div></div>
        <div className="stat-card"><div className="stat-value">{summary.total_overdue}</div><div className="stat-label">Overdue</div></div>
      </div>
      <div className="ca-link-row">
        <Link to="/training" className="ca-link-btn">Manage Training Modules</Link>
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

  const load = useCallback(() => {
    companyAdminService.getAliases()
      .then(res => setAliases(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
          <select value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))}>
            <option value="block">Block</option>
            <option value="property">Property</option>
            <option value="asset">Asset</option>
            <option value="user">User</option>
            <option value="station">Station</option>
          </select>
          <input type="number" placeholder="Entity ID" value={form.entity_id} onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))} required />
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
      <p className="ca-section-desc">Station management coming in a future update.</p>
    </div>
  );
}


// ============================================================================
// TAB: Calendar Sync
// ============================================================================
function CalendarSyncTab() {
  const { user } = useAuth();
  const [feedToken, setFeedToken] = useState(user?.calendar_feed_token || null);
  const [copied, setCopied] = useState(false);

  const baseUrl = window.location.origin.replace(/:\d+$/, ':8000'); // API origin
  const feedUrl = feedToken ? `${baseUrl}/api/v1/company-admin/calendar/feed/${feedToken}.ics` : null;

  const generate = async () => {
    try {
      const res = await companyAdminService.generateFeedToken();
      setFeedToken(res.data.feed_token);
    } catch (err) {
      console.error('Failed to generate feed token', err);
    }
  };

  const copyUrl = () => {
    if (feedUrl) {
      navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Calendar Subscription</h2>
      <p className="ca-section-desc">
        Subscribe to your Auxein calendar from Google Calendar, Apple Calendar, or Outlook.
        Your feed shows tasks assigned to you (or your full team if you're an admin/manager).
      </p>

      {feedUrl ? (
        <div className="ca-feed-url-box">
          <code className="ca-feed-url">{feedUrl}</code>
          <button className="ca-btn-icon" onClick={copyUrl} title="Copy URL">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button className="ca-btn-icon" onClick={generate} title="Regenerate URL">
            <RefreshCw size={16} />
          </button>
        </div>
      ) : (
        <button className="ca-btn-primary" onClick={generate}>
          <Calendar size={14} /> Generate Calendar URL
        </button>
      )}

      <div className="ca-instructions">
        <h3>How to subscribe:</h3>
        <ul>
          <li><strong>Google Calendar:</strong> Settings → Add calendar → From URL → paste the URL above</li>
          <li><strong>Apple Calendar:</strong> File → New Calendar Subscription → paste the URL</li>
          <li><strong>Outlook:</strong> Add calendar → Subscribe from web → paste the URL</li>
        </ul>
      </div>
    </div>
  );
}


// ============================================================================
// TAB: Reports (quick stats)
// ============================================================================
function ReportsTab() {
  const [taskSummary, setTaskSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportService.getTaskSummary()
      .then(res => setTaskSummary(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="ca-loading">Loading report summary...</p>;

  return (
    <div className="ca-section">
      <h2 className="ca-section-title">Quick Stats</h2>
      {taskSummary ? (
        <div className="ca-stats-grid">
          <div className="stat-card"><div className="stat-value">{taskSummary.total}</div><div className="stat-label">Total Tasks</div></div>
          <div className="stat-card"><div className="stat-value">{taskSummary.completion_rate?.toFixed(0) || 0}%</div><div className="stat-label">Completion Rate</div></div>
          <div className="stat-card"><div className="stat-value">{taskSummary.total_hours?.toFixed(1) || 0}</div><div className="stat-label">Total Hours</div></div>
          <div className="stat-card"><div className="stat-value">{taskSummary.overdue_count || 0}</div><div className="stat-label">Overdue</div></div>
        </div>
      ) : (
        <p className="ca-empty">No task data available.</p>
      )}
      <div className="ca-link-row">
        <Link to="/reports" className="ca-link-btn">View Full Reports</Link>
      </div>
    </div>
  );
}


export default CompanyAdmin;
