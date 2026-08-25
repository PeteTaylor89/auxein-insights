// components/GrowConsentBanner.jsx
// One-time newsletter opt-in prompt for Grow users crossing into Insights.
// Grow projection rows (origin='grow') start with marketing opt-ins OFF — usage
// stats need no consent, but newsletter email does. Shown once until they
// subscribe or dismiss.
import { useState } from 'react';
import { usePublicAuth } from '../contexts/PublicAuthContext';

const DISMISS_KEY = 'insights_grow_consent_dismissed';

export default function GrowConsentBanner() {
  const { user, isAuthenticated, updateMarketingPreferences } = usePublicAuth();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));
  const [busy, setBusy] = useState(false);

  const show =
    isAuthenticated && user?.origin === 'grow' && !user?.newsletter_opt_in && !dismissed;
  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      await updateMarketingPreferences({ newsletter_opt_in: true });
      dismiss();
    } catch (e) {
      setBusy(false);
    }
  };

  return (
    <div style={styles.bar} role="region" aria-label="Insights newsletter">
      <span style={styles.text}>Monthly regional climate insights, straight to your inbox.</span>
      <div style={styles.actions}>
        <button style={styles.subscribe} onClick={subscribe} disabled={busy}>
          {busy ? 'Subscribing…' : 'Subscribe'}
        </button>
        <button style={styles.dismiss} onClick={dismiss} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}

const styles = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 20px',
    background: 'var(--primary)',
    color: '#fff',
    boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
    fontSize: '14px',
  },
  text: { fontWeight: 500 },
  actions: { display: 'flex', gap: '8px' },
  subscribe: {
    background: '#fff',
    color: 'var(--primary)',
    border: 'none',
    borderRadius: '6px',
    padding: '7px 16px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  dismiss: {
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: '6px',
    padding: '7px 14px',
    cursor: 'pointer',
  },
};
