// src/pages/UserDetail.jsx - Individual User Detail View
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Mail, Building, MapPin, Calendar, Clock, User, Check, X, 
  Save, RefreshCw, Activity, MessageSquare, Shield, Briefcase, Star, Link2
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

// What the server DECIDED, next to what is stored. `is_pro` is the truth —
// 'grow' counts as Pro and an expired 'pro' does not — so a screen that shows
// only the tier string will disagree with what the user sees on the site.
const ProBadge = ({ user }) => {
  const tier = user.subscription_tier || 'free';
  const lapsed = tier === 'pro' && !user.is_pro;
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <span className={`badge ${user.is_pro ? 'badge-purple' : 'badge-blue'}`}>
        {user.is_pro ? <><Star size={12} /> Pro</> : 'Free'}
      </span>
      {tier === 'grow' && (
        <span className="badge badge-cyan"><Link2 size={12} /> via Grow</span>
      )}
      {lapsed && <span className="badge badge-red">Lapsed</span>}
      {user.pro_site_quota > 0 && (
        <span className="badge badge-indigo">
          {user.pro_site_quota} site{user.pro_site_quota === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
};

const UserDetail = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [tier, setTier] = useState('free');
  const [quota, setQuota] = useState(0);
  const [expires, setExpires] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.users.getUser(id);
      setUser(data);
      setIsActive(data.is_active);
      setNotes(data.notes || '');
      setTier(data.subscription_tier || 'free');
      setQuota(data.pro_site_quota ?? 0);
      // <input type="date"> wants YYYY-MM-DD; the API sends an ISO timestamp.
      setExpires(data.pro_expires_at ? data.pro_expires_at.slice(0, 10) : '');
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
      setHasChanges(
        isActive !== user.is_active
        || notes !== (user.notes || '')
        || tier !== (user.subscription_tier || 'free')
        || Number(quota) !== (user.pro_site_quota ?? 0)
        || expires !== (user.pro_expires_at ? user.pro_expires_at.slice(0, 10) : ''),
      );
    }
  }, [isActive, notes, tier, quota, expires, user]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const wasExpiring = Boolean(user.pro_expires_at);
      const payload = {
        is_active: isActive,
        notes: notes || null,
        pro_site_quota: Number(quota),
      };
      // A Grow projection's tier is not ours to set; the API refuses it with a
      // 409 and the control below is disabled, so do not even send it.
      if (user.origin !== 'grow') payload.subscription_tier = tier;
      if (expires) {
        // End of that day, not its first instant — an expiry of the 30th that
        // lapses at midnight takes a day off what was sold.
        payload.pro_expires_at = new Date(`${expires}T23:59:59Z`).toISOString();
      } else if (wasExpiring) {
        // Null cannot mean "open-ended" and "no change" at once.
        payload.clear_pro_expiry = true;
      }
      const updated = await adminService.users.updateUser(id, payload);
      setUser(updated);
      setHasChanges(false);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save changes.');
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
          <StatusBadge active={user.is_active} verified={user.is_verified} />
          <ProBadge user={user} />
        </div>
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
            <div className="card-header"><h2>Subscription</h2></div>
            <div className="card-body">
              {/* There is no billing integration. Payment is arranged outside
                  the platform and the entitlement is switched on here, so this
                  card is the whole of Pro onboarding. */}
              {user.origin === 'grow' ? (
                <p className="text-xs text-muted mb-4">
                  This is a Grow customer&rsquo;s Insights profile. They already
                  hold Pro through that relationship, so the tier is not
                  settable here &mdash; but a saved site is priced separately and
                  can be granted below.
                </p>
              ) : (
                <div className="form-group">
                  <label className="form-label"><Star size={14} /> Tier</label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    className="form-input"
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                  </select>
                  <p className="text-xs text-muted mt-1">
                    Pro opens the saved site, the regional background and the
                    point sampler. Granting it is a commercial act &mdash; take
                    payment first.
                  </p>
                </div>
              )}

              <div className="form-group">
                <label className="form-label"><Calendar size={14} /> Expires</label>
                <input
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className="form-input"
                />
                <p className="text-xs text-muted mt-1">
                  Leave empty for open-ended. A past date is a lapsed
                  subscription: the account keeps the tier and loses the
                  entitlement.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label"><MapPin size={14} /> Saved sites</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                  className="form-input"
                />
                <p className="text-xs text-muted mt-1">
                  Priced separately and stacks, so it is <strong>not</strong>{' '}
                  implied by Pro. At 0 the subscriber sees the placement map and
                  is refused &mdash; the single most common thing to mistake for
                  a bug.
                </p>
              </div>

              {user.pro_started_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Customer since</span>
                  <span>{formatDate(user.pro_started_at)}</span>
                </div>
              )}
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