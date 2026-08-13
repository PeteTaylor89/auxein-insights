// src/App.jsx - Auxein Regional Intelligence (Public)
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import About from './pages/About';
import Feedback from './pages/Feedback';
import './components/legal/legal.css';
import LegalPage from './components/legal/LegalPage';

// Public content pages
import ArticlesPage from './pages/ArticlesPage';
import ArticleDetail from './pages/ArticleDetail';
import ResearchPage from './pages/ResearchPage';
import ResearchDetail from './pages/ResearchDetail';
import RegionsPage from './pages/RegionsPage';
import RegionDetail from './pages/RegionDetail';
import NotFound from './pages/NotFound';

// Lazy-loaded pages
const MapExplorer = lazy(() => import('./pages/MapExplorer'));

// Admin pages
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';
import UserDetail from './pages/UserDetail';
import WeatherStatus from './pages/WeatherStatus';
import StationDetail from './pages/StationDetail';
import BannerManagement from './pages/BannerManagement';
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
          <Route path="/map" element={<Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#5B6830' }}>Loading map...</div>}><MapExplorer /></Suspense>} />
          <Route path="/regions" element={<RegionsPage />} />
          <Route path="/regions/:slug" element={<RegionDetail />} />
          <Route path="/about" element={<About />} />
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
          <Route path="/admin/articles" element={<AdminRoute><AdminArticleList /></AdminRoute>} />
          <Route path="/admin/articles/new" element={<AdminRoute><AdminArticleEditor /></AdminRoute>} />
          <Route path="/admin/articles/:id/edit" element={<AdminRoute><AdminArticleEditor /></AdminRoute>} />
          <Route path="/admin/research" element={<AdminRoute><AdminResearchList /></AdminRoute>} />
          <Route path="/admin/research/new" element={<AdminRoute><AdminResearchEditor /></AdminRoute>} />
          <Route path="/admin/research/:id/edit" element={<AdminRoute><AdminResearchEditor /></AdminRoute>} />
          <Route path="/admin/weather" element={<AdminRoute><WeatherStatus /></AdminRoute>} />
          <Route path="/admin/weather/:id" element={<AdminRoute><StationDetail /></AdminRoute>} />
          <Route path="/admin/banners" element={<AdminRoute><BannerManagement /></AdminRoute>} />
          <Route path="/admin/email" element={<AdminRoute><AdminEmailCampaignList /></AdminRoute>} />
          <Route path="/admin/email/new" element={<AdminRoute><AdminEmailCampaignEditor /></AdminRoute>} />
          <Route path="/admin/email/:id/edit" element={<AdminRoute><AdminEmailCampaignEditor /></AdminRoute>} />

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
