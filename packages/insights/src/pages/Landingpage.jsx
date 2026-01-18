// pages/LandingPage.jsx - With Admin Link
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Thermometer, Cloud, TrendingUp, ChartArea, ChartSpline, CloudSunRain, Grape, ShieldCheck, Bug, X, User, LogOut, Settings, Lock, History, Shield } from 'lucide-react';

import RegionalMap from '../components/RegionalMap';
import Logo from '../assets/App_Logo_September 20251.jpg';
import MainLogo from '../assets/Logo_September 2025.png';
import './LandingPage.css';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import AuthModal from '../components/auth/AuthModal';
import UserPreferencesModal from '../components/auth/UserPreferencesModal';
import EmailVerificationModal from '../components/auth/EmailVerificationModal';
import { PublicClimateContainer } from '../components/climate';

// Admin domain check
const ADMIN_DOMAIN = 'auxein.co.nz';
const isAdminEmail = (email) => {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ADMIN_DOMAIN}`);
};

function LandingPage() {
  const [activeInsight, setActiveInsight] = useState(null);
  const { isAuthenticated, user, logout } = usePublicAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContext, setAuthContext] = useState('');
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  
  // Check if current user is admin
  const isAdmin = isAuthenticated && isAdminEmail(user?.email);
  
  // Get verification token from URL
  const [searchParams, setSearchParams] = useSearchParams();
  const verificationToken = searchParams.get('token');

  // Check for verification token on mount
  useEffect(() => {
    if (verificationToken) {
      setVerificationModalOpen(true);
    }
  }, [verificationToken]);

  useEffect(() => {
    console.log('=== VERIFICATION DEBUG ===');
    console.log('Token from URL:', verificationToken);
    console.log('Modal open:', verificationModalOpen);
    console.log('Search params:', Object.fromEntries(searchParams));
  }, [verificationToken, verificationModalOpen, searchParams]);

  // Clear token from URL when verification modal closes
  const handleVerificationClose = () => {
    setVerificationModalOpen(false);
    if (verificationToken) {
      searchParams.delete('token');
      setSearchParams(searchParams);
    }
  };

  // Featured regions data
  const featuredRegions = [
    { id: 'marlborough', name: 'Marlborough', temp: '15.2°C', gdd: 1250, lat: -41.5, lon: 173.9 },
    { id: 'central-otago', name: 'Central Otago', temp: '11.8°C', gdd: 1050, lat: -45.0, lon: 169.1 },
    { id: 'waipara', name: 'Waipara', temp: '13.5°C', gdd: 1150, lat: -43.0, lon: 172.7 },
    { id: 'hawkes-bay', name: 'Hawke\'s Bay', temp: '15.8°C', gdd: 1400, lat: -39.6, lon: 176.9 }
  ];

  // Insight options - FIXED NAMING
  const insightOptions = [
    { 
      id: 'currentseason', 
      icon: <CloudSunRain size={28} />, 
      label: 'Current Season', 
      placeholder: 'Current season climate analysis coming soon...' 
    },
    { 
      id: 'phenology', 
      icon: <Grape size={28} />, 
      label: 'Phenology', 
      placeholder: 'Phenology analysis coming soon...' 
    },
    { 
      id: 'disease', 
      icon: <ShieldCheck size={28} />, 
      label: 'Disease', 
      placeholder: 'Disease risk analysis coming soon...' 
    },
    { 
      id: 'climatehistory', 
      icon: <History size={28} />,  // Changed icon to History
      label: 'Climate History',     // Changed from "Current Season"
      hasComponent: true,
      initialView: 'seasons',
    },
    { 
      id: 'climateprojections',  // Fixed: was 'climateprojection'
      icon: <ChartSpline size={28} />, 
      label: 'Climate Projections',
      hasComponent: true,
      initialView: 'projections',
    }
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
        document.getElementById('insights-section')?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
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
    setActiveInsight(null);
  };

  const handlePreferences = () => {
    setUserMenuOpen(false);
    setPreferencesModalOpen(true);
  };

  const handleAuthModalClose = () => {
    setAuthModalOpen(false);
    setAuthContext('');
  };

  // FIXED: renderActiveInsight now checks hasComponent properly
  const renderActiveInsight = () => {
    const insight = insightOptions.find(opt => opt.id === activeInsight);
    if (!insight) return null;

    // Check for hasComponent (climate components)
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

    // Fallback for placeholder insights
    return (
      <div className="insight-content-wrapper">
        <div className="insight-header">
          <h3>{insight.label}</h3>
          <button 
            className="close-insight-btn"
            onClick={() => setActiveInsight(null)}
            aria-label={`Close ${insight.label}`}
          >
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
      {/* Sticky Header */}
      <header className="landing-header">
        <div className="header-container">
          <div className="header-brand">
            <img src={MainLogo} alt="Auxein Logo" className="header-logo" />
            <div className="header-title-block">
              <h1>Auxein Insights</h1>
              <p>Regional Intelligence</p>
            </div>
          </div>
          
          <nav className="header-nav">
            <Link to="/about">About</Link>
            <a href="https://auxein.co.nz/log-in" target="_blank" rel="noopener noreferrer">
              Insights-Pro
            </a>
            <a 
              href="https://auxein.co.nz" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Auxein
            </a>

            {/* Admin Link - Only visible for @auxein.co.nz users */}
            {isAdmin && (
              <Link to="/admin" className="admin-header-link">
                <Shield size={16} />
                Admin
              </Link>
            )}

            {/* Auth Section */}
            {!isAuthenticated ? (
              <button 
                className="auth-header-btn"
                onClick={() => {
                  setAuthContext('header');
                  setAuthModalOpen(true);
                }}
              >
                Sign In
              </button>
            ) : (
              <div className="user-menu-container">
                <button 
                  className="user-menu-trigger"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <User size={18} />
                  <span>{user?.first_name || 'Account'}</span>
                </button>

                {userMenuOpen && (
                  <div className="user-dropdown">
                    <div className="user-dropdown-header">
                      <strong>{user?.full_name || user?.email}</strong>
                      {user?.user_type && (
                        <small>{user.user_type.replace('_', ' ')}</small>
                      )}
                    </div>
                    
                    {/* Admin link in dropdown too */}
                    {isAdmin && (
                      <Link 
                        to="/admin" 
                        className="user-dropdown-item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Shield size={16} />
                        Admin Dashboard
                      </Link>
                    )}
                    
                    <button 
                      className="user-dropdown-item"
                      onClick={handlePreferences}
                    >
                      <Settings size={16} />
                      Preferences
                    </button>
                    <button 
                      className="user-dropdown-item"
                      onClick={handleLogout}
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Insights Section */}
      <section id="insights-section" className="insights-section">
        <div className="section-header">
          <h2>V<strong>in</strong>e-<strong>Sights</strong></h2>
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

        {/* === ACTIVE INSIGHT CONTAINER === */}
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
            <a 
              href="https://auxein.co.nz/"
              target="_blank" 
              rel="noopener noreferrer"
              className="premium-btn"
            >
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
            <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer">
              Auxein
            </a>
            <a href="https://auxein.co.nz/contact" target="_blank" rel="noopener noreferrer">
              Contact
            </a>
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} Auxein Limited. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen}
        onClose={handleAuthModalClose}
        context={authContext}
      />
      
      {/* User Preferences Modal */}
      <UserPreferencesModal 
        isOpen={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
      />

      {/* Email Verification Modal */}
      <EmailVerificationModal 
        isOpen={verificationModalOpen}
        onClose={handleVerificationClose}
        token={verificationToken}
      />

      {/* Close user menu overlay */}
      {userMenuOpen && (
        <div 
          className="user-menu-overlay"
          onClick={() => setUserMenuOpen(false)}
        />
      )}
    </div>
  );
}

export default LandingPage;