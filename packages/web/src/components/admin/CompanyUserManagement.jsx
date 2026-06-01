// src/components/admin/CompanyUserManagement.jsx
import { useState, useEffect } from 'react';
import {adminService} from '@vineyard/shared';

// Small avatar pill shown beside each user in the team list. Renders the
// uploaded avatar when present, otherwise initials on an olive disc.
function UserAvatar({ user }) {
  const first = user?.first_name?.[0] || '';
  const last = user?.last_name?.[0] || '';
  const initials = (first + last) || (user?.username?.[0] || '?').toUpperCase();
  const size = 36;
  const baseStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    overflow: 'hidden',
  };
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={initials}
        style={baseStyle}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return <span style={baseStyle}>{initials.toUpperCase()}</span>;
}

function CompanyUserManagement({ companyId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: '',
    company_id: companyId, // Add company_id to filters
    limit: 100
  });
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    // Update company_id in filters when prop changes
    setFilters(prev => ({
      ...prev,
      company_id: companyId
    }));
  }, [companyId]);

  useEffect(() => {
    fetchUsers();
  }, [filters]);

  const fetchUsers = async () => {
    if (!companyId) return;
    
    try {
      setLoading(true);
      // Use the same pattern as UserManagement - adminService.getAllUsers with filters
      const data = await adminService.getAllUsers(filters);
      setUsers(data || []);
    } catch (err) {
      setError('Failed to load team members');
      console.error('Error fetching company users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleToggleUserStatus = async (user) => {
    try {
      if (user.is_suspended) {
        await adminService.unsuspendUser(user.id);
      } else {
        await adminService.suspendUser(user.id);
      }
      fetchUsers(); // Refresh the list
    } catch (err) {
      console.error('Error toggling user status:', err);
      alert('Failed to update user status');
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      await adminService.updateUserRole(userId, newRole);
      fetchUsers(); // Refresh the list
      setShowUserModal(false);
      setSelectedUser(null);
    } catch (err) {
      console.error('Error updating user role:', err);
      alert('Failed to update user role');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getUserStatusBadge = (user) => {
    if (!user.is_active) return { text: 'Inactive', class: 'inactive' };
    if (user.is_suspended) return { text: 'Suspended', class: 'suspended' };
    if (!user.is_verified) return { text: 'Unverified', class: 'unverified' };
    return { text: 'Active', class: 'active' };
  };

  const getRoleBadge = (role) => {
    const roleConfig = {
      owner: { text: 'Owner', class: 'owner' },
      admin: { text: 'Admin', class: 'admin' },
      manager: { text: 'Manager', class: 'manager' },
      user: { text: 'User', class: 'user' },
      viewer: { text: 'Viewer', class: 'viewer' }
    };
    return roleConfig[role] || { text: role, class: 'unknown' };
  };

  if (loading && users.length === 0) {
    return <div className="loading">Loading team members...</div>;
  }

  return (
    <div className="company-user-management">
      <h3>Team Management</h3>
      <p>Manage your company's team members</p>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label htmlFor="search">Search Team Members</label>
          <input
            type="text"
            id="search"
            placeholder="Search by name, email, username..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="role">Role</label>
          <select
            id="role"
            value={filters.role}
            onChange={(e) => handleFilterChange('role', e.target.value)}
          >
            <option value="">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="user">User</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>

        <button onClick={fetchUsers} className="refresh-button">
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {/* Users Table */}
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Member Since</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const status = getUserStatusBadge(user);
              const roleBadge = getRoleBadge(user.role);
              
              return (
                <tr key={user.id}>
                  <td>
                    <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <UserAvatar user={user} />
                      <div>
                        <div className="user-name">
                          {user.first_name && user.last_name
                            ? `${user.first_name} ${user.last_name}`
                            : user.username
                          }
                        </div>
                        <div className="user-details">
                          {user.email}
                          <br />
                          @{user.username} | ID: {user.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge ${roleBadge.class}`}>
                      {roleBadge.text}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${status.class}`}>
                      {status.text}
                    </span>
                  </td>
                  <td>
                    <div className="login-info">
                      <div className="last-login">
                        {formatDate(user.last_login)}
                      </div>
                      <div className="login-count">
                        {user.login_count} logins
                      </div>
                    </div>
                  </td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserModal(true);
                        }}
                        className="edit-button"
                        title="Edit User"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleToggleUserStatus(user)}
                        className={`toggle-button ${user.is_suspended ? 'unsuspend' : 'suspend'}`}
                        title={user.is_suspended ? 'Unsuspend User' : 'Suspend User'}
                      >
                        {user.is_suspended ? '✅' : '❌'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {users.length === 0 && !loading && (
        <div className="no-users">
          No team members found. {filters.search || filters.role || filters.status ? 'Try adjusting your filters.' : 'Start by inviting team members.'}
        </div>
      )}

      {/* User Edit Modal */}
      {showUserModal && selectedUser && (
        <CompanyUserEditModal
          user={selectedUser}
          onUpdateRole={handleUpdateUserRole}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
          }}
        />
      )}

      <style jsx>{`
        .company-user-management {
          max-width: 1400px;
        }

        .filters {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          padding: 20px;
          background: var(--color-surface-warm);
          border-radius: var(--radius-md);
          align-items: end;
          flex-wrap: wrap;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          min-width: 180px;
        }

        .filter-group label {
          margin-bottom: 4px;
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--color-text);
        }

        .filter-group input,
        .filter-group select {
          padding: 8px 12px;
          border: 2px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
        }

        .filter-group input:focus,
        .filter-group select:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        .refresh-button {
          padding: 8px 16px;
          background: var(--color-primary);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-weight: 500;
        }

        .refresh-button:hover {
          background: var(--color-primary-hover);
        }

        .users-table-container {
          background: white;
          border-radius: var(--radius-md);
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
        }

        .users-table th {
          background: var(--color-surface-warm);
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: var(--color-text);
          border-bottom: 2px solid var(--color-border);
        }

        .users-table td {
          padding: 12px;
          border-bottom: 1px solid var(--color-border);
          vertical-align: top;
        }

        .users-table tr:hover {
          background: var(--color-surface-warm);
        }

        .user-info .user-name {
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 4px;
        }

        .user-info .user-details {
          font-size: 0.8rem;
          color: #64748b;
          line-height: 1.4;
        }

        .role-badge, .status-badge {
          padding: 4px 8px;
          border-radius: var(--radius-lg);
          font-size: 0.8rem;
          font-weight: 600;
        }

        .role-badge.owner {
          background: #f3e8ff;
          color: #6b21a8;
        }

        .role-badge.admin {
          background: #ddd6fe;
          color: #5b21b6;
        }

        .role-badge.manager {
          background: var(--color-warning-bg);
          color: var(--color-warning-text);
        }

        .role-badge.user {
          background: var(--color-info-bg);
          color: var(--color-info-text);
        }

        .role-badge.viewer {
          background: var(--color-surface-warm);
          color: var(--color-text);
        }

        .status-badge.active {
          background: var(--color-success-bg);
          color: var(--color-success-text);
        }

        .status-badge.suspended,
        .status-badge.inactive {
          background: var(--color-danger-bg);
          color: var(--color-danger-text);
        }

        .status-badge.unverified {
          background: var(--color-warning-bg);
          color: var(--color-warning-text);
        }

        .login-info .last-login {
          font-size: 0.9rem;
          color: var(--color-text);
        }

        .login-info .login-count {
          font-size: 0.75rem;
          color: #64748b;
        }

        .action-buttons {
          display: flex;
          gap: 4px;
        }

        .action-buttons button {
          padding: 4px 8px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.2s ease;
        }

        .edit-button {
          background: var(--color-surface-warm);
          color: var(--color-text);
        }

        .edit-button:hover {
          background: var(--color-border);
        }

        .toggle-button.suspend {
          background: var(--color-danger-bg);
          color: var(--color-danger-text);
        }

        .toggle-button.unsuspend {
          background: var(--color-success-bg);
          color: var(--color-success-text);
        }

        .no-users {
          text-align: center;
          padding: 40px;
          color: #64748b;
          background: var(--color-surface-warm);
          border-radius: var(--radius-md);
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }

        .error-message {
          background: var(--color-danger-bg);
          color: var(--color-danger-text);
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          margin-bottom: 16px;
          border: 1px solid var(--color-danger-bg);
        }

        @media (max-width: 768px) {
          .filters {
            flex-direction: column;
          }

          .filter-group {
            min-width: auto;
            width: 100%;
          }

          .users-table-container {
            overflow-x: auto;
          }

          .users-table {
            min-width: 600px;
          }
        }
      `}</style>
    </div>
  );
}

