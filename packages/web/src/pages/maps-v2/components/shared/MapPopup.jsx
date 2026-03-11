// maps-v2/components/shared/MapPopup.jsx — React-rendered Mapbox popups
import { createRoot } from 'react-dom/client';
import mapboxgl from 'mapbox-gl';
import { MapPin, Grape, Ruler, Map, Building2, Leaf, Binoculars, ClipboardList, TriangleAlert } from 'lucide-react';

/**
 * Renders a React component inside a Mapbox popup.
 */
export function showReactPopup(map, { lngLat, content, popupOptions = {} }) {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(content);

  const popup = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: '340px',
    className: 'v2-mapbox-popup',
    focusAfterOpen: false,
    ...popupOptions,
  })
    .setLngLat(lngLat)
    .setDOMContent(container)
    .addTo(map);

  popup.on('close', () => {
    setTimeout(() => root.unmount(), 0);
  });

  return popup;
}

/**
 * Block popup — shows block details with variety, area, region etc.
 */
export function BlockPopupContent({ feature, onFlyTo, onEdit }) {
  const p = feature?.properties || {};
  const isOwned = true; // could compare company_id if needed

  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className={`v2-popup-badge ${isOwned ? 'v2-popup-badge--owned' : 'v2-popup-badge--other'}`}>
          <Grape size={12} />
          Block
        </div>
      </div>
      <h3 className="v2-popup-title">{p.block_name || 'Unnamed Block'}</h3>

      <div className="v2-popup-grid">
        {p.variety && (
          <div className="v2-popup-row">
            <Grape size={14} className="v2-popup-row-icon" />
            <span className="v2-popup-label">Variety</span>
            <span className="v2-popup-value">{p.variety}</span>
          </div>
        )}
        {p.area && (
          <div className="v2-popup-row">
            <Ruler size={14} className="v2-popup-row-icon" />
            <span className="v2-popup-label">Area</span>
            <span className="v2-popup-value">{Number(p.area).toFixed(2)} ha</span>
          </div>
        )}
        {p.region && (
          <div className="v2-popup-row">
            <Map size={14} className="v2-popup-row-icon" />
            <span className="v2-popup-label">Region</span>
            <span className="v2-popup-value">{p.region}</span>
          </div>
        )}
        {p.winery && (
          <div className="v2-popup-row">
            <Building2 size={14} className="v2-popup-row-icon" />
            <span className="v2-popup-label">Winery</span>
            <span className="v2-popup-value">{p.winery}</span>
          </div>
        )}
        {p.organic !== undefined && (
          <div className="v2-popup-row">
            <Leaf size={14} className="v2-popup-row-icon" />
            <span className="v2-popup-label">Organic</span>
            <span className="v2-popup-value">{p.organic ? 'Yes' : 'No'}</span>
          </div>
        )}
      </div>

      <div className="v2-popup-footer">
        {onFlyTo && (
          <button className="v2-popup-btn" onClick={() => onFlyTo(feature)}>
            <MapPin size={14} />
            Zoom to block
          </button>
        )}
        {onEdit && p.id && (
          <button
            className="v2-popup-btn v2-popup-btn--accent"
            onClick={() => onEdit(p.id)}
            style={{ marginTop: onFlyTo ? '6px' : 0 }}
          >
            Edit Block
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Observation popup — shows block observation summary.
 */
export function ObservationPopupContent({ properties }) {
  const p = properties || {};

  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--obs">
          <Binoculars size={12} />
          Observations
        </div>
      </div>
      <h3 className="v2-popup-title">{p.block_name || 'Block'}</h3>

      <div className="v2-popup-grid">
        <div className="v2-popup-row">
          <Binoculars size={14} className="v2-popup-row-icon" />
          <span className="v2-popup-label">Count</span>
          <span className="v2-popup-value v2-popup-value--bold">{p.obs_count || 0}</span>
        </div>
        {p.latest_date && (
          <div className="v2-popup-row">
            <span className="v2-popup-row-icon" style={{ width: 14 }} />
            <span className="v2-popup-label">Latest</span>
            <span className="v2-popup-value">{new Date(p.latest_date).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Task popup — shows block task summary.
 */
export function TaskPopupContent({ properties }) {
  const p = properties || {};

  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--task">
          <ClipboardList size={12} />
          Tasks
        </div>
      </div>
      <h3 className="v2-popup-title">{p.block_name || 'Block'}</h3>

      <div className="v2-popup-grid">
        <div className="v2-popup-row">
          <ClipboardList size={14} className="v2-popup-row-icon" />
          <span className="v2-popup-label">Tasks</span>
          <span className="v2-popup-value v2-popup-value--bold">{p.task_count || 0}</span>
        </div>
        {(p.has_active === true || p.has_active === 'true') && (
          <div className="v2-popup-row">
            <span className="v2-popup-row-icon" style={{ width: 14 }} />
            <span className="v2-popup-label">Status</span>
            <span className="v2-popup-value v2-popup-value--accent">Active tasks</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Risk popup — shows risk details.
 */
export function RiskPopupContent({ properties }) {
  const p = properties || {};
  const levelClass = `v2-popup-risk--${p.risk_level || 'medium'}`;

  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className={`v2-popup-badge v2-popup-badge--risk ${levelClass}`}>
          <TriangleAlert size={12} />
          {(p.risk_level || 'medium').charAt(0).toUpperCase() + (p.risk_level || 'medium').slice(1)} Risk
        </div>
      </div>
      <h3 className="v2-popup-title">{p.title || 'Risk'}</h3>

      <div className="v2-popup-grid">
        {p.risk_type && (
          <div className="v2-popup-row">
            <TriangleAlert size={14} className="v2-popup-row-icon" />
            <span className="v2-popup-label">Type</span>
            <span className="v2-popup-value">{p.risk_type}</span>
          </div>
        )}
        {p.location_description && (
          <div className="v2-popup-row">
            <MapPin size={14} className="v2-popup-row-icon" />
            <span className="v2-popup-label">Location</span>
            <span className="v2-popup-value">{p.location_description}</span>
          </div>
        )}
      </div>
    </div>
  );
}
