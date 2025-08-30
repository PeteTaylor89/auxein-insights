// src/components/admin/CompanyUserManagement.jsx
import { useState, useEffect } from 'react';
import {adminService} from '@vineyard/shared';

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
      <h3>👥 Team Management</h3>
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
                    <div className="user-info">
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
          background: #f8fafc;
          border-radius: 8px;
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
          color: #374151;
        }

        .filter-group input,
        .filter-group select {
          padding: 8px 12px;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .filter-group input:focus,
        .filter-group select:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .refresh-button {
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .refresh-button:hover {
          background: #2563eb;
        }

        .users-table-container {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
        }

        .users-table th {
          background: #f8fafc;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 2px solid #e5e7eb;
        }

        .users-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
        }

        .users-table tr:hover {
          background: #f9fafb;
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
          border-radius: 12px;
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
          background: #fef3c7;
          color: #92400e;
        }

        .role-badge.user {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .role-badge.viewer {
          background: #f3f4f6;
          color: #374151;
        }

        .status-badge.active {
          background: #dcfce7;
          color: #166534;
        }

        .status-badge.suspended,
        .status-badge.inactive {
          background: #fef2f2;
          color: #991b1b;
        }

        .status-badge.unverified {
          background: #fef3c7;
          color: #92400e;
        }

        .login-info .last-login {
          font-size: 0.9rem;
          color: #374151;
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
          background: #f3f4f6;
          color: #374151;
        }

        .edit-button:hover {
          background: #e5e7eb;
        }

        .toggle-button.suspend {
          background: #fef2f2;
          color: #991b1b;
        }

        .toggle-button.unsuspend {
          background: #dcfce7;
          color: #166534;
        }

        .no-users {
          text-align: center;
          padding: 40px;
          color: #64748b;
          background: #f8fafc;
          border-radius: 8px;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }

        .error-message {
          background: #fef2f2;
          color: #991b1b;
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          border: 1px solid #fecaca;
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
            border-radius: 8px;
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
            border-bottom: 1px solid #e5e7eb;
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
            color: #374151;
          }

          .modal-body {
            padding: 20px;
          }

          .user-summary {
            background: #f8fafc;
            padding: 16px;
            border-radius: 6px;
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
            color: #374151;
          }

          .form-group select {
            width: 100%;
            padding: 8px 12px;
            border: 2px solid #e5e7eb;
            border-radius: 6px;
            font-size: 0.9rem;
          }

          .form-group select:focus {
            outline: none;
            border-color: #3b82f6;
          }

          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }

          .cancel-button {
            padding: 8px 16px;
            background: #f3f4f6;
            color: #374151;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
          }

          .cancel-button:hover {
            background: #e5e7eb;
          }

          .update-button {
            padding: 8px 16px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
          }

          .update-button:hover:not(:disabled) {
            background: #2563eb;
          }

          .update-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  );
}

export default CompanyUserManagement;