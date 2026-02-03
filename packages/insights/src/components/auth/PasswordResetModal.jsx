// src/components/auth/PasswordResetModal.jsx
// Modal that opens when user clicks password reset link from email
import { useState, useRef } from 'react';
import { X, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import publicAuthService from '../../services/publicAuthService';
import './AuthModal.css';

function PasswordResetModal({ isOpen, onClose, token }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Track if mousedown started on overlay (for drag-to-close fix)
  const mouseDownOnOverlay = useRef(false);

  if (!isOpen) return null;

  const validatePassword = (pwd) => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must include an uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must include a lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must include a number';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    // Check passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await publicAuthService.resetPassword(token, password);
      setSuccess(true);
      
      // Auto-close after showing success
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  // Handle overlay mouse events to prevent accidental closes
  const handleOverlayMouseDown = (e) => {
    // Only set flag if the mousedown is directly on the overlay
    if (e.target === e.currentTarget) {
      mouseDownOnOverlay.current = true;
    }
  };

  const handleOverlayMouseUp = (e) => {
    // Only close if both mousedown AND mouseup were on the overlay
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownOnOverlay.current = false;
  };

  return (
    <div 
      className="auth-modal-overlay" 
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
    >
      <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="auth-modal-header">
          <h2>{success ? 'Password Reset!' : 'Set New Password'}</h2>
          <p>
            {success 
              ? 'You can now sign in with your new password' 
              : 'Create a strong password for your account'
            }
          </p>
        </div>

        <div className="auth-modal-body">
          {success ? (
            <div className="reset-success">
              <CheckCircle size={64} className="success-icon" />
              <p>Your password has been reset successfully.</p>
              <p className="success-hint">Redirecting to sign in...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              {error && (
                <div className="auth-error">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="new-password">New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small>Must include uppercase, lowercase, and number</small>
              </div>

              <div className="form-group">
                <label htmlFor="confirm-password">Confirm Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <small className="password-mismatch">Passwords do not match</small>
                )}
                {confirmPassword && password === confirmPassword && (
                  <small className="password-match">✓ Passwords match</small>
                )}
              </div>

              <button 
                type="submit" 
                className="auth-submit-btn"
                disabled={loading || !password || !confirmPassword}
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default PasswordResetModal;