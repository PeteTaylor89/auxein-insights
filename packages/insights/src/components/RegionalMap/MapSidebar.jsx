// src/components/RegionalMap/MapSidebar.jsx
import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Map, Layers, MapPin, Eye, EyeOff, Shield, Grape, X, Thermometer
} from 'lucide-react';
import publicApi from '../../services/publicApi';

const MAP_STYLES = [
  { id: 'satellite-streets-v12', name: 'Satellite', icon: '🛰️' },
  { id: 'streets-v12', name: 'Streets', icon: '🗺️' },
  { id: 'outdoors-v12', name: 'Outdoors', icon: '🏔️' }
];

const FALLBACK_REGIONS = [
  { name: 'Northland', slug: 'northland', bounds: { min_lng: 173.0, min_lat: -35.8, max_lng: 174.5, max_lat: -34.4 } },
  { name: 'Auckland', slug: 'auckland', bounds: { min_lng: 174.4, min_lat: -37.2, max_lng: 175.3, max_lat: -36.2 } },
  { name: 'Waikato / Bay of Plenty', slug: 'waikato-bay-of-plenty', bounds: { min_lng: 175.0, min_lat: -38.8, max_lng: 178.0, max_lat: -36.8 } },
  { name: 'Gisborne', slug: 'gisborne', bounds: { min_lng: 177.0, min_lat: -39.0, max_lng: 178.7, max_lat: -37.5 } },
  { name: "Hawke's Bay", slug: 'hawkes-bay', bounds: { min_lng: 176.0, min_lat: -40.0, max_lng: 178.0, max_lat: -38.5 } },
  { name: 'Wairarapa', slug: 'wairarapa', bounds: { min_lng: 175.2, min_lat: -41.5, max_lng: 176.2, max_lat: -40.8 } },
  { name: 'Nelson', slug: 'nelson', bounds: { min_lng: 172.5, min_lat: -41.8, max_lng: 173.5, max_lat: -40.8 } },
  { name: 'Marlborough', slug: 'marlborough', bounds: { min_lng: 173.0, min_lat: -42.2, max_lng: 174.5, max_lat: -41.0 } },
  { name: 'North Canterbury', slug: 'north-canterbury', bounds: { min_lng: 172.0, min_lat: -43.3, max_lng: 173.5, max_lat: -42.5 } },
  { name: 'Waitaki Valley', slug: 'waitaki-valley', bounds: { min_lng: 170.0, min_lat: -45.2, max_lng: 171.5, max_lat: -44.5 } },
  { name: 'Central Otago', slug: 'central-otago', bounds: { min_lng: 168.5, min_lat: -45.5, max_lng: 170.0, max_lat: -44.5 } },
];

