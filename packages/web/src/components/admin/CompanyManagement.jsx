// src/components/admin/CompanyManagement.jsx - Updated for subscription system
import { useState, useEffect } from 'react';
import {adminService, subscriptionService} from '@vineyard/shared';

function CompanyManagement() {
  const [companies, setCompanies] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    subscription_id: '',
    skip: 0,
    limit: 20
  });
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both companies and available subscriptions
      const [companiesData, subscriptionsData] = await Promise.all([
        adminService.getAllCompanies(filters),
        subscriptionService.getAllSubscriptions()
      ]);
      
      // Ensure we have arrays
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
      setSubscriptions(Array.isArray(subscriptionsData) ? subscriptionsData : []);
      
      console.log('Fetched data:', { 
        companies: companiesData, 
        subscriptions: subscriptionsData 
      });
      
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(`Failed to load data: ${err.message}`);
      // Set empty arrays as fallback
      setCompanies([]);
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getAllCompanies(filters);
      setCompanies(Array.isArray(data) ? data : []);
      console.log('Fetched companies:', data);
    } catch (err) {
      console.error('Error fetching companies:', err);
      setError(`Failed to load companies: ${err.message}`);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      skip: 0 // Reset to first page when filtering
    }));
  };

  const handlePageChange = (direction) => {
    setFilters(prev => ({
      ...prev,
      skip: direction === 'next' 
        ? prev.skip + prev.limit 
        : Math.max(0, prev.skip - prev.limit)
    }));
  };

  const handleUpdateSubscription = async (companyId, subscriptionId, totalHectares = null, trialDays = null) => {
    try {
      await adminService.updateCompanySubscription(companyId, subscriptionId, totalHectares, trialDays);
      fetchCompanies(); // Refresh the list
      setShowUpdateModal(false);
      setSelectedCompany(null);
    } catch (err) {
      console.error('Error updating subscription:', err);
      alert('Failed to update subscription');
    }
  };

  const handleToggleCompanyStatus = async (company) => {
    try {
      if (company.is_active) {
        await adminService.deactivateCompany(company.id);
      } else {
        await adminService.reactivateCompany(company.id);
      }
      fetchCompanies(); // Refresh the list
    } catch (err) {
      console.error('Error toggling company status:', err);
      alert('Failed to update company status');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatPrice = (amount) => {
    if (amount === undefined || amount === null) return '$0.00';
    return `$${Number(amount).toFixed(2)}`;
  };

  const getStatusBadge = (company) => {
    if (!company.is_active) return { text: 'Inactive', class: 'inactive' };
    if (company.subscription_status === 'trialing') return { text: 'Trial', class: 'trial' };
    if (company.subscription_status === 'active') return { text: 'Active', class: 'active' };
    if (company.subscription_status === 'past_due') return { text: 'Past Due', class: 'past-due' };
    if (company.subscription_status === 'cancelled') return { text: 'Cancelled', class: 'cancelled' };
    return { text: company.subscription_status, class: 'unknown' };
  };

  const getSubscriptionName = (subscriptionId) => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    return subscription ? subscription.display_name : 'Unknown';
  };

  const getSubscriptionLimits = (subscriptionId) => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    if (!subscription) return { max_users: 0, max_storage_gb: 0 };
    return {
      max_users: subscription.max_users,
      max_storage_gb: subscription.max_storage_gb
    };
  };

  if (loading && companies.length === 0) {
    return <div className="loading">Loading companies...</div>;
  }

  return (
    <div className="company-management">
      <h3>📊 Company Management</h3>
      <p>Manage all customer companies and subscriptions</p>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label htmlFor="search">Search Companies</label>
          <input
            type="text"
            id="search"
            placeholder="Search by company name..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="subscription_id">Subscription Plan</label>
          <select
            id="subscription_id"
            value={filters.subscription_id}
            onChange={(e) => handleFilterChange('subscription_id', e.target.value)}
          >
            <option value="">All Plans</option>
            {Array.isArray(subscriptions) && subscriptions.map(sub => (
              <option key={sub.id} value={sub.id}>{sub.display_name}</option>
            ))}
          </select>
        </div>

        <button onClick={fetchCompanies} className="refresh-button">
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {/* Companies Table */}
      <div className="companies-table-container">
        <table className="companies-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Subscription</th>
              <th>Status</th>
              <th>Users</th>
              <th>Hectares</th>
              <th>Monthly Cost</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const status = getStatusBadge(company);
              const limits = getSubscriptionLimits(company.subscription_id);
              return (
                <tr key={company.id}>
                  <td>
                    <div className="company-info">
                      <div className="company-name">{company.name}</div>
                      <div className="company-details">
                        ID: {company.id} | Slug: {company.slug}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="subscription-info">
                      <span className={`tier-badge subscription-${company.subscription_id}`}>
                        {getSubscriptionName(company.subscription_id)}
                      </span>
                      {company.is_trial && (
                        <div className="trial-info">
                          Trial ends: {formatDate(company.trial_end)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${status.class}`}>
                      {status.text}
                    </span>
                  </td>
                  <td>
                    <div className="user-count">
                      {company.user_count || 0} / {limits.max_users === -1 ? '∞' : limits.max_users}
                    </div>
                  </td>
                  <td>
                    <div className="hectares-info">
                      {company.total_hectares || 0} ha
                    </div>
                  </td>
                  <td>
                    <div className="cost-info">
                      {formatPrice(company.current_monthly_amount)}
                    </div>
                  </td>
                  <td>{formatDate(company.created_at)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        onClick={() => {
                          setSelectedCompany(company);
                          setShowUpdateModal(true);
                        }}
                        className="edit-button"
                        title="Update Subscription"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleToggleCompanyStatus(company)}
                        className={`toggle-button ${company.is_active ? 'deactivate' : 'activate'}`}
                        title={company.is_active ? 'Deactivate Company' : 'Activate Company'}
                      >
                        {company.is_active ? '❌' : '✅'}
                      </button>
                      <button
                        onClick={() => alert(`View details for ${company.name}`)}
                        className="view-button"
                        title="View Details"
                      >
                        👁️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          onClick={() => handlePageChange('prev')}
          disabled={filters.skip === 0}
          className="page-button"
        >
          ← Previous
        </button>
        <span className="page-info">
          Showing {filters.skip + 1} - {Math.min(filters.skip + filters.limit, filters.skip + companies.length)}
        </span>
        <button
          onClick={() => handlePageChange('next')}
          disabled={companies.length < filters.limit}
          className="page-button"
        >
          Next →
        </button>
      </div>

      {/* Update Subscription Modal */}
      {showUpdateModal && selectedCompany && (
        <SubscriptionUpdateModal
          company={selectedCompany}
          subscriptions={subscriptions}
          onUpdate={handleUpdateSubscription}
          onClose={() => {
            setShowUpdateModal(false);
            setSelectedCompany(null);
          }}
        />
      )}

            <style jsx>{`
        .company-management {
          max-width: 1200px;
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
          min-width: 200px;
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

        .companies-table-container {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }

        .companies-table {
          width: 100%;
          border-collapse: collapse;
        }

        .companies-table th {
          background: #f8fafc;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 2px solid #e5e7eb;
        }

        .companies-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
        }

        .companies-table tr:hover {
          background: #f9fafb;
        }

        .company-info .company-name {
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 4px;
        }

        .company-info .company-details {
          font-size: 0.8rem;
          color: #64748b;
          font-family: monospace;
        }

        .subscription-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .tier-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
          text-align: center;
          width: fit-content;
        }

        .tier-badge.free {
          background: #f3f4f6;
          color: #374151;
        }

        .tier-badge.basic {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .tier-badge.premium {
          background: #fef3c7;
          color: #92400e;
        }

        .tier-badge.enterprise {
          background: #f3e8ff;
          color: #6b21a8;
        }

        .trial-info {
          font-size: 0.75rem;
          color: #ea580c;
          font-weight: 500;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .status-badge.active {
          background: #dcfce7;
          color: #166534;
        }

        .status-badge.trial {
          background: #fff7ed;
          color: #ea580c;
        }

        .status-badge.inactive,
        .status-badge.cancelled {
          background: #fef2f2;
          color: #991b1b;
        }

        .status-badge.past-due {
          background: #fef3c7;
          color: #92400e;
        }

        .user-count {
          font-family: monospace;
          font-size: 0.9rem;
          color: #374151;
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

        .toggle-button.deactivate {
          background: #fef2f2;
          color: #991b1b;
        }

        .toggle-button.activate {
          background: #dcfce7;
          color: #166534;
        }

        .view-button {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .view-button:hover {
          background: #dbeafe;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0;
        }

        .page-button {
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .page-button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .page-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .page-info {
          color: #64748b;
          font-size: 0.9rem;
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

          .companies-table-container {
            overflow-x: auto;
          }

          .companies-table {
            min-width: 600px;
          }
        }
      `}</style>
    </div>
  );
}

// Updated Subscription Update Modal Component
function SubscriptionUpdateModal({ company, subscriptions, onUpdate, onClose }) {
  const [subscriptionId, setSubscriptionId] = useState(company.subscription_id);
  const [totalHectares, setTotalHectares] = useState(company.total_hectares || 0);
  const [startTrial, setStartTrial] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [loading, setLoading] = useState(false);

  const selectedSubscription = subscriptions.find(s => s.id === parseInt(subscriptionId));

  const calculatePrice = (subscription, hectares) => {
    if (!subscription) return 0;
    const base = parseFloat(subscription.base_price_monthly) || 0;
    const perHa = parseFloat(subscription.price_per_ha_monthly) || 0;
    return base + (perHa * parseFloat(hectares));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await onUpdate(
        company.id, 
        parseInt(subscriptionId),
        parseFloat(totalHectares),
        startTrial ? trialDays : null
      );
    } catch (error) {
      console.error('Error updating subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Update Subscription - {company.name}</h3>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Subscription Plan</label>
              <select
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                required
              >
                {subscriptions.map(sub => (
                  <option key={sub.id} value={sub.id}>{sub.display_name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Total Hectares</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={totalHectares}
                onChange={(e) => setTotalHectares(e.target.value)}
                placeholder="0.0"
              />
            </div>

            {selectedSubscription && (
              <div className="pricing-preview">
                <h4>Pricing Preview</h4>
                <div className="pricing-breakdown">
                  <div>Base: ${selectedSubscription.base_price_monthly}/month</div>
                  <div>Per hectare: ${selectedSubscription.price_per_ha_monthly}/ha/month</div>
                  <div>Total: ${calculatePrice(selectedSubscription, totalHectares).toFixed(2)}/month</div>
                </div>
              </div>
            )}

            {selectedSubscription?.trial_enabled && (
              <>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={startTrial}
                      onChange={(e) => setStartTrial(e.target.checked)}
                    />
                    Start new trial period
                  </label>
                </div>

                {startTrial && (
                  <div className="form-group">
                    <label>Trial Duration (days)</label>
                    <input
                      type="number"
                      value={trialDays}
                      onChange={(e) => setTrialDays(parseInt(e.target.value))}
                      min="1"
                      max="90"
                      required
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="update-button">
              {loading ? 'Updating...' : 'Update Subscription'}
            </button>
          </div>
        </form>

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

          .form-group {
            margin-bottom: 16px;
          }

          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            color: #374151;
          }

          .form-group input,
          .form-group select {
            width: 100%;
            padding: 8px 12px;
            border: 2px solid #e5e7eb;
            border-radius: 6px;
            font-size: 0.9rem;
          }

          .form-group input:focus,
          .form-group select:focus {
            outline: none;
            border-color: #3b82f6;
          }

          .checkbox-label {
            display: flex !important;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }

          .checkbox-label input {
            width: auto !important;
            margin: 0;
          }

          .pricing-preview {
            background: #f8fafc;
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 16px;
          }

          .pricing-preview h4 {
            margin: 0 0 8px 0;
            color: #374151;
            font-size: 0.9rem;
          }

          .pricing-breakdown {
            font-size: 0.8rem;
            color: #64748b;
          }

          .pricing-breakdown div {
            margin-bottom: 2px;
          }

          .pricing-breakdown div:last-child {
            font-weight: 600;
            color: #374151;
            border-top: 1px solid #e5e7eb;
            padding-top: 4px;
            margin-top: 4px;
          }

          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 20px;
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

export default CompanyManagement;