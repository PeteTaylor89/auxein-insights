// src/pages/UserDetail.jsx - Individual User Detail View
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Mail, Building, MapPin, Calendar, Clock, User, Check, X, 
  Save, RefreshCw, Activity, MessageSquare, Shield, Briefcase
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

// Info Row Component
const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="info-row">
    <div className="info-row-icon"><Icon size={20} /></div>
    <div className="info-row-content">
      <p className="info-row-label">{label}</p>
      <p className="info-row-value">{value || '-'}</p>
    </div>
  </div>
);

// Status Badge Component
const StatusBadge = ({ active, verified }) => (
  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
    <span className={`badge ${verified ? 'badge-green' : 'badge-yellow'}`}>
      {verified ? <><Check size={12} /> Verified</> : <><X size={12} /> Unverified</>}
    </span>
    <span className={`badge ${active ? 'badge-blue' : 'badge-red'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  </div>
);

// Opt-In Badges
const OptInBadges = ({ newsletter, marketing, research }) => (
  <div className="opt-in-badges">
    {newsletter && <span className="badge badge-purple">Newsletter</span>}
    {marketing && <span className="badge badge-indigo">Marketing</span>}
    {research && <span className="badge badge-cyan">Research</span>}
    {!newsletter && !marketing && !research && <span className="text-muted">No opt-ins</span>}
  </div>
);

const UserDetail = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.users.getUser(id);
      setUser(data);
      setIsActive(data.is_active);
      setNotes(data.notes || '');
      setHasChanges(false);
    } catch (err) {
      setError('Failed to load user details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUser(); }, [id]);

  useEffect(() => {
    if (user) {
      setHasChanges(isActive !== user.is_active || notes !== (user.notes || ''));
    }
  }, [isActive, notes, user]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await adminService.users.updateUser(id, { is_active: isActive, notes: notes || null });
      setUser(updated);
      setHasChanges(false);
    } catch (err) {
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-NZ', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatUserType = (type) => type ? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-';

  if (loading) {
    return (
      <AdminLayout backLink="/admin/users" backText="Back to users">
        <div className="loading-container"><div className="loading-spinner"><RefreshCw size={32} /></div></div>
      </AdminLayout>
    );
  }

  if (error && !user) {
    return (
      <AdminLayout backLink="/admin/users" backText="Back to users">
        <div className="error-container"><p className="error-text">{error}</p></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout backLink="/admin/users" backText="Back to users">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{user.full_name}</h1>
          <p className="text-muted">{user.email}</p>
        </div>
        <StatusBadge active={user.is_active} verified={user.is_verified} />
      </div>

      {error && <div className="error-container mb-4"><p className="error-text">{error}</p></div>}

      <div className="two-column-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header"><h2>Profile</h2></div>
            <div className="card-body">
              <InfoRow icon={User} label="Full Name" value={user.full_name} />
              <InfoRow icon={Mail} label="Email" value={user.email} />
              <InfoRow icon={Briefcase} label="User Type" value={formatUserType(user.user_type)} />
              <InfoRow icon={Building} label="Company" value={user.company_name} />
              <InfoRow icon={Briefcase} label="Job Title" value={user.job_title} />
              <InfoRow icon={MapPin} label="Region" value={formatUserType(user.region_of_interest)} />
              <InfoRow icon={Shield} label="Segment" value={formatUserType(user.marketing_segment)} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Activity</h2></div>
            <div className="card-body">
              <InfoRow icon={Calendar} label="Joined" value={formatDate(user.created_at)} />
              <InfoRow icon={Check} label="Verified" value={formatDate(user.verified_at)} />
              <InfoRow icon={Activity} label="Logins" value={user.login_count || 0} />
              <InfoRow icon={Clock} label="Last Login" value={formatDate(user.last_login)} />
              <InfoRow icon={Clock} label="Last Active" value={formatDate(user.last_active)} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Communication Preferences</h2></div>
            <div className="card-body">
              <OptInBadges newsletter={user.newsletter_opt_in} marketing={user.marketing_opt_in} research={user.research_opt_in} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header"><h2>Admin Controls</h2></div>
            <div className="card-body">
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span>Account Active</span>
                  <button type="button" onClick={() => setIsActive(!isActive)} className={`toggle-switch ${isActive ? 'active' : ''}`}>
                    <span className="toggle-switch-handle" />
                  </button>
                </label>
                <p className="text-xs text-muted mt-1">Inactive users cannot log in</p>
              </div>

              <div className="form-group">
                <label className="form-label"><MessageSquare size={14} /> Admin Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Add notes..." className="form-textarea" />
              </div>

              <button onClick={handleSave} disabled={!hasChanges || saving} className={`btn ${hasChanges ? 'btn-primary' : 'btn-secondary'}`} style={{ width: '100%' }}>
                {saving ? <RefreshCw size={16} /> : <Save size={16} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {hasChanges && <p className="text-xs text-yellow mt-2" style={{ textAlign: 'center' }}>Unsaved changes</p>}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Quick Stats</h2></div>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span className="text-muted">User ID</span><span className="font-mono">#{user.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">Days Since Signup</span>
                <span>{Math.floor((new Date() - new Date(user.created_at)) / 86400000)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default UserDetail;