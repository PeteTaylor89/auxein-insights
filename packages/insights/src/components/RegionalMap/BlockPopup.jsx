// src/components/RegionalMap/BlockPopup.jsx
// Block info popup with separate full-screen report modal
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Calendar, Mountain, Grape, Building2, Sprout, Moon, Recycle, Award } from 'lucide-react';
import ReportIssueForm from './ReportIssueForm';
import { trackBlockClicked } from '../../utils/analytics';

function BlockPopup({ block, onClose }) {
  const [showReportForm, setShowReportForm] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const popupRef = useRef(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (showReportForm) {
          setShowReportForm(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, showReportForm]);

  // Prevent body scroll when popup is open on mobile
  useEffect(() => {
    if (isMobile || showReportForm) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobile, showReportForm]);

  // Track block view when popup opens
  useEffect(() => {
    if (block) {
      trackBlockClicked(block);
    }
  }, [block?.id]); // Only track when block ID changes

  if (!block) return null;

  // Calculate sustainability badges
  const sustainabilityBadges = [];
  if (block.organic) sustainabilityBadges.push({ icon: <Sprout size={16} />, label: 'Organic', color: '#22c55e' });
  if (block.biodynamic) sustainabilityBadges.push({ icon: <Moon size={16} />, label: 'Biodynamic', color: '#8b5cf6' });
  if (block.regenerative) sustainabilityBadges.push({ icon: <Recycle size={16} />, label: 'Regenerative', color: '#3b82f6' });
  if (block.swnz) sustainabilityBadges.push({ icon: <Award size={16} />, label: 'SWNZ', color: '#f59e0b' });

  // Handle overlay click - close only if clicking the overlay itself
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Report Form Modal - rendered via portal to document.body
  const reportFormModal = showReportForm && createPortal(
    <div 
      className="report-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowReportForm(false);
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-form-title"
    >
      <div className="report-modal">
        {/* Header */}
        <div className="report-modal-header">
          <h3 id="report-form-title">Suggest Data Update</h3>
          <button 
            className="report-modal-close"
            onClick={() => setShowReportForm(false)}
            aria-label="Close form"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Block context summary */}
        <div className="report-modal-context">
          <span className="context-label">Block:</span>
          <span className="context-value">{block.block_name || 'Unnamed Block'}</span>
          {block.variety && (
            <>
              <span className="context-separator">•</span>
              <span className="context-value">{block.variety}</span>
            </>
          )}
          {block.region && (
            <>
              <span className="context-separator">•</span>
              <span className="context-value">{block.region}</span>
            </>
          )}
        </div>

        {/* Form */}
        <div className="report-modal-body">
          <ReportIssueForm 
            block={block}
            onClose={() => setShowReportForm(false)}
            onSuccess={() => {
              setShowReportForm(false);
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <div 
        className="block-popup-overlay" 
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-popup-title"
      >
        <div 
          className="block-popup" 
          ref={popupRef}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile drag handle indicator */}
          {isMobile && (
            <div className="popup-drag-handle">
              <div className="drag-handle-bar" />
            </div>
          )}

          {/* Header */}
          <div className="popup-header">
            <h3 id="block-popup-title">{block.block_name || 'Unnamed Block'}</h3>
            <button 
              className="popup-close-btn" 
              onClick={onClose} 
              aria-label="Close popup"
              type="button"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="popup-content">
            {/* Variety */}
            {block.variety && (
              <div className="popup-row">
                <div className="popup-icon">
                  <Grape size={18} />
                </div>
                <div className="popup-details">
                  <span className="popup-label">Variety</span>
                  <span className="popup-value">{block.variety}</span>
                </div>
              </div>
            )}

            {/* Area */}
            {block.area && (
              <div className="popup-row">
                <div className="popup-icon">
                  <MapPin size={18} />
                </div>
                <div className="popup-details">
                  <span className="popup-label">Area</span>
                  <span className="popup-value">{block.area.toFixed(2)} ha</span>
                </div>
              </div>
            )}

            {/* Region */}
            {block.region && (
              <div className="popup-row">
                <div className="popup-icon">
                  <MapPin size={18} />
                </div>
                <div className="popup-details">
                  <span className="popup-label">Region</span>
                  <span className="popup-value">
                    {block.region}
                    {block.gi && ` (${block.gi})`}
                  </span>
                </div>
              </div>
            )}

            {/* Planted Date & Age */}
            {block.planted_date && (
              <div className="popup-row">
                <div className="popup-icon">
                  <Calendar size={18} />
                </div>
                <div className="popup-details">
                  <span className="popup-label">Planted</span>
                  <span className="popup-value">
                    {new Date(block.planted_date).getFullYear()}
                    {block.age_years && ` (${block.age_years} years old)`}
                  </span>
                </div>
              </div>
            )}

            {/* Elevation */}
            {block.elevation && (
              <div className="popup-row">
                <div className="popup-icon">
                  <Mountain size={18} />
                </div>
                <div className="popup-details">
                  <span className="popup-label">Elevation</span>
                  <span className="popup-value">{Math.round(block.elevation)}m</span>
                </div>
              </div>
            )}

            {/* Winery */}
            {block.winery && (
              <div className="popup-row">
                <div className="popup-icon">
                  <Building2 size={18} />
                </div>
                <div className="popup-details">
                  <span className="popup-label">Winery</span>
                  <span className="popup-value">{block.winery}</span>
                </div>
              </div>
            )}

            {/* Sustainability Badges */}
            {sustainabilityBadges.length > 0 && (
              <div className="popup-badges">
                <span className="popup-label">Sustainability</span>
                <div className="badge-list">
                  {sustainabilityBadges.map((badge, idx) => (
                    <div 
                      key={idx} 
                      className="sustainability-badge"
                      style={{ borderColor: badge.color }}
                    >
                      <span style={{ color: badge.color }}>{badge.icon}</span>
                      <span>{badge.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="popup-footer">
            <button 
              className="report-issue-btn"
              onClick={() => setShowReportForm(true)}
              type="button"
            >
              Suggest Data Update
            </button>
          </div>
        </div>
      </div>

      {/* Report form modal - rendered to body via portal */}
      {reportFormModal}
    </>
  );
}

export default BlockPopup;