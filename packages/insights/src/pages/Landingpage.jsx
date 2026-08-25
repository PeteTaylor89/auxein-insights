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
import RegionMap from '../components/home/RegionMap';
import IndustryPills from '../components/explore/IndustryPills';
import ProTeaser from '../components/home/ProTeaser';
import ArticleShowcase from '../components/home/ArticleShowcase';
import { MiniSurfaceMap } from '../components/surfaces';
import articleService from '../services/articleService';
import {
  useCountryIndustry, readScopeHint, DEFAULT_COUNTRY, DEFAULT_INDUSTRY,
} from '../contexts/CountryIndustryContext';

// Old deep links opened an explorer inside the landing page:
//   /?view=phenology&zone=marlborough
// Those views now live at /regions/:slug, so the links are forwarded rather
// than ignored — they are live in the map panel CTA and in sent email, and
// silently landing on a home page with no explorer would look like a bug.
const VIEW_DEEP_LINKS = [
  'currentseason', 'phenology', 'disease', 'climatehistory', 'climateprojections',
];

function LandingPage() {
  // Region links carry the current (country, industry) scope. Outside a
  // scoped route this falls back to the visitor's last scope, then to
  // New Zealand wine — so no link has to bounce through the /regions redirect.
  const { path } = useCountryIndustry();

  // The hero's own scope. `/` carries no country or industry in the URL and is
  // deliberately left that way, so the map and the pills share local state
  // seeded from wherever this visitor last was. A region click then navigates
  // to the full `/{country}/{industry}/{slug}`, which IS scoped.
  const heroHint = readScopeHint();
  const [heroCountry] = useState(heroHint?.country || DEFAULT_COUNTRY);
  const [heroIndustry, setHeroIndustry] = useState(
    heroHint?.industry || DEFAULT_INDUSTRY);

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
      ? `${path(deepLinkZone)}?view=${deepLinkView}`
      : path();
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
            by region or specific to your site. Built on over 900 weather stations
            feeding data to Insights.
          </p>
        </div>

        {/* Three even columns (2026-08-24): pick a region, see the headlines
            and the Pro offer, see the product. It replaced a two-column row
            whose left side held a dropdown and whose stats strip ran full
            width above it.

            RegionLauncher is gone from here. It navigated with `navigate()`,
            so the landing page contained NO crawlable link to any region — the
            site's strongest organic-search URLs were invisible from its
            busiest page. Every region on the map is a real `<a href>`. The
            dropdown still exists on the Explore page, where a returning
            grower who knows their region wants it. */}
        <div className="home-hero__grid">
          <div className="home-hero__col home-hero__col--regions">
            {/* The picker sits with the map because it decides what the map
                shows. `/` is unscoped and must stay that way — a redirect here
                would drop the `#insights_sso=` fragment Grow arrives with — so
                the industry is LOCAL state and only a region click navigates
                to a real scoped URL. */}
            <IndustryPills value={heroIndustry} onSelect={setHeroIndustry} />
            <RegionMap
              country={heroCountry}
              industry={heroIndustry}
              title="Choose your region"
            />
          </div>

          <div className="home-hero__col home-hero__col--offer">
            <NationalPulse compact limit={3} />
            <ProTeaser />
          </div>

          <div className="home-hero__col home-hero__col--map">
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