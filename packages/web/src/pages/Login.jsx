// src/pages/Login.jsx
import { useState } from 'react';
import { useAuth } from '@vineyard/shared';


function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  
  const { login, error, loading } = useAuth();
  
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
    <div>
      
      <div className="login-container">
        <div className="login-form-wrapper">
          <h1>Auxein</h1>
   
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
    </div>
  );
}

export default Login;