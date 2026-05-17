// pages/ContractorMobileOnly.jsx — Landing for contractor logins on web.
// Contractors are mobile-only in V1; this page sits outside AppLayout so the
// rest of the web app surface is never visible to them. Wired via
// ContractorOnlyRoute in App.jsx.

import { useAuth } from '@vineyard/shared';
import { Smartphone, LogOut } from 'lucide-react';
import Logo from '../assets/logo-mark.png';
import './ContractorMobileOnly.css';

// Store links — left empty while public listings aren't live.
// Drop the real URLs in once Play Store / App Store rollouts complete.
const ANDROID_URL = '';
const IOS_URL = '';

export default function ContractorMobileOnly() {
  const { logout, user } = useAuth();

  return (
    <div className="cmo-container">
      <div className="cmo-card">
        <img src={Logo} alt="Auxein Grow" className="cmo-logo" />

        <h1 className="cmo-title">Auxein Grow runs on your phone</h1>

        <p className="cmo-lead">
          Contractor accounts use the Auxein Grow mobile app for tasks, GPS tracking,
          observations, and time entries. The web app is reserved for managers and admins.
        </p>

        <div className="cmo-storerow">
          <StoreLink
            href={ANDROID_URL}
            platform="Android"
            note="Play Store"
          />
          <StoreLink
            href={IOS_URL}
            platform="iOS"
            note="App Store"
          />
        </div>

        <p className="cmo-note">
          Don't have an invite yet? Ask the manager who set up your account — they'll send
          your install link directly.
        </p>

        {user?.email && (
          <p className="cmo-signedin">Signed in as <strong>{user.email}</strong></p>
        )}

        <button className="cmo-signout" onClick={logout}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}

function StoreLink({ href, platform, note }) {
  const disabled = !href;
  const className = `cmo-store ${disabled ? 'cmo-store--disabled' : ''}`;
  const content = (
    <>
      <Smartphone size={18} />
      <div className="cmo-store-text">
        <div className="cmo-store-platform">{platform}</div>
        <div className="cmo-store-note">{disabled ? 'Coming soon' : note}</div>
      </div>
    </>
  );
  if (disabled) {
    return <div className={className} aria-disabled="true">{content}</div>;
  }
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  );
}
