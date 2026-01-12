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
                <button 
                    className="tab-button subtle"
                    onClick={() => navigate('/timesheets')}
                  >
                    Open TimeSheets
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
                <button 
                    className="tab-button subtle"
                    onClick={() => navigate('/timesheets')}
                  >
                    Open TimeSheets
                </button>
                <button 
                    className="tab-button subtle"
                    onClick={() => navigate('/training')}
                  >
                    Manage Training
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
              <div className="profile-field">
                <label>Timesheet</label>
                <span>
                  <button 
                    className="change-password-button subtle-secondary"
                    onClick={() => navigate('/timesheets')}
                  >
                    Open My TimeSheet
                  </button>
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
        :global(body) {
          font-family: Calibri, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          color: #2F2F2F;
        }

        .profile-container {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 28px;
        }

        .profile-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          border-bottom: 2px solid #FDF6E3; /* Warm Sand */
          padding-bottom: 8px;
        }

        .profile-header h1 {
          margin: 0;
          font-size: 20pt;           /* Primary heading */
          font-weight: bold;
          color: #2F2F2F;            /* Charcoal */
        }

        .profile-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .loading-message {
          font-size: 14pt;
          color: #5B6830; /* Olive */
        }

        .error-message {
          background: #FBE4DE;
          border: 1px solid #D1583B;
          color: #D1583B;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.95rem;
        }

        /* Admin panels */

        .admin-panel {
          background: #FDF6E3; /* Warm Sand */
          border: 1px solid #5B6830; /* Olive */
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 8px;
        }

        .admin-panel h2 {
          margin: 0 0 16px 0;
          font-size: 16pt; /* Secondary heading */
          font-weight: bold;
          color: #D1583B;  /* Terracotta */
        }

        .admin-badge {
          background: #D1583B; /* Terracotta */
          color: #FFFFFF;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
          display: inline-block;
        }

        .admin-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(91, 104, 48, 0.25);
          padding-bottom: 8px;
        }

        .tab-button {
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: #FDF6E3;      /* Warm Sand */
          color: #5B6830;           /* Olive */
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.2s ease;
        }

        .tab-button.subtle {
          background: #FFFFFF;
          border-color: rgba(91,104,48,0.25);
          color: #2F2F2F;
        }

        .tab-button:hover {
          background: #F5EBD5;      /* slightly deeper Warm Sand */
        }

        .tab-button.active {
          background: #D1583B;      /* Terracotta */
          color: #FFFFFF;
          border-color: #D1583B;
        }

        .admin-content {
          background: #FFFFFF;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 2px 6px rgba(47, 47, 47, 0.12);
        }

        /* Generic sections & cards */

        .profile-section {
          background: #FFFFFF;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 6px rgba(47, 47, 47, 0.08);
          border: 1px solid rgba(91, 104, 48, 0.2);
        }

        .profile-section h2 {
          margin: 0 0 16px 0;
          font-size: 16pt;      /* Secondary heading */
          font-weight: bold;
          color: #D1583B;       /* Terracotta */
        }

        .profile-section h3 {
          margin: 0 0 8px 0;
          font-size: 14pt;      /* Tertiary heading */
          font-weight: bold;
          color: #5B6830;       /* Olive */
        }

        .profile-card {
          border-radius: 10px;
          padding: 16px 18px;
          background: #FDF6E3; /* Warm Sand */
        }

        .profile-field {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 6px 0;
          border-bottom: 1px solid rgba(91, 104, 48, 0.12);
        }

        .profile-field:last-child {
          border-bottom: none;
        }

        .profile-field label {
          font-size: 11pt;              /* Subheading style-ish */
          font-weight: bold;
          font-style: italic;
          color: #2F2F2F;
        }

        .profile-field span {
          font-size: 0.95rem;
          text-align: right;
        }

        .pricing-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
        }

        .pricing-breakdown {
          font-size: 0.8rem;
          color: #5B6830;
        }

        .savings-highlight {
          color: #5B6830;
          font-weight: 600;
        }

        .trial-badge {
          padding: 4px 10px;
          border-radius: 12px;
          background: #FBE4DE;
          color: #D1583B;
          font-size: 0.85rem;
          font-weight: 600;
        }

        /* Badges */

        .role-badge,
        .status-badge {
          padding: 4px 10px;
          border-radius: 14px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .role-badge.admin,
        .role-badge.manager {
          background: #FDF6E3;
          color: #5B6830;
        }

        .role-badge.user {
          background: #FFFFFF;
          color: #2F2F2F;
          border: 1px solid rgba(91, 104, 48, 0.3);
        }

        .status-badge.active,
        .status-badge.verified {
          background: #E4F2DC;   /* soft green-ish from olive */
          color: #5B6830;
        }

        .status-badge.inactive,
        .status-badge.unverified {
          background: #FBE4DE;   /* soft Terracotta tint */
          color: #D1583B;
        }

        .status-badge.trial,
        .status-badge.pending {
          background: #FDF6E3;
          color: #D1583B;
        }

        /* Team / invitations */

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .toggle-form-button {
          background: #5B6830;        /* Olive */
          color: #FFFFFF;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.2s ease;
        }

        .toggle-form-button:hover {
          background: #495425;
        }

        .toggle-form-button.active {
          background: #D1583B;        /* Terracotta */
        }

        .invitations-list {
          margin-top: 12px;
          background: #FFFFFF;
          border-radius: 8px;
          padding: 14px 16px;
          box-shadow: 0 2px 4px rgba(47, 47, 47, 0.12);
        }

        .invitation-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid rgba(91, 104, 48, 0.12);
        }

        .invitation-item:last-child {
          border-bottom: none;
        }

        .invitation-info {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .invitation-role {
          background: #FDF6E3;
          color: #2F2F2F;
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
          background: #FBE4DE;
          color: #D1583B;
        }

        .invitation-status.accepted {
          background: #E4F2DC;
          color: #5B6830;
        }

        .invitation-status.expired {
          background: #FBE4DE;
          color: #D1583B;
          opacity: 0.8;
        }

        .invitation-date {
          color: #6B7280;
          font-size: 0.85rem;
        }

        /* Training */

        .training-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-top: 8px;
        }

        .training-card {
          background: #FFFFFF;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 2px 6px rgba(47, 47, 47, 0.08);
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid rgba(91, 104, 48, 0.35);
        }

        .training-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(47, 47, 47, 0.15);
          border-color: #D1583B;
        }

        .training-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
          gap: 8px;
        }

        .training-header h3 {
          margin: 0;
          font-size: 14pt;       /* Tertiary heading */
          font-weight: bold;
          color: #5B6830;
          flex: 1;
        }

        .training-status {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .training-status.assigned {
          background: #FDF6E3;
          color: #5B6830;
        }

        .training-status.in_progress {
          background: #FBE4DE;
          color: #D1583B;
        }

        .training-details {
          margin-bottom: 10px;
        }

        .training-description {
          color: #4B5563;
          font-size: 0.9rem;
          margin: 0 0 8px 0;
          line-height: 1.4;
        }

        .training-meta {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }

        .training-duration,
        .training-category {
          color: #6B7280;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .training-expiry {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
        }

        .expiry-label {
          color: #6B7280;
        }

        .expiry-date {
          color: #D1583B;
          font-weight: 500;
        }

        .training-action {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 8px;
          border-top: 1px solid rgba(91, 104, 48, 0.18);
        }

        .action-text {
          color: #D1583B;
          font-weight: 500;
          font-size: 0.9rem;
        }

        .action-arrow {
          color: #D1583B;
          font-weight: 600;
          transition: transform 0.2s ease;
        }

        .training-card:hover .action-arrow {
          transform: translateX(4px);
        }

        /* Profile actions */

        .profile-actions {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 4px;
          margin-bottom: 80px;
        }

        .profile-actions button {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.95rem;
        }

        .change-password-button {
          background: #5B6830;    /* Olive */
          color: #FFFFFF;
        }

        .change-password-button.subtle-secondary {
          background: #FDF6E3;
          color: #5B6830;
          border: 1px solid rgba(91,104,48,0.4);
          padding: 6px 14px;
          font-size: 0.85rem;
        }

        .logout-button {
          background: #D1583B;    /* Terracotta */
          color: #FFFFFF;
        }

        .profile-actions button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(47, 47, 47, 0.18);
        }

        /* Responsiveness */

        @media (max-width: 768px) {
          .profile-container {
            padding: 16px;
          }

          .admin-tabs {
            flex-direction: column;
          }

          .profile-field {
            flex-direction: column;
            align-items: flex-start;
          }

          .profile-field span {
            text-align: left;
          }

          .training-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default Profile;
