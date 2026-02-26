// src/components/AdminRoute.jsx - Admin Route Protection
import { Navigate, useLocation } from 'react-router-dom';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import { RefreshCw } from 'lucide-react';

/**
 * Protected route wrapper for admin pages
 * Only allows access to users with is_admin flag set to true
 */
const AdminRoute = ({ children }) => {
  const { user, isAuthenticated, loading } = usePublicAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-gray-500">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Redirect to home if authenticated but not admin
  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  // User is authenticated and is an admin
  return children;
};

export default AdminRoute;
