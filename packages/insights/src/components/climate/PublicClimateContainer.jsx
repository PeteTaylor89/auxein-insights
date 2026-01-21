// packages/insights/src/components/climate/PublicClimateContainer.jsx
/**
 * PublicClimateContainer Component (Updated)
 * 
 * Main wrapper for public climate features including:
 * - Current Season: Live climate data with GDD progress
 * - Phenology: Growth stage estimates and harvest predictions  
 * - Climate History: Historical season explorer
 * - Climate Projections: Future SSP projections
 */

import React, { useState } from 'react';
import { X, Info, HelpCircle } from 'lucide-react';
import ZoneSelector from './ZoneSelector';
import ZoneSelectorRealtime from './ZoneSelectorRealtime';
import CurrentSeasonExplorer from './CurrentSeasonExplorer';
import PhenologyExplorer from './PhenologyExplorer';
import SeasonExplorer from './SeasonExplorer';
import ProjectionsExplorer from './ProjectionsExplorer';
import ClimateAbout from './ClimateAbout';
import './PublicClimate.css';
import './RealtimeClimate.css';

const VIEW_CONFIG = {
  currentseason: {
    label: 'Current Season',
    description: 'Live climate data and GDD accumulation',
    component: CurrentSeasonExplorer,
    allowComparison: false,
    useRealtimeSelector: true,  // Use realtime zone selector
  },
  phenology: {
    label: 'Phenology',
    description: 'Growth stage estimates and harvest predictions',
    component: PhenologyExplorer,
    allowComparison: false,
    useRealtimeSelector: true,  // Use realtime zone selector
  },
  seasons: {
    label: 'Climate History',
    description: 'Historical growing season analysis',
    component: SeasonExplorer,
    allowComparison: true,
    useRealtimeSelector: false,
  },
  projections: {
    label: 'Future Projections',
    description: 'SSP climate scenarios to 2100',
    component: ProjectionsExplorer,
    allowComparison: false,
    useRealtimeSelector: false,
  },
};

const PublicClimateContainer = ({ 
  initialView = 'currentseason',
  onClose 
}) => {
  const [selectedZone, setSelectedZone] = useState(null);
  const [comparisonZones, setComparisonZones] = useState([]);
  const [activeView, setActiveView] = useState(initialView);
  const [showAbout, setShowAbout] = useState(false);

  const currentViewConfig = VIEW_CONFIG[activeView] || VIEW_CONFIG.currentseason;
  const ContentComponent = currentViewConfig.component;

  const handleZoneChange = (zone) => {
    setSelectedZone(zone);
    setComparisonZones([]);
  };

  const handleComparisonZonesChange = (zones) => {
    const filtered = zones.filter(z => z.slug !== selectedZone?.slug);
    setComparisonZones(filtered.slice(0, 4));
  };

  // Render appropriate zone selector based on view type
  const renderZoneSelector = () => {
    if (currentViewConfig.useRealtimeSelector) {
      return (
        <ZoneSelectorRealtime
          selectedZone={selectedZone}
          onZoneChange={handleZoneChange}
          label="Climate Zone"
        />
      );
    }
    
    return (
      <ZoneSelector
        selectedZone={selectedZone}
        onZoneChange={handleZoneChange}
        comparisonZones={comparisonZones}
        onComparisonZonesChange={handleComparisonZonesChange}
        allowComparison={currentViewConfig.allowComparison}
      />
    );
  };

  return (
    <div className="public-climate-container">
      {/* Header */}
      <div className="climate-header">
        <div className="header-title">
          <h2>{currentViewConfig.label}</h2>
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

      {/* Zone Selector */}
      <div className="zone-selector-container">
        {renderZoneSelector()}
      </div>

      {/* Main Content */}
      <div className="climate-content">
        <ContentComponent 
          zone={selectedZone} 
          comparisonZones={comparisonZones}
          onComparisonZonesChange={handleComparisonZonesChange}
        />
      </div>

      {/* Data Attribution */}
      <div className="climate-attribution">
        <Info size={14} />
        <span>
          {activeView === 'currentseason' || activeView === 'phenology' 
            ? 'Real-time data from weather station network. Updated daily.'
            : 'Climate Baseline: 1986-2005. Projections: CMIP6 models (SSP126, SSP245, SSP370).'}
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