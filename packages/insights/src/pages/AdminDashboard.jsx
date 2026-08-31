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
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
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

// --- scheduled job health -------------------------------------------------
//
// Every row here is the AGE OF WHAT A JOB PRODUCED, never whether it reported
// success. That is deliberate and hard-won: the surfaces workflow reported
// success on every run for five days while publishing nothing, and the 18:00
// pipeline went dark for three days the same way. Both were green throughout.

const JOB_STATUS = {
  ok:      { label: 'ok',      icon: CheckCircle2,  color: '#10b981' },
  late:    { label: 'late',    icon: AlertTriangle, color: '#f59e0b' },
  stale:   { label: 'STALE',   icon: XCircle,       color: '#ef4444' },
  never:   { label: 'NEVER',   icon: XCircle,       color: '#ef4444' },
  unknown: { label: 'unknown', icon: HelpCircle,    color: '#6b7280' },
};

const formatAge = (h) => {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

const JobHealthPanel = ({ data, error }) => {
  if (error) {
    return (
      <section className="mb-6">
        <h2 className="section-title"><Activity size={20} /> Scheduled jobs</h2>
        <div className="job-health-error">{error}</div>
      </section>
    );
  }
  if (!data) return null;

  const overall = JOB_STATUS[data.overall] || JOB_STATUS.unknown;
  const OverallIcon = overall.icon;

  return (
    <section className="mb-6">
      <div className="section-header">
        <h2 className="section-title"><Activity size={20} /> Scheduled jobs</h2>
        <div className="flex gap-2 items-center">
          {/* The banner reports the WORST job, not an average. Nine healthy jobs
              and one dark pipeline is an outage, not 90% health. */}
          <span className="job-health-overall" style={{ color: overall.color }}>
            <OverallIcon size={16} /> {overall.label}
          </span>
          {/* This panel can only see the newest row, so it cannot see a hole
              behind one. That is what /admin/jobs is for. */}
          <Link to="/admin/jobs" className="section-link">Day by day →</Link>
        </div>
      </div>

      <div className="job-health-grid">
        {data.jobs.map((j) => {
          const s = JOB_STATUS[j.status] || JOB_STATUS.unknown;
          const Icon = s.icon;
          return (
            <div key={j.key} className={`job-row job-row--${j.status}`}>
              <span className="job-dot" style={{ color: s.color }}><Icon size={15} /></span>
              <div className="job-name">
                <b>{j.name}</b>
                <span>{j.runs_on} · {j.cadence}</span>
              </div>
              <div className="job-age">
                <b style={{ color: s.color }}>{formatAge(j.age_hours)}</b>
                <span>of {formatAge(j.max_age_hours)}</span>
              </div>
              <div className="job-detail">
                {j.error
                  ? <span className="job-detail-err">{j.error}</span>
                  : j.detail_value !== null && j.detail_value !== undefined
                    ? <span>{j.detail_value.toLocaleString()} {j.detail_label}</span>
                    : <span className="job-detail-muted">{j.produces}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="job-health-foot">
        Age is of the newest row each job produced, not of its last run — a job
        that ran and wrote nothing reads as stale, which is the point.
        Late after one missed interval, stale after two.
      </p>
    </section>
  );
};

// How many events the activity feed asks for. This is now the substance of the
// page rather than a footnote under the weather cards, so it is worth more than
// the ten it used to show.
const ACTIVITY_LIMIT = 25;

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [jobsError, setJobsError] = useState(null);
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
    }

    // Job health is fetched SEPARATELY on purpose. It must neither take the
    // page down nor disappear when something else does — the moment you most
    // need to see whether the pipeline is running is the moment another call
    // is failing.
    //
    // It sat INSIDE the catch above until 2026-08-31, which inverted exactly
    // that: on a normal load it never ran at all, so `jobs` stayed null and the
    // panel rendered nothing; on a failing load it ran, but `setError` had
    // already switched the component to the error screen, so the panel was
    // never mounted. The monitoring panel was invisible in both branches.
    try {
      setJobs(await adminService.jobs.getStatus());
      setJobsError(null);
    } catch (err) {
      setJobsError(err?.response?.data?.detail || 'Could not load job status.');
    }

    setLoading(false);
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

      <JobHealthPanel data={jobs} error={jobsError} />

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