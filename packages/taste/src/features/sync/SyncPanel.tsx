import { useEffect, useState } from 'react';
import { getUser, isAuthed, login, logout } from '@/auth/publicAuth';
import type { PublicUser } from '@/auth/publicAuth';
import { getSyncStatus, subscribeSync, syncNow } from '@/sync/engine';
import type { SyncStatus } from '@/sync/engine';

const STATE_LABEL: Record<SyncStatus['state'], string> = {
  idle: 'Up to date',
  syncing: 'Syncing…',
  offline: 'Offline — will sync when back online',
  unauthed: 'Not signed in',
  error: 'Sync error',
};

function fmtTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString();
}

// Account + sync. The app is local-first: signing in is optional and only enables
// cloud backup/sync of your notes. Identity is the existing Insights account.
export function SyncPanel() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [authed, setAuthed] = useState(isAuthed());
  const [user, setUser] = useState<PublicUser | null>(getUser());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeSync(setStatus), []);

  const doLogin = async () => {
    setBusy(true);
    setError('');
    try {
      const u = await login(email.trim(), password);
      setAuthed(true);
      setUser(u);
      setPassword('');
      void syncNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doLogout = () => {
    logout();
    setAuthed(false);
    setUser(null);
  };

  return (
    <div className="sync-panel">
      <h2 className="screen-subtitle">Account &amp; sync</h2>

      {!authed ? (
        <>
          <p className="screen-blurb">
            Sign in with your Auxein Insights account to back up and sync your tasting notes. Optional — everything works
            offline on this device without it.
          </p>
          <div className="sync-form">
            <input
              className="form-input"
              type="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="form-input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doLogin();
              }}
            />
            <button className="btn" disabled={busy || !email.trim() || !password} onClick={() => void doLogin()}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </>
      ) : (
        <>
          <div className="kv">
            <div className="kv-row">
              <span>Signed in</span>
              <span>{user?.email ?? user?.first_name ?? 'Insights account'}</span>
            </div>
            <div className="kv-row">
              <span>Status</span>
              <span>{STATE_LABEL[status.state]}</span>
            </div>
            <div className="kv-row">
              <span>Pending changes</span>
              <span>{status.pending}</span>
            </div>
            <div className="kv-row">
              <span>Last synced</span>
              <span>{fmtTime(status.lastSyncedAt)}</span>
            </div>
          </div>
          {status.error && <p className="form-error">{status.error}</p>}
          <div className="settings-actions">
            <button className="btn" disabled={status.state === 'syncing'} onClick={() => void syncNow()}>
              {status.state === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>
            <button className="btn btn--ghost" onClick={doLogout}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
