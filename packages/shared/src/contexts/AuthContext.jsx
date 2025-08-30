//packages//shared// src/contexts/AuthContext.js - Minimal Update for Phase 1.1
import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../api/authService';

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
  
  // NEW: Add userType state
  const [userType, setUserType] = useState(null);
  
  const navigate = useNavigate();

  // Check if user is already logged in on app start
  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = localStorage.getItem('accessToken');
      const storedUserType = authService.getCurrentUserType();
      
      if (token && storedUserType) {
        try {
          const userData = await authService.getProfile();
          setUser(userData);
          setUserType(storedUserType);
          setIsAuthenticated(true);
        } catch (error) {
          console.log('Token invalid, clearing storage');
          authService.logout();
          setUserType(null);
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
      
      // Store enhanced auth data using the service
      authService.storeAuthData(response);
      
      // Set user type state
      setUserType(response.user_type);
      
      // Try to get user profile, with fallback for contractors
      try {
        const userData = await authService.getProfile();
        setUser(userData);
        setIsAuthenticated(true);
      } catch (profileError) {
        // For contractors, use login response data as fallback
        if (response.user_type === 'contractor') {
          setUser({
            id: response.user_id,
            username: response.username || email,
            email: email,
            full_name: response.full_name,
            user_type: response.user_type
          });
          setIsAuthenticated(true);
        } else {
          throw profileError;
        }
      }
      
      // Navigate based on user type
      if (response.user_type === 'contractor') {
        // For now, redirect to the same dashboard - you can change this later
        navigate('/dashboard');
      } else {
        navigate('/dashboard');
      }
      
    } catch (err) {
      console.error('Login error:', err);
      setUserType(null);
      
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (err.response?.status === 400) {
        setError('Invalid email/username or password');
      } else if (err.response?.status === 403) {
        setError('Access denied. Contractors can only use the mobile app.');
      } else if (err.response?.status === 423) {
        setError('Account is temporarily locked due to failed login attempts.');
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
      
      // Store enhanced auth data
      authService.storeAuthData(loginResponse);
      setUserType(loginResponse.user_type);
      
      // Get user profile
      const userProfile = await authService.getProfile();
      setUser(userProfile);
      setIsAuthenticated(true);
      
      // Redirect to dashboard
      navigate('/dashboard');
      
    } catch (err) {
      console.error('Registration error:', err);
      setUserType(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setUserType(null);
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
    clearError: () => setError(''),
    
    // NEW: Enhanced auth values
    userType,
    isCompanyUser: () => userType === 'company_user',
    isContractor: () => userType === 'contractor',
    
    // Expose auth service helpers
    getCompanyId: authService.getCompanyId,
    getCompanyIds: authService.getCompanyIds,
    getContractorId: authService.getContractorId
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};