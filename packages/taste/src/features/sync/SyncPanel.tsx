import { useState } from 'react';
import { getUser, logout, logoutAll, resendVerification, updateProfile } from '@/auth/tasteAuth';

// Account panel (Settings).
//
// F1 (2026-09-21): identity is a Taste account now, not an Insights one, so this
// panel has to be able to edit it — a handle is how someone addresses a share,
// and until F1 there was nowhere to set one.
export function SyncPanel() {
  const user = getUser();
  const [handle, setHandle] = useState(user?.handle ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [resent, setResent] = useState(false);

  const dirty = handle.trim().toLowerCase() !== (user?.handle ?? '') || displayName.trim() !== (user?.display_name ?? '');

  const save = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await updateProfile({
        // A handle cannot be removed once set (the server rejects it), so an
        // empty box means "leave it alone", not "clear it".
        ...(handle.trim() ? { handle: handle.trim().toLowerCase() } : {}),
        display_name: displayName.trim() || null,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError('');
    setResent(false);
    try {
      await resendVerification();
      setResent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sync-panel">
      <h2 className="screen-subtitle">Account</h2>
      <div className="kv">
        <div className="kv-row">
          <span>Signed in</span>
          <span>{user?.email ?? 'Taste account'}</span>
        </div>
        <div className="kv-row">
          <span>Storage</span>
          <span>Synced to your Auxein Taste account</span>
        </div>
      </div>

      {/* Shown only while unconfirmed. Nothing is gated on verification today
          (TASTE_REQUIRE_VERIFIED_EMAIL is off until a real send is confirmed in
          the deployed environment), so this is an offer, not a blocker. */}
      {user && user.is_verified === false && (
        <p className="form-help">
          Your email is not confirmed yet.{' '}
          <button className="linklike" disabled={busy} onClick={() => void resend()}>
            Send the confirmation email again
          </button>
        </p>
      )}
      {resent && <p className="form-help">Confirmation email sent.</p>}

      <div className="sync-form">
        <input
          className="form-input"
          type="text"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          className="form-input"
          type="text"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <p className="form-help">Your handle is how others address a share. It cannot be removed once set.</p>
        <button className="btn btn--block" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
      {saved && <p className="form-help">Saved.</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="settings-actions">
        <button className="btn btn--ghost" onClick={() => void logout()}>
          Sign out
        </button>
        {/* Distinct from sign out: this bumps the server's token_version, so a
            session on a device you no longer have ends now rather than in an
            hour. That is the point of offering it separately. */}
        <button className="btn btn--ghost" onClick={() => void logoutAll()}>
          Sign out everywhere
        </button>
      </div>
    </div>
  );
}
