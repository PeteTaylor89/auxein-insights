// maps-v2/components/builder/BuilderBetaModal.jsx — Beta notice shown every
// time the user enters builder mode.
import { FlaskConical, X } from 'lucide-react';
import './BuilderBetaModal.css';

export default function BuilderBetaModal({ open, onClose }) {
  if (!open) return null;

  const handleDismiss = () => {
    onClose?.();
  };

  return (
    <div className="v2-beta-backdrop" onClick={handleDismiss}>
      <div className="v2-beta-modal" onClick={(e) => e.stopPropagation()}>
        <button className="v2-beta-close" onClick={handleDismiss} aria-label="Close">
          <X size={16} />
        </button>
        <div className="v2-beta-header">
          <div className="v2-beta-icon">
            <FlaskConical size={20} />
          </div>
          <div>
            <h3 className="v2-beta-title">Map Builder is in beta</h3>
            <p className="v2-beta-sub">An early preview — feedback welcome.</p>
          </div>
        </div>

        <p className="v2-beta-body">
          Layer GIS, parcels, regions and topography over your map. Your layer
          configuration is saved between sessions.
        </p>

        <div className="v2-beta-list-label">Coming soon</div>
        <ul className="v2-beta-list">
          <li>NDVI imagery and satellite indices</li>
          <li>S-Map soils and geology</li>
          <li>Flow paths and biodiversity zones</li>
          <li>Importing your own data (CSV, GeoJSON, KML)</li>
        </ul>

        <div className="v2-beta-actions">
          <button className="v2-beta-btn" onClick={handleDismiss}>Got it</button>
        </div>
      </div>
    </div>
  );
}
