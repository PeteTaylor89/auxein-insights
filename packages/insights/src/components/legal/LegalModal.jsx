// src/components/legal/LegalModal.jsx
// Modal for displaying legal agreements during signup
// Requires checkbox agreement before form submission

import { useState, useRef, useEffect } from 'react';
import { LegalTabs } from './LegalContent';

function LegalModal({ isOpen, onClose, onAccept }) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const contentRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setHasScrolled(false);
      setIsChecked(false);
    }
  }, [isOpen]);

  // Track if user has scrolled through content (optional enforcement)
  const handleScroll = (e) => {
    const element = e.target;
    const scrolledToBottom = 
      element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    
    if (scrolledToBottom) {
      setHasScrolled(true);
    }
  };

  const handleAccept = () => {
    if (isChecked) {
      onAccept();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div 
        className="legal-modal" 
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="legal-modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="legal-modal-header">
          <h2 id="legal-modal-title">Terms & Privacy</h2>
          <button 
            type="button"
            className="legal-modal-close" 
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content with scroll tracking */}
        <div 
          className="legal-modal-body"
          ref={contentRef}
          onScroll={handleScroll}
        >
          <LegalTabs defaultTab="terms" />
        </div>

        {/* Footer with agreement checkbox */}
        <div className="legal-modal-footer">
          <label className="legal-checkbox-label">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
            />
            <span>
              I have read and agree to the{' '}
              <strong>Terms of Use</strong>,{' '}
              <strong>Privacy Policy</strong>, and{' '}
              <strong>Cookie Policy</strong>
            </span>
          </label>

          <div className="legal-modal-actions">
            <button 
              type="button" 
              className="legal-btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button 
              type="button"
              className="legal-btn-accept"
              onClick={handleAccept}
              disabled={!isChecked}
            >
              Accept & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LegalModal;