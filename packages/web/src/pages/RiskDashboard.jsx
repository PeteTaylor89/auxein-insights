import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import {riskManagementService, usersService, adminService, api} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

function RiskDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [risks, setRisks] = useState([]);
  const [actions, setActions] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [overdueItems, setOverdueItems] = useState(null);
  const [error, setError] = useState(null);
  const [userLookup, setUserLookup] = useState({});
  // Active tab state
  const [activeTab, setActiveTab] = useState('risks');
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState(null);
  
  // Filter states
  const [riskFilters, setRiskFilters] = useState({
    risk_type: '',
    risk_level: '',
    status: 'active'
  });
  const [actionFilters, setActionFilters] = useState({
    status: '',
    overdue_only: false,
    assigned_to_me: false
  });
  const [incidentFilters, setIncidentFilters] = useState({
    severity: '',
    status: '',
    notifiable_only: false,
    incident_type: ''
  });

  useEffect(() => {
    const loadUsers = async () => {
      try {
        // Use adminService instead of usersService to match your working code
        const usersData = await adminService.getCompanyUsers(user.company_id, { limit: 200 }); 
        
        // Handle different response formats (same as your working code)
        let usersArray = [];
        if (Array.isArray(usersData)) {
          usersArray = usersData;
        } else if (usersData && Array.isArray(usersData.data)) {
          usersArray = usersData.data;
        } else if (usersData && Array.isArray(usersData.users)) {
          usersArray = usersData.users;
        }
        
        // Filter to only active, non-suspended users
        const activeUsers = usersArray.filter(u => 
          u.is_active && !u.is_suspended
        );
        
        const map = {};
        activeUsers.forEach(u => {
          const fullName = u.first_name && u.last_name 
            ? `${u.first_name} ${u.last_name}` 
            : u.username || u.email || `User ${u.id}`;
          
          map[u.id] = fullName;
          map[u.id.toString()] = fullName; // Handle string IDs too
        });
        
        setUserLookup(map);
        console.log('User lookup map:', map);
      } catch (e) {
        console.warn('Failed to load users for assigned_to display', e);
      }
    };
    
    if (user?.company_id) {
      loadUsers();
    }
  }, [user?.company_id]);

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔄 Starting to fetch risk management data...');
        
        // Test basic connectivity first
        try {
          const permissions = await riskManagementService.getUserPermissions();
          console.log('✅ User permissions:', permissions);
        } catch (permError) {
          console.warn('⚠️ Permissions check failed:', permError);
        }
        
        // Fetch dashboard overview with error handling
        try {
          const dashboard = await riskManagementService.getDashboard();
          console.log('✅ Dashboard data:', dashboard);
          setDashboardData(dashboard);
        } catch (dashError) {
          console.warn('⚠️ Dashboard fetch failed:', dashError);
          setDashboardData({
            risks: { open_risks: 0, high_critical_risks: 0 },
            actions: { total_actions: 0, overdue_actions: 0 },
            incidents: { total_open_incidents: 0, notifiable_open_incidents: 0, serious_incidents_30d: 0 }
          });
        }
        
        // Fetch overdue items with error handling
        try {
          const overdue = await riskManagementService.getOverdueItems();
          console.log('✅ Overdue items:', overdue);
          setOverdueItems(overdue);
        } catch (overdueError) {
          console.warn('⚠️ Overdue items fetch failed:', overdueError);
          setOverdueItems({
            overdue_reviews: [],
            overdue_actions: [],
            unnotified_incidents: []
          });
        }
        
        // Fetch initial data with filters
        await Promise.all([
          fetchRisks(),
          fetchActions(),
          fetchIncidents()
        ]);
        
      } catch (error) {
        console.error('❌ Error fetching dashboard data:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  // Fetch risks with filters and error handling
  const fetchRisks = async () => {
    try {
      console.log('🔄 Fetching risks with filters:', riskFilters);
      const risksData = await riskManagementService.getRisksWithFilters({
        ...riskFilters,
        limit: 20
      });
      
      console.log('📊 Raw risks data:', risksData);
      
      // Handle different possible response formats
      let risksArray = [];
      if (Array.isArray(risksData)) {
        risksArray = risksData;
      } else if (risksData && Array.isArray(risksData.data)) {
        risksArray = risksData.data;
      } else if (risksData && Array.isArray(risksData.risks)) {
        risksArray = risksData.risks;
      } else {
        console.warn('⚠️ Unexpected risks data format:', risksData);
        risksArray = [];
      }
      
      console.log('✅ Processed risks array:', risksArray);
      setRisks(risksArray);
    } catch (error) {
      console.error('❌ Error fetching risks:', error);
      setRisks([]); // Set empty array on error
    }
  };

  // Fetch actions with filters and error handling
  const fetchActions = async () => {
    try {
      console.log('🔄 Fetching actions with filters:', actionFilters);
      const actionsData = await riskManagementService.getActionsWithFilters({
        ...actionFilters,
        limit: 20
      });
      
      console.log('📊 Raw actions data:', actionsData);
      
      // Handle different possible response formats
      let actionsArray = [];
      if (Array.isArray(actionsData)) {
        actionsArray = actionsData;
      } else if (actionsData && Array.isArray(actionsData.data)) {
        actionsArray = actionsData.data;
      } else if (actionsData && Array.isArray(actionsData.actions)) {
        actionsArray = actionsData.actions;
      } else {
        console.warn('⚠️ Unexpected actions data format:', actionsData);
        actionsArray = [];
      }
      
      console.log('✅ Processed actions array:', actionsArray);
      setActions(actionsArray);
    } catch (error) {
      console.error('❌ Error fetching actions:', error);
      setActions([]); // Set empty array on error
    }
  };

  // Fetch incidents with filters and error handling
  const fetchIncidents = async () => {
    try {
      console.log('🔄 Fetching incidents with filters:', incidentFilters);
      const incidentsData = await riskManagementService.getIncidentsWithFilters({
        ...incidentFilters,
        limit: 20
      });
      
      console.log('📊 Raw incidents data:', incidentsData);
      
      // Handle different possible response formats
      let incidentsArray = [];
      if (Array.isArray(incidentsData)) {
        incidentsArray = incidentsData;
      } else if (incidentsData && Array.isArray(incidentsData.data)) {
        incidentsArray = incidentsData.data;
      } else if (incidentsData && Array.isArray(incidentsData.incidents)) {
        incidentsArray = incidentsData.incidents;
      } else {
        console.warn('⚠️ Unexpected incidents data format:', incidentsData);
        incidentsArray = [];
      }
      
      console.log('✅ Processed incidents array:', incidentsArray);
      setIncidents(incidentsArray);
    } catch (error) {
      console.error('❌ Error fetching incidents:', error);
      setIncidents([]); // Set empty array on error
    }
  };

  // Filter change handlers
  const handleRiskFilterChange = (key, value) => {
    const newFilters = { ...riskFilters, [key]: value };
    setRiskFilters(newFilters);
  };

  const handleActionFilterChange = (key, value) => {
    const newFilters = { ...actionFilters, [key]: value };
    setActionFilters(newFilters);
  };

  const handleIncidentFilterChange = (key, value) => {
    const newFilters = { ...incidentFilters, [key]: value };
    setIncidentFilters(newFilters);
  };

  // Apply filters when they change
  useEffect(() => {
    if (!loading) fetchRisks();
  }, [riskFilters]);

  useEffect(() => {
    if (!loading) fetchActions();
  }, [actionFilters]);

  useEffect(() => {
    if (!loading) fetchIncidents();
  }, [incidentFilters]);

  // Navigation handlers
  const handleViewRisksOnMap = () => {
    navigate('/maps?layer=risks');
  };

  // Handle edit risk navigation
  const handleEditRisk = async (riskId) => {
    try {
      console.log('🔄 Fetching risk details for edit:', riskId);
      
      // Fetch the full risk details
      const riskDetails = await riskManagementService.getRiskById(riskId);
      
      console.log('Risk details fetched:', riskDetails);
      
      // Navigate to create risk page with the risk data as state
      navigate('/risks/create', { 
        state: { 
          editMode: true,
          riskData: riskDetails
        } 
      });
    } catch (error) {
      console.error('Error fetching risk details for edit:', error);
      alert('Failed to load risk details for editing');
    }
  };

  const handleEditAction = async (actionId) => {
    try {
      console.log('🔄 Fetching action details for edit:', actionId);
      
      // Fetch the full action details
      const actionDetails = await riskManagementService.getActionById(actionId);
      
      console.log('✅ Action details fetched:', actionDetails);
      
      // Navigate to create action page with the action data as state
      navigate('/actions/create', { 
        state: { 
          editMode: true,
          actionData: actionDetails
        } 
      });
    } catch (error) {
      console.error('❌ Error fetching action details for edit:', error);
      alert('Failed to load action details for editing');
    }
  };

  const handleEditIncident = async (incidentId) => {
    try {
      console.log('🔄 Fetching incident details for edit:', incidentId);
      
      // Fetch the full incident details
      const incidentDetails = await riskManagementService.getIncidentById(incidentId);
      
      console.log('✅ Incident details fetched:', incidentDetails);
      
      // Navigate to create incident page with the incident data as state
      navigate(`/incidents/${incidentId}/edit`, { 
        state: { 
          editMode: true,
          incidentData: incidentDetails
        } 
      });
    } catch (error) {
      console.error('❌ Error fetching incident details for edit:', error);
      alert('Failed to load incident details for editing');
    }
  };

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  // Badge components
  const RiskLevelBadge = ({ level }) => {
    const colors = {
      low: { bg: '#dcfce7', color: '#166534' },
      medium: { bg: '#fef3c7', color: '#92400e' },
      high: { bg: '#fed7aa', color: '#c2410c' },
      critical: { bg: '#fecaca', color: '#dc2626' }
    };
    const style = colors[level] || colors.medium;
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500'
      }}>
        {level?.charAt(0).toUpperCase() + level?.slice(1)}
      </span>
    );
  };

  const StatusBadge = ({ status, type = 'default' }) => {
    const colors = {
      active: { bg: '#dbeafe', color: '#1d4ed8' },
      completed: { bg: '#dcfce7', color: '#166534' },
      overdue: { bg: '#fecaca', color: '#dc2626' },
      open: { bg: '#fef3c7', color: '#92400e' },
      investigating: { bg: '#e0f2fe', color: '#0369a1' },
      closed: { bg: '#f3f4f6', color: '#374151' }
    };
    const style = colors[status] || colors.active;
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500'
      }}>
        {status?.replace('_', ' ')}
      </span>
    );
  };

  const SeverityBadge = ({ severity }) => {
    const colors = {
      minor: { bg: '#dcfce7', color: '#166534' },
      moderate: { bg: '#fef3c7', color: '#92400e' },
      serious: { bg: '#fed7aa', color: '#c2410c' },
      critical: { bg: '#fecaca', color: '#dc2626' },
      fatal: { bg: '#991b1b', color: '#ffffff' }
    };
    const style = colors[severity] || colors.moderate;
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500'
      }}>
        {severity?.charAt(0).toUpperCase() + severity?.slice(1)}
      </span>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading Risk Dashboard...</h2>
          <p>Fetching risk management data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !dashboardData) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
          <h2 style={{ color: '#dc2626' }}>❌ Error Loading Dashboard</h2>
          <p style={{ marginBottom: '1rem' }}>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Calculate total overdue items safely
  const totalOverdueItems = overdueItems ? 
    (overdueItems.overdue_reviews?.length || 0) + 
    (overdueItems.overdue_actions?.length || 0) + 
    (overdueItems.unnotified_incidents?.length || 0) : 0;

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '1rem' 
      }}>
        
        {/* Dashboard Overview Stats */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid #f3f4f6'
          }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
              Risk Management Dashboard
            </h1>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => navigate('/risks/create')}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Create Risk
              </button>
              <button 
                onClick={() => navigate('/actions/create')}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Create Action
              </button>
              <button 
                onClick={() => navigate('/incidents/create')}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Report Incident
              </button>
            </div>
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#3b82f6' }}>
                {dashboardData?.risks?.total_risks || '0'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total Open Risks</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#dc2626' }}>
                {dashboardData?.risks?.high_critical_risks || '0'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>High/Critical Open Risks</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#3b82f6' }}>
                {dashboardData?.actions?.total_actions || '0'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Recorded Actions</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f59e0b' }}>
                {dashboardData?.incidents?.total_open_incidents || '0'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total Open Incidents</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#dc2626' }}>
                {dashboardData?.incidents?.notifiable_open_incidents || '0'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Open Notifiable Incidents</div>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f59e0b' }}>
                {totalOverdueItems}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Overdue Tasks</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '0',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #f3f4f6'
          }}>
            {[
              { id: 'risks', label: 'Risks', count: risks.length },
              { id: 'actions', label: 'Actions', count: actions.length },
              { id: 'incidents', label: 'Incidents', count: incidents.length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '1rem',
                  border: 'none',
                  background: activeTab === tab.id ? '#f8fafc' : 'white',
                  borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ padding: '1.25rem' }}>
            
            {/* Risks Tab */}
            {activeTab === 'risks' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #f3f4f6'
                }}>
                  <h2 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    margin: 0
                  }}>
                    Risks ({risks.length})
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      value={riskFilters.risk_level}
                      onChange={(e) => setRiskFilters(prev => ({ ...prev, risk_level: e.target.value }))}
                      style={{
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <option value="">All Risks</option>
                      <option value="low">Low Risk</option>
                      <option value="medium">Medium Risk</option>
                      <option value="high">High Risk</option>
                      <option value="critical">Critical Risk</option>
                    </select>
                    <select
                      value={riskFilters.risk_type}
                      onChange={(e) => setRiskFilters(prev => ({ ...prev, risk_type: e.target.value }))}
                      style={{
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <option value="">All Risk Types</option>
                      <option value="health_safety">Health & Safety</option>
                      <option value="environmental">Environmental</option>
                      <option value="production">Production</option>
                      <option value="operational">Operational</option>
                      <option value="financial">Financial</option>
                      <option value="reputational">Reputational</option>
                      <option value="regulatory">Regulatory</option>
                    </select>
                  </div>
                </div>
                
                {risks.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      fontSize: '0.875rem'
                    }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Risk</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Category</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Inherent Risk</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Residual Risk</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {risks.slice(0, 10).map((risk, index) => {
                          const isOverdue = risk.next_review_due && new Date(risk.next_review_due) < new Date();
                          
                          return (
                            <tr key={risk.id || index} style={{
                              borderBottom: '1px solid #f3f4f6'
                            }}
                            onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                            onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                            >
                              <td style={{ padding: '0.75rem' }}>
                                <div>
                                  <div style={{ fontWeight: '500', color: '#1f2937', marginBottom: '0.25rem' }}>
                                    {risk.risk_title || 'Untitled Risk'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.2' }}>
                                    {risk.risk_description ? 
                                      (risk.risk_description.length > 80 ? 
                                        `${risk.risk_description.substring(0, 80)}...` : 
                                        risk.risk_description
                                      ) : 'No description'
                                    }
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <span style={{
                                  background: '#f3f4f6',
                                  color: '#374151',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  textTransform: 'capitalize'
                                }}>
                                  {risk.risk_category?.replace('_', ' ') || 'Other'}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <span style={{
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  textTransform: 'capitalize'
                                }}>
                                  {risk.risk_type?.replace('_', ' ') || 'Unknown'}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <RiskLevelBadge level={risk.inherent_risk_level} />
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <RiskLevelBadge level={risk.residual_risk_level || risk.inherent_risk_level} />
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <StatusBadge status={risk.status || 'active'} />
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleEditRisk(risk.id)}
                                    title="Edit Risk"
                                    style={{
                                      background: '#0b78f5ff',
                                      color: 'white',
                                      border: 'none',
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem'
                                    }}
                                  >
                                    ✏️ Edit
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛡️</div>
                    <div>No risks found</div>
                    <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={() => navigate('/risks/create')}
                        style={{
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Create Your First Risk
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions Tab */}
            {activeTab === 'actions' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #f3f4f6'
                }}>
                  <h2 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    margin: 0
                  }}>
                    Risk Actions / Controls ({actions.length})
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      value={actionFilters.status}
                      onChange={(e) => setActionFilters(prev => ({ ...prev, status: e.target.value }))}
                      style={{
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <option value="">All Status</option>
                      <option value="planned">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="overdue">Overdue</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={actionFilters.assigned_to_me}
                        onChange={(e) => setActionFilters(prev => ({ ...prev, assigned_to_me: e.target.checked }))}
                      />
                      My Actions
                    </label>
                  </div>
                </div>
                
                {actions.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      fontSize: '0.875rem'
                    }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Action</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Assigned to</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Priority</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Progress</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Due Date</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actions.slice(0, 10).map((action, index) => {
                          const isOverdue = action.target_completion_date && 
                                           new Date(action.target_completion_date) < new Date() &&
                                           !['completed', 'cancelled'].includes(action.status);
                          const progress = action.progress_percentage || 0;
                          
                          return (
                            <tr key={action.id || index} style={{
                              borderBottom: '1px solid #f3f4f6'
                            }}
                            onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                            onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                            >
                              <td style={{ padding: '0.75rem' }}>
                                <div>
                                  <div style={{ fontWeight: '500', color: '#1f2937', marginBottom: '0.25rem' }}>
                                    {action.action_title || 'Untitled Action'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.2' }}>
                                    {action.action_description ? 
                                      (action.action_description.length > 60 ? 
                                        `${action.action_description.substring(0, 60)}...` : 
                                        action.action_description
                                      ) : 'No description'
                                    }
                                  </div>
                                </div>
                              </td>

                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <div>
                                  <div style={{ fontWeight: '400', color: '#1f2937', marginBottom: '0.25rem' }}>
                                    {(() => {
                                      // Handle different data structures for assigned_to
                                      let assignedName = 'Unassigned';
                                      
                                      if (action.assigned_to) {
                                        if (typeof action.assigned_to === 'object' && action.assigned_to.id) {
                                          // assigned_to is a user object
                                          const firstName = action.assigned_to.first_name || '';
                                          const lastName = action.assigned_to.last_name || '';
                                          assignedName = firstName || lastName 
                                            ? `${firstName} ${lastName}`.trim()
                                            : action.assigned_to.username || action.assigned_to.email || `User ${action.assigned_to.id}`;
                                        } else if (typeof action.assigned_to === 'number' || typeof action.assigned_to === 'string') {
                                          // assigned_to is an ID, look up in userLookup
                                          const userId = parseInt(action.assigned_to);
                                          assignedName = userLookup[userId] || `User ${userId}`;
                                        } else if (typeof action.assigned_to === 'string') {
                                          // assigned_to is already a string name
                                          assignedName = action.assigned_to;
                                        }
                                      }
                                      
                                      return assignedName;
                                    })()}
                                  </div>
                                </div>
                              </td>


                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <span style={{
                                  background: action.priority === 'critical' ? '#fecaca' :
                                             action.priority === 'high' ? '#fed7aa' :
                                             action.priority === 'medium' ? '#fef3c7' : '#f3f4f6',
                                  color: action.priority === 'critical' ? '#991b1b' :
                                         action.priority === 'high' ? '#c2410c' :
                                         action.priority === 'medium' ? '#92400e' : '#374151',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  textTransform: 'capitalize'
                                }}>
                                  {action.priority || 'Medium'}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <StatusBadge status={isOverdue ? 'overdue' : (action.status || 'open')} />
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{
                                    width: '60px',
                                    height: '8px',
                                    background: '#e5e7eb',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                  }}>
                                    <div style={{
                                      width: `${Math.min(progress, 100)}%`,
                                      height: '100%',
                                      background: progress === 100 ? '#22c55e' : 
                                                progress >= 75 ? '#3b82f6' :
                                                progress >= 50 ? '#f59e0b' : '#ef4444',
                                      borderRadius: '4px',
                                      transition: 'width 0.3s ease'
                                    }} />
                                  </div>
                                  <span style={{ fontSize: '0.75rem', fontWeight: '500', minWidth: '35px' }}>
                                    {progress}%
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                {action.target_completion_date ? (
                                  <div style={{
                                    fontSize: '0.75rem',
                                    color: isOverdue ? '#dc2626' : '#374151',
                                    fontWeight: isOverdue ? '600' : '400'
                                  }}>
                                    {isOverdue && '⚠️ '}
                                    {new Date(action.target_completion_date).toLocaleDateString()}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>-</span>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleEditAction(action.id)}
                                  title="Edit Action"
                                  style={{
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
                    <div>No actions found</div>
                    <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={() => navigate('/actions/create')}
                        style={{
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Create Your First Action
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Incidents Tab */}
            {activeTab === 'incidents' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #f3f4f6'
                }}>
                  <h2 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    margin: 0
                  }}>
                    Incident Register ({incidents.length})
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        value={incidentFilters.status}
                        onChange={(e) => setIncidentFilters(prev => ({ ...prev, status: e.target.value }))}
                        style={{
                          padding: '0.25rem 0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      >
                        <option value="">All Incident Status</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                        <option value="investigating">Investigating</option>
                    </select>

                    <select
                      value={incidentFilters.incident_type}
                      onChange={(e) => setIncidentFilters(prev => ({ ...prev, incident_type: e.target.value }))}
                      style={{
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <option value="">All Types</option>
                      <option value="injury">Injury</option>
                      <option value="near_miss">Near Miss</option>
                      <option value="property_damage">Property Damage</option>
                      <option value="environmental">Environmental</option>
                      <option value="security">Security</option>
                    </select>
                    <select
                      value={incidentFilters.severity}
                      onChange={(e) => setIncidentFilters(prev => ({ ...prev, severity: e.target.value }))}
                      style={{
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <option value="">All Severities</option>
                      <option value="minor">Minor</option>
                      <option value="moderate">Moderate</option>
                      <option value="serious">Serious</option>
                      <option value="critical">Critical</option>
                      <option value="fatal">Fatal</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={incidentFilters.notifiable_only}
                        onChange={(e) => setIncidentFilters(prev => ({ ...prev, notifiable_only: e.target.checked }))}
                      />
                      Notifiable Only
                    </label>
                  </div>
                </div>
                
                {incidents.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      fontSize: '0.875rem'
                    }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Incident</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Number</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Type</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Severity</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Date</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Notifiable</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Related Risk</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.slice(0, 10).map((incident, index) => {
                          const isOverdueInvestigation = incident.investigation_due_date && 
                                                        new Date(incident.investigation_due_date) < new Date() &&
                                                        incident.investigation_status !== 'completed';
                          const requiresNotification = incident.is_notifiable && !incident.worksafe_notified;
                          
                          return (
                            <tr key={incident.id || index} style={{
                              borderBottom: '1px solid #f3f4f6',
                              backgroundColor: (isOverdueInvestigation || requiresNotification) ? '#fef3c7' : 'transparent'
                            }}
                            onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                            onMouseLeave={(e) => e.target.closest('tr').style.background = (isOverdueInvestigation || requiresNotification) ? '#fef3c7' : 'transparent'}
                            >
                              <td style={{ padding: '0.75rem' }}>
                                <div>
                                  <div style={{ fontWeight: '500', color: '#1f2937', marginBottom: '0.25rem' }}>
                                    {incident.incident_title || 'Untitled Incident'}
                                    {(isOverdueInvestigation || requiresNotification) && (
                                      <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>⚠️</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.2' }}>
                                    {incident.incident_description ? 
                                      (incident.incident_description.length > 60 ? 
                                        `${incident.incident_description.substring(0, 60)}...` : 
                                        incident.incident_description
                                      ) : 'No description'
                                    }
                                  </div>
                                  {incident.location_description && (
                                    <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>
                                      📍 {incident.location_description}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <span style={{
                                  background: '#f3f4f6',
                                  color: '#374151',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500'
                                }}>
                                  {incident.incident_number || '-'}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <span style={{
                                  background: incident.incident_type === 'injury' ? '#fecaca' :
                                            incident.incident_type === 'near_miss' ? '#fef3c7' :
                                            incident.incident_type === 'environmental' ? '#dcfce7' :
                                            incident.incident_type === 'property_damage' ? '#fed7aa' : '#e0f2fe',
                                  color: incident.incident_type === 'injury' ? '#991b1b' :
                                        incident.incident_type === 'near_miss' ? '#92400e' :
                                        incident.incident_type === 'environmental' ? '#166534' :
                                        incident.incident_type === 'property_damage' ? '#c2410c' : '#0369a1',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  textTransform: 'capitalize'
                                }}>
                                  {incident.incident_type?.replace('_', ' ') || 'Unknown'}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <SeverityBadge severity={incident.severity} />
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', color: '#374151' }}>
                                  {incident.incident_date ? 
                                    new Date(incident.incident_date).toLocaleDateString() : 
                                    '-'
                                  }
                                </div>
                                {incident.days_since_incident !== undefined && (
                                  <div style={{ fontSize: '0.625rem', color: '#6b7280' }}>
                                    {incident.days_since_incident} days ago
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <StatusBadge status={incident.status || 'open'} />
                                {isOverdueInvestigation && (
                                  <div style={{ fontSize: '0.625rem', color: '#dc2626', marginTop: '0.25rem' }}>
                                    Investigation Overdue
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                {incident.is_notifiable ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{
                                      background: incident.worksafe_notified ? '#dcfce7' : '#fecaca',
                                      color: incident.worksafe_notified ? '#166534' : '#991b1b',
                                      padding: '0.125rem 0.375rem',
                                      borderRadius: '8px',
                                      fontSize: '0.625rem',
                                      fontWeight: '500'
                                    }}>
                                      {incident.worksafe_notified ? '✓ Notified' : '⚠️ Required'}
                                    </span>
                                    {incident.notifiable_type && (
                                      <div style={{ fontSize: '0.625rem', color: '#6b7280', textTransform: 'capitalize' }}>
                                        {incident.notifiable_type.replace('_', ' ')}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>No</span>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                {incident.related_risk_id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{
                                      background: '#dcfce7',
                                      color: '#166534',
                                      padding: '0.125rem 0.375rem',
                                      borderRadius: '8px',
                                      fontSize: '0.625rem',
                                      fontWeight: '500'
                                    }}>
                                      ✓ Linked
                                    </span>
                                    <button
                                      onClick={() => handleEditRisk(incident.related_risk_id)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#3b82f6',
                                        cursor: 'pointer',
                                        fontSize: '0.625rem',
                                        textDecoration: 'underline'
                                      }}
                                    >
                                      View Risk
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => navigate('/risks/create', { 
                                      state: { 
                                        createRiskFromIncident: true,
                                        incidentData: incident
                                      } 
                                    })}
                                    style={{
                                      background: '#fef3c7',
                                      color: '#92400e',
                                      border: '1px solid #f59e0b',
                                      padding: '0.125rem 0.375rem',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.625rem'
                                    }}
                                  >
                                    Create Risk
                                  </button>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleEditIncident(incident.id)}
                                  title="Edit Incident"
                                  style={{
                                    background: '#dc2626',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                    <div>No incidents found</div>
                    <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={() => navigate('/incidents/create')}
                        style={{
                          background: '#dc2626',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Report Your First Incident
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Critical Alerts Section */}
        {overdueItems && (totalOverdueItems > 0 || (overdueItems.unnotified_incidents && overdueItems.unnotified_incidents.length > 0)) && (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600', color: '#92400e' }}>
              ⚠️ Items Requiring Immediate Attention
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              {overdueItems.unnotified_incidents && overdueItems.unnotified_incidents.length > 0 && (
                <div style={{
                  background: '#fecaca',
                  border: '1px solid #dc2626',
                  borderRadius: '8px',
                  padding: '1rem'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#991b1b' }}>
                    🚨 WorkSafe Notifications Required ({overdueItems.unnotified_incidents.length})
                  </h4>
                  {overdueItems.unnotified_incidents.slice(0, 3).map(incident => (
                    <div key={incident.id} style={{ 
                      fontSize: '0.75rem', 
                      color: '#991b1b',
                      marginBottom: '0.25rem'
                    }}>
                      • {incident.incident_number}: {incident.title} ({incident.notifiable_type})
                    </div>
                  ))}
                  {overdueItems.unnotified_incidents.length > 3 && (
                    <div style={{ fontSize: '0.75rem', color: '#991b1b', fontStyle: 'italic' }}>
                      ...and {overdueItems.unnotified_incidents.length - 3} more
                    </div>
                  )}
                </div>
              )}
              
              {overdueItems.overdue_investigations && overdueItems.overdue_investigations.length > 0 && (
                <div style={{
                  background: '#fed7aa',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '1rem'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#92400e' }}>
                    🔍 Overdue Investigations ({overdueItems.overdue_investigations.length})
                  </h4>
                  {overdueItems.overdue_investigations.slice(0, 3).map(incident => (
                    <div key={incident.id} style={{ 
                      fontSize: '0.75rem', 
                      color: '#92400e',
                      marginBottom: '0.25rem'
                    }}>
                      • {incident.incident_number}: {incident.title} ({incident.days_overdue} days overdue)
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      <MobileNavigation />
     
    </div>
  );
}

export default RiskDashboard;