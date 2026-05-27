import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { requestPasswordReset, resetPassword } from '@vineyard/shared';
import Logo from '../assets/logo-mark.png';

const ResetPasswordForm = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setError('Invalid or expired reset link. Request a new one from the sign-in page.');
      return;
    }
    setToken(tokenParam);
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setMessage('Password reset. Redirecting to sign in…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-form-wrapper">
        <div className="login-brand">
          <img src={Logo} alt="Auxein Grow" className="login-logo" />
          <h1>Auxein Grow</h1>
          <p>Reset your password</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="password">New password</label>
            <input
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading || !token}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading || !token}
            />
          </div>

          {message && <div className="login-success">{message}</div>}
          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="login-button"
            disabled={loading || !token}
          >
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>

        <div className="login-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
};


const ForgotPasswordForm = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await requestPasswordReset(email);
      setMessage('If that email is on file, a reset link is on its way. Check your inbox.');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-form-wrapper">
        <div className="login-brand">
          <img src={Logo} alt="Auxein Grow" className="login-logo" />
          <h1>Auxein Grow</h1>
          <p>Forgot your password?</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@vineyard.co.nz"
              disabled={loading}
            />
          </div>

          {message && <div className="login-success">{message}</div>}
          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="login-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
};

export { ForgotPasswordForm, ResetPasswordForm };
