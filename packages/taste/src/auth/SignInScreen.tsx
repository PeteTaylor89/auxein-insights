import { useState } from 'react';
import { login, register, requestPasswordReset } from './tasteAuth';

// The sign-in gate.
//
// F1 (2026-09-21): this used to say "Sign in with your Auxein Insights account"
// and post to the main API. Taste now owns its own accounts, which means this
// screen has to be able to CREATE one — there is no other route in. Hence the
// two modes.
//
// The forgot-password path landed once `backend_taste/services/email.py` could
// actually deliver the link; before that it would have led somewhere that could
// not help.

type Mode = 'signin' | 'register' | 'forgot';

// Mirrors MIN_PASSWORD_LENGTH in backend_taste/core/security.py. Checked here as
// well so the failure is immediate rather than a round-trip, but the server is
// the one that decides.
const MIN_PASSWORD = 10;

export function SignInScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const registering = mode === 'register';
  const forgot = mode === 'forgot';
  const tooShort = registering && password.length > 0 && password.length < MIN_PASSWORD;
  const canSubmit = forgot
    ? !busy && !!email.trim()
    : !busy && !!email.trim() && !!password && !tooShort;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      if (forgot) {
        await requestPasswordReset(email.trim());
        // Deliberately unconditional. The server answers the same way whether or
        // not the address is registered, so saying "check your email" for every
        // address is the only message that does not leak who has an account.
        setSentTo(email.trim());
      } else if (registering) {
        await register(email.trim(), password, displayName.trim(), handle.trim().toLowerCase());
      } else {
        await login(email.trim(), password);
      }
      // On success the auth event swaps this screen out; nothing to do here.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setSentTo('');
  };

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <div className="signin-brand">
          <span className="app-mark">Auxein</span>
          <span className="app-mark-sub">Taste</span>
        </div>

        {/* `.chip` / `.chip--active`, not a segmented control: sub-pass 3 removed
            the segmented component's styles (only a tap-highlight selector for
            `.segmented-item` survives), and chips are the app's current uniform
            language for a choice. */}
        <div className="chip-row signin-modes" role="tablist">
          <button
            className={`chip${!registering ? ' chip--active' : ''}`}
            role="tab"
            aria-selected={!registering}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
          <button
            className={`chip${registering ? ' chip--active' : ''}`}
            role="tab"
            aria-selected={registering}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>

        <p className="screen-blurb">
          {forgot
            ? 'Enter your email and we will send you a link to choose a new password.'
            : registering
              ? 'Your tasting notes sync to this account on every device you sign in on.'
              : 'Sign in to your Auxein Taste account.'}
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
          {!forgot && (
            <input
              className="form-input"
              type="password"
              // Tells a password manager to offer a new password rather than an
              // existing one — and stops it autofilling the sign-in password into
              // a sign-up form.
              autoComplete={registering ? 'new-password' : 'current-password'}
              placeholder={registering ? `Password (${MIN_PASSWORD}+ characters)` : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          )}

          {registering && (
            <>
              <input
                className="form-input"
                type="text"
                autoComplete="name"
                placeholder="Display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <input
                className="form-input"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Handle (optional)"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
              <p className="form-help">
                A handle is how others will find you when sharing. Lowercase letters, numbers and
                underscores. You can pick one later.
              </p>
            </>
          )}

          <button className="btn btn--block" disabled={!canSubmit} onClick={() => void submit()}>
            {busy
              ? forgot
                ? 'Sending…'
                : registering
                  ? 'Creating…'
                  : 'Signing in…'
              : forgot
                ? 'Send reset link'
                : registering
                  ? 'Create account'
                  : 'Sign in'}
          </button>
        </div>

        {sentTo && (
          <p className="form-help">
            If {sentTo} has an Auxein Taste account, a reset link is on its way. The link expires in
            two hours.
          </p>
        )}
        {tooShort && <p className="form-help">Passwords need at least {MIN_PASSWORD} characters.</p>}
        {error && <p className="form-error">{error}</p>}

        {!registering && (
          <p className="form-help signin-alt">
            {forgot ? (
              <button className="linklike" onClick={() => switchMode('signin')}>
                Back to sign in
              </button>
            ) : (
              <button className="linklike" onClick={() => switchMode('forgot')}>
                Forgot your password?
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
