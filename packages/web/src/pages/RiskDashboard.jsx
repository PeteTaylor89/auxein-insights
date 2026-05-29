import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { riskManagementService, usersService, adminService, api } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import './RiskManagement.css';

function RiskDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [risks, setRisks] = useState([]);
  const [actions, setActions] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [overdueItems, setOverdueItems] = useState(null);
  const [error, setError] = useState(null);
  const [userLookup, setUserLookup] = useState({});
  const [activeTab, setActiveTab] = useState('risks');
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState(null);

  const [riskFilters, setRiskFilters] = useState({ risk_type: '', risk_level: '', status: 'active' });
  const [actionFilters, setActionFilters] = useState({ status: '', overdue_only: false, assigned_to_me: false });
  const [incidentFilters, setIncidentFilters] = useState({ severity: '', status: '', notifiable_only: false, incident_type: '' });

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await adminService.getCompanyUsers(user.company_id, { limit: 200 });
        let usersArray = [];
        if (Array.isArray(usersData)) usersArray = usersData;
        else if (usersData?.data && Array.isArray(usersData.data)) usersArray = usersData.data;
        else if (usersData?.users && Array.isArray(usersData.users)) usersArray = usersData.users;
        const activeUsers = usersArray.filter(u => u.is_active && !u.is_suspended);
        const map = {};
        activeUsers.forEach(u => {
          const fullName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username || u.email || `User ${u.id}`;
          map[u.id] = fullName;
          map[u.id.toString()] = fullName;
        });
        setUserLookup(map);
      } catch (e) { console.warn('Failed to load users for assigned_to display', e); }
    };
    if (user?.company_id) loadUsers();
  }, [user?.company_id]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true); setError(null);
        try { await riskManagementService.getUserPermissions(); } catch (e) { console.warn('Permissions check failed:', e); }
        try {
          const dashboard = await riskManagementService.getDashboard();
          setDashboardData(dashboard);
        } catch (e) {
          console.warn('Dashboard fetch failed:', e);
          setDashboardData({ risks: { open_risks: 0, high_critical_risks: 0 }, actions: { total_actions: 0, overdue_actions: 0 }, incidents: { total_open_incidents: 0, notifiable_open_incidents: 0, serious_incidents_30d: 0 } });
        }
        try {
          const overdue = await riskManagementService.getOverdueItems();
          setOverdueItems(overdue);
        } catch (e) {
          console.warn('Overdue items fetch failed:', e);
          setOverdueItems({ overdue_reviews: [], overdue_actions: [], unnotified_incidents: [] });
        }
        await Promise.all([fetchRisks(), fetchActions(), fetchIncidents()]);
      } catch (error) { console.error('Error fetching dashboard data:', error); setError(error.message); }
      finally { setLoading(false); }
    };
    if (user) fetchData();
  }, [user]);

  const fetchRisks = async () => {
    try {
      const data = await riskManagementService.getRisksWithFilters({ ...riskFilters, limit: 20 });
      setRisks(Array.isArray(data) ? data : data?.data || data?.risks || []);
    } catch (e) { console.error('Error fetching risks:', e); setRisks([]); }
  };

  const fetchActions = async () => {
    try {
      const data = await riskManagementService.getActionsWithFilters({ ...actionFilters, limit: 20 });
      setActions(Array.isArray(data) ? data : data?.data || data?.actions || []);
    } catch (e) { console.error('Error fetching actions:', e); setActions([]); }
  };

  const fetchIncidents = async () => {
    try {
      const data = await riskManagementService.getIncidentsWithFilters({ ...incidentFilters, limit: 20 });
      setIncidents(Array.isArray(data) ? data : data?.data || data?.incidents || []);
    } catch (e) { console.error('Error fetching incidents:', e); setIncidents([]); }
  };

  useEffect(() => { if (!loading) fetchRisks(); }, [riskFilters]);
  useEffect(() => { if (!loading) fetchActions(); }, [actionFilters]);
  useEffect(() => { if (!loading) fetchIncidents(); }, [incidentFilters]);

  // Deep-link from the calendar — ?action=N or ?risk=N opens the matching
  // edit page. Strip the param after firing so the back button + refresh
  // don't re-trigger.
  useEffect(() => {
    if (loading) return;
    const actionId = searchParams.get('action');
    const riskId = searchParams.get('risk');
    if (actionId) {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
      handleEditAction(Number(actionId));
    } else if (riskId) {
      const next = new URLSearchParams(searchParams);
      next.delete('risk');
      setSearchParams(next, { replace: true });
      handleEditRisk(Number(riskId));
    }
  }, [loading, searchParams]);

  const handleEditRisk = async (riskId) => {
    try { const d = await riskManagementService.getRiskById(riskId); navigate('/risks/create', { state: { editMode: true, riskData: d } }); }
    catch (e) { console.error('Error fetching risk details:', e); alert('Failed to load risk details for editing'); }
  };

  const handleEditAction = async (actionId) => {
    try { const d = await riskManagementService.getActionById(actionId); navigate('/actions/create', { state: { editMode: true, actionData: d } }); }
    catch (e) { console.error('Error fetching action details:', e); alert('Failed to load action details for editing'); }
  };

  const handleEditIncident = async (incidentId) => {
    try { const d = await riskManagementService.getIncidentById(incidentId); navigate(`/incidents/${incidentId}/edit`, { state: { editMode: true, incidentData: d } }); }
    catch (e) { console.error('Error fetching incident details:', e); alert('Failed to load incident details for editing'); }
  };

  useEffect(() => { document.body.classList.add("primary-bg"); return () => document.body.classList.remove("primary-bg"); }, []);

  const RiskLevelBadge = ({ level }) => <span className={`rm-badge rm-badge--${level || 'medium'}`}>{level?.charAt(0).toUpperCase() + level?.slice(1)}</span>;
  const StatusBadge = ({ status }) => <span className={`rm-badge rm-badge--${status || 'active'}`}>{status?.replace('_', ' ')}</span>;
  const SeverityBadge = ({ severity }) => <span className={`rm-badge rm-badge--${severity || 'moderate'}`}>{severity?.charAt(0).toUpperCase() + severity?.slice(1)}</span>;

  if (loading) {
    return <div className="page-container"><div className="rm-loading"><h2>Loading Risk Dashboard...</h2><p>Fetching risk management data...</p></div></div>;
  }

  if (error && !dashboardData) {
    return (
      <div className="page-container">
        <div className="rm-loading">
          <h2 style={{ color: 'var(--color-danger)' }}>Error Loading Dashboard</h2>
          <p>{error}</p>
          <button className="rm-btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const totalOverdueItems = overdueItems ? (overdueItems.overdue_reviews?.length || 0) + (overdueItems.overdue_actions?.length || 0) + (overdueItems.unnotified_incidents?.length || 0) : 0;

  const resolveAssignedName = (action) => {
    if (!action.assigned_to) return 'Unassigned';
    if (typeof action.assigned_to === 'object' && action.assigned_to.id) {
      const fn = action.assigned_to.first_name || '';
      const ln = action.assigned_to.last_name || '';
      return fn || ln ? `${fn} ${ln}`.trim() : action.assigned_to.username || action.assigned_to.email || `User ${action.assigned_to.id}`;
    }
    if (typeof action.assigned_to === 'number' || typeof action.assigned_to === 'string') {
      return userLookup[parseInt(action.assigned_to)] || `User ${action.assigned_to}`;
    }
    return String(action.assigned_to);
  };

  return (
    <div className="page-container">
      {/* Dashboard Stats */}
      <div className="rm-form-section">
        <div className="rm-section-header">
          <h2>Risk Management Dashboard</h2>
          <div className="rm-actions-cell">
            <button className="rm-btn-primary" onClick={() => navigate('/risks/create')}>Create Risk</button>
            <button className="rm-btn-primary" onClick={() => navigate('/actions/create')}>Create Action</button>
            <button className="rm-btn-danger" onClick={() => navigate('/incidents/create')}>Report Incident</button>
          </div>
        </div>
        <div className="rm-stats-grid">
          <div className="rm-stat"><div className="rm-stat-value">{dashboardData?.risks?.total_risks || '0'}</div><div className="rm-stat-label">Total Open Risks</div></div>
          <div className="rm-stat"><div className="rm-stat-value rm-stat-value--danger">{dashboardData?.risks?.high_critical_risks || '0'}</div><div className="rm-stat-label">High/Critical Open Risks</div></div>
          <div className="rm-stat"><div className="rm-stat-value">{dashboardData?.actions?.total_actions || '0'}</div><div className="rm-stat-label">Recorded Actions</div></div>
          <div className="rm-stat"><div className="rm-stat-value rm-stat-value--warning">{dashboardData?.incidents?.total_open_incidents || '0'}</div><div className="rm-stat-label">Total Open Incidents</div></div>
          <div className="rm-stat"><div className="rm-stat-value rm-stat-value--danger">{dashboardData?.incidents?.notifiable_open_incidents || '0'}</div><div className="rm-stat-label">Open Notifiable Incidents</div></div>
          <div className="rm-stat"><div className="rm-stat-value rm-stat-value--warning">{totalOverdueItems}</div><div className="rm-stat-label">Overdue Tasks</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rm-tab-card">
        <div className="rm-tab-bar">
          {[{ id: 'risks', label: 'Risks', count: risks.length }, { id: 'actions', label: 'Actions', count: actions.length }, { id: 'incidents', label: 'Incidents', count: incidents.length }].map(tab => (
            <button key={tab.id} className={`rm-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="rm-tab-content">
          {/* Risks Tab */}
          {activeTab === 'risks' && (
            <div>
              <div className="rm-section-header">
                <h2>Risks ({risks.length})</h2>
                <div className="rm-filters">
                  <select className="rm-filter-select" value={riskFilters.risk_level} onChange={(e) => setRiskFilters(prev => ({ ...prev, risk_level: e.target.value }))}>
                    <option value="">All Risks</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                  </select>
                  <select className="rm-filter-select" value={riskFilters.risk_type} onChange={(e) => setRiskFilters(prev => ({ ...prev, risk_type: e.target.value }))}>
                    <option value="">All Types</option><option value="health_safety">Health & Safety</option><option value="environmental">Environmental</option><option value="production">Production</option><option value="operational">Operational</option><option value="financial">Financial</option><option value="reputational">Reputational</option><option value="regulatory">Regulatory</option>
                  </select>
                </div>
              </div>
              {risks.length > 0 ? (
                <div className="rm-table-wrap">
                  <table className="rm-table">
                    <thead><tr><th>Risk</th><th>Category</th><th>Type</th><th className="center">Inherent Risk</th><th className="center">Residual Risk</th><th className="center">Status</th><th className="center">Edit</th></tr></thead>
                    <tbody>
                      {risks.slice(0, 10).map((risk, i) => (
                        <tr key={risk.id || i}>
                          <td><div className="rm-cell-content"><div className="rm-cell-title">{risk.risk_title || 'Untitled Risk'}</div><div className="rm-cell-subtitle">{risk.risk_description ? (risk.risk_description.length > 80 ? `${risk.risk_description.substring(0, 80)}...` : risk.risk_description) : 'No description'}</div></div></td>
                          <td><span className="rm-badge rm-badge--category">{risk.risk_category?.replace('_', ' ') || 'Other'}</span></td>
                          <td><span className="rm-badge rm-badge--type">{risk.risk_type?.replace('_', ' ') || 'Unknown'}</span></td>
                          <td className="center"><RiskLevelBadge level={risk.inherent_risk_level} /></td>
                          <td className="center"><RiskLevelBadge level={risk.residual_risk_level || risk.inherent_risk_level} /></td>
                          <td className="center"><StatusBadge status={risk.status || 'active'} /></td>
                          <td className="center"><button className="rm-btn-primary rm-btn-sm" onClick={() => handleEditRisk(risk.id)}>Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rm-empty"><div className="rm-empty-icon">🛡️</div><div>No risks found</div><div style={{ marginTop: 'var(--space-sm)' }}><button className="rm-btn-primary" onClick={() => navigate('/risks/create')}>Create Your First Risk</button></div></div>
              )}
            </div>
          )}

          {/* Actions Tab */}
          {activeTab === 'actions' && (
            <div>
              <div className="rm-section-header">
                <h2>Risk Actions / Controls ({actions.length})</h2>
                <div className="rm-filters">
                  <select className="rm-filter-select" value={actionFilters.status} onChange={(e) => setActionFilters(prev => ({ ...prev, status: e.target.value }))}>
                    <option value="">All Status</option><option value="planned">In Progress</option><option value="completed">Completed</option><option value="overdue">Overdue</option>
                  </select>
                  <label className="rm-filter-checkbox">
                    <input type="checkbox" checked={actionFilters.assigned_to_me} onChange={(e) => setActionFilters(prev => ({ ...prev, assigned_to_me: e.target.checked }))} /> My Actions
                  </label>
                </div>
              </div>
              {actions.length > 0 ? (
                <div className="rm-table-wrap">
                  <table className="rm-table">
                    <thead><tr><th>Action</th><th className="center">Assigned to</th><th className="center">Priority</th><th className="center">Status</th><th className="center">Progress</th><th className="center">Due Date</th><th className="center">Edit</th></tr></thead>
                    <tbody>
                      {actions.slice(0, 10).map((action, i) => {
                        const isOverdue = action.target_completion_date && new Date(action.target_completion_date) < new Date() && !['completed', 'cancelled'].includes(action.status);
                        const progress = action.progress_percentage || 0;
                        return (
                          <tr key={action.id || i}>
                            <td><div className="rm-cell-content"><div className="rm-cell-title">{action.action_title || 'Untitled Action'}</div><div className="rm-cell-subtitle">{action.action_description ? (action.action_description.length > 60 ? `${action.action_description.substring(0, 60)}...` : action.action_description) : 'No description'}</div></div></td>
                            <td className="center">{resolveAssignedName(action)}</td>
                            <td className="center"><span className={`rm-badge rm-badge--priority-${action.priority || 'medium'}`}>{action.priority || 'Medium'}</span></td>
                            <td className="center"><StatusBadge status={isOverdue ? 'overdue' : (action.status || 'open')} /></td>
                            <td className="center">
                              <div className="rm-progress">
                                <div className="rm-progress-bar"><div className="rm-progress-fill" style={{ width: `${Math.min(progress, 100)}%`, background: progress === 100 ? '#22c55e' : progress >= 75 ? 'var(--color-primary)' : progress >= 50 ? 'var(--color-warning)' : 'var(--color-danger)' }} /></div>
                                <span className="rm-progress-text">{progress}%</span>
                              </div>
                            </td>
                            <td className="center">
                              {action.target_completion_date ? (
                                <div className={`rm-date ${isOverdue ? 'rm-date--overdue' : ''}`}>{isOverdue && '⚠️ '}{new Date(action.target_completion_date).toLocaleDateString()}</div>
                              ) : <span className="muted">-</span>}
                            </td>
                            <td className="center"><button className="rm-btn-primary rm-btn-sm" onClick={() => handleEditAction(action.id)}>Edit</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rm-empty"><div className="rm-empty-icon">⚡</div><div>No actions found</div><div style={{ marginTop: 'var(--space-sm)' }}><button className="rm-btn-primary" onClick={() => navigate('/actions/create')}>Create Your First Action</button></div></div>
              )}
            </div>
          )}

          {/* Incidents Tab */}
          {activeTab === 'incidents' && (
            <div>
              <div className="rm-section-header">
                <h2>Incident Register ({incidents.length})</h2>
                <div className="rm-filters">
                  <select className="rm-filter-select" value={incidentFilters.status} onChange={(e) => setIncidentFilters(prev => ({ ...prev, status: e.target.value }))}>
                    <option value="">All Status</option><option value="open">Open</option><option value="closed">Closed</option><option value="investigating">Investigating</option>
                  </select>
                  <select className="rm-filter-select" value={incidentFilters.incident_type} onChange={(e) => setIncidentFilters(prev => ({ ...prev, incident_type: e.target.value }))}>
                    <option value="">All Types</option><option value="injury">Injury</option><option value="near_miss">Near Miss</option><option value="property_damage">Property Damage</option><option value="environmental">Environmental</option><option value="security">Security</option>
                  </select>
                  <select className="rm-filter-select" value={incidentFilters.severity} onChange={(e) => setIncidentFilters(prev => ({ ...prev, severity: e.target.value }))}>
                    <option value="">All Severities</option><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="serious">Serious</option><option value="critical">Critical</option><option value="fatal">Fatal</option>
                  </select>
                  <label className="rm-filter-checkbox">
                    <input type="checkbox" checked={incidentFilters.notifiable_only} onChange={(e) => setIncidentFilters(prev => ({ ...prev, notifiable_only: e.target.checked }))} /> Notifiable Only
                  </label>
                </div>
              </div>
              {incidents.length > 0 ? (
                <div className="rm-table-wrap">
                  <table className="rm-table">
                    <thead><tr><th>Incident</th><th>Number</th><th className="center">Type</th><th className="center">Severity</th><th className="center">Date</th><th className="center">Status</th><th className="center">Notifiable</th><th className="center">Edit</th></tr></thead>
                    <tbody>
                      {incidents.slice(0, 10).map((inc, i) => {
                        const isOverdueInv = inc.investigation_due_date && new Date(inc.investigation_due_date) < new Date() && inc.investigation_status !== 'completed';
                        const reqNotify = inc.is_notifiable && !inc.worksafe_notified;
                        return (
                          <tr key={inc.id || i} style={(isOverdueInv || reqNotify) ? { backgroundColor: 'var(--color-warning-bg)' } : undefined}>
                            <td>
                              <div className="rm-cell-content">
                                <div className="rm-cell-title">{inc.incident_title || 'Untitled Incident'} {(isOverdueInv || reqNotify) && <span style={{ color: 'var(--color-warning)' }}>⚠️</span>}</div>
                                <div className="rm-cell-subtitle">{inc.incident_description ? (inc.incident_description.length > 60 ? `${inc.incident_description.substring(0, 60)}...` : inc.incident_description) : 'No description'}</div>
                                {inc.location_description && <div className="rm-cell-subtitle" style={{ color: 'var(--color-success)' }}>📍 {inc.location_description}</div>}
                              </div>
                            </td>
                            <td><span className="rm-badge rm-badge--category">{inc.incident_number || '-'}</span></td>
                            <td className="center"><span className={`rm-badge rm-badge--${inc.incident_type || 'security'}`}>{inc.incident_type?.replace('_', ' ') || 'Unknown'}</span></td>
                            <td className="center"><SeverityBadge severity={inc.severity} /></td>
                            <td className="center">
                              <div className="rm-date">{inc.incident_date ? new Date(inc.incident_date).toLocaleDateString() : '-'}</div>
                              {inc.days_since_incident !== undefined && <div className="rm-date-sub">{inc.days_since_incident} days ago</div>}
                            </td>
                            <td className="center">
                              <StatusBadge status={inc.status || 'open'} />
                              {isOverdueInv && <div className="rm-date-sub" style={{ color: 'var(--color-danger)' }}>Investigation Overdue</div>}
                            </td>
                            <td className="center">
                              {inc.is_notifiable ? (
                                <div>
                                  <span className={`rm-badge ${inc.worksafe_notified ? 'rm-badge--completed' : 'rm-badge--critical'}`} style={{ fontSize: '0.625rem' }}>
                                    {inc.worksafe_notified ? 'Notified' : 'Required'}
                                  </span>
                                  {inc.notifiable_type && <div className="rm-date-sub" style={{ textTransform: 'capitalize' }}>{inc.notifiable_type.replace('_', ' ')}</div>}
                                </div>
                              ) : <span className="rm-date muted">No</span>}
                            </td>
                            <td className="center"><button className="rm-btn-danger rm-btn-sm" onClick={() => handleEditIncident(inc.id)}>Edit</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rm-empty"><div className="rm-empty-icon">📋</div><div>No incidents found</div><div style={{ marginTop: 'var(--space-sm)' }}><button className="rm-btn-danger" onClick={() => navigate('/incidents/create')}>Report Your First Incident</button></div></div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Critical Alerts */}
      {overdueItems && (totalOverdueItems > 0 || (overdueItems.unnotified_incidents?.length > 0)) && (
        <div className="rm-alerts">
          <h3>⚠️ Items Requiring Immediate Attention</h3>
          <div className="rm-alerts-grid">
            {overdueItems.unnotified_incidents?.length > 0 && (
              <div className="rm-alert-card rm-alert-card--danger">
                <h4 style={{ color: '#991b1b' }}>🚨 WorkSafe Notifications Required ({overdueItems.unnotified_incidents.length})</h4>
                {overdueItems.unnotified_incidents.slice(0, 3).map(inc => (
                  <div key={inc.id} className="rm-alert-item" style={{ color: '#991b1b' }}>
                    • {inc.incident_number}: {inc.title} ({inc.notifiable_type})
                  </div>
                ))}
                {overdueItems.unnotified_incidents.length > 3 && <div className="rm-alert-more" style={{ color: '#991b1b' }}>...and {overdueItems.unnotified_incidents.length - 3} more</div>}
              </div>
            )}
            {overdueItems.overdue_investigations?.length > 0 && (
              <div className="rm-alert-card rm-alert-card--warning">
                <h4 style={{ color: '#92400e' }}>🔍 Overdue Investigations ({overdueItems.overdue_investigations.length})</h4>
                {overdueItems.overdue_investigations.slice(0, 3).map(inc => (
                  <div key={inc.id} className="rm-alert-item" style={{ color: '#92400e' }}>
                    • {inc.incident_number}: {inc.title} ({inc.days_overdue} days overdue)
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <MobileNavigation />
    </div>
  );
}

export default RiskDashboard;
