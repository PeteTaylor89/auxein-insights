// src/contexts/AdminAuthContext.jsx — holds BOTH halves of the admin session.
//
// The admin surface spans two identity systems, and a session is only whole
// when both are present:
//   Grow     `users.user_type == 'auxein_admin'`  -> /api/admin/*, /api/v1/grow-admin/*
//   Insights `public_users.is_admin`              -> /api/v1/admin/*
//
// The dangerous state is HALF a session, because it does not look like an error:
// the app loads, the Grow pages work, and every Insights page bounces. So this
// context tracks the two halves separately and always knows which one is missing.
import {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import { setInsightsTokenExpiredHandler, INSIGHTS_TOKEN_KEY } from '../services/publicApi';
import {
  adminLogin, adminLogout, exchangeForInsightsToken,
  getStoredGrowUser, getStoredInsightsUser,
} from '../services/adminAuthService';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [growUser, setGrowUser] = useState(null);
  const [insightsUser, setInsightsUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when the Grow half succeeded but the Insights half did not — the
  // "admin #2" case (a Grow admin whose public_users row lacks is_admin).
  const [insightsError, setInsightsError] = useState(null);

  // Rehydrate from localStorage on mount. Both halves or neither: a stored Grow
  // session with no Insights token is re-exchanged rather than trusted.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const storedGrow = getStoredGrowUser();
      const growToken = localStorage.getItem('accessToken');

      if (!storedGrow || !growToken) {
        // The Grow half is gone but our own keys may not be. @vineyard/shared's
        // client tears down a dead session itself (clearSession + redirect to
        // /login) and knows nothing about admin_insights_token — so without
        // this, a refresh failure leaves a stale Insights token behind for the
        // next sign-in to trip over. Both halves or neither.
        if (localStorage.getItem(INSIGHTS_TOKEN_KEY)) adminLogout();
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setGrowUser(storedGrow);

      const storedInsights = getStoredInsightsUser();
      const insightsToken = localStorage.getItem(INSIGHTS_TOKEN_KEY);

      if (storedInsights && insightsToken) {
        if (!cancelled) {
          setInsightsUser(storedInsights);
          setLoading(false);
        }
        return;
      }

      // Grow half survived a reload but the Insights half did not. Re-mint it
      // rather than showing a login the user does not actually need.
      try {
        const { user } = await exchangeForInsightsToken(growToken);
        if (!cancelled) setInsightsUser(user);
      } catch (err) {
        if (!cancelled) setInsightsError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(() => {
    adminLogout();
    setGrowUser(null);
    setInsightsUser(null);
    setInsightsError(null);
  }, []);

  // Re-exchange when publicApi sees a 401. Single-flight: a dashboard firing
  // several Insights calls at once must produce ONE exchange, not six.
  const inFlight = useRef(null);
  const reExchange = useCallback(async () => {
    const growToken = localStorage.getItem('accessToken');
    if (!growToken) {
      logout();
      return null;
    }
    if (!inFlight.current) {
      inFlight.current = exchangeForInsightsToken(growToken)
        .then(({ token, user }) => {
          setInsightsUser(user);
          setInsightsError(null);
          return token;
        })
        .catch((err) => {
          // The Grow token is dead too (or the profile lost is_admin). Tear the
          // whole session down rather than leaving half of it standing.
          setInsightsError(err);
          logout();
          return null;
        })
        .finally(() => { inFlight.current = null; });
    }
    return inFlight.current;
  }, [logout]);

  useEffect(() => {
    setInsightsTokenExpiredHandler(reExchange);
    return () => setInsightsTokenExpiredHandler(null);
  }, [reExchange]);

  const login = useCallback(async (email, password) => {
    const result = await adminLogin(email, password);
    setGrowUser(result.growUser);
    setInsightsUser(result.insightsUser);
    setInsightsError(result.insightsError || null);
    return result;
  }, []);

  const value = useMemo(() => {
    const isGrowAdmin = growUser?.userTypeRole === 'auxein_admin';
    const isInsightsAdmin = !!insightsUser?.is_admin;

    return {
      growUser,
      insightsUser,
      loading,
      insightsError,
      isAuthenticated: !!growUser,
      isGrowAdmin,
      isInsightsAdmin,
      // The only flag that means "this session can use the whole admin site".
      isFullAdmin: isGrowAdmin && isInsightsAdmin,
      login,
      logout,
    };
  }, [growUser, insightsUser, loading, insightsError, login, logout]);

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}

export default AdminAuthContext;
