import { getUser, logout } from '@/auth/publicAuth';

// Account panel (Settings). Taste is server-backed and you're always signed in
// inside the app, so this just shows who you are and offers sign-out. Identity is
// the existing Auxein Insights account; your data lives in the cloud and loads on
// any device you sign in on.
export function SyncPanel() {
  const user = getUser();
  return (
    <div className="sync-panel">
      <h2 className="screen-subtitle">Account</h2>
      <div className="kv">
        <div className="kv-row">
          <span>Signed in</span>
          <span>{user?.email ?? user?.first_name ?? 'Insights account'}</span>
        </div>
        <div className="kv-row">
          <span>Storage</span>
          <span>Synced to your Auxein account</span>
        </div>
      </div>
      <div className="settings-actions">
        <button className="btn btn--ghost" onClick={() => logout()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
