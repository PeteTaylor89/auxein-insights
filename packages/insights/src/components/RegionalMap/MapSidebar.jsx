// src/components/RegionalMap/MapSidebar.jsx
// Fixed mobile bottom sheet - tap outside to close, doesn't cover map
import { useState, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Map, Layers, MapPin, Eye, EyeOff, Shield, Grape, X 
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
  showRegions = true,
  onToggleRegions,
  regionOpacity = 0.5,
  onRegionOpacityChange,
  showGIs = true,
  onToggleGIs,
  giOpacity = 0.0,
  onRegionClick 
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('layers');
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(true);
  
  // Mobile state - starts collapsed
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
    if (ha >= 1000) {
      return `${(ha / 1000).toFixed(1)}k ha`;
    }
    return `${Math.round(ha)} ha`;
  };

  const handleRegionClick = (region) => {
    onRegionClick(region);
    if (isMobile) {
      setMobileExpanded(false);
    }
  };

  // Close mobile sheet when clicking overlay
  const handleOverlayClick = () => {
    setMobileExpanded(false);
  };

  const renderSidebarContent = () => (
    <div className="sidebar-content">
      {/* Map Styles Section */}
      <div className="sidebar-section">
        <button 
          className="section-header"
          onClick={() => toggleSection('styles')}
        >
          <div className="section-title">
            <Map size={18} />
            <span>Map Styles</span>
          </div>
          <ChevronRight 
            size={16} 
            className={`chevron ${activeSection === 'styles' ? 'rotated' : ''}`}
          />
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

      {/* Layers Section */}
      <div className="sidebar-section">
        <button 
          className="section-header"
          onClick={() => toggleSection('layers')}
        >
          <div className="section-title">
            <Layers size={18} />
            <span>Layers</span>
          </div>
          <ChevronRight 
            size={16} 
            className={`chevron ${activeSection === 'layers' ? 'rotated' : ''}`}
          />
        </button>

        {activeSection === 'layers' && (
          <div className="section-content">
            <div className="layer-item">
              <div className="layer-header">
                <label className="layer-label">
                  <button 
                    className="layer-toggle-btn"
                    onClick={onToggleBlocks}
                    title={showBlocks ? 'Hide layer' : 'Show layer'}
                  >
                    {showBlocks ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <Grape size={14} className="layer-icon-grape" />
                  <span>Vineyard Blocks</span>
                </label>
              </div>
              
              {showBlocks && (
                <div className="opacity-control">
                  <label htmlFor="block-opacity-slider">
                    Opacity: {Math.round(opacity * 100)}%
                  </label>
                  <input
                    id="block-opacity-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                    className="opacity-slider"
                  />
                </div>
              )}
            </div>

            <div className="layer-item">
              <div className="layer-header">
                <label className="layer-label">
                  <button 
                    className="layer-toggle-btn"
                    onClick={onToggleRegions}
                    title={showRegions ? 'Hide layer' : 'Show layer'}
                  >
                    {showRegions ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <MapPin size={14} className="layer-icon-region" />
                  <span>Wine Regions</span>
                </label>
              </div>
              
              {showRegions && (
                <div className="opacity-control">
                  <label htmlFor="region-opacity-slider">
                    Opacity: {Math.round(regionOpacity * 100)}%
                  </label>
                  <input
                    id="region-opacity-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={regionOpacity}
                    onChange={(e) => onRegionOpacityChange(parseFloat(e.target.value))}
                    className="opacity-slider"
                  />
                </div>
              )}
            </div>

            <div className="layer-item">
              <div className="layer-header">
                <label className="layer-label">
                  <button 
                    className="layer-toggle-btn"
                    onClick={onToggleGIs}
                    title={showGIs ? 'Hide layer' : 'Show layer'}
                  >
                    {showGIs ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <Shield size={14} className="layer-icon-gi" />
                  <span>Protected GIs</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Regions Section */}
      <div className="sidebar-section">
        <button 
          className="section-header"
          onClick={() => toggleSection('regions')}
        >
          <div className="section-title">
            <MapPin size={18} />
            <span>Explore Regions</span>
          </div>
          <ChevronRight 
            size={16} 
            className={`chevron ${activeSection === 'regions' ? 'rotated' : ''}`}
          />
        </button>

        {activeSection === 'regions' && (
          <div className="section-content">
            {loadingRegions ? (
              <div className="loading-regions">
                <div className="loading-spinner small" />
                <span>Loading regions...</span>
              </div>
            ) : (
              <div className="regions-list">
                {regions.map((region) => (
                  <button
                    key={region.slug}
                    className="region-btn"
                    onClick={() => handleRegionClick(region)}
                  >
                    <MapPin size={14} />
                    <span className="region-name">{region.name}</span>
                    {region.total_planted_ha && (
                      <span className="region-area">
                        {formatArea(region.total_planted_ha)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="sidebar-section">
        <div className="section-header" style={{ cursor: 'default' }}>
          <div className="section-title">
            <span>Legend</span>
          </div>
        </div>
        <div className="section-content">
          <div className="legend-content">
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#22c55e' }} />
              <span>Vineyard Blocks</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#3b82f6' }} />
              <span>Wine Regions</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#961111' }} />
              <span>Protected GIs</span>
            </div>
            <p className="legend-note">Click any feature to view details</p>
          </div>
        </div>
      </div>
    </div>
  );

  // MOBILE: Bottom sheet with overlay
  if (isMobile) {
    return (
      <>
        {/* Overlay - tap to close */}
        {mobileExpanded && (
          <div 
            className="mobile-sidebar-overlay"
            onClick={handleOverlayClick}
          />
        )}
        
        {/* Bottom sheet */}
        <div className={`map-sidebar-mobile ${mobileExpanded ? 'expanded' : ''}`}>
          {/* Header - always visible */}
          <button 
            className="mobile-sidebar-header"
            onClick={() => setMobileExpanded(!mobileExpanded)}
            aria-expanded={mobileExpanded}
            aria-label={mobileExpanded ? 'Collapse map controls' : 'Expand map controls'}
          >
            <div className="mobile-drag-handle" />
            <div className="mobile-header-content">
              <Layers size={18} />
              <span>Map Controls</span>
              {mobileExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </div>
          </button>

          {/* Content - only when expanded */}
          {mobileExpanded && (
            <div className="mobile-sidebar-content">
              {renderSidebarContent()}
            </div>
          )}
        </div>
      </>
    );
  }

  // DESKTOP: Original sidebar
  return (
    <>
      <div className={`map-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <button 
          className="sidebar-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        {!isCollapsed && renderSidebarContent()}
      </div>

      {isCollapsed && (
        <div className="sidebar-collapsed-buttons">
          <button 
            className="collapsed-btn"
            onClick={() => {
              setIsCollapsed(false);
              setActiveSection('styles');
            }}
            title="Map Styles"
          >
            <Map size={20} />
          </button>
          <button 
            className="collapsed-btn"
            onClick={() => {
              setIsCollapsed(false);
              setActiveSection('layers');
            }}
            title="Layers"
          >
            <Layers size={20} />
          </button>
          <button 
            className="collapsed-btn"
            onClick={() => {
              setIsCollapsed(false);
              setActiveSection('regions');
            }}
            title="Regions"
          >
            <MapPin size={20} />
          </button>
        </div>
      )}
    </>
  );
}

export default MapSidebar;