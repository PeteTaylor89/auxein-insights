// src/components/RegionalMap/BlockPopup.jsx
import { useState } from 'react';
import { X, MapPin, Calendar, Mountain, Grape, Building2, Sprout, Moon, Recycle, Award } from 'lucide-react';
import ReportIssueForm from './ReportIssueForm';

function BlockPopup({ block, onClose }) {
  const [showReportForm, setShowReportForm] = useState(false);

  if (!block) return null;

  // Calculate sustainability badges
  const sustainabilityBadges = [];
  if (block.organic) sustainabilityBadges.push({ icon: <Sprout size={16} />, label: 'Organic', color: '#22c55e' });
  if (block.biodynamic) sustainabilityBadges.push({ icon: <Moon size={16} />, label: 'Biodynamic', color: '#8b5cf6' });
  if (block.regenerative) sustainabilityBadges.push({ icon: <Recycle size={16} />, label: 'Regenerative', color: '#3b82f6' });
  if (block.swnz) sustainabilityBadges.push({ icon: <Award size={16} />, label: 'SWNZ', color: '#f59e0b' });

  return (
    <div className="block-popup-overlay" onClick={onClose}>
      <div className="block-popup" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="popup-header">
          <h3>{block.block_name || 'Unnamed Block'}</h3>
          <button className="popup-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
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
          {!showReportForm ? (
            <button 
              className="report-issue-btn"
              onClick={() => setShowReportForm(true)}
            >
              Report Data Issue
            </button>
          ) : (
            <ReportIssueForm 
              block={block}
              onClose={() => setShowReportForm(false)}
              onSuccess={() => {
                setShowReportForm(false);
                // Could show a success message here
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default BlockPopup;