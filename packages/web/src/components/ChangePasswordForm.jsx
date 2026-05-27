import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '@vineyard/shared';

const ChangePasswordForm = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return 'Password must be at least 8 characters';
    if (!/(?=.*[a-z])/.test(pwd)) return 'Password must include a lowercase letter';
    if (!/(?=.*[A-Z])/.test(pwd)) return 'Password must include an uppercase letter';
    if (!/(?=.*\d)/.test(pwd)) return 'Password must include a number';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      await authService.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => navigate('/profile'), 1500);
    } catch (err) {
      console.error('Change password error:', err);
      setError(err.response?.data?.detail || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="change-password-page">
      <div className="login-form-wrapper">
        <div className="login-brand">
          <h1>Change password</h1>
        </div>

        {success ? (
          <div className="login-success">
            Password updated. Redirecting to your profile…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current password</label>
              <input
                type="password"
                id="currentPassword"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New password</label>
              <input
                type="password"
                id="newPassword"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
              <small className="cpw-hint">
                At least 8 characters with upper, lower, and a number.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                type="password"
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="cpw-actions">
              <button
                type="button"
                className="cpw-cancel"
                onClick={() => navigate('/profile')}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="login-button cpw-submit"
                disabled={loading}
              >
                {loading ? 'Changing…' : 'Change password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordForm;
