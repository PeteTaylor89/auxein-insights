// packages/insights/src/components/climate/PublicClimateContainer.jsx
/**
 * PublicClimateContainer Component (Updated with View Tabs)
 * 
 * Main wrapper for public climate features including:
 * - Current Season: Live climate data with GDD progress
 * - Phenology: Growth stage estimates and harvest predictions  
 * - Disease Pressure: Risk indicators and recommendations
 * - Climate History: Historical season explorer
 * - Climate Projections: Future SSP projections
 * 
 * Now includes internal view tabs for easy switching between views
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Info, HelpCircle, CloudSunRain, Grape, 
  ShieldCheck, History, ChartSpline 
} from 'lucide-react';
import ZoneSelector from './ZoneSelector';
import ZoneSelectorRealtime from './ZoneSelectorRealtime';
import CurrentSeasonExplorer from './CurrentSeasonExplorer';
import PhenologyExplorer from './PhenologyExplorer';
import DiseasePressureExplorer from './DiseasePressureExplorer';
import SeasonExplorer from './SeasonExplorer';
import ProjectionsExplorer from './ProjectionsExplorer';
import ClimateAbout from './ClimateAbout';
import './PublicClimate.css';
import './RealtimeClimate.css';
import './climate-mobile-responsive.css';

const VIEW_CONFIG = {
  currentseason: {
    label: 'Current Season',
    shortLabel: 'Season',
    description: 'Live climate data and GDD accumulation',
    component: CurrentSeasonExplorer,
    allowComparison: false,
    useRealtimeSelector: true,
    icon: CloudSunRain,
  },
  phenology: {
    label: 'Phenology',
    shortLabel: 'Phenology',
    description: 'Growth stage estimates and harvest predictions',
    component: PhenologyExplorer,
    allowComparison: false,
    useRealtimeSelector: true,
    icon: Grape,
  },
  disease: {
    label: 'Disease Pressure',
    shortLabel: 'Disease',
    description: 'Risk indicators for downy mildew, powdery mildew, and botrytis',
    component: DiseasePressureExplorer,
    allowComparison: false,
    useRealtimeSelector: true,
    icon: ShieldCheck,
  },
  seasons: {
    label: 'Climate History',
    shortLabel: 'History',
    description: 'Historical growing season analysis',
    component: SeasonExplorer,
    allowComparison: true,
    useRealtimeSelector: false,
    icon: History,
  },
  projections: {
    label: 'Future Projections',
    shortLabel: 'Projections',
    description: 'SSP climate scenarios to 2100',
    component: ProjectionsExplorer,
    allowComparison: false,
    useRealtimeSelector: false,
    icon: ChartSpline,
  },
};

const VIEW_ORDER = ['currentseason', 'phenology', 'disease', 'seasons', 'projections'];

const PublicClimateContainer = ({ 
  initialView = 'currentseason',
  onClose 
}) => {
  const [selectedZone, setSelectedZone] = useState(null);
  const [comparisonZones, setComparisonZones] = useState([]);
  const [activeView, setActiveView] = useState(initialView);
  const [showAbout, setShowAbout] = useState(false);
  const tabsRef = useRef(null);

  // Sync internal state when initialView prop changes (fixes the multi-click issue)
  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

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

  const handleViewChange = (viewKey) => {
    setActiveView(viewKey);
    // Scroll tabs into view on mobile if needed
    if (tabsRef.current) {
      const activeTab = tabsRef.current.querySelector(`[data-view="${viewKey}"]`);
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
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

  // Get attribution text based on view
  const getAttribution = () => {
    if (['currentseason', 'phenology', 'disease'].includes(activeView)) {
      return 'Real-time data from weather station network. Updated daily.';
    }
    return 'Climate Baseline: 1986-2005. Projections: CMIP6 models (SSP126, SSP245, SSP370).';
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

      {/* View Tabs - Scrollable on mobile */}
      <div className="climate-view-tabs-wrapper">
        <div className="climate-view-tabs" ref={tabsRef}>
          {VIEW_ORDER.map((viewKey) => {
            const config = VIEW_CONFIG[viewKey];
            const IconComponent = config.icon;
            const isActive = activeView === viewKey;
            
            return (
              <button
                key={viewKey}
                data-view={viewKey}
                className={`view-tab ${isActive ? 'active' : ''}`}
                onClick={() => handleViewChange(viewKey)}
                aria-pressed={isActive}
                title={config.description}
              >
                <IconComponent size={18} />
                <span className="tab-label-full">{config.label}</span>
                <span className="tab-label-short">{config.shortLabel}</span>
              </button>
            );
          })}
        </div>
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
        <span>{getAttribution()}</span>
      </div>

      {/* About Modal */}
      {showAbout && (
        <ClimateAbout 
          onClose={() => setShowAbout(false)} 
          activeView={activeView}
        />
      )}
    </div>
  );
};

export default PublicClimateContainer;