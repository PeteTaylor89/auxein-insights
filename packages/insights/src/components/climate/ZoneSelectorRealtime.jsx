// packages/insights/src/components/climate/ZoneSelectorRealtime.jsx
/**
 * ZoneSelectorRealtime Component
 * 
 * Zone selector specifically for realtime climate views (Current Season, Phenology).
 * - Only allows selecting zones that have current season data
 * - Shows CTA popup for zones without data, encouraging weather station submission
 */

import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  ChevronDown, 
  X, 
  AlertTriangle,
  Mail,
  ExternalLink,
  Wifi,
  Cloud
} from 'lucide-react';
import { 
  getZonesWithData, 
  getAllZones 
} from '../../services/realtimeClimateService';
import { getZones } from '../../services/publicClimateService';

const CONTACT_EMAIL = 'insights@auxein.co.nz';

const ZoneSelectorRealtime = ({ 
  selectedZone, 
  onZoneChange,
  label = 'Select Zone'
}) => {
  const [allZones, setAllZones] = useState([]);
  const [zonesWithData, setZonesWithData] = useState(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCTA, setShowCTA] = useState(false);
  const [ctaZone, setCtaZone] = useState(null);

  // Load zones on mount
  useEffect(() => {
    const loadZones = async () => {
      try {
        setLoading(true);
        
        // Fetch all zones and zones with realtime data in parallel
        const [allZonesData, realtimeZonesData] = await Promise.all([
          getZones(),  // From publicClimateService - all zones
          getZonesWithData(),  // From realtimeClimateService - zones with current data
        ]);
        
        // Build set of zone IDs that have data
        const dataZoneIds = new Set(
          (realtimeZonesData.zones || []).map(z => z.id)
        );
        
        setAllZones(allZonesData.zones || []);
        setZonesWithData(dataZoneIds);
        
        // Auto-select first zone with data if none selected
        if (!selectedZone && realtimeZonesData.zones?.length > 0) {
          onZoneChange(realtimeZonesData.zones[0]);
        }
      } catch (err) {
        console.error('Error loading zones:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadZones();
  }, []);

  const handleZoneClick = (zone) => {
    const hasData = zonesWithData.has(zone.id);
    
    if (hasData) {
      onZoneChange(zone);
      setIsOpen(false);
    } else {
      // Show CTA for zones without data
      setCtaZone(zone);
      setShowCTA(true);
      setIsOpen(false);
    }
  };

  const handleEmailClick = () => {
    const subject = encodeURIComponent(`Weather Station Data - ${ctaZone?.name || 'Region'}`);
    const body = encodeURIComponent(
      `Hi Auxein Team,\n\n` +
      `I'm interested in having realtime climate data available for ${ctaZone?.name || 'my region'}.\n\n` +
      `Weather Station Details:\n` +
      `- Location: \n` +
      `- Station Type/Model: \n` +
      `- Data Format Available: \n` +
      `- Contact Details: \n\n` +
      `Please let me know what's needed to integrate this data.\n\n` +
      `Thanks!`
    );
    window.open(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`, '_blank');
  };

  // Group zones by region
  const groupedZones = allZones.reduce((acc, zone) => {
    const region = zone.region_name || 'Other';
    if (!acc[region]) acc[region] = [];
    acc[region].push(zone);
    return acc;
  }, {});

  return (
    <div className="zone-selector-realtime">
      {/* Dropdown Trigger */}
      <div className="selector-wrapper">
        <label className="selector-label">{label}</label>
        <button 
          className="selector-trigger"
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
        >
          <MapPin size={16} className="trigger-icon" />
          {loading ? (
            <span className="zone-name">Loading zones...</span>
          ) : selectedZone ? (
            <>
              <span className="zone-name">{selectedZone.name}</span>
              {selectedZone.region_name && (
                <span className="region-name">{selectedZone.region_name}</span>
              )}
            </>
          ) : (
            <span className="zone-name placeholder">Select a zone...</span>
          )}
          <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div className="selector-backdrop" onClick={() => setIsOpen(false)} />
          <div className="selector-dropdown">
            <div className="dropdown-header">
              <span>Select Climate Zone</span>
              <span className="data-hint">
                <Cloud size={12} /> = Live data available
              </span>
            </div>
            
            <div className="dropdown-content">
              {Object.entries(groupedZones).map(([region, zones]) => (
                <div key={region} className="rt-region-group">
                  <div className="rt-region-header">{region}</div>
                  {zones.map(zone => {
                    const hasData = zonesWithData.has(zone.id);
                    const isSelected = selectedZone?.id === zone.id;
                    
                    return (
                      <button
                        key={zone.id}
                        className={`rt-zone-option ${isSelected ? 'rt-selected' : ''} ${hasData ? 'rt-has-data' : 'rt-no-data'}`}
                        onClick={() => handleZoneClick(zone)}
                      >
                        <span className="rt-zone-name">{zone.name}</span>
                        {hasData ? (
                          <span className="rt-indicator rt-available">
                            <Cloud size={14} />
                          </span>
                        ) : (
                          <span className="rt-indicator rt-unavailable">
                            <AlertTriangle size={14} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* CTA Modal for zones without data */}
      {showCTA && (
        <div className="cta-overlay" onClick={() => setShowCTA(false)}>
          <div className="cta-modal" onClick={e => e.stopPropagation()}>
            <button className="cta-close" onClick={() => setShowCTA(false)}>
              <X size={20} />
            </button>
            
            <div className="cta-icon">
              <Wifi size={48} />
            </div>
            
            <h3>No Live Data Available</h3>
            <p className="cta-zone-name">{ctaZone?.name}</p>
            
            <p className="cta-description">
              Realtime climate data isn't currently available for this zone. 
              Help us expand our coverage by sharing your weather station details!
            </p>

            <div className="cta-benefits">
              <h4>Benefits of contributing data:</h4>
              <ul>
                <li>Access to regional climate insights</li>
                <li>Phenology predictions for your area</li>
                <li>Disease pressure monitoring</li>
                <li>Comparison with other regions</li>
              </ul>
            </div>

            <div className="cta-actions">
              <button className="cta-email-btn" onClick={handleEmailClick}>
                <Mail size={18} />
                Submit Weather Station Details
              </button>
              
              <a 
                href="https://auxein.co.nz/contact" 
                target="_blank" 
                rel="noopener noreferrer"
                className="cta-learn-more"
              >
                Learn more about data partnerships
                <ExternalLink size={14} />
              </a>
            </div>

            <p className="cta-privacy">
              Your data remains yours. We only use aggregated, anonymized data for regional insights.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoneSelectorRealtime;