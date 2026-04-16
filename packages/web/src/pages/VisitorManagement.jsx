import React, { useState, useEffect } from 'react';
import { Users, Clock, AlertTriangle, TrendingUp, Eye, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '@vineyard/shared';
import { visitorService, api } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import './Visitors.css';

const VisitorDashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [activeVisits, setActiveVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
    fetchActiveVisits();
    const interval = setInterval(() => fetchActiveVisits(), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try { const data = await visitorService.getDashboard(); setDashboardData(data); }
    catch (e) { console.error('Failed to fetch dashboard data:', e); setError('Failed to load dashboard data'); }
  };

  const fetchActiveVisits = async () => {
    try {
      const data = await visitorService.getActiveVisits();
      const arr = Array.isArray(data) ? data : [];
      setActiveVisits(arr.map(v => visitorService.formatVisit(v)));
      setLoading(false);
    } catch (e) { console.error('Failed to fetch active visits:', e); setError('Failed to load visitor data'); setActiveVisits([]); setLoading(false); }
  };

  const signOutVisitor = async (visitId) => {
    try { await visitorService.signOutVisitor(visitId, 'Signed out from dashboard'); fetchActiveVisits(); alert('Visitor signed out successfully'); }
    catch (e) { console.error('Error signing out visitor:', e); alert('Failed to sign out visitor. Please try again.'); }
  };

  if (error) {
    return (
      <div className="page-container">
        <div className="vi-error">
          <AlertTriangle style={{ width: 64, height: 64, color: 'var(--color-danger)', marginBottom: 'var(--space-base)' }} />
          <h3>Unable to Load Visitor Data</h3>
          <p>{error}</p>
          <button className="vi-btn-primary" onClick={() => { setError(null); setLoading(true); fetchDashboardData(); fetchActiveVisits(); }}>Try Again</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="page-container"><div className="vi-loading"><div className="tr-spinner" style={{ width: 48, height: 48, border: '4px solid var(--color-border)', borderTop: '4px solid var(--color-primary)', borderRadius: '50%' }} /></div></div>;
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Visitor Management</h1>
        <button className="vi-btn-primary" onClick={() => window.open('/visitors', '_blank')}>Register Visitor</button>
      </div>

      {dashboardData && (
        <div className="vi-stats-grid">
          {[
            { label: 'Active Visits', value: dashboardData.active_visits, icon: <Users style={{ width: 32, height: 32, color: 'var(--color-primary)', marginRight: 'var(--space-base)' }} /> },
            { label: "Today's Visits", value: dashboardData.today_visits, icon: <Clock style={{ width: 32, height: 32, color: 'var(--color-success)', marginRight: 'var(--space-base)' }} /> },
            { label: 'Monthly Total', value: dashboardData.stats?.visits_this_month || 0, icon: <TrendingUp style={{ width: 32, height: 32, color: '#7c3aed', marginRight: 'var(--space-base)' }} /> },
            { label: 'Alerts', value: dashboardData.alerts?.length || 0, icon: <AlertTriangle style={{ width: 32, height: 32, color: 'var(--color-warning)', marginRight: 'var(--space-base)' }} /> }
          ].map((s, i) => (
            <div key={i} className="vi-stat-card">
              <div className="vi-stat-content">
                {s.icon}
                <div><p className="vi-stat-label">{s.label}</p><p className="vi-stat-value">{s.value}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dashboardData?.alerts?.length > 0 && (
        <div className="vi-alerts">
          <h3>Active Alerts</h3>
          {dashboardData.alerts.map((alert, i) => (
            <div key={i} className="vi-alert-item">
              <AlertTriangle style={{ width: 16, height: 16, marginRight: 'var(--space-sm)' }} />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="vi-card">
        <div className="vi-card-header">
          <h2 className="vi-card-title">Currently On Site</h2>
          <p className="vi-card-subtitle">{activeVisits.length} visitors currently signed in</p>
        </div>
        <div>
          {!Array.isArray(activeVisits) || activeVisits.length === 0 ? (
            <div className="vi-empty">
              <Users style={{ width: 48, height: 48, color: 'var(--color-text-muted)', margin: '0 auto var(--space-base)' }} />
              <h3 className="vi-empty-title">No Active Visits</h3>
              <p className="vi-empty-text">{!Array.isArray(activeVisits) ? 'Unable to load visitor data.' : 'All visitors have signed out for today.'}</p>
            </div>
          ) : (
            <div>
              {activeVisits.map(visit => (
                <div key={visit.id} className="vi-visit-item">
                  <div className="vi-visit-main">
                    <div className="vi-visit-info">
                      <div className="vi-avatar"><Users style={{ width: 20, height: 20 }} /></div>
                      <div>
                        <h4 className="vi-visitor-name">{visit.visitor ? `${visit.visitor.first_name || 'Unknown'} ${visit.visitor.last_name || 'Visitor'}` : 'Unknown Visitor'}</h4>
                        <div className="vi-visit-meta">
                          <span>{visit.purpose || 'No purpose specified'}</span>
                          <span className="vi-meta-sep">•</span>
                          <span>Host: {visit.host ? visit.host.full_name || `${visit.host.first_name} ${visit.host.last_name}` : 'Unknown'}</span>
                          <span className="vi-meta-sep">•</span>
                          <span>Signed in: {visit.signed_in_at ? new Date(visit.signed_in_at).toLocaleTimeString() : 'Unknown time'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="vi-visit-actions">
                      {visit.is_overdue && <span className="vi-badge vi-badge--danger"><AlertTriangle style={{ width: 12, height: 12, marginRight: 4 }} /> Overdue</span>}
                      <span className="vi-badge vi-badge--success"><Clock style={{ width: 12, height: 12, marginRight: 4 }} /> {visit.visit_duration_minutes || 0}min</span>
                      <button className="vi-btn-ghost" onClick={() => signOutVisitor(visit.id)}><UserX style={{ width: 16, height: 16, marginRight: 4 }} /> Sign Out</button>
                    </div>
                  </div>
                  <div className="vi-visit-details-extra">
                    {visit.visitor?.company_representing && <span>Company: {visit.visitor.company_representing}</span>}
                    {visit.visitor?.vehicle_registration && <span>Vehicle: {visit.visitor.vehicle_registration}</span>}
                    {visit.induction_completed && <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>Induction Complete</span>}
                    {visit.ppe_provided?.length > 0 && <span>PPE: {visit.ppe_provided.join(', ')}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {dashboardData?.recent_activity && (
        <div className="vi-card">
          <div className="vi-card-header"><h2 className="vi-card-title">Recent Activity</h2></div>
          <div>
            {dashboardData.recent_activity.slice(0, 5).map(activity => (
              <div key={activity.id} className="vi-activity-item">
                <div>
                  <p className="vi-activity-name">{activity.visitor_name}</p>
                  <p className="vi-activity-details">{activity.purpose} • {new Date(activity.visit_date).toLocaleDateString()}</p>
                </div>
                <span className={`vi-badge vi-badge--${activity.status === 'completed' ? 'completed' : activity.status === 'in_progress' ? 'in_progress' : 'default'}`}>{activity.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <MobileNavigation />
    </div>
  );
};

export default VisitorDashboard;
