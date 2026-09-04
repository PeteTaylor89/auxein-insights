// components/SiteHeader.jsx — Shared sticky header with nav, auth, mobile menu
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Settings, Shield, Menu, X } from 'lucide-react';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import { useCountryIndustry, readScopeHint, scopePath, DEFAULT_COUNTRY, DEFAULT_INDUSTRY } from '../contexts/CountryIndustryContext';
import CountrySwitcher from './scope/CountrySwitcher';
import UserPreferencesModal from './auth/UserPreferencesModal';
import MainLogo from '../assets/logo-mark.png';
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

function SiteHeader({ onSignInClick }) {
  const { isAuthenticated, user, logout } = usePublicAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const { scrollDirection, isAtTop } = useScrollDirection();
  const [isMobile, setIsMobile] = useState(false);

  const isAdmin = isAuthenticated && user?.is_admin;
  // Both flags below are SERVER-COMPUTED and must never be re-derived here.
  // `subscription_tier === 'pro'` is wrong twice over: a Grow user carries
  // 'grow' and is fully entitled, and an account member carries 'free' and is
  // too — the exact failure `core/entitlements.py` exists to prevent.
  //
  // Enterprise account membership, served on the auth payload rather than
  // fetched here. `/pro/portfolio` had NO nav entry at all and the only inbound
  // link in the app was from a page you reach from the portfolio, so a client's
  // 67 monitored sites were behind a URL you had to already know.
  //
  // Gated on the membership list, not on `is_pro`: membership is what the page
  // needs, and most Pro subscribers correctly have no account and would get the
  // "No portfolio yet" empty state from a nav link that promised otherwise.
  const hasPortfolio = isAuthenticated
    && (user?.portfolio_accounts?.length || 0) > 0;
  // "My Site" is gated on HOLDING a point, not on being Pro. Pro and a saved
  // site are separate purchases, and three routes to Pro carry no point: a
  // Grow user, an enterprise account member, and a subscriber who has not
  // bought one. `is_pro` sent all of them to a placement map with a disabled
  // button. Server-computed — see core/entitlements.has_site_access.
  const hasOwnSite = isAuthenticated && user?.has_site_access;

  // Where "Explore" points. The header renders on scoped and unscoped pages
  // alike, so this resolves in three steps: the scope of the page we are on,
  // then the scope this visitor last chose, then New Zealand wine.
  //
  // The remembered scope is read HERE and not used to redirect `/`. Redirecting
  // the landing page would drop the `#insights_sso=` fragment Grow opens the
  // site with, and would put a redirect on the highest-value URL on the domain.
  const { isScoped, country, industry } = useCountryIndustry();
  const hint = readScopeHint();
  const exploreHref = isScoped
    ? scopePath(country, industry)
    : scopePath(hint?.country || DEFAULT_COUNTRY,
                hint?.industry || DEFAULT_INDUSTRY);

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
            </div>
          </Link>

          {/* Desktop Navigation — content-led and flat (site map §3, Option A).
              The off-site auxein.co.nz links moved to SiteFooter: primary nav
              should navigate the product, and /map and /research were both
              missing from it entirely.

              "Regions" became "Explore" when the page gained industry pills:
              it is no longer a list of wine regions, and the label has to keep
              working for every future country and industry. The target is the
              CURRENT scope when there is one, otherwise the scope this visitor
              last used, otherwise New Zealand wine. */}
          <nav className="header-nav desktop-nav">
            <Link to="/">Home</Link>
            <Link to="/map">Atlas</Link>
            <Link to={exploreHref}>Explore</Link>
            <Link to="/articles">Articles</Link>
            <Link to="/research">Research</Link>
            {/* Pro only. The page is reachable by anyone and explains itself,
                but putting it in the nav for people who cannot use it turns
                primary navigation into an advertisement. */}
            {hasOwnSite && <Link to="/my-site">My Site</Link>}
            {hasPortfolio && <Link to="/pro/portfolio">Portfolio</Link>}

            {/* Renders nothing at all while only one country has data, so this
                is invisible today and appears on its own the moment a second
                country goes active. No code change needed for that. */}
            <CountrySwitcher />

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
            <Link to="/map" onClick={closeMobileMenu}>Atlas</Link>
            <Link to={exploreHref} onClick={closeMobileMenu}>Explore</Link>
            <CountrySwitcher className="mobile-nav__country" />
            <Link to="/articles" onClick={closeMobileMenu}>Articles</Link>
            <Link to="/research" onClick={closeMobileMenu}>Research</Link>
            {hasOwnSite && (
              <Link to="/my-site" onClick={closeMobileMenu}>My Site</Link>
            )}
            {hasPortfolio && (
              <Link to="/pro/portfolio" onClick={closeMobileMenu}>Portfolio</Link>
            )}
            <Link to="/about" onClick={closeMobileMenu}>About</Link>

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
