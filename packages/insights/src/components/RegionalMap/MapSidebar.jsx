// src/components/RegionalMap/MapSidebar.jsx
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Map, Layers, MapPin } from 'lucide-react';

const MAP_STYLES = [
  { id: 'satellite-streets-v12', name: 'Satellite', icon: '🛰️' },
  { id: 'streets-v12', name: 'Streets', icon: '🗺️' },
  { id: 'outdoors-v12', name: 'Outdoors', icon: '🏔️' }
];

function MapSidebar({ 
  currentStyle, 
  onStyleChange, 
  opacity, 
  onOpacityChange,
  regions = [],
  onRegionClick 
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('styles'); // 'styles' | 'layers' | 'regions'

  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? null : section);
  };

  return (
    <>
      <div className={`map-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        {/* Collapse Toggle */}
        <button 
          className="sidebar-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        {!isCollapsed && (
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
                  {/* Vineyard Blocks */}
                  <div className="layer-item">
                    <div className="layer-header">
                      <label className="layer-label">
                        <input 
                          type="checkbox" 
                          checked={true}
                          disabled
                        />
                        <span>Vineyard Blocks</span>
                      </label>
                    </div>
                    
                    {/* Opacity Slider */}
                    <div className="opacity-control">
                      <label htmlFor="opacity-slider">
                        Opacity: {Math.round(opacity * 100)}%
                      </label>
                      <input
                        id="opacity-slider"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={opacity}
                        onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                        className="opacity-slider"
                      />
                    </div>
                  </div>

                  {/* Future Layers (Placeholders) */}
                  <div className="layer-item disabled">
                    <label className="layer-label">
                      <input type="checkbox" disabled />
                      <span>Wine Regions</span>
                    </label>
                    <span className="coming-soon">Coming Soon</span>
                  </div>

                  <div className="layer-item disabled">
                    <label className="layer-label">
                      <input type="checkbox" disabled />
                      <span>Climate Zones</span>
                    </label>
                    <span className="coming-soon">Coming Soon</span>
                  </div>

                  <div className="layer-item disabled">
                    <label className="layer-label">
                      <input type="checkbox" disabled />
                      <span>Temperature Overlay</span>
                    </label>
                    <span className="coming-soon">Coming Soon</span>
                  </div>
                </div>
              )}
            </div>

            {/* Regions Section */}
            {regions && regions.length > 0 && (
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
                    <div className="regions-list">
                      {regions.map((region, idx) => (
                        <button
                          key={idx}
                          className="region-btn"
                          onClick={() => onRegionClick(region)}
                        >
                          <MapPin size={14} />
                          <span>{region.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="sidebar-section">
              <div className="section-header">
                <div className="section-title">
                  <span>Legend</span>
                </div>
              </div>
              <div className="section-content">
                <div className="legend-content">
                  <div className="legend-item">
                    <div 
                      className="legend-color" 
                      style={{ backgroundColor: '#22c55e' }}
                    />
                    <span>Vineyard Blocks</span>
                  </div>
                  <p className="legend-note">
                    Click any block to view details
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collapsed State Icon Buttons */}
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
          {regions.length > 0 && (
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
          )}
        </div>
      )}
    </>
  );
}

export default MapSidebar;