// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';

/**
 * ProtectedRoute - guards routes by authentication and optionally by permission
 *
 * Props:
 *   children           - content to render if authorized
 *   allowedUserTypes   - (optional) array of user_type_role values that can access this route
 *   requiredPermission - (optional) { module, action } to check against permission matrix
 *   fallbackPath       - (optional) redirect path on denied (default: "/")
 */
function ProtectedRoute({ children, allowedUserTypes, requiredPermission, fallbackPath = '/' }) {
  const { isAuthenticated, loading, userTypeRole, hasPermission } = useAuth();
  const location = useLocation();

  // Show loading state
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check user type allowlist
  if (allowedUserTypes && !allowedUserTypes.includes(userTypeRole)) {
    return <Navigate to={fallbackPath} replace />;
  }

  // Check module/action permission
  if (requiredPermission && !hasPermission(requiredPermission.module, requiredPermission.action)) {
    return <Navigate to={fallbackPath} replace />;
  }

  // Render children if authorized
  return children;
}

export default ProtectedRoute;
