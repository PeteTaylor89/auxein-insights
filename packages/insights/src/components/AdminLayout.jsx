// src/components/AdminLayout.jsx - Admin Layout Wrapper
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Cloud, 
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import '../pages/admin.css';

const AdminLayout = ({ children, title, subtitle, backLink, backText }) => {
  const location = useLocation();
  
  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/users', icon: Users, label: 'Users' },
    { path: '/admin/weather', icon: Cloud, label: 'Weather' },
  ];

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="admin-page">
      {/* Admin Navigation Bar */}
      <nav className="admin-nav-bar">
        <div className="admin-nav-container">
          <div className="admin-nav-brand">
            <Link to="/" className="admin-nav-logo">
              <span className="admin-nav-logo-text">Auxein</span>
              <span className="admin-nav-logo-badge">Admin</span>
            </Link>
          </div>
          
          <div className="admin-nav-links">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`admin-nav-link ${isActive(item.path) ? 'active' : ''}`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <div className="admin-nav-right">
            <Link to="/" className="admin-nav-exit">
              Exit Admin
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="admin-main">
        <div className="admin-container">
          {/* Back Link */}
          {backLink && (
            <Link to={backLink} className="back-link">
              <ArrowLeft size={16} />
              {backText || 'Back'}
            </Link>
          )}

          {/* Page Header */}
          {title && (
            <div className="admin-header">
              <div>
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
              </div>
            </div>
          )}

          {/* Page Content */}
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;