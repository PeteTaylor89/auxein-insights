// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  
  // Show loading state
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Save the intended location for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Render children if authenticated
  return children;
}

export default ProtectedRoute;