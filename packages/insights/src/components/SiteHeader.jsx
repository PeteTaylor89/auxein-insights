// components/SiteHeader.jsx — Shared sticky header with nav, auth, mobile menu
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Settings, Shield, Menu, X } from 'lucide-react';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import UserPreferencesModal from './auth/UserPreferencesModal';
import MainLogo from '../assets/Logo_September 2025.png';
import './SiteHeader.css';

// Scroll-aware header hook (hides on scroll down on mobile)
function useScrollDirection() {
  const [scrollDirection, setScrollDirection] = useState('up');
  const [isAtTop, setIsAtTop] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const threshold = 10;
    const topThreshold = 50;

    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      setIsAtTop(scrollY < topThreshold);
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

function SiteHeader({ subtitle = 'Regional Intelligence', onSignInClick }) {
  const { isAuthenticated, user, logout } = usePublicAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const { scrollDirection, isAtTop } = useScrollDirection();
  const [isMobile, setIsMobile] = useState(false);

  const isAdmin = isAuthenticated && user?.is_admin;

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
      if (window.innerWidth > 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const handlePreferences = () => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    setPreferencesModalOpen(true);
  };

  const handleSignIn = () => {
    setMobileMenuOpen(false);
    if (onSignInClick) onSignInClick();
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const headerHidden = isMobile && scrollDirection === 'down' && !isAtTop && !mobileMenuOpen;

  return (
    <>
      <header className={`site-header ${headerHidden ? 'header-hidden' : ''}`}>
        <div className="header-container">
          <Link to="/" className="header-brand">
            <img src={MainLogo} alt="Auxein Logo" className="header-logo" />
            <div className="header-title-block">
              <h1>Auxein Insights</h1>
              <p>{subtitle}</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="header-nav desktop-nav">
            <Link to="/">Home</Link>
            <Link to="/articles">Articles</Link>
            <a href="https://auxein.co.nz/about/" target="_blank" rel="noopener noreferrer">About</a>
            <a href="https://auxein.co.nz/insights-pro/" target="_blank" rel="noopener noreferrer">Insights-Pro</a>
            <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer">Auxein</a>

            {isAdmin && (
              <Link to="/admin" className="admin-header-link">
                <Shield size={16} />
                Admin
              </Link>
            )}

            {!isAuthenticated ? (
              <button className="auth-header-btn" onClick={handleSignIn}>
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

      {/* Mobile Navigation — rendered outside header for full-screen overlay */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={closeMobileMenu} />
          <nav className="mobile-nav">
            <button className="mobile-nav-close" onClick={closeMobileMenu} aria-label="Close menu">
              <X size={24} />
            </button>

            <Link to="/" onClick={closeMobileMenu}>Home</Link>
            <Link to="/articles" onClick={closeMobileMenu}>Articles</Link>
            <Link to="https://auxein.co.nz/about/" onClick={closeMobileMenu}>About</Link>
            <a href="https://auxein.co.nz/insights-pro/" target="_blank" rel="noopener noreferrer" onClick={closeMobileMenu}>
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
                  handleSignIn();
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

      {/* User menu overlay (desktop) */}
      {userMenuOpen && <div className="user-menu-overlay" onClick={() => setUserMenuOpen(false)} />}

      {/* Preferences modal */}
      <UserPreferencesModal isOpen={preferencesModalOpen} onClose={() => setPreferencesModalOpen(false)} />
    </>
  );
}

export default SiteHeader;
