// src/App.jsx — routes for the consolidated admin surface.
//
// Paths are NOT prefixed with /admin. The whole origin is the admin app, so
// admin.auxein.co.nz/users beats admin.auxein.co.nz/admin/users. The redirects
// from the old origins (plan §4.1) land on `/` and carry no token.
//
// Phase 2 has brought the INSIGHTS admin tree across. The Grow admin tree
// (companies, properties, contractors, Grow banners) arrives in Phase 3, and
// the two get a single unified nav in Phase 4.
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import AdminRoute from './components/AdminRoute';

import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import KpiDashboard from './pages/KpiDashboard';
// Phase 1's scaffold, kept as a diagnostic. It is the only screen that shows
// BOTH identities side by side, which is exactly what you want when the admin
// site half-works (plan §7.1/§7.6).
import SessionInfo from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import UserDetail from './pages/UserDetail';
import WeatherStatus from './pages/WeatherStatus';
import StationDetail from './pages/StationDetail';
import QcDashboard from './pages/QcDashboard';
import JobsDashboard from './pages/JobsDashboard';
import BannerManagement from './pages/BannerManagement';
import AdminAccounts from './pages/admin/AdminAccounts';
import AdminArticleList from './pages/admin/AdminArticleList';
import AdminArticleEditor from './pages/admin/AdminArticleEditor';
import AdminResearchList from './pages/admin/AdminResearchList';
import AdminResearchEditor from './pages/admin/AdminResearchEditor';
import AdminEmailCampaignList from './pages/admin/AdminEmailCampaignList';
import AdminEmailCampaignEditor from './pages/admin/AdminEmailCampaignEditor';

// The GROW half. Kept in its own directory because two of its components share
// a name with an Insights one — UserManagement and, more dangerously,
// BannerManagement, which talks to a DIFFERENT backend (admin_grow_banners vs
// admin_banners). Those two are renamed Grow* at the file level so no call site
// can confuse them (plan §7.2).
import GrowAdmin from './grow/GrowAdmin';

// StationMap stays lazy. It pulls in mapbox-gl, which is large, and it is one
// page out of fifteen — the same reason it was lazy in the Insights SPA. That
// the whole origin is now admin-only does not make the bundle free.
const StationMap = lazy(() => import('./pages/StationMap'));

const mapFallback = (
  <div style={{
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    minHeight: '100vh', color: 'var(--admin-green)',
  }}>
    Loading map…
  </div>
);

// Every route below is wrapped: there is no unauthenticated page on this origin
// except /login. Nesting rather than repeating <AdminRoute> per route keeps that
// property structural — a new route cannot be added unguarded by accident.
function Guarded({ children }) {
  return <AdminRoute>{children}</AdminRoute>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<Guarded><AdminDashboard /></Guarded>} />
      <Route path="/session" element={<Guarded><SessionInfo /></Guarded>} />
      <Route path="/kpis" element={<Guarded><KpiDashboard /></Guarded>} />

      <Route path="/users" element={<Guarded><UserManagement /></Guarded>} />
      <Route path="/users/:id" element={<Guarded><UserDetail /></Guarded>} />

      <Route path="/accounts" element={<Guarded><AdminAccounts /></Guarded>} />

      <Route path="/articles" element={<Guarded><AdminArticleList /></Guarded>} />
      <Route path="/articles/new" element={<Guarded><AdminArticleEditor /></Guarded>} />
      <Route path="/articles/:id/edit" element={<Guarded><AdminArticleEditor /></Guarded>} />

      <Route path="/research" element={<Guarded><AdminResearchList /></Guarded>} />
      <Route path="/research/new" element={<Guarded><AdminResearchEditor /></Guarded>} />
      <Route path="/research/:id/edit" element={<Guarded><AdminResearchEditor /></Guarded>} />

      {/* /weather/map is declared BEFORE /weather/:id so the static segment is
          not swallowed by the dynamic one. React Router ranks static above
          dynamic regardless of order, but the order makes it visible. */}
      <Route path="/weather" element={<Guarded><WeatherStatus /></Guarded>} />
      <Route
        path="/weather/map"
        element={<Guarded><Suspense fallback={mapFallback}><StationMap /></Suspense></Guarded>}
      />
      <Route path="/weather/:id" element={<Guarded><StationDetail /></Guarded>} />

      <Route path="/qc" element={<Guarded><QcDashboard /></Guarded>} />
      <Route path="/jobs" element={<Guarded><JobsDashboard /></Guarded>} />
      <Route path="/banners" element={<Guarded><BannerManagement /></Guarded>} />

      {/* Grow platform admin. The tab is a route parameter so the unified nav
          can link straight to /grow/properties, and so these screens are
          linkable and back-button-correct — neither was true in Grow, where the
          tab lived in component state. A bare /grow lands on Companies. */}
      <Route path="/grow" element={<Navigate to="/grow/companies" replace />} />
      <Route path="/grow/:tab" element={<Guarded><GrowAdmin /></Guarded>} />

      <Route path="/email" element={<Guarded><AdminEmailCampaignList /></Guarded>} />
      <Route path="/email/new" element={<Guarded><AdminEmailCampaignEditor /></Guarded>} />
      <Route path="/email/:id/edit" element={<Guarded><AdminEmailCampaignEditor /></Guarded>} />

      {/* Unknown paths go to the dashboard rather than a 404 page. There are no
          crawlers here and no dead public links to diagnose — an admin who
          mistypes wants the tool, not a 404. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
