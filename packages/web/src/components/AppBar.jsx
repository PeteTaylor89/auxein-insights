// src/components/AppBar.jsx
import { Link, useLocation } from 'react-router-dom';
import { Search, MessageSquare, User, Bell, UserCheck } from "lucide-react";
import { useAuth } from '@vineyard/shared';

function AppBar() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  
  // Get first name or username to display
  const displayName = user?.username || 'User';
  
  const leftNavItems = [
    { 
      path: isAuthenticated ? "/profile" : "/login", 
      label: isAuthenticated ? displayName : "", 
      icon: isAuthenticated ? <UserCheck className="user-icon-authenticated" /> : <User /> 
    },
    { path: "/messages", label: "", icon: <Search /> },
  ];
  
  const rightNavItems = [
    { path: "/notifications", label: "", icon: <MessageSquare /> },
    { path: "/search", label: "", icon: <Bell /> },
  ];
  
  const isActive = (path) => location.pathname === path;
  
  return (
    <nav className="main-nav">
      <div className="nav-container">
        <div className="left-nav">
          {leftNavItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''} ${index === 0 && isAuthenticated ? 'user-item' : ''}`}
            >
              <div className="nav-icon-container">
                <span className="nav-icon">
                  {index === 0 && isAuthenticated ? 
                    <div className="authenticated-icon">
                      {item.icon}
                      <span className="auth-indicator"></span>
                    </div> :
                    item.icon
                  }
                </span>
                
              </div>
            </Link>
          ))}
        </div>
        
        <div className="center-nav">
          <div className="nav-logo">Auxein</div>
        </div>
        
        <div className="right-nav">
          {rightNavItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label && <span className="nav-label">{item.label}</span>}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default AppBar;