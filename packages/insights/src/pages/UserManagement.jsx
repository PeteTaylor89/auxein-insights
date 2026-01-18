// src/pages/UserManagement.jsx - User Management Page
import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Download, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Check,
  X,
  Mail,
  Building,
  MapPin,
  RefreshCw,
  Eye
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

// Filter Panel Component
const FilterPanel = ({ filters, onFilterChange, onClear }) => {
  const userTypes = [
    { value: '', label: 'All Types' },
    { value: 'wine_company_owner', label: 'Wine Company Owner' },
    { value: 'wine_company_employee', label: 'Wine Company Employee' },
    { value: 'consultant', label: 'Consultant' },
    { value: 'wine_enthusiast', label: 'Wine Enthusiast' },
    { value: 'researcher', label: 'Researcher' },
  ];

  const regions = [
    { value: '', label: 'All Regions' },
    { value: 'marlborough', label: 'Marlborough' },
    { value: 'hawkes_bay', label: "Hawke's Bay" },
    { value: 'central_otago', label: 'Central Otago' },
    { value: 'waipara', label: 'Waipara' },
    { value: 'martinborough', label: 'Martinborough' },
    { value: 'nelson', label: 'Nelson' },
  ];

  return (
    <div className="filters-panel">
      <div className="filters-header">
        <h3>
          <Filter size={16} />
          Filters
        </h3>
        <button onClick={onClear} className="filters-clear">Clear all</button>
      </div>
      
      <div className="filters-grid">
        <div className="filter-group">
          <label>User Type</label>
          <select
            value={filters.user_type || ''}
            onChange={(e) => onFilterChange('user_type', e.target.value || null)}
          >
            {userTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Region</label>
          <select
            value={filters.region_of_interest || ''}
            onChange={(e) => onFilterChange('region_of_interest', e.target.value || null)}
          >
            {regions.map((region) => (
              <option key={region.value} value={region.value}>{region.label}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Verified</label>
          <select
            value={filters.is_verified ?? ''}
            onChange={(e) => onFilterChange('is_verified', e.target.value === '' ? null : e.target.value === 'true')}
          >
            <option value="">All</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Status</label>
          <select
            value={filters.is_active ?? ''}
            onChange={(e) => onFilterChange('is_active', e.target.value === '' ? null : e.target.value === 'true')}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>
    </div>
  );
};

// User Table Component
const UserTable = ({ users, sortBy, sortOrder, onSort }) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatUserType = (type) => {
    if (!type) return '-';
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="card">
      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => onSort('email')}>
                User {sortBy === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>Type</th>
              <th>Region</th>
              <th>Status</th>
              <th className="sortable" onClick={() => onSort('login_count')}>
                Logins {sortBy === 'login_count' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => onSort('last_active')}>
                Last Active {sortBy === 'last_active' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th className="sortable" onClick={() => onSort('created_at')}>
                Joined {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div>
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-xs text-muted flex items-center gap-1">
                      <Mail size={12} />
                      {user.email}
                    </p>
                    {user.company_name && (
                      <p className="text-xs text-muted flex items-center gap-1">
                        <Building size={12} />
                        {user.company_name}
                      </p>
                    )}
                  </div>
                </td>
                <td>{formatUserType(user.user_type)}</td>
                <td>
                  {user.region_of_interest ? (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {formatUserType(user.region_of_interest)}
                    </span>
                  ) : '-'}
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span className={`badge ${user.is_verified ? 'badge-green' : 'badge-yellow'}`}>
                      {user.is_verified ? <><Check size={12} /> Verified</> : <><X size={12} /> Unverified</>}
                    </span>
                    {!user.is_active && (
                      <span className="badge badge-red">Inactive</span>
                    )}
                  </div>
                </td>
                <td>{user.login_count || 0}</td>
                <td>{formatDate(user.last_active)}</td>
                <td>{formatDate(user.created_at)}</td>
                <td>
                  <Link to={`/admin/users/${user.id}`} className="table-link">
                    <Eye size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Pagination Component
const Pagination = ({ page, totalPages, total, pageSize, onPageChange }) => (
  <div className="pagination">
    <p className="pagination-info">
      Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} of {total} users
    </p>
    <div className="pagination-controls">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="pagination-btn"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="pagination-text">Page {page} of {totalPages}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="pagination-btn"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
);

// Main Component
const UserManagement = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [exporting, setExporting] = useState(false);
  
  const filters = useMemo(() => ({
    search: searchParams.get('search') || '',
    user_type: searchParams.get('user_type') || null,
    region_of_interest: searchParams.get('region') || null,
    is_verified: searchParams.get('verified') === 'true' ? true : 
                  searchParams.get('verified') === 'false' ? false : null,
    is_active: searchParams.get('active') === 'true' ? true : 
                searchParams.get('active') === 'false' ? false : null,
    page: parseInt(searchParams.get('page') || '1'),
    page_size: parseInt(searchParams.get('size') || '25'),
    sort_by: searchParams.get('sort') || 'created_at',
    sort_order: searchParams.get('order') || 'desc',
  }), [searchParams]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = { ...filters };
      Object.keys(params).forEach(key => {
        if (params[key] === null || params[key] === '') delete params[key];
      });
      
      const response = await adminService.users.listUsers(params);
      setUsers(response.users);
      setTotal(response.total);
      setTotalPages(response.total_pages);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [searchParams]);

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || value === undefined) {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });
    setSearchParams(newParams);
  };

  const handleFilterChange = (key, value) => {
    const paramKey = key === 'region_of_interest' ? 'region' : 
                     key === 'is_verified' ? 'verified' :
                     key === 'is_active' ? 'active' : key;
    updateParams({ [paramKey]: value, page: 1 });
  };

  const handleClearFilters = () => setSearchParams(new URLSearchParams());

  const handleSearch = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateParams({ search: formData.get('search'), page: 1 });
  };

  const handleSort = (key) => {
    const newOrder = filters.sort_by === key && filters.sort_order === 'desc' ? 'asc' : 'desc';
    updateParams({ sort: key, order: newOrder, page: 1 });
  };

  const handlePageChange = (newPage) => updateParams({ page: newPage });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...filters };
      delete params.page;
      delete params.page_size;
      await adminService.users.exportUsers(params);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export users.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout title="User Management" subtitle={`${total} total users`}>
      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={fetchUsers} className="btn btn-secondary">
          <RefreshCw size={16} className={loading ? 'loading-spinner' : ''} />
          Refresh
        </button>
        <button onClick={handleExport} disabled={exporting} className="btn btn-primary">
          <Download size={16} />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} style={{ marginBottom: '1rem' }}>
        <div className="search-input-wrapper">
          <Search size={20} />
          <input
            type="text"
            name="search"
            defaultValue={filters.search}
            placeholder="Search by email, name, or company..."
            className="form-input"
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
      </form>

      {/* Filters */}
      <FilterPanel
        filters={filters}
        onFilterChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      {/* Error */}
      {error && (
        <div className="error-container">
          <p className="error-text">{error}</p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"><RefreshCw size={32} /></div>
        </div>
      ) : users.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p className="empty-state-text">No users found matching your filters.</p>
            <button onClick={handleClearFilters} className="section-link mt-2">
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <>
          <UserTable
            users={users}
            sortBy={filters.sort_by}
            sortOrder={filters.sort_order}
            onSort={handleSort}
          />
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            total={total}
            pageSize={filters.page_size}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </AdminLayout>
  );
};

export default UserManagement;