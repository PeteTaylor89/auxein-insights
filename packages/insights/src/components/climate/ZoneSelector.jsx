// packages/insights/src/components/climate/ZoneSelector.jsx
/**
 * ZoneSelector Component
 * 
 * Dropdown selector for climate zones, grouped by wine region.
 * Supports both single-select and comparison modes.
 */

import React, { useState, useEffect } from 'react';
import { MapPin, ChevronDown, Plus, X } from 'lucide-react';
import { getRegions } from '../../services/publicClimateService';

const ZoneSelector = ({
  selectedZone,
  onZoneChange,
  comparisonZones = [],
  onComparisonZonesChange,
  allowComparison = false,
  maxComparison = 4,
  loading = false,
  disabled = false,
}) => {
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);

  // Flatten all zones for easy access
  const allZones = regions.flatMap(r => r.zones.map(z => ({ ...z, region_name: r.name })));

  // Load regions and zones on mount
  useEffect(() => {
    const loadRegions = async () => {
      try {
        setLoadingRegions(true);
        setError(null);
        const data = await getRegions();
        setRegions(data.regions || []);
      } catch (err) {
        console.error('Error loading regions:', err);
        setError('Failed to load climate zones');
      } finally {
        setLoadingRegions(false);
      }
    };

    loadRegions();
  }, []);

  // Handle main zone selection
  const handleZoneSelect = (zone) => {
    onZoneChange(zone);
    setIsOpen(false);
  };

  // Handle adding comparison zone
  const handleAddComparisonZone = (zone) => {
    if (comparisonZones.length < maxComparison && !comparisonZones.find(z => z.slug === zone.slug)) {
      onComparisonZonesChange([...comparisonZones, zone]);
    }
    setShowCompareDropdown(false);
  };

  // Handle removing comparison zone
  const handleRemoveComparisonZone = (zoneSlug) => {
    onComparisonZonesChange(comparisonZones.filter(z => z.slug !== zoneSlug));
  };

  // Get available zones for comparison (exclude main zone and already selected)
  const availableForComparison = allZones.filter(z => 
    z.slug !== selectedZone?.slug && 
    !comparisonZones.find(c => c.slug === z.slug)
  );

  if (loadingRegions) {
    return (
      <div className="zone-selector">
        <div className="zone-selector-loading">
          <span>Loading climate zones...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="zone-selector">
        <div className="zone-selector-error">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="zone-selector">
      {/* Main Zone Selector */}
      <div className="zone-selector-row">
        <label className="zone-selector-label">
          <MapPin size={16} />
          <span>Climate Zone</span>
        </label>
        
        <div className="zone-dropdown-container">
          <button
            className={`zone-dropdown-trigger ${isOpen ? 'open' : ''}`}
            onClick={() => setIsOpen(!isOpen)}
            disabled={disabled || loading}
          >
            <span className="zone-dropdown-text">
              {selectedZone?.name || 'Select a climate zone'}
            </span>
            <ChevronDown size={18} className={`dropdown-chevron ${isOpen ? 'rotated' : ''}`} />
          </button>

          {isOpen && (
            <>
              <div className="zone-dropdown-overlay" onClick={() => setIsOpen(false)} />
              <div className="zone-dropdown-menu">
                {regions.map((region) => (
                  <div key={region.id} className="zone-region-group">
                    <div className="zone-region-header">
                      {region.name}
                    </div>
                    <div className="zone-region-zones">
                      {region.zones.map((zone) => (
                        <button
                          key={zone.id}
                          className={`zone-option ${selectedZone?.slug === zone.slug ? 'selected' : ''}`}
                          onClick={() => handleZoneSelect(zone)}
                        >
                          <span className="zone-option-name">{zone.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Comparison Zones (shown when allowComparison is true and main zone is selected) */}
      {allowComparison && selectedZone && (
        <div className="zone-comparison-section">
          <div className="comparison-header">
            <span className="comparison-label">Compare with:</span>
            {comparisonZones.length < maxComparison && (
              <div className="add-comparison-container">
                <button
                  className="add-comparison-btn"
                  onClick={() => setShowCompareDropdown(!showCompareDropdown)}
                >
                  <Plus size={14} />
                  Add Zone
                </button>
                
                {showCompareDropdown && (
                  <>
                    <div className="zone-dropdown-overlay" onClick={() => setShowCompareDropdown(false)} />
                    <div className="zone-dropdown-menu comparison-menu">
                      {regions.map((region) => {
                        const availableZones = region.zones.filter(z => 
                          z.slug !== selectedZone?.slug && 
                          !comparisonZones.find(c => c.slug === z.slug)
                        );
                        if (availableZones.length === 0) return null;
                        
                        return (
                          <div key={region.id} className="zone-region-group">
                            <div className="zone-region-header">
                              {region.name}
                            </div>
                            <div className="zone-region-zones">
                              {availableZones.map((zone) => (
                                <button
                                  key={zone.id}
                                  className="zone-option"
                                  onClick={() => handleAddComparisonZone(zone)}
                                >
                                  <span className="zone-option-name">{zone.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {comparisonZones.length > 0 && (
            <div className="zone-comparison-tags">
              {comparisonZones.map((zone) => (
                <span key={zone.slug} className="zone-tag">
                  {zone.name}
                  <button
                    className="zone-tag-remove"
                    onClick={() => handleRemoveComparisonZone(zone.slug)}
                    aria-label={`Remove ${zone.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {comparisonZones.length === 0 && (
            <span className="comparison-hint">
              Add zones to compare {selectedZone.name} with other regions
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ZoneSelector;