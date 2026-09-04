// src/App.jsx - Auxein Insights (public)
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import About from './pages/About';
import Pro from './pages/Pro';
import Feedback from './pages/Feedback';
import './components/legal/legal.css';
import LegalPage from './components/legal/LegalPage';

// Public content pages
import ArticlesPage from './pages/ArticlesPage';
import ArticleDetail from './pages/ArticleDetail';
import ResearchPage from './pages/ResearchPage';
import ResearchDetail from './pages/ResearchDetail';
import Explore from './pages/Explore';
import RegionDetail from './pages/RegionDetail';
import NotFound from './pages/NotFound';

// Country + industry scoping. See docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
import {
  ScopedLayout,
  LegacyRegionsRedirect,
  LegacyRegionDetailRedirect,
} from './components/scope/ScopeRouting';

// Lazy-loaded pages
const MapExplorer = lazy(() => import('./pages/MapExplorer'));
// Lazy for the same reason as MapExplorer: it pulls in mapbox-gl AND Chart.js,
// and only Pro subscribers ever open it. Loading either into the main bundle
// would slow the free product down for the people who never see this page.
const MySite = lazy(() => import('./pages/MySite'));
// Enterprise portfolio, lazy for the same reason MySite is: almost no
// visitor reaches it, and the table and its filters should not be in the
// bundle the free product pays for.
const Portfolio = lazy(() => import('./pages/Portfolio'));
const AccountSite = lazy(() => import('./pages/AccountSite'));
// ADMIN ONLY, and it was eagerly imported. `StationMap` pulls in mapbox-gl,
// which is 1.6 MB on its own, so every anonymous visitor to the landing page
// was downloading and parsing the whole GL renderer to reach a page behind
// AdminRoute that they can never open.
const StationMap = lazy(() => import('./pages/StationMap'));

// Admin pages
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';
import UserDetail from './pages/UserDetail';
import WeatherStatus from './pages/WeatherStatus';
import QcDashboard from './pages/QcDashboard';
import JobsDashboard from './pages/JobsDashboard';
import StationDetail from './pages/StationDetail';

import BannerManagement from './pages/BannerManagement';
import AdminAccounts from './pages/admin/AdminAccounts';
import AdminArticleList from './pages/admin/AdminArticleList';
import AdminArticleEditor from './pages/admin/AdminArticleEditor';
import AdminResearchList from './pages/admin/AdminResearchList';
import AdminResearchEditor from './pages/admin/AdminResearchEditor';
import AdminEmailCampaignList from './pages/admin/AdminEmailCampaignList';
import AdminEmailCampaignEditor from './pages/admin/AdminEmailCampaignEditor';

// Auth
import { PublicAuthProvider } from './contexts/PublicAuthContext';
import AdminRoute from './components/AdminRoute';
import GrowConsentBanner from './components/GrowConsentBanner';
import usePageTracking from './hooks/usePageTracking';

function AppRoutes() {
  usePageTracking();
  return (
    <>
    <GrowConsentBanner />
    <Routes>
          {/* Public routes - no authentication required */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/map" element={<Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--primary)' }}>Loading map...</div>}><MapExplorer /></Suspense>} />
          {/* The route is NOT gated here — the page renders its own explanation
              and Pro offer to anyone who arrives, so a shared or bookmarked
              link lands on something that says what it is rather than a
              redirect that looks like the link is broken. */}
          <Route path="/my-site" element={<Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--primary)' }}>Loading…</div>}><MySite /></Suspense>} />
          {/* The old, never-published region URLs. Kept as permanent
              redirects rather than deleted: they are emitted by the sitemap
              generator and appear in `ClimateZonePanel` links and in email that
              has already gone out. */}
          <Route path="/regions" element={<LegacyRegionsRedirect />} />
          <Route path="/regions/:slug" element={<LegacyRegionDetailRedirect />} />
          <Route path="/about" element={<About />} />
          <Route path="/pro" element={<Pro />} />
          <Route path="/pro/portfolio" element={<Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--primary)' }}>Loading…</div>}><Portfolio /></Suspense>} />
          <Route path="/pro/sites/:id" element={<Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--primary)' }}>Loading…</div>}><AccountSite /></Suspense>} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/articles/:slug" element={<ArticleDetail />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/research/:slug" element={<ResearchDetail />} />

          {/* Admin routes - is_admin only */}
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
          <Route path="/admin/users/:id" element={<AdminRoute><UserDetail /></AdminRoute>} />
          <Route path="/admin/accounts" element={<AdminRoute><AdminAccounts /></AdminRoute>} />
          <Route path="/admin/articles" element={<AdminRoute><AdminArticleList /></AdminRoute>} />
          <Route path="/admin/articles/new" element={<AdminRoute><AdminArticleEditor /></AdminRoute>} />
          <Route path="/admin/articles/:id/edit" element={<AdminRoute><AdminArticleEditor /></AdminRoute>} />
          <Route path="/admin/research" element={<AdminRoute><AdminResearchList /></AdminRoute>} />
          <Route path="/admin/research/new" element={<AdminRoute><AdminResearchEditor /></AdminRoute>} />
          <Route path="/admin/research/:id/edit" element={<AdminRoute><AdminResearchEditor /></AdminRoute>} />
          <Route path="/admin/weather" element={<AdminRoute><WeatherStatus /></AdminRoute>} />
          <Route path="/admin/qc" element={<AdminRoute><QcDashboard /></AdminRoute>} />
          <Route path="/admin/jobs" element={<AdminRoute><JobsDashboard /></AdminRoute>} />
          {/* Before the :id route — a literal segment must not be swallowed by it. */}
          <Route path="/admin/weather/map" element={<AdminRoute><Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--primary)' }}>Loading map…</div>}><StationMap /></Suspense></AdminRoute>} />
          <Route path="/admin/weather/:id" element={<AdminRoute><StationDetail /></AdminRoute>} />
          <Route path="/admin/banners" element={<AdminRoute><BannerManagement /></AdminRoute>} />
          <Route path="/admin/email" element={<AdminRoute><AdminEmailCampaignList /></AdminRoute>} />
          <Route path="/admin/email/new" element={<AdminRoute><AdminEmailCampaignEditor /></AdminRoute>} />
          <Route path="/admin/email/:id/edit" element={<AdminRoute><AdminEmailCampaignEditor /></AdminRoute>} />

          {/* Country + industry scoped pages: /nz/wine and /nz/wine/marlborough.
              This sits LAST among the public routes on purpose. React Router
              ranks static segments above dynamic ones, so /articles/:slug and
              every /admin/* path still win against `/:country/:industry` — but
              keeping it here makes that ordering visible rather than something
              you have to know about the router.

              An unknown scope 404s inside ScopedLayout. A known-but-inactive
              one (Australia today) renders, because a "coming soon" page for a
              country we intend to cover should be indexable. */}
          <Route path="/:country/:industry" element={<ScopedLayout />}>
            <Route index element={<Explore />} />
            <Route path=":slug" element={<RegionDetail />} />
          </Route>

          {/* Catch-all. Deliberately a 404 page rather than a redirect to `/`:
              redirecting hides dead links from us and answers crawlers with
              200-and-content for URLs that do not exist. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
    </>
  );
}

function App() {
  return (
    <PublicAuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </PublicAuthProvider>
  );
}

export default App;
