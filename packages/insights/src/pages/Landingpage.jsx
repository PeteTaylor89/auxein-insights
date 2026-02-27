// pages/LandingPage.jsx - With scroll-aware header for mobile
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MapPin, Thermometer, Cloud, TrendingUp, ChartArea, ChartSpline,
  CloudSunRain, Grape, ShieldCheck, Bug, X,
  Lock, History
} from 'lucide-react';

import RegionalMap from '../components/RegionalMap';
import Logo from '../assets/App_Logo_September 20251.jpg';
import './LandingPage.css';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import AuthModal from '../components/auth/AuthModal';
import EmailVerificationModal from '../components/auth/EmailVerificationModal';
import { PublicClimateContainer } from '../components/climate';
import PasswordResetModal from '../components/auth/PasswordResetModal';
import SiteBanner from '../components/SiteBanner';
import SiteHeader from '../components/SiteHeader';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const verificationToken = searchParams.get('token');
  const resetToken = searchParams.get('reset_token');

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

  const featuredRegions = [
    { id: 'marlborough', name: 'Marlborough', temp: '15.2°C', gdd: 1250, lat: -41.5, lon: 173.9 },
    { id: 'central-otago', name: 'Central Otago', temp: '11.8°C', gdd: 1050, lat: -45.0, lon: 169.1 },
    { id: 'waipara', name: 'Waipara', temp: '13.5°C', gdd: 1150, lat: -43.0, lon: 172.7 },
    { id: 'hawkes-bay', name: 'Hawke\'s Bay', temp: '15.8°C', gdd: 1400, lat: -39.6, lon: 176.9 }
  ];

  const insightOptions = [
    { id: 'currentseason', icon: <CloudSunRain size={28} />, label: 'Current Season', hasComponent: true, initialView: 'currentseason' },
    { id: 'phenology', icon: <Grape size={28} />, label: 'Phenology', hasComponent: true, initialView: 'phenology' },
    { id: 'disease', icon: <ShieldCheck size={28} />, label: 'Disease Pressures', hasComponent: true, initialView: 'disease' },
    { id: 'climatehistory', icon: <History size={28} />, label: 'Climate History', hasComponent: true, initialView: 'seasons' },
    { id: 'climateprojections', icon: <ChartSpline size={28} />, label: 'Climate Projections', hasComponent: true, initialView: 'projections' }
  ];

  const handleInsightClick = (insightId) => {
    setActiveInsight(activeInsight === insightId ? null : insightId);
    if (activeInsight !== insightId) {
      setTimeout(() => {
        document.getElementById('insights-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleMapInteraction = () => {
    if (!isAuthenticated) {
      setAuthContext('map');
      setAuthModalOpen(true);
      return false;
    }
    return true;
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
        <div className="insights-grid">
          {insightOptions.map(insight => (
            <button
              key={insight.id}
              className={`insight-card ${activeInsight === insight.id ? 'active' : ''} ${isDemoMode ? 'demo' : ''}`}
              onClick={() => handleInsightClick(insight.id)}
            >
              <div className="insight-icon">{insight.icon}</div>
              <div className="insight-label">{insight.label}</div>
              {isDemoMode && (
                <div className="card-demo-badge">Demo</div>
              )}
            </button>
          ))}
        </div>

        {activeInsight && (
          <div className="active-insight-container">
            {renderActiveInsight()}
          </div>
        )}
      </section>

      {/* Map Section */}
      <section className="map-section">
        <div className="section-header">
          <h2>Regional Explorer</h2>
          {!isAuthenticated && (
            <span className="auth-hint">
              <Lock size={14} /> Sign in to explore the map
            </span>
          )}
        </div>
        
        <div className={`map-container-wrapper ${!isAuthenticated ? 'locked' : ''}`}>
          {!isAuthenticated ? (
            <div className="map-locked-overlay" onClick={handleMapInteraction}>
              <div className="map-lock-content">
                <h3>Vine Atlas</h3>
                <p>Sign in to explore New Zealand wine regions</p>
              </div>
              <div className="map-preview-blur">
                <RegionalMap regions={featuredRegions} />
              </div>
            </div>
          ) : (
            <RegionalMap regions={featuredRegions} />
          )}
        </div>
      </section>

      {/* Latest Articles Carousel */}
      {latestArticles.length > 0 && (
        <section className="latest-articles-section">
          <div className="section-header">
            <h2>Latest Articles</h2>
          </div>
          <div className="articles-carousel">
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
            <Link to="/about">About</Link>
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