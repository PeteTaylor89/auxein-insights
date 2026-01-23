// pages/LandingPage.jsx - With scroll-aware header for mobile
import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  MapPin, Thermometer, Cloud, TrendingUp, ChartArea, ChartSpline, 
  CloudSunRain, Grape, ShieldCheck, Bug, X, User, LogOut, Settings, 
  Lock, History, Shield, Menu 
} from 'lucide-react';

import RegionalMap from '../components/RegionalMap';
import Logo from '../assets/App_Logo_September 20251.jpg';
import MainLogo from '../assets/Logo_September 2025.png';
import './LandingPage.css';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import AuthModal from '../components/auth/AuthModal';
import UserPreferencesModal from '../components/auth/UserPreferencesModal';
import EmailVerificationModal from '../components/auth/EmailVerificationModal';
import { PublicClimateContainer } from '../components/climate';

const ADMIN_DOMAIN = 'auxein.co.nz';
const isAdminEmail = (email) => {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ADMIN_DOMAIN}`);
};

// Custom hook for scroll-aware header
function useScrollDirection() {
  const [scrollDirection, setScrollDirection] = useState('up');
  const [isAtTop, setIsAtTop] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const threshold = 10; // Minimum scroll amount to trigger direction change
    const topThreshold = 50; // Consider "at top" within this range

    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      
      // Check if at top of page
      setIsAtTop(scrollY < topThreshold);
      
      // Only update direction if we've scrolled more than threshold
      if (Math.abs(scrollY - lastScrollY.current) < threshold) {
        ticking.current = false;
        return;
      }

      setScrollDirection(scrollY > lastScrollY.current ? 'down' : 'up');
      lastScrollY.current = scrollY > 0 ? scrollY : 0;
      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return { scrollDirection, isAtTop };
}

function LandingPage() {
  const [activeInsight, setActiveInsight] = useState(null);
  const { isAuthenticated, user, logout } = usePublicAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContext, setAuthContext] = useState('');
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Scroll-aware header state
  const { scrollDirection, isAtTop } = useScrollDirection();
  const [isMobile, setIsMobile] = useState(false);
  
  const isAdmin = isAuthenticated && isAdminEmail(user?.email);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const verificationToken = searchParams.get('token');

  useEffect(() => {
    if (verificationToken) {
      setVerificationModalOpen(true);
    }
  }, [verificationToken]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleVerificationClose = () => {
    setVerificationModalOpen(false);
    if (verificationToken) {
      searchParams.delete('token');
      setSearchParams(searchParams);
    }
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
    if (!isAuthenticated) {
      setAuthContext('insights');
      setAuthModalOpen(true);
      return;
    }
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

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    setActiveInsight(null);
  };

  const handlePreferences = () => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    setPreferencesModalOpen(true);
  };

  const handleAuthModalClose = () => {
    setAuthModalOpen(false);
    setAuthContext('');
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
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

  // Determine header visibility class for mobile
  // Header is hidden when: mobile + scrolling down + not at top + mobile menu closed
  const headerHidden = isMobile && scrollDirection === 'down' && !isAtTop && !mobileMenuOpen;

  return (
    <div className="landing-page">
      {/* Scroll-Aware Sticky Header */}
      <header className={`landing-header ${headerHidden ? 'header-hidden' : ''}`}>
        <div className="header-container">
          <div className="header-brand">
            <img src={MainLogo} alt="Auxein Logo" className="header-logo" />
            <div className="header-title-block">
              <h1>Auxein Insights</h1>
              <p>Regional Intelligence</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <nav className="header-nav desktop-nav">
            <Link to="/about">About</Link>
            <a href="https://auxein.co.nz/log-in" target="_blank" rel="noopener noreferrer">Insights-Pro</a>
            <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer">Auxein</a>

            {isAdmin && (
              <Link to="/admin" className="admin-header-link">
                <Shield size={16} />
                Admin
              </Link>
            )}

            {!isAuthenticated ? (
              <button className="auth-header-btn" onClick={() => { setAuthContext('header'); setAuthModalOpen(true); }}>
                Sign In
              </button>
            ) : (
              <div className="user-menu-container">
                <button className="user-menu-trigger" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                  <User size={18} />
                  <span>{user?.first_name || 'Account'}</span>
                </button>

                {userMenuOpen && (
                  <div className="user-dropdown">
                    <div className="user-dropdown-header">
                      <strong>{user?.full_name || user?.email}</strong>
                      {user?.user_type && <small>{user.user_type.replace('_', ' ')}</small>}
                    </div>
                    
                    {isAdmin && (
                      <Link to="/admin" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                        <Shield size={16} />
                        Admin Dashboard
                      </Link>
                    )}
                    
                    <button className="user-dropdown-item" onClick={handlePreferences}>
                      <Settings size={16} />
                      Preferences
                    </button>
                    <button className="user-dropdown-item" onClick={handleLogout}>
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Mobile Hamburger Button */}
          <button 
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* ============================================
          MOBILE NAVIGATION - RENDERED OUTSIDE HEADER
          This is critical for proper full-screen overlay
          ============================================ */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={closeMobileMenu} />
          <nav className="mobile-nav">
            {/* Close button at top */}
            <button className="mobile-nav-close" onClick={closeMobileMenu} aria-label="Close menu">
              <X size={24} />
            </button>

            <Link to="/about" onClick={closeMobileMenu}>About</Link>
            <a href="https://auxein.co.nz/log-in" target="_blank" rel="noopener noreferrer" onClick={closeMobileMenu}>
              Insights-Pro
            </a>
            <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer" onClick={closeMobileMenu}>
              Auxein
            </a>

            {isAdmin && (
              <Link to="/admin" className="mobile-admin-link" onClick={closeMobileMenu}>
                <Shield size={18} />
                Admin Dashboard
              </Link>
            )}

            <div className="mobile-nav-divider" />

            {!isAuthenticated ? (
              <button 
                className="mobile-auth-btn"
                onClick={() => {
                  closeMobileMenu();
                  setAuthContext('header');
                  setAuthModalOpen(true);
                }}
              >
                <User size={18} />
                Sign In
              </button>
            ) : (
              <>
                <div className="mobile-user-info">
                  <User size={20} />
                  <div>
                    <strong>{user?.full_name || user?.first_name || 'Account'}</strong>
                    {user?.email && <small>{user.email}</small>}
                  </div>
                </div>
                <button className="mobile-nav-item" onClick={() => { closeMobileMenu(); handlePreferences(); }}>
                  <Settings size={18} />
                  Preferences
                </button>
                <button className="mobile-nav-item mobile-logout" onClick={() => { closeMobileMenu(); handleLogout(); }}>
                  <LogOut size={18} />
                  Sign Out
                </button>
              </>
            )}
          </nav>
        </>
      )}

      {/* Insights Section */}
      <section id="insights-section" className="insights-section">
        <div className="section-header">
          <h2>Vine - Sights</h2>
          {!isAuthenticated && (
            <span className="auth-hint">
              <Lock size={14} /> Sign in to access insights
            </span>
          )}
        </div>
        <div className="insights-grid">
          {insightOptions.map(insight => (
            <button
              key={insight.id}
              className={`insight-card ${activeInsight === insight.id ? 'active' : ''} ${!isAuthenticated ? 'locked' : ''}`}
              onClick={() => handleInsightClick(insight.id)}
            >
              <div className="insight-icon">{insight.icon}</div>
              <div className="insight-label">{insight.label}</div>
              {!isAuthenticated && (
                <div className="card-lock-overlay">
                  <Lock size={20} />
                </div>
              )}
            </button>
          ))}
        </div>

        {activeInsight && isAuthenticated && (
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

      {/* About/CTA Section */}
      <section className="about-cta-section">
        <div className="about-content">
          <div className="premium-cta">
            <h3>Vineyard Management & Insights</h3>
            <p>
              Our premium Auxein Insights platform offers vineyard-specific climate analysis, 
              risk management tools, and comprehensive management features.
            </p>
            <a href="https://auxein.co.nz/" target="_blank" rel="noopener noreferrer" className="premium-btn">
              Explore Auxein Insights →
            </a>
          </div>
        </div>
      </section>

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
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} Auxein Limited. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal isOpen={authModalOpen} onClose={handleAuthModalClose} context={authContext} />
      <UserPreferencesModal isOpen={preferencesModalOpen} onClose={() => setPreferencesModalOpen(false)} />
      <EmailVerificationModal isOpen={verificationModalOpen} onClose={handleVerificationClose} token={verificationToken} />

      {/* User menu overlay (desktop) */}
      {userMenuOpen && <div className="user-menu-overlay" onClick={() => setUserMenuOpen(false)} />}
    </div>
  );
}

export default LandingPage;