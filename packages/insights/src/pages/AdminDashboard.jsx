// src/pages/AdminDashboard.jsx - Admin Overview Dashboard
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UserPlus,
  Activity,
  TrendingUp,
  RefreshCw,
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

// How many events the activity feed asks for. This is now the substance of the
// page rather than a footnote under the weather cards, so it is worth more than
// the ten it used to show.
const ACTIVITY_LIMIT = 25;

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Weather deliberately does NOT load here. Station health, ingestion
      // success and the source breakdown all live at /admin/weather, which is
      // where they are acted on. Duplicating them on the overview also meant
      // every dashboard load paid for `/weather/stations/stats`, a ~58s cold
      // call behind a TTL cache, to render numbers nobody worked from.
      const [users, activity] = await Promise.all([
        adminService.users.getStats(),
        adminService.users.getActivity(7, ACTIVITY_LIMIT),
      ]);

      setUserStats(users);
      setRecentActivity(activity);
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
    <AdminLayout title="Admin Dashboard" subtitle="Users and recent activity">
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

      {/* Recent Activity */}
      <section>
        <h2 className="section-title mb-4"><Activity size={20} /> Recent Activity</h2>
        {!recentActivity?.events?.length ? (
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-muted">No sign-ins or sign-ups in the last 7 days.</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <ul className="activity-list">
              {recentActivity.events.slice(0, ACTIVITY_LIMIT).map((event, idx) => (
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
        )}
      </section>
    </AdminLayout>
  );
};

export default AdminDashboard;