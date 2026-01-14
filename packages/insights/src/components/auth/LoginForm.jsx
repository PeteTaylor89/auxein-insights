// src/components/auth/LoginForm.jsx
import { useState } from 'react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';

function LoginForm({ onSuccess, onSwitchToSignup, onSwitchToForgot }) {
  const { login } = usePublicAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError(''); // Clear error on input
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(formData.email, formData.password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      {error && (
        <div className="auth-error">
          {error}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="your.email@example.com"
          autoComplete="email"
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          required
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>

      <div className="form-footer">
        <button 
          type="button" 
          className="link-button" 
          onClick={onSwitchToForgot}
        >
          Forgot password?
        </button>
      </div>

      <button 
        type="submit" 
        className="auth-submit-btn"
        disabled={loading}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <div className="auth-switch">
        Don't have an account?{' '}
        <button 
          type="button" 
          className="link-button" 
          onClick={onSwitchToSignup}
        >
          Create one
        </button>
      </div>
    </form>
  );
}

export default LoginForm;