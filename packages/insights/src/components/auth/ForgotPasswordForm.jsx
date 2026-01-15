// src/components/auth/ForgotPasswordForm.jsx
import { useState } from 'react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import * as publicAuthService from '../../services/publicAuthService';

function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const service = publicAuthService.default || publicAuthService;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await publicAuthService.forgotPassword(email);
      setSuccess('If an account exists with this email, you will receive a password reset link shortly.');
      setEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}

      <div className="form-group">
        <label htmlFor="email">Email Address</label>
        <input
          type="email"
          id="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="your.email@example.com"
          autoComplete="email"
        />
        <small>We'll send you a link to reset your password</small>
      </div>

      <button 
        type="submit" 
        className="auth-submit-btn"
        disabled={loading}
      >
        {loading ? 'Sending...' : 'Send Reset Link'}
      </button>

      <div className="auth-switch">
        <button 
          type="button" 
          className="link-button" 
          onClick={onBack}
        >
          ← Back to Sign In
        </button>
      </div>
    </form>
  );
}

export default ForgotPasswordForm;