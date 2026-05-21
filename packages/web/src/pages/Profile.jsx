// src/pages/Profile.jsx — V1 rebuild
// Removed: subscription/pricing block + training assignments + monthly-cost
//          line on company info.
// Added:   avatar upload, edit-mode for personal details
//          (phone, job_title, bio, emergency contact),
//          re-syncs the global user via AuthContext.refreshProfile().
import { useState, useEffect, useRef } from 'react';
import { useAuth, companiesService, usersService } from '@vineyard/shared';
import { useNavigate } from 'react-router-dom';
import { Camera, Pencil, X, Check, Loader2, Trash2, User as UserIcon } from 'lucide-react';
import MobileNavigation from '../components/MobileNavigation';

const EDITABLE_FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'job_title',
  'bio',
  'emergency_contact_name',
  'emergency_contact_phone',
];

function initialFormFromUser(user) {
  const out = {};
  EDITABLE_FIELDS.forEach((k) => {
    out[k] = user?.[k] ?? '';
  });
  return out;
}

function Profile() {
  const { user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [company, setCompany] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit mode for personal info
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initialFormFromUser(user));
  const [saving, setSaving] = useState(false);

  // Avatar
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Re-hydrate form whenever the user object changes (initial load,
  // after refreshProfile, after avatar change).
  useEffect(() => {
    if (!editing) setForm(initialFormFromUser(user));
  }, [user, editing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCompanyLoading(true);
        setError(null);
        const data = await companiesService.getCurrentCompany();
        if (!cancelled) setCompany(data);
      } catch (err) {
        console.error('Failed to load company:', err);
        if (!cancelled) setError('Could not load company info.');
      } finally {
        if (!cancelled) setCompanyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleField = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleCancelEdit = () => {
    setForm(initialFormFromUser(user));
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    try {
      setSaving(true);
      setError(null);
      // Send only the editable fields — server ignores unknown keys but this
      // keeps the payload tight and prevents accidental drift if other fields
      // sneak into local state.
      const payload = EDITABLE_FIELDS.reduce((acc, k) => {
        acc[k] = form[k] === '' ? null : form[k];
        return acc;
      }, {});
      await usersService.updateMyProfile(payload);
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      console.error('Profile save failed:', err);
      setError(err?.response?.data?.detail || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarPick = () => {
    if (avatarBusy) return;
    fileRef.current?.click();
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file again re-fires
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Profile photo must be an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be 5 MB or smaller.');
      return;
    }
    try {
      setAvatarBusy(true);
      setError(null);
      await usersService.uploadMyAvatar(file);
      await refreshProfile();
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError(err?.response?.data?.detail || 'Failed to upload photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (!user?.avatar_url || avatarBusy) return;
    if (!window.confirm('Remove your profile photo?')) return;
    try {
      setAvatarBusy(true);
      setError(null);
      await usersService.deleteMyAvatar();
      await refreshProfile();
    } catch (err) {
      console.error('Avatar delete failed:', err);
      setError(err?.response?.data?.detail || 'Failed to remove photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const initials = (() => {
    const f = (user?.first_name || '').trim();
    const l = (user?.last_name || '').trim();
    if (f || l) return `${f[0] || ''}${l[0] || ''}`.toUpperCase();
    return (user?.email || '?')[0].toUpperCase();
  })();

  const fullName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.first_name || user?.username || '—';

  return (
    <div>
      <div className="profile-container">
        <div className="profile-header">
          <h1>Profile</h1>
        </div>

        {error && <div className="profile-error">{error}</div>}

        <div className="profile-content">

          {/* Identity card — avatar + name + role */}
          <div className="profile-section profile-identity">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar" onClick={handleAvatarPick} title="Change profile photo">
                {avatarBusy ? (
                  <Loader2 size={28} className="profile-spin" />
                ) : user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Profile" />
                ) : (
                  <span className="profile-avatar-initials">{initials}</span>
                )}
                <span className="profile-avatar-overlay">
                  <Camera size={18} />
                </span>
              </div>
              {user?.avatar_url && (
                <button
                  type="button"
                  className="profile-avatar-remove"
                  onClick={handleAvatarDelete}
                  disabled={avatarBusy}
                  title="Remove photo"
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>

            <div className="profile-identity-text">
              <h2>{fullName}</h2>
              <div className="profile-identity-meta">
                <span className="profile-pill">{user?.role || 'User'}</span>
                {user?.is_active && <span className="profile-pill profile-pill--ok">Active</span>}
                {user?.is_verified
                  ? <span className="profile-pill profile-pill--ok">Verified</span>
                  : <span className="profile-pill profile-pill--warn">Email unverified</span>}
              </div>
              <div className="profile-identity-email">{user?.email}</div>
            </div>
          </div>

          {/* Personal details — edit-aware */}
          <div className="profile-section">
            <div className="profile-section-head">
              <h2>Personal Details</h2>
              {!editing ? (
                <button className="profile-btn profile-btn-ghost" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Edit
                </button>
              ) : (
                <div className="profile-edit-actions">
                  <button className="profile-btn profile-btn-ghost" onClick={handleCancelEdit} disabled={saving}>
                    <X size={14} /> Cancel
                  </button>
                  <button className="profile-btn profile-btn-primary" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? <Loader2 size={14} className="profile-spin" /> : <Check size={14} />} Save
                  </button>
                </div>
              )}
            </div>

            <div className="profile-card">
              <ProfileRow label="First name" editing={editing} value={form.first_name}
                onChange={handleField('first_name')} />
              <ProfileRow label="Last name" editing={editing} value={form.last_name}
                onChange={handleField('last_name')} />
              <ProfileRow label="Phone" editing={editing} value={form.phone}
                onChange={handleField('phone')} placeholder="+64 ..." />
              <ProfileRow label="Job title" editing={editing} value={form.job_title}
                onChange={handleField('job_title')} placeholder="e.g. Vineyard Manager" />
              <ProfileRow label="Bio" editing={editing} value={form.bio}
                onChange={handleField('bio')} placeholder="A short blurb about you (optional)" multiline />
              <ProfileRow label="Emergency contact name" editing={editing}
                value={form.emergency_contact_name} onChange={handleField('emergency_contact_name')} />
              <ProfileRow label="Emergency contact phone" editing={editing}
                value={form.emergency_contact_phone} onChange={handleField('emergency_contact_phone')} />
            </div>
          </div>

          {/* Account — read-only */}
          <div className="profile-section">
            <h2>Account</h2>
            <div className="profile-card">
              <ReadRow label="Email" value={user?.email} />
              <ReadRow label="Username" value={user?.username} />
              <ReadRow label="Role" value={user?.role || 'User'} />
              <ReadRow label="Last login"
                value={user?.last_login
                  ? new Date(user.last_login).toLocaleDateString('en-NZ', {
                      year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : 'Never'} />
              <ReadRow label="Member since"
                value={user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('en-NZ', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })
                  : 'Not available'} />
              <div className="profile-field">
                <label>Timesheet</label>
                <span>
                  <button className="profile-btn profile-btn-ghost" onClick={() => navigate('/timesheets')}>
                    Open My Timesheet
                  </button>
                </span>
              </div>
            </div>
          </div>

          {/* Company — read-only, no subscription/pricing */}
          {!companyLoading && company && (
            <div className="profile-section">
              <h2>Company</h2>
              <div className="profile-card">
                <ReadRow label="Name" value={company.name} />
                {company.address && <ReadRow label="Address" value={company.address} />}
                <ReadRow label="Total hectares"
                  value={company.total_hectares ? `${company.total_hectares} ha` : '0 ha'} />
                {company.company_number && (
                  <ReadRow label="Company number" value={company.company_number} />
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="profile-actions">
            <button className="profile-btn profile-btn-ghost"
              onClick={() => navigate('/change-password')}>
              Change Password
            </button>
            <button className="profile-btn profile-btn-danger" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <MobileNavigation />

      <style jsx>{`
        :global(body) {
          font-family: Calibri, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          color: #2F2F2F;
        }
        .profile-container {
          width: 100%;
          max-width: 960px;
          margin: 0 auto;
          padding: 28px;
        }
        .profile-header {
          margin-bottom: 24px;
          border-bottom: 2px solid #FDF6E3;
          padding-bottom: 8px;
        }
        .profile-header h1 {
          margin: 0;
          font-size: 20pt;
          font-weight: bold;
          color: #2F2F2F;
        }
        .profile-error {
          background: #FBE4DE;
          border: 1px solid #D1583B;
          color: #D1583B;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.9rem;
        }
        .profile-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .profile-section {
          background: #FFFFFF;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 6px rgba(47, 47, 47, 0.08);
          border: 1px solid rgba(91, 104, 48, 0.2);
        }
        .profile-section h2 {
          margin: 0 0 16px 0;
          font-size: 14pt;
          font-weight: bold;
          color: #D1583B;
        }
        .profile-section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .profile-section-head h2 {
          margin: 0;
        }
        .profile-edit-actions {
          display: flex;
          gap: 8px;
        }

        /* Identity */
        .profile-identity {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .profile-avatar-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .profile-avatar {
          width: 88px;
          height: 88px;
          border-radius: 50%;
          background: #5B6830;
          color: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          flex-shrink: 0;
          border: 2px solid rgba(91, 104, 48, 0.2);
        }
        .profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .profile-avatar-initials {
          font-size: 28px;
          font-weight: 600;
        }
        .profile-avatar-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .profile-avatar:hover .profile-avatar-overlay {
          opacity: 1;
        }
        .profile-spin {
          animation: profile-spin 0.9s linear infinite;
        }
        @keyframes profile-spin {
          to { transform: rotate(360deg); }
        }
        .profile-avatar-remove {
          background: none;
          border: none;
          color: #D1583B;
          font-size: 11px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
        }
        .profile-avatar-remove:hover { text-decoration: underline; }
        .profile-avatar-remove:disabled { opacity: 0.5; cursor: not-allowed; }

        .profile-identity-text { flex: 1; min-width: 0; }
        .profile-identity-text h2 {
          margin: 0 0 6px 0;
          font-size: 18pt;
          color: #2F2F2F;
        }
        .profile-identity-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 6px;
        }
        .profile-identity-email {
          color: #6b7280;
          font-size: 0.9rem;
        }

        .profile-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          background: #FDF6E3;
          color: #5B6830;
          text-transform: capitalize;
        }
        .profile-pill--ok {
          background: #E4F2DC;
          color: #5B6830;
        }
        .profile-pill--warn {
          background: #FBE4DE;
          color: #D1583B;
        }

        /* Cards / rows */
        .profile-card {
          background: #FDF6E3;
          border-radius: 10px;
          padding: 12px 16px;
        }
        .profile-field {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(91, 104, 48, 0.12);
        }
        .profile-field:last-child { border-bottom: none; }
        .profile-field > label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #2F2F2F;
          min-width: 180px;
          padding-top: 4px;
        }
        .profile-field-value {
          flex: 1;
          text-align: right;
          color: #2F2F2F;
          word-break: break-word;
        }
        .profile-field-value.empty {
          color: #9ca3af;
          font-style: italic;
        }
        .profile-input,
        .profile-textarea {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9rem;
          font-family: inherit;
          background: #FFFFFF;
        }
        .profile-input:focus,
        .profile-textarea:focus {
          outline: none;
          border-color: #5B6830;
          box-shadow: 0 0 0 2px rgba(91, 104, 48, 0.15);
        }
        .profile-textarea {
          min-height: 70px;
          resize: vertical;
        }

        /* Buttons */
        .profile-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s ease;
        }
        .profile-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .profile-btn-primary {
          background: #5B6830;
          color: #FFFFFF;
        }
        .profile-btn-primary:hover:not(:disabled) { background: #495425; }
        .profile-btn-ghost {
          background: #FFFFFF;
          color: #5B6830;
          border-color: rgba(91, 104, 48, 0.3);
        }
        .profile-btn-ghost:hover:not(:disabled) { background: #FDF6E3; }
        .profile-btn-danger {
          background: #D1583B;
          color: #FFFFFF;
        }
        .profile-btn-danger:hover:not(:disabled) { background: #B04A30; }

        .profile-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        @media (max-width: 640px) {
          .profile-container { padding: 16px; }
          .profile-identity { flex-direction: column; text-align: center; align-items: center; }
          .profile-identity-meta { justify-content: center; }
          .profile-field { flex-direction: column; align-items: stretch; }
          .profile-field > label { min-width: 0; }
          .profile-field-value { text-align: left; }
        }
      `}</style>
    </div>
  );
}

function ReadRow({ label, value }) {
  return (
    <div className="profile-field">
      <label>{label}</label>
      <span className={`profile-field-value ${value ? '' : 'empty'}`}>
        {value || 'Not provided'}
      </span>
    </div>
  );
}

function ProfileRow({ label, value, editing, onChange, placeholder, multiline }) {
  if (!editing) {
    return (
      <div className="profile-field">
        <label>{label}</label>
        <span className={`profile-field-value ${value ? '' : 'empty'}`}>
          {value || 'Not provided'}
        </span>
      </div>
    );
  }
  return (
    <div className="profile-field">
      <label>{label}</label>
      {multiline ? (
        <textarea
          className="profile-textarea"
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder}
        />
      ) : (
        <input
          className="profile-input"
          type="text"
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export default Profile;
