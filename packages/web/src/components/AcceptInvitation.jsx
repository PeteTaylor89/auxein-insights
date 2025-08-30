import { useState, useEffect } from 'react';

function AcceptInvitation() {
  // Get token from URL params
  const [token] = useState(new URLSearchParams(window.location.search).get('token'));
  
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });

  useEffect(() => {
    if (token) {
      loadInvitation();
    } else {
      setError('Invalid invitation link - no token provided');
    }
  }, [token]);

  const loadInvitation = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/invitations/token/${token}`);
      const data = await response.json();

      setInvitation(data);
      setFormData(prev => ({
        ...prev,
        username: data.suggested_username || '',
        first_name: data.first_name || '',
        last_name: data.last_name || ''
      }));
    } catch (err) {
      setError('Invalid or expired invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic validation
    if (!formData.username || formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      setLoading(false);
      return;
    }

    if (!formData.password || formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          ...formData
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Account created successfully:', result);
      
      setSuccess(true);
      
      // Redirect after success with user info
      setTimeout(() => {
        const message = `Welcome ${result.username}! Your account has been created successfully.`;
        window.location.href = `/login?message=${encodeURIComponent(message)}&email=${encodeURIComponent(invitation.email)}`;
      }, 2000);
      
    } catch (err) {
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleLoginInstead = () => {
    const email = invitation?.email || '';
    window.location.href = `/login?email=${encodeURIComponent(email)}`;
  };

  // Loading state
  if (loading && !invitation) {
    return (
      <div className="accept-invitation-page">
        <div className="card">
          <div className="loading-spinner"></div>
          <h2>Loading invitation...</h2>
          <p>Please wait while we verify your invitation.</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !invitation) {
    return (
      <div className="accept-invitation-page">
        <div className="card error-card">
          <div className="error-icon">❌</div>
          <h1>Invitation Error</h1>
          <p>{error}</p>
          <div className="action-buttons">
            <button onClick={() => window.location.href = '/login'} className="primary-button">
              Go to Login
            </button>
            <button onClick={() => window.location.href = '/'} className="secondary-button">
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="accept-invitation-page">
        <div className="card success-card">
          <div className="success-icon">🎉</div>
          <h1>Account Created Successfully!</h1>
          <p>Welcome to {invitation?.company?.name}!</p>
          <p>Redirecting you to login...</p>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="accept-invitation-page">
      <div className="card">
        <div className="header">
          <h1>🎉 Complete Your Account Setup</h1>
          <p>You're almost ready to join the team!</p>
        </div>

        {invitation && (
          <div className="invitation-details">
            <h3>Invitation Details</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="label">Company:</span>
                <span className="value">{invitation.company?.name}</span>
              </div>
              <div className="detail-item">
                <span className="label">Role:</span>
                <span className="value">{invitation.role}</span>
              </div>
              <div className="detail-item">
                <span className="label">Email:</span>
                <span className="value">{invitation.email}</span>
              </div>
              <div className="detail-item">
                <span className="label">Invited by:</span>
                <span className="value">{invitation.inviter?.full_name}</span>
              </div>
            </div>
            
            {invitation.message && (
              <div className="personal-message">
                <strong>Personal message:</strong>
                <p>"{invitation.message}"</p>
              </div>
            )}
          </div>
        )}

        <div className="form-container">
          <h3>Create Your Account</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="first_name">First Name *</label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                required
                placeholder="Your first name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="last_name">Last Name *</label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                required
                placeholder="Your last name"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="username">Username *</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              required
              placeholder="Choose a username"
              minLength="3"
            />
            <small>At least 3 characters, letters, numbers, underscores and hyphens only</small>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              required
              placeholder="Create a secure password"
              minLength="8"
            />
            <small>At least 8 characters with a number and uppercase letter</small>
          </div>

          <div className="form-group">
            <label htmlFor="timezone">Timezone</label>
            <select
              id="timezone"
              name="timezone"
              value={formData.timezone}
              onChange={handleInputChange}
            >
              <option value="Pacific/Auckland">New Zealand (Auckland)</option>
              <option value="Pacific/Chatham">New Zealand (Chatham Islands)</option>
              <option value="Australia/Sydney">Australia (Sydney)</option>
              <option value="Australia/Melbourne">Australia (Melbourne)</option>
              <option value="Australia/Perth">Australia (Perth)</option>
              <option value="UTC">UTC</option>
              <option value="America/Los_Angeles">US Pacific</option>
              <option value="America/Denver">US Mountain</option>
              <option value="America/Chicago">US Central</option>
              <option value="America/New_York">US Eastern</option>
              <option value="Europe/London">UK (London)</option>
              <option value="Europe/Paris">Europe (Paris)</option>
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            onClick={handleSubmit} 
            disabled={loading} 
            className="submit-button"
          >
            {loading ? (
              <>
                <span className="button-spinner"></span>
                Creating Account...
              </>
            ) : (
              'Complete Setup'
            )}
          </button>
        </div>

        <div className="login-option">
          <div className="divider">
            <span>OR</span>
          </div>
          <p>Already have the credentials from your invitation email?</p>
          <button 
            onClick={handleLoginInstead}
            className="secondary-button"
            type="button"
          >
            Login with Existing Credentials
          </button>
        </div>

        <div className="help-section">
          <p>Need help? Contact support at <a href="mailto:support@auxein.co.nz">support@auxein.co.nz</a></p>
        </div>
      </div>

      <style jsx>{`
        .accept-invitation-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .card {
          background: white;
          padding: 40px;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .error-card, .success-card {
          text-align: center;
          padding: 60px 40px;
        }

        .error-icon, .success-icon {
          font-size: 4rem;
          margin-bottom: 20px;
        }

        .header {
          text-align: center;
          margin-bottom: 30px;
        }

        .header h1 {
          color: #1f2937;
          margin-bottom: 8px;
          font-size: 2rem;
        }

        .header p {
          color: #6b7280;
          font-size: 1.1rem;
        }

        .invitation-details {
          background: #f8fafc;
          padding: 24px;
          border-radius: 12px;
          margin-bottom: 30px;
          border-left: 4px solid #3b82f6;
        }

        .invitation-details h3 {
          margin-top: 0;
          margin-bottom: 16px;
          color: #1f2937;
        }

        .detail-grid {
          display: grid;
          gap: 12px;
          margin-bottom: 16px;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .label {
          font-weight: 600;
          color: #374151;
        }

        .value {
          color: #1f2937;
          font-weight: 500;
        }

        .personal-message {
          background: #e0f2fe;
          padding: 16px;
          border-radius: 8px;
          margin-top: 16px;
        }

        .personal-message p {
          margin: 8px 0 0 0;
          font-style: italic;
          color: #0f172a;
        }

        .form-container h3 {
          margin-bottom: 24px;
          color: #1f2937;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #374151;
          font-size: 14px;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.2s;
          box-sizing: border-box;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-group small {
          display: block;
          margin-top: 6px;
          color: #6b7280;
          font-size: 13px;
        }

        .submit-button {
          width: 100%;
          background: #3b82f6;
          color: white;
          padding: 16px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .submit-button:hover:not(:disabled) {
          background: #2563eb;
          transform: translateY(-1px);
        }

        .submit-button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
          transform: none;
        }

        .button-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .primary-button, .secondary-button {
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-size: 14px;
        }

        .primary-button {
          background: #3b82f6;
          color: white;
          margin-right: 12px;
        }

        .primary-button:hover {
          background: #2563eb;
        }

        .secondary-button {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
          width: 100%;
          margin-top: 12px;
        }

        .secondary-button:hover {
          background: #e5e7eb;
        }

        .action-buttons {
          margin-top: 24px;
        }

        .login-option {
          margin-top: 40px;
          text-align: center;
        }

        .divider {
          position: relative;
          margin: 30px 0;
          text-align: center;
        }

        .divider:before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: #e5e7eb;
        }

        .divider span {
          background: white;
          padding: 0 16px;
          color: #6b7280;
          font-weight: 500;
        }

        .help-section {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }

        .help-section p {
          color: #6b7280;
          font-size: 14px;
          margin: 0;
        }

        .help-section a {
          color: #3b82f6;
          text-decoration: none;
        }

        .help-section a:hover {
          text-decoration: underline;
        }

        .error-message {
          background: #fef2f2;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px solid #fecaca;
          font-size: 14px;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e5e7eb;
          border-top: 4px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .accept-invitation-page {
            padding: 12px;
          }
          
          .card {
            padding: 24px;
          }
          
          .form-row {
            grid-template-columns: 1fr;
          }
          
          .header h1 {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}

export default AcceptInvitation;