import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword, verifyEmail } from './tasteAuth';

// The two screens reached from a link in an email.
//
// Both must render WITHOUT a session. The link is followed in whichever browser
// opened the mail, which is routinely not the one holding the token — and the
// reset flow exists precisely for people who cannot sign in. App.tsx therefore
// checks for these paths BEFORE the auth gate.

const MIN_PASSWORD = 10; // mirrors backend_taste/core/security.py

export function VerifyScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState('');
  // React 18+ mounts effects twice in development StrictMode. Verification is a
  // one-shot token, so the second call would report "no longer valid" on a link
  // that had just worked.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setError('That link is missing its confirmation code.');
      setState('failed');
      return;
    }
    verifyEmail(token)
      .then(() => setState('done'))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setState('failed');
      });
  }, [token]);

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <div className="signin-brand">
          <span className="app-mark">Auxein</span>
          <span className="app-mark-sub">Taste</span>
        </div>
        {state === 'working' && <p className="screen-blurb">Confirming your email…</p>}
        {state === 'done' && (
          <>
            <p className="screen-blurb">Your email is confirmed.</p>
            <button className="btn btn--block" onClick={() => navigate('/home', { replace: true })}>
              Continue
            </button>
          </>
        )}
        {state === 'failed' && (
          <>
            <p className="form-error">{error}</p>
            <p className="form-help">
              Confirmation links can only be used once. You can request a new one from Settings after
              signing in.
            </p>
            <button className="btn btn--block" onClick={() => navigate('/home', { replace: true })}>
              Back to Taste
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !busy && !!token && password.length >= MIN_PASSWORD && confirm === password;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="signin-shell">
        <div className="signin-card">
          <div className="signin-brand">
            <span className="app-mark">Auxein</span>
            <span className="app-mark-sub">Taste</span>
          </div>
          <p className="screen-blurb">
            Your password is set. Any other devices you were signed in on have been signed out.
          </p>
          <button className="btn btn--block" onClick={() => navigate('/home', { replace: true })}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <div className="signin-brand">
          <span className="app-mark">Auxein</span>
          <span className="app-mark-sub">Taste</span>
        </div>
        <p className="screen-blurb">Choose a new password.</p>

        {!token && <p className="form-error">That link is missing its reset code.</p>}

        <div className="sync-form">
          <input
            className="form-input"
            type="password"
            autoComplete="new-password"
            placeholder={`New password (${MIN_PASSWORD}+ characters)`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="form-input"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <button className="btn btn--block" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </div>

        {tooShort && <p className="form-help">Passwords need at least {MIN_PASSWORD} characters.</p>}
        {mismatch && <p className="form-help">The two passwords do not match.</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
