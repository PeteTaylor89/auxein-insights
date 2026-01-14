// src/components/auth/AuthModal.jsx - Main Auth Modal
import { useState } from 'react';
import { X } from 'lucide-react';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import './AuthModal.css';

function AuthModal({ isOpen, onClose, initialView = 'login' }) {
  const [view, setView] = useState(initialView); // 'login', 'signup', 'forgot'

  if (!isOpen) return null;

  const handleSuccess = () => {
    onClose();
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
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