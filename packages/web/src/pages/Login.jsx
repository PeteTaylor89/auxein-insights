// src/pages/Login.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '@vineyard/shared';
import Logo from '../assets/App_Logo_September 2025.jpg';

function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [successMessage, setSuccessMessage] = useState('');

  const { login, error, loading } = useAuth();

  // Pre-fill email from query params (e.g. after invitation acceptance)
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
      <div className="login-form-wrapper">
        
        {/* Header: logo + primary heading */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img 
            src={Logo} 
            alt="Auxein Logo" 
            style={{ width: '120px', marginBottom: '1rem' }}
          />

          <h1
            style={{
              fontFamily: 'Calibri, sans-serif',
              fontSize: '20pt',
              fontWeight: 'bold',
              color: '#2F2F2F' // Charcoal Black from style guide
            }}
          >
            Auxein Grow
          </h1>
        </div>

        <form onSubmit={handleLoginSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email or Username</label>
            <input
              type="text"
              id="email"
              name="email"
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
              value={formData.password}
              onChange={handleInputChange}
              required
              disabled={loading}
            />
          </div>
          
          {successMessage && (
            <div style={{
              padding: '12px 16px',
              marginBottom: '16px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '8px',
              color: '#166534',
              fontSize: '14px'
            }}>
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
            {loading ? 'Logging in...' : 'Login'}
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
