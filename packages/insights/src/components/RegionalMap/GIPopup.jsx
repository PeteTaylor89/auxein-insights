// src/components/RegionalMap/GIPopup.jsx
import { useState, useEffect } from 'react';
import { X, ExternalLink, Shield, Calendar, MapPin } from 'lucide-react';
import publicApi from '../../services/publicApi';

function GIPopup({ gi, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (gi?.slug) {
      loadGIDetails();
    }
  }, [gi?.slug]);

  const loadGIDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await publicApi.get(`/public/gis/${gi.slug}`);
      setDetails(response.data);
    } catch (err) {
      console.error('Error loading GI details:', err);
      setError('Failed to load GI details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'registered':
        return 'status-registered';
      case 'pending':
        return 'status-pending';
      case 'expired':
        return 'status-expired';
      default:
        return '';
    }
  };

  if (!gi) return null;

  return (
    <div className="gi-popup">
      {/* Header */}
      <div className="gi-popup-header">
        <div className="gi-popup-title">
          <Shield size={18} />
          <h3>{gi.name || details?.name}</h3>
        </div>
        <button className="popup-close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="gi-popup-content">
        {loading ? (
          <div className="popup-loading">
            <div className="loading-spinner small" />
            <span>Loading...</span>
          </div>
        ) : error ? (
          <div className="popup-error">{error}</div>
        ) : details ? (
          <>
            {/* Status Badge */}
            <div className="gi-status-row">
              <span className={`gi-status-badge ${getStatusClass(details.status)}`}>
                {details.status || 'Unknown'}
              </span>
              {details.region_name && (
                <span className="gi-region-tag">
                  <MapPin size={12} />
                  {details.region_name}
                </span>
              )}
            </div>

            {/* Key Information */}
            <div className="gi-info">
              <h4>Registration Details</h4>
              
              <div className="gi-info-grid">
                <div className="gi-info-item">
                  <span className="gi-info-label">IP Number</span>
                  <span className="gi-info-value">{details.ip_number || '—'}</span>
                </div>
                
                <div className="gi-info-item">
                  <span className="gi-info-label">Registration Date</span>
                  <span className="gi-info-value">
                    {formatDate(details.registration_date)}
                  </span>
                </div>
                
                <div className="gi-info-item">
                  <span className="gi-info-label">Renewal Due</span>
                  <span className="gi-info-value">
                    {formatDate(details.renewal_date)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {details.notes && (
              <div className="gi-notes">
                <p>{details.notes}</p>
              </div>
            )}

            {/* IPoNZ Link */}
            {details.iponz_url && (
              <a 
                href={details.iponz_url}
                target="_blank"
                rel="noopener noreferrer"
                className="gi-link-btn"
              >
                <span>View on IPoNZ Register</span>
                <ExternalLink size={14} />
              </a>
            )}
          </>
        ) : null}
      </div>

      {/* Footer */}
      <div className="popup-footer">
        <Calendar size={12} />
        <span>Geographical Indication protected under NZ law</span>
      </div>
    </div>
  );
}

export default GIPopup;