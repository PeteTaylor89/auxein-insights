import { useState } from 'react';
import { login } from './publicAuth';

// The sign-in gate. Taste is server-backed, so identity (your Auxein Insights
// account) is required before any data loads. On success, login() emits an auth
// change and the app shell swaps this out for the app.
export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const doLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <div className="signin-brand">
          <span className="app-mark">Auxein</span>
          <span className="app-mark-sub">Taste</span>
        </div>
        <p className="screen-blurb">Sign in with your Auxein Insights account.</p>
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
          <button className="btn btn--block" disabled={busy || !email.trim() || !password} onClick={() => void doLogin()}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
