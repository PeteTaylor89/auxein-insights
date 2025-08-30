// src/components/ChangePasswordForm.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {authService} from '@vineyard/shared';

const ChangePasswordForm = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return 'Password must be at least 8 characters long';
    if (!/(?=.*[a-z])/.test(pwd)) return 'Password must contain at least one lowercase letter';
    if (!/(?=.*[A-Z])/.test(pwd)) return 'Password must contain at least one uppercase letter';
    if (!/(?=.*\d)/.test(pwd)) return 'Password must contain at least one number';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    // Validate password strength
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    // Check if new password is different from current
    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authService.changePassword(currentPassword, newPassword);
      setSuccess(true);
      
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Show success message and redirect after delay
      setTimeout(() => {
        navigate('/profile');
      }, 2000);
      
    } catch (err) {
      console.error('Change password error:', err);
      setError(err.response?.data?.detail || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="change-password-form">
        <div className="success-container">
          <h2>✅ Password Changed Successfully!</h2>
          <p>Your password has been updated. Redirecting back to your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="change-password-form">
      <h2>🔒 Change Your Password</h2>
      <p>Please enter your current password and choose a new secure password.</p>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="currentPassword">Current Password</label>
          <input
            type="password"
            id="currentPassword"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            placeholder="Enter your current password"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="newPassword">New Password</label>
          <input
            type="password"
            id="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength="8"
            placeholder="Enter your new password"
          />
          <small className="password-requirements">
            Password must be at least 8 characters with uppercase, lowercase, and numbers
          </small>
        </div>
        
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength="8"
            placeholder="Confirm your new password"
          />
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
          
          <button 
            type="button" 
            className="cancel-button"
            onClick={() => navigate('/profile')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePasswordForm;