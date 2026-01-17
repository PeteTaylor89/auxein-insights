// packages/insights/src/components/climate/PublicClimateContainer.jsx
/**
 * PublicClimateContainer Component
 * 
 * Main wrapper for public climate features (Season Explorer & Projections).
 * Manages zone selection, comparison zones, and toggles between different views.
 */

import React, { useState } from 'react';
import { X, Info, HelpCircle } from 'lucide-react';
import ZoneSelector from './ZoneSelector';
import SeasonExplorer from './SeasonExplorer';
import ProjectionsExplorer from './ProjectionsExplorer';
import ClimateAbout from './ClimateAbout';
import './PublicClimate.css';

const PublicClimateContainer = ({ 
  initialView = 'seasons',  // 'seasons' or 'projections'
  onClose 
}) => {
  const [selectedZone, setSelectedZone] = useState(null);
  const [comparisonZones, setComparisonZones] = useState([]);
  const [activeView, setActiveView] = useState(initialView);
  const [showAbout, setShowAbout] = useState(false);

  const handleZoneChange = (zone) => {
    setSelectedZone(zone);
    // Clear comparison zones when main zone changes
    setComparisonZones([]);
  };

  const handleComparisonZonesChange = (zones) => {
    // Filter out the main selected zone from comparison
    const filtered = zones.filter(z => z.slug !== selectedZone?.slug);
    setComparisonZones(filtered.slice(0, 4)); // Max 4 comparison zones
  };

  return (
    <div className="public-climate-container">
      {/* Header */}
      <div className="climate-header">
        <div className="header-title">
          <h2>
            {activeView === 'seasons' ? 'Climate History' : 'Climate Projections'}
          </h2>
          <button
            className="about-btn"
            onClick={() => setShowAbout(true)}
            title="About this data"
          >
            <HelpCircle size={18} />
            <span>About</span>
          </button>
        </div>
        {onClose && (
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        )}
      </div>

      {/* View Toggle */}
      <div className="view-toggle-container">
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${activeView === 'seasons' ? 'active' : ''}`}
            onClick={() => setActiveView('seasons')}
          >
            Climate History
          </button>
          <button
            className={`view-toggle-btn ${activeView === 'projections' ? 'active' : ''}`}
            onClick={() => setActiveView('projections')}
          >
            Future Projections
          </button>
        </div>
      </div>

      {/* Zone Selector */}
      <div className="zone-selector-container">
        <ZoneSelector
          selectedZone={selectedZone}
          onZoneChange={handleZoneChange}
          comparisonZones={comparisonZones}
          onComparisonZonesChange={handleComparisonZonesChange}
          allowComparison={activeView === 'seasons'}
        />
      </div>

      {/* Main Content */}
      <div className="climate-content">
        {activeView === 'seasons' ? (
          <SeasonExplorer 
            zone={selectedZone} 
            comparisonZones={comparisonZones}
            onComparisonZonesChange={handleComparisonZonesChange}
          />
        ) : (
          <ProjectionsExplorer zone={selectedZone} />
        )}
      </div>

      {/* Data Attribution */}
      <div className="climate-attribution">
        <Info size={14} />
        <span>
          Climate Baseline: 1986-2005. 
          Projections: CMIP6 models (SSP126, SSP245, SSP370).
        </span>
      </div>

      {/* About Modal */}
      {showAbout && (
        <ClimateAbout onClose={() => setShowAbout(false)} />
      )}
    </div>
  );
};

export default PublicClimateContainer;