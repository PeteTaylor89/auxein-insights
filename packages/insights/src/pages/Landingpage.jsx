// pages/LandingPage.jsx — the home page.
//
// Rebuilt 2026-08-13 (docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §2). The shape
// is now: what the weather is doing right now → the national surface → the
// writing. The old page opened with a five-tab explorer strip and put articles
// last, behind a carousel.
//
// The explorer strip is still here, demoted below the fold. It leaves in Pass 2,
// when /regions/:slug exists to receive the explorers — removing it before then
// would strand five working features with nowhere to live.
//
// This route must stay at `/` and must not redirect: Grow hands off SSO to
// `${insightsUrl}/#insights_sso=<token>` and a redirect loses the hash fragment.
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

import './LandingPage.css';
import AuthModal from '../components/auth/AuthModal';
import EmailVerificationModal from '../components/auth/EmailVerificationModal';
import PasswordResetModal from '../components/auth/PasswordResetModal';
import SiteBanner from '../components/SiteBanner';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import NationalPulse from '../components/home/NationalPulse';
import RegionLauncher from '../components/home/RegionLauncher';
import ArticleShowcase from '../components/home/ArticleShowcase';
import { MiniSurfaceMap } from '../components/surfaces';
import articleService from '../services/articleService';

// Old deep links opened an explorer inside the landing page:
//   /?view=phenology&zone=marlborough
// Those views now live at /regions/:slug, so the links are forwarded rather
// than ignored — they are live in the map panel CTA and in sent email, and
// silently landing on a home page with no explorer would look like a bug.
const VIEW_DEEP_LINKS = [
  'currentseason', 'phenology', 'disease', 'climatehistory', 'climateprojections',
];

function LandingPage() {
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContext, setAuthContext] = useState('');
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [passwordResetModalOpen, setPasswordResetModalOpen] = useState(false);

  const [latestArticles, setLatestArticles] = useState([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const verificationToken = searchParams.get('token');
  const resetToken = searchParams.get('reset_token');
  const deepLinkView = searchParams.get('view');
  const deepLinkZone = searchParams.get('zone');

  useEffect(() => {
    // Without a zone there is no region page to forward to, so those fall
    // through to the region index instead of 404ing on an empty slug.
    if (!deepLinkView || !VIEW_DEEP_LINKS.includes(deepLinkView)) return;
    const target = deepLinkZone
      ? `/regions/${deepLinkZone}?view=${deepLinkView}`
      : '/regions';
    navigate(target, { replace: true });
  }, [deepLinkView, deepLinkZone, navigate]);

  useEffect(() => {
    if (verificationToken) {
      setVerificationModalOpen(true);
    }
    if (resetToken) {
      setPasswordResetModalOpen(true);
    }
  }, [verificationToken, resetToken]);

  useEffect(() => {
    articleService.list({ page: 1, page_size: 5 })
      .then(data => setLatestArticles(data.items || []))
      .catch(() => {});
  }, []);

  const handleVerificationClose = () => {
    setVerificationModalOpen(false);
    if (verificationToken) {
      searchParams.delete('token');
      setSearchParams(searchParams);
    }
  };

  const handlePasswordResetClose = () => {
    setPasswordResetModalOpen(false);
    if (resetToken) {
      searchParams.delete('reset_token');
      setSearchParams(searchParams);
    }
    // Open login modal after successful reset
    setAuthModalOpen(true);
  };

  const handleAuthModalClose = () => {
    setAuthModalOpen(false);
    setAuthContext('');
  };

  return (
    <div className="landing-page">
      {/* Shared Sticky Header */}
      <SiteHeader
        subtitle="Regional Intelligence"
        onSignInClick={() => { setAuthContext('header'); setAuthModalOpen(true); }}
      />
      <SiteBanner />

      {/* Hero — conditions first, then the surface they came from. The point is
          that a visitor who never signs in still leaves knowing something. */}
      <section className="home-hero" aria-labelledby="home-hero-heading">
        <div className="home-hero__intro">
          {/* Visually hidden, not a design change: the visible headline was
              removed, which left the homepage with no <h1> at all and an
              aria-labelledby pointing at nothing. Search engines and screen
              readers both want one; this gives them one without putting text
              back on the page. */}
          <h1 id="home-hero-heading" className="sr-only">
            Auxein Insights — New Zealand climate intelligence, region by region
          </h1>

          <p>
            <b>Climate history</b>, projections, current season development, and pressures -
            by region or specific to your site. Built on over 1,000 weather stations
            feeding data to Insights.
          </p>
        </div>

        <div className="home-hero__grid">
          <div className="home-hero__stats">
            <NationalPulse />
            <RegionLauncher />
          </div>
          <div className="home-hero__map">
            <MiniSurfaceMap variable="temp_mean" />
          </div>
        </div>
      </section>

      {/* ArticleShowcase brings its own `.latest-articles-section` width and
          padding, exactly as the carousel did when it lived inline here. */}
      <ArticleShowcase articles={latestArticles} />

      <SiteFooter />

      {/* Modals */}
      <AuthModal isOpen={authModalOpen} onClose={handleAuthModalClose} context={authContext} />
      <EmailVerificationModal isOpen={verificationModalOpen} onClose={handleVerificationClose} token={verificationToken} />
      <PasswordResetModal isOpen={passwordResetModalOpen} onClose={handlePasswordResetClose} token={resetToken} />
    </div>
  );
}

export default LandingPage;