// hooks/useAdminAuth.js - Admin Authentication Hook
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Your existing auth context

const ADMIN_DOMAIN = 'auxein.co.nz';

/**
 * Check if an email belongs to admin domain
 */
export const isAdminEmail = (email) => {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ADMIN_DOMAIN}`);
};

/**
 * Hook to check admin status and provide admin utilities
 */
export const useAdminAuth = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const isAdmin = useMemo(() => {
    if (!isAuthenticated || !user?.email) return false;
    return isAdminEmail(user.email);
  }, [isAuthenticated, user?.email]);

  /**
   * Redirect to login if not authenticated,
   * redirect to home if authenticated but not admin
   */
  const requireAdmin = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: window.location.pathname } });
      return false;
    }
    if (!isAdmin) {
      navigate('/', { replace: true });
      return false;
    }
    return true;
  };

  return {
    isAdmin,
    isAuthenticated,
    user,
    requireAdmin,
  };
};

export default useAdminAuth;


// ============================================
// AdminRoute.jsx - Protected Route Component
// ============================================
/*

// components/AdminRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';

export const AdminRoute = ({ children }) => {
  const { isAuthenticated, isAdmin } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login, save intended destination
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isAdmin) {
    // Authenticated but not admin - redirect to home
    return <Navigate to="/" replace />;
  }

  return children;
};

export default AdminRoute;

*/


// ============================================
// Usage in App.jsx routes
// ============================================
/*

import { Routes, Route } from 'react-router-dom';
import AdminRoute from './components/AdminRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import WeatherStatus from './pages/admin/WeatherStatus';
import DataQuality from './pages/admin/DataQuality';

// In your routes:
<Routes>
  {/* Public routes *\/}
  <Route path="/" element={<Home />} />
  <Route path="/login" element={<Login />} />
  
  {/* Admin routes - protected *\/}
  <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
  <Route path="/admin/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
  <Route path="/admin/users/:id" element={<AdminRoute><UserDetail /></AdminRoute>} />
  <Route path="/admin/weather" element={<AdminRoute><WeatherStatus /></AdminRoute>} />
  <Route path="/admin/weather/:id" element={<AdminRoute><StationDetail /></AdminRoute>} />
  <Route path="/admin/data" element={<AdminRoute><DataQuality /></AdminRoute>} />
</Routes>

*/


// ============================================
// AdminNav component for header/sidebar
// ============================================
/*

// components/AdminNav.jsx
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { 
  Users, 
  Cloud, 
  Database, 
  LayoutDashboard,
  Settings 
} from 'lucide-react';

export const AdminNav = () => {
  const { isAdmin } = useAdminAuth();

  if (!isAdmin) return null;

  return (
    <nav className="admin-nav">
      <Link to="/admin" className="nav-item">
        <LayoutDashboard size={18} />
        <span>Dashboard</span>
      </Link>
      <Link to="/admin/users" className="nav-item">
        <Users size={18} />
        <span>Users</span>
      </Link>
      <Link to="/admin/weather" className="nav-item">
        <Cloud size={18} />
        <span>Weather</span>
      </Link>
      <Link to="/admin/data" className="nav-item">
        <Database size={18} />
        <span>Data Quality</span>
      </Link>
    </nav>
  );
};

*/