// Company User Edit Modal Component
function CompanyUserEditModal({ user, onUpdateRole, onClose }) {
  const [role, setRole] = useState(user.role);
  const [loading, setLoading] = useState(false);

  const roles = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'user', label: 'User' },
    { value: 'manager', label: 'Manager' },
    { value: 'admin', label: 'Admin' },
    { value: 'owner', label: 'Owner' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await onUpdateRole(user.id, role);
    } catch (error) {
      console.error('Error updating role:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Team Member - {user.username}</h3>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <div className="modal-body">
          <div className="user-summary">
            <p><strong>Name:</strong> {user.first_name} {user.last_name}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Status:</strong> {user.is_active ? 'Active' : 'Inactive'}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
              >
                {roles.map(roleOption => (
                  <option key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={onClose} className="cancel-button">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="update-button">
                {loading ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </form>
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .modal-content {
            background: white;
            border-radius: var(--radius-md);
            width: 90%;
            max-width: 500px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid var(--color-border);
          }

          .modal-header h3 {
            margin: 0;
            color: #1e293b;
          }

          .close-button {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #64748b;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .close-button:hover {
            color: var(--color-text);
          }

          .modal-body {
            padding: 20px;
          }

          .user-summary {
            background: var(--color-surface-warm);
            padding: 16px;
            border-radius: var(--radius-sm);
            margin-bottom: 20px;
          }

          .user-summary p {
            margin: 0 0 8px 0;
            font-size: 0.9rem;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            color: var(--color-text);
          }

          .form-group select {
            width: 100%;
            padding: 8px 12px;
            border: 2px solid var(--color-border);
            border-radius: var(--radius-sm);
            font-size: 0.9rem;
          }

          .form-group select:focus {
            outline: none;
            border-color: var(--color-primary);
          }

          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding-top: 20px;
            border-top: 1px solid var(--color-border);
          }

          .cancel-button {
            padding: 8px 16px;
            background: var(--color-surface-warm);
            color: var(--color-text);
            border: none;
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-weight: 500;
          }

          .cancel-button:hover {
            background: var(--color-border);
          }

          .update-button {
            padding: 8px 16px;
            background: var(--color-primary);
            color: white;
            border: none;
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-weight: 500;
          }

          .update-button:hover:not(:disabled) {
            background: var(--color-primary-hover);
          }

          .update-button:disabled {
            background: var(--color-text-muted);
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  );
}

export default CompanyUserManagement;