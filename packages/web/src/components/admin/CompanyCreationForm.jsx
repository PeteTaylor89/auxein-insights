// src/components/admin/CompanyCreationForm.jsx - Updated to use subscription service
import { useState, useEffect } from 'react';
import {adminService, subscriptionService} from '@vineyard/shared';


function CompanyCreationForm() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);
  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_number: '',
    subscription_id: 1, // Default to first subscription
    total_hectares: 0.0,
    admin_email: '',
    admin_username: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_phone: '',
    send_welcome_email: true,
    generate_password: true,
    custom_password: '',
    start_trial: false,
    trial_days: 14
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});

  // Load available subscriptions on component mount
  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    try {
      setLoadingSubscriptions(true);
      // Try subscription service first, fallback to admin service
      let data;
      try {
        data = await subscriptionService.getAllSubscriptions();
      } catch (subscriptionError) {
        console.warn('Subscription service failed, trying admin service:', subscriptionError);
        data = await adminService.getAvailableSubscriptions();
      }
      
      setSubscriptions(Array.isArray(data) ? data : []);
      
      // Set default subscription_id to the first available subscription
      if (data && data.length > 0) {
        setFormData(prev => ({
          ...prev,
          subscription_id: data[0].id
        }));
      }
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      setSubscriptions([]);
    } finally {
      setLoadingSubscriptions(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Auto-generate username from names
    if (name === 'admin_first_name' || name === 'admin_last_name') {
      const firstName = name === 'admin_first_name' ? value : formData.admin_first_name;
      const lastName = name === 'admin_last_name' ? value : formData.admin_last_name;
      
      if (firstName && lastName && !formData.admin_username) {
        setFormData(prev => ({
          ...prev,
          admin_username: (firstName + lastName.charAt(0)).toLowerCase()
        }));
      }
    }

    // Clear errors when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleSubscriptionChange = (subscriptionId) => {
    const selectedSub = subscriptions.find(s => s.id === parseInt(subscriptionId));
    setFormData(prev => ({
      ...prev,
      subscription_id: parseInt(subscriptionId),
      trial_days: selectedSub?.trial_days || 14,
      start_trial: false // Reset trial option when changing subscription
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.company_name.trim()) {
      newErrors.company_name = 'Company name is required';
    }

    if (!formData.subscription_id) {
      newErrors.subscription_id = 'Please select a subscription plan';
    }

    if (!formData.admin_email.trim()) {
      newErrors.admin_email = 'Admin email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.admin_email)) {
      newErrors.admin_email = 'Please enter a valid email address';
    }

    if (!formData.admin_username.trim()) {
      newErrors.admin_username = 'Admin username is required';
    } else if (formData.admin_username.length < 3) {
      newErrors.admin_username = 'Username must be at least 3 characters';
    }

    if (!formData.admin_first_name.trim()) {
      newErrors.admin_first_name = 'First name is required';
    }

    if (!formData.admin_last_name.trim()) {
      newErrors.admin_last_name = 'Last name is required';
    }

    if (!formData.generate_password && !formData.custom_password) {
      newErrors.custom_password = 'Password is required when not auto-generating';
    }

    if (formData.start_trial && (formData.trial_days < 1 || formData.trial_days > 90)) {
      newErrors.trial_days = 'Trial days must be between 1 and 90';
    }

    if (formData.total_hectares < 0) {
      newErrors.total_hectares = 'Total hectares must be 0 or greater';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await adminService.createCompanyWithAdmin(formData);
      
      setResult({
        success: true,
        message: 'Company and admin user created successfully!',
        data: response
      });

      // Reset form
      setFormData({
        company_name: '',
        company_address: '',
        company_number: '',
        subscription_id: subscriptions.length > 0 ? subscriptions[0].id : 1,
        total_hectares: 0.0,
        admin_email: '',
        admin_username: '',
        admin_first_name: '',
        admin_last_name: '',
        admin_phone: '',
        send_welcome_email: true,
        generate_password: true,
        custom_password: '',
        start_trial: false,
        trial_days: 14
      });

    } catch (error) {
      setResult({
        success: false,
        message: error.response?.data?.detail || 'Failed to create company',
        data: null
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedSubscription = subscriptions.find(s => s.id === formData.subscription_id);

  const formatPrice = (amount) => {
    if (amount === undefined || amount === null) return '$0.00';
    return `$${Number(amount).toFixed(2)}`;
  };

  const calculateTotalPrice = (subscription, hectares) => {
    if (!subscription) return 0;
    const base = parseFloat(subscription.base_price_monthly) || 0;
    const perHa = parseFloat(subscription.price_per_ha_monthly) || 0;
    const total = base + (perHa * parseFloat(hectares || 0));
    return total;
  };

  const getFeaturesList = (subscription) => {
    if (!subscription?.features?.enabled_features) return [];
    return subscription.features.enabled_features;
  };

  if (loadingSubscriptions) {
    return (
      <div className="company-creation-form">
        <h3>Create New Company</h3>
        <div className="loading">Loading subscription plans...</div>
      </div>
    );
  }

  return (
    <div className="company-creation-form">
      <h3>Create New Company</h3>
      <p>Set up a new customer company with admin user</p>

      <form onSubmit={handleSubmit}>
        {/* Company Information */}
        <div className="form-section">
          <h4>Company Information</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="company_name">Company Name *</label>
              <input
                type="text"
                id="company_name"
                name="company_name"
                value={formData.company_name}
                onChange={handleInputChange}
                placeholder="e.g., Vineyard Estate Ltd"
                className={errors.company_name ? 'error' : ''}
              />
              {errors.company_name && <span className="error-text">{errors.company_name}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="company_number">Company Number</label>
              <input
                type="text"
                id="company_number"
                name="company_number"
                value={formData.company_number}
                onChange={handleInputChange}
                placeholder="e.g., 12345678"
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="company_address">Address</label>
            <textarea
              id="company_address"
              name="company_address"
              value={formData.company_address}
              onChange={handleInputChange}
              placeholder="Full company address"
              rows="3"
            />
          </div>

          <div className="form-group">
            <label htmlFor="total_hectares">Total Hectares</label>
            <input
              type="number"
              id="total_hectares"
              name="total_hectares"
              value={formData.total_hectares}
              onChange={handleInputChange}
              placeholder="0.0"
              step="0.1"
              min="0"
              className={errors.total_hectares ? 'error' : ''}
            />
            {errors.total_hectares && <span className="error-text">{errors.total_hectares}</span>}
          </div>
        </div>

        {/* Subscription Plan */}
        <div className="form-section">
          <h4>Subscription Plan</h4>
          
          {subscriptions.length > 0 ? (
            <>
              <div className="subscription-selector">
                {subscriptions.map(subscription => (
                  <div 
                    key={subscription.id}
                    className={`subscription-option ${formData.subscription_id === subscription.id ? 'selected' : ''}`}
                    onClick={() => handleSubscriptionChange(subscription.id)}
                  >
                    <h5>{subscription.display_name}</h5>
                    <div className="price">
                      {subscription.base_price_monthly > 0 
                        ? `${formatPrice(subscription.base_price_monthly)}/month base`
                        : 'Free'}
                    </div>
                    {subscription.price_per_ha_monthly > 0 && (
                      <div className="per-hectare">
                        + {formatPrice(subscription.price_per_ha_monthly)}/hectare/month
                      </div>
                    )}
                    <div className="limits">
                      {subscription.max_users === -1 ? 'Unlimited' : subscription.max_users} users • 
                      {subscription.max_storage_gb === -1 ? 'Unlimited' : `${subscription.max_storage_gb}GB`} storage
                    </div>
                    {subscription.description && (
                      <div className="description">{subscription.description}</div>
                    )}

                  </div>
                ))}
              </div>

              {selectedSubscription && (
                <div className="pricing-preview">
                  <h5>Pricing Preview</h5>
                  <div className="pricing-breakdown">
                    <div>Base price: {formatPrice(selectedSubscription.base_price_monthly)}/month</div>
                    {selectedSubscription.price_per_ha_monthly > 0 && (
                      <div>Per hectare: {formatPrice(selectedSubscription.price_per_ha_monthly)}/ha/month</div>
                    )}
                    <div>Total for {formData.total_hectares} hectares: <strong>{formatPrice(calculateTotalPrice(selectedSubscription, formData.total_hectares))}/month</strong></div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="no-subscriptions">
              <p>No subscription plans available. Please contact system administrator.</p>
            </div>
          )}
          
          {errors.subscription_id && <span className="error-text">{errors.subscription_id}</span>}
        </div>

        {/* Trial Options */}
        {selectedSubscription?.trial_enabled && (
          <div className="form-section">
            <h4>Trial Options</h4>
            <div className="trial-section">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="start_trial"
                  checked={formData.start_trial}
                  onChange={handleInputChange}
                />
                Start {selectedSubscription.trial_days}-day free trial
              </label>
              
              {formData.start_trial && (
                <div className="trial-controls">
                  <label htmlFor="trial_days">Trial Duration (days)</label>
                  <input
                    type="number"
                    id="trial_days"
                    name="trial_days"
                    value={formData.trial_days}
                    onChange={handleInputChange}
                    min="1"
                    max="90"
                    className={errors.trial_days ? 'error' : ''}
                  />
                  {errors.trial_days && <span className="error-text">{errors.trial_days}</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin User */}
        <div className="form-section">
          <h4>Administrator User</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="admin_first_name">First Name *</label>
              <input
                type="text"
                id="admin_first_name"
                name="admin_first_name"
                value={formData.admin_first_name}
                onChange={handleInputChange}
                placeholder="John"
                className={errors.admin_first_name ? 'error' : ''}
              />
              {errors.admin_first_name && <span className="error-text">{errors.admin_first_name}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="admin_last_name">Last Name *</label>
              <input
                type="text"
                id="admin_last_name"
                name="admin_last_name"
                value={formData.admin_last_name}
                onChange={handleInputChange}
                placeholder="Smith"
                className={errors.admin_last_name ? 'error' : ''}
              />
              {errors.admin_last_name && <span className="error-text">{errors.admin_last_name}</span>}
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="admin_email">Email Address *</label>
              <input
                type="email"
                id="admin_email"
                name="admin_email"
                value={formData.admin_email}
                onChange={handleInputChange}
                placeholder="john.smith@vineyard.com"
                className={errors.admin_email ? 'error' : ''}
              />
              {errors.admin_email && <span className="error-text">{errors.admin_email}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="admin_username">Username *</label>
              <input
                type="text"
                id="admin_username"
                name="admin_username"
                value={formData.admin_username}
                onChange={handleInputChange}
                placeholder="johnsmith"
                className={errors.admin_username ? 'error' : ''}
              />
              {errors.admin_username && <span className="error-text">{errors.admin_username}</span>}
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="admin_phone">Phone Number</label>
            <input
              type="tel"
              id="admin_phone"
              name="admin_phone"
              value={formData.admin_phone}
              onChange={handleInputChange}
              placeholder="+64 21 123 4567"
            />
          </div>
        </div>

        {/* Options */}
        <div className="form-section">
          <h4>Options</h4>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="generate_password"
              checked={formData.generate_password}
              onChange={handleInputChange}
            />
            Generate secure password automatically
          </label>
          
          {!formData.generate_password && (
            <div className="form-group">
              <label htmlFor="custom_password">Custom Password *</label>
              <input
                type="password"
                id="custom_password"
                name="custom_password"
                value={formData.custom_password}
                onChange={handleInputChange}
                placeholder="Enter custom password"
                className={errors.custom_password ? 'error' : ''}
              />
              {errors.custom_password && <span className="error-text">{errors.custom_password}</span>}
            </div>
          )}
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="send_welcome_email"
              checked={formData.send_welcome_email}
              onChange={handleInputChange}
            />
            Send welcome email with login credentials
          </label>
        </div>

        {/* Submit */}
        <div className="form-actions">
          <button
            type="submit"
            disabled={loading || loadingSubscriptions}
            className="submit-button"
          >
            {loading ? '⏳ Creating...' : '🚀 Create Company & Admin User'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className={`result ${result.success ? 'success' : 'error'}`}>
            <h4>{result.success ? '✅ Success!' : '❌ Error'}</h4>
            <p>{result.message}</p>
            
            {result.success && result.data && (
              <div className="result-details">
                <p><strong>Company:</strong> {result.data.company.name} (ID: {result.data.company.id})</p>
                <p><strong>Admin User:</strong> {result.data.admin_user.username} ({result.data.admin_user.email})</p>
                <p><strong>Subscription:</strong> {result.data.company.subscription_display_name}</p>
                <p><strong>Monthly Cost:</strong> {formatPrice(result.data.company.current_monthly_amount)}</p>
                {result.data.generated_password && (
                  <p><strong>Generated Password:</strong> <code>{result.data.generated_password}</code></p>
                )}
                {result.data.trial_end_date && (
                  <p><strong>Trial ends:</strong> {new Date(result.data.trial_end_date).toLocaleDateString()}</p>
                )}
                <p><strong>Welcome email sent:</strong> {result.data.welcome_email_sent ? 'Yes' : 'No'}</p>
              </div>
            )}
          </div>
        )}
      </form>

      <style jsx>{`
        .company-creation-form {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }

        .company-creation-form h3 {
          color: #1e293b;
          margin-bottom: 8px;
        }

        .company-creation-form p {
          color: #64748b;
          margin-bottom: 24px;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }

        .form-section {
          margin-bottom: 32px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .form-section h4 {
          margin: 0 0 16px 0;
          color: #1e293b;
          font-size: 1.1rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group label {
          margin-bottom: 6px;
          font-weight: 600;
          color: #374151;
          font-size: 0.9rem;
        }

        .form-group input,
        .form-group textarea {
          padding: 10px 12px;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.95rem;
          transition: border-color 0.2s ease;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-group input.error,
        .form-group textarea.error {
          border-color: #ef4444;
        }

        .error-text {
          color: #ef4444;
          font-size: 0.8rem;
          margin-top: 4px;
        }

        .subscription-selector {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .subscription-option {
          padding: 20px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          background: white;
        }

        .subscription-option:hover {
          border-color: #3b82f6;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .subscription-option.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .subscription-option h5 {
          margin: 0 0 8px 0;
          color: #1e293b;
          font-size: 1.1rem;
        }

        .subscription-option .price {
          font-size: 1.25rem;
          font-weight: 700;
          color: #3b82f6;
          margin-bottom: 4px;
        }

        .subscription-option .per-hectare {
          font-size: 0.9rem;
          color: #64748b;
          margin-bottom: 8px;
        }

        .subscription-option .limits {
          font-size: 0.85rem;
          color: #64748b;
          margin-bottom: 8px;
        }

        .subscription-option .description {
          font-size: 0.9rem;
          color: #374151;
          margin-bottom: 12px;
          font-style: italic;
        }

        .subscription-option .features {
          list-style: none;
          padding: 0;
          margin: 0;
          font-size: 0.8rem;
          color: #64748b;
        }

        .subscription-option .features li {
          margin-bottom: 4px;
          padding-left: 16px;
          position: relative;
        }

        .subscription-option .features li:before {
          content: "✓";
          position: absolute;
          left: 0;
          color: #10b981;
          font-weight: bold;
        }

        .pricing-preview {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          margin-top: 16px;
        }

        .pricing-preview h5 {
          margin: 0 0 8px 0;
          color: #374151;
          font-size: 1rem;
        }

        .pricing-breakdown {
          font-size: 0.9rem;
          color: #64748b;
        }

        .pricing-breakdown div {
          margin-bottom: 4px;
        }

        .pricing-breakdown div:last-child {
          font-weight: 600;
          color: #374151;
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
          margin-top: 8px;
          font-size: 1rem;
        }

        .no-subscriptions {
          padding: 20px;
          text-align: center;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #991b1b;
        }

        .trial-section {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-weight: 500;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          margin: 0;
        }

        .trial-controls {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e2e8f0;
        }

        .trial-controls label {
          display: block;
          margin-bottom: 6px;
          font-weight: 600;
          color: #374151;
          font-size: 0.9rem;
        }

        .trial-controls input {
          width: 100px;
          padding: 8px 10px;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
        }

        .form-actions {
          text-align: center;
          margin-top: 32px;
        }

        .submit-button {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          padding: 14px 28px;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 200px;
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .result {
          margin-top: 24px;
          padding: 20px;
          border-radius: 8px;
          border: 2px solid;
        }

        .result.success {
          background: #f0fdf4;
          border-color: #16a34a;
          color: #166534;
        }

        .result.error {
          background: #fef2f2;
          border-color: #dc2626;
          color: #991b1b;
        }

        .result h4 {
          margin: 0 0 8px 0;
        }

        .result p {
          margin: 0 0 8px 0;
        }

        .result-details {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid currentColor;
          opacity: 0.8;
        }

        .result-details code {
          background: rgba(0,0,0,0.1);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
          
          .subscription-selector {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default CompanyCreationForm;