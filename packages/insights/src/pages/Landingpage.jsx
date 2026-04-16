// pages/LandingPage.jsx - With scroll-aware header for mobile
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChartSpline, CloudSunRain, Grape, ShieldCheck, X,
  History, ChevronRight, ChevronLeft, Map
} from 'lucide-react';

import Logo from '../assets/App_Logo_September 20251.jpg';
import './LandingPage.css';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import AuthModal from '../components/auth/AuthModal';
import EmailVerificationModal from '../components/auth/EmailVerificationModal';
import { PublicClimateContainer } from '../components/climate';
import PasswordResetModal from '../components/auth/PasswordResetModal';
import SiteBanner from '../components/SiteBanner';
import SiteHeader from '../components/SiteHeader';
import SeasonalStatsWidget from '../components/SeasonalStatsWidget';
import articleService from '../services/articleService';

function LandingPage() {
  const [activeInsight, setActiveInsight] = useState(null);
  const { isAuthenticated } = usePublicAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContext, setAuthContext] = useState('');
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [passwordResetModalOpen, setPasswordResetModalOpen] = useState(false);

  const [latestArticles, setLatestArticles] = useState([]);

  const isDemoMode = !isAuthenticated;

  // Articles carousel scroll
  const carouselRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateCarouselArrows = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el || latestArticles.length === 0) return;
    updateCarouselArrows();
    el.addEventListener('scroll', updateCarouselArrows, { passive: true });
    const ro = new ResizeObserver(updateCarouselArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateCarouselArrows); ro.disconnect(); };
  }, [latestArticles, updateCarouselArrows]);

  const scrollCarousel = useCallback((dir) => {
    const el = carouselRef.current;
    if (!el) return;
    const card = el.querySelector('.carousel-article-card');
    const distance = card ? card.offsetWidth + 20 : 340;
    el.scrollBy({ left: dir * distance, behavior: 'smooth' });
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const verificationToken = searchParams.get('token');
  const resetToken = searchParams.get('reset_token');
  const deepLinkView = searchParams.get('view');
  const deepLinkZone = searchParams.get('zone');

  // Deep-link: auto-open an insight view (e.g., from map panel CTA)
  const VALID_VIEWS = ['currentseason', 'phenology', 'disease', 'climatehistory', 'climateprojections'];
  useEffect(() => {
    if (deepLinkView && !activeInsight && VALID_VIEWS.includes(deepLinkView)) {
      setActiveInsight(deepLinkView);
      searchParams.delete('view');
      searchParams.delete('zone');
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => {
        document.getElementById('insights-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [deepLinkView]);

  useEffect(() => {
    if (verificationToken) {
      setVerificationModalOpen(true);
    }
    if (resetToken) {
      setPasswordResetModalOpen(true);
    }
  }, [verificationToken, resetToken]);

  // Fetch latest articles for carousel
  useEffect(() => {
    articleService.list({ page: 1, page_size: 6 })
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

  const insightOptions = [
    { id: 'currentseason', icon: <CloudSunRain size={22} />, label: 'Current Season', hasComponent: true, initialView: 'currentseason' },
    { id: 'phenology', icon: <Grape size={22} />, label: 'Phenology', hasComponent: true, initialView: 'phenology' },
    { id: 'disease', icon: <ShieldCheck size={22} />, label: 'Disease Pressures', hasComponent: true, initialView: 'disease' },
    { id: 'climatehistory', icon: <History size={22} />, label: 'Climate History', hasComponent: true, initialView: 'seasons' },
    { id: 'climateprojections', icon: <ChartSpline size={22} />, label: 'Climate Projections', hasComponent: true, initialView: 'projections' }
  ];

  const handleInsightClick = (insightId) => {
    setActiveInsight(activeInsight === insightId ? null : insightId);
    if (activeInsight !== insightId) {
      setTimeout(() => {
        document.getElementById('insights-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleAuthModalClose = () => {
    setAuthModalOpen(false);
    setAuthContext('');
  };

  const renderActiveInsight = () => {
    const insight = insightOptions.find(opt => opt.id === activeInsight);
    if (!insight) return null;

    if (insight.hasComponent) {
      return (
        <div className="insight-content-wrapper">
          <PublicClimateContainer
            initialView={insight.initialView}
            initialZoneSlug={deepLinkZone || null}
            onClose={() => setActiveInsight(null)}
            demoMode={isDemoMode}
            onAuthRequired={() => { setAuthContext('demo_upgrade'); setAuthModalOpen(true); }}
          />
        </div>
      );
    }

    return (
      <div className="insight-content-wrapper">
        <div className="insight-header">
          <h3>{insight.label}</h3>
          <button className="close-insight-btn" onClick={() => setActiveInsight(null)} aria-label={`Close ${insight.label}`}>
            <X size={24} />
          </button>
        </div>
        <div className="insight-placeholder">
          <p>{insight.placeholder}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="landing-page">
      {/* Shared Sticky Header */}
      <SiteHeader
        subtitle="Regional Intelligence"
        onSignInClick={() => { setAuthContext('header'); setAuthModalOpen(true); }}
      />
      <SiteBanner />
      {/* Insights Section */}
      <section id="insights-section" className="insights-section">
        <div className="section-header">
          <h2>Vine - Sights</h2>
          {!isAuthenticated && (
            <span className="auth-hint demo-hint">
              Viewing Waipara demo &middot;{' '}
              <button className="demo-hint-btn" onClick={() => { setAuthContext('insights'); setAuthModalOpen(true); }}>
                Sign in free
              </button>{' '}
              to explore all regions
            </span>
          )}
        </div>
        <div className="insights-grid" role="tablist" aria-label="Insight categories">
          {insightOptions.map(insight => (
            <button
              key={insight.id}
              role="tab"
              aria-selected={activeInsight === insight.id}
              className={`insight-card ${activeInsight === insight.id ? 'active' : ''} ${isDemoMode ? 'demo' : ''}`}
              onClick={() => handleInsightClick(insight.id)}
            >
              <div className="insight-icon">{insight.icon}</div>
              <div className="insight-label">
                {insight.label}
                {isDemoMode && <span className="card-demo-badge">Demo</span>}
              </div>
              <ChevronRight size={18} className="insight-chevron" />
            </button>
          ))}
        </div>

        {activeInsight && (
          <div className="active-insight-container" role="tabpanel" aria-label={insightOptions.find(o => o.id === activeInsight)?.label}>
            {renderActiveInsight()}
          </div>
        )}
      </section>

      {/* Seasonal Stats Widget */}
      <SeasonalStatsWidget onAuthRequired={() => { setAuthContext('widget'); setAuthModalOpen(true); }} />

      {/* Map CTA Section */}
      <section className="map-section">
        <Link to="/map" className="map-cta-card">
          <div className="map-cta-icon">
            <Map size={32} />
          </div>
          <div className="map-cta-text">
            <h3>Vine Atlas</h3>
            <p>Explore New Zealand wine regions, blocks, and geographical indications</p>
          </div>
          <ChevronRight size={24} className="map-cta-chevron" />
        </Link>
        <span className="map-cta-note">Best experienced on desktop</span>
      </section>

      {/* Latest Articles Carousel */}
      {latestArticles.length > 0 && (
        <section className="latest-articles-section">
          <div className="section-header">
            <h2>Latest Articles</h2>
          </div>
          <div className="articles-carousel-wrapper">
            {canScrollLeft && (
              <button className="carousel-arrow carousel-arrow-prev" onClick={() => scrollCarousel(-1)} aria-label="Previous articles">
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="articles-carousel" ref={carouselRef}>
              <div className="articles-carousel-track">
                {latestArticles.map((article) => (
                  <Link
                    key={article.id}
                    to={`/articles/${article.slug}`}
                    className="carousel-article-card"
                  >
                    {(article.thumbnail_url || article.featured_image_url) && (
                      <div className="carousel-card-image">
                        <img
                          src={article.thumbnail_url || article.featured_image_url}
                          alt={article.featured_image_alt || article.title}
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="carousel-card-body">
                      {article.tags && article.tags.length > 0 && (
                        <div className="carousel-card-tags">
                          {article.tags.slice(0, 2).map((t) => (
                            <span key={t} className="carousel-tag">{t}</span>
                          ))}
                        </div>
                      )}
                      <h3 className="carousel-card-title">{article.title}</h3>
                      {article.excerpt && (
                        <p className="carousel-card-excerpt">{article.excerpt}</p>
                      )}
                      <span className="carousel-card-date">
                        {article.published_at
                          ? new Date(article.published_at).toLocaleDateString('en-NZ', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })
                          : ''}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            {canScrollRight && (
              <button className="carousel-arrow carousel-arrow-next" onClick={() => scrollCarousel(1)} aria-label="Next articles">
                <ChevronRight size={20} />
              </button>
            )}
          </div>
          <div className="articles-carousel-footer">
            <Link to="/articles" className="view-all-articles-btn">
              View all articles
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <img src={Logo} alt="Auxein Logo" className="footer-logo" />
            <p>Auxein Insights</p>
          </div>
          <div className="footer-links">
            <a href="https://auxein.co.nz/about" target="_blank" rel="noopener noreferrer">About</a>
            <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer">Auxein</a>
            <a href="https://auxein.co.nz/contact" target="_blank" rel="noopener noreferrer">Contact</a>
            <Link to="/legal?section=privacy">Privacy Policy</Link>
            <Link to="/legal?section=cookies">Cookie Policy</Link>
            <Link to="/legal?section=terms">Terms of Use</Link>
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} Auxein Limited. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal isOpen={authModalOpen} onClose={handleAuthModalClose} context={authContext} />
      <EmailVerificationModal isOpen={verificationModalOpen} onClose={handleVerificationClose} token={verificationToken} />
      <PasswordResetModal isOpen={passwordResetModalOpen} onClose={handlePasswordResetClose} token={resetToken} />
    </div>
  );
}

export default LandingPage;