function MapSidebar({
  currentStyle,
  onStyleChange,
  opacity,
  onOpacityChange,
  showBlocks = true,
  onToggleBlocks,
  showRegions = false,
  onToggleRegions,
  regionOpacity = 0.5,
  onRegionOpacityChange,
  showGIs = false,
  onToggleGIs,
  giOpacity = 0.0,
  showClimateZones = false,
  onToggleClimateZones,
  climateZoneOpacity = 0.4,
  onClimateZoneOpacityChange,
  onRegionClick,
  onClimateZoneClick
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('layers');
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(true);

  const [isMobile, setIsMobile] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    loadRegions();
  }, []);

  const loadRegions = async () => {
    try {
      setLoadingRegions(true);
      const response = await publicApi.get('/public/regions');
      setRegions(response.data);
    } catch (err) {
      console.error('Error loading regions:', err);
      setRegions(FALLBACK_REGIONS);
    } finally {
      setLoadingRegions(false);
    }
  };

  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? null : section);
  };

  const formatArea = (ha) => {
    if (!ha) return '';
    if (ha >= 1000) return `${(ha / 1000).toFixed(1)}k ha`;
    return `${Math.round(ha)} ha`;
  };

  const handleRegionClick = (region) => {
    onRegionClick(region);
    if (isMobile) setMobileExpanded(false);
  };

  const handleOverlayClick = () => {
    setMobileExpanded(false);
  };

  const renderSidebarContent = () => (
    <div className="sidebar-content">
      {/* Map Styles */}
      <div className="sidebar-section">
        <button className="section-header" onClick={() => toggleSection('styles')}>
          <div className="section-title">
            <Map size={15} />
            <span>Map Style</span>
          </div>
          <ChevronRight size={14} className={`chevron ${activeSection === 'styles' ? 'rotated' : ''}`} />
        </button>
        {activeSection === 'styles' && (
          <div className="section-content">
            <div className="style-options">
              {MAP_STYLES.map(style => (
                <button
                  key={style.id}
                  className={`style-btn ${currentStyle === style.id ? 'active' : ''}`}
                  onClick={() => onStyleChange(style.id)}
                >
                  <span className="style-icon">{style.icon}</span>
                  <span className="style-name">{style.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Layers */}
      <div className="sidebar-section">
        <button className="section-header" onClick={() => toggleSection('layers')}>
          <div className="section-title">
            <Layers size={15} />
            <span>Layers</span>
          </div>
          <ChevronRight size={14} className={`chevron ${activeSection === 'layers' ? 'rotated' : ''}`} />
        </button>
        {activeSection === 'layers' && (
          <div className="section-content">
            {/* Blocks — on by default */}
            <div className="layer-row">
              <button className={`layer-toggle ${showBlocks ? 'on' : ''}`} onClick={onToggleBlocks} title={showBlocks ? 'Hide' : 'Show'}>
                <Grape size={13} className="layer-icon-grape" />
                <span>Blocks</span>
                {showBlocks ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              {showBlocks && (
                <input type="range" min="0" max="1" step="0.05" value={opacity}
                  onChange={(e) => onOpacityChange(parseFloat(e.target.value))} className="opacity-slider" />
              )}
            </div>

            {/* Climate Zones */}
            <div className="layer-row">
              <button className={`layer-toggle ${showClimateZones ? 'on' : ''}`} onClick={onToggleClimateZones} title={showClimateZones ? 'Hide' : 'Show'}>
                <Thermometer size={13} className="layer-icon-zone" />
                <span>Climate Zones</span>
                {showClimateZones ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              {showClimateZones && (
                <input type="range" min="0" max="1" step="0.05" value={climateZoneOpacity}
                  onChange={(e) => onClimateZoneOpacityChange(parseFloat(e.target.value))} className="opacity-slider" />
              )}
            </div>

            {/* Regions — off by default, press to load */}
            <div className="layer-row">
              <button className={`layer-toggle ${showRegions ? 'on' : ''}`} onClick={onToggleRegions} title={showRegions ? 'Hide' : 'Show'}>
                <MapPin size={13} className="layer-icon-region" />
                <span>Regions</span>
                {showRegions ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              {showRegions && (
                <input type="range" min="0" max="1" step="0.05" value={regionOpacity}
                  onChange={(e) => onRegionOpacityChange(parseFloat(e.target.value))} className="opacity-slider" />
              )}
            </div>

            {/* GIs — off by default */}
            <div className="layer-row">
              <button className={`layer-toggle ${showGIs ? 'on' : ''}`} onClick={onToggleGIs} title={showGIs ? 'Hide' : 'Show'}>
                <Shield size={13} className="layer-icon-gi" />
                <span>Protected GIs</span>
                {showGIs ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Explore Regions */}
      <div className="sidebar-section">
        <button className="section-header" onClick={() => toggleSection('regions')}>
          <div className="section-title">
            <MapPin size={15} />
            <span>Explore Regions</span>
          </div>
          <ChevronRight size={14} className={`chevron ${activeSection === 'regions' ? 'rotated' : ''}`} />
        </button>
        {activeSection === 'regions' && (
          <div className="section-content">
            {loadingRegions ? (
              <div className="loading-regions">
                <div className="loading-spinner small" />
                <span>Loading...</span>
              </div>
            ) : (
              <div className="regions-list">
                {regions.map((region) => (
                  <button key={region.slug} className="region-btn" onClick={() => handleRegionClick(region)}>
                    <MapPin size={12} />
                    <span className="region-name">{region.name}</span>
                    {region.total_planted_ha && (
                      <span className="region-area">{formatArea(region.total_planted_ha)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="sidebar-section legend-section">
        <div className="legend-content">
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#22c55e' }} /><span>Blocks</span></div>
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#f59e0b' }} /><span>Climate Zones</span></div>
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#3b82f6' }} /><span>Regions</span></div>
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#961111' }} /><span>GIs</span></div>
        </div>
      </div>
    </div>
  );

  // MOBILE: Bottom sheet
  if (isMobile) {
    return (
      <>
        {mobileExpanded && (
          <div className="mobile-sidebar-overlay" onClick={handleOverlayClick} />
        )}
        <div className={`map-sidebar-mobile ${mobileExpanded ? 'expanded' : ''}`}>
          <button
            className="mobile-sidebar-header"
            onClick={() => setMobileExpanded(!mobileExpanded)}
            aria-expanded={mobileExpanded}
            aria-label={mobileExpanded ? 'Collapse map controls' : 'Expand map controls'}
          >
            <div className="mobile-drag-handle" />
            <div className="mobile-header-content">
              <Layers size={16} />
              <span>Map Controls</span>
              {mobileExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </div>
          </button>
          {mobileExpanded && (
            <div className="mobile-sidebar-content">
              {renderSidebarContent()}
            </div>
          )}
        </div>
      </>
    );
  }

  // DESKTOP: Sidebar
  return (
    <>
      <div className={`map-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        {!isCollapsed && renderSidebarContent()}
      </div>

      {isCollapsed && (
        <div className="sidebar-collapsed-buttons">
          <button className="collapsed-btn" onClick={() => { setIsCollapsed(false); setActiveSection('styles'); }} title="Map Styles">
            <Map size={18} />
          </button>
          <button className="collapsed-btn" onClick={() => { setIsCollapsed(false); setActiveSection('layers'); }} title="Layers">
            <Layers size={18} />
          </button>
          <button className="collapsed-btn" onClick={() => { setIsCollapsed(false); setActiveSection('regions'); }} title="Regions">
            <MapPin size={18} />
          </button>
        </div>
      )}
    </>
  );
}

export default MapSidebar;
