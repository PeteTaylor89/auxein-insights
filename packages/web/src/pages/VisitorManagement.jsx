import React, { useState, useEffect } from 'react';
import { Users, Clock, AlertTriangle, TrendingUp, Eye, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '@vineyard/shared';
import {visitorService, api} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

const VisitorDashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [activeVisits, setActiveVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Inline styles
  const styles = {
    container: {
      width: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '28px',
      background: '#f9fafb',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '24px'
    },
    title: {
      fontSize: '30px',
      fontWeight: 'bold',
      color: '#111827',
      margin: 0
    },
    headerButton: {
      background: '#2563eb',
      color: 'white',
      padding: '8px 16px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'all 0.2s ease'
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '24px',
      marginBottom: '24px'
    },
    statCard: {
      background: 'white',
      borderRadius: '12px',
      padding: '24px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      transition: 'transform 0.2s ease'
    },
    statContent: {
      display: 'flex',
      alignItems: 'center'
    },
    statIcon: (color) => ({
      width: '32px',
      height: '32px',
      color: color,
      marginRight: '16px'
    }),
    statDetails: {
      flex: 1
    },
    statLabel: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#6b7280',
      margin: '0 0 4px 0'
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#111827',
      margin: 0
    },
    alertsSection: {
      background: '#fef3c7',
      border: '1px solid #f59e0b',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '24px'
    },
    alertsTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#92400e',
      margin: '0 0 12px 0'
    },
    alertsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    },
    alertItem: {
      display: 'flex',
      alignItems: 'center',
      color: '#92400e'
    },
    alertIcon: {
      width: '16px',
      height: '16px',
      marginRight: '8px'
    },
    alertText: {
      fontSize: '14px'
    },
    card: {
      background: 'white',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      marginBottom: '24px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    },
    cardHeader: {
      padding: '20px 24px',
      borderBottom: '1px solid #e5e7eb',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
    },
    cardTitle: {
      fontSize: '20px',
      fontWeight: '600',
      color: '#111827',
      margin: '0 0 4px 0'
    },
    cardSubtitle: {
      fontSize: '14px',
      color: '#6b7280',
      margin: 0
    },
    cardContent: {
      padding: 0
    },
    emptyState: {
      padding: '48px 24px',
      textAlign: 'center'
    },
    emptyIcon: {
      width: '48px',
      height: '48px',
      color: '#9ca3af',
      margin: '0 auto 16px'
    },
    emptyTitle: {
      fontSize: '18px',
      fontWeight: '500',
      color: '#111827',
      margin: '0 0 8px 0'
    },
    emptyText: {
      color: '#6b7280',
      margin: 0
    },
    visitsList: {
      display: 'flex',
      flexDirection: 'column'
    },
    visitItem: {
      padding: '20px 24px',
      borderBottom: '1px solid #e5e7eb',
      transition: 'background-color 0.2s ease'
    },
    visitMain: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12px'
    },
    visitInfo: {
      display: 'flex',
      alignItems: 'center',
      flex: 1
    },
    visitorAvatar: {
      width: '40px',
      height: '40px',
      background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: '16px'
    },
    avatarIcon: {
      width: '20px',
      height: '20px',
      color: '#2563eb'
    },
    visitorDetails: {
      flex: 1
    },
    visitorName: {
      fontSize: '18px',
      fontWeight: '500',
      color: '#111827',
      margin: '0 0 4px 0'
    },
    visitMeta: {
      display: 'flex',
      alignItems: 'center',
      fontSize: '14px',
      color: '#6b7280',
      gap: '8px'
    },
    metaSeparator: {
      color: '#d1d5db'
    },
    visitActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    badge: (variant) => ({
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '500',
      background: variant === 'danger' ? '#fee2e2' : variant === 'success' ? '#dcfce7' : '#f3f4f6',
      color: variant === 'danger' ? '#dc2626' : variant === 'success' ? '#16a34a' : '#374151'
    }),
    badgeIcon: {
      width: '12px',
      height: '12px',
      marginRight: '4px'
    },
    signOutButton: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 12px',
      border: '1px solid #d1d5db',
      background: 'white',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '500',
      color: '#374151',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    },
    buttonIcon: {
      width: '16px',
      height: '16px',
      marginRight: '4px'
    },
    visitDetailsExtra: {
      marginLeft: '56px',
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
      fontSize: '12px',
      color: '#9ca3af'
    },
    statusComplete: {
      color: '#16a34a',
      fontWeight: '500'
    },
    activityList: {
      display: 'flex',
      flexDirection: 'column'
    },
    activityItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px',
      borderBottom: '1px solid #e5e7eb',
      transition: 'background-color 0.2s ease'
    },
    activityInfo: {
      flex: 1
    },
    activityName: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#111827',
      margin: '0 0 4px 0'
    },
    activityDetails: {
      fontSize: '12px',
      color: '#6b7280',
      margin: 0
    },
    statusBadge: (status) => ({
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '500',
      background: status === 'completed' ? '#dcfce7' : status === 'in_progress' ? '#dbeafe' : '#f3f4f6',
      color: status === 'completed' ? '#16a34a' : status === 'in_progress' ? '#2563eb' : '#374151'
    }),
    loadingSpinner: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '256px'
    },
    spinner: {
      width: '48px',
      height: '48px',
      border: '4px solid #f3f4f6',
      borderTop: '4px solid #2563eb',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    errorState: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      textAlign: 'center',
      background: 'white',
      borderRadius: '12px',
      padding: '48px',
      border: '1px solid #e5e7eb'
    },
    errorIcon: {
      width: '64px',
      height: '64px',
      color: '#ef4444',
      marginBottom: '16px'
    },
    errorTitle: {
      fontSize: '24px',
      fontWeight: '600',
      color: '#111827',
      margin: '0 0 8px 0'
    },
    errorText: {
      color: '#6b7280',
      margin: '0 0 24px 0',
      fontSize: '16px'
    },
    retryButton: {
      background: '#2563eb',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '8px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchActiveVisits();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchActiveVisits();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const data = await visitorService.getDashboard();
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError('Failed to load dashboard data');
    }
  };

  const fetchActiveVisits = async () => {
    try {
      const data = await visitorService.getActiveVisits();
      console.log('🔍 Raw active visits data:', data);
      
      // Ensure data is an array and format it
      const visitsArray = Array.isArray(data) ? data : [];
      console.log('🔍 Visits array:', visitsArray);
      
      const formattedVisits = visitsArray.map(visit => {
        console.log('🔍 Individual visit:', visit);
        console.log('🔍 Visit visitor data:', visit.visitor);
        console.log('🔍 Visit host data:', visit.host);
        return visitorService.formatVisit(visit);
      });
      
      console.log('🔍 Formatted visits:', formattedVisits);
      setActiveVisits(formattedVisits);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch active visits:', error);
      setError('Failed to load visitor data');
      setActiveVisits([]); // Ensure it's always an array
      setLoading(false);
    }
  };

  const signOutVisitor = async (visitId) => {
    try {
      await visitorService.signOutVisitor(visitId, 'Signed out from dashboard');
      fetchActiveVisits(); // Refresh the list
      alert('Visitor signed out successfully');
    } catch (error) {
      console.error('Error signing out visitor:', error);
      alert('Failed to sign out visitor. Please try again.');
    }
  };

  // Error state
  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorState}>
          <AlertTriangle style={styles.errorIcon} />
          <h3 style={styles.errorTitle}>Unable to Load Visitor Data</h3>
          <p style={styles.errorText}>{error}</p>
          <button 
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchDashboardData();
              fetchActiveVisits();
            }}
            style={styles.retryButton}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#1d4ed8'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingSpinner}>
          <div style={styles.spinner}></div>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Visitor Management</h1>
        <button
          onClick={() => window.open('/visitors', '_blank')}
          style={styles.headerButton}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#1d4ed8';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#2563eb';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
          }}
        >
          Register Visitor
        </button>
      </div>

      {/* Stats Cards */}
      {dashboardData && (
        <div style={styles.statsGrid}>
          <div 
            style={styles.statCard}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-6px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
            }}
          >
            <div style={styles.statContent}>
              <Users style={styles.statIcon('#2563eb')} />
              <div style={styles.statDetails}>
                <p style={styles.statLabel}>Active Visits</p>
                <p style={styles.statValue}>{dashboardData.active_visits}</p>
              </div>
            </div>
          </div>

          <div 
            style={styles.statCard}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-6px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
            }}
          >
            <div style={styles.statContent}>
              <Clock style={styles.statIcon('#16a34a')} />
              <div style={styles.statDetails}>
                <p style={styles.statLabel}>Today's Visits</p>
                <p style={styles.statValue}>{dashboardData.today_visits}</p>
              </div>
            </div>
          </div>

          <div 
            style={styles.statCard}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-6px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
            }}
          >
            <div style={styles.statContent}>
              <TrendingUp style={styles.statIcon('#7c3aed')} />
              <div style={styles.statDetails}>
                <p style={styles.statLabel}>Monthly Total</p>
                <p style={styles.statValue}>{dashboardData.stats?.visits_this_month || 0}</p>
              </div>
            </div>
          </div>

          <div 
            style={styles.statCard}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-6px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
            }}
          >
            <div style={styles.statContent}>
              <AlertTriangle style={styles.statIcon('#ea580c')} />
              <div style={styles.statDetails}>
                <p style={styles.statLabel}>Alerts</p>
                <p style={styles.statValue}>{dashboardData.alerts?.length || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
        <div style={styles.alertsSection}>
          <h3 style={styles.alertsTitle}>Active Alerts</h3>
          <div style={styles.alertsList}>
            {dashboardData.alerts.map((alert, index) => (
              <div key={index} style={styles.alertItem}>
                <AlertTriangle style={styles.alertIcon} />
                <span style={styles.alertText}>{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Visits */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Currently On Site</h2>
          <p style={styles.cardSubtitle}>{activeVisits.length} visitors currently signed in</p>
        </div>

        <div style={styles.cardContent}>
          {!Array.isArray(activeVisits) || activeVisits.length === 0 ? (
            <div style={styles.emptyState}>
              <Users style={styles.emptyIcon} />
              <h3 style={styles.emptyTitle}>No Active Visits</h3>
              <p style={styles.emptyText}>
                {!Array.isArray(activeVisits) 
                  ? 'Unable to load visitor data.' 
                  : 'All visitors have signed out for today.'
                }
              </p>
            </div>
          ) : (
            <div style={styles.visitsList}>
              {activeVisits.map((visit) => (
                <div 
                  key={visit.id} 
                  style={styles.visitItem}

                >
                  <div style={styles.visitMain}>
                    <div style={styles.visitInfo}>
                      <div style={styles.visitorAvatar}>
                        <Users style={styles.avatarIcon} />
                      </div>
                      <div style={styles.visitorDetails}>
                        <h4 style={styles.visitorName}>
                          {visit.visitor ? 
                            `${visit.visitor.first_name || 'Unknown'} ${visit.visitor.last_name || 'Visitor'}` :
                            'Unknown Visitor'
                          }
                        </h4>
                        <div style={styles.visitMeta}>
                          <span>{visit.purpose || 'No purpose specified'}</span>
                          <span style={styles.metaSeparator}>•</span>
                          <span>Host: {visit.host ? visit.host.full_name || `${visit.host.first_name} ${visit.host.last_name}` : 'Unknown'}</span>
                          <span style={styles.metaSeparator}>•</span>
                          <span>
                            Signed in: {visit.signed_in_at ? new Date(visit.signed_in_at).toLocaleTimeString() : 'Unknown time'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={styles.visitActions}>
                      {visit.is_overdue && (
                        <span style={styles.badge('danger')}>
                          <AlertTriangle style={styles.badgeIcon} />
                          Overdue
                        </span>
                      )}

                      <span style={styles.badge('success')}>
                        <Clock style={styles.badgeIcon} />
                        {visit.visit_duration_minutes || 0}min
                      </span>

                      <button
                        onClick={() => signOutVisitor(visit.id)}
                        style={styles.signOutButton}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = '#f9fafb';
                          e.target.style.borderColor = '#9ca3af';
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = 'white';
                          e.target.style.borderColor = '#d1d5db';
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = 'none';
                        }}
                      >
                        <UserX style={styles.buttonIcon} />
                        Sign Out
                      </button>
                    </div>
                  </div>

                  {/* Additional details */}
                  <div style={styles.visitDetailsExtra}>
                    {visit.visitor?.company_representing && (
                      <span>Company: {visit.visitor.company_representing}</span>
                    )}
                    {visit.visitor?.vehicle_registration && (
                      <span>Vehicle: {visit.visitor.vehicle_registration}</span>
                    )}
                    {visit.induction_completed && (
                      <span style={styles.statusComplete}>✓ Induction Complete</span>
                    )}
                    {visit.ppe_provided?.length > 0 && (
                      <span>PPE: {visit.ppe_provided.join(', ')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {dashboardData?.recent_activity && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Recent Activity</h2>
          </div>

          <div style={styles.cardContent}>
            <div style={styles.activityList}>
              {dashboardData.recent_activity.slice(0, 5).map((activity) => (
                <div 
                  key={activity.id} 
                  style={styles.activityItem}
                >
                  <div style={styles.activityInfo}>
                    <p style={styles.activityName}>{activity.visitor_name}</p>
                    <p style={styles.activityDetails}>
                      {activity.purpose} • {new Date(activity.visit_date).toLocaleDateString()}
                    </p>
                  </div>
                  <span style={styles.statusBadge(
                    activity.status === 'completed' ? 'completed' : 
                    activity.status === 'in_progress' ? 'in_progress' : 'default'
                  )}>
                    {activity.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
                <MobileNavigation />
        </div>
        
      )}
    </div>
  );
};

export default VisitorDashboard;