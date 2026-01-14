// src/contexts/PublicAuthContext.jsx - Auth Context using consistent service pattern
import { createContext, useContext, useState, useEffect } from 'react';
import publicAuthService from '../services/publicAuthService';

const PublicAuthContext = createContext(null);

export const PublicAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check for existing auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = publicAuthService.getToken();
      const storedUser = publicAuthService.getStoredUser();

      if (token && storedUser) {
        try {
          // Verify token is still valid by fetching current user
          const currentUser = await publicAuthService.getCurrentUser();
          setUser(currentUser);
          setIsAuthenticated(true);
        } catch (error) {
          // Token invalid, clear storage
          logout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    const response = await publicAuthService.login(email, password);
    setUser(response.user);
    setIsAuthenticated(true);
    return response;
  };

  const signup = async (userData) => {
    const response = await publicAuthService.signup(userData);
    return response;
  };

  const logout = () => {
    publicAuthService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const updateProfile = async (updates) => {
    const updatedUser = await publicAuthService.updateProfile(updates);
    setUser(updatedUser);
    return updatedUser;
  };

  const updateMarketingPreferences = async (preferences) => {
    await publicAuthService.updateMarketingPreferences(preferences);
    // Refresh user data
    const currentUser = await publicAuthService.getCurrentUser();
    setUser(currentUser);
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    signup,
    logout,
    updateProfile,
    updateMarketingPreferences
  };

  return (
    <PublicAuthContext.Provider value={value}>
      {children}
    </PublicAuthContext.Provider>
  );
};

export const usePublicAuth = () => {
  const context = useContext(PublicAuthContext);
  if (!context) {
    throw new Error('usePublicAuth must be used within PublicAuthProvider');
  }
  return context;
};