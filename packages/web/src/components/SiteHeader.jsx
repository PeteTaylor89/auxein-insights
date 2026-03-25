// components/SiteHeader.jsx — Pro app sticky header with nav, auth, mobile menu
import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, Settings, Menu, X, Home, MapPin, Grape, Tractor, TriangleAlert, Lightbulb, Shield, Calendar, Wrench } from 'lucide-react';
import { useAuth } from '@vineyard/shared';
import NotificationBell from './NotificationBell';
import Logo from '../assets/App_Logo_September 2025.jpg';
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

const baseNavItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/maps', label: 'Map', icon: MapPin },
  { path: '/observations', label: 'Vineyard', icon: Grape },
  { path: '/assets', label: 'Assets', icon: Tractor },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/RiskDashboard', label: 'Risks', icon: TriangleAlert },
  { path: '/Insights', label: 'Insights', icon: Lightbulb },
];

function SiteHeader() {
  const { isAuthenticated, user, logout, userTypeRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollDirection, isAtTop } = useScrollDirection();
  const [isMobile, setIsMobile] = useState(false);

  // Build nav items dynamically — add Manage/Admin links based on role
  let navItems = [...baseNavItems];
  if (userTypeRole === 'company_admin' || userTypeRole === 'auxein_admin') {
    navItems.push({ path: '/company-admin', label: 'Manage', icon: Wrench });
  }
  if (userTypeRole === 'auxein_admin') {
    navItems.push({ path: '/admin', label: 'Admin', icon: Shield });
  }

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    navigate('/login');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const isActive = (path) => location.pathname === path;

  const headerHidden = isMobile && scrollDirection === 'down' && !isAtTop && !mobileMenuOpen;

  return (
    <>
      <header className={`site-header ${headerHidden ? 'header-hidden' : ''}`}>
        <div className="header-container">
          <Link to="/" className="header-brand">
            <img src={Logo} alt="Auxein Logo" className="header-logo" />
            <div className="header-title-block">
              <h1>Auxein Grow</h1>
              <p>Vineyard Management</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="header-nav desktop-nav">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={isActive(item.path) ? 'active' : ''}
              >
                {item.label}
              </Link>
            ))}

            {!isAuthenticated ? (
              <Link to="/login" className="btn-accent" style={{ fontSize: 'var(--font-size-base)' }}>
                Sign In
              </Link>
            ) : (
              <>
              <NotificationBell />
              <div className="user-menu-container">
                <button className="user-menu-trigger" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                  <User size={18} />
                  <span>{user?.first_name || 'Account'}</span>
                </button>

                {userMenuOpen && (
                  <div className="user-dropdown">
                    <div className="user-dropdown-header">
                      <strong>{user?.first_name} {user?.last_name}</strong>
                      {user?.role && <small>{user.role}</small>}
                    </div>
                    <Link to="/profile" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                      <Settings size={16} />
                      Profile & Settings
                    </Link>
                    {(userTypeRole === 'company_admin' || userTypeRole === 'auxein_admin') && (
                      <Link to="/company-admin" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                        <Wrench size={16} />
                        Manage Company
                      </Link>
                    )}
                    {userTypeRole === 'auxein_admin' && (
                      <Link to="/admin" className="user-dropdown-item" onClick={() => setUserMenuOpen(false)}>
                        <Shield size={16} />
                        System Admin
                      </Link>
                    )}
                    <button className="user-dropdown-item" onClick={handleLogout}>
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
              </>
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

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={closeMobileMenu} />
          <nav className="mobile-nav">
            <button className="mobile-nav-close" onClick={closeMobileMenu} aria-label="Close menu">
              <X size={24} />
            </button>

            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={isActive(item.path) ? 'active' : ''}
                  onClick={closeMobileMenu}
                >
                  <Icon size={20} />
                  {item.label}
                </Link>
              );
            })}

            <div className="mobile-nav-divider" />

            {!isAuthenticated ? (
              <Link to="/login" className="mobile-auth-btn mobile-nav-item" onClick={closeMobileMenu}>
                <User size={18} />
                Sign In
              </Link>
            ) : (
              <>
                <div className="mobile-user-info">
                  <User size={20} />
                  <div>
                    <strong>{user?.first_name} {user?.last_name}</strong>
                    {user?.email && <small>{user.email}</small>}
                  </div>
                </div>
                <Link to="/profile" className="mobile-nav-item" onClick={closeMobileMenu}>
                  <Settings size={18} />
                  Profile & Settings
                </Link>
                {(userTypeRole === 'company_admin' || userTypeRole === 'auxein_admin') && (
                  <Link to="/company-admin" className="mobile-nav-item" onClick={closeMobileMenu}>
                    <Wrench size={18} />
                    Manage Company
                  </Link>
                )}
                {userTypeRole === 'auxein_admin' && (
                  <Link to="/admin" className="mobile-nav-item" onClick={closeMobileMenu}>
                    <Shield size={18} />
                    System Admin
                  </Link>
                )}
                <button className="mobile-nav-item mobile-logout" onClick={() => { closeMobileMenu(); handleLogout(); }}>
                  <LogOut size={18} />
                  Sign Out
                </button>
              </>
            )}
          </nav>
        </>
      )}

      {/* Desktop user menu overlay */}
      {userMenuOpen && <div className="user-menu-overlay" onClick={() => setUserMenuOpen(false)} />}
    </>
  );
}

export default SiteHeader;
