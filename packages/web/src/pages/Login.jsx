// src/pages/Login.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '@vineyard/shared';
import Logo from '../assets/logo-mark.png';
import SiteBanner from '../components/SiteBanner';

function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [successMessage, setSuccessMessage] = useState('');

  const { login, error, loading } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    const message = params.get('message');
    if (email) {
      setFormData(prev => ({ ...prev, email }));
    }
    if (message) {
      setSuccessMessage(decodeURIComponent(message));
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    await login(formData.email, formData.password);
  };

  return (
    <div className="login-container">
      <div className="login-banner-slot">
        <SiteBanner />
      </div>
      <div className="login-form-wrapper">
        <div className="login-brand">
          <img src={Logo} alt="Auxein Grow" className="login-logo" />
          <h1>Auxein Grow</h1>
          <p>Vineyard Management</p>
        </div>

        <form onSubmit={handleLoginSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleInputChange}
              required
              disabled={loading}
            />
          </div>

          {successMessage && (
            <div className="login-success">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="login-links">
          <a href="/forgot-password">Forgot your password?</a>
        </div>
      </div>
    </div>
  );
}

export default Login;
