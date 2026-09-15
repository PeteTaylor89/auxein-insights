// src/pages/Login.jsx — forked login, deliberately minimal.
//
// A fork of the Insights auth UI rather than a shared component (plan §4 task 7):
// admin needs sign-in and nothing else. No signup, no email verification, no
// marketing preferences, no password reset self-service — every one of those is
// a public-signup affordance and none of them belong on a staff-only origin.
//
// NOTE: the credentials here are GROW credentials, not Insights ones. See
// adminAuthService for why that direction is the only one that works.
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Shield, RefreshCw } from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

export default function Login() {
  const { login, isAuthenticated, loading: authLoading } = useAdminAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!authLoading && isAuthenticated) {
    const to = location.state?.from || '/';
    return <Navigate to={to} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Resolves even when only the Grow half succeeded — AdminRoute renders
      // the diagnosis for a half-session, so don't treat that as a login error.
      await login(email.trim(), password);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        (typeof detail === 'object' ? detail.message : detail)
        || err?.message
        || 'Sign-in failed.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <Shield size={22} />
          <span>Auxein Admin</span>
        </div>
        <p className="login-sub">Sign in with your Auxein Grow credentials.</p>

        <label className="login-label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="login-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          autoFocus
        />

        <label className="login-label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="login-button" disabled={submitting}>
          {submitting ? <><RefreshCw size={15} className="spin" /> Signing in…</> : 'Sign in'}
        </button>
      </form>

      <style>{`
        .login-wrap {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: #FAF9F5; padding: 24px;
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .login-card {
          width: 100%; max-width: 380px; background: #fff; padding: 32px;
          border: 1px solid #E5E2D9; border-radius: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .login-brand {
          display: flex; align-items: center; gap: 9px;
          color: #5B6830; font-size: 18px; font-weight: 700;
        }
        .login-sub { margin: 8px 0 24px; font-size: 13px; color: #77736A; }
        .login-label {
          display: block; font-size: 12px; font-weight: 600;
          color: #55524A; margin-bottom: 6px;
        }
        .login-input {
          width: 100%; box-sizing: border-box; padding: 9px 11px; margin-bottom: 16px;
          border: 1px solid #DAD6CB; border-radius: 6px; font-size: 14px;
          font-family: inherit; background: #fff; color: #2F2F2F;
        }
        .login-input:focus { outline: none; border-color: #5B6830; }
        .login-error {
          background: #FDF3EE; color: #B3541E; border: 1px solid #F0DACE;
          padding: 9px 11px; border-radius: 6px; font-size: 13px; margin-bottom: 16px;
        }
        .login-button {
          width: 100%; padding: 10px 16px; border: none; border-radius: 6px;
          background: #5B6830; color: #fff; font-size: 14px; font-weight: 600;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 8px; font-family: inherit;
        }
        .login-button:disabled { opacity: .65; cursor: default; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
