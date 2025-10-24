// src/components/MobileNavigation.jsx
import { Link, useLocation } from 'react-router-dom';
import { Home, MapPin, User, UserCheck, CalendarDays, Lightbulb, TriangleAlert, Grape} from "lucide-react";
import { useAuth } from '@vineyard/shared';

function MobileNavigation() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  const navItems = [
    { path: "/", label: "Home", icon: <Home /> },
    { path: "/maps", label: "Map", icon: <MapPin /> },
    { path: "/observations", label: "Vineyard Management", icon: <Grape /> },
    { path: "/RiskDashboard", label: "Risk Management", icon: <TriangleAlert /> },
    { path: "/calendar", label: "Calendar", icon: <CalendarDays /> },
    { path: "/insights", label: "Insights", icon: <Lightbulb /> },
    { 
      path: isAuthenticated ? "/profile" : "/login", 
      label: isAuthenticated ? "Profile" : "Login", 
      icon: isAuthenticated ? <UserCheck className="user-icon-authenticated" /> : <User />
    },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bottom-nav">
      {navItems.map((item, index) => (
        <Link
          key={`${item.path}-${index}`}
          to={item.path}
          className={`bottom-nav-item ${isActive(item.path) ? "active" : ""} ${
            index === navItems.length - 1 && isAuthenticated ? "user-item" : ""
          }`}
        >
          <span className="nav-icon">
            {index === navItems.length - 1 && isAuthenticated ? (
              <div className="authenticated-icon">
                {item.icon}
                <span className="auth-indicator"></span>
              </div>
            ) : (
              item.icon
            )}
          </span>
          <span className="nav-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default MobileNavigation;