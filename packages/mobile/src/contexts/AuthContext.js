// mobile/src/contexts/AuthContext.js — Mobile auth provider (no shared package dependency)
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../api/services';

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
  const [userTypeRole, setUserTypeRole] = useState(null);

  // Check stored auth on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        if (token) {
          const userData = await authApi.getProfile();
          setUser(userData);
          const storedRole = await SecureStore.getItemAsync('userTypeRole');
          setUserTypeRole(storedRole || userData.user_type_role || userData.user_type || 'company_user');
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.log('Auth check failed, clearing tokens');
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        await SecureStore.deleteItemAsync('userTypeRole');
      } finally {
        setInitialLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(async (identifier, password) => {
    setLoading(true);
    setError('');
    try {
      const data = await authApi.login(identifier, password);
      const { access_token, refresh_token, user_type_role, user_type } = data;

      await SecureStore.setItemAsync('accessToken', access_token);
      if (refresh_token) await SecureStore.setItemAsync('refreshToken', refresh_token);
      const role = user_type_role || user_type || 'company_user';
      await SecureStore.setItemAsync('userTypeRole', role);

      const userData = await authApi.getProfile();
      setUser(userData);
      setUserTypeRole(role);
      setIsAuthenticated(true);
      return userData;
    } catch (err) {
      const detail = err.response?.data?.detail;
      let message = 'Login failed';
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail.map(e => e.msg || JSON.stringify(e)).join(', ');
      } else if (detail?.msg) {
        message = detail.msg;
      }
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('userTypeRole');
    setUser(null);
    setUserTypeRole(null);
    setIsAuthenticated(false);
  }, []);

  // Role helpers. Mirrors the shared web AuthContext API so screens can branch
  // on permissions without duplicating role-string checks. The 5-tier hierarchy
  // is: auxein_admin > company_admin > company_manager > company_user > contractor.
  const isContractor = userTypeRole === 'contractor';
  const isManagerOrAbove = ['auxein_admin', 'company_admin', 'company_manager'].includes(userTypeRole);
  const isAdmin = ['auxein_admin', 'company_admin'].includes(userTypeRole);

  const value = {
    user,
    loading,
    error,
    isAuthenticated,
    initialLoading,
    userTypeRole,
    isContractor,
    isManagerOrAbove,
    isAdmin,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
