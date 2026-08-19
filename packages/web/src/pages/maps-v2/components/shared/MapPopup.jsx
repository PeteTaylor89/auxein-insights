// maps-v2/components/shared/MapPopup.jsx — React-rendered Mapbox popups
import { createRoot } from 'react-dom/client';
import mapboxgl from 'mapbox-gl';
import { MapPin, Grape, Ruler, Map, Building2, Leaf, Binoculars, ClipboardList, TriangleAlert, Wrench, ExternalLink, Landmark, Scissors } from 'lucide-react';
import { PoiGlyph } from '../PoiIconPicker';
import { resolveAppearance } from '../mapFeatureTypes';

export function showReactPopup(map, { lngLat, content, popupOptions = {} }) {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(content);

  const popup = new mapboxgl.Popup({
    closeButton: true, closeOnClick: true, maxWidth: '340px',
    className: 'v2-mapbox-popup', focusAfterOpen: false,
    ...popupOptions,
  })
    .setLngLat(lngLat)
    .setDOMContent(container)
    .addTo(map);

  popup.on('close', () => setTimeout(() => root.unmount(), 0));
  return popup;
}

export function BlockPopupContent({ feature, onFlyTo, onEdit, onSplit, onSummary, isAuxeinAdmin, onAssignCompany }) {
  const p = feature?.properties || {};
  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--owned"><Grape size={12} /> Block</div>
      </div>
      <h3 className="v2-popup-title">{p.block_name || 'Unnamed Block'}</h3>
      <div className="v2-popup-grid">
        {p.variety && <div className="v2-popup-row"><Grape size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Variety</span><span className="v2-popup-value">{p.variety}</span></div>}
        {p.area && <div className="v2-popup-row"><Ruler size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Area</span><span className="v2-popup-value">{Number(p.area).toFixed(2)} ha</span></div>}
        {p.region && <div className="v2-popup-row"><Map size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Region</span><span className="v2-popup-value">{p.region}</span></div>}
        {p.winery && <div className="v2-popup-row"><Building2 size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Winery</span><span className="v2-popup-value">{p.winery}</span></div>}
      </div>
      <div className="v2-popup-footer">
        {onSummary && p.id && (
          <button className="v2-popup-btn v2-popup-btn--accent" onClick={() => onSummary(Number(p.id), p.block_name)}>
            <ClipboardList size={14} /> Block Summary
          </button>
        )}
        {onEdit && p.id && <button className="v2-popup-btn" onClick={() => onEdit(p.id)} style={{ marginTop: 6 }}>Edit Block</button>}
        {onSplit && p.id && <button className="v2-popup-btn" onClick={() => onSplit(feature)} style={{ marginTop: 6 }}><Scissors size={14} /> Split Block</button>}
        {isAuxeinAdmin && onAssignCompany && p.id && (
          <button className="v2-popup-btn" onClick={() => onAssignCompany(p.id)} style={{ marginTop: 6, background: '#7c3aed', color: '#fff' }}>
            <Building2 size={14} /> Assign Company
          </button>
        )}
      </div>
    </div>
  );
}

