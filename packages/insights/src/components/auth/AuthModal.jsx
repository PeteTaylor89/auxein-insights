// src/components/auth/AuthModal.jsx - Fixed Modal with improved overlay handling
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import './AuthModal.css';

function AuthModal({ isOpen, onClose, initialView = 'login' }) {
  const [view, setView] = useState(initialView);
  
  // Track if mousedown started on the overlay (not content)
  // This prevents closing when user drags selection outside the modal
  const mouseDownOnOverlay = useRef(false);

  // Reset view when modal opens
  useEffect(() => {
    if (isOpen) {
      setView(initialView);
    }
  }, [isOpen, initialView]);

  if (!isOpen) return null;

  const handleSuccess = () => {
    onClose();
  };

  // Only set flag if mousedown is directly on the overlay element
  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) {
      mouseDownOnOverlay.current = true;
    }
  };

  // Only close if BOTH mousedown AND mouseup happened on the overlay
  // This prevents closing when:
  // - User starts selecting text inside modal and drags outside
  // - User clicks inside modal but releases outside
  const handleOverlayMouseUp = (e) => {
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownOnOverlay.current = false;
  };

  // Reset the flag if mouse leaves the overlay entirely
  const handleOverlayMouseLeave = () => {
    mouseDownOnOverlay.current = false;
  };

  return (
    <div 
      className="auth-modal-overlay" 
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
      onMouseLeave={handleOverlayMouseLeave}
    >
      <div 
        className="auth-modal-content" 
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <button className="auth-modal-close" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="auth-modal-header">
          <h2>
            {view === 'login' && 'Welcome Back'}
            {view === 'signup' && 'Create Account'}
            {view === 'forgot' && 'Reset Password'}
          </h2>
          <p>
            {view === 'login' && 'Sign in to access climate insights and maps'}
            {view === 'signup' && 'Join to explore New Zealand wine regions'}
            {view === 'forgot' && 'Enter your email to receive a reset link'}
          </p>
        </div>

        <div className="auth-modal-body">
          {view === 'login' && (
            <LoginForm 
              onSuccess={handleSuccess}
              onSwitchToSignup={() => setView('signup')}
              onSwitchToForgot={() => setView('forgot')}
            />
          )}

          {view === 'signup' && (
            <SignupForm 
              onSuccess={handleSuccess}
              onSwitchToLogin={() => setView('login')}
            />
          )}

          {view === 'forgot' && (
            <ForgotPasswordForm 
              onBack={() => setView('login')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;