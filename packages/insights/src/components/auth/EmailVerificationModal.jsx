// src/components/auth/EmailVerificationModal.jsx
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import publicAuthService from '../../services/publicAuthService';
import './AuthModal.css';

function EmailVerificationModal({ isOpen, onClose, token }) {
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen || !token) return;

    const verifyEmail = async () => {
      try {
        const response = await publicAuthService.verifyEmail(token);
        setStatus('success');
        setMessage(response.message || 'Email verified successfully!');
        
        // Auto-close after 3 seconds
        setTimeout(() => {
          onClose();
        }, 3000);
        
      } catch (error) {
        setStatus('error');
        setMessage(error.message || 'Verification failed. The link may have expired.');
      }
    };

    verifyEmail();
  }, [isOpen, token, onClose]);

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-content">
        <button className="auth-modal-close" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="auth-modal-header">
          <h2>Email Verification</h2>
        </div>

        <div className="auth-modal-body">
          {status === 'verifying' && (
            <div className="verification-status">
              <div className="spinner"></div>
              <p>Verifying your email address...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="verification-success">
              <div className="success-icon">✓</div>
              <h3>Success!</h3>
              <p>{message}</p>
              <p className="redirect-message">You can now sign in.</p>
            </div>
          )}

          {status === 'error' && (
            <div className="verification-error">
              <div className="error-icon">✗</div>
              <h3>Verification Failed</h3>
              <p>{message}</p>
              <button 
                className="auth-submit-btn"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailVerificationModal;