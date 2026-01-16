// src/components/RegionalMap/RegionPopup.jsx
import { useState, useEffect } from 'react';
import { X, ChevronRight, MapPin, Grape, BarChart3 } from 'lucide-react';
import publicApi from '../../services/publicApi';

function RegionPopup({ region, onClose, onExploreStats }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (region?.slug) {
      loadRegionDetails();
    }
  }, [region?.slug]);

  const loadRegionDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await publicApi.get(`/public/regions/${region.slug}`);
      setDetails(response.data);
    } catch (err) {
      console.error('Error loading region details:', err);
      setError('Failed to load region details');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (!num) return '—';
    return new Intl.NumberFormat('en-NZ', { 
      maximumFractionDigits: 1 
    }).format(num);
  };

  const getTopVarieties = (stats, count = 3) => {
    if (!stats?.varieties) return [];
    return stats.varieties.slice(0, count);
  };

  if (!region) return null;

  return (
    <div className="region-popup">
      {/* Header */}
      <div className="region-popup-header">
        <div className="region-popup-title">
          <MapPin size={18} />
          <h3>{region.name || details?.name}</h3>
        </div>
        <button className="popup-close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="region-popup-content">
        {loading ? (
          <div className="popup-loading">
            <div className="loading-spinner small" />
            <span>Loading...</span>
          </div>
        ) : error ? (
          <div className="popup-error">{error}</div>
        ) : details ? (
          <>
            {/* Summary */}
            {details.summary && (
              <p className="region-summary">{details.summary}</p>
            )}

            {/* Quick Stats */}
            <div className="region-stats">
              <div className="stat-item">
                <span className="stat-label">Total Planted</span>
                <span className="stat-value">
                  {formatNumber(details.stats?.total_planted_ha)} ha
                </span>
              </div>
            </div>

            {/* Top Varieties */}
            {details.stats?.varieties && details.stats.varieties.length > 0 && (
              <div className="region-varieties">
                <h4>
                  <Grape size={14} />
                  Top Varieties
                </h4>
                <div className="variety-list">
                  {getTopVarieties(details.stats).map((variety, index) => (
                    <div key={index} className="variety-item">
                      <span className="variety-name">{variety.name}</span>
                      <span className="variety-percent">
                        {formatNumber(variety.percentage)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Climate */}
            {details.climate_summary && (
              <div className="region-climate">
                <h4>Climate</h4>
                <p>{details.climate_summary}</p>
              </div>
            )}

            {/* Action Button */}
            {onExploreStats && (
              <button 
                className="region-action-btn"
                onClick={() => onExploreStats(details)}
              >
                <BarChart3 size={16} />
                Explore Region Stats
                <ChevronRight size={16} />
              </button>
            )}
          </>
        ) : null}
      </div>

      {/* Source */}
      {details?.stats?.source && (
        <div className="popup-footer">
          Source: {details.stats.source}
        </div>
      )}
    </div>
  );
}

export default RegionPopup;