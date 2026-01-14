// src/components/auth/AuthGuard.jsx - Protect Features Behind Auth
import { useState } from 'react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import AuthModal from './AuthModal';

/**
 * AuthGuard - Protects features/content behind authentication
 * 
 * Usage:
 * <AuthGuard fallback={<div>Sign in to view</div>}>
 *   <ProtectedContent />
 * </AuthGuard>
 */
function AuthGuard({ children, fallback, showModal = true }) {
  const { isAuthenticated, loading } = usePublicAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (loading) {
    return <div className="auth-guard-loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <>
        {fallback || (
          <div className="auth-guard-fallback">
            <div className="auth-required-message">
              <h3>🔒 Sign In Required</h3>
              <p>Create a free account to access climate insights and interactive maps</p>
              <button 
                className="auth-cta-btn"
                onClick={() => setAuthModalOpen(true)}
              >
                Sign In or Create Account
              </button>
            </div>
          </div>
        )}
        
        {showModal && (
          <AuthModal 
            isOpen={authModalOpen}
            onClose={() => setAuthModalOpen(false)}
          />
        )}
      </>
    );
  }

  return children;
}

export default AuthGuard;