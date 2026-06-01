// src/components/admin/InvitationForm.jsx
import { useState } from 'react';
import {invitationService} from '@vineyard/shared';

function InvitationForm({ onInvitationSent, companyStats }) {
  const [formData, setFormData] = useState({
    email: '',
    role: 'user',
    first_name: '',
    last_name: '',
    suggested_username: '',
    message: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    console.log('=== FORM SUBMIT DEBUG ===');
    console.log('Form data:', formData);
    console.log('invitationService object:', invitationService);
    console.log('createInvitation function:', invitationService.createInvitation);
    console.log('typeof createInvitation:', typeof invitationService.createInvitation);

  try {
      console.log('About to call createInvitation...');
      const result = await invitationService.createInvitation(formData);
      console.log('Success result:', result);
      
      setSuccess('Invitation sent successfully!');
      setFormData({
        email: '',
        role: 'user',
        first_name: '',
        last_name: '',
        suggested_username: '',
        message: ''
      });
      if (onInvitationSent) {
        onInvitationSent();
      }
    } catch (err) {
      console.log('Error caught:', err);
      console.log('Error response:', err.response);
      setError(err.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  // Check if at user limit
  const isAtUserLimit = companyStats && 
    companyStats.max_users !== -1 && 
    companyStats.user_count >= companyStats.max_users;

  return (
    <div className="invitation-form">
      <h3>Invite Team Member</h3>
      
      {companyStats && (
        <div className="user-limit-info">
          <p>Team Members: {companyStats.user_count} / {companyStats.max_users === -1 ? '∞' : companyStats.max_users}</p>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="email">Email Address *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              disabled={loading || isAtUserLimit}
              placeholder="user@example.com"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="role">Role *</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleInputChange}
              disabled={loading || isAtUserLimit}
            >
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="first_name">First Name</label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleInputChange}
              disabled={loading || isAtUserLimit}
              placeholder="John"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="last_name">Last Name</label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleInputChange}
              disabled={loading || isAtUserLimit}
              placeholder="Doe"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="suggested_username">Suggested Username</label>
          <input
            type="text"
            id="suggested_username"
            name="suggested_username"
            value={formData.suggested_username}
            onChange={handleInputChange}
            disabled={loading || isAtUserLimit}
            placeholder="johndoe (optional)"
          />
          <small>They can change this when accepting the invitation</small>
        </div>

        <div className="form-group">
          <label htmlFor="message">Personal Message</label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            disabled={loading || isAtUserLimit}
            placeholder="Welcome to our team! Looking forward to working with you."
            rows="3"
          />
          <small>Optional personal message to include in the invitation</small>
        </div>

        <button 
          type="submit" 
          className="send-invitation-button"
          disabled={loading || isAtUserLimit}
        >
          {loading ? 'Sending...' : 'Send Invitation'}
        </button>
      </form>

      <style jsx>{`
        .invitation-form {
          background: white;
          padding: 24px;
          border-radius: var(--radius-lg);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .user-limit-info {
          background: var(--color-surface-warm);
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-md);
          padding: 12px;
          margin-bottom: 20px;
        }

        .user-limit-info p {
          margin: 0;
          font-weight: 500;
          color: #475569;
        }

        .limit-warning {
          background: var(--color-danger-bg);
          color: var(--color-danger);
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          margin-top: 8px;
          font-size: 0.9rem;
        }
        
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        
        .form-group {
          margin-bottom: 16px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          color: var(--color-text);
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: 14px;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          color: var(--color-text-muted);
          font-size: 0.8rem;
        }

        .send-invitation-button {
          background: var(--color-primary);
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
        }

        .send-invitation-button:hover:not(:disabled) {
          background: var(--color-primary-hover);
          transform: translateY(-1px);
        }

        .send-invitation-button:disabled {
          background: var(--color-text-muted);
          cursor: not-allowed;
          transform: none;
        }

        .error-message {
          background: var(--color-danger-bg);
          color: var(--color-danger);
          padding: 12px;
          border-radius: var(--radius-sm);
          margin-bottom: 16px;
        }

        .success-message {
          background: #f0fdf4;
          color: var(--color-success-text);
          padding: 12px;
          border-radius: var(--radius-sm);
          margin-bottom: 16px;
        }
        
        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default InvitationForm;