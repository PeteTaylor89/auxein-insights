// src/pages/AdminDashboard.jsx - Admin Overview Dashboard
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  UserCheck, 
  UserPlus,
  Cloud,
  CloudOff,
  AlertTriangle,
  Database,
  Activity,
  TrendingUp,
  RefreshCw,
  Check
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

// Stats Card Component
const StatsCard = ({ title, value, subtitle, icon: Icon, color = 'blue' }) => (
  <div className={`stats-card ${color}`}>
    <div className="stats-card-content">
      <div>
        <p className="stats-card-title">{title}</p>
        <p className="stats-card-value">{value}</p>
        {subtitle && <p className="stats-card-subtitle">{subtitle}</p>}
      </div>
      <div className="stats-card-icon">
        <Icon size={24} />
      </div>
    </div>
  </div>
);

// Status Badge Component
const StatusBadge = ({ status }) => (
  <span className={`status-badge status-${status}`}>{status}</span>
);

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [weatherStats, setWeatherStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState(null);
  const [ingestionSummary, setIngestionSummary] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [users, weather, activity, ingestion] = await Promise.all([
        adminService.users.getStats(),
        adminService.weather.getStationStats(),
        adminService.users.getActivity(7, 10),
        adminService.weather.getIngestionSummary(7),
      ]);
      
      setUserStats(users);
      setWeatherStats(weather);
      setRecentActivity(activity);
      setIngestionSummary(ingestion);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <AdminLayout title="Admin Dashboard" subtitle="Loading...">
        <div className="loading-container">
          <div className="loading-spinner">
            <RefreshCw size={32} />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Admin Dashboard">
        <div className="error-container">
          <p className="error-text">{error}</p>
          <button onClick={fetchDashboardData} className="btn btn-primary mt-2">
            Try again
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Admin Dashboard" subtitle="Regional Intelligence monitoring overview">
      {/* Refresh Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={fetchDashboardData} className="btn btn-secondary">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* User Stats Section */}
      <section className="mb-6">
        <div className="section-header">
          <h2 className="section-title"><Users size={20} /> User Overview</h2>
          <Link to="/admin/users" className="section-link">View all users →</Link>
        </div>
        
        <div className="stats-grid">
          <StatsCard
            title="Total Users"
            value={userStats?.total_users || 0}
            subtitle={`${userStats?.verified_users || 0} verified`}
            icon={Users}
            color="blue"
          />
          <StatsCard
            title="Active (30 days)"
            value={userStats?.active_last_30_days || 0}
            subtitle={`${userStats?.active_last_7_days || 0} in last 7 days`}
            icon={UserCheck}
            color="green"
          />
          <StatsCard
            title="New This Month"
            value={userStats?.signups_this_month || 0}
            subtitle={`${userStats?.signups_this_week || 0} this week`}
            icon={UserPlus}
            color="purple"
          />
          <StatsCard
            title="Newsletter Opt-ins"
            value={userStats?.opt_ins?.newsletter || 0}
            subtitle={`${userStats?.opt_ins?.newsletter_pct || 0}% of verified`}
            icon={TrendingUp}
            color="indigo"
          />
        </div>

        {/* User Type Breakdown */}
        {userStats?.by_type && userStats.by_type.length > 0 && (
          <div className="card mt-4">
            <div className="card-body">
              <h3 className="text-sm font-medium text-gray mb-3">Users by Type</h3>
              <div className="breakdown-grid">
                {userStats.by_type.map((type) => (
                  <div key={type.user_type} className="breakdown-item">
                    <p className="breakdown-value">{type.count}</p>
                    <p className="breakdown-label">
                      {type.user_type?.replace(/_/g, ' ') || 'Unknown'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Region Breakdown */}
        {userStats?.by_region && userStats.by_region.length > 0 && (
          <div className="card mt-4">
            <div className="card-body">
              <h3 className="text-sm font-medium text-gray mb-3">Users by Region of Interest</h3>
              <div className="breakdown-grid">
                {userStats.by_region.map((region) => (
                  <div key={region.region_of_interest || 'none'} className="breakdown-item">
                    <p className="breakdown-value">{region.count}</p>
                    <p className="breakdown-label">
                      {region.region_of_interest?.replace(/_/g, ' ') || 'Not specified'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Weather Infrastructure Section */}
      <section className="mb-6">
        <div className="section-header">
          <h2 className="section-title"><Cloud size={20} /> Weather Infrastructure</h2>
          <Link to="/admin/weather" className="section-link">View all stations →</Link>
        </div>
        
        <div className="stats-grid">
          <StatsCard
            title="Active Stations"
            value={weatherStats?.active_stations || 0}
            subtitle={`${weatherStats?.total_stations || 0} total`}
            icon={Cloud}
            color="cyan"
          />
          <StatsCard
            title="Healthy"
            value={weatherStats?.healthy_stations || 0}
            icon={Check}
            color="green"
          />
          <StatsCard
            title="Stale"
            value={weatherStats?.stale_stations || 0}
            icon={AlertTriangle}
            color="yellow"
          />
          <StatsCard
            title="Offline"
            value={weatherStats?.offline_stations || 0}
            icon={CloudOff}
            color="red"
          />
        </div>

        {/* By Source */}
        {weatherStats?.by_source && (
          <div className="card mt-4">
            <div className="card-body">
              <h3 className="text-sm font-medium text-gray mb-3">Stations by Source</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                {Object.entries(weatherStats.by_source).map(([source, count]) => (
                  <div key={source} className="breakdown-item" style={{ padding: '0.5rem 1rem' }}>
                    <span className="font-medium">{source}</span>
                    <span className="text-muted"> ({count})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Ingestion Success Rates */}
        {ingestionSummary?.by_source && ingestionSummary.by_source.length > 0 && (
          <div className="card mt-4">
            <div className="card-body">
              <h3 className="text-sm font-medium text-gray mb-3">
                Ingestion Success (Last 7 Days) — {ingestionSummary.overall_success_rate_pct}% overall
              </h3>
              {ingestionSummary.by_source.map((src) => (
                <div key={src.data_source} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="text-sm">{src.data_source}</span>
                  <div className="progress-with-label">
                    <div className="progress-bar">
                      <div 
                        className={`progress-bar-fill ${src.success_rate_pct >= 95 ? 'green' : src.success_rate_pct >= 80 ? 'yellow' : 'red'}`}
                        style={{ width: `${src.success_rate_pct}%` }}
                      />
                    </div>
                    <span className={`progress-label ${src.success_rate_pct >= 95 ? 'green' : src.success_rate_pct >= 80 ? 'yellow' : 'red'}`}>
                      {src.success_rate_pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Records Summary */}
        {weatherStats?.records_last_7d !== undefined && (
          <div className="card mt-4">
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <div>
                  <p className="stats-card-value">{weatherStats.records_last_7d?.toLocaleString() || 0}</p>
                  <p className="text-sm text-muted">Records (7 days)</p>
                </div>
                <div>
                  <p className="stats-card-value">{weatherStats.records_last_24h?.toLocaleString() || 0}</p>
                  <p className="text-sm text-muted">Records (24 hours)</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Recent Activity */}
      {recentActivity?.events && recentActivity.events.length > 0 && (
        <section>
          <h2 className="section-title mb-4"><Activity size={20} /> Recent Activity</h2>
          <div className="card">
            <ul className="activity-list">
              {recentActivity.events.slice(0, 10).map((event, idx) => (
                <li key={idx} className="activity-item">
                  <div className="activity-item-left">
                    <span className={`activity-dot ${event.event_type}`} />
                    <div>
                      <p className="activity-user-name">{event.user_name}</p>
                      <p className="activity-user-email">{event.user_email}</p>
                    </div>
                  </div>
                  <div className="activity-item-right">
                    <p className="activity-type">{event.event_type}</p>
                    <p className="activity-time">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;