export function ParcelPopupContent({ properties, isAuxeinAdmin, onAssign, onRemove }) {
  const p = properties || {};
  const assigned = !!p.has_assignment;
  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--owned"><Landmark size={12} /> Land Parcel</div>
        <div className={`v2-popup-badge ${assigned ? 'v2-popup-badge--parcel-assigned' : 'v2-popup-badge--parcel-unassigned'}`} style={{ marginLeft: 4 }}>
          {assigned ? 'Assigned' : 'Unassigned'}
        </div>
      </div>
      <h3 className="v2-popup-title">{p.linz_id ? `LINZ ${p.linz_id}` : 'Land Parcel'}</h3>
      <div className="v2-popup-grid">
        {p.appellation && <div className="v2-popup-row"><span className="v2-popup-label">Appellation</span><span className="v2-popup-value">{p.appellation}</span></div>}
        {p.land_district && <div className="v2-popup-row"><span className="v2-popup-label">District</span><span className="v2-popup-value">{p.land_district}</span></div>}
        {p.area_hectares && <div className="v2-popup-row"><Ruler size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Area</span><span className="v2-popup-value">{Number(p.area_hectares).toFixed(2)} ha</span></div>}
        {p.parcel_intent && <div className="v2-popup-row"><span className="v2-popup-label">Intent</span><span className="v2-popup-value">{p.parcel_intent}</span></div>}
        {assigned && p.assigned_company_name && (
          <div className="v2-popup-row"><Building2 size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Owner</span><span className="v2-popup-value v2-popup-value--bold">{p.assigned_company_name}</span></div>
        )}
      </div>
      {isAuxeinAdmin && (
        <div className="v2-popup-footer">
          {!assigned && onAssign && (
            <button className="v2-popup-btn v2-popup-btn--accent" onClick={() => onAssign(p)}>
              <Building2 size={14} /> Assign to Company
            </button>
          )}
          {assigned && onRemove && (
            <button className="v2-popup-btn" style={{ background: 'var(--color-danger)', color: '#fff' }} onClick={() => onRemove(Number(p.id), Number(p.assigned_company_id))}>
              Remove Assignment
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ObservationPopupContent({ properties, onNavigate }) {
  const p = properties || {};
  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--obs"><Binoculars size={12} /> Observations</div>
      </div>
      <h3 className="v2-popup-title">{p.block_name || 'Block'}</h3>
      <div className="v2-popup-grid">
        <div className="v2-popup-row"><Binoculars size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Count</span><span className="v2-popup-value v2-popup-value--bold">{p.obs_count || 0}</span></div>
        {p.latest_date && <div className="v2-popup-row"><span className="v2-popup-row-icon" style={{ width: 14 }} /><span className="v2-popup-label">Latest</span><span className="v2-popup-value">{new Date(p.latest_date).toLocaleDateString()}</span></div>}
      </div>
      {onNavigate && (
        <div className="v2-popup-footer">
          <button className="v2-popup-btn" onClick={onNavigate}><ExternalLink size={14} /> View Observations</button>
        </div>
      )}
    </div>
  );
}

export function TaskPopupContent({ properties, onNavigate }) {
  const p = properties || {};
  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--task"><ClipboardList size={12} /> Tasks</div>
      </div>
      <h3 className="v2-popup-title">{p.block_name || 'Block'}</h3>
      <div className="v2-popup-grid">
        <div className="v2-popup-row"><ClipboardList size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Tasks</span><span className="v2-popup-value v2-popup-value--bold">{p.task_count || 0}</span></div>
        {(p.has_active === true || p.has_active === 'true') && <div className="v2-popup-row"><span className="v2-popup-row-icon" style={{ width: 14 }} /><span className="v2-popup-label">Status</span><span className="v2-popup-value v2-popup-value--accent">Active tasks</span></div>}
      </div>
      {onNavigate && (
        <div className="v2-popup-footer">
          <button className="v2-popup-btn" onClick={onNavigate}><ExternalLink size={14} /> View Tasks</button>
        </div>
      )}
    </div>
  );
}

export function RiskPopupContent({ properties, onNavigate }) {
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
        {p.risk_type && <div className="v2-popup-row"><TriangleAlert size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Type</span><span className="v2-popup-value">{p.risk_type}</span></div>}
        {p.location_description && <div className="v2-popup-row"><MapPin size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Location</span><span className="v2-popup-value">{p.location_description}</span></div>}
      </div>
      {onNavigate && (
        <div className="v2-popup-footer">
          <button className="v2-popup-btn" onClick={onNavigate}><ExternalLink size={14} /> View Risks</button>
        </div>
      )}
    </div>
  );
}

export function AssetPopupContent({ properties, onNavigate }) {
  const p = properties || {};
  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--owned"><Wrench size={12} /> Asset</div>
      </div>
      <h3 className="v2-popup-title">{p.name || 'Asset'}</h3>
      <div className="v2-popup-grid">
        <div className="v2-popup-row"><Wrench size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Category</span><span className="v2-popup-value">{p.category}{p.subcategory ? ` / ${p.subcategory}` : ''}</span></div>
        {p.asset_number && <div className="v2-popup-row"><span className="v2-popup-row-icon" style={{ width: 14 }} /><span className="v2-popup-label">Asset #</span><span className="v2-popup-value">{p.asset_number}</span></div>}
        {p.location_label && <div className="v2-popup-row"><MapPin size={14} className="v2-popup-row-icon" /><span className="v2-popup-label">Location</span><span className="v2-popup-value">{p.location_label}</span></div>}
        <div className="v2-popup-row"><span className="v2-popup-row-icon" style={{ width: 14 }} /><span className="v2-popup-label">Status</span><span className={`v2-popup-value ${p.status === 'active' ? 'v2-popup-value--accent' : ''}`}>{p.status}</span></div>
      </div>
      {onNavigate && (
        <div className="v2-popup-footer">
          <button className="v2-popup-btn v2-popup-btn--accent" onClick={onNavigate}><ExternalLink size={14} /> View Asset</button>
        </div>
      )}
    </div>
  );
}


/**
 * A map feature (POI).
 *
 * The type chip is ONE style for every type — same background, same text
 * colour, same font — with the type's own glyph beside it. It used to take the
 * type's colour as its background, which made the label's legibility depend on
 * whichever colour someone picked, and told you nothing the pin on the map had
 * not already said.
 *
 * The glyph keeps the type colour, so the chip still ties back to the marker
 * you just clicked. That is the half of the colour worth keeping.
 *
 * `typeBySlug` is the company vocabulary. Without it a custom type has no row
 * to look up and the chip falls back to the raw slug rather than to the old
 * "Point of Interest", which said the same thing for every POI on the map.
 */
export function MapFeaturePopupContent({ properties, typeBySlug = {}, onEdit }) {
  const p = properties || {};
  // The popup reads properties off a rendered Mapbox feature, where nested
  // objects arrive JSON-encoded. `style` is the only nested one here.
  let style = p.style;
  if (typeof style === 'string') {
    try { style = JSON.parse(style); } catch { style = null; }
  }
  const look = resolveAppearance(p.feature_type, style, typeBySlug);

  return (
    <div className="v2-popup">
      <div className="v2-popup-header">
        <div className="v2-popup-badge v2-popup-badge--feature">
          <PoiGlyph icon={look.icon} colour={look.colour} size={13} strokeWidth={2.4} />
          {look.label}
        </div>
      </div>
      <h3 className="v2-popup-title">{p.name || 'Unnamed'}</h3>
      {p.description && (
        <div className="v2-popup-grid">
          <div className="v2-popup-row">
            <span className="v2-popup-value">{p.description}</span>
          </div>
        </div>
      )}
      {onEdit && p.id && (
        <div className="v2-popup-footer">
          <button className="v2-popup-btn v2-popup-btn--accent" onClick={() => onEdit(p)}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
