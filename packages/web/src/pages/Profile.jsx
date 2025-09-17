// src/pages/Profile.jsx - Updated with Company Admin Panel
import { useState, useEffect } from 'react';
import { useAuth } from '@vineyard/shared';
import {companiesService, subscriptionService, adminService, invitationService, trainingService, api} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import CompanyCreationForm from '../components/admin/CompanyCreationForm';
import CompanyManagement from '../components/admin/CompanyManagement';
import UserManagement from '../components/admin/UserManagement';
import CompanyUserManagement from '../components/admin/CompanyUserManagement';
import { useNavigate } from 'react-router-dom';
import InvitationForm from '../components/admin/InvitationForm';

function Profile() {
  const { user, logout } = useAuth();
  const [company, setCompany] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeAdminTab, setActiveAdminTab] = useState('create-company');
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [showInvitationForm, setShowInvitationForm] = useState(false);
  const [trainingAssignments, setTrainingAssignments] = useState([]);

  // Check if user is system admin (Pete from Auxein)
  const isSystemAdmin = user?.email === 'pete.taylor@auxein.co.nz' || 
                       (company?.name === 'Auxein' && user?.role === 'admin');
  
  // Check if user is company admin (admin/manager but not from Auxein)
  const isCompanyAdmin = (user?.role === 'admin' || user?.role === 'manager') && 
                        company?.name !== 'Auxein' && !isSystemAdmin;

  const fetchInvitations = async () => {
    try {
      const invitationsData = await invitationService.getInvitations();
      setInvitations(invitationsData);
    } catch (err) {
      console.error('Error fetching invitations:', err);
    }
  };

  const fetchTrainingAssignments = async () => {
    try {
      const assignmentsData = await trainingService.assignments.getAssignments({
        entity_type: 'user',
        entity_id: user?.id,
        status: null // Get both assigned and in_progress
      });
      // Filter for assigned and in_progress only
      const activeAssignments = assignmentsData.filter(assignment => 
        assignment.status === 'assigned' || assignment.status === 'in_progress'
      );
      setTrainingAssignments(activeAssignments);
    } catch (err) {
      console.error('Error fetching training assignments:', err);
    }
  };

  useEffect(() => {
    const fetchCompanyData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get company with subscription details
        const companyData = await companiesService.getCurrentCompany();
        console.log('Company data:', companyData);
        setCompany(companyData);
        
        // Try to get subscription pricing details
        let subscriptionData = null;
        
        try {
          const subscriptionPricing = await subscriptionService.getCurrentSubscriptionPricing();
          console.log('Subscription pricing data:', subscriptionPricing);
          subscriptionData = subscriptionPricing;
        } catch (err) {
          console.warn('Could not fetch subscription pricing:', err);
          
          // Try to get basic subscription data if company has subscription
          if (companyData.subscription) {
            console.log('Using basic subscription data from company');
            subscriptionData = companyData.subscription;
          } else {
            // Fallback: try to get subscription by ID from company
            try {
              console.log('Trying to fetch subscription by ID:', companyData.subscription_id);
              const basicSubscription = await subscriptionService.getSubscriptionById(companyData.subscription_id);
              console.log('Retrieved subscription by ID:', basicSubscription);
              subscriptionData = basicSubscription;
            } catch (subErr) {
              console.warn('Could not fetch subscription by ID:', subErr);
            }
          }
        }
        
        // If we have subscription data, calculate pricing if needed
        if (subscriptionData) {
          const hectares = parseFloat(companyData.total_hectares) || 0;
          
          // If we don't have calculated prices, compute them
          if (!subscriptionData.calculated_monthly_price) {
            const calculatedMonthly = parseFloat(subscriptionData.base_price_monthly || 0) + 
                                    (parseFloat(subscriptionData.price_per_ha_monthly || 0) * hectares);
            
            const calculatedYearly = subscriptionData.price_per_ha_yearly ? 
              (parseFloat(subscriptionData.base_price_monthly || 0) * 12) + 
              (parseFloat(subscriptionData.price_per_ha_yearly) * hectares) :
              calculatedMonthly * 12;
            
            subscriptionData = {
              ...subscriptionData,
              calculated_monthly_price: calculatedMonthly,
              calculated_yearly_price: calculatedYearly,
              hectares_used_for_calculation: hectares
            };
          }
          
          console.log('Final subscription data:', subscriptionData);
          setSubscription(subscriptionData);
        } else {
          console.warn('No subscription data available');
        }

        // Fetch company statistics
        const statsData = await companiesService.getCurrentCompanyStats();
        console.log('Stats data:', statsData);
        setStats(statsData);
        
        // If we still don't have subscription data, create a minimal one from stats
        if (!subscriptionData && statsData.subscription_name) {
          console.log('Creating minimal subscription from stats data');
          subscriptionData = {
            name: statsData.subscription_name,
            display_name: statsData.subscription_display_name,
            base_price_monthly: 0,
            price_per_ha_monthly: 0,
            price_per_ha_yearly: 0,
            calculated_monthly_price: 0,
            calculated_yearly_price: 0,
            hectares_used_for_calculation: parseFloat(companyData.total_hectares) || 0,
            currency: companyData.currency || 'USD',
            max_users: statsData.max_users,
            max_storage_gb: statsData.max_storage_gb,
            features: {
              enabled_features: statsData.enabled_features || []
            }
          };
          console.log('Minimal subscription from stats:', subscriptionData);
          setSubscription(subscriptionData);
        }
      } catch (err) {
        console.error('Error fetching company data:', err);
        setError('Failed to load company information');
      } finally {
        setLoading(false);
      }
      
      if (user?.role === 'admin' || user?.role === 'manager') {
        await fetchInvitations();
      }
      
      // Fetch training assignments for all users
      await fetchTrainingAssignments();
    };

    if (user) {
      fetchCompanyData();
    }
    
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const formatPrice = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '$0.00';
    return `$${Number(amount).toFixed(2)}`;
  };

  const formatSubscriptionName = (subscription) => {
    if (!subscription) return 'Unknown';
    return subscription.display_name || subscription.name;
  };

  // Helper function to safely get subscription values
  const getSubscriptionValue = (field, defaultValue = 0) => {
    if (!subscription) return defaultValue;
    const value = subscription[field];
    return value !== undefined && value !== null ? value : defaultValue;
  };

  if (loading) {
    return (
      <div>
        <div className="profile-container">
          <div className="loading-message">Loading profile...</div>
        </div>
        <MobileNavigation />
      </div>
    );
  }

  return (
    <div>      
      <div className="profile-container">
        <div className="profile-header">
          <h1>Profile</h1>
          {isSystemAdmin && (
            <div className="admin-badge">
              System Administrator
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="profile-content">
          {/* System Admin Panel */}
          {isSystemAdmin && (
            <div className="admin-panel">
              <h2>System Administration</h2>
              
              <div className="admin-tabs">
                <button 
                  className={`tab-button ${activeAdminTab === 'create-company' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('create-company')}
                >
                  Create Company
                </button>
                <button 
                  className={`tab-button ${activeAdminTab === 'manage-companies' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('manage-companies')}
                >
                  Manage Companies
                </button>
                <button 
                  className={`tab-button ${activeAdminTab === 'user-management' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('user-management')}
                >
                  User Management
                </button>
              </div>

              <div className="admin-content">
                {activeAdminTab === 'create-company' && <CompanyCreationForm />}
                {activeAdminTab === 'manage-companies' && <CompanyManagement />}
                {activeAdminTab === 'user-management' && <UserManagement />}
              </div>
            </div>
          )}

          {/* Company Admin Panel */}
          {isCompanyAdmin && (
            <div className="admin-panel">
              <h2>Company Administration</h2>
              
              <div className="admin-tabs">
                <button 
                  className={`tab-button ${activeAdminTab === 'company-users' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('company-users')}
                >
                  👥 Manage Team
                </button>
                <button 
                  className={`tab-button ${activeAdminTab === 'invite-users' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('invite-users')}
                >
                  ✉️ Invite Members
                </button>
              </div>

              <div className="admin-content">
                {activeAdminTab === 'company-users' && <CompanyUserManagement companyId={user?.company_id} />}
                {activeAdminTab === 'invite-users' && (
                  <InvitationForm 
                    onInvitationSent={() => {
                      fetchInvitations();
                    }}
                    companyStats={stats}
                  />
                )}
              </div>
            </div>
          )}

          {/* Team Management Section - Only for non-admin users who can manage */}
          {!isSystemAdmin && !isCompanyAdmin && (user?.role === 'admin' || user?.role === 'manager') && (
            <div className="profile-section">
              <div className="section-header">
                <h2>Team Management</h2>
                <button 
                  className={`toggle-form-button ${showInvitationForm ? 'active' : ''}`}
                  onClick={() => setShowInvitationForm(!showInvitationForm)}
                >
                  {showInvitationForm ? '✕ Cancel' : '+ Invite Member'}
                </button>
              </div>
              
              {showInvitationForm && (
                <InvitationForm 
                  onInvitationSent={() => {
                    setShowInvitationForm(false);
                    fetchInvitations();
                  }}
                  companyStats={stats}
                />
              )}
              
              {invitations.length > 0 && (
                <div className="invitations-list">
                  <h3>Recent Invitations</h3>
                  {invitations.slice(0, 5).map(invitation => (
                    <div key={invitation.id} className="invitation-item">
                      <div className="invitation-info">
                        <strong>{invitation.email}</strong>
                        <span className="invitation-role">{invitation.role}</span>
                        <span className={`invitation-status ${invitation.status}`}>
                          {invitation.status}
                        </span>
                      </div>
                      <div className="invitation-date">
                        {new Date(invitation.sent_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User Information */}
          <div className="profile-section">
            <h2>User Information</h2>
            <div className="profile-card">
              <div className="profile-field">
                <label>Name</label>
                <span>{user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <label>Email</label>
                <span>{user?.email}</span>
              </div>
              {user?.phone && (
                <div className="profile-field">
                  <label>Phone</label>
                  <span>{user.phone}</span>
                </div>
              )}
              <div className="profile-field">
                <label>Username</label>
                <span>{user?.username}</span>
              </div>
              <div className="profile-field">
                <label>Role</label>
                <span className={`role-badge ${user?.role || 'user'}`}>
                  {user?.role || 'User'}
                </span>
              </div>
              <div className="profile-field">
                <label>Account Status</label>
                <span className={`status-badge ${user?.is_active ? 'active' : 'inactive'}`}>
                  {user?.is_active ? '✅ Active' : '❌ Inactive'}
                </span>
              </div>
              <div className="profile-field">
                <label>Email Verified</label>
                <span className={`status-badge ${user?.is_verified ? 'verified' : 'unverified'}`}>
                  {user?.is_verified ? '✅ Verified' : '⚠️ Unverified'}
                </span>
              </div>
              <div className="profile-field">
                <label>Last Login</label>
                <span>
                  {user?.last_login 
                    ? new Date(user.last_login).toLocaleDateString('en-NZ', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Never'
                  }
                </span>
              </div>
              <div className="profile-field">
                <label>Member Since</label>
                <span>
                  {user?.created_at 
                    ? new Date(user.created_at).toLocaleDateString('en-NZ', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'Not available'
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Company Information */}
          {company && stats && (
            <div className="profile-section">
              <h2>Company Information</h2>
              <div className="profile-card">
                <div className="profile-field">
                  <label>Company Name</label>
                  <span>{company.name}</span>
                </div>
                {company.address && (
                  <div className="profile-field">
                    <label>Address</label>
                    <span>{company.address}</span>
                  </div>
                )}
                <div className="profile-field">
                  <label>Total Hectares</label>
                  <span>{company.total_hectares ? `${company.total_hectares} ha` : '0 ha'}</span>
                </div>
                <div className="profile-field">
                  <label>Subscription</label>
                  <span>{stats.subscription_display_name || formatSubscriptionName(subscription)}</span>
                </div>
                <div className="profile-field">
                  <label>Subscription Status</label>
                  <span className={`status-badge ${company.subscription_status}`}>
                    {company.subscription_status?.charAt(0).toUpperCase() + company.subscription_status?.slice(1)}
                  </span>
                </div>
                <div className="profile-field">
                  <label>Company Number</label>
                  <span>{company.company_number || 'Not provided'}</span>
                </div>
                {subscription && (
                  <div className="profile-field">
                    <label>Monthly Cost</label>
                    <span className="pricing-info">
                      {formatPrice(getSubscriptionValue('calculated_monthly_price'))}
                      {getSubscriptionValue('base_price_monthly') > 0 && getSubscriptionValue('price_per_ha_monthly') > 0 && (
                        <span className="pricing-breakdown">
                          ({formatPrice(getSubscriptionValue('base_price_monthly'))} base + {formatPrice(getSubscriptionValue('price_per_ha_monthly') * getSubscriptionValue('hectares_used_for_calculation'))} for {getSubscriptionValue('hectares_used_for_calculation')} ha)
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {company.is_trial && (
                  <div className="profile-field">
                    <label>Trial Status</label>
                    <span className="trial-badge">
                      🎯 Trial Active {company.trial_end && `(expires ${new Date(company.trial_end).toLocaleDateString()})`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subscription & Pricing Information */}
          {subscription && (
            <div className="profile-section">
              <h2>Subscription & Pricing</h2>
              <div className="profile-card">
                <div className="profile-field">
                  <label>Current Plan</label>
                  <span>{formatSubscriptionName(subscription)}</span>
                </div>
                <div className="profile-field">
                  <label>Monthly Price</label>
                  <span>{formatPrice(getSubscriptionValue('calculated_monthly_price'))}</span>
                </div>
                <div className="profile-field">
                  <label>Yearly Price</label>
                  <span>{formatPrice(getSubscriptionValue('calculated_yearly_price'))}</span>
                </div>
                {getSubscriptionValue('calculated_yearly_price') < (getSubscriptionValue('calculated_monthly_price') * 12) && getSubscriptionValue('calculated_yearly_price') > 0 && (
                  <div className="profile-field">
                    <label>Yearly Savings</label>
                    <span className="savings-highlight">
                      Save {formatPrice((getSubscriptionValue('calculated_monthly_price') * 12) - getSubscriptionValue('calculated_yearly_price'))} per year!
                    </span>
                  </div>
                )}
                <div className="profile-field">
                  <label>Base Monthly Fee</label>
                  <span>{formatPrice(getSubscriptionValue('base_price_monthly'))}</span>
                </div>
                <div className="profile-field">
                  <label>Per Hectare Rate</label>
                  <span>{formatPrice(getSubscriptionValue('price_per_ha_monthly'))}/ha/month</span>
                </div>
                <div className="profile-field">
                  <label>Hectares Calculated</label>
                  <span>{getSubscriptionValue('hectares_used_for_calculation')} ha</span>
                </div>
                <div className="profile-field">
                  <label>Currency</label>
                  <span>{getSubscriptionValue('currency', 'USD')}</span>
                </div>
                {subscription.description && (
                  <div className="profile-field">
                    <label>Plan Description</label>
                    <span>{subscription.description}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Training Assignments */}
          {trainingAssignments.length > 0 && (
            <div className="profile-section">
              <h2>My Training</h2>
              <div className="training-grid">
                {trainingAssignments.map(assignment => (
                  <div 
                    key={assignment.id} 
                    className="training-card"
                    onClick={() => navigate(`/training/take/${assignment.id}`)}
                  >
                    <div className="training-header">
                      <h3>{assignment.module?.title || 'Training Module'}</h3>
                      <span className={`training-status ${assignment.status}`}>
                        {assignment.status === 'assigned' ? 'New' : 'In Progress'}
                      </span>
                    </div>
                    <div className="training-details">
                      {assignment.module?.description && (
                        <p className="training-description">{assignment.module.description}</p>
                      )}
                      <div className="training-meta">
                        <span className="training-duration">
                          ⏱️ {assignment.module?.estimated_duration_minutes || 15} min
                        </span>
                        {assignment.module?.category && (
                          <span className="training-category">
                            📚 {assignment.module.category}
                          </span>
                        )}
                      </div>
                      {assignment.expires_at && (
                        <div className="training-expiry">
                          <span className="expiry-label">Due:</span>
                          <span className="expiry-date">
                            {new Date(assignment.expires_at).toLocaleDateString('en-NZ')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="training-action">
                      <span className="action-text">
                        {assignment.status === 'assigned' ? 'Start Training' : 'Continue Training'}
                      </span>
                      <span className="action-arrow">→</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* Actions */}
          <div className="profile-actions">
            <button 
              className="change-password-button"
              onClick={() => navigate('/change-password')}
            >
              Change Password
            </button>
            <button 
              className="logout-button"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      
      <MobileNavigation />
            <style jsx>{`
        .profile-container {
          width: 100%;
          max-width: 1200px; /* Increase this value to make it wider */
          margin: 0 auto;
          padding: 28px;
        }
        
        
        .admin-panel {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border: 2px solid #3b82f6;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 32px;
          width: 100%;
        }
        
        .admin-badge {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
          display: inline-block;
          margin-left: 16px;
        }
        
        .admin-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 8px;
        }
        
        .tab-button {
          padding: 10px 16px;
          border: none;
          background:  #3b82f6;
          border-radius: 8px;
          colour: black;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        
        .tab-button:hover {
          background:rgb(100, 121, 163);
        }
        
        .tab-button.active {
          background: #0764f8ff;
          color: white;
        }
        
        .admin-content {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }
        
        .stat-card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
        }
        
        .stat-number {
          font-size: 2rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 4px;
        }
        
        .stat-label {
          font-size: 0.9rem;
          color: #64748b;
          margin-bottom: 4px;
        }
        
        .stat-limit {
          font-size: 0.8rem;
          color: #94a3b8;
          margin-bottom: 8px;
        }
        
        .stat-progress {
          height: 6px;
          background: #e2e8f0;
          border-radius: 3px;
          overflow: hidden;
        }
        
        .stat-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #10b981 0%, #059669 100%);
          transition: width 0.3s ease;
        }
        
        .role-badge, .status-badge, .tier-badge, .trial-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        
        .role-badge.admin {
          background: #ddd6fe;
          color: #5b21b6;
        }
        
        .role-badge.user {
          background: #dbeafe;
          color: #1d4ed8;
        }
        
        .status-badge.active, .status-badge.verified {
          background: #dcfce7;
          color: #166534;
        }
        
        .status-badge.inactive, .status-badge.unverified {
          background: #fef2f2;
          color: #991b1b;
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
        
        .trial-badge {
          background: #fff7ed;
          color: #ea580c;
        }
        
        .company-id, .company-slug {
          font-family: monospace;
          background: #f8fafc;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.9rem;
        }
        
        .profile-actions {
          display: flex;
          gap: 22px;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 1px;
          margin-bottom: 100px;
        }
        
        .profile-actions button {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .edit-profile-button {
          background: #3b82f6;
          color: white;
        }
        
        .change-password-button {
          background: #f59e0b;
          color: white;
        }
        
        .logout-button {
          background: #ef4444;
          color: white;
          padding: 12px 24px;
        }
        
        .profile-actions button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        @media (max-width: 768px) {
          .admin-tabs {
            flex-direction: column;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .toggle-form-button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        
        .toggle-form-button:hover {
          background: #2563eb;
        }
        
        .toggle-form-button.active {
          background: #dc2626;
        }
        
        .invitations-list {
          margin-top: 24px;
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .invitation-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .invitation-item:last-child {
          border-bottom: none;
        }
        
        .invitation-info {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .invitation-role {
          background: #f3f4f6;
          color: #374151;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.8rem;
        }
        
        .invitation-status {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 500;
        }
        
        .invitation-status.pending {
          background: #fef3c7;
          color: #92400e;
        }
        
        .invitation-status.accepted {
          background: #dcfce7;
          color: #166534;
        }
        
        .invitation-status.expired {
          background: #fef2f2;
          color: #dc2626;
        }
        
        .invitation-date {
          color: #6b7280;
          font-size: 0.9rem;
        }


        .training-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-top: 16px;
        }
        
        .training-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          cursor: pointer;
          transition: all 0.2s ease;
          border: 2px solid transparent;
        }
        
        .training-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          border-color: #3b82f6;
        }
        
        .training-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        
        .training-header h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #1e293b;
          line-height: 1.3;
          flex: 1;
          margin-right: 12px;
        }
        
        .training-status {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
          white-space: nowrap;
        }
        
        .training-status.assigned {
          background: #dbeafe;
          color: #1d4ed8;
        }
        
        .training-status.in_progress {
          background: #fef3c7;
          color: #92400e;
        }
        
        .training-details {
          margin-bottom: 16px;
        }
        
        .training-description {
          color: #64748b;
          font-size: 0.9rem;
          margin: 0 0 12px 0;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        .training-meta {
          display: flex;
          gap: 16px;
          margin-bottom: 8px;
        }
        
        .training-duration, .training-category {
          color: #6b7280;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .training-expiry {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
        }
        
        .expiry-label {
          color: #6b7280;
        }
        
        .expiry-date {
          color: #dc2626;
          font-weight: 500;
        }
        
        .training-action {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }
        
        .action-text {
          color: #3b82f6;
          font-weight: 500;
          font-size: 0.9rem;
        }
        
        .action-arrow {
          color: #3b82f6;
          font-weight: 600;
          transition: transform 0.2s ease;
        }
        
        .training-card:hover .action-arrow {
          transform: translateX(4px);
        }
        
        @media (max-width: 768px) {
          .admin-tabs {
            flex-direction: column;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .training-grid {
            grid-template-columns: 1fr;
          }
          
          .training-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          
          .training-header h3 {
            margin-right: 0;
          }
          
          .training-meta {
            flex-direction: column;
            gap: 4px;
          }
        }

      `}</style>
    </div>
  );
}

export default Profile;