// src/contexts/PublicAuthContext.jsx - Auth Context using consistent service pattern
import { createContext, useContext, useState, useEffect } from 'react';
import publicAuthService from '../services/publicAuthService';
import { startEventTracking, stopEventTracking } from '../utils/eventTracker';

const PublicAuthContext = createContext(null);

// Grow -> Insights SSO handoff: Grow opens us with #insights_sso=<grow_token>.
const readSsoTokenFromHash = () => {
  const m = (window.location.hash || '').match(/[#&]insights_sso=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};
const clearSsoHash = () => {
  // Strip the token from the URL (and history entry) without a reload.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
};

export const PublicAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check for existing auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Grow -> Insights SSO: exchange the handed-off Grow token for a native
      // Insights session, then carry on as a normal logged-in user.
      const ssoToken = readSsoTokenFromHash();
      if (ssoToken) {
        try {
          const response = await publicAuthService.exchangeGrowToken(ssoToken);
          setUser(response.user);
          setIsAuthenticated(true);
          startEventTracking();
          clearSsoHash();
          setLoading(false);
          return;
        } catch (error) {
          // Exchange failed (expired/invalid token) — fall through to normal check.
          clearSsoHash();
        }
      }

      const token = publicAuthService.getToken();
      const storedUser = publicAuthService.getStoredUser();

      if (token && storedUser) {
        try {
          // Verify token is still valid by fetching current user
          const currentUser = await publicAuthService.getCurrentUser();
          setUser(currentUser);
          setIsAuthenticated(true);
          startEventTracking();
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
    startEventTracking();
    return response;
  };

  const signup = async (userData) => {
    const response = await publicAuthService.signup(userData);
    return response;
  };

  const logout = () => {
    stopEventTracking();
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