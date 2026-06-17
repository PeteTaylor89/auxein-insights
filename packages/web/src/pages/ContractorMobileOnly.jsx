// pages/ContractorMobileOnly.jsx — Landing for mobile-only logins on web
// (contractors + standard users). This page sits outside AppLayout so the rest
// of the web app surface is never visible to them. Wired via ContractorOnlyRoute
// in App.jsx.

import { useAuth } from '@vineyard/shared';
import { LogOut } from 'lucide-react';
import Logo from '../assets/logo-mark.png';
import AppStoreBadges from '../components/AppStoreBadges';
import './ContractorMobileOnly.css';

export default function ContractorMobileOnly() {
  const { logout, user, userTypeRole } = useAuth();

  const lead = userTypeRole === 'contractor'
    ? 'Contractor accounts use the Auxein Grow mobile app for tasks, GPS tracking, observations, and time entries. The web app is reserved for managers and admins.'
    : 'Your account uses the Auxein Grow mobile app for field work — observations, tasks, and time entries. The web app is reserved for managers and admins.';

  return (
    <div className="cmo-container">
      <div className="cmo-card">
        <img src={Logo} alt="Auxein Grow" className="cmo-logo" />

        <h1 className="cmo-title">Auxein Grow runs on your phone</h1>

        <p className="cmo-lead">{lead}</p>

        <div className="cmo-storerow">
          <AppStoreBadges />
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
