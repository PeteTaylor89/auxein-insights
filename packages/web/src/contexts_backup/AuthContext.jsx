// src/contexts/AuthContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {authService} from '@vineyard/shared';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  const navigate = useNavigate();

  // Check if user is already logged in on app start
  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const userData = await authService.getProfile();
          setUser(userData);
          setIsAuthenticated(true);
        } catch (error) {
          console.log('Token invalid, clearing storage');
          authService.logout();
        }
      }
      setInitialLoading(false);
    };

    checkAuthStatus();
  }, []);

  const login = async (email, password) => {
    try {
      setLoading(true);
      setError('');
      
      const response = await authService.login(email, password);
      
      // Store tokens
      localStorage.setItem('accessToken', response.access_token);
      localStorage.setItem('refreshToken', response.refresh_token);
      
      // Get user profile
      const userData = await authService.getProfile();
      setUser(userData);
      setIsAuthenticated(true);
      
      // Redirect to dashboard or home
      navigate('/dashboard');
      
    } catch (err) {
      console.error('Login error:', err);
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (err.response?.status === 400) {
        setError('Invalid email/username or password');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setLoading(true);
      setError('');
      
      // Register the user
      const newUser = await authService.register(userData);
      
      // Automatically log them in after registration
      const loginResponse = await authService.login(userData.email, userData.password);
      
      // Store tokens
      localStorage.setItem('accessToken', loginResponse.access_token);
      localStorage.setItem('refreshToken', loginResponse.refresh_token);
      
      // Get user profile
      const userProfile = await authService.getProfile();
      setUser(userProfile);
      setIsAuthenticated(true);
      
      // Redirect to dashboard
      navigate('/dashboard');
      
    } catch (err) {
      console.error('Registration error:', err);
      // Don't set loading to false yet, let the calling component handle it
      throw err; // Re-throw so the component can handle the error
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
    setError('');
    navigate('/login');
  };

  const refreshAuthToken = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await authService.refreshToken(refreshToken);
      
      // Update stored tokens
      localStorage.setItem('accessToken', response.access_token);
      localStorage.setItem('refreshToken', response.refresh_token);
      
      return response.access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      throw error;
    }
  };

  const updateUserProfile = async (updatedData) => {
    try {
      setLoading(true);
      setError('');
      
      // Call your API to update user profile
      const updatedUser = await authService.updateProfile(updatedData);
      setUser(updatedUser);
      
      return updatedUser;
    } catch (err) {
      console.error('Profile update error:', err);
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Failed to update profile');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    error,
    isAuthenticated,
    initialLoading,
    login,
    register,
    logout,
    refreshAuthToken,
    updateUserProfile,
    clearError: () => setError('')
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};