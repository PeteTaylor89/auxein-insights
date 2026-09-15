// src/components/AdminRoute.jsx — the door.
//
// Requires BOTH admin flags and, when one is missing, SAYS WHICH. That is the
// whole point of this component. The predictable failure on this surface is a
// Grow admin whose `public_users` row lacks `is_admin` — they log in fine, the
// app loads, half the nav works, and the other half bounces. A bare
// `<Navigate to="/" />` turns that into a mystery; naming the missing flag
// turns it into a one-line fix.
//
// This is a client-side guard and is cosmetic — every endpoint behind it is
// gated server-side by `require_admin` or the Grow role check. Being on its own
// origin changes nothing about that.
import { Navigate, useLocation } from 'react-router-dom';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

function HalfSession({ isGrowAdmin, isInsightsAdmin, growUser, insightsError, onLogout }) {
  const missing = !isGrowAdmin ? 'Grow' : 'Insights';

  return (
    <div className="half-session">
      <ShieldAlert size={36} className="half-session-icon" />
      <h1>Admin access incomplete</h1>
      <p className="half-session-lead">
        You are signed in as <strong>{growUser?.email}</strong>, but only one half of
        the admin session is valid. The <strong>{missing}</strong> half is missing, so
        this account cannot use the admin site.
      </p>

      <ul className="half-session-flags">
        <li className={isGrowAdmin ? 'ok' : 'bad'}>
          <code>users.user_type == 'auxein_admin'</code>
          <span>{isGrowAdmin ? 'present' : 'MISSING'}</span>
        </li>
        <li className={isInsightsAdmin ? 'ok' : 'bad'}>
          <code>public_users.is_admin</code>
          <span>{isInsightsAdmin ? 'present' : 'MISSING'}</span>
        </li>
      </ul>

      <p className="half-session-fix">
        {!isInsightsAdmin && isGrowAdmin ? (
          <>
            The Grow role is right but the linked Insights profile is not flagged as an
            admin. Newer accounts get this automatically; this one predates that or was
            never linked. Setting <code>is_admin</code> on the matching{' '}
            <code>public_users</code> row fixes it.
          </>
        ) : (
          <>This account is not an Auxein platform admin.</>
        )}
      </p>

      {insightsError && (
        <p className="half-session-detail">Exchange reported: {insightsError.message}</p>
      )}

      <button type="button" onClick={onLogout} className="half-session-button">
        Sign out
      </button>

      <style>{`
        .half-session {
          max-width: 620px;
          margin: 0 auto;
          padding: 64px 24px;
          text-align: left;
          color: #2F2F2F;
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .half-session-icon { color: #B3541E; }
        .half-session h1 { font-size: 22px; margin: 16px 0 12px; }
        .half-session-lead { line-height: 1.6; margin-bottom: 20px; }
        .half-session-flags {
          list-style: none; padding: 0; margin: 0 0 20px;
          border: 1px solid #E5E2D9; border-radius: 8px; overflow: hidden;
        }
        .half-session-flags li {
          display: flex; justify-content: space-between; align-items: center;
          gap: 12px; padding: 10px 14px; font-size: 13px;
          border-bottom: 1px solid #E5E2D9; flex-wrap: wrap;
        }
        .half-session-flags li:last-child { border-bottom: none; }
        .half-session-flags code { font-size: 12px; word-break: break-all; }
        .half-session-flags li span { font-weight: 700; font-size: 11px; letter-spacing: .04em; }
        .half-session-flags li.ok { background: #F4F7EE; }
        .half-session-flags li.ok span { color: #5B6830; }
        .half-session-flags li.bad { background: #FDF3EE; }
        .half-session-flags li.bad span { color: #B3541E; }
        .half-session-fix { line-height: 1.6; font-size: 14px; color: #55524A; }
        .half-session-detail {
          font-size: 12px; color: #77736A; margin-top: 12px;
          padding: 8px 12px; background: #FAF9F5; border-radius: 6px;
        }
        .half-session-button {
          margin-top: 24px; padding: 10px 18px; border-radius: 6px;
          border: 1px solid #5B6830; background: #5B6830; color: #fff;
          font-size: 14px; cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default function AdminRoute({ children }) {
  const {
    loading, isAuthenticated, isGrowAdmin, isInsightsAdmin, isFullAdmin,
    growUser, insightsError, logout,
  } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: 12, color: '#5B6830',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}>
        <RefreshCw size={28} className="spin" />
        <p style={{ color: '#77736A', fontSize: 14 }}>Checking admin access…</p>
        <style>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Authenticated, but not on both sides. Explain rather than redirect.
  if (!isFullAdmin) {
    return (
      <HalfSession
        isGrowAdmin={isGrowAdmin}
        isInsightsAdmin={isInsightsAdmin}
        growUser={growUser}
        insightsError={insightsError}
        onLogout={logout}
      />
    );
  }

  return children;